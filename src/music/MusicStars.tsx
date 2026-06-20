import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
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
  onHoverArtist: (artist: MusicArtist | null) => void;
  onHoverTrack: (track: MusicTrack | null) => void;
  onSelectArtist: (artist: MusicArtist) => void;
  onSelectTrack: (track: MusicTrack) => void;
}

function claimPointer(event: ThreeEvent<MouseEvent | PointerEvent>) {
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation?.();
}

function setCursor(cursor: string) {
  document.body.style.cursor = cursor;
}

export function MusicStars({
  artists,
  tracks,
  selectedId,
  selectedArtistId,
  hoverTrackId,
  hoverArtistId,
  onHoverArtist,
  onHoverTrack,
  onSelectArtist,
  onSelectTrack,
}: MusicStarsProps) {
  const { gl } = useThree();
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
        <group
          key={artist.id}
          position={artist.position}
          onClick={(event) => {
            claimPointer(event);
            onSelectArtist(artist);
          }}
          onPointerDown={claimPointer}
          onPointerOver={(event) => {
            claimPointer(event);
            gl.domElement.style.cursor = "pointer";
            setCursor("pointer");
            onHoverArtist(artist);
          }}
          onPointerMove={(event) => {
            claimPointer(event);
            gl.domElement.style.cursor = "pointer";
            setCursor("pointer");
          }}
          onPointerOut={() => {
            gl.domElement.style.cursor = "";
            setCursor("");
            onHoverArtist(null);
          }}
        >
          <mesh>
            <sphereGeometry args={[active ? radius * 1.22 : radius, 24, 24]} />
            <meshBasicMaterial color={active ? "#ffd27a" : "#f5d56a"} toneMapped={false} />
          </mesh>
          <mesh>
            <sphereGeometry args={[Math.max(radius * 2.6, 140), 16, 16]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          {active && <Html center distanceFactor={2200} style={{ pointerEvents: "none" }}>
            <div className="music-star-label">{artist.name}</div>
          </Html>}
        </group>
      )})}
      {tracks.map((track) => {
        const selected = track.id === selectedId;
        const hovered = track.id === hoverTrackId;
        const radius = selected ? 24 : hovered ? 18 : 12;
        return (
          <group
            key={track.id}
            position={track.position}
            onClick={(event) => {
              claimPointer(event);
              onSelectTrack(track);
            }}
            onPointerDown={claimPointer}
            onPointerOver={(event) => {
              claimPointer(event);
              gl.domElement.style.cursor = "pointer";
              setCursor("pointer");
              onHoverTrack(track);
            }}
            onPointerMove={(event) => {
              claimPointer(event);
              gl.domElement.style.cursor = "pointer";
              setCursor("pointer");
            }}
            onPointerOut={() => {
              gl.domElement.style.cursor = "";
              setCursor("");
              onHoverTrack(null);
            }}
          >
            <mesh>
              <sphereGeometry args={[radius, 20, 20]} />
              <meshBasicMaterial color={selected ? "#ffd27a" : hovered ? "#f6dca6" : "#62f3c6"} toneMapped={false} />
            </mesh>
            <mesh>
              <sphereGeometry args={[Math.max(radius * 4, 80), 16, 16]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            {(selected || hovered) && (
              <Html center distanceFactor={2100} style={{ pointerEvents: "none" }}>
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
