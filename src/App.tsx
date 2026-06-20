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
import { musicTrackOrbitPosition } from "./music/orbitLayout";
import type { MusicArtist, MusicGalaxyData, MusicTrack } from "./music/types";

const emptyGalaxy: MusicGalaxyData = { artists: [], tracks: [] };
const DPR_MAX = WEAK ? 1.5 : 2;

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
    kind: "artist" | "track";
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

  const lockMusicTarget = (kind: "artist" | "track", id: number, target: [number, number, number]) => {
    lockSeq.current += 1;
    setMusicLockTarget({ key: `${kind}:${id}:${lockSeq.current}`, kind, target });
  };

  const trackOrbitPosition = (track: MusicTrack) => {
    const artist = galaxy.artists.find((item) => item.id === track.artistId);
    if (!artist) return track.position;
    return musicTrackOrbitPosition(artist, track, galaxy.tracks.filter((item) => item.artistId === artist.id));
  };

  const selectTrack = (track: MusicTrack | null) => {
    setSelectedTrack(track);
    setSelectedArtist(track ? galaxy.artists.find((artist) => artist.id === track.artistId) ?? null : null);
    if (track) lockMusicTarget("track", track.id, trackOrbitPosition(track));
    else setMusicLockTarget(null);
  };

  const selectArtist = (artist: MusicArtist | null) => {
    setSelectedArtist(artist);
    setSelectedTrack(null);
    if (artist) lockMusicTarget("artist", artist.id, artist.position);
    else setMusicLockTarget(null);
  };

  const playFromCanvas = (track: MusicTrack) => {
    selectTrack(track);
    (window as unknown as { musicCloudPlayTrack?: (track: MusicTrack) => void }).musicCloudPlayTrack?.(track);
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
