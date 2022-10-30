export const idFromLink = (url: string) =>
  url?.replace(/\/$/gm, "").split("/").slice(-1)[0];

export const urlWithProxy = (url: string) =>
  `https://corsproxy.io/?${encodeURIComponent(url)}`;

export const hlsPlayer = (m3u8URL: string) =>
  `https://hls-video-player.glitch.me/?url=${encodeURIComponent(m3u8URL)}`;
