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
  const requestSeqRef = useRef(0);
  const volumeRef = useRef(initialPlayback.volume);
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
    const playing = () => setPlayback((state) => ({ ...state, isPlaying: true }));
    const paused = () => setPlayback((state) => ({ ...state, isPlaying: false }));
    const failed = () => {
      // 主动清空 src 时浏览器可能触发一次空资源事件；没有 currentSrc 就不是实际播放失败，
      // 不应覆盖用户下一次点歌正在展示的状态。
      if (!audio.currentSrc) return;
      setError("当前歌曲无法播放，可能需要会员权限或播放源暂不可用。");
      setPlayback((state) => ({ ...state, isPlaying: false }));
    };

    audio.addEventListener("timeupdate", tick);
    audio.addEventListener("loadedmetadata", tick);
    audio.addEventListener("ended", ended);
    audio.addEventListener("playing", playing);
    audio.addEventListener("pause", paused);
    audio.addEventListener("error", failed);
    return () => {
      // 卸载时递增序号，使仍在等待网易云接口的异步任务全部失效，防止它们回写已卸载组件。
      requestSeqRef.current += 1;
      audio.pause();
      audio.removeEventListener("timeupdate", tick);
      audio.removeEventListener("loadedmetadata", tick);
      audio.removeEventListener("ended", ended);
      audio.removeEventListener("playing", playing);
      audio.removeEventListener("pause", paused);
      audio.removeEventListener("error", failed);
      // 彻底释放媒体资源与 DOM 引用，避免组件卸载后浏览器仍保留旧音频连接。
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
    };
  }, []);

  const playTrack = useCallback(
    async (track: MusicTrack, queue: MusicTrack[]) => {
      const audio = audioRef.current;
      if (!audio) return;
      const requestSeq = ++requestSeqRef.current;

      // 新的点歌操作必须立即停止旧声音，而不是等新地址返回后再替换 src；否则网络稍慢时，
      // 页面已经显示新歌但耳朵里仍在播放上一首，播放器状态也会与真实音频脱节。
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
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

      // 播放地址是必需数据，歌词只是增强体验。两个请求仍并行发起，但歌词失败不再阻断播放。
      const [urlResult, lyricResult] = await Promise.allSettled([
        getSongUrl(track.id, cookie),
        getLyric(track.id, cookie),
      ]);
      if (requestSeq !== requestSeqRef.current) return;

      if (urlResult.status === "rejected") {
        setError("播放地址请求失败，请确认本地网易云 API 正常运行。");
        return;
      }
      const url = urlResult.value;
      const lyric = lyricResult.status === "fulfilled" ? lyricResult.value : [];
      if (!url) {
        setError("没有拿到可播放地址，请确认本地网易云 API 已启动并登录。");
        return;
      }

      audio.src = url;
      audio.currentTime = 0;
      audio.volume = volumeRef.current;
      try {
        await audio.play();
        // play() 也可能在用户已经点了下一首后才完成。音频元素由所有请求共享，旧请求此时
        // 只能静默失效；若再调用 pause()，反而可能把已经开始播放的新歌曲一并暂停。
        if (requestSeq !== requestSeqRef.current) {
          return;
        }
        setPlayback((state) => ({ ...state, currentTrack: { ...track, url }, lyric, isPlaying: true }));
      } catch {
        if (requestSeq !== requestSeqRef.current) return;
        setError("浏览器未能开始播放，请重试或检查当前歌曲的播放权限。");
        setPlayback((state) => ({ ...state, isPlaying: false, lyric }));
      }
    },
    [cookie],
  );

  const playByOffset = useCallback(
    (offset: number) => {
      if (!playback.currentTrack || !playback.queue.length) return;
      const index = playback.queue.findIndex((track) => track.id === playback.currentTrack?.id);
      // 切换歌单后，正在播放的旧歌曲可能不在新队列中。此时“下一首”从队首开始，
      // “上一首”从队尾开始，避免 index=-1 导致上一首错误落到倒数第二项。
      const nextIndex = index >= 0
        ? (index + offset + playback.queue.length) % playback.queue.length
        : offset > 0
          ? 0
          : playback.queue.length - 1;
      const next = playback.queue[nextIndex];
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
      } else {
        try {
          await audio.play();
        } catch {
          setError("当前歌曲暂时无法继续播放，请重新选择歌曲。");
          setPlayback((state) => ({ ...state, isPlaying: false }));
        }
      }
    },
    seek: (progress: number) => {
      const safeProgress = Math.max(0, progress);
      if (audioRef.current) audioRef.current.currentTime = safeProgress;
      setPlayback((state) => ({ ...state, progress: safeProgress }));
    },
    setVolume: (volume: number) => {
      const safeVolume = Math.max(0, Math.min(1, volume));
      volumeRef.current = safeVolume;
      if (audioRef.current) audioRef.current.volume = safeVolume;
      setPlayback((state) => ({ ...state, volume: safeVolume }));
    },
  };
}
