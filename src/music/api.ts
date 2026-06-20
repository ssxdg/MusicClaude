import { buildMusicGalaxy } from "./galaxy";
import { parseLyric } from "./lyrics";
import type { LoginStatus, MusicGalaxyData, MusicTrack, PlaylistSummary, QrSession, UserProfile } from "./types";

const API_BASE = import.meta.env.VITE_NETEASE_API_BASE || "/api";

type Query = Record<string, string | number | boolean | undefined>;

async function request<T>(path: string, query: Query = {}, cookie = ""): Promise<T> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  if (cookie) url.searchParams.set("cookie", cookie);
  url.searchParams.set("timestamp", String(Date.now()));

  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Netease API ${path} failed with ${res.status}`);
  return res.json() as Promise<T>;
}

function firstArtist(song: any) {
  return song.ar?.[0] || song.artists?.[0] || { id: 0, name: "未知歌手" };
}

function normalizeTrack(song: any, forcedArtist?: { id: number; name: string }): MusicTrack {
  const artist = forcedArtist || firstArtist(song);
  return {
    id: Number(song.id),
    name: song.name || "未命名歌曲",
    artistId: Number(artist.id || 0),
    artistName: artist.name || "未知歌手",
    albumName: song.al?.name || song.album?.name || "未知专辑",
    albumCover: song.al?.picUrl || song.album?.picUrl || "",
    duration: Number(song.dt || song.duration || 0),
    position: [0, 0, 0],
  };
}

export async function createQrSession(): Promise<QrSession> {
  const key = await request<{ data: { unikey: string } }>("/login/qr/key");
  const qr = await request<{ data: { qrimg: string } }>("/login/qr/create", { key: key.data.unikey, qrimg: true });
  return { key: key.data.unikey, qrImg: qr.data.qrimg };
}

export async function checkQrSession(key: string) {
  const res = await request<{ code: number; cookie?: string; message?: string }>("/login/qr/check", { key });
  const statusByCode: Record<number, LoginStatus> = {
    800: "expired",
    801: "waiting",
    802: "scanned",
    803: "authorized",
  };
  return { status: statusByCode[res.code] || "error", cookie: res.cookie || "", message: res.message };
}

export async function getAccount(cookie: string): Promise<UserProfile | null> {
  const res = await request<{ profile?: any }>("/user/account", {}, cookie);
  if (!res.profile) return null;
  return {
    userId: Number(res.profile.userId),
    nickname: res.profile.nickname,
    avatarUrl: res.profile.avatarUrl,
  };
}

export async function getUserPlaylists(userId: number, cookie: string): Promise<PlaylistSummary[]> {
  const res = await request<{ playlist: any[] }>("/user/playlist", { uid: userId, limit: 60 }, cookie);
  return (res.playlist || []).map((item) => ({
    id: Number(item.id),
    name: item.name,
    coverImgUrl: item.coverImgUrl,
    trackCount: Number(item.trackCount || 0),
  }));
}

export async function getPlaylistGalaxy(id: number, cookie: string): Promise<MusicGalaxyData> {
  const detail = await request<{ playlist?: { trackIds?: { id: number }[]; tracks?: any[] } }>("/playlist/detail", { id }, cookie);
  const ids = (detail.playlist?.trackIds || []).map((track) => track.id).slice(0, 220);
  if (!ids.length) return buildMusicGalaxy((detail.playlist?.tracks || []).map((song) => normalizeTrack(song)));
  const songs = await request<{ songs: any[] }>("/song/detail", { ids: ids.join(",") }, cookie);
  return buildMusicGalaxy((songs.songs || []).map((song) => normalizeTrack(song)));
}

export async function getHotArtistGalaxy(artistLimit = 30, songsPerArtist = 10): Promise<MusicGalaxyData> {
  const top = await request<{ artists?: any[] }>("/top/artists", { limit: artistLimit });
  const artists = (top.artists || []).slice(0, artistLimit).map((artist) => ({
    id: Number(artist.id),
    name: artist.name || "未知歌手",
  }));

  const batches = await Promise.allSettled(
    artists.map(async (artist) => {
      const res = await request<{ songs?: any[] }>("/artist/top/song", { id: artist.id });
      return (res.songs || []).slice(0, songsPerArtist).map((song) => normalizeTrack(song, artist));
    }),
  );

  const tracks = batches
    .flatMap((batch) => (batch.status === "fulfilled" ? batch.value : []))
    .filter((track, index, all) => all.findIndex((item) => item.id === track.id) === index);

  return buildMusicGalaxy(tracks);
}

export async function getSongUrl(id: number, cookie: string) {
  const res = await request<{ data?: { url?: string }[] }>("/song/url", { id, br: 320000 }, cookie);
  return res.data?.[0]?.url || "";
}

export async function getLyric(id: number, cookie: string) {
  const res = await request<{ lrc?: { lyric?: string } }>("/lyric", { id }, cookie);
  return parseLyric(res.lrc?.lyric);
}

export async function searchSongs(keywords: string, cookie: string): Promise<MusicTrack[]> {
  const res = await request<{ result?: { songs?: any[] } }>("/search", { keywords, type: 1, limit: 24 }, cookie);
  return buildMusicGalaxy((res.result?.songs || []).map((song) => normalizeTrack(song))).tracks;
}
