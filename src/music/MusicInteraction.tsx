import * as THREE from "three";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useThree } from "@react-three/fiber";
import { spinXZ } from "../three/galaxyParams";
import type { MusicArtist, MusicTrack } from "./types";

interface MusicInteractionProps {
  artists: MusicArtist[];
  tracks: MusicTrack[];
  selectedArtistId: number | null;
  liveTrackPositions: MutableRefObject<Map<number, THREE.Vector3>>;
  onHoverArtist: (artist: MusicArtist | null) => void;
  onHoverTrack: (track: MusicTrack | null) => void;
  onSelectArtist: (artist: MusicArtist) => void;
  onSelectTrack: (track: MusicTrack) => void;
  onClearSelection: () => void;
}

type Hit = { kind: "artist"; artist: MusicArtist } | { kind: "track"; track: MusicTrack };

const projected = new THREE.Vector3();

function hasArtistSystem(artist: MusicArtist | null | undefined) {
  return !!artist && artist.trackIds.length > 1;
}

function screenPoint(pos: [number, number, number] | THREE.Vector3, camera: THREE.Camera, rect: DOMRect) {
  const x = pos instanceof THREE.Vector3 ? pos.x : pos[0];
  const y = pos instanceof THREE.Vector3 ? pos.y : pos[1];
  const z = pos instanceof THREE.Vector3 ? pos.z : pos[2];
  const [wx, wz] = spinXZ(x, z);
  projected.set(wx, y, wz).project(camera);
  if (projected.z < -1 || projected.z > 1) return null;
  return {
    x: (projected.x * 0.5 + 0.5) * rect.width,
    y: (-projected.y * 0.5 + 0.5) * rect.height,
  };
}

export function MusicInteraction({
  artists,
  tracks,
  selectedArtistId,
  liveTrackPositions,
  onHoverArtist,
  onHoverTrack,
  onSelectArtist,
  onSelectTrack,
  onClearSelection,
}: MusicInteractionProps) {
  const { camera, gl } = useThree();
  const artistsRef = useRef(artists);
  const tracksRef = useRef(tracks);
  const selectedArtistIdRef = useRef(selectedArtistId);
  const down = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const lastHover = useRef(0);
  const callbacksRef = useRef({ onHoverArtist, onHoverTrack, onSelectArtist, onSelectTrack, onClearSelection });

  artistsRef.current = artists;
  tracksRef.current = tracks;
  selectedArtistIdRef.current = selectedArtistId;
  // 全局指针监听只注册一次，通过 ref 读取最新回调，避免 App 每次渲染都拆装 window 事件。
  // 这样既保持回调数据新鲜，也减少高频悬停期间的监听器抖动。
  callbacksRef.current = { onHoverArtist, onHoverTrack, onSelectArtist, onSelectTrack, onClearSelection };

  const pick = useMemo(
    () => (clientX: number, clientY: number): Hit | null => {
      const rect = gl.domElement.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      let best: { d: number; hit: Hit } | null = null;
      const selectedArtist = artistsRef.current.find((artist) => artist.id === selectedArtistIdRef.current && hasArtistSystem(artist)) ?? null;

      for (const track of tracksRef.current) {
        // 优先读取渲染对象正在使用的实时位置，让拾取与星体阻尼动画逐帧同步；
        // 首帧 ref 尚未挂载时再退回数据坐标，保证初始化期间仍可交互。
        const position = liveTrackPositions.current.get(track.id) ?? track.position;
        const p = screenPoint(position, camera, rect);
        if (!p) continue;
        const d = Math.hypot(p.x - x, p.y - y);
        // 诗云的拾取范围与可见星体更接近；缩小过大的旧阈值，避免光标还离歌曲很远就被吸附。
        const threshold = selectedArtist && track.artistId === selectedArtist.id ? 38 : 28;
        if (d <= threshold && d < (best?.d ?? Infinity)) best = { d, hit: { kind: "track", track } };
      }

      for (const artist of artistsRef.current) {
        if (!hasArtistSystem(artist)) continue;
        const p = screenPoint(artist.position, camera, rect);
        if (!p) continue;
        const d = Math.hypot(p.x - x, p.y - y);
        if (d <= 46 && d < (best?.d ?? Infinity)) best = { d, hit: { kind: "artist", artist } };
      }

      return best?.hit ?? null;
    },
    [camera, gl.domElement],
  );

  useEffect(() => {
    const canvas = gl.domElement;

    const onDown = (event: PointerEvent) => {
      down.current = { x: event.clientX, y: event.clientY };
      dragging.current = false;
    };

    const onMove = (event: PointerEvent) => {
      const start = down.current;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) {
        dragging.current = true;
        canvas.style.cursor = "";
        callbacksRef.current.onHoverArtist(null);
        callbacksRef.current.onHoverTrack(null);
        return;
      }

      const now = performance.now();
      if (now - lastHover.current < 70) return;
      lastHover.current = now;
      const hit = pick(event.clientX, event.clientY);
      canvas.style.cursor = hit ? "pointer" : "";
      callbacksRef.current.onHoverArtist(hit?.kind === "artist" ? hit.artist : null);
      callbacksRef.current.onHoverTrack(hit?.kind === "track" ? hit.track : null);
    };

    const onUp = (event: PointerEvent) => {
      const start = down.current;
      down.current = null;
      if (!start || dragging.current || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
      const hit = pick(event.clientX, event.clientY);
      if (hit?.kind === "artist") callbacksRef.current.onSelectArtist(hit.artist);
      else if (hit?.kind === "track") callbacksRef.current.onSelectTrack(hit.track);
      else callbacksRef.current.onClearSelection();
    };

    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      canvas.style.cursor = "";
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [gl.domElement, pick]);

  return null;
}
