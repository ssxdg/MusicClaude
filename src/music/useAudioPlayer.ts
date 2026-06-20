import { useCallback, useEffect, useRef, useState } from "react";
import { getLyric, getSongUrl } from "./api";
import type { MusicTrack, PlaybackState } from "./types";

const initialPlayback: PlaybackState = {
  currentTrack: null,
  queue: [],
  isPlaying: false,
  progress: 0,
  duration: 0,
  volume: 0.82,
  lyric: [],
};

export function useAudioPlayer(cookie: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>(initialPlayback);
  const [error, setError] = useState("");

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.volume = initialPlayback.volume;
    audioRef.current = audio;

    const tick = () =>
      setPlayback((state) => ({
        ...state,
        progress: audio.currentTime,
        duration: Number.isFinite(audio.duration) ? audio.duration : state.duration,
      }));
    const ended = () => window.dispatchEvent(new CustomEvent("music-cloud-next"));
    const failed = () => setError("当前歌曲无法播放，可能需要会员权限或播放源暂不可用。");

    audio.addEventListener("timeupdate", tick);
    audio.addEventListener("loadedmetadata", tick);
    audio.addEventListener("ended", ended);
    audio.addEventListener("error", failed);
    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", tick);
      audio.removeEventListener("loadedmetadata", tick);
      audio.removeEventListener("ended", ended);
      audio.removeEventListener("error", failed);
    };
  }, []);

  const playTrack = useCallback(
    async (track: MusicTrack, queue: MusicTrack[]) => {
      const audio = audioRef.current;
      if (!audio) return;
      setError("");
      setPlayback((state) => ({
        ...state,
        currentTrack: track,
        queue,
        isPlaying: false,
        progress: 0,
        duration: track.duration / 1000,
        lyric: [],
      }));
      const [url, lyric] = await Promise.all([getSongUrl(track.id, cookie), getLyric(track.id, cookie)]);
      if (!url) {
        setError("没有拿到可播放地址，请确认本地网易云 API 已启动并登录。");
        return;
      }
      audio.src = url;
      audio.currentTime = 0;
      audio.volume = playback.volume;
      await audio.play();
      setPlayback((state) => ({ ...state, currentTrack: { ...track, url }, lyric, isPlaying: true }));
    },
    [cookie, playback.volume],
  );

  const playByOffset = useCallback(
    (offset: number) => {
      if (!playback.currentTrack || !playback.queue.length) return;
      const index = playback.queue.findIndex((track) => track.id === playback.currentTrack?.id);
      const next = playback.queue[(index + offset + playback.queue.length) % playback.queue.length];
      void playTrack(next, playback.queue);
    },
    [playTrack, playback.currentTrack, playback.queue],
  );

  useEffect(() => {
    const next = () => playByOffset(1);
    window.addEventListener("music-cloud-next", next);
    return () => window.removeEventListener("music-cloud-next", next);
  }, [playByOffset]);

  return {
    playback,
    error,
    playTrack,
    setQueue: (queue: MusicTrack[]) => setPlayback((state) => ({ ...state, queue })),
    previous: () => playByOffset(-1),
    next: () => playByOffset(1),
    toggle: async () => {
      const audio = audioRef.current;
      if (!audio || !playback.currentTrack) return;
      if (playback.isPlaying) {
        audio.pause();
        setPlayback((state) => ({ ...state, isPlaying: false }));
      } else {
        await audio.play();
        setPlayback((state) => ({ ...state, isPlaying: true }));
      }
    },
    seek: (progress: number) => {
      if (audioRef.current) audioRef.current.currentTime = progress;
      setPlayback((state) => ({ ...state, progress }));
    },
    setVolume: (volume: number) => {
      if (audioRef.current) audioRef.current.volume = volume;
      setPlayback((state) => ({ ...state, volume }));
    },
  };
}
