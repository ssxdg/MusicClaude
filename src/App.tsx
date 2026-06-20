import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { Galaxy } from "./three/Galaxy";
import { FlyControls } from "./three/FlyControls";
import { WEAK } from "./three/detectQuality";
import { useStore } from "./state/store";
import { MusicCloudUI } from "./music/MusicCloudUI";
import { MusicStars } from "./music/MusicStars";
import { MusicInteraction } from "./music/MusicInteraction";
import { musicArtistPosition, musicTrackPosition } from "./music/galaxy";
import { musicTrackOrbitPosition } from "./music/orbitLayout";
import type { MusicArtist, MusicGalaxyData, MusicTrack } from "./music/types";

const emptyGalaxy: MusicGalaxyData = { artists: [], tracks: [] };
const DPR_MAX = WEAK ? 1.5 : 2;
export type MusicFocusMode = "lock" | "glide" | "none";

function hasArtistSystem(artist: MusicArtist | null | undefined) {
  return !!artist && artist.trackIds.length > 1;
}

export default function App() {
  const quality = useStore((s) => s.quality);
  const [galaxy, setGalaxy] = useState<MusicGalaxyData>(emptyGalaxy);
  const [selectedTrack, setSelectedTrack] = useState<MusicTrack | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<MusicArtist | null>(null);
  const [hoveredTrack, setHoveredTrack] = useState<MusicTrack | null>(null);
  const [hoveredArtist, setHoveredArtist] = useState<MusicArtist | null>(null);
  const lockSeq = useRef(0);
  const [musicLockTarget, setMusicLockTarget] = useState<{
    key: string;
    kind: "artist" | "track" | "overview";
    mode: "lock" | "glide";
    target: [number, number, number];
  } | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const debug = window as unknown as { musicCloudDebugSetGalaxy?: (next: MusicGalaxyData) => void };
    debug.musicCloudDebugSetGalaxy = setGalaxy;
    return () => {
      delete debug.musicCloudDebugSetGalaxy;
    };
  }, []);

  useEffect(() => {
    const cursor = hoveredArtist || hoveredTrack ? "pointer" : "";
    const canvas = document.querySelector<HTMLCanvasElement>(".music-cloud-app canvas");
    document.body.style.cursor = cursor;
    if (canvas) canvas.style.cursor = cursor;
    return () => {
      document.body.style.cursor = "";
      if (canvas) canvas.style.cursor = "";
    };
  }, [hoveredArtist, hoveredTrack]);

  const lockMusicTarget = (
    kind: "artist" | "track" | "overview",
    id: number | string,
    target: [number, number, number],
    mode: "lock" | "glide",
  ) => {
    lockSeq.current += 1;
    setMusicLockTarget({ key: `${kind}:${id}:${lockSeq.current}`, kind, mode, target });
  };

  const resetMusicView = () => {
    lockMusicTarget("overview", "galaxy", [0, 0, 0], "glide");
  };

  const trackOrbitPosition = (track: MusicTrack, artist?: MusicArtist | null, tracks = galaxy.tracks) => {
    const visibleArtist = artist ?? galaxy.artists.find((item) => item.id === track.artistId) ?? null;
    if (!visibleArtist || !hasArtistSystem(visibleArtist)) return track.position;
    return musicTrackOrbitPosition(visibleArtist, track, tracks.filter((item) => item.artistId === visibleArtist.id));
  };

  const ensureTrackInGalaxy = (track: MusicTrack) => {
    const existingTrack = galaxy.tracks.find((item) => item.id === track.id);
    if (existingTrack) {
      return {
        artist: galaxy.artists.find((item) => item.id === existingTrack.artistId) ?? null,
        track: existingTrack,
        tracks: galaxy.tracks,
      };
    }

    const existingArtist = galaxy.artists.find((item) => item.id === track.artistId);
    if (existingArtist) {
      const nextArtist: MusicArtist = { ...existingArtist, trackIds: [...existingArtist.trackIds, track.id] };
      const nextTrack: MusicTrack = {
        ...track,
        position: musicTrackPosition(nextArtist, track.id, existingArtist.trackIds.length, nextArtist.trackIds.length),
      };
      const nextTracks = [...galaxy.tracks, nextTrack];
      setGalaxy({
        artists: galaxy.artists.map((artist) => (artist.id === nextArtist.id ? nextArtist : artist)),
        tracks: nextTracks,
      });
      return { artist: nextArtist, track: nextTrack, tracks: nextTracks };
    }

    const nextArtist: MusicArtist = {
      id: track.artistId,
      name: track.artistName,
      position: musicArtistPosition(track.artistId, galaxy.artists.length),
      trackIds: [track.id],
    };
    const nextTrack: MusicTrack = { ...track, position: musicTrackPosition(nextArtist, track.id, 0, 1) };
    const nextTracks = [...galaxy.tracks, nextTrack];
    setGalaxy({ artists: [...galaxy.artists, nextArtist], tracks: nextTracks });
    return { artist: nextArtist, track: nextTrack, tracks: nextTracks };
  };

  const selectTrack = (track: MusicTrack | null, focusMode: MusicFocusMode = "glide") => {
    if (!track) {
      setSelectedTrack(null);
      setSelectedArtist(null);
      setMusicLockTarget(null);
      return;
    }

    const visible = ensureTrackInGalaxy(track);
    const visibleArtist = hasArtistSystem(visible.artist) ? visible.artist : null;
    setSelectedTrack(visible.track);
    setSelectedArtist(visibleArtist);
    if (focusMode !== "none") {
      lockMusicTarget(
        "track",
        visible.track.id,
        trackOrbitPosition(visible.track, visibleArtist, visible.tracks),
        focusMode,
      );
    }
  };

  const selectArtist = (artist: MusicArtist | null, focusMode: MusicFocusMode = "lock") => {
    if (artist && !hasArtistSystem(artist)) {
      const onlyTrack = galaxy.tracks.find((track) => track.artistId === artist.id) ?? null;
      selectTrack(onlyTrack, focusMode);
      return;
    }

    setSelectedArtist(artist);
    setSelectedTrack(null);
    if (artist && focusMode !== "none") lockMusicTarget("artist", artist.id, artist.position, focusMode);
    else setMusicLockTarget(null);
  };

  const playFromCanvas = (track: MusicTrack) => {
    selectTrack(track, "lock");
    (window as unknown as { musicCloudPlayTrack?: (track: MusicTrack, queue?: MusicTrack[], focusMode?: MusicFocusMode) => void })
      .musicCloudPlayTrack?.(track, galaxy.tracks, "none");
  };

  const selectArtistFromCanvas = (artist: MusicArtist) => {
    selectArtist(artist);
  };

  return (
    <div className={hoveredArtist || hoveredTrack ? "app music-cloud-app interactive" : "app music-cloud-app"}>
      <Canvas
        camera={{ position: [700, 4600, 4600], fov: 55, near: 0.1, far: 18000 }}
        dpr={[1, DPR_MAX]}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
      >
        <color attach="background" args={["#03040a"]} />
        <fog attach="fog" args={["#03040a", 2400, 13000]} />
        <Galaxy />
        <MusicStars
          artists={galaxy.artists}
          tracks={galaxy.tracks}
          selectedId={selectedTrack?.id ?? null}
          selectedArtistId={selectedArtist?.id ?? null}
          hoverTrackId={hoveredTrack?.id ?? null}
          hoverArtistId={hoveredArtist?.id ?? null}
        />
        <MusicInteraction
          artists={galaxy.artists}
          tracks={galaxy.tracks}
          selectedArtistId={selectedArtist?.id ?? null}
          onHoverArtist={setHoveredArtist}
          onHoverTrack={setHoveredTrack}
          onSelectArtist={selectArtistFromCanvas}
          onSelectTrack={playFromCanvas}
        />
        <FlyControls musicLockTarget={musicLockTarget} />
        {quality === "high" && (
          <EffectComposer>
            <Bloom intensity={1.4} luminanceThreshold={0.1} luminanceSmoothing={0.28} radius={0.85} mipmapBlur />
          </EffectComposer>
        )}
      </Canvas>

      <MusicCloudUI
        galaxy={galaxy}
        setGalaxy={setGalaxy}
        selectedTrack={selectedTrack}
        selectedArtist={selectedArtist}
        onSelectedTrack={selectTrack}
        onSelectedArtist={selectArtist}
        onResetView={resetMusicView}
      />

      {!galaxy.tracks.length && (
        <div className="music-empty">
          <strong>音乐星系待点亮</strong>
          <span>扫码登录网易云，选择一个歌单。歌手会成为主星，歌曲会围绕主星运行。</span>
        </div>
      )}
    </div>
  );
}
