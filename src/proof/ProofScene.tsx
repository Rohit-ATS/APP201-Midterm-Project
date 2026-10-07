/**
 * ProofScene.tsx
 * ---------------------------------------------------------------------------
 * The 3D half of the animated proof: one night-time road, re-staged for each
 * step of the derivation.
 *
 * Every frame asks one question — "where are we in the story?" — and lays the
 * cars out from the mathematics for that step: the spacing line for the
 * single car, k = 1/s for the packed mile, the triangle for the density
 * sweep, Newell's rule for the brake wave and the green light. Nothing here is
 * keyframed by hand, so what you see is what the equations say.
 *
 * Coordinates: x runs along the road in the direction of travel (metres), y
 * is up, z is across the road. Forward lanes are on +z, nearest the camera.
 */

import { Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, PerformanceMonitor, Stars } from '@react-three/drei';
import { Bloom, ChromaticAberration, EffectComposer, Noise, Vignette } from '@react-three/postprocessing';
import { BlendFunction, type ChromaticAberrationEffect } from 'postprocessing';
import * as THREE from 'three';
import {
  fundamentalDiagram,
  speedAt as fdSpeedAt,
  spacingAt,
  type TrafficParams,
} from '../lib/trafficMath';
import { meanVehicleLength, VEHICLE_CLASSES } from '../data/vehicleMix';
import { posAt, speedAt, accelAt, type BrakeRun, type QueueRun } from './newell';
import { story, split, span, easeInOut, easeOut, lerp, clamp01, CHAPTERS, useChapter, type ChapterId } from './story';
import { answerTime, flipPerMile, greenTime, heroSpeed, jamTime, MILE, sweepK } from './beats';
import { Fleet, KIND, dimsFor, markUsed, paintFor, useFleet } from './vehicles';
import { Boulevard, NightEnvironment, NoReflect, NO_REFLECT, Skyline, Sky, useGlowTexture, wrap } from './world';

/* ------------------------------------------------------------------ */
/* palette (the site's series colours, pushed past 1.0 where they glow) */
/* ------------------------------------------------------------------ */

const C = {
  blue: new THREE.Color('#3987e5'),
  orange: new THREE.Color('#d95926'),
  aqua: new THREE.Color('#199e70'),
  yellow: new THREE.Color('#e0a000'),
  red: new THREE.Color('#ff3b3b'),
  white: new THREE.Color('#ffffff'),
};

/** The hero car wears the site's blue; the car ahead is plain white. */
const HERO_PAINT = new THREE.Color('#1f6fd6');
const AHEAD_PAINT = new THREE.Color('#e9e9e6');

const glow = (c: THREE.Color, k: number) => c.clone().multiplyScalar(k);

const LANE_W = 3.5;
const FWD = [LANE_W * 0.5, LANE_W * 1.5, LANE_W * 2.5];
const BACK = [-LANE_W * 0.5, -LANE_W * 1.5, -LANE_W * 2.5];
const HERO_LANE = FWD[0];
const MAX_CARS = 520;

/* ------------------------------------------------------------------ */
/* small deterministic helpers                                         */
/* ------------------------------------------------------------------ */

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};


/** Ambient-traffic vehicle class for car j, sampled from the real fleet mix. */
const fleetPick = (j: number) => {
  let r = hash(j * 3.7);
  for (const v of VEHICLE_CLASSES) {
    if (r < v.share) return v;
    r -= v.share;
  }
  return VEHICLE_CLASSES[0];
};

/* ------------------------------------------------------------------ */
/* one car, as the frame loop describes it                             */
/* ------------------------------------------------------------------ */

interface CarDraw {
  kind: number;
  x: number; // front bumper
  z: number;
  dir: 1 | -1;
  len: number;
  wid: number;
  hgt: number;
  paint: THREE.Color;
  repaint: boolean;
  tail: number; // taillight brightness
  head: number; // headlight brightness
}

/* ------------------------------------------------------------------ */
/* everything the frame loop needs to know                             */
/* ------------------------------------------------------------------ */

export interface SceneData {
  params: TrafficParams;
  brake: BrakeRun;
  queue: QueueRun;
}

/** Shared per-frame state, written by the Director and read by the props. */
interface Frame {
  id: ChapterId;
  p: number;
  /** seconds of model time, for the scrubbed chapters */
  t: number;
  /** speed of the hero car, m/s */
  heroV: number;
  /** current state on the fundamental diagram (veh/m) */
  k: number;
  /** how far the world has rolled past the hero, m */
  odo: number;
  /** transition flash, 0..1 */
  flash: number;
  /** last time a car crossed the counting gate / stop line */
  gateHit: number;
}

const frame: Frame = { id: 'intro', p: 0, t: 0, heroV: 0, k: 0, odo: 0, flash: 0, gateHit: -10 };

/* ------------------------------------------------------------------ */
/* hologram geometry — the fundamental diagram standing beside the road */
/* ------------------------------------------------------------------ */

const HOLO = { x0: -110, x1: 110, y0: 6, y1: 72, z: -42 };

function holoXY(k: number, q: number, fdKj: number, qTop: number): [number, number] {
  return [lerp(HOLO.x0, HOLO.x1, k / fdKj), lerp(HOLO.y0, HOLO.y1, q / qTop)];
}

/* ------------------------------------------------------------------ */
/* camera                                                              */
/* ------------------------------------------------------------------ */

type Pose = { pos: [number, number, number]; look: [number, number, number] };

