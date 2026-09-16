import { useGLTF } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  AnimationMixer,
  CanvasTexture,
  DoubleSide,
  Group,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Plane,
  Raycaster,
  Quaternion,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  type AnimationAction,
  type Object3D,
  type SkinnedMesh,
} from "three";
import { SkeletonUtils } from "three-stdlib";
import type { CharacterState } from "../machine/types";
import { Balloon } from "./Balloon";
import { applyRagdoll, createRagdoll, releaseGrab, startGrab, stepRagdoll } from "./ragdoll";
import { confineXZ, createWander, stepWander, WALKS } from "./wander";

function setSkinPick(root: Object3D, on: boolean) {
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh || mesh.name.startsWith("RagHit")) return;
    mesh.raycast = on ? Mesh.prototype.raycast : noopRaycast;
  });
}

function noopRaycast() {}

const _planeN = new Vector3();
const _hipsW = new Vector3();

useGLTF.preload("/models/hori-daisuke.glb");

/** 首から上だけ。体はルート縮小、頭は打ち消して大きく見せる。 */
const BODY_SCALE = 1.05;
const HEAD_SCALE = 4.1;

function applyChibi(root: Object3D) {
  root.traverse((obj) => {
    const mesh = obj as SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    for (const bone of mesh.skeleton.bones) {
      if (!bone.name.endsWith("Head") || bone.name.includes("Top")) continue;
      bone.scale.setScalar(HEAD_SCALE);
      bone.updateMatrix();
    }
  });
  root.updateMatrixWorld(true);
}

const ONCE = new Set(["awake", "hit"]);

const SCULPT_MOUTH = new Set(["V3_Lips", "V3_Mouth_Interior", "V3_Teeth"]);
/** 閉じ＝線、開き＝丸。 */
const MOUTH_LINE = 0.12;
const MOUTH_ROUND = 1;

function asMats(mesh: Mesh) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

/** 動かない唇・口内・歯を肌色にして、喋る口の下地にする。 */
function paintSculptedMouthSkin(root: Object3D) {
  let skin: MeshStandardMaterial | undefined;
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const found = asMats(mesh).find((m) => m.name === "MAT_Skin_Blockout");
    if (found instanceof MeshStandardMaterial) skin = found;
  });
  if (!skin) return;
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const mats = asMats(mesh);
    if (!mats.some((m) => SCULPT_MOUTH.has(m.name))) return;
    const next = mats.map((m) => {
      if (!SCULPT_MOUTH.has(m.name) || !(m instanceof MeshStandardMaterial)) return m;
      const copy = m.clone();
      copy.color.copy(skin!.color);
      copy.roughness = skin!.roughness;
      copy.metalness = skin!.metalness;
      copy.emissive.copy(skin!.emissive);
      copy.map = skin!.map;
      return copy;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0]!;
    mesh.visible = true;
  });
}

function findHeadBone(root: Object3D): Object3D | undefined {
  let head: Object3D | undefined;
  root.traverse((obj) => {
    if (obj.name.endsWith("Head") && !obj.name.includes("Top")) head = obj;
  });
  return head;
}

function disposeObject(obj: Object3D) {
  const mesh = obj as Mesh;
  mesh.geometry?.dispose();
  const mat = mesh.material;
  if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
  else mat?.dispose();
}

function stripNamed(parent: Object3D, name: string) {
  for (const child of [...parent.children]) {
    if (child.name !== name) continue;
    parent.remove(child);
    disposeObject(child);
  }
}

function stripAllNamed(root: Object3D, name: string) {
  const kill: Object3D[] = [];
  root.traverse((obj) => {
    if (obj.name === name) kill.push(obj);
  });
  for (const obj of kill) {
    obj.parent?.remove(obj);
    disposeObject(obj);
  }
}

function attachPetHead(root: Object3D): Mesh | null {
  const head = findHeadBone(root);
  if (!head) return null;
  stripNamed(head, "PetHead");
  const pet = new Mesh(new SphereGeometry(3.4, 10, 8), new MeshBasicMaterial({ visible: false }));
  pet.name = "PetHead";
  pet.frustumCulled = false;
  pet.position.set(0, 2.4, 3.1);
  head.add(pet);
  return pet;
}

