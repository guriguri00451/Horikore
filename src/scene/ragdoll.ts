import { Mesh, MeshBasicMaterial, Quaternion, SphereGeometry, Vector3, type Bone, type Object3D } from "three";
import { playWallHit } from "../audio/se";
import { bounceXZ } from "./wander";

export type RagNode = {
  bone: Bone;
  parent: RagNode | null;
  aim: RagNode | null;
  mass: number;
  radius: number;
  restLen: number;
  restChildLocal: Vector3;
  restQuat: Quaternion;
  pos: Vector3;
  prev: Vector3;
  pinned: boolean;
};

export type Ragdoll = {
  root: Object3D;
  nodes: RagNode[];
  hits: Mesh[];
  hips: RagNode;
  headTip: RagNode;
  grab: RagNode | null;
  grabOffset: Vector3;
  flick: Vector3;
  active: boolean;
  dropping: boolean;
  dropT: number;
};

const _inv = new Quaternion();
const _parentQ = new Quaternion();
const _delta = new Quaternion();
const _restDir = new Vector3();
const _wantDir = new Vector3();
const _local = new Vector3();
const _diff = new Vector3();
const _scale = new Vector3();
const CEIL = 2.55;
const hitMat = new MeshBasicMaterial({ visible: false });
const hitGeo = new SphereGeometry(1, 10, 8);
function noopRaycast() {}

function isBone(obj: Object3D): obj is Bone {
  return (obj as Bone).isBone === true;
}

function skip(name: string) {
  return /HandThumb|HandIndex/.test(name);
}

function massOf(name: string) {
  if (name.endsWith("Hips")) return 4.2;
  if (name.endsWith("Spine2") || name.endsWith("Spine1") || name.endsWith("Spine")) return 2.2;
  if (name.endsWith("Head")) return 1.4;
  if (name.endsWith("UpLeg")) return 1.6;
  if (name.endsWith("Leg")) return 1.1;
  if (name.endsWith("Foot") || name.endsWith("ToeBase")) return 0.7;
  if (name.endsWith("Shoulder")) return 0.9;
  if (name.endsWith("Arm")) return 0.75;
  if (name.endsWith("ForeArm")) return 0.55;
  if (name.endsWith("Hand")) return 0.4;
  if (name.endsWith("Neck")) return 0.7;
  return 0.5;
}

function radiusOf(name: string) {
  if (name.endsWith("HeadTop_End")) return 0.34;
  if (name.endsWith("Head") && !name.includes("Top")) return 0.42;
  if (name.endsWith("Hips") || name.endsWith("Spine2") || name.endsWith("Spine1") || name.endsWith("Spine")) return 0.1;
  if (name.endsWith("Neck") || name.endsWith("Shoulder")) return 0.07;
  if (name.endsWith("UpLeg")) return 0.08;
  if (name.endsWith("ForeArm")) return 0.045;
  if (name.endsWith("Arm")) return 0.055;
  if (name.endsWith("Leg")) return 0.06;
  if (name.endsWith("Foot") || name.endsWith("ToeBase")) return 0.045;
  if (name.endsWith("Hand")) return 0.04;
  return 0.04;
}

function aimName(name: string) {
  if (name.endsWith("Hips")) return "Spine";
  if (name.endsWith("Spine2")) return "Neck";
  if (name.endsWith("Head")) return "HeadTop_End";
  if (name.endsWith("Hand")) return null;
  return true;
}

