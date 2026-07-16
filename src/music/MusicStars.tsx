import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
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
  liveTrackPositions: MutableRefObject<Map<number, THREE.Vector3>>;
}

// 非播放星体使用接近真实恒星光谱的低饱和色，避免高纯度霓虹色在 Bloom 下形成塑料灯球。
// 颜色仍由歌曲 ID 稳定选取，因此刷新或重新进入歌单时不会发生无意义的随机跳色。
const TRACK_COLORS = ["#91aaa5", "#8fa8b8", "#b59aa2", "#a59fb4", "#bba77f", "#9faa8c", "#b19a8b", "#aab8bc"];
const ARTIST_COLORS = ["#baa678", "#b9a78f", "#8fa8b2", "#a49db2", "#ad939b", "#9eaa8e"];
const animatedTarget = new THREE.Vector3();

const STAR_VERTEX_SHADER = /* glsl */ `
  varying vec3 vViewNormal;
  varying vec3 vObjectNormal;

  void main() {
    vViewNormal = normalize(normalMatrix * normal);
    vObjectNormal = normalize(normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const STAR_CORE_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uSeed;
  varying vec3 vViewNormal;
  varying vec3 vObjectNormal;

  void main() {
    // varying 在三角形内部经过线性插值后不再保持单位长度；片元阶段重新归一化，
    // 才能让不同细分等级的球体拥有一致的边缘衰减和表面纹理强度。
    vec3 viewNormal = normalize(vViewNormal);
    vec3 objectNormal = normalize(vObjectNormal);
    float facing = clamp(viewNormal.z, 0.0, 1.0);
    float silhouette = smoothstep(0.035, 0.34, facing);
    if (silhouette < 0.01) discard;

    // 两组低频正弦只制造极轻的表面明暗差，不随时间闪烁；静态细节比统一呼吸更像远处星体，
    // 也不会为大量未播放歌曲增加逐帧 uniform 更新。
    float grainA = sin((objectNormal.x * 11.0 + objectNormal.y * 7.0 + uSeed) * 1.7);
    float grainB = sin((objectNormal.z * 13.0 - objectNormal.x * 5.0 + uSeed) * 1.3);
    float grain = grainA * grainB * 0.018;
    float center = pow(facing, 0.58);
    float lightPatch = pow(max(dot(objectNormal, normalize(vec3(-0.35, 0.72, 0.58))), 0.0), 3.0);

    vec3 edgeColor = uColor * 0.34;
    vec3 bodyColor = mix(edgeColor, uColor, center);
    vec3 warmCenter = mix(bodyColor, vec3(1.0, 0.93, 0.78), pow(center, 6.0) * 0.14);
    float intensity = 0.64 + center * 0.24 + lightPatch * 0.08 + grain;
    gl_FragColor = vec4(warmCenter * intensity, uOpacity * silhouette);
  }
`;

const STAR_CORONA_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec3 vViewNormal;

  void main() {
    float facing = clamp(normalize(vViewNormal).z, 0.0, 1.0);
    float edgeFade = smoothstep(0.0, 0.16, facing);
    float thinRim = pow(1.0 - facing, 2.6);
    float innerHaze = pow(facing, 3.0) * 0.08;
    float alpha = uOpacity * (thinRim + innerHaze) * edgeFade;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(uColor * 0.72, alpha);
  }
