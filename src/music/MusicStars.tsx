import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { galaxySpin } from "../three/galaxyParams";
import type { MusicArtist, MusicTrack } from "./types";

interface MusicStarsProps {
  artists: MusicArtist[];
  tracks: MusicTrack[];
  selectedId: number | null;
  selectedArtistId: number | null;
  hoverTrackId: number | null;
  hoverArtistId: number | null;
}

export function MusicStars({
  artists,
  tracks,
  selectedId,
  selectedArtistId,
  hoverTrackId,
  hoverArtistId,
}: MusicStarsProps) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (groupRef.current) groupRef.current.rotation.y = galaxySpin.angle;
  });

  return (
    <group ref={groupRef}>
      {artists.map((artist) => {
        const active = artist.id === selectedArtistId || artist.id === hoverArtistId;
        const radius = 30 + Math.min(artist.trackIds.length, 28) * 1.25;
        return (
        <group key={artist.id} position={artist.position}>
          <mesh>
            <sphereGeometry args={[active ? radius * 1.22 : radius, 24, 24]} />
            <meshBasicMaterial color={active ? "#ffd27a" : "#f5d56a"} toneMapped={false} />
          </mesh>
          {active && <Html center distanceFactor={2200} zIndexRange={[18, 0]} style={{ pointerEvents: "none" }}>
            <div className="music-star-label">{artist.name}</div>
          </Html>}
        </group>
      )})}
      {tracks.map((track) => {
        const selected = track.id === selectedId;
        const hovered = track.id === hoverTrackId;
        const radius = selected ? 24 : hovered ? 18 : 12;
        return (
          <group key={track.id} position={track.position}>
            <mesh>
              <sphereGeometry args={[radius, 20, 20]} />
              <meshBasicMaterial color={selected ? "#ffd27a" : hovered ? "#f6dca6" : "#62f3c6"} toneMapped={false} />
            </mesh>
            {(selected || hovered) && (
              <Html center distanceFactor={2100} zIndexRange={[18, 0]} style={{ pointerEvents: "none" }}>
                <div className="music-track-label">
                  <strong>{track.name}</strong>
                  <span>{track.artistName}</span>
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}
