import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { galaxySpin } from "../three/galaxyParams";
import { musicOrbitLayout, musicTrackOrbitPosition } from "./orbitLayout";
import type { MusicArtist, MusicTrack } from "./types";

interface MusicStarsProps {
  artists: MusicArtist[];
  tracks: MusicTrack[];
  selectedId: number | null;
  selectedArtistId: number | null;
  hoverTrackId: number | null;
  hoverArtistId: number | null;
}

const TRACK_COLORS = ["#62f3c6", "#7fd1ff", "#ff8fb7", "#b99cff", "#ffd27a", "#a6e86f", "#ff9c6e", "#d7f3ff"];
const ARTIST_COLORS = ["#f5d56a", "#ffd7a1", "#9de7ff", "#c8b5ff", "#ffb0c8", "#b9ec8d"];

function hasArtistSystem(artist: MusicArtist | null | undefined) {
  return !!artist && artist.trackIds.length > 1;
}

function pickColor(seed: number, palette: string[]) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return palette[Math.floor((x - Math.floor(x)) * palette.length) % palette.length];
}

function ActiveArtistHalo({ artist, tracks }: { artist: MusicArtist; tracks: MusicTrack[] }) {
  const layout = useMemo(() => musicOrbitLayout(tracks.length), [tracks.length]);
  const maxOrbit = layout.radii[layout.radii.length - 1] ?? 340;

  return (
    <group position={artist.position}>
      {layout.radii.map((radius, index) => (
        <mesh key={radius} position={[0, layout.yOffsets[index], 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius, 2.4 - index * 0.35, 8, 160]} />
          <meshBasicMaterial
            color={index === 0 ? "#ffd27a" : index === 1 ? "#7fd1ff" : "#62f3c6"}
            transparent
            opacity={0.21 - index * 0.025}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}
      <mesh>
        <sphereGeometry args={[maxOrbit * 0.34, 32, 32]} />
        <meshBasicMaterial
          color="#ffd27a"
          transparent
          opacity={0.08}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
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
  const selectedArtist = artists.find((artist) => artist.id === selectedArtistId && hasArtistSystem(artist)) ?? null;
  const selectedArtistTracks = selectedArtist ? tracks.filter((track) => track.artistId === selectedArtist.id) : [];
  const artistById = useMemo(() => new Map(artists.map((artist) => [artist.id, artist])), [artists]);

  useFrame(() => {
    if (groupRef.current) groupRef.current.rotation.y = galaxySpin.angle;
  });

  return (
    <group ref={groupRef}>
      {selectedArtist && <ActiveArtistHalo artist={selectedArtist} tracks={selectedArtistTracks} />}
      {artists.map((artist) => {
        if (!hasArtistSystem(artist)) return null;
        const active = artist.id === selectedArtistId || artist.id === hoverArtistId;
        const unrelated = selectedArtistId != null && artist.id !== selectedArtistId;
        const radius = 30 + Math.min(artist.trackIds.length, 28) * 1.25;
        const color = active ? "#ffd27a" : pickColor(artist.id, ARTIST_COLORS);
        return (
        <group key={artist.id} position={artist.position}>
          {active && (
            <mesh>
              <sphereGeometry args={[radius * 1.9, 28, 28]} />
              <meshBasicMaterial
                color="#ffd27a"
                transparent
                opacity={0.13}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
          )}
          <mesh>
            <sphereGeometry args={[active ? radius * 1.34 : unrelated ? radius * 0.72 : radius, 24, 24]} />
            <meshBasicMaterial color={color} transparent opacity={unrelated ? 0.34 : 1} toneMapped={false} />
          </mesh>
          {active && <Html center zIndexRange={[18, 0]} style={{ pointerEvents: "none" }}>
            <div className="music-star-label">{artist.name}</div>
          </Html>}
        </group>
      )})}
      {tracks.map((track) => {
        const selected = track.id === selectedId;
        const hovered = track.id === hoverTrackId;
        const trackArtist = artistById.get(track.artistId);
        const standalone = !hasArtistSystem(trackArtist);
        const inSelectedSystem = selectedArtist != null && track.artistId === selectedArtist.id;
        const unrelated = selectedArtistId != null && !inSelectedSystem;
        const position =
          inSelectedSystem && selectedArtist
            ? musicTrackOrbitPosition(selectedArtist, track, selectedArtistTracks)
            : track.position;
        const radius = selected ? 26 : hovered ? 20 : inSelectedSystem ? 15 : standalone ? 17 : 11;
        const color = selected ? "#ffe8a8" : hovered ? "#fff7d1" : pickColor(track.id, TRACK_COLORS);
        return (
          <group key={track.id} position={position}>
            {(selected || hovered || inSelectedSystem || standalone) && (
              <mesh>
                <sphereGeometry args={[radius * (selected || hovered ? 2.2 : standalone ? 1.85 : 1.55), 18, 18]} />
                <meshBasicMaterial
                  color={color}
                  transparent
                  opacity={selected || hovered ? 0.18 : standalone ? 0.12 : 0.09}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                  toneMapped={false}
                />
              </mesh>
            )}
            <mesh>
              <sphereGeometry args={[radius, 20, 20]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={unrelated ? 0.28 : selected || hovered || inSelectedSystem || standalone ? 1 : 0.82}
                toneMapped={false}
              />
            </mesh>
            {(selected || hovered) && (
              <Html center zIndexRange={[18, 0]} style={{ pointerEvents: "none" }}>
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