export function createRagdoll(root: Object3D): Ragdoll | null {
  let hipsBone: Bone | undefined;
  root.traverse((obj) => {
    if (isBone(obj) && obj.name.endsWith("Hips")) hipsBone = obj;
  });
  if (!hipsBone) return null;

  const map = new Map<Bone, RagNode>();
  const nodes: RagNode[] = [];

  const walk = (bone: Bone, parent: RagNode | null) => {
    if (skip(bone.name)) return;
    const node: RagNode = {
      bone,
      parent,
      aim: null,
      mass: massOf(bone.name),
      radius: radiusOf(bone.name),
      restLen: 0,
      restChildLocal: new Vector3(),
      restQuat: new Quaternion(),
      pos: new Vector3(),
      prev: new Vector3(),
      pinned: false,
    };
    map.set(bone, node);
    nodes.push(node);
    for (const child of bone.children) {
      if (isBone(child)) walk(child, node);
    }
  };
  walk(hipsBone, null);

  for (const node of nodes) {
    if (node.parent) node.restLen = Math.max(0.004, node.bone.position.length());
    const rule = aimName(node.bone.name);
    let aim: RagNode | undefined;
    if (rule === true) {
      aim = node.bone.children.map((c) => (isBone(c) ? map.get(c) : undefined)).find(Boolean);
    } else if (typeof rule === "string") {
      aim = nodes.find((n) => n.bone.name.endsWith(rule) && n.parent === node);
    }
    if (!aim) continue;
    node.aim = aim;
    node.restChildLocal.copy(aim.bone.position);
  }

  const hips = map.get(hipsBone);
  const headTip =
    nodes.find((n) => n.bone.name.endsWith("HeadTop_End")) ??
    nodes.find((n) => n.bone.name.endsWith("Head") && !n.bone.name.includes("Top")) ??
    hips;
  if (!hips || !headTip) return null;
  const hits = nodes.map((n) => {
    const hit = new Mesh(hitGeo, hitMat);
    hit.name = `RagHit:${n.bone.name}`;
    hit.frustumCulled = false;
    hit.visible = false;
    hit.castShadow = false;
    hit.receiveShadow = false;
    hit.raycast = noopRaycast;
    hit.scale.setScalar(0);
    root.add(hit);
    return hit;
  });
  return {
    root,
    nodes,
    hits,
    hips,
    headTip,
    grab: null,
    grabOffset: new Vector3(),
    flick: new Vector3(),
    active: false,
    dropping: false,
    dropT: 0,
  };
}

export function snapshotRagdoll(r: Ragdoll) {
  r.hips.bone.updateWorldMatrix(true, true);
  for (const n of r.nodes) {
    n.bone.getWorldPosition(n.pos);
    n.prev.copy(n.pos);
    n.restQuat.copy(n.bone.quaternion);
    if (n.parent) n.restLen = Math.max(0.004, n.pos.distanceTo(n.parent.pos));
    if (n.aim) n.restChildLocal.copy(n.aim.bone.position);
    n.pinned = false;
  }
}

function constrain(a: RagNode, b: RagNode, restLen: number) {
  _diff.subVectors(b.pos, a.pos);
  const dist = _diff.length();
  if (dist < 1e-6) return;
  const imA = a.pinned ? 0 : 1 / a.mass;
  const imB = b.pinned ? 0 : 1 / b.mass;
  const w = imA + imB;
  if (w === 0) return;
  const corr = ((dist - restLen) / dist) * 0.62;
  a.pos.addScaledVector(_diff, (imA / w) * corr);
  b.pos.addScaledVector(_diff, -(imB / w) * corr);
}

function collideNode(n: RagNode, dropping: boolean) {
  if (n.pinned) return 0;
  if (n.pos.y < n.radius) {
    const vy = n.pos.y - n.prev.y;
    n.pos.y = n.radius;
    n.prev.y = n.pos.y + vy * (dropping ? 0.62 : 0.2);
  } else if (n.pos.y > CEIL - n.radius) {
    const vy = n.pos.y - n.prev.y;
    n.pos.y = CEIL - n.radius;
    n.prev.y = n.pos.y + vy * 0.55;
  }
  return bounceXZ(n.pos, n.prev, n.radius);
}

function collideBones(r: Ragdoll) {
  for (const n of r.nodes) {
    if (!n.parent) continue;
    const rad = Math.min(n.radius, n.parent.radius) * 0.92;
    const y = (n.pos.y + n.parent.pos.y) * 0.5;
    if (y >= rad) continue;
    const push = rad - y;
    const imA = n.parent.pinned ? 0 : 1 / n.parent.mass;
    const imB = n.pinned ? 0 : 1 / n.mass;
    const w = imA + imB;
    if (w === 0) continue;
    n.parent.pos.y += push * (imA / w);
    n.pos.y += push * (imB / w);
  }
}

