import axios from "axios";
import path from "path";
import fs from "fs";
import { parse } from "node-html-parser";
import { parallel } from "radash";
import { DB_URL, SOURCE_URL } from "./shared/constants.js";
import { hlsPlayer, idFromLink, urlWithProxy } from "./utils/link.js";
import ffmpegPath from "ffmpeg-static";
import { execFile } from "child_process";
import dotenv from "dotenv";
import puppeteer from "puppeteer";
import axiosRetry from "axios-retry";

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

console.log("Getting pagination...");

const paginationSource = (await axios.get(`${SOURCE_URL}/vn/`)).data;

const dom = parse(paginationSource);

const lastPage = Number(
  dom
    .querySelectorAll(".pagination ul li")
    .slice(-1)[0]
    .querySelector("a")
    ?.getAttribute("href")
    ?.replace(/\/$/gm, "")
    .split("/")
    .slice(-1)[0]
);

if (lastPage <= 1) {
  console.log("Get pagination info failed");
  process.exit(1);
}

let ids: string[] = [];

console.log("Fetching pages...");

await parallel(
  20,
  new Array(lastPage).fill("").map((_, index) => index + 1),
  async (i) => {
    const source = (await axios.get(`https://phimsexvietnam.me/vn/page/${i}/`))
      .data;

    const dom = parse(source);

    ids.push(
      ...dom
        .querySelectorAll(".videos-list a")
        .map((a) => a.getAttribute("href")!)
        .filter(Boolean)
        .map(idFromLink)
    );
  }
);

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
  const embedSource = (await axios.get(urlWithProxy(iframeSrc))).data;

  const embedDom = parse(embedSource);

  m3u8URL = embedDom.querySelector("video source")?.getAttribute("src")!;

  if (!m3u8URL) {
    retryCount++;

    if (retryCount > 10) {
      console.log("No HLS source");
      process.exit(1);
    }
  }
}

uploadedVideos.push(id);

await axios.post(DB_URL, uploadedVideos.join(","));

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

console.log("Trimming video...");

await new Promise((res, rej) => {
  execFile(
    ffmpegPath!,
    [
      "-ss",
      "00:00:03",
      "-to",
      "00:00:23",
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

console.log("Shortening link...");
const shortenedLink = (
  await axios.get(
    `https://link1s.com/api?api=${
      process.env.LINK_1S_API_KEY
    }&url=${encodeURIComponent(hlsPlayer(m3u8URL))}`
  )
).data.shortenedUrl as string;

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

await page.goto("https://youtubecliphot.net/upload-video");

const uploadBtn = ".upload.upload-video";

await page.waitForSelector(uploadBtn);

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
  timeout: 60000,
});

await page.type("#title", `${title} - Link Full 👇`, { delay: 100 });

await page.type(
  "div[contenteditable=true]",
  shortenedLink.replace("https://link1s.com/", "l i nk1 s. com / "),
  { delay: 100 }
);

await page.type(".ui-widget-content.ui-autocomplete-input", "gai-xinh\n", {
  delay: 100,
});

await new Promise((res) => setTimeout(res, 2000));

await page.click("#submit-btn");

await new Promise((res) => setTimeout(res, 5000));

await browser.close();
