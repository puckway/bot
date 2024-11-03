// This exists so we can pretend it's a different time during development
export const getNow = () => new Date();

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const toHMS = (sec: number) => {
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec - hours * 3600) / 60);
  const seconds = sec - hours * 3600 - minutes * 60;

  return (
    [
      hours === 0 ? "" : `${hours < 10 ? "0" : ""}${hours}`,
      `${minutes < 10 ? "0" : ""}${minutes}`,
      `${seconds < 10 ? "0" : ""}${seconds}`,
    ]
      // Remove negatives
      .map((s) => s.replaceAll(/-/g, ""))
      .filter(Boolean)
      .join(":")
  );
};

export const getOffset = (timeZone = "UTC", date = getNow()): string => {
  const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzDate = new Date(date.toLocaleString("en-US", { timeZone }));
  const minutes = (tzDate.getTime() - utcDate.getTime()) / 6e4;
  const offset = toHMS(minutes * 60).replace(/:00$/, "");
  return `${minutes < 0 ? "-" : "+"}${offset}`;
};
