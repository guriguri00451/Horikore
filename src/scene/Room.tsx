import { useTexture } from "@react-three/drei";
import { useLayoutEffect, useMemo } from "react";
import { RepeatWrapping, SRGBColorSpace, type Texture } from "three";

const FLOOR = {
  map: "/textures/laminate_floor_02_diff_1k.jpg",
  normalMap: "/textures/laminate_floor_02_nor_gl_1k.jpg",
  roughnessMap: "/textures/laminate_floor_02_rough_1k.jpg",
};
const WALL = {
  map: "/textures/beige_wall_001_diff_1k.jpg",
  normalMap: "/textures/beige_wall_001_nor_gl_1k.jpg",
  roughnessMap: "/textures/beige_wall_001_rough_1k.jpg",
};
const CEIL = {
  map: "/textures/white_plaster_02_diff_1k.jpg",
  normalMap: "/textures/white_plaster_02_nor_gl_1k.jpg",
  roughnessMap: "/textures/white_plaster_02_rough_1k.jpg",
};

function tile(tex: Texture, rx: number, ry: number, srgb: boolean) {
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(rx, ry);
  tex.anisotropy = 8;
  tex.colorSpace = srgb ? SRGBColorSpace : tex.colorSpace;
  tex.needsUpdate = true;
}