function poseFor(id: ChapterId, p: number, d: SceneData): Pose {
  const { params, brake } = d;
  const Lc = meanVehicleLength();
  switch (id) {
    case 'intro': {
      const e = easeInOut(p);
      return { pos: [lerp(-150, -60, e), lerp(60, 14, e), lerp(120, 48, e)], look: [lerp(60, 40, e), 0, 0] };
    }
    case 'own': {
      const a = lerp(-0.5, 0.45, easeInOut(p));
      const cx = -Lc + params.L / 2;
      return { pos: [cx + Math.sin(a) * 15, lerp(5.5, 3.6, p), HERO_LANE + Math.cos(a) * 15], look: [cx, 0.9, HERO_LANE] };
    }
    case 'gap': {
      const s = spacingAt(frame.heroV, params);
      const cx = -Lc + s / 2;
      return { pos: [cx - 7, 5 + s * 0.28, HERO_LANE + 15 + s * 0.62], look: [cx, 0.8, HERO_LANE] };
    }
    case 'flip': {
      const e = easeInOut(p);
      return { pos: [lerp(-1010, -940, e), lerp(70, 34, e), lerp(70, 34, e)], look: [lerp(200, 400, e), 0, HERO_LANE] };
    }
    case 'flow':
      return { pos: [lerp(-40, 10, p), 48, 178], look: [0, 30, -12] };
    case 'triangle':
      return { pos: [lerp(10, 40, p), lerp(48, 44, p), lerp(178, 128, easeInOut(p))], look: [lerp(0, 8, p), 36, -38] };
    case 'slope':
      return { pos: [lerp(40, -25, easeInOut(p)), 42, lerp(128, 118, p)], look: [0, 34, -40] };
    case 'jam': {
      const xw = waveFront(brake, params, frame.t);
      const lookX = lerp(brake.stopX - 30, xw - 10, 0.7);
      return { pos: [lookX - 48, 30, 78], look: [lookX, 0, 2] };
    }
    case 'answer': {
      const xw = waveFront(brake, params, frame.t);
      const e = easeInOut(p);
      return { pos: [lerp(xw - 60, xw - 20, e), lerp(60, 300, e), lerp(120, 260, e)], look: [xw + 20, 0, 0] };
    }
    case 'green': {
      const e = easeInOut(span(p, 0.1, 1));
      return { pos: [lerp(-78, -38, e), lerp(11, 42, e), lerp(30, 78, e)], look: [lerp(6, 4, e), lerp(4, 0, e), 5] };
    }
    case 'outro': {
      const e = easeInOut(p);
      return { pos: [lerp(-140, -420, e), lerp(60, 420, e), lerp(170, 520, e)], look: [lerp(30, 120, e), 0, 0] };
    }
  }
}

/** Where the back edge of the stopped queue is at time t. */
function waveFront(brake: BrakeRun, params: TrafficParams, t: number) {
  const w = params.L / params.tau;
  return brake.stopX - w * Math.max(0, t - brake.stopAt);
}

/** Where the cars at the front of the queue start moving again. */
function releaseFront(brake: BrakeRun, params: TrafficParams, t: number) {
  const w = params.L / params.tau;
  return brake.stopX - w * Math.max(0, t - brake.stopAt - brake.hold);
}

const fundamentalDiagramSpeed = (k: number, p: TrafficParams) => fdSpeedAt(Math.max(k, 1e-4), p);

const _a = new THREE.Vector3();
const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _b = new THREE.Vector3();

/* ------------------------------------------------------------------ */
/* Director: turns story position into frame state + camera            */
/* ------------------------------------------------------------------ */

/** Chapters where a text card sits on the left of the screen. */
const CARD_CHAPTERS: ChapterId[] = ['own', 'gap', 'flip', 'flow', 'triangle', 'slope', 'jam', 'green'];

function Director({ data }: { data: SceneData }) {
  const { camera, size } = useThree();
  const look = useRef(new THREE.Vector3());
  useLayoutEffect(() => {
    camera.layers.enable(NO_REFLECT);
  }, [camera]);
  const shift = useRef(0);

  useFrame((_, dt) => {
    const { index, p, id } = split(story.current);
    const { params, brake, queue } = data;
    const step = Math.min(dt, 0.05);

    frame.id = id;
    frame.p = p;

    // chapter-specific model state
    if (id === 'gap') frame.heroV = heroSpeed(p, params);
    else if (id === 'own') frame.heroV = 0;
    if (id === 'gap') frame.odo += frame.heroV * step;

    if (id === 'flow' || id === 'triangle' || id === 'slope') {
      frame.k = sweepK(id, p, params);
      frame.odo += fundamentalDiagramSpeed(frame.k, params) * step;
    }

    if (id === 'jam') frame.t = jamTime(p, brake);
    else if (id === 'answer') frame.t = answerTime(p, brake);
    else if (id === 'green') frame.t = greenTime(p, queue);

    // a flash on every chapter boundary hides the change of set
    const atCut = (index > 0 && p < 0.5) || (index < CHAPTERS.length - 1 && p >= 0.5);
    const edge = atCut ? Math.min(p, 1 - p) : 1;
    frame.flash = Math.max(0, 1 - edge / 0.035);

    // camera: ease in from the previous chapter's closing shot
    const pose = poseFor(id, p, data);
    const blend = index > 0 ? easeOut(span(p, 0, 0.22)) : 1;
    _a.set(...pose.pos);
    _b.set(...pose.look);
    if (blend < 1) {
      const prev = poseFor(CHAPTERS[index - 1].id, 1, data);
      _a.lerpVectors(_pa.set(...prev.pos), _a, blend);
      _b.lerpVectors(_pb.set(...prev.look), _b, blend);
    }
    // a slow drift so the frame never sits dead still
    const sway = Math.sin(story.clock * 0.35) * 0.6;
    const follow = story.snap ? 1 : 1 - Math.exp(-step * 10);
    camera.position.lerp(_a.setY(_a.y + sway), follow);
    look.current.lerp(_b, follow);
    camera.lookAt(look.current);

    // lens shift: on wide screens, frame the action to the right of the card
    const want = size.width > 760 && CARD_CHAPTERS.includes(id) ? 1 : 0;
    shift.current = story.snap ? want : lerp(shift.current, want, 1 - Math.exp(-step * 4));
    const cam = camera as THREE.PerspectiveCamera;
    if (shift.current > 0.001) {
      cam.setViewOffset(size.width, size.height, -shift.current * size.width * 0.17, 0, size.width, size.height);
    } else if (cam.view) {
      cam.clearViewOffset();
    }
  });

  return null;
}

/* ------------------------------------------------------------------ */
/* Cars                                                                */
/* ------------------------------------------------------------------ */

/** Models the maths chapters draw from: ordinary commuter cars. */
const COMMUTERS = [KIND.sedan, KIND['hatchback-sports'], KIND.suv, KIND['sedan-sports'], KIND['suv-luxury'], KIND.taxi, KIND.sedan, KIND.suv];

/** A model for an ambient vehicle, from the real downtown fleet mix. */
function modelFor(seed: number) {
  const cls = fleetPick(seed);
  const r = hash(seed * 5.3);
  switch (cls.id) {
    case 'suv':
      return r < 0.5 ? KIND.suv : KIND['suv-luxury'];
    case 'van':
      return KIND.van;
    case 'pickup':
      return KIND.truck;
    case 'bus':
    case 'box':
    case 'semi':
      return KIND.delivery;
    default:
      return r < 0.06 ? KIND.taxi : r < 0.08 ? KIND.police : r < 0.55 ? KIND.sedan : r < 0.8 ? KIND['hatchback-sports'] : KIND['sedan-sports'];
  }
}