function namedPetHead(obj: Object3D) {
  let o: Object3D | null = obj;
  while (o) {
    if (o.name === "PetHead" || o.name === "FaceMouth" || o.name.startsWith("FaceBlush")) return true;
    o = o.parent;
  }
  return false;
}

const _petLocal = new Vector3();
/** ちび頭は胴より上。シリンダー先端付近より上なら頭扱い。 */
const HEAD_LOCAL_Y = 1.08;
const TAP_MS = 280;
const TAP_PATH_PX = 48;
const RAGDOLL_BODY_PX2 = 100;
const RAGDOLL_HEAD_PX2 = 140 * 140;

function hitIsHead(e: ThreeEvent<PointerEvent>, group: Group | null) {
  if (e.intersections.some((hit) => namedPetHead(hit.object))) return true;
  if (!group) return false;
  group.worldToLocal(_petLocal.copy(e.point));
  return _petLocal.y >= HEAD_LOCAL_Y;
}

const _mouthPos = new Vector3();
const _mouthFwd = new Vector3();
const _qHead = new Quaternion();
const _qParent = new Quaternion();

type LipAnchor = { mesh: SkinnedMesh; index: number; head: Object3D };

function pickLipAnchor(root: Object3D): LipAnchor | null {
  const head = findHeadBone(root);
  let lips: SkinnedMesh | undefined;
  root.traverse((obj) => {
    const mesh = obj as SkinnedMesh;
    if (!mesh.isMesh) return;
    if (asMats(mesh).some((m) => m.name === "V3_Lips")) lips = mesh;
  });
  if (!head || !lips?.isSkinnedMesh) return null;
  const pos = lips.geometry.attributes.position;
  let index = 0;
  let best = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (Math.abs(x) > 0.01 || y < 0.878 || y > 0.892) continue;
    const score = z - Math.abs(x) * 3;
    if (score > best) {
      best = score;
      index = i;
    }
  }
  return { mesh: lips, index, head };
}

const _headRight = new Vector3();
const _headUp = new Vector3();
const _blushPos = new Vector3();
const _headAt = new Vector3();

function faceBasis(anchor: LipAnchor, parent: Object3D) {
  const { mesh, index, head } = anchor;
  mesh.skeleton.update();
  mesh.getVertexPosition(index, _mouthPos);
  mesh.localToWorld(_mouthPos);
  head.getWorldQuaternion(_qHead);
  _mouthFwd.set(0, 0, 1).applyQuaternion(_qHead);
  _headRight.set(1, 0, 0).applyQuaternion(_qHead);
  _headUp.set(0, 1, 0).applyQuaternion(_qHead);
  parent.getWorldQuaternion(_qParent);
}

function placeMouthOnLips(mouth: Mesh, parent: Object3D, anchor: LipAnchor, open: number) {
  faceBasis(anchor, parent);
  _mouthPos.addScaledVector(_mouthFwd, -0.004);
  parent.worldToLocal(_mouthPos);
  mouth.position.copy(_mouthPos);
  mouth.quaternion.copy(_qParent.invert().multiply(_qHead));
  mouth.scale.set(1.15, MOUTH_LINE + (MOUTH_ROUND - MOUTH_LINE) * open, 1);
}

function placeBlush(mark: Mesh, parent: Object3D, anchor: LipAnchor, side: number, amt: number) {
  faceBasis(anchor, parent);
  _blushPos.copy(_mouthPos);
  _blushPos.addScaledVector(_headRight, side * 0.058);
  _blushPos.addScaledVector(_headUp, 0.026);
  _blushPos.addScaledVector(_mouthFwd, 0.002);
  parent.worldToLocal(_blushPos);
  mark.position.copy(_blushPos);
  mark.quaternion.copy(_qParent.invert().multiply(_qHead));
  const s = 0.9 + amt * 0.25;
  mark.scale.set(1.55 * s, 1.05 * s, 1);
  const mat = mark.material as MeshBasicMaterial;
  mat.opacity = 0.55 * amt;
  mark.visible = amt > 0.02;
}

