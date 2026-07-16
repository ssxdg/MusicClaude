import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { activeLyricIndex } from "./lyrics";
import { checkQrSession, createQrSession, getAccount, getHotArtistGalaxy, getPlaylistGalaxy, getUserPlaylists, searchSongs } from "./api";
import { clearCookie, readCookie, writeCookie } from "./storage";
import { useAudioPlayer } from "./useAudioPlayer";
import type { MusicArtist, MusicGalaxyData, MusicTrack, PlaylistSummary, QrSession, UserProfile } from "./types";
import { useStore } from "../state/store";
import type { MusicFocusMode } from "../App";

type Tab = "login" | "playlist" | "search";
type GalaxySource = "public" | "playlist";

interface MusicCloudUIProps {
  galaxy: MusicGalaxyData;
  setGalaxy: (galaxy: MusicGalaxyData) => void;
  selectedTrack: MusicTrack | null;
  selectedArtist: MusicArtist | null;
  onSelectedTrack: (track: MusicTrack | null, focusMode?: MusicFocusMode) => void;
  onSelectedArtist: (artist: MusicArtist | null, focusMode?: MusicFocusMode) => void;
  onResetView: () => void;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "00:00";
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function MusicCloudUI({
  galaxy,
  setGalaxy,
  selectedTrack,
  selectedArtist,
  onSelectedTrack,
  onSelectedArtist,
  onResetView,
}: MusicCloudUIProps) {
  const [cookie, setCookie] = useState(readCookie);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [qr, setQr] = useState<QrSession | null>(null);
  const [tab, setTab] = useState<Tab>("login");
  const [collapsed, setCollapsed] = useState(false);
  const [loginText, setLoginText] = useState("扫码登录后加载你的网易云歌单");
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<number | null>(null);
  const [galaxySource, setGalaxySource] = useState<GalaxySource>("public");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<MusicTrack[]>([]);
  const [notice, setNotice] = useState("");
  const lyricLineRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const player = useAudioPlayer(cookie);
  const quality = useStore((state) => state.quality);
  const toggleQuality = useStore((state) => state.toggleQuality);
  const publicGalaxyStarted = useRef(false);
  const lastSyncedPlaybackTrackId = useRef<number | null>(null);
  const galaxyRequestSeq = useRef(0);
  const qrRequestSeq = useRef(0);
  const searchRequestSeq = useRef(0);

  const loadPublicGalaxy = async (collapse = true) => {
    const requestSeq = ++galaxyRequestSeq.current;
    publicGalaxyStarted.current = true;
    setLoading(true);
    setSelectedPlaylist(null);
    setNotice("");
    try {
      const next = await getHotArtistGalaxy(30, 10);
      // 用户可能在热门星河尚未返回时选择歌单；只允许最后一次加载操作更新场景，
      // 避免较慢的旧请求把刚刚选中的歌单覆盖回热门数据。
      if (requestSeq !== galaxyRequestSeq.current) return;
      setGalaxy(next);
      player.setQueue(next.tracks);
      onSelectedTrack(null);
      onSelectedArtist(null);
      onResetView();
      setGalaxySource("public");
      if (collapse) setCollapsed(true);
    } catch {
      if (requestSeq === galaxyRequestSeq.current) {
        setNotice("热门歌手星河加载失败：请确认网易云 API 服务正在 localhost:3000 运行。");
      }
    } finally {
      if (requestSeq === galaxyRequestSeq.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (publicGalaxyStarted.current || galaxy.tracks.length) return;
    void loadPublicGalaxy(true);
  }, []);

  useEffect(() => {
    if (!cookie) return;
    let cancelled = false;
    setLoading(true);
    getAccount(cookie)
      .then(async (account) => {
        if (cancelled) return;
        setProfile(account);
        setQr(null);
        if (account) {
          const nextPlaylists = await getUserPlaylists(account.userId, cookie);
          if (cancelled) return;
          setPlaylists(nextPlaylists);
          setTab("playlist");
          setLoginText("已登录");
        }
      })
      .catch(() => {
        if (!cancelled) setNotice("无法读取账号，请确认网易云 API 服务正在 localhost:3000 运行。");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      // Cookie 变化或组件卸载后，旧账号请求不得再覆盖新的登录状态。
      cancelled = true;
    };
  }, [cookie]);

  useEffect(() => {
    if (!qr || profile) return;
    let cancelled = false;
    let timer = 0;
    const poll = async () => {
      let keepPolling = true;
      try {
        const result = await checkQrSession(qr.key);
        if (cancelled) return;
        if (result.status === "waiting") setLoginText("等待手机扫码");
        if (result.status === "scanned") setLoginText("已扫码，请在手机上确认");
        if (result.status === "expired") {
          setLoginText("二维码已过期，请刷新");
          keepPolling = false;
        }
        if (result.status === "error") setLoginText("登录状态检查失败");
        if (result.status === "authorized" && result.cookie) {
          keepPolling = false;
          writeCookie(result.cookie);
          setCookie(result.cookie);
          setQr(null);
          setLoginText("登录成功，正在同步歌单");
        }
      } catch {
        if (!cancelled) setLoginText("登录状态检查失败");
      } finally {
        // 使用递归 timeout，确保上一次请求结束后才安排下一次轮询，避免网络变慢时并发堆积。
        if (!cancelled && keepPolling) timer = window.setTimeout(poll, 1800);
      }
    };
    timer = window.setTimeout(poll, 1800);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [profile, qr]);

  const artistTracks = useMemo(() => {
    if (!selectedArtist) return [];
    return galaxy.tracks.filter((track) => track.artistId === selectedArtist.id);
  }, [galaxy.tracks, selectedArtist]);

  const startQr = async () => {
    const requestSeq = ++qrRequestSeq.current;
    setLoginText("正在生成二维码");
    setNotice("");
    try {
      const nextQr = await createQrSession();
      // 用户连续刷新二维码时，仅接受最后一次请求，避免旧二维码覆盖当前轮询会话。
      if (requestSeq !== qrRequestSeq.current) return;
      setQr(nextQr);
      setLoginText("等待手机扫码");
    } catch {
      if (requestSeq !== qrRequestSeq.current) return;
      setLoginText("二维码生成失败");
      setNotice("无法连接网易云 API。请先运行 npm run netease:api，再刷新页面重试。");
    }
  };

  const logout = () => {
    qrRequestSeq.current += 1;
    searchRequestSeq.current += 1;
    clearCookie();
    setCookie("");
    setProfile(null);
    setQr(null);
    setPlaylists([]);
    setSelectedPlaylist(null);
    setGalaxy({ artists: [], tracks: [] });
    onSelectedTrack(null);
    onSelectedArtist(null);
    setTab("login");
    setNotice("");
    setLoginText("扫码登录后加载你的网易云歌单");
    void loadPublicGalaxy(true);
  };

  const loadPlaylist = async (playlist: PlaylistSummary) => {
    const requestSeq = ++galaxyRequestSeq.current;
    setLoading(true);
    setSelectedPlaylist(playlist.id);
    setNotice("");
    try {
      const next = await getPlaylistGalaxy(playlist.id, cookie);
      if (requestSeq !== galaxyRequestSeq.current) return;
      setGalaxy(next);
      player.setQueue(next.tracks);
      onSelectedTrack(null);
      onSelectedArtist(null);
      onResetView();
      setGalaxySource("playlist");
      setCollapsed(true);
    } catch {
      if (requestSeq === galaxyRequestSeq.current) setNotice("歌单加载失败，请稍后重试。");
    } finally {
      if (requestSeq === galaxyRequestSeq.current) setLoading(false);
    }
  };

  const runSearch = async (event: FormEvent) => {
    event.preventDefault();
    if (!search.trim()) return;
    const requestSeq = ++searchRequestSeq.current;
    const keyword = search.trim();
    setNotice("");
    try {
      const results = await searchSongs(keyword, cookie);
      // 快速连续搜索时，只展示最新关键词的结果，防止较慢的旧请求反向覆盖界面。
      if (requestSeq !== searchRequestSeq.current) return;
      setSearchResults(results);
    } catch {
      if (requestSeq !== searchRequestSeq.current) return;
      setNotice("搜索失败：请确认网易云 API 服务正在 localhost:3000 运行。");
    }
  };

  const playTrack = (track: MusicTrack, queue = galaxy.tracks, focusMode: MusicFocusMode = "glide") => {
    onSelectedTrack(track, focusMode);
    void player.playTrack(track, queue.length ? queue : [track]);
  };

  useEffect(() => {
    (window as unknown as { musicCloudPlayTrack?: (track: MusicTrack, queue?: MusicTrack[], focusMode?: MusicFocusMode) => void }).musicCloudPlayTrack = playTrack;
    return () => {
      delete (window as unknown as { musicCloudPlayTrack?: (track: MusicTrack, queue?: MusicTrack[], focusMode?: MusicFocusMode) => void }).musicCloudPlayTrack;
    };
  });

  useEffect(() => {
    const currentTrack = player.playback.currentTrack;
    if (!currentTrack) {
      lastSyncedPlaybackTrackId.current = null;
      return;
    }
    if (lastSyncedPlaybackTrackId.current === currentTrack.id) return;
    lastSyncedPlaybackTrackId.current = currentTrack.id;
    if (selectedTrack?.id !== currentTrack.id) onSelectedTrack(currentTrack, "glide");
  }, [onSelectedTrack, player.playback.currentTrack, selectedTrack?.id]);

  const activeLine = activeLyricIndex(player.playback.lyric, player.playback.progress);
  const panelTrack = selectedTrack;
  const nowTrack = player.playback.currentTrack ?? selectedTrack;
  const duration = player.playback.duration || (nowTrack?.duration || 0) / 1000 || 1;
  const tabTitle = profile ? profile.nickname : "扫码登录";

  const openNowTrackPanel = () => {
    if (!nowTrack) return;
    onSelectedTrack(nowTrack, "lock");
  };

  useEffect(() => {
    if (activeLine < 0) return;
    lyricLineRefs.current[activeLine]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeLine]);

  return (
    <>
      <div className="hud-top music-hud">
        <div className="title">
          音乐云 <span className="title-en">Music Cloud</span>
        </div>
        <div className="seg" title="音乐云模式">
          <button className={galaxySource === "playlist" ? "seg-btn on" : "seg-btn"} onClick={() => { setTab("playlist"); setCollapsed(false); }}>歌单星系</button>
          <button className={galaxySource === "public" ? "seg-btn on" : "seg-btn"} onClick={() => void loadPublicGalaxy(true)}>热门歌手</button>
          <button className="seg-btn" onClick={onResetView}>重置视角</button>
        </div>
        <button className="filter on" onClick={() => { setTab("playlist"); setCollapsed(false); }}>
          {galaxy.tracks.length ? `${galaxy.tracks.length} 首歌` : "加载星河"}
        </button>
        <button className="filter" onClick={() => { setTab("search"); setCollapsed(false); }}>搜索</button>
        <button className={quality === "high" ? "filter on" : "filter"} onClick={toggleQuality} title="切换星云画质">
          {quality === "high" ? "画质·高" : "画质·低"}
        </button>
        <div className="stat">{loading ? "同步中..." : `${galaxy.artists.length} 位歌手`}</div>
      </div>

      <div className={collapsed ? "search music-search collapsed" : "search music-search"}>
        <div className="search-tabs">
          <button className={tab === "login" ? "stab on" : "stab"} onClick={() => { setTab("login"); setCollapsed(false); }}>
            {tabTitle}
          </button>
          <button className={tab === "playlist" ? "stab on" : "stab"} onClick={() => { setTab("playlist"); setCollapsed(false); }}>
            歌单
          </button>
          <button className={tab === "search" ? "stab on" : "stab"} onClick={() => { setTab("search"); setCollapsed(false); }}>
            搜索
          </button>
          <button className="stab collapse" onClick={() => setCollapsed((value) => !value)}>
            {collapsed ? "展开" : "收起"}
          </button>
        </div>

        {!collapsed && tab === "login" && (
          <div className="line-results">
            <div className="lr-section">
              {profile ? (
                <div className="music-account-row">
                  <img src={profile.avatarUrl} alt="" />
                  <span>
                    <strong>{profile.nickname}</strong>
                    <small>已登录网易云音乐</small>
                  </span>
                  <button className="music-logout-btn" type="button" onClick={logout}>退出</button>
                </div>
              ) : (
                <div className="music-login-box">
                  {qr ? <img className="music-qr" src={qr.qrImg} alt="网易云扫码登录二维码" /> : null}
                  <button className="locate-btn real" type="button" onClick={startQr}>
                    {qr ? "刷新二维码" : "生成扫码登录"}
                  </button>
                  <div className="half-note">{loginText}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {!collapsed && tab === "playlist" && (
          <div className="search-results music-result-list">
            <button
              className={galaxySource === "public" ? "search-row on" : "search-row"}
              type="button"
              onClick={() => void loadPublicGalaxy(true)}
            >
              <span className="sr-name">热门歌手星河</span>
              <span className="sr-meta">无需歌单</span>
            </button>
            {playlists.map((playlist) => (
              <button
                key={playlist.id}
                className={selectedPlaylist === playlist.id ? "search-row on" : "search-row"}
                type="button"
                onClick={() => void loadPlaylist(playlist)}
              >
                <span className="sr-name">{playlist.name}</span>
                <span className="sr-meta">{playlist.trackCount} 首</span>
              </button>
            ))}
            {!playlists.length && <div className="half-note">登录后这里会出现你的网易云歌单。</div>}
          </div>
        )}

        {!collapsed && tab === "search" && (
          <>
            <form className="music-search-form" onSubmit={runSearch}>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索歌曲或歌手，回车查看结果" />
            </form>
            {searchResults.length > 0 && (
              <div className="search-results music-result-list">
                {searchResults.map((track) => (
                  <button key={track.id} className="search-row" type="button" onClick={() => playTrack(track, searchResults)}>
                    <span className="sr-name">{track.name}</span>
                    <span className="sr-meta">{track.artistName}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {(panelTrack || selectedArtist) && (
        <div className="poet-panel music-detail-panel">
          <button className="panel-close" onClick={() => { onSelectedTrack(null); onSelectedArtist(null); }} aria-label="关闭">×</button>
          {panelTrack ? (
            <>
              <div className="poet-head">
                <span className="poet-name">{panelTrack.name}</span>
                <span className="poet-sub">{panelTrack.artistName} · {panelTrack.albumName}</span>
              </div>
              <div className="music-cover-row">
                {panelTrack.albumCover ? <img src={panelTrack.albumCover} alt="" /> : <div />}
                <button className="locate-btn real" onClick={() => playTrack(panelTrack, player.playback.queue.length ? player.playback.queue : galaxy.tracks)}>
                  {player.playback.isPlaying ? "正在播放" : "播放这首"}
                </button>
              </div>
              <div className="music-lyrics">
                {player.playback.lyric.length ? (
                  player.playback.lyric.map((line, index) => (
                    <p
                      key={`${line.time}-${line.text}`}
                      ref={(node) => {
                        lyricLineRefs.current[index] = node;
                      }}
                      className={index === activeLine ? "active" : ""}
                    >
                      {line.text}
                    </p>
                  ))
                ) : (
                  <div className="half-note">播放后显示歌词；无歌词时保持为空状态。</div>
                )}
              </div>
            </>
          ) : selectedArtist ? (
            <>
              <div className="poet-head">
                <span className="poet-name">{selectedArtist.name}</span>
                <span className="poet-sub">{artistTracks.length} 首歌围绕这颗主星运行</span>
              </div>
              <div className="poem-list music-artist-tracks">
                {artistTracks.map((track) => (
                  <button key={track.id} className="search-row" type="button" onClick={() => playTrack(track, galaxy.tracks)}>
                    <span className="sr-name">{track.name}</span>
                    <span className="sr-meta">{track.albumName}</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      )}

      {notice && <div className="music-toast">{notice}</div>}

      <div className="hud-bottom music-player">
        <span className="hint music-now">
          <b>{nowTrack?.name ?? "未选择歌曲"}</b>
          <span>{player.error || nowTrack?.artistName || "点击歌曲行星开始播放"}</span>
        </span>
        <button className="music-lyrics-open" type="button" disabled={!nowTrack} onClick={openNowTrackPanel}>
          歌词
        </button>
        <span className="speed music-transport">
          <button onClick={player.previous}>上一首</button>
          <button onClick={player.toggle}>{player.playback.isPlaying ? "暂停" : "播放"}</button>
          <button onClick={player.next}>下一首</button>
          <span>{formatTime(player.playback.progress)}</span>
          <input
            type="range"
            min="0"
            max={duration}
            step="0.1"
            value={Math.min(player.playback.progress, duration)}
            onChange={(event) => player.seek(Number(event.target.value))}
            aria-label="播放进度"
          />
          <span>{nowTrack ? formatTime(duration) : "00:00"}</span>
          <input
            className="music-volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={player.playback.volume}
            onChange={(event) => player.setVolume(Number(event.target.value))}
            aria-label="音量"
          />
        </span>
      </div>
    </>
  );
}
