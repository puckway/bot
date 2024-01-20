export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const toHMS = (sec: number) => {
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec - hours * 3600) / 60);
  const seconds = sec - hours * 3600 - minutes * 60;

  return [
    hours === 0 ? "" : `${hours < 10 ? "0" : ""}${hours}`,
    `${minutes < 10 ? "0" : ""}${minutes}`,
    `${seconds < 10 ? "0" : ""}${seconds}`,
  ]
    .filter(Boolean)
    .join(":");
};