const LEN_OF: Record<number, number> = {
  [KIND.delivery]: 7.2,
  [KIND.van]: 5.3,
  [KIND.truck]: 5.8,
  [KIND.suv]: 4.9,
  [KIND['suv-luxury']]: 5.0,
};

const NO_REFLECT_LAYERS = (() => {
  const l = new THREE.Layers();
  l.set(NO_REFLECT);
  return l;
})();

const _lightMeshes: Array<[THREE.InstancedMesh, number]> = [];
function LIGHT_MESHES(T: THREE.InstancedMesh, H: THREE.InstancedMesh, P: THREE.InstancedMesh, n: number, pools: number) {
  _lightMeshes.length = 0;
  _lightMeshes.push([T, n], [H, n], [P, pools]);
  return _lightMeshes;
}

function Cars({ data }: { data: SceneData }) {
  const fleet = useFleet();
  const tails = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const pools = useRef<THREE.InstancedMesh>(null);
  const glowTex = useGlowTexture();
  const m = useMemo(() => new THREE.Object3D(), []);
  const tmp = useMemo(() => new THREE.Color(), []);
  const list = useMemo<CarDraw[]>(
    () =>
      Array.from({ length: MAX_CARS }, () => ({
        kind: 0,
        x: 0,
        z: 0,
        dir: 1 as 1 | -1,
        len: 4.8,
        wid: 1.9,
        hgt: 1.5,
        paint: new THREE.Color(),
        repaint: true,
        tail: 1,
        head: 1,
      })),
    [],
  );
  const state = useRef({ n: 0 });

  useFrame(() => {
    const { id, p, t } = frame;
    const { params, brake, queue } = data;
    const Lc = meanVehicleLength();
    const clock = story.clock;
    state.current.n = 0;

    const push = (seed: number, kind: number, x: number, z: number, dir: 1 | -1, len: number, tail: number, head: number, paint?: THREE.Color) => {
      const s = state.current;
      if (s.n >= MAX_CARS) return;
      const c = list[s.n++];
      const d = dimsFor(fleet, kind, len);
      c.kind = kind;
      c.x = x;
      c.z = z;
      c.dir = dir;
      c.len = len;
      c.wid = d.wid;
      c.hgt = d.hgt;
      if (paint) {
        c.paint.copy(paint);
        c.repaint = true;
      } else c.repaint = paintFor(seed, c.paint);
      c.tail = tail;
      c.head = head;
    };

    // ---- ambient traffic: the opposite carriageway, and full roads for the bookends
    const ambient = (lanes: number[], dir: 1 | -1, v: number, gap: number, span0: number, roll = 0) => {
      lanes.forEach((z, li) => {
        const count = Math.floor((span0 * 2) / gap);
        for (let j = 0; j < count; j++) {
          const seed = li * 1000 + j + (dir < 0 ? 5000 : 0);
          const kind = modelFor(seed);
          const base = j * gap + hash(seed) * gap * 0.6;
          const x = wrap(base + dir * v * clock * (0.9 + 0.2 * hash(seed + 7)) - roll, -span0, span0);
          push(seed, kind, x, z, dir, LEN_OF[kind] ?? 4.7, 1.2, 1.4);
        }
      });
    };

    // a car in the maths chapters: a commuter car, numbered n along its lane
    const lead = (n: number, x: number, z: number, tail = 1.2) => {
      const seed = n * 13 + Math.round(z * 10);
      const kind = COMMUTERS[Math.floor(hash(seed * 1.3) * COMMUTERS.length)];
      push(seed, kind, x, z, 1, 4.7, tail, 1.2);
    };

    switch (id) {
      case 'intro':
      case 'outro': {
        ambient(FWD, 1, 15, 30, 900);
        ambient(BACK, -1, 15, 28, 900);
        break;
      }
      case 'own':
      case 'gap': {
        const v = frame.heroV;
        const s = spacingAt(v, params);
        const tail = v > 0.1 ? 1.2 : 3.4;
        // hero: the average vehicle, front bumper at x = 0, in the site's blue
        push(1, KIND.sedan, 0, HERO_LANE, 1, Lc, tail, 1.6, HERO_PAINT);
        // the car ahead, exactly one spacing in front
        push(2, KIND.suv, s, HERO_LANE, 1, Lc, tail, 1.2, AHEAD_PAINT);
        // the queue behind, on the same rule
        for (let n = 1; n < 6; n++) lead(n, -n * s, HERO_LANE, tail);
        ambient(BACK, -1, 14, 40, 500, frame.odo);
        break;
      }
      case 'flip': {
        const kMile = flipPerMile(p, params);
        const s = MILE / kMile;
        const v = Math.min(params.vf, Math.max(0, (s - params.L) / params.tau));
        const off = wrap(v * clock, 0, s);
        const first = Math.floor((v * clock) / s);
        let n = 0;
        for (let x = -900 + off; x < 900; x += s) lead(first - n++, x, HERO_LANE, v < 0.5 ? 3.4 : 1.4);
        break;
      }
      case 'flow':
      case 'triangle':
      case 'slope': {
        const k = Math.max(frame.k, 1e-4);
        const s = 1 / k;
        const v = fdSpeedAt(k, params);
        const off = wrap(frame.odo, 0, s);
        const first = Math.floor(frame.odo / s);
        let hit = false;
        let n = 0;
        for (let x = -260 + off; x < 260; x += s) {
          lead(first - n++, x, HERO_LANE, v < 0.5 ? 3.4 : 1.2);
          if (x >= 0 && x < Math.max(v * 0.12, 0.4) && v > 0.3) hit = true;
        }
        if (hit) frame.gateHit = clock;
        break;
      }
      case 'jam':
      case 'answer': {
        for (let n = 0; n < brake.x.length; n++) {
          const x = posAt(brake, n, t);
          if (x < -700 || x > 420) continue;
          const v = speedAt(brake, n, t);
          const a = accelAt(brake, n, t);
          lead(n, x, HERO_LANE, a < -0.4 || v < 0.3 ? 5.5 : 1.2);
        }
        // the cars in front of the first driver just carry on
        for (let j = 1; j < 12; j++) {
          const x = posAt(brake, 0, 0) + j * 40 + brake.v0 * t;
          if (x < 420) lead(-j, x, HERO_LANE);
        }
        ambient(BACK, -1, 15, 36, 700);
        break;
      }
      case 'green': {
        for (const z of FWD) {
          for (let n = 0; n < queue.x.length; n++) {
            const x = posAt(queue, n, Math.max(t, 0));
            if (x > 400) continue;
            const v = t > 0 ? speedAt(queue, n, t) : 0;
            const a = t > 0 ? accelAt(queue, n, t) : 0;
            lead(n, x, z, v < 0.3 || a < -0.4 ? 4.2 : 1.2);
            if (z === FWD[0] && t > 0 && x >= 0 && x < Math.max(v * 0.1, 0.3) && t <= queue.green) frame.gateHit = clock;
          }
        }
        ambient(BACK, -1, 13, 34, 600);
        break;
      }
    }

    // ---- lights: tail and head bars on every car, and the pools they throw on the road
    const T = tails.current!;
    const H = heads.current!;
    const P = pools.current!;
    const n = state.current.n;
    const far = id === 'flip' ? 2 : 1;
    let pi = 0;
    for (let i = 0; i < n; i++) {
      const c = list[i];
      const rearX = c.x - c.dir * c.len;
      const rot = c.dir === 1 ? 0 : Math.PI;

      m.rotation.set(0, rot, 0);
      m.position.set(rearX - c.dir * 0.04, c.hgt * 0.5, c.z);
      m.scale.set(0.06 * far, 0.13 * far, c.wid * 0.86);
      m.updateMatrix();
      T.setMatrixAt(i, m.matrix);
      T.setColorAt(i, tmp.copy(C.red).multiplyScalar(c.tail * 2.2));

      m.position.set(c.x + c.dir * 0.04, c.hgt * 0.42, c.z);
      m.scale.set(0.06 * far, 0.11 * far, c.wid * 0.8);
      m.updateMatrix();
      H.setMatrixAt(i, m.matrix);
      H.setColorAt(i, tmp.setRGB(1, 0.94, 0.82).multiplyScalar(c.head * 3));

      // headlight pool ahead, brake glow behind
      m.rotation.set(-Math.PI / 2, 0, 0);
      m.position.set(c.x + c.dir * 7.5, 0.04, c.z);
      m.scale.set(15, c.wid * 2.4, 1);
      m.updateMatrix();
      P.setMatrixAt(pi, m.matrix);
      P.setColorAt(pi++, tmp.setRGB(1, 0.86, 0.66).multiplyScalar(0.22 * c.head));
      m.position.set(rearX - c.dir * 2.2, 0.045, c.z);
      m.scale.set(6, c.wid * 2.2, 1);
      m.updateMatrix();
      P.setMatrixAt(pi, m.matrix);
      P.setColorAt(pi++, tmp.copy(C.red).multiplyScalar(0.16 * c.tail));
    }
    T.count = n;
    H.count = n;
    P.count = pi;
    for (const [mesh, used] of LIGHT_MESHES(T, H, P, n, pi)) {
      markUsed(mesh.instanceMatrix, used * 16);
      if (mesh.instanceColor) markUsed(mesh.instanceColor, used * 3);
    }
  });

  return (
    <group>
      <Fleet fleet={fleet} max={MAX_CARS} getCars={() => ({ list, n: state.current.n })} />
      <instancedMesh ref={tails} args={[undefined, undefined, MAX_CARS]} frustumCulled={false}>
        <boxGeometry />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, MAX_CARS]} frustumCulled={false}>
        <boxGeometry />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={pools} args={[undefined, undefined, MAX_CARS * 2]} frustumCulled={false} layers={NO_REFLECT_LAYERS}>
        <planeGeometry />
        <meshBasicMaterial map={glowTex} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Glowing bars — rulers, gates and the hologram are all built from these */
