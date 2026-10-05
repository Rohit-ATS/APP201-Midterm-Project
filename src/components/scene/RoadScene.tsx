import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import {
  buildRoadCurve,
  buildRoadSurface,
  buildLaneMarkings,
  buildEdgeLines,
  buildVehicleGeometry,
  buildBrakeLightGeometry,
  buildHeadlightGeometry,
  frameAt,
  makeFrame,
} from './roadGeometry';
import { VEHICLE_CLASSES } from '../../data/vehicleMix';
import type { Simulation } from '../../lib/simulation';
import { mpsToMph } from '../../lib/trafficMath';

export type CameraMode = 'corridor' | 'roadside' | 'chase';
export type ColorMode = 'speed' | 'paint';

const LANE_WIDTH = 3.7; // metres — the US standard freeway lane

/* --------------------------------------------------------------------- */
/* Colour                                                                 */
/* --------------------------------------------------------------------- */

/** The same slowness ramp the space-time diagram uses, so the two views agree. */
const SPEED_RAMP = ['#0d366b', '#1c5cab', '#2a78d6', '#3987e5', '#86b6ef', '#cde2fb'].map(
  (h) => new THREE.Color(h),
);

/** Plausible paint colours, for when realism is more useful than the data. */
const PAINT = [
  '#d8d8d6', '#2a2a2c', '#8c8f93', '#b9bcc0', '#1e2a44',
  '#6b1f23', '#2d4a35', '#c9ccd1', '#3a3d42', '#e8e9ea',
].map((h) => new THREE.Color(h));

/* --------------------------------------------------------------------- */
/* The road                                                               */
/* --------------------------------------------------------------------- */

function Road({
  curve,
  length,
  lanes,
}: {
  curve: THREE.CatmullRomCurve3;
  length: number;
  lanes: number;
}) {
  const roadWidth = lanes * LANE_WIDTH + 3.6; // plus shoulders

  const surface = useMemo(() => buildRoadSurface(curve, roadWidth, 800), [curve, roadWidth]);
  const markings = useMemo(
    () => buildLaneMarkings(curve, length, lanes, LANE_WIDTH),
    [curve, length, lanes],
  );
  const edges = useMemo(
    () => buildEdgeLines(curve, length, (lanes * LANE_WIDTH) / 2 + 0.4),
    [curve, length, lanes],
  );

  useEffect(
    () => () => {
      surface.dispose();
      markings.dispose();
      edges.dispose();
    },
    [surface, markings, edges],
  );

  return (
    <group>
      <mesh geometry={surface} receiveShadow={false}>
        <meshStandardMaterial color="#2b2b33" roughness={0.85} metalness={0.06} />
      </mesh>
      <mesh geometry={markings}>
        <meshBasicMaterial color="#b9b7a6" toneMapped={false} />
      </mesh>
      <mesh geometry={edges}>
        <meshBasicMaterial color="#ded9c2" toneMapped={false} />
      </mesh>
    </group>
  );
}

/* --------------------------------------------------------------------- */
/* The traffic                                                            */
/* --------------------------------------------------------------------- */