export function stepRagdoll(r: Ragdoll, dt: number, grabWorld: Vector3 | null) {
  const t = Math.min(dt, 0.033);
  const holding = Boolean(r.grab && grabWorld);
  const damp = Math.pow(holding ? 0.9 : 0.985, t * 60);
  const g = (holding ? 13 : 7.2) * t * t;

  for (const n of r.nodes) n.pinned = n === r.grab && Boolean(grabWorld);

  if (r.grab && grabWorld) {
    _local.copy(grabWorld).add(r.grabOffset);
    r.flick.multiplyScalar(0.28).addScaledVector(_diff.subVectors(_local, r.grab.pos), 0.72);
    r.grab.pos.copy(_local);
  }

  for (const n of r.nodes) {
    if (n.pinned) continue;
    const vx = (n.pos.x - n.prev.x) * damp;
    const vy = (n.pos.y - n.prev.y) * damp;
    const vz = (n.pos.z - n.prev.z) * damp;
    n.prev.copy(n.pos);
    n.pos.x += vx;
    n.pos.y += vy - g;
    n.pos.z += vz;
  }

  let wallHit = 0;
  for (let i = 0; i < 8; i++) {
    if (r.grab && grabWorld) r.grab.pos.copy(grabWorld).add(r.grabOffset);
    for (const n of r.nodes) {
      if (!n.parent) continue;
      constrain(n.parent, n, n.restLen);
    }
    collideBones(r);
    for (const n of r.nodes) {
      const impact = collideNode(n, r.dropping);
      if (r.dropping) wallHit = Math.max(wallHit, impact);
    }
  }
  if (wallHit > WALL_HIT) playWallHit();

  if (r.dropping) {
    r.dropT += t;
    let ke = 0;
    for (const n of r.nodes) {
      const vx = n.pos.x - n.prev.x;
      const vy = n.pos.y - n.prev.y;
      const vz = n.pos.z - n.prev.z;
      ke += vx * vx + vy * vy + vz * vz;
    }
    const grounded = r.hips.pos.y < 0.32;
    if ((ke < 0.00045 && grounded) || (r.dropT > 5 && grounded) || r.dropT > 7) {
      r.active = false;
      r.dropping = false;
      return true;
    }
  }
  return false;
}

export function applyRagdoll(r: Ragdoll) {
  const parent = r.hips.bone.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  _local.copy(r.hips.pos);
  parent.worldToLocal(_local);
  r.hips.bone.position.copy(_local);

  for (const n of r.nodes) {
    if (!n.aim) continue;
    const boneParent = n.bone.parent;
    if (!boneParent) continue;
    boneParent.updateWorldMatrix(true, false);
    boneParent.getWorldQuaternion(_parentQ);
    _inv.copy(_parentQ).invert();
    _restDir.copy(n.restChildLocal).normalize().applyQuaternion(n.restQuat);
    _wantDir.subVectors(n.aim.pos, n.pos);
    if (_wantDir.lengthSq() < 1e-8) continue;
    _wantDir.normalize().applyQuaternion(_inv);
    _delta.setFromUnitVectors(_restDir, _wantDir);
    n.bone.quaternion.copy(n.restQuat).premultiply(_delta);
  }
  r.hips.bone.updateMatrixWorld(true);
  r.root.getWorldScale(_scale);
  const inv = _scale.x !== 0 ? 1 / _scale.x : 1;
  for (let i = 0; i < r.nodes.length; i++) {
    const hit = r.hits[i];
    hit.visible = r.active;
    hit.raycast = r.active ? Mesh.prototype.raycast : noopRaycast;
    if (!r.active) {
      hit.scale.setScalar(0);
      continue;
    }
    hit.position.copy(r.nodes[i].pos);
    r.root.worldToLocal(hit.position);
    hit.scale.setScalar(r.nodes[i].radius * inv * 1.2);
  }
}

export function startGrab(r: Ragdoll) {
  snapshotRagdoll(r);
  r.grab = r.headTip;
  r.grabOffset.set(0, 0, 0);
  r.flick.set(0, 0, 0);
  r.active = true;
  r.dropping = false;
  r.dropT = 0;
}

const THROW_BOOST = 7.2;
const THROW_MAX = 0.78;
const WALL_HIT = 0.02;

export function releaseGrab(r: Ragdoll) {
  _diff.copy(r.flick).multiplyScalar(THROW_BOOST);
  const speed = _diff.length();
  if (speed > THROW_MAX) _diff.multiplyScalar(THROW_MAX / speed);
  if (speed > 0.012 && _diff.y < speed * 0.12) _diff.y += speed * 0.38;

  const spin = Math.min(0.42, speed * 1.35);
  for (const n of r.nodes) {
    n.pinned = false;
    n.prev.copy(n.pos).sub(_diff);
    const ox = n.pos.x - r.hips.pos.x;
    const oy = n.pos.y - r.hips.pos.y;
    n.prev.x -= -oy * spin;
    n.prev.y -= ox * spin;
  }
  r.grab = null;
  r.dropping = true;
  r.dropT = 0;
}