`;

interface DeepSpaceStarProps {
  radius: number;
  color: string;
  opacity: number;
  seed: number;
  coronaOpacity?: number;
  coronaScale?: number;
  segments?: number;
}

function DeepSpaceStar({
  radius,
  color,
  opacity,
  seed,
  coronaOpacity = 0,
  coronaScale = 1.32,
  segments = 20,
}: DeepSpaceStarProps) {
  // 每颗星只在 React 状态变化时重建 uniform；未播放状态没有 useFrame，确保歌单规模较大时
  // 仍然只承担与原方案接近的静态绘制开销。
  const coreUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uSeed: { value: (Math.abs(seed) % 997) * 0.017 },
    }),
    [color, opacity, seed],
  );
  const coronaUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: coronaOpacity },
    }),
    [color, coronaOpacity],
  );

  return (
    <>
      <mesh>
        <sphereGeometry args={[radius, segments, segments]} />
        <shaderMaterial
          vertexShader={STAR_VERTEX_SHADER}
          fragmentShader={STAR_CORE_FRAGMENT_SHADER}
          uniforms={coreUniforms}
          transparent
          depthWrite={opacity >= 0.85}
          blending={THREE.NormalBlending}
          toneMapped={false}
        />
      </mesh>
      {coronaOpacity > 0 && (
        <mesh scale={coronaScale}>
          <sphereGeometry args={[radius, Math.max(16, segments - 4), Math.max(16, segments - 4)]} />
          <shaderMaterial
            vertexShader={STAR_VERTEX_SHADER}
            fragmentShader={STAR_CORONA_FRAGMENT_SHADER}
            uniforms={coronaUniforms}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      )}
    </>
  );
}

function hasArtistSystem(artist: MusicArtist | null | undefined) {
  return !!artist && artist.trackIds.length > 1;
}

function pickColor(seed: number, palette: string[]) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return palette[Math.floor((x - Math.floor(x)) * palette.length) % palette.length];
}

function ActiveArtistHalo({ artist, tracks }: { artist: MusicArtist; tracks: MusicTrack[] }) {
  const layout = useMemo(() => musicOrbitLayout(tracks.length), [tracks.length]);
  const groupRef = useRef<THREE.Group>(null);
  const ringRefs = useRef<Array<THREE.Mesh | null>>([]);

  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    if (!group) return;

    // 歌手系统出现时由小到大缓慢展开，并保持非常轻的呼吸感。这样点击歌手后，
    // 用户能清楚感知“进入一个星系”，而不是看到轨道和歌曲在一帧内突然跳位。
    const appear = 1 - Math.pow(0.00008, Math.min(delta, 0.05));
    const breath = 1 + Math.sin(clock.elapsedTime * 1.35) * 0.012;
    group.scale.lerp(animatedTarget.setScalar(breath), appear);
    ringRefs.current.forEach((ring, index) => {
      if (!ring) return;
      ring.rotation.z += delta * (index % 2 === 0 ? 0.08 : -0.065);
      const material = ring.material as THREE.MeshBasicMaterial;
      material.opacity = (0.075 - index * 0.012) * (0.9 + Math.sin(clock.elapsedTime * 1.2 - index * 0.8) * 0.1);
    });
  });

  return (
    <group ref={groupRef} position={artist.position} scale={0.72}>
      {layout.radii.map((radius, index) => (
        <mesh
          key={radius}
          ref={(node) => {
            ringRefs.current[index] = node;
          }}
          position={[0, layout.yOffsets[index], 0]}
          rotation={[Math.PI / 2 + index * 0.075, index * 0.16, 0]}
        >
          <torusGeometry args={[radius, Math.max(0.55, 0.85 - index * 0.12), 6, 160]} />
          <meshBasicMaterial
            color={index === 0 ? "#c9aa69" : index === 1 ? "#718da1" : "#6f9187"}
            transparent
            opacity={0.075 - index * 0.012}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function ActiveTrackPulse() {
  const innerRef = useRef<THREE.Mesh>(null);
  const outerRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const wave = (Math.sin(clock.elapsedTime * 2.7) + 1) / 2;
    if (innerRef.current) {
      innerRef.current.scale.setScalar(1.25 + wave * 0.42);
      (innerRef.current.material as THREE.MeshBasicMaterial).opacity = 0.16 - wave * 0.07;
    }
    if (outerRef.current) {
      outerRef.current.scale.setScalar(1.7 + wave * 0.72);
      (outerRef.current.material as THREE.MeshBasicMaterial).opacity = 0.09 - wave * 0.045;
    }
  });

  return (
    <group>
      {/* 两层扩散球壳模拟诗云选中星体后的能量涟漪；只挂载在当前歌曲上，避免为全部歌曲增加逐帧开销。 */}
      <mesh ref={innerRef}>
        <sphereGeometry args={[19, 18, 18]} />
        <meshBasicMaterial color="#ffe8a8" transparent opacity={0.16} wireframe depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <mesh ref={outerRef}>
        <sphereGeometry args={[21, 18, 18]} />
        <meshBasicMaterial color="#7fd1ff" transparent opacity={0.09} wireframe depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
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
  liveTrackPositions,
}: MusicStarsProps) {
  const groupRef = useRef<THREE.Group>(null);
  const artistRefs = useRef(new Map<number, THREE.Group>());
  const trackRefs = useRef(new Map<number, THREE.Group>());
  const selectedArtist = useMemo(
    () => artists.find((artist) => artist.id === selectedArtistId && hasArtistSystem(artist)) ?? null,
    [artists, selectedArtistId],
  );
  const selectedArtistTracks = useMemo(
    () => (selectedArtist ? tracks.filter((track) => track.artistId === selectedArtist.id) : []),
    [selectedArtist, tracks],
  );
  const artistById = useMemo(() => new Map(artists.map((artist) => [artist.id, artist])), [artists]);
  const trackTargets = useMemo(() => {
    const targets = new Map<number, { position: [number, number, number]; scale: number }>();
    for (const track of tracks) {
      const trackArtist = artistById.get(track.artistId);
      const standalone = !hasArtistSystem(trackArtist);
      const inSelectedSystem = selectedArtist != null && track.artistId === selectedArtist.id;
      const position = inSelectedSystem
        ? musicTrackOrbitPosition(selectedArtist, track, selectedArtistTracks)
        : track.position;
      // 缩小未播放星体由几何层负责，这里保留旧的逻辑半径作为缩放基准，确保当前播放歌曲的
      // 实际尺寸以及 ActiveTrackPulse 的视觉范围完全不变。
      const baseRadius = standalone ? 17 : 11;
      const visualRadius = track.id === selectedId ? 26 : track.id === hoverTrackId ? 17 : inSelectedSystem ? 12.5 : baseRadius;
      const unrelated = selectedArtistId != null && !inSelectedSystem;
      targets.set(track.id, { position, scale: (visualRadius / baseRadius) * (unrelated ? 0.82 : 1) });
    }
    return targets;
  }, [artistById, hoverTrackId, selectedArtist, selectedArtistId, selectedArtistTracks, selectedId, tracks]);
  const artistScales = useMemo(() => {
    const scales = new Map<number, number>();
    for (const artist of artists) {
      const active = artist.id === selectedArtistId || artist.id === hoverArtistId;
      const unrelated = selectedArtistId != null && artist.id !== selectedArtistId;
      scales.set(artist.id, active ? 1.18 : unrelated ? 0.78 : 1);
    }
    return scales;
  }, [artists, hoverArtistId, selectedArtistId]);

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y = galaxySpin.angle;

    // 所有歌曲共用一个 useFrame 循环，避免为约 300 颗行星分别注册回调。
    // 指数阻尼与帧率无关，在高低刷新率设备上都能保持接近一致的过渡速度。
    const positionEase = 1 - Math.pow(0.00045, Math.min(delta, 0.05));
    const scaleEase = 1 - Math.pow(0.00008, Math.min(delta, 0.05));
    trackTargets.forEach((target, id) => {
      const group = trackRefs.current.get(id);
      if (!group) return;
      group.position.lerp(animatedTarget.set(...target.position), positionEase);
      const nextScale = THREE.MathUtils.lerp(group.scale.x, target.scale, scaleEase);
      group.scale.setScalar(nextScale);
    });
    artistScales.forEach((targetScale, id) => {
      const group = artistRefs.current.get(id);
      if (!group) return;
      const nextScale = THREE.MathUtils.lerp(group.scale.x, targetScale, scaleEase);
      group.scale.setScalar(nextScale);
    });
  });

  return (
    <group ref={groupRef}>
      {selectedArtist && <ActiveArtistHalo key={selectedArtist.id} artist={selectedArtist} tracks={selectedArtistTracks} />}
      {artists.map((artist) => {
        if (!hasArtistSystem(artist)) return null;
        const active = artist.id === selectedArtistId || artist.id === hoverArtistId;
        const radius = 22 + Math.min(artist.trackIds.length, 28) * 0.62;
        const unrelated = selectedArtistId != null && artist.id !== selectedArtistId;
        const color = active ? "#cdb77f" : pickColor(artist.id, ARTIST_COLORS);
        return (
        <group
          key={artist.id}
          ref={(node) => {
            if (node) artistRefs.current.set(artist.id, node);
            else artistRefs.current.delete(artist.id);
          }}
          position={artist.position}
        >
          <DeepSpaceStar
            radius={radius}
            color={color}
            opacity={unrelated ? 0.28 : active ? 0.9 : 0.68}
            seed={artist.id}
            coronaOpacity={active ? 0.07 : 0.024}
            coronaScale={active ? 1.44 : 1.3}
            segments={28}
          />
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
        const activeRadius = standalone ? 17 : 11;
        const radius = standalone ? 11.5 : 7.5;
        const color = selected ? "#ffe8a8" : hovered ? "#fff7d1" : pickColor(track.id, TRACK_COLORS);
        return (
          <group
            key={track.id}
            ref={(node) => {
              if (node) {
                trackRefs.current.set(track.id, node);
                // 直接共享 Three.js 内部维护的可变位置引用，不额外复制向量，也不会产生逐帧垃圾。
                liveTrackPositions.current.set(track.id, node.position);
              } else {
                trackRefs.current.delete(track.id);
                liveTrackPositions.current.delete(track.id);
              }
            }}
            position={track.position}
          >
            {selected ? (
              <>
                {/* 当前播放歌曲沿用原来的脉冲、扩散球壳和纯亮核心，避免优化背景星体时削弱主焦点。 */}
                <ActiveTrackPulse />
                <mesh>
                  <sphereGeometry args={[activeRadius * 2.2, 18, 18]} />
                  <meshBasicMaterial
                    color={color}
                    transparent
                    opacity={0.18}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    toneMapped={false}
                  />
                </mesh>
                <mesh>
                  <sphereGeometry args={[activeRadius, 20, 20]} />
                  <meshBasicMaterial color={color} transparent opacity={1} toneMapped={false} />
                </mesh>
              </>
            ) : (
              <DeepSpaceStar
                radius={radius}
                color={color}
                opacity={unrelated ? 0.2 : hovered ? 0.92 : inSelectedSystem ? 0.74 : standalone ? 0.64 : 0.5}
                seed={track.id}
                coronaOpacity={hovered ? 0.065 : inSelectedSystem ? 0.032 : standalone ? 0.024 : 0}
                coronaScale={hovered ? 1.46 : 1.32}
              />
            )}
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