function Traffic({
  sim,
  curve,
  colorMode,
  onChaseFrame,
  chaseId,
}: {
  sim: Simulation;
  curve: THREE.CatmullRomCurve3;
  colorMode: ColorMode;
  onChaseFrame?: (pos: THREE.Vector3, tangent: THREE.Vector3, speed: number) => void;
  chaseId?: number;
}) {
  const capacity = sim.config.lanes * sim.config.perLane + 8;

  const bodies = useMemo(
    () =>
      VEHICLE_CLASSES.map((cls) => ({
        cls,
        geo: buildVehicleGeometry(cls),
        brake: buildBrakeLightGeometry(cls),
        head: buildHeadlightGeometry(cls),
      })),
    [],
  );

  useEffect(
    () => () => {
      bodies.forEach((b) => {
        b.geo.dispose();
        b.brake.dispose();
        b.head.dispose();
      });
    },
    [bodies],
  );

  const meshRefs = useRef<Array<THREE.InstancedMesh | null>>([]);
  const brakeRefs = useRef<Array<THREE.InstancedMesh | null>>([]);
  const headRefs = useRef<Array<THREE.InstancedMesh | null>>([]);

  const scratch = useMemo(
    () => ({
      frame: makeFrame(),
      matrix: new THREE.Matrix4(),
      quat: new THREE.Quaternion(),
      up: new THREE.Vector3(0, 1, 0),
      scale: new THREE.Vector3(1, 1, 1),
      color: new THREE.Color(),
      prevSpeeds: new Map<number, number>(),
    }),
    [],
  );

  useFrame(() => {
    const counts = new Array(VEHICLE_CLASSES.length).fill(0);
    const { frame, matrix, quat, up, scale, color, prevSpeeds } = scratch;
    const total = sim.config.length;

    for (const veh of sim.vehicles) {
      const ci = VEHICLE_CLASSES.findIndex((c) => c.id === veh.cls.id);
      if (ci < 0) continue;
      const mesh = meshRefs.current[ci];
      const brakeMesh = brakeRefs.current[ci];
      const headMesh = headRefs.current[ci];
      if (!mesh) continue;
      const idx = counts[ci];
      if (idx >= capacity) continue;

      // lane 0 is the rightmost lane
      const lateral = (veh.lane - (sim.config.lanes - 1) / 2) * LANE_WIDTH;
      frameAt(curve, veh.x, total, lateral, frame);

      // face along the road
      const angle = Math.atan2(frame.tangent.x, frame.tangent.z);
      quat.setFromAxisAngle(up, angle);
      matrix.compose(frame.position, quat, scale);
      mesh.setMatrixAt(idx, matrix);

      // colour
      if (colorMode === 'speed') {
        const t = Math.max(0, Math.min(0.999, 1 - veh.v / Math.max(sim.params.vf, 0.1)));
        const slot = SPEED_RAMP[Math.floor(t * SPEED_RAMP.length)];
        color.copy(slot);
      } else {
        color.copy(PAINT[veh.id % PAINT.length]);
      }
      mesh.setColorAt(idx, color);

      // brake lights: on when this vehicle is losing speed
      if (brakeMesh) {
        const prev = prevSpeeds.get(veh.id) ?? veh.v;
        const decel = prev - veh.v;
        prevSpeeds.set(veh.id, veh.v);
        const on = decel > 0.02 || veh.braking > 0;
        brakeMesh.setMatrixAt(idx, matrix);
        color.setRGB(on ? 1 : 0.07, on ? 0.09 : 0.012, on ? 0.07 : 0.012);
        brakeMesh.setColorAt(idx, color);
      }

      if (headMesh) headMesh.setMatrixAt(idx, matrix);

      if (chaseId !== undefined && veh.id === chaseId && onChaseFrame) {
        onChaseFrame(frame.position, frame.tangent, veh.v);
      }

      counts[ci] = idx + 1;
    }

    meshRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      mesh.count = counts[i];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      const bm = brakeRefs.current[i];
      if (bm) {
        bm.count = counts[i];
        bm.instanceMatrix.needsUpdate = true;
        if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
      }
      const hm = headRefs.current[i];
      if (hm) {
        hm.count = counts[i];
        hm.instanceMatrix.needsUpdate = true;
      }
    });
  });

  return (
    <group>
      {bodies.map((b, i) => (
        <group key={b.cls.id}>
          <instancedMesh
            ref={(el) => {
              meshRefs.current[i] = el;
            }}
            args={[b.geo, undefined, capacity]}
            frustumCulled={false}
          >
            <meshStandardMaterial
              roughness={0.42}
              metalness={0.35}
              vertexColors={false}
              toneMapped={false}
            />
          </instancedMesh>
          <instancedMesh
            ref={(el) => {
              brakeRefs.current[i] = el;
            }}
            args={[b.brake, undefined, capacity]}
            frustumCulled={false}
          >
            <meshBasicMaterial toneMapped={false} />
          </instancedMesh>
          <instancedMesh
            ref={(el) => {
              headRefs.current[i] = el;
            }}
            args={[b.head, undefined, capacity]}
            frustumCulled={false}
          >
            <meshBasicMaterial color="#fff3d0" toneMapped={false} />
          </instancedMesh>
        </group>
      ))}
    </group>
  );
}

/* --------------------------------------------------------------------- */
/* Surroundings                                                           */
/* --------------------------------------------------------------------- */