/* ------------------------------------------------------------------ */

function useBar() {
  return useRef<THREE.Mesh>(null);
}

/** Place a thin glowing box between two points in the x-y plane at depth z. */
function setBar(
  mesh: THREE.Mesh | null,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  z: number,
  thick: number,
  visible: boolean,
) {
  if (!mesh) return;
  mesh.visible = visible;
  if (!visible) return;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.max(Math.hypot(dx, dy), 1e-4);
  mesh.position.set((ax + bx) / 2, (ay + by) / 2, z);
  mesh.rotation.set(0, 0, Math.atan2(dy, dx));
  mesh.scale.set(len, thick, thick);
}

function Bar({ refObj, color }: { refObj: React.RefObject<THREE.Mesh | null>; color: THREE.Color }) {
  return (
    <mesh ref={refObj} visible={false}>
      <boxGeometry />
      <meshBasicMaterial color={color} toneMapped={false} transparent />
    </mesh>
  );
}

/** Show/hide and fade an <Html> label from inside the frame loop. */
const labelState = new WeakMap<HTMLDivElement, { o: number; t: string }>();

function setLabel(el: HTMLDivElement | null, opacity: number, text?: string) {
  if (!el) return;
  // write to the DOM only when something changed: every style write costs a style recalc
  const o = Math.round(clamp01(opacity) * 100) / 100;
  const last = labelState.get(el) ?? { o: -1, t: '' };
  if (o !== last.o) {
    el.style.opacity = String(o);
    el.style.visibility = o > 0 ? 'visible' : 'hidden';
    last.o = o;
  }
  if (text !== undefined && text !== last.t) {
    el.textContent = text;
    last.t = text;
  }
  labelState.set(el, last);
}

/**
 * A text label pinned to a point in the scene. It only exists while one of its
 * chapters is on screen; a mounted label is re-projected every frame even when
 * invisible, so the other chapters' labels would be pure cost.
 */
