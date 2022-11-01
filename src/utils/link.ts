export const idFromLink = (url: string) =>
  url?.replace(/\/$/gm, "").split("/").slice(-1)[0];

export const urlWithProxy = (url: string) =>
  `https://corsproxy.io/?${encodeURIComponent(url)}`;

export const videoPlayer = (id: string) =>
  `https://abyss-video.glitch.me/?id=${encodeURIComponent(id)}`;