function Surroundings({ radius }: { radius: number }) {
  // Low ridges standing in for the Santa Monica Mountains on either side of
  // the pass. Deliberately abstract: this is a diagram, not a map.
  const ridges = useMemo(() => {
    const out: Array<{ pos: [number, number, number]; scale: [number, number, number]; rot: number }> = [];
    let seed = 9;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 46; i++) {
      const a = rnd() * Math.PI * 2;
      const d = radius * (1.25 + rnd() * 1.1);
      out.push({
        pos: [Math.cos(a) * d, 0, Math.sin(a) * d],
        scale: [90 + rnd() * 240, 30 + rnd() * 120, 90 + rnd() * 240],
        rot: rnd() * Math.PI,
      });
    }
    return out;
  }, [radius]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}>
        <circleGeometry args={[radius * 4, 64]} />
        <meshStandardMaterial color="#0a0a0b" roughness={1} />
      </mesh>
      {ridges.map((r, i) => (
        <mesh key={i} position={r.pos} rotation={[0, r.rot, 0]}>
          <coneGeometry args={[r.scale[0] * 0.5, r.scale[1], 4]} />
          <meshStandardMaterial color="#111114" roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  );
}

/* --------------------------------------------------------------------- */
/* Camera                                                                 */
/* --------------------------------------------------------------------- */

/**
 * Anchor point on the road that the non-chase cameras look at. Using a point
 * ON the curve rather than the world origin is what makes individual vehicles
 * visible: framing the whole 2.5-mile loop renders every car sub-pixel.
 */
const ANCHOR_S = 0.5;

interface OrbitLike {
  target: THREE.Vector3;
  update: () => void;
}

function CameraRig({
  mode,
  curve,
  length,
  chase,
}: {
  mode: CameraMode;
  curve: THREE.CatmullRomCurve3;
  length: number;
  chase: React.MutableRefObject<{ pos: THREE.Vector3; tan: THREE.Vector3 } | null>;
}) {
  const camera = useThree((s) => s.camera);
  // OrbitControls registers itself here because of `makeDefault`. We must move
  // its target rather than calling camera.lookAt, because the controls
  // recompute the camera orientation from their own target on every frame and
  // would otherwise immediately undo us.
  const controls = useThree((s) => s.controls) as OrbitLike | null;
  const target = useMemo(() => new THREE.Vector3(), []);
  const desired = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    if (mode === 'chase') return;

    const frame = makeFrame();
    frameAt(curve, ANCHOR_S * length, length, 0, frame);
    const anchor = frame.position.clone();
    const tan = frame.tangent.clone();
    const nor = frame.normal.clone();

    // Look a little way down the road, so the shot has depth along the lanes.
    const lookAt = anchor.clone().addScaledVector(tan, 150);

    if (mode === 'corridor') {
      // A drone sitting off the shoulder, high enough to see the queue stretch
      // away but low enough that a sedan is still a recognisable object.
      camera.position
        .copy(anchor)
        .addScaledVector(nor, 62)
        .addScaledVector(tan, -95)
        .add(new THREE.Vector3(0, 40, 0));
    } else {
      // Standing on the shoulder.
      camera.position
        .copy(anchor)
        .addScaledVector(nor, 26)
        .addScaledVector(tan, -55)
        .add(new THREE.Vector3(0, 10, 0));
    }

    camera.lookAt(lookAt);
    if (controls) {
      controls.target.copy(lookAt);
      controls.update();
    }
  }, [mode, curve, length, camera, controls]);

  useFrame((_, dt) => {
    if (mode !== 'chase') return;
    const c = chase.current;
    if (!c) return;
    desired
      .copy(c.pos)
      .addScaledVector(c.tan, -22)
      .add(new THREE.Vector3(0, 7.5, 0));
    camera.position.lerp(desired, Math.min(1, dt * 2.6));
    target.copy(c.pos).addScaledVector(c.tan, 18);
    camera.lookAt(target);
  });

  return null;
}

/* --------------------------------------------------------------------- */
/* The scene                                                              */
/* --------------------------------------------------------------------- */

export function RoadScene({
  sim,
  cameraMode,
  colorMode,
  className,
  style,
}: {
  sim: Simulation;
  cameraMode: CameraMode;
  colorMode: ColorMode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const curve = useMemo(() => buildRoadCurve(sim.config.length), [sim.config.length]);
  const radius = useMemo(() => {
    const box = new THREE.Box3().setFromPoints(curve.getPoints(200));
    return Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.5;
  }, [curve]);

  const chase = useRef<{ pos: THREE.Vector3; tan: THREE.Vector3 } | null>(null);
  const [chaseId] = useState(() => Math.floor(Math.random() * 20));

  return (
    <div className={className} style={style}>
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 42, near: 1, far: radius * 14 }}
      >
        <color attach="background" args={['#0a0a0c']} />
        {/* Fog starts just beyond the near traffic so the corridor fades into
            the pass rather than ending at a hard horizon. */}
        <fog attach="fog" args={['#0a0a0c', 180, radius * 2.4]} />

        <ambientLight intensity={1.25} color="#7d8aa4" />
        <directionalLight position={[1, 2.2, 1.4]} intensity={2.6} color="#e2e7f2" />
        <directionalLight position={[-1.4, 0.6, -1]} intensity={0.8} color="#3a5884" />
        <hemisphereLight args={['#5d6d8a', '#14141a', 1.0]} />

        <Surroundings radius={radius} />
        <Road curve={curve} length={sim.config.length} lanes={sim.config.lanes} />
        <Traffic
          sim={sim}
          curve={curve}
          colorMode={colorMode}
          chaseId={chaseId}
          onChaseFrame={(pos, tan) => {
            if (!chase.current) chase.current = { pos: pos.clone(), tan: tan.clone() };
            else {
              chase.current.pos.copy(pos);
              chase.current.tan.copy(tan);
            }
          }}
        />

        <CameraRig
          mode={cameraMode}
          curve={curve}
          length={sim.config.length}
          chase={chase}
        />
        {cameraMode !== 'chase' && (
          <OrbitControls
            makeDefault
            minDistance={25}
            maxDistance={radius * 2.6}
            maxPolarAngle={Math.PI * 0.495}
            enableDamping
            dampingFactor={0.08}
          />
        )}
      </Canvas>
    </div>
  );
}

export { mpsToMph };