function Label({ on, children }: { on: ChapterId[]; children: React.ReactNode }) {
  const id = useChapter();
  if (!on.includes(id)) return null;
  return (
    <Html center zIndexRange={[5, 0]}>
      {children}
    </Html>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter props                                                       */
/* ------------------------------------------------------------------ */

/** Steps 1-2: the measuring tape over the hero car. */
function Ruler({ data }: { data: SceneData }) {
  const body = useBar();
  const gap = useBar();
  const vt = useBar();
  const ticks = [useBar(), useBar(), useBar(), useBar()];
  const lb = useRef<HTMLDivElement>(null);
  const lg = useRef<HTMLDivElement>(null);
  const lv = useRef<HTMLDivElement>(null);
  const ls = useRef<HTMLDivElement>(null);
  const gBody = useRef<THREE.Group>(null);
  const gLabB = useRef<THREE.Group>(null);
  const gLabG = useRef<THREE.Group>(null);
  const gLabV = useRef<THREE.Group>(null);
  const gLabS = useRef<THREE.Group>(null);

  useFrame(() => {
    const { id, p, heroV } = frame;
    const on = id === 'own' || id === 'gap';
    const { params } = data;
    const Lc = meanVehicleLength();
    const y = 3.4;
    const z = HERO_LANE;
    const s = spacingAt(heroV, params);
    const rear = -Lc;
    const gapEnd = rear + params.L;
    const end = rear + s;

    const showBody = on && (id === 'gap' || p > 0.12);
    const showGap = on && (id === 'gap' || p > 0.36);
    const showL = on && (id === 'gap' || p > 0.6);
    const growB = id === 'gap' ? 1 : easeOut(span(p, 0.12, 0.3));
    const growG = id === 'gap' ? 1 : easeOut(span(p, 0.36, 0.52));

    setBar(body.current, rear, y, lerp(rear, 0, growB), y, z, 0.16, showBody);
    setBar(gap.current, 0, y, lerp(0, gapEnd, growG), y, z, 0.16, showGap);
    setBar(vt.current, gapEnd, y + 0.0, end, y, z, 0.2, id === 'gap' && s - params.L > 0.05);
    const tickX = [rear, 0, gapEnd, end];
    ticks.forEach((t, i) =>
      setBar(t.current, tickX[i], y - 0.55, tickX[i], y + 0.55, z, 0.09, on && (i === 0 ? showBody : i === 1 ? showBody : i === 2 ? showGap : id === 'gap' && s - params.L > 0.3)),
    );

    gLabB.current?.position.set((rear + 0) / 2, y + 1.1, z);
    gLabG.current?.position.set((0 + gapEnd) / 2, y + 1.1, z);
    gLabV.current?.position.set((gapEnd + end) / 2, y + 1.1, z);
    gLabS.current?.position.set((rear + Math.max(end, gapEnd)) / 2, y + 2.5, z);

    const mph = heroV * 2.236936;
    setLabel(lb.current, showBody ? 1 : 0, `car ${(Lc * 3.28084).toFixed(1)} ft`);
    setLabel(lg.current, showGap ? 1 : 0, `gap ${((params.L - Lc) * 3.28084).toFixed(1)} ft`);
    setLabel(lv.current, id === 'gap' && s - params.L > 0.6 ? 1 : 0, `v·τ = ${((s - params.L) * 3.28084).toFixed(1)} ft`);
    setLabel(
      ls.current,
      showL ? 1 : 0,
      id === 'gap' ? `s = ${(s * 3.28084).toFixed(1)} ft  at ${mph.toFixed(0)} mph` : `L = ${(params.L * 3.28084).toFixed(1)} ft`,
    );
    if (gBody.current) gBody.current.visible = on;
  });

  return (
    <group ref={gBody}>
      <Bar refObj={body} color={glow(C.white, 2.2)} />
      <Bar refObj={gap} color={glow(C.yellow, 3)} />
      <Bar refObj={vt} color={glow(C.blue, 3.4)} />
      {ticks.map((t, i) => (
        <Bar key={i} refObj={t} color={glow(C.white, 2)} />
      ))}
      <group ref={gLabB}>
        <Label on={['own', 'gap']}>
          <div ref={lb} className="p3-label" />
        </Label>
      </group>
      <group ref={gLabG}>
        <Label on={['own', 'gap']}>
          <div ref={lg} className="p3-label p3-yellow" />
        </Label>
      </group>
      <group ref={gLabV}>
        <Label on={['own', 'gap']}>
          <div ref={lv} className="p3-label p3-blue" />
        </Label>
      </group>
      <group ref={gLabS}>
        <Label on={['own', 'gap']}>
          <div ref={ls} className="p3-label p3-big" />
        </Label>
      </group>
    </group>
  );
}

/** Step 3: two glowing gates exactly one mile apart. */
function MileGates() {
  const a = useRef<THREE.Group>(null);
  const la = useRef<HTMLDivElement>(null);
  useFrame(() => {
    const on = frame.id === 'flip';
    if (a.current) a.current.visible = on;
    setLabel(la.current, on ? span(frame.p, 0.05, 0.2) : 0);
  });
  return (
    <group ref={a} visible={false}>
      {[-MILE / 2, MILE / 2].map((x) => (
        <group key={x} position={[x, 0, HERO_LANE]}>
          <mesh position={[0, 14, 0]}>
            <boxGeometry args={[2.2, 28, 2.2]} />
            <meshBasicMaterial color={glow(C.aqua, 4)} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.1, 0]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[3, 60]} />
            <meshBasicMaterial color={glow(C.aqua, 2.5)} toneMapped={false} transparent opacity={0.8} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.06, HERO_LANE]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[MILE, 14]} />
        <meshBasicMaterial color={glow(C.aqua, 0.5)} toneMapped={false} transparent opacity={0.22} />
      </mesh>
      <group position={[0, 60, HERO_LANE]}>
        <Label on={['flip']}>
          <div ref={la} className="p3-label p3-aqua p3-big">← exactly one mile →</div>
        </Label>
      </group>
    </group>
  );
}

/** Step 4: the counting gate at x = 0. */
function FlowGate() {
  const g = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    const on = frame.id === 'flow' || frame.id === 'triangle' || frame.id === 'slope';
    if (g.current) g.current.visible = on;
    const since = story.clock - frame.gateHit;
    if (mat.current) mat.current.color.copy(C.aqua).multiplyScalar(1.4 + 6 * Math.exp(-since * 7));
  });
  return (
    <group ref={g} visible={false} position={[0, 0, HERO_LANE]}>
      {[-2.6, 2.6].map((z) => (
        <mesh key={z} position={[0, 4, z]}>
          <boxGeometry args={[0.3, 8, 0.3]} />
          <meshBasicMaterial ref={z < 0 ? mat : undefined} color={glow(C.aqua, 2)} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, 8, 0]}>
        <boxGeometry args={[0.3, 0.3, 5.5]} />
        <meshBasicMaterial color={glow(C.aqua, 2.5)} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.04, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.5, 5.2]} />
        <meshBasicMaterial color={glow(C.aqua, 3)} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Steps 4-6: the fundamental diagram, built in light above the road. */
