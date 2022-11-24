import axios from "axios";
import path from "path";
import fs from "fs";
import { parse } from "node-html-parser";
import { DB_URL, SOURCE_URL } from "./shared/constants.js";
import { idFromLink, urlWithProxy, videoPlayer } from "./utils/link.js";
import ffmpegPath from "ffmpeg-static";
import { execFile, exec } from "child_process";
import dotenv from "dotenv";
import puppeteer from "puppeteer";
import axiosRetry from "axios-retry";
import { wait } from "./utils/time.js";

// @ts-ignore
import ffprobe from "@ffprobe-installer/ffprobe";
const ffprobePath = ffprobe.path;

dotenv.config();

axiosRetry(axios, { retries: 5 });

fs.rmSync(path.resolve(process.cwd(), "output.mp4"), {
  recursive: true,
  force: true,
});
fs.rmSync(path.resolve(process.cwd(), "trim.mp4"), {
  recursive: true,
  force: true,
});

console.log("Fetching video list...");

let ids: string[] = [];

let sitemapPage = 1;

while (true) {
  try {
    const source = (
      await axios.get(
        `${SOURCE_URL}/wp-sitemap-posts-post-${sitemapPage++}.xml`
      )
    ).data;

    const dom = parse(source);

    ids.push(
      ...dom
        .querySelectorAll("loc")
        .map((item) => item.innerText)

        .filter(Boolean)
        .map(idFromLink)
    );
  } catch (error) {
    break;
  }
}

let uploadedVideos: string[] = [];
try {
  uploadedVideos = (await axios.get(DB_URL)).data
    .split(",")
    .filter((item: string) => ids.includes(item));
} catch (error) {}

if (uploadedVideos.length >= ids.length) {
  console.log("Already upload all Videos");
  process.exit(1);
}

console.log("Validating video to download...");

const id = ids
  .sort(() => Math.random() - 0.5)
  .find((item) => !uploadedVideos.includes(item)) as string;

const pageSource = (await axios.get(`${SOURCE_URL}/${id}/`)).data;

const pageDom = parse(pageSource);

const title = pageDom.querySelector(".entry-title")?.textContent!;

const iframeSrc = pageDom.querySelector("iframe")?.getAttribute("src");

if (
  !iframeSrc?.includes(
    `/wp-content/plugins/clean-tube-player/public/player-x.php`
  )
) {
  process.exit(1);
}

let retryCount = 0;
let m3u8URL: string | null = null;

while (!m3u8URL) {
  try {
    const embedSource = (
      await axios.get(
        retryCount % 2 === 0 ? urlWithProxy(iframeSrc) : iframeSrc
      )
    ).data;

    const embedDom = parse(embedSource);

    m3u8URL = embedDom.querySelector("video source")?.getAttribute("src")!;

    if (!m3u8URL) {
      throw new Error("");
    }
  } catch {
    retryCount++;

    if (retryCount > 30) {
      console.log("No HLS source");
      process.exit(1);
    }
  }
}

uploadedVideos.push(id);

console.log("Downloading...");
await new Promise((res, rej) => {
  execFile(
    ffmpegPath!,
    ["-i", m3u8URL!, "-c", "copy", "-bsf:a", "aac_adtstoasc", "output.mp4"],
    { cwd: process.cwd() },
    (error) => {
      if (error) rej(error);
      else res(undefined);
    }
  );
});

const stdout = await new Promise((res) => {
  execFile(
    ffprobePath,
    ["-i", "output.mp4", "-show_format"],
    { cwd: process.cwd() },
    (_, stdout) => {
      res(stdout);
    }
  );
});

await axios.post(DB_URL, uploadedVideos.join(","));

const duration = Math.floor(
  Number(/duration=.+/gm.exec(stdout as string)![0].replace("duration=", ""))
);

let start = 0;
let end = 20;

if (duration > 22) {
  start = Math.round(duration / 2 - 10);
  end = Math.round(duration / 2 + 10);
}

console.log("Trimming video...");

await new Promise((res, rej) => {
  execFile(
    ffmpegPath!,
    [
      "-ss",
      String(start),
      "-to",
      String(end),
      "-i",
      "output.mp4",
      "-c",
      "copy",
      "trim.mp4",
    ],
    { cwd: process.cwd() },
    (error) => {
      if (error) rej(error);
      else res(undefined);
    }
  );
});

console.log("Uploading video to abyss...");
const slug = await new Promise((res, rej) => {
  exec(
    `curl -F "file=@output.mp4" up.hydrax.net/${process.env.ABYSS_API_KEY}`,
    (err, stdout) => {
      if (err) rej(err);
      else res(JSON.parse(stdout)["slug"]);
    }
  );
});

console.log("Shortening link...");
const shortenedLink = (
  await axios.get(
    `https://link1s.com/api?api=${
      process.env.LINK_1S_API_KEY
    }&url=${encodeURIComponent(videoPlayer(slug as string))}`
  )
).data.shortenedUrl as string;

console.log(`Shortened link: ${shortenedLink}`);

console.log("Opening browser...");

const browser = await puppeteer.launch({
  headless: process.env.HEADLESS !== "false",
});
const page = await browser.newPage();

await page.setCookie({
  name: "user_id",
  value: process.env.USER_ID_COOKIE!,
  domain: "youtubecliphot.net",
  path: "/",
});

await page.goto("https://youtubecliphot.net/upload-video", {
  waitUntil: "domcontentloaded",
});

const uploadBtn = ".upload.upload-video";

await page.waitForSelector(uploadBtn, { timeout: 300000 });

await page.bringToFront();

let interval = setInterval(() => {
  page.click(uploadBtn);
}, 1000);

const [fileChooser] = await Promise.all([
  page.waitForFileChooser(),
  page.click(uploadBtn),
]);

clearInterval(interval);

await fileChooser.accept([path.resolve(process.cwd(), "trim.mp4")]);

await page.waitForSelector(".upload-ffmpeg-mode:not(.hidden)", {
  timeout: 300000,
});

await wait(1000);

// @ts-ignore
await page.evaluate(() => (document.querySelector("#title").value = ""));

await page.type("#title", `${title} - Link Full 👇`, { delay: 100 });

await page.evaluate(
  // @ts-ignore
  () => (document.querySelector("div[contenteditable=true]").innerText = "")
);

await page.type(
  "div[contenteditable=true]",
  shortenedLink.replace("https://link1s.com/", "l i nk1 s. com / "),
  {
    delay: 100,
  }
);

await page.type(".ui-widget-content.ui-autocomplete-input", "gai-xinh\n", {
  delay: 100,
});

await wait(2000);

await page.click("#submit-btn");

await wait(10000);

await browser.close();

console.log("Done");
