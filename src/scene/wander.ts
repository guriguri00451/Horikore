import type { CharacterState } from "../machine/types";

const X_MIN = -1.25;
const X_MAX = 1.2;
const Z_MIN = -0.85;
const Z_MAX = 1.05;
const FURNITURE = [
  { x: 1.45, z: -1.45, r: 0.72 },
  { x: -1.55, z: -0.35, r: 0.5 },
  { x: 1.7, z: 0.65, r: 0.42 },
];

export const WALKS = new Set<CharacterState>(["awake"]);

export type Wander = {
  x: number;
  z: number;
  yaw: number;
  tx: number;
  tz: number;
  pauseUntil: number;
  phase: number;
  moving: boolean;
};

export function createWander(): Wander {
  return {
    x: 0,
    z: 0.15,
    yaw: 0,
    tx: 0.4,
    tz: -0.2,
    pauseUntil: 0.6,
    phase: 0,
    moving: false,
  };
}

export function confineXZ(x: number, z: number) {
  const nx = Math.min(X_MAX, Math.max(X_MIN, x));
  const nz = Math.min(Z_MAX, Math.max(Z_MIN, z));
  if (!blocked(nx, nz)) return { x: nx, z: nz };
  return { x: 0, z: 0.15 };
}

const WALL_REST = 0.72;

/** Verlet 粒子を部屋の壁・家具で跳ね返す。入射速度の大きさを返す。 */
export function bounceXZ(pos: { x: number; z: number }, prev: { x: number; z: number }, radius = 0) {
  let impact = 0;
  const xmin = X_MIN + radius;
  const xmax = X_MAX - radius;
  const zmin = Z_MIN + radius;
  const zmax = Z_MAX - radius;
  if (pos.x < xmin) {
    const v = pos.x - prev.x;
    impact = Math.max(impact, Math.abs(v));
    pos.x = xmin;
    prev.x = pos.x + v * WALL_REST;
  } else if (pos.x > xmax) {
    const v = pos.x - prev.x;
    impact = Math.max(impact, Math.abs(v));
    pos.x = xmax;
    prev.x = pos.x + v * WALL_REST;
  }
  if (pos.z < zmin) {
    const v = pos.z - prev.z;
    impact = Math.max(impact, Math.abs(v));
    pos.z = zmin;
    prev.z = pos.z + v * WALL_REST;
  } else if (pos.z > zmax) {
    const v = pos.z - prev.z;
    impact = Math.max(impact, Math.abs(v));
    pos.z = zmax;
    prev.z = pos.z + v * WALL_REST;
  }
  for (const f of FURNITURE) {
    const limit = f.r + radius;
    const dx = pos.x - f.x;
    const dz = pos.z - f.z;
    const d = Math.hypot(dx, dz);
    if (d >= limit || d < 1e-5) continue;
    const nx = dx / d;
    const nz = dz / d;
    const vx = pos.x - prev.x;
    const vz = pos.z - prev.z;
    pos.x = f.x + nx * limit;
    pos.z = f.z + nz * limit;
    const vn = vx * nx + vz * nz;
    if (vn >= 0) continue;
    impact = Math.max(impact, -vn);
    prev.x = pos.x - (vx - 2 * vn * nx) * WALL_REST;
    prev.z = pos.z - (vz - 2 * vn * nz) * WALL_REST;
  }
  return impact;
}

function blocked(x: number, z: number) {
  for (const f of FURNITURE) {
    const dx = x - f.x;
    const dz = z - f.z;
    if (dx * dx + dz * dz < f.r * f.r) return true;
  }
  return x < X_MIN || x > X_MAX || z < Z_MIN || z > Z_MAX;
}

function pickTarget(fromX: number, fromZ: number) {
  for (let i = 0; i < 12; i++) {
    const dist = 0.55 + Math.random() * 1.35;
    const a = Math.random() * Math.PI * 2;
    const x = fromX + Math.cos(a) * dist;
    const z = fromZ + Math.sin(a) * dist;
    if (!blocked(x, z)) return { x, z };
  }
  return { x: 0, z: 0.2 };
}

function lerpAngle(from: number, to: number, t: number) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * t;
}

export function stepWander(w: Wander, dt: number, now: number, walk: boolean) {
  if (!walk) {
    w.moving = false;
    w.yaw = lerpAngle(w.yaw, 0, 1 - Math.pow(0.08, dt));
    w.phase *= Math.max(0, 1 - dt * 6);
    return w;
  }

  if (!w.moving) {
    if (now >= w.pauseUntil) {
      const t = pickTarget(w.x, w.z);
      w.tx = t.x;
      w.tz = t.z;
      w.moving = true;
    }
    w.phase *= Math.max(0, 1 - dt * 5);
    return w;
  }

  const dx = w.tx - w.x;
  const dz = w.tz - w.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.08) {
    w.moving = false;
    w.pauseUntil = now + 1.2 + Math.random() * 3.4;
    return w;
  }

  const want = Math.atan2(dx, dz);
  w.yaw = lerpAngle(w.yaw, want, 1 - Math.pow(0.12, dt));
  const speed = 0.16 + Math.sin(now * 0.35) * 0.02;
  const step = Math.min(dist, speed * dt);
  const nx = w.x + Math.sin(w.yaw) * step;
  const nz = w.z + Math.cos(w.yaw) * step;
  if (blocked(nx, nz)) {
    w.moving = false;
    w.pauseUntil = now + 0.4 + Math.random() * 0.8;
    return w;
  }
  w.x = nx;
  w.z = nz;
  w.phase += dt * 5.4;
  return w;
}

export function walkPose(phase: number, moving: boolean) {
  const amp = moving ? 1 : Math.min(1, Math.abs(Math.sin(phase)) * 4);
  const swing = Math.sin(phase) * 0.38 * amp;
  const bob = moving ? Math.abs(Math.sin(phase)) * 0.018 : 0;
  return {
    bob,
    sway: Math.sin(phase) * 0.035 * amp,
    legL: swing,
    legR: -swing,
    armL: -swing * 0.72,
    armR: swing * 0.72,
  };
}
