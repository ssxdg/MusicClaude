import type { LyricLine } from "./types";

const LRC_LINE = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?](.*)/;

export function parseLyric(raw?: string): LyricLine[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(LRC_LINE);
      if (!match) return null;
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const ms = Number((match[3] || "0").padEnd(3, "0"));
      const text = match[4].trim();
      return text ? { time: minutes * 60 + seconds + ms / 1000, text } : null;
    })
    .filter((line): line is LyricLine => Boolean(line));
}

export function activeLyricIndex(lines: LyricLine[], progress: number) {
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= progress) active = i;
    else break;
  }
  return active;
}
