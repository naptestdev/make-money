import { prisma } from "./db/client.js";
import puppeteer from "puppeteer";
import dotenv from "dotenv";
import { replaceLink } from "./utils/link.js";
import { wait } from "./utils/time.js";

dotenv.config();

console.log("Fetching videos list...");

const videos = await prisma.video.findMany({
  orderBy: {
    createdAt: "desc",
  },
  take: 40,
});

console.log("Opening browser...");

const browser = await puppeteer.launch({
  headless: process.env.HEADLESS !== "false",
});

for (const [index, video] of videos.entries()) {
  const page = await browser.newPage();

  await page.setCookie({
    name: "user_id",
    value: process.env.USER_ID_COOKIE!,
    domain: "youtubecliphot.net",
    path: "/",
  });

  await page.goto(video.editURL, { waitUntil: "networkidle0" });

  await page.waitForSelector("div[contenteditable=true]", { timeout: 30000 });

  await page.evaluate(
    // @ts-ignore
    () => (document.querySelector("div[contenteditable=true]").innerText = "")
  );

  const replacedLink = replaceLink(video.shortenedURL);

  await page.type("div[contenteditable=true]", replacedLink, {
    delay: 100,
  });

  await wait(2000);

  let interval = setInterval(() => {
    page.click("#submit-btn");
  }, 1000);

  await page.waitForSelector("#submit-btn[disabled]", { timeout: 60000 });

  clearInterval(interval);

  await wait(2000);

  await page.close();

  console.log(`Done page ${index + 1}`);
}

await browser.close();