function sparkleMap() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 64, 64);
  const rad = g.createRadialGradient(32, 32, 2, 32, 32, 28);
  rad.addColorStop(0, "rgba(255,255,230,1)");
  rad.addColorStop(0.25, "rgba(255,210,90,0.95)");
  rad.addColorStop(1, "rgba(255,140,40,0)");
  g.fillStyle = rad;
  g.fillRect(0, 0, 64, 64);
  g.globalCompositeOperation = "lighter";
  g.strokeStyle = "rgba(255,248,210,0.95)";
  g.lineWidth = 5;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(32, 8);
  g.lineTo(32, 56);
  g.moveTo(8, 32);
  g.lineTo(56, 32);
  g.stroke();
  const tex = new CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

type PetSpark = { sprite: Sprite; a: number; r: number; s: number; delay: number };

function makePetFx(): { group: Group; sparks: PetSpark[] } {
  const group = new Group();
  group.name = "PetFx";
  const map = sparkleMap();
  const sparks: PetSpark[] = [];
  for (let i = 0; i < 10; i++) {
    const mat = new SpriteMaterial({
      map,
      color: i % 2 ? 0xffe08a : 0xfff6c8,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      opacity: 0,
    });
    const sprite = new Sprite(mat);
    sprite.raycast = noopRaycast;
    sprite.frustumCulled = false;
    sprite.renderOrder = 3;
    group.add(sprite);
    sparks.push({
      sprite,
      a: (i / 10) * Math.PI * 2 + 0.4,
      r: 0.11 + (i % 3) * 0.03,
      s: 0.07 + (i % 4) * 0.018,
      delay: i * 0.11,
    });
  }
  return { group, sparks };
}

function stepPetFx(
  fx: { group: Group; sparks: PetSpark[] },
  parent: Object3D,
  head: Object3D,
  t: number,
  k: number,
) {
  head.getWorldPosition(_headAt);
  parent.worldToLocal(_headAt);
  fx.group.visible = k > 0.02;
  if (k <= 0.02) return;
  for (const sp of fx.sparks) {
    const u = (t * 0.55 + sp.delay) % 1;
    const rise = u * 0.28;
    const fade = k * Math.sin(u * Math.PI);
    const spin = sp.a + t * 0.7;
    sp.sprite.position.set(
      _headAt.x + Math.cos(spin) * sp.r * (0.75 + u * 0.5),
      _headAt.y + 0.18 + rise,
      _headAt.z + Math.sin(spin) * sp.r * 0.45 + 0.04,
    );
    const size = sp.s * (0.55 + fade * 0.9);
    sp.sprite.scale.set(size, size, 1);
    (sp.sprite.material as SpriteMaterial).opacity = fade;
  }
}

function stepFace(
  g: Group,
  anchor: LipAnchor | null,
  mouth: Mesh | null,
  left: Mesh | null,
  right: Mesh | null,
  fx: { group: Group; sparks: PetSpark[] },
  t: number,
  dt: number,
  talking: boolean,
  state: CharacterState,
  lineId: number,
  petting: boolean,
  mouthAmt: { current: number },
  blushAmt: { current: number },
) {
  mouthAmt.current += (mouthOpen(talking, state, t, lineId) - mouthAmt.current) * Math.min(1, dt * 18);
  const want = petting && state !== "hit" ? 1 : 0;
  blushAmt.current += (want - blushAmt.current) * Math.min(1, dt * 7);
  if (mouth && anchor) placeMouthOnLips(mouth, g, anchor, mouthAmt.current);
  if (anchor) {
    if (left) placeBlush(left, g, anchor, -1, blushAmt.current);
    if (right) placeBlush(right, g, anchor, 1, blushAmt.current);
    stepPetFx(fx, g, anchor.head, t, blushAmt.current);
  }
}

function mouthOpen(talking: boolean, state: CharacterState, t: number, lineId: number) {
  if (!talking) return 0;
  const hz = state === "angry" || state === "hit" ? 6.2 : 4.4;
  const pulse = Math.max(0, Math.sin((t + lineId) * hz * Math.PI * 2));
  return pulse ** 0.65;
}

function clipFor(state: CharacterState, moving: boolean, rising: boolean) {
  if (rising && state === "awake") return "awake";
  if (state === "sleeping") return "sleep";
  if (state === "nodding") return "nodding";
  if (state === "workout") return "workout";
  if (state === "angry") return "angry";
  if (state === "beauty") return "beauty";
  if (state === "called") return "called";
  if (state === "hit") return "hit";
  if (state === "awake" && moving) return "walk";
  return "idle";
}

