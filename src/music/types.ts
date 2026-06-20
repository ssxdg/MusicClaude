export type LoginStatus = "idle" | "waiting" | "scanned" | "authorized" | "expired" | "error";

export interface QrSession {
  key: string;
  qrImg: string;
}

export interface UserProfile {
  userId: number;
  nickname: string;
  avatarUrl: string;
}

export interface PlaylistSummary {
  id: number;
  name: string;
  coverImgUrl: string;
  trackCount: number;
}

export interface MusicArtist {
  id: number;
  name: string;
  position: [number, number, number];
  trackIds: number[];
}

export interface MusicTrack {
  id: number;
  name: string;
  artistId: number;
  artistName: string;
  albumName: string;
  albumCover: string;
  duration: number;
  position: [number, number, number];
  url?: string;
}

export interface MusicGalaxyData {
  artists: MusicArtist[];
  tracks: MusicTrack[];
}

export interface LyricLine {
  time: number;
  text: string;
}

export interface PlaybackState {
  currentTrack: MusicTrack | null;
  queue: MusicTrack[];
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  lyric: LyricLine[];
}
