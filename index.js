import { execFile } from "child_process";
import ffprobe from "@ffprobe-installer/ffprobe";
const ffprobePath = ffprobe.path;

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

const duration = Math.floor(
  Number(/duration=.+/gm.exec(stdout)[0].replace("duration=", ""))
);
