import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { spinXZ } from "../three/galaxyParams";

interface MusicCameraFocusProps {
  target: [number, number, number] | null;
  kind: "artist" | "track" | null;
  focusSignal: number;
  overviewSignal: number;
}

const targetVec = new THREE.Vector3();
const currentOffset = new THREE.Vector3();
const desired = new THREE.Vector3();
const lift = new THREE.Vector3();
const look = new THREE.Matrix4();
const quat = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);

export function MusicCameraFocus({ target, kind, focusSignal, overviewSignal }: MusicCameraFocusProps) {
  const { camera } = useThree();
  const focus = useRef(0);
  const overview = useRef(0);
  const lastFocusSignal = useRef(focusSignal);
  const lastOverviewSignal = useRef(overviewSignal);

  useEffect(() => {
    if (focusSignal === lastFocusSignal.current) return;
    lastFocusSignal.current = focusSignal;
    if (!target || !kind) return;
    focus.current = 1;
    overview.current = 0;
  }, [focusSignal, kind, target]);

  useEffect(() => {
    if (overviewSignal === lastOverviewSignal.current) return;
    lastOverviewSignal.current = overviewSignal;
    overview.current = 1;
    focus.current = 0;
  }, [overviewSignal]);

  useFrame((_, dt) => {
    if (overview.current > 0) {
      targetVec.set(0, 0, 0);
      desired.set(700, 4600, 4600);
      const strength = overview.current * (1 - Math.pow(0.018, Math.min(dt, 0.05)));
      camera.position.lerp(desired, strength);
      camera.quaternion.slerp(quat.setFromRotationMatrix(look.lookAt(camera.position, targetVec, up)), strength);
      overview.current = Math.max(0, overview.current - dt / 1.35);
      return;
    }

    if (!target || !kind || focus.current <= 0) return;

    const [wx, wz] = spinXZ(target[0], target[2]);
    targetVec.set(wx, target[1], wz);
    currentOffset.copy(camera.position).sub(targetVec);
    if (currentOffset.lengthSq() < 1) currentOffset.set(0.7, 0.45, 0.7);

    const distance = kind === "track" ? 1650 : 2300;
    const liftY = kind === "track" ? 360 : 520;
    desired
      .copy(targetVec)
      .add(currentOffset.normalize().multiplyScalar(distance))
      .add(lift.set(0, liftY, 0));

    const strength = focus.current * (1 - Math.pow(0.018, Math.min(dt, 0.05)));
    camera.position.lerp(desired, strength);
    camera.quaternion.slerp(quat.setFromRotationMatrix(look.lookAt(camera.position, targetVec, up)), strength);
    focus.current = Math.max(0, focus.current - dt / 1.55);
  });

  return null;
}
