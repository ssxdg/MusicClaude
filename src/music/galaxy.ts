import type { MusicArtist, MusicGalaxyData, MusicTrack } from "./types";

function unit(seed: number) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function artistPosition(id: number, index: number): [number, number, number] {
  const radius = 900 + unit(id) * 2600;
  const angle = index * 2.399963 + unit(id + 4) * Math.PI;
  const y = (unit(id + 17) - 0.5) * 1000;
  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
}

function trackPosition(artist: MusicArtist, id: number, index: number, total: number): [number, number, number] {
  const radius = 130 + (index % 9) * 44 + unit(id) * 24;
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 + unit(id + 3);
  return [
    artist.position[0] + Math.cos(angle) * radius,
    artist.position[1] + (unit(id + 8) - 0.5) * 160,
    artist.position[2] + Math.sin(angle) * radius,
  ];
}

export function buildMusicGalaxy(tracks: MusicTrack[]): MusicGalaxyData {
  const artists = new Map<number, MusicArtist>();
  for (const track of tracks) {
    if (!artists.has(track.artistId)) {
      artists.set(track.artistId, {
        id: track.artistId,
        name: track.artistName,
        position: artistPosition(track.artistId, artists.size),
        trackIds: [],
      });
    }
    artists.get(track.artistId)!.trackIds.push(track.id);
  }

  const positionedTracks = tracks.map((track) => {
    const artist = artists.get(track.artistId)!;
    const localIndex = artist.trackIds.indexOf(track.id);
    return { ...track, position: trackPosition(artist, track.id, localIndex, artist.trackIds.length) };
  });

  return { artists: Array.from(artists.values()), tracks: positionedTracks };
}
