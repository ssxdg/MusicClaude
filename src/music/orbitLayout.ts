import type { MusicArtist, MusicTrack } from "./types";

const TAU = Math.PI * 2;

export interface MusicOrbitLayout {
  ringCount: number;
  radii: number[];
  yOffsets: number[];
}

export function musicOrbitLayout(trackCount: number): MusicOrbitLayout {
  const ringCount = trackCount > 18 ? 3 : trackCount > 8 ? 2 : 1;
  const baseRadius = trackCount <= 6 ? 340 : trackCount <= 12 ? 310 : 280;
  const radii = Array.from({ length: ringCount }, (_, index) => baseRadius + index * 170);
  const yOffsets = Array.from({ length: ringCount }, (_, index) => (index - (ringCount - 1) / 2) * 64);
  return { ringCount, radii, yOffsets };
}

export function musicTrackOrbitPosition(
  artist: MusicArtist,
  track: MusicTrack,
  artistTracks: MusicTrack[],
): [number, number, number] {
  const count = Math.max(artistTracks.length, 1);
  const layout = musicOrbitLayout(count);
  const index = Math.max(0, artistTracks.findIndex((item) => item.id === track.id));
  const ring = index % layout.ringCount;
  const slot = Math.floor(index / layout.ringCount);
  const slotsOnRing = Math.max(1, Math.ceil((count - ring) / layout.ringCount));
  const angle = (slot / slotsOnRing) * TAU + ring * 0.46 + (artist.id % 97) * 0.011;
  const radius = layout.radii[ring];
  return [
    artist.position[0] + Math.cos(angle) * radius,
    artist.position[1] + layout.yOffsets[ring],
    artist.position[2] + Math.sin(angle) * radius,
  ];
}