function Dumbbell({
  position,
  rotation,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
}) {
  const iron = "#2a2c30";
  const grip = "#161616";
  const plateR = 0.15;
  const plateT = 0.055;
  const inner = 0.175;
  const outer = 0.245;
  return (
    <group position={position} rotation={rotation}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.024, 0.024, 0.56, 12]} />
        <meshStandardMaterial color={grip} roughness={0.85} />
      </mesh>
      {([-1, 1] as const).map((side) => (
        <group key={side}>
          <mesh position={[side * inner, 0, 0]} rotation={[Math.PI / 6, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[plateR * 0.92, plateR * 0.92, plateT * 0.7, 6]} />
            <meshStandardMaterial color={iron} metalness={0.55} roughness={0.38} />
          </mesh>
          <mesh position={[side * outer, 0, 0]} rotation={[Math.PI / 6, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[plateR, plateR, plateT, 6]} />
            <meshStandardMaterial color={iron} metalness={0.55} roughness={0.38} />
          </mesh>
          <mesh position={[side * 0.12, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.032, 0.032, 0.024, 10]} />
            <meshStandardMaterial color="#3a3a3a" metalness={0.4} roughness={0.45} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function BenchPress({ position }: { position: [number, number, number] }) {
  const metal = "#1c1d20";
  const pad = "#2a2222";
  const chrome = "#8a9096";
  const plate = "#2a2c30";
  return (
    <group position={position}>
      <mesh position={[0, 0.48, 0.22]} castShadow>
        <boxGeometry args={[0.4, 0.08, 1.28]} />
        <meshStandardMaterial color={pad} roughness={0.88} />
      </mesh>
      <mesh position={[0, 0.42, 0.22]}>
        <boxGeometry args={[0.36, 0.05, 1.24]} />
        <meshStandardMaterial color={metal} metalness={0.45} roughness={0.48} />
      </mesh>
      {(
        [
          [-0.14, 0.2, -0.28],
          [0.14, 0.2, -0.28],
          [-0.14, 0.2, 0.72],
          [0.14, 0.2, 0.72],
        ] as const
      ).map((p) => (
        <mesh key={p.join(",")} position={[...p]}>
          <boxGeometry args={[0.04, 0.4, 0.04]} />
          <meshStandardMaterial color={metal} metalness={0.45} roughness={0.48} />
        </mesh>
      ))}
      <mesh position={[0, 0.04, 0.22]}>
        <boxGeometry args={[0.36, 0.04, 1.08]} />
        <meshStandardMaterial color={metal} metalness={0.4} roughness={0.5} />
      </mesh>
      {([-0.32, 0.32] as const).map((x) => (
        <group key={x}>
          <mesh position={[x, 0.72, -0.48]} castShadow>
            <boxGeometry args={[0.055, 1.28, 0.055]} />
            <meshStandardMaterial color={metal} metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[x, 1.12, -0.4]}>
            <boxGeometry args={[0.05, 0.04, 0.16]} />
            <meshStandardMaterial color={chrome} metalness={0.7} roughness={0.28} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.32, -0.48]}>
        <boxGeometry args={[0.7, 0.04, 0.05]} />
        <meshStandardMaterial color={metal} metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.16, -0.42]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.022, 0.022, 1.62, 12]} />
        <meshStandardMaterial color={chrome} metalness={0.75} roughness={0.22} />
      </mesh>
      {([-1, 1] as const).map((side) => (
        <group key={side} position={[side * 0.62, 1.16, -0.42]}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.2, 0.2, 0.05, 24]} />
            <meshStandardMaterial color={plate} metalness={0.55} roughness={0.38} />
          </mesh>
          <mesh position={[side * 0.055, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.16, 0.16, 0.045, 24]} />
            <meshStandardMaterial color={plate} metalness={0.55} roughness={0.38} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Window() {
  const frame = "#cfd5da";
  const inner = "#aeb6bd";
  const W = 1.48;
  const H = 1.18;
  const T = 0.055;
  const D = 0.07;
  return (
    <group position={[-1.15, 1.52, -2.08]}>
      <mesh position={[0, 0, -0.012]}>
        <boxGeometry args={[W - T * 1.6, H - T * 1.6, 0.03]} />
        <meshBasicMaterial color="#b7d0de" />
      </mesh>
      <mesh position={[0, H / 2 - T / 2, 0.01]}>
        <boxGeometry args={[W, T, D]} />
        <meshStandardMaterial color={frame} metalness={0.35} roughness={0.42} />
      </mesh>
      <mesh position={[0, -(H / 2 - T / 2), 0.01]}>
        <boxGeometry args={[W, T, D]} />
        <meshStandardMaterial color={frame} metalness={0.35} roughness={0.42} />
      </mesh>
      <mesh position={[-(W / 2 - T / 2), 0, 0.01]}>
        <boxGeometry args={[T, H - T * 2, D]} />
        <meshStandardMaterial color={frame} metalness={0.35} roughness={0.42} />
      </mesh>
      <mesh position={[W / 2 - T / 2, 0, 0.01]}>
        <boxGeometry args={[T, H - T * 2, D]} />
        <meshStandardMaterial color={frame} metalness={0.35} roughness={0.42} />
      </mesh>
      <mesh position={[0, 0, 0.022]}>
        <boxGeometry args={[0.028, H - T * 2, 0.03]} />
        <meshStandardMaterial color={inner} metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.022]}>
        <boxGeometry args={[W - T * 2, 0.024, 0.028]} />
        <meshStandardMaterial color={inner} metalness={0.4} roughness={0.4} />
      </mesh>
      {([-0.355, 0.355] as const).map((x) => (
        <mesh key={x} position={[x, 0, 0.028]}>
          <boxGeometry args={[0.66, H - T * 2 - 0.02, 0.008]} />
          <meshStandardMaterial
            color="#d7eaf2"
            roughness={0.08}
            metalness={0.12}
            transparent
            opacity={0.28}
            depthWrite={false}
          />
        </mesh>
      ))}
      <mesh position={[0, -(H / 2) - 0.035, 0.07]}>
        <boxGeometry args={[W + 0.08, 0.05, 0.14]} />
        <meshStandardMaterial color={frame} metalness={0.3} roughness={0.45} />
      </mesh>
    </group>
  );
}

function TiledMat({
  maps,
  repeat,
  roughness,
  normalScale,
}: {
  maps: { map: string; normalMap: string; roughnessMap: string };
  repeat: [number, number];
  roughness: number;
  normalScale: number;
}) {
  const shared = useTexture(maps);
  const tex = useMemo(
    () => ({
      map: shared.map.clone(),
      normalMap: shared.normalMap.clone(),
      roughnessMap: shared.roughnessMap.clone(),
    }),
    [shared],
  );
  const [rx, ry] = repeat;
  useLayoutEffect(() => {
    tile(tex.map, rx, ry, true);
    tile(tex.normalMap, rx, ry, false);
    tile(tex.roughnessMap, rx, ry, false);
    return () => {
      tex.map.dispose();
      tex.normalMap.dispose();
      tex.roughnessMap.dispose();
    };
  }, [tex, rx, ry]);
  return (
    <meshStandardMaterial
      map={tex.map}
      normalMap={tex.normalMap}
      roughnessMap={tex.roughnessMap}
      roughness={roughness}
      normalScale={[normalScale, normalScale]}
    />
  );
}

export function Room() {
  const base = "#4a3a2c";
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0.3]} receiveShadow>
        <planeGeometry args={[6, 5.6]} />
        <TiledMat maps={FLOOR} repeat={[4.2, 3.9]} roughness={0.52} normalScale={0.55} />
      </mesh>
      <mesh position={[0, 1.4, -2.2]} receiveShadow>
        <boxGeometry args={[6, 2.8, 0.08]} />
        <TiledMat maps={WALL} repeat={[3.2, 1.5]} roughness={0.88} normalScale={0.35} />
      </mesh>
      <mesh position={[0, 1.4, 2.8]} receiveShadow>
        <boxGeometry args={[6, 2.8, 0.08]} />
        <TiledMat maps={WALL} repeat={[3.2, 1.5]} roughness={0.88} normalScale={0.35} />
      </mesh>
      <mesh position={[-3, 1.4, 0.3]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[5, 2.8, 0.08]} />
        <TiledMat maps={WALL} repeat={[2.6, 1.5]} roughness={0.88} normalScale={0.35} />
      </mesh>
      <mesh position={[3, 1.4, 0.3]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[5, 2.8, 0.08]} />
        <TiledMat maps={WALL} repeat={[2.6, 1.5]} roughness={0.88} normalScale={0.35} />
      </mesh>
      <mesh position={[0, 2.8, 0.3]}>
        <boxGeometry args={[6, 0.08, 5]} />
        <TiledMat maps={CEIL} repeat={[3, 2.5]} roughness={0.92} normalScale={0.2} />
      </mesh>
      <mesh position={[0, 0.04, -2.16]}>
        <boxGeometry args={[6, 0.08, 0.04]} />
        <meshStandardMaterial color={base} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.04, 2.76]}>
        <boxGeometry args={[6, 0.08, 0.04]} />
        <meshStandardMaterial color={base} roughness={0.7} />
      </mesh>
      <mesh position={[-2.96, 0.04, 0.3]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[5, 0.08, 0.04]} />
        <meshStandardMaterial color={base} roughness={0.7} />
      </mesh>
      <mesh position={[2.96, 0.04, 0.3]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[5, 0.08, 0.04]} />
        <meshStandardMaterial color={base} roughness={0.7} />
      </mesh>
      <Window />
      <BenchPress position={[1.62, 0, -1.48]} />
      <group position={[-1.7, 0, -0.4]}>
        <mesh position={[0, 0.35, 0]}>
          <boxGeometry args={[0.42, 0.7, 0.42]} />
          <meshStandardMaterial color="#f3efe8" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.78, 0]}>
          <cylinderGeometry args={[0.05, 0.07, 0.16, 10]} />
          <meshStandardMaterial color="#e8d0c4" />
        </mesh>
        <mesh position={[0.12, 0.78, 0.08]}>
          <cylinderGeometry args={[0.035, 0.05, 0.14, 10]} />
          <meshStandardMaterial color="#d4b8c8" />
        </mesh>
      </group>
      <Dumbbell position={[2.12, 0.13, -0.82]} rotation={[0, 0.85, 0]} />
      <Dumbbell position={[2.22, 0.13, -1.12]} rotation={[0, 0.4, 0]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[2.4, 4, 3]} intensity={1.35} castShadow />
      <pointLight position={[-1.2, 2.1, -1.6]} intensity={0.5} color="#fff1c9" />
    </group>
  );
}
