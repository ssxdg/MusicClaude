import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { spinXZ } from "../three/galaxyParams";
import { musicTrackOrbitPosition } from "./orbitLayout";
import type { MusicArtist, MusicTrack } from "./types";

interface MusicInteractionProps {
  artists: MusicArtist[];
  tracks: MusicTrack[];
  selectedArtistId: number | null;
  onHoverArtist: (artist: MusicArtist | null) => void;
  onHoverTrack: (track: MusicTrack | null) => void;
  onSelectArtist: (artist: MusicArtist) => void;
  onSelectTrack: (track: MusicTrack) => void;
}

type Hit = { kind: "artist"; artist: MusicArtist } | { kind: "track"; track: MusicTrack };

const projected = new THREE.Vector3();

function hasArtistSystem(artist: MusicArtist | null | undefined) {
  return !!artist && artist.trackIds.length > 1;
}

function screenPoint(pos: [number, number, number], camera: THREE.Camera, rect: DOMRect) {
  const [wx, wz] = spinXZ(pos[0], pos[2]);
  projected.set(wx, pos[1], wz).project(camera);
  if (projected.z > 1) return null;
  return {
    x: (projected.x * 0.5 + 0.5) * rect.width,
    y: (-projected.y * 0.5 + 0.5) * rect.height,
  };
}

export function MusicInteraction({
  artists,
  tracks,
  selectedArtistId,
  onHoverArtist,
  onHoverTrack,
  onSelectArtist,
  onSelectTrack,
}: MusicInteractionProps) {
  const { camera, gl } = useThree();
  const artistsRef = useRef(artists);
  const tracksRef = useRef(tracks);
  const selectedArtistIdRef = useRef(selectedArtistId);
  const down = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const lastHover = useRef(0);

  artistsRef.current = artists;
  tracksRef.current = tracks;
  selectedArtistIdRef.current = selectedArtistId;

  const pick = useMemo(
    () => (clientX: number, clientY: number): Hit | null => {
      const rect = gl.domElement.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      let best: { d: number; hit: Hit } | null = null;
      const selectedArtist = artistsRef.current.find((artist) => artist.id === selectedArtistIdRef.current && hasArtistSystem(artist)) ?? null;
      const selectedArtistTracks = selectedArtist
        ? tracksRef.current.filter((track) => track.artistId === selectedArtist.id)
        : [];

      for (const track of tracksRef.current) {
        const position =
          selectedArtist && track.artistId === selectedArtist.id
            ? musicTrackOrbitPosition(selectedArtist, track, selectedArtistTracks)
            : track.position;
        const p = screenPoint(position, camera, rect);
        if (!p) continue;
        const d = Math.hypot(p.x - x, p.y - y);
        if (d <= 72 && d < (best?.d ?? Infinity)) best = { d, hit: { kind: "track", track } };
      }

      for (const artist of artistsRef.current) {
        if (!hasArtistSystem(artist)) continue;
        const p = screenPoint(artist.position, camera, rect);
        if (!p) continue;
        const d = Math.hypot(p.x - x, p.y - y);
        if (d <= 108 && d < (best?.d ?? Infinity)) best = { d, hit: { kind: "artist", artist } };
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
        onHoverArtist(null);
        onHoverTrack(null);
        return;
      }

      const now = performance.now();
      if (now - lastHover.current < 110) return;
      lastHover.current = now;
      const hit = pick(event.clientX, event.clientY);
      canvas.style.cursor = hit ? "pointer" : "";
      onHoverArtist(hit?.kind === "artist" ? hit.artist : null);
      onHoverTrack(hit?.kind === "track" ? hit.track : null);
    };

    const onUp = (event: PointerEvent) => {
      const start = down.current;
      down.current = null;
      if (!start || dragging.current || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
      const hit = pick(event.clientX, event.clientY);
      if (hit?.kind === "artist") onSelectArtist(hit.artist);
      if (hit?.kind === "track") onSelectTrack(hit.track);
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
  }, [gl.domElement, onHoverArtist, onHoverTrack, onSelectArtist, onSelectTrack, pick]);

  return null;
}