function Hologram({ data }: { data: SceneData }) {
  const g = useRef<THREE.Group>(null);
  const axisX = useBar();
  const axisY = useBar();
  const free = useBar();
  const cong = useBar();
  const freeGhost = useBar();
  const congGhost = useBar();
  const ray = useBar();
  const drop = useBar();
  const dot = useRef<THREE.Mesh>(null);
  const peak = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const lk = useRef<HTMLDivElement>(null);
  const lq = useRef<HTMLDivElement>(null);
  const lp = useRef<HTMLDivElement>(null);
  const lf = useRef<HTMLDivElement>(null);
  const lc = useRef<HTMLDivElement>(null);
  const gPeak = useRef<THREE.Group>(null);
  const gFree = useRef<THREE.Group>(null);
  const gCong = useRef<THREE.Group>(null);

  useFrame(() => {
    const { id, p, k } = frame;
    const on = id === 'flow' || id === 'triangle' || id === 'slope';
    if (g.current) g.current.visible = on;
    if (!on) {
      for (const l of [lk, lq, lp, lf, lc]) setLabel(l.current, 0);
      return;
    }

    const { params } = data;
    const fd = fundamentalDiagram(params);
    const qTop = fd.qmax * 1.18;
    const z = HOLO.z;
    const [ox, oy] = holoXY(0, 0, fd.kj, qTop);
    const [px, py] = holoXY(fd.kc, fd.qmax, fd.kj, qTop);
    const [jx, jy] = holoXY(fd.kj, 0, fd.kj, qTop);
    const q = k <= fd.kc ? params.vf * k : fd.w * (fd.kj - k);
    const [dx, dy] = holoXY(k, q, fd.kj, qTop);

    setBar(axisX.current, ox - 4, oy, HOLO.x1 + 8, oy, z, 0.35, true);
    setBar(axisY.current, ox, oy, ox, HOLO.y1 + 6, z, 0.35, true);

    // the trace: in step 4 it is drawn by the moving dot
    const traced = id === 'flow' ? k : fd.kj;
    const fk = Math.min(traced, fd.kc);
    const [fx, fy] = holoXY(fk, params.vf * fk, fd.kj, qTop);
    setBar(free.current, ox, oy, fx, fy, z, 0.7, traced > 0);
    const ck = Math.max(traced, fd.kc);
    const [cx, cy] = holoXY(ck, fd.w * (fd.kj - ck), fd.kj, qTop);
    setBar(cong.current, px, py, cx, cy, z, 0.7, traced > fd.kc);

    // step 5: each leg extended as a full straight line, to show they are lines
    const ext = id === 'triangle' ? easeOut(span(p, 0.15, 0.4)) * (1 - span(p, 0.75, 0.95)) : 0;
    setBar(freeGhost.current, px, py, lerp(px, px + (px - ox) * 0.45, ext), lerp(py, py + (py - oy) * 0.45, ext), z, 0.25, ext > 0.01);
    setBar(congGhost.current, px, py, lerp(px, px - (jx - px) * 0.25, ext), lerp(py, py + (py - jy) * 0.25, ext), z, 0.25, ext > 0.01);

    // step 6: the ray from the origin — its slope is the car speed
    const showRay = id === 'slope' && p > 0.1;
    setBar(ray.current, ox, oy, dx, dy, z + 0.4, 0.4, showRay);
    setBar(drop.current, dx, oy, dx, dy, z, 0.18, id !== 'triangle');

    if (dot.current) {
      dot.current.position.set(dx, dy, z + 0.6);
      dot.current.visible = id !== 'triangle';
      const s = 1.8 + Math.sin(story.clock * 6) * 0.3;
      dot.current.scale.setScalar(s);
    }
    const peakOn = id === 'triangle' ? easeOut(span(p, 0.35, 0.5)) : id === 'slope' ? 1 : k >= fd.kc ? 1 : 0;
    if (peak.current) {
      peak.current.position.set(px, py, z + 0.5);
      peak.current.scale.setScalar(peakOn * (2.4 + Math.sin(story.clock * 3) * 0.4));
    }
    if (ring.current) {
      const r = id === 'triangle' ? span(p, 0.38, 0.7) : 0;
      ring.current.position.set(px, py, z + 0.3);
      ring.current.scale.setScalar(1 + r * 40);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = r > 0 && r < 1 ? (1 - r) * 0.9 : 0;
    }

    gPeak.current?.position.set(px, py + 9, z);
    gFree.current?.position.set((ox + px) / 2 - 12, (oy + py) / 2 + 6, z);
    gCong.current?.position.set((px + jx) / 2 + 14, (py + jy) / 2 + 6, z);

    const perMile = 1609.344;
    setLabel(lk.current, 1);
    setLabel(lq.current, 1);
    setLabel(lp.current, peakOn, `capacity ${Math.round(fd.qmax * 3600).toLocaleString()} cars/hr  ·  k_c = ${(fd.kc * perMile).toFixed(0)}/mi`);
    setLabel(lf.current, id === 'flow' ? 0 : 1, `slope = v_f = ${(params.vf * 2.236936).toFixed(0)} mph`);
    setLabel(lc.current, id === 'flow' ? 0 : 1, `slope = −L/τ = −${((params.L / params.tau) * 2.236936).toFixed(1)} mph`);
  });

  return (
    <group ref={g} visible={false}>
      <Bar refObj={axisX} color={glow(C.white, 0.9)} />
      <Bar refObj={axisY} color={glow(C.white, 0.9)} />
      <Bar refObj={free} color={glow(C.blue, 4)} />
      <Bar refObj={cong} color={glow(C.orange, 4)} />
      <Bar refObj={freeGhost} color={glow(C.blue, 1.6)} />
      <Bar refObj={congGhost} color={glow(C.orange, 1.6)} />
      <Bar refObj={ray} color={glow(C.white, 3)} />
      <Bar refObj={drop} color={glow(C.white, 0.8)} />
      <mesh ref={dot}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshBasicMaterial color={glow(C.aqua, 6)} toneMapped={false} />
      </mesh>
      <mesh ref={peak}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshBasicMaterial color={glow(C.yellow, 6)} toneMapped={false} />
      </mesh>
      <mesh ref={ring}>
        <ringGeometry args={[0.9, 1, 64]} />
        <meshBasicMaterial color={glow(C.yellow, 4)} toneMapped={false} transparent side={THREE.DoubleSide} />
      </mesh>
      <group position={[HOLO.x1 + 4, HOLO.y0 - 7, HOLO.z]}>
        <Label on={['flow', 'triangle', 'slope']}>
          <div ref={lk} className="p3-label">density k →</div>
        </Label>
      </group>
      <group position={[HOLO.x0 - 2, HOLO.y1 + 10, HOLO.z]}>
        <Label on={['flow', 'triangle', 'slope']}>
          <div ref={lq} className="p3-label">↑ flow q</div>
        </Label>
      </group>
      <group ref={gPeak}>
        <Label on={['flow', 'triangle', 'slope']}>
          <div ref={lp} className="p3-label p3-yellow p3-big" />
        </Label>
      </group>
      <group ref={gFree}>
        <Label on={['flow', 'triangle', 'slope']}>
          <div ref={lf} className="p3-label p3-blue" />
        </Label>
      </group>
      <group ref={gCong}>
        <Label on={['flow', 'triangle', 'slope']}>
          <div ref={lc} className="p3-label p3-orange" />
        </Label>
      </group>
    </group>
  );
}