function timeScaleFor(state: CharacterState, clip: string) {
  if (clip === "walk") return 0.4;
  if (state === "nodding") return 0.8;
  return 1;
}

export function Hori({
  state,
  line,
  lineId,
  petting,
  onPoke,
  onPet,
  onHitDone,
  onOrbitLock,
}: {
  state: CharacterState;
  line: string | null;
  lineId: number;
  petting: boolean;
  onPoke: () => void;
  onPet: (active: boolean) => void;
  onHitDone: (lineId: number) => void;
  onOrbitLock: (lock: boolean) => void;
}) {
  const { scene, animations } = useGLTF("/models/hori-daisuke.glb");
  const cloned = useMemo(() => {
    const root = SkeletonUtils.clone(scene);
    root.traverse((obj: Object3D) => {
      const mesh = obj as Object3D & { isMesh?: boolean };
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
    });
    return root;
  }, [scene]);
  const lipAnchor = useMemo(() => {
    stripAllNamed(cloned, "FaceMouth");
    paintSculptedMouthSkin(cloned);
    attachPetHead(cloned);
    return pickLipAnchor(cloned);
  }, [cloned, "mouth-skin-v1"]);
  const mouthRef = useRef<Mesh>(null);
  const blushL = useRef<Mesh>(null);
  const blushR = useRef<Mesh>(null);
  const mouthAmt = useRef(0);
  const blushAmt = useRef(0);
  const petFx = useMemo(makePetFx, []);
  const mixer = useMemo(() => new AnimationMixer(cloned), [cloned]);
  const clips = useMemo(
    () =>
      Object.fromEntries(
        animations.map((clip) => {
          const filtered = clip.clone();
          filtered.tracks = filtered.tracks.filter((track) => {
            const n = track.name;
            if (!n.endsWith(".scale")) return true;
            if (n.endsWith("Head.scale")) return false;
            return true;
          });
          return [clip.name, filtered];
        }),
      ),
    [animations],
  );
  const actions = useRef<Record<string, ReturnType<AnimationMixer["clipAction"]>>>({});
  const root = useRef<Group>(null);
  const wander = useRef(createWander());
  const playing = useRef<string | null>(null);
  const prevState = useRef<CharacterState | null>(null);
  const rising = useRef(false);
  const onHitDoneRef = useRef(onHitDone);
  const onPokeRef = useRef(onPoke);
  const onPetRef = useRef(onPet);
  const onOrbitLockRef = useRef(onOrbitLock);
  const hitLineOf = useRef(new WeakMap<AnimationAction, number>());
  onHitDoneRef.current = onHitDone;
  onPokeRef.current = onPoke;
  onPetRef.current = onPet;
  onOrbitLockRef.current = onOrbitLock;
  const ragdoll = useMemo(() => createRagdoll(cloned), [cloned]);
  const { gl, camera } = useThree();
  const drag = useRef({
    down: false,
    flop: false,
    onHead: false,
    holding: false,
    path: 0,
    t0: 0,
    sx: 0,
    sy: 0,
    lx: 0,
    ly: 0,
  });
  const ndc = useRef(new Vector2());
  const grabPlane = useRef(new Plane());
  const grabHit = useRef(new Vector3());
  const ray = useRef(new Raycaster());
  const grabTarget = useRef(new Vector3());
  const balloonAt = useRef(new Vector3(0.42, 1.2, 0.22));
  const balloonRef = useRef<Group>(null);
  const skinPick = useRef(true);

  useEffect(
    () => () => {
      mixer.stopAllAction();
    },
    [mixer],
  );

  useEffect(() => {
    const onFinished = (e: { action: AnimationAction }) => {
      const name = e.action.getClip().name;
      if (name === "awake") rising.current = false;
      if (name === "hit") {
        const started = hitLineOf.current.get(e.action);
        if (started != null) onHitDoneRef.current(started);
      }
    };
    mixer.addEventListener("finished", onFinished);
    return () => {
      mixer.removeEventListener("finished", onFinished);
    };
  }, [mixer]);

  useEffect(() => {
    const setNdc = (e: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      ndc.current.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag.current.down) return;
      setNdc(e);
      const dxStep = e.clientX - drag.current.lx;
      const dyStep = e.clientY - drag.current.ly;
      drag.current.path += Math.hypot(dxStep, dyStep);
      drag.current.lx = e.clientX;
      drag.current.ly = e.clientY;
      if (drag.current.flop || !ragdoll) return;
      const dx = e.clientX - drag.current.sx;
      const dy = e.clientY - drag.current.sy;
      const rag2 = drag.current.onHead ? RAGDOLL_HEAD_PX2 : RAGDOLL_BODY_PX2;
      if (dx * dx + dy * dy < rag2) return;
      drag.current.flop = true;
      if (drag.current.holding) {
        drag.current.holding = false;
        onPetRef.current(false);
      }
      startGrab(ragdoll);
      grabHit.current.copy(ragdoll.headTip.pos);
      camera.getWorldDirection(_planeN);
      grabPlane.current.setFromNormalAndCoplanarPoint(_planeN.negate(), grabHit.current);
    };
    const onUp = () => {
      if (!drag.current.down) return;
      drag.current.down = false;
      onOrbitLockRef.current(false);
      document.body.style.cursor = "auto";
      if (drag.current.holding) {
        drag.current.holding = false;
        onPetRef.current(false);
      }
      if (drag.current.flop && ragdoll) releaseGrab(ragdoll);
      else if (
        drag.current.onHead &&
        performance.now() - drag.current.t0 < TAP_MS &&
        drag.current.path < TAP_PATH_PX
      ) {
        onPokeRef.current();
      }
      drag.current.flop = false;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (drag.current.down) {
        drag.current.down = false;
        onOrbitLockRef.current(false);
      }
    };
  }, [camera, gl, ragdoll]);

  useFrame(({ clock }, dt) => {
    if (prevState.current === "sleeping" && state === "awake") rising.current = true;
    if (state !== "awake") rising.current = false;
    prevState.current = state;

    const t = clock.getElapsedTime();
    const flopping = Boolean(ragdoll?.active);
    const g = root.current;
    if (flopping && skinPick.current) {
      skinPick.current = false;
      setSkinPick(cloned, false);
    } else if (!flopping && !skinPick.current) {
      skinPick.current = true;
      setSkinPick(cloned, true);
    }

    if (flopping && ragdoll) {
      let grabAt: Vector3 | null = null;
      if (ragdoll.grab && drag.current.down) {
        ray.current.setFromCamera(ndc.current, camera);
        if (ray.current.ray.intersectPlane(grabPlane.current, grabTarget.current)) {
          grabAt = grabTarget.current;
        }
      }
      const settled = stepRagdoll(ragdoll, dt, grabAt);
      applyRagdoll(ragdoll);
      applyChibi(cloned);
      stripAllNamed(cloned, "FaceMouth");
      if (g) {
        ragdoll.hips.bone.getWorldPosition(_hipsW);
        g.worldToLocal(_hipsW);
        balloonAt.current.set(_hipsW.x + 0.28, _hipsW.y + 0.55, _hipsW.z + 0.12);
        if (settled) {
          const placed = confineXZ(ragdoll.hips.pos.x, ragdoll.hips.pos.z);
          wander.current.x = placed.x;
          wander.current.z = placed.z;
          wander.current.moving = false;
          wander.current.yaw = 0;
          g.position.set(placed.x, 0, placed.z);
          g.rotation.y = 0;
          balloonAt.current.set(0.42, 1.2, 0.22);
          playing.current = null;
        }
        g.updateMatrixWorld(true);
        stepFace(
          g,
          lipAnchor,
          mouthRef.current,
          blushL.current,
          blushR.current,
          petFx,
          t,
          dt,
          Boolean(line),
          state,
          lineId,
          petting,
          mouthAmt,
          blushAmt,
        );
      }
      balloonRef.current?.position.copy(balloonAt.current);
      return;
    }

    const w = stepWander(wander.current, Math.min(dt, 0.05), t, WALKS.has(state) && !rising.current);
    const clip = clipFor(state, w.moving, rising.current);
    const rate = timeScaleFor(state, clip);
    const key = clip === "hit" ? `${clip}:${rate}:${lineId}` : `${clip}:${rate}`;
    if (playing.current !== key) {
      const source = clips[clip];
      if (source) {
        const next = (actions.current[clip] ??= mixer.clipAction(source));
        const prevName = playing.current?.split(":")[0];
        if (prevName && prevName !== clip) actions.current[prevName]?.fadeOut(0.2);
        next.reset();
        const once = ONCE.has(clip);
        next.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
        next.clampWhenFinished = once;
        next.timeScale = rate;
        if (clip === "hit") hitLineOf.current.set(next, lineId);
        const remash = clip === "hit" && prevName === "hit";
        next.fadeIn(remash || !playing.current ? 0 : 0.2).play();
        playing.current = key;
      }
    }
    mixer.update(dt);
    applyChibi(cloned);
    stripAllNamed(cloned, "FaceMouth");
    if (!g) return;
    g.position.set(w.x, 0, w.z);
    g.rotation.y = w.yaw;
    g.updateMatrixWorld(true);
    stepFace(
      g,
      lipAnchor,
      mouthRef.current,
      blushL.current,
      blushR.current,
      petFx,
      t,
      dt,
      Boolean(line),
      state,
      lineId,
      petting,
      mouthAmt,
      blushAmt,
    );
    balloonAt.current.set(0.42, 1.2, 0.22);
    balloonRef.current?.position.copy(balloonAt.current);
  });

  return (
    <group
      ref={root}
      position={[0, 0, 0.15]}
      scale={BODY_SCALE}
      onPointerDown={(e) => {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        e.stopPropagation();
        const onHead = hitIsHead(e, root.current);
        if (!onHead) onPoke();
        else {
          drag.current.holding = true;
          onPet(true);
        }
        onOrbitLock(true);
        drag.current.down = true;
        drag.current.flop = false;
        drag.current.onHead = onHead;
        drag.current.path = 0;
        drag.current.t0 = performance.now();
        drag.current.sx = e.nativeEvent.clientX;
        drag.current.sy = e.nativeEvent.clientY;
        drag.current.lx = e.nativeEvent.clientX;
        drag.current.ly = e.nativeEvent.clientY;
        grabHit.current.copy(e.point);
        const rect = gl.domElement.getBoundingClientRect();
        ndc.current.set(
          ((e.nativeEvent.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.nativeEvent.clientY - rect.top) / rect.height) * 2 + 1,
        );
      }}
      onPointerOver={() => {
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        if (drag.current.down) return;
        document.body.style.cursor = "auto";
      }}
    >
      <primitive object={cloned} />
      <mesh ref={blushL} name="FaceBlushL" frustumCulled={false} renderOrder={1} raycast={noopRaycast}>
        <circleGeometry args={[0.034, 24]} />
        <meshBasicMaterial
          color={0xff5a6e}
          transparent
          opacity={0}
          depthWrite={false}
          side={DoubleSide}
          polygonOffset
          polygonOffsetFactor={-3}
          polygonOffsetUnits={-3}
        />
      </mesh>
      <mesh ref={blushR} name="FaceBlushR" frustumCulled={false} renderOrder={1} raycast={noopRaycast}>
        <circleGeometry args={[0.034, 24]} />
        <meshBasicMaterial
          color={0xff5a6e}
          transparent
          opacity={0}
          depthWrite={false}
          side={DoubleSide}
          polygonOffset
          polygonOffsetFactor={-3}
          polygonOffsetUnits={-3}
        />
      </mesh>
      <primitive object={petFx.group} />
      <mesh
        ref={mouthRef}
        name="FaceMouth"
        frustumCulled={false}
        renderOrder={2}
      >
        <circleGeometry args={[0.042, 28]} />
        <meshBasicMaterial
          color={0x111111}
          side={DoubleSide}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-4}
          polygonOffsetUnits={-4}
        />
      </mesh>
      <mesh position={[0, 0.78, 0]} visible={false}>
        <cylinderGeometry args={[0.42, 0.5, 1.65, 8]} />
      </mesh>
      <group ref={balloonRef} position={[0.42, 1.2, 0.22]}>
        <Balloon text={line} />
      </group>
    </group>
  );
}
