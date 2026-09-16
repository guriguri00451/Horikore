import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useRef } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { CharacterState } from "../machine/types";
import { Hori } from "./Hori";
import { Room } from "./Room";

/** 床中央付近。見下ろしを抑えるため視線の高さは低め。 */
const ROOM_CENTER: [number, number, number] = [0, 0.9, 0.15];

/** 室内・ほぼ目線。半径約 2.2。 */
const CAM = {
  position: [0.91, 1.33, 2.09] as [number, number, number],
  fov: 62,
};

export function Scene({
  state,
  line,
  lineId,
  petting,
  onPoke,
  onPet,
  onHitDone,
}: {
  state: CharacterState;
  line: string | null;
  lineId: number;
  petting: boolean;
  onPoke: () => void;
  onPet: (active: boolean) => void;
  onHitDone: (lineId: number) => void;
}) {
  const orbit = useRef<OrbitControlsImpl>(null);
  const setOrbit = (on: boolean) => {
    if (orbit.current) orbit.current.enabled = on;
  };
  return (
    <Canvas
      shadows
      camera={{ position: CAM.position, fov: CAM.fov, near: 0.1, far: 40 }}
      gl={{ antialias: true, alpha: false }}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
    >
      <color attach="background" args={["#d6cfc6"]} />
      <fog attach="fog" args={["#d6cfc6", 8, 16]} />
      <OrbitControls
        ref={orbit}
        makeDefault
        enableDamping
        enablePan={false}
        enableZoom={false}
        target={ROOM_CENTER}
        minDistance={1.6}
        maxDistance={2.35}
        minPolarAngle={1.2}
        maxPolarAngle={1.52}
      />
      <Suspense fallback={null}>
        <Room />
      </Suspense>
      <Suspense fallback={null}>
        <Hori
          state={state}
          line={line}
          lineId={lineId}
          petting={petting}
          onPoke={onPoke}
          onPet={onPet}
          onHitDone={onHitDone}
          onOrbitLock={(lock) => setOrbit(!lock)}
        />
      </Suspense>
    </Canvas>
  );
}