/** Steps 7-8: the stopped region on the road, and the wall of the wave. */
function Wave({ data }: { data: SceneData }) {
  const g = useRef<THREE.Group>(null);
  const band = useRef<THREE.Mesh>(null);
  const wall = useRef<THREE.Mesh>(null);
  const wall2 = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const lw = useRef<HTMLDivElement>(null);
  const gL = useRef<THREE.Group>(null);

  useFrame(() => {
    const { id, t, p } = frame;
    const on = id === 'jam' || id === 'answer';
    if (g.current) g.current.visible = on;
    if (!on) {
      setLabel(lw.current, 0);
      return;
    }
    const { brake, params } = data;
    const started = t > brake.stopAt;
    const xw = waveFront(brake, params, t);
    const xr = Math.min(releaseFront(brake, params, t), brake.stopX);
    const from = xw;
    const to = t > brake.stopAt + brake.hold ? xr : brake.stopX;

    if (band.current) {
      band.current.visible = started && to - from > 0.5;
      band.current.position.set((from + to) / 2, 0.05, HERO_LANE);
      band.current.scale.set(Math.max(to - from, 0.1), 1, 1);
    }
    const pulse = 0.75 + Math.sin(story.clock * 5) * 0.25;
    if (wall.current) {
      wall.current.visible = started;
      wall.current.position.set(xw - 3, 9, HERO_LANE);
      (wall.current.material as THREE.MeshBasicMaterial).opacity = 0.55 * pulse;
    }
    if (wall2.current) {
      wall2.current.visible = t > brake.stopAt + brake.hold;
      wall2.current.position.set(xr - 3, 9, HERO_LANE);
    }
    if (ring.current) {
      const r = id === 'answer' ? (p * 3) % 1 : 0;
      ring.current.visible = id === 'answer';
      ring.current.position.set(xw, 0.3, HERO_LANE);
      ring.current.scale.setScalar(4 + r * 160);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - r) * 0.85;
    }
    gL.current?.position.set(xw - 3, 22, HERO_LANE);
    setLabel(lw.current, started && id === 'jam' ? 1 : 0, `◀ jam edge · ${((params.L / params.tau) * 2.236936).toFixed(1)} mph backwards`);
  });

  return (
    <group ref={g} visible={false}>
      <mesh ref={band} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1, LANE_W * 1.2]} />
        <meshBasicMaterial color={glow(C.red, 2.2)} toneMapped={false} transparent opacity={0.55} />
      </mesh>
      <mesh ref={wall}>
        <boxGeometry args={[0.6, 18, LANE_W * 1.6]} />
        <meshBasicMaterial color={glow(C.red, 4)} toneMapped={false} transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={wall2}>
        <boxGeometry args={[0.4, 12, LANE_W * 1.4]} />
        <meshBasicMaterial color={glow(C.aqua, 3)} toneMapped={false} transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.96, 1, 96]} />
        <meshBasicMaterial color={glow(C.red, 5)} toneMapped={false} transparent side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <group ref={gL}>
        <Label on={['jam']}>
          <div ref={lw} className="p3-label p3-red p3-big" />
        </Label>
      </group>
    </group>
  );
}

/** Step 9: the stop line and the signal at Wilshire. */
/**
 * Signal lamp colours, made once. (The signal used to carry a real point
 * light; adding a light changes every shader in the scene, so its arrival
 * froze the page for over a second. The glow comes from bloom instead.)
 */
const LAMP = {
  redOn: glow(C.red, 6),
  redOff: new THREE.Color('#2a0a0a'),
  amberOn: glow(C.yellow, 6),
  amberOff: new THREE.Color('#2a1d05'),
  greenOn: new THREE.Color('#2bff8a').multiplyScalar(5),
  greenOff: new THREE.Color('#06200f'),
};

function Signal({ data }: { data: SceneData }) {
  const g = useRef<THREE.Group>(null);
  const red = useRef<THREE.MeshBasicMaterial>(null);
  const amber = useRef<THREE.MeshBasicMaterial>(null);
  const green = useRef<THREE.MeshBasicMaterial>(null);
  const line = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(() => {
    const on = frame.id === 'green';
    if (g.current) g.current.visible = on;
    if (!on) return;
    const t = frame.t;
    const G = data.queue.green;
    const state = t < 0 ? 'red' : t <= G ? 'green' : t <= G + 3 ? 'amber' : 'red';
    red.current?.color.copy(state === 'red' ? LAMP.redOn : LAMP.redOff);
    amber.current?.color.copy(state === 'amber' ? LAMP.amberOn : LAMP.amberOff);
    green.current?.color.copy(state === 'green' ? LAMP.greenOn : LAMP.greenOff);
    const since = story.clock - frame.gateHit;
    line.current?.color.copy(C.white).multiplyScalar(1.2 + 5 * Math.exp(-since * 6));
  });

  const W = LANE_W * 3;
  return (
    <group ref={g} visible={false}>
      <mesh position={[0.4, 0.04, W / 2]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.6, W]} />
        <meshBasicMaterial ref={line} color={glow(C.white, 1.5)} toneMapped={false} />
      </mesh>
      <group position={[4, 0, W + 1.5]}>
        <mesh position={[0, 4, 0]}>
          <cylinderGeometry args={[0.18, 0.22, 8, 12]} />
          <meshStandardMaterial color="#30343c" metalness={0.7} roughness={0.4} />
        </mesh>
        <mesh position={[0, 7.8, -W / 2]}>
          <boxGeometry args={[0.25, 0.25, W + 1]} />
          <meshStandardMaterial color="#30343c" metalness={0.7} roughness={0.4} />
        </mesh>
        {[2.2, 5.7, 9.2].map((dz) => (
          <group key={dz} position={[0, 6.6, -dz]}>
            <mesh>
              <boxGeometry args={[0.6, 2.4, 0.8]} />
              <meshStandardMaterial color="#111" />
            </mesh>
            <mesh position={[-0.32, 0.72, 0]}>
              <sphereGeometry args={[0.24, 16, 12]} />
              <meshBasicMaterial ref={dz === 2.2 ? red : undefined} color="#2a0a0a" toneMapped={false} />
            </mesh>
            <mesh position={[-0.32, 0, 0]}>
              <sphereGeometry args={[0.24, 16, 12]} />
              <meshBasicMaterial ref={dz === 2.2 ? amber : undefined} color="#2a1d05" toneMapped={false} />
            </mesh>
            <mesh position={[-0.32, -0.72, 0]}>
              <sphereGeometry args={[0.24, 16, 12]} />
              <meshBasicMaterial ref={dz === 2.2 ? green : undefined} color="#06200f" toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* post-processing: bloom, and a chromatic tear on every chapter cut   */
/* ------------------------------------------------------------------ */

function Post({ high }: { high: boolean }) {
  const ca = useRef<ChromaticAberrationEffect>(null);
  const offset = useMemo(() => new THREE.Vector2(0, 0), []);
  useFrame(() => {
    const f = frame.flash;
    if (ca.current) ca.current.offset.set(f * 0.012, f * 0.004);
  });
  return (
    <EffectComposer multisampling={high ? 4 : 0}>
      <Bloom mipmapBlur intensity={1.1} luminanceThreshold={0.75} luminanceSmoothing={0.25} radius={0.82} />
      <ChromaticAberration ref={ca} offset={offset} blendFunction={BlendFunction.NORMAL} radialModulation={false} modulationOffset={0} />
      <Vignette darkness={0.6} offset={0.3} />
      <Noise opacity={0.045} blendFunction={BlendFunction.OVERLAY} />
    </EffectComposer>
  );
}

/** How far the scenery slides under a camera travelling with the hero car. */
const worldRoll = () => (frame.id === 'gap' ? frame.odo : 0);

function Clock() {
  useFrame((_, dt) => {
    story.clock += Math.min(dt, 0.05);
  });
  return null;
}

/**
 * Compile every shader in the scene as soon as it has loaded — including the
 * props for chapters nobody has reached yet — so no chapter stalls the first
 * time it appears. compileAsync hands the work to the driver's own threads
 * (KHR_parallel_shader_compile) instead of freezing the page while it runs.
 */
function WarmUp() {
  const { gl, scene, camera } = useThree();
  useLayoutEffect(() => {
    let alive = true;
    // compile for where the scene really draws — the post-processing buffer, not
    // the screen — or the shader variants won't match and will recompile later
    const target = new THREE.WebGLRenderTarget(64, 64, { type: THREE.HalfFloatType });

    // make everything drawable: hidden chapter props, empty instanced meshes,
    // and objects outside the opening camera's view
    const restore: Array<() => void> = [];
    const expose = () => {
      scene.traverse((o) => {
        if (!o.visible) {
          o.visible = true;
          restore.push(() => (o.visible = false));
        }
        if (o.frustumCulled) {
          o.frustumCulled = false;
          restore.push(() => (o.frustumCulled = true));
        }
        const im = o as THREE.InstancedMesh;
        if (im.isInstancedMesh && im.count === 0) {
          im.count = 1;
          restore.push(() => (im.count = 0));
        }
      });
    };
    const undo = () => {
      while (restore.length) restore.pop()!();
    };

    const before = gl.getRenderTarget();
    expose();
    gl.setRenderTarget(target);
    // 1) link every program off the main thread
    const ready = gl.compileAsync(scene, camera).catch(() => {});
    gl.setRenderTarget(before);
    undo();

    // 2) then draw everything once, off-screen: the GPU driver finishes preparing a
    //    shader only on its first real draw, and that is the stall we are removing
    void ready.then(() => {
      if (!alive) return;
      const prev = gl.getRenderTarget();
      expose();
      gl.setRenderTarget(target);
      gl.render(scene, camera);
      gl.setRenderTarget(prev);
      undo();
      target.dispose();
    });
    return () => {
      alive = false;
    };
  }, [gl, scene, camera]);
  return null;
}

/**
 * Start at full quality on a capable machine; if the frame rate sags, drop to
 * a lighter tier once (resolution 1x, no mirror pass, no MSAA) and stay there
 * — switching back and forth would itself cause hitches.
 */
function startsHigh() {
  if (typeof window === 'undefined') return true;
  const cores = navigator.hardwareConcurrency ?? 8;
  return window.innerWidth >= 760 && cores > 4 && !new URLSearchParams(window.location.search).has('low');
}

export function ProofScene({ data }: { data: SceneData }) {
  const [high, setHigh] = useState(startsHigh);
  return (
    <Canvas
      dpr={high ? [1, 1.5] : 1}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 42, near: 0.5, far: 6000, position: [-150, 60, 120] }}
    >
      <PerformanceMonitor flipflops={1} onDecline={() => setHigh(false)} />
      <color attach="background" args={['#05060b']} />
      <fog attach="fog" args={['#0b0a12', 220, 2400]} />
      <hemisphereLight args={['#6d86c4', '#1a1210', 0.55]} />
      <directionalLight position={[-200, 300, 200]} intensity={0.45} color="#9db8ff" />
      <Sky />
      <NoReflect>
        <Stars radius={2400} depth={300} count={2500} factor={14} saturation={0} fade speed={0.3} />
      </NoReflect>
      <NightEnvironment />
      <Clock />
      <Director data={data} />
      <Suspense fallback={null}>
        <Boulevard roll={worldRoll} mirror={high} />
        <Skyline roll={worldRoll} />
        <Cars data={data} />
        <NoReflect>
          <Ruler data={data} />
          <MileGates />
          <FlowGate />
          <Hologram data={data} />
        </NoReflect>
        <Wave data={data} />
        <Signal data={data} />
        <WarmUp />
      </Suspense>
      <Post high={high} />
    </Canvas>
  );
}
