import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
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
import { Buildings } from './Buildings';
import { VEHICLE_CLASSES } from '../../data/vehicleMix';
import { CORRIDOR_LENGTH } from '../../data/corridor';
import type { Simulation } from '../../lib/simulation';
import type { Local } from '../../lib/geo';
import { mpsToMph } from '../../lib/trafficMath';

export type CameraMode = 'street' | 'aerial' | 'chase';
export type ColorMode = 'speed' | 'paint';

/** Downtown LA travel lane, narrower than a freeway's 3.7 m. */
const LANE_WIDTH = 3.3;

/* --------------------------------------------------------------------- */
/* Colour                                                                 */
/* --------------------------------------------------------------------- */

const SPEED_RAMP = ['#0d366b', '#1c5cab', '#2a78d6', '#3987e5', '#86b6ef', '#cde2fb'].map(
  (h) => new THREE.Color(h),
);

const PAINT = [
  '#d8d8d6', '#2a2a2c', '#8c8f93', '#b9bcc0', '#1e2a44',
  '#6b1f23', '#2d4a35', '#c9ccd1', '#3a3d42', '#e8e9ea',
].map((h) => new THREE.Color(h));

const SELECTED = new THREE.Color('#fab219');

/* --------------------------------------------------------------------- */
/* The road                                                               */
/* --------------------------------------------------------------------- */

function Road({ curve, lanes }: { curve: THREE.CatmullRomCurve3; lanes: number }) {
  const roadWidth = lanes * LANE_WIDTH + 4.5; // plus kerb and parking lanes

  const surface = useMemo(() => buildRoadSurface(curve, roadWidth, 400), [curve, roadWidth]);
  const markings = useMemo(
    () => buildLaneMarkings(curve, CORRIDOR_LENGTH, lanes, LANE_WIDTH),
    [curve, lanes],
  );
  const edges = useMemo(
    () => buildEdgeLines(curve, CORRIDOR_LENGTH, (lanes * LANE_WIDTH) / 2 + 0.4),
    [curve, lanes],
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
      <mesh geometry={surface}>
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
/* Traffic signals                                                        */
/* --------------------------------------------------------------------- */

function Signals({ sim, curve }: { sim: Simulation; curve: THREE.CatmullRomCurve3 }) {
  const lampRefs = useRef<Array<THREE.Mesh | null>>([]);

  const posts = useMemo(() => {
    const frame = makeFrame();
    const half = (sim.config.lanes * LANE_WIDTH) / 2;
    return sim.signals.map((s) => {
      frameAt(curve, s.offset, CORRIDOR_LENGTH, half + 2.6, frame);
      return {
        name: s.name,
        pos: frame.position.clone(),
        angle: Math.atan2(frame.tangent.x, frame.tangent.z),
      };
    });
  }, [curve, sim]);

  useFrame(() => {
    sim.signals.forEach((s, i) => {
      const lamp = lampRefs.current[i];
      if (!lamp) return;
      (lamp.material as THREE.MeshBasicMaterial).color.set(s.green ? '#19c34a' : '#ef2f2f');
    });
  });

  return (
    <group>
      {posts.map((p, i) => (
        <group key={p.name} position={p.pos} rotation={[0, p.angle, 0]}>
          <mesh position={[0, 2.6, 0]}>
            <cylinderGeometry args={[0.09, 0.11, 5.2, 6]} />
            <meshStandardMaterial color="#17171a" roughness={0.9} />
          </mesh>
          <mesh position={[0, 5.0, 0.3]}>
            <boxGeometry args={[0.34, 0.9, 0.3]} />
            <meshStandardMaterial color="#101014" roughness={0.9} />
          </mesh>
          <mesh
            ref={(el) => {
              lampRefs.current[i] = el;
            }}
            position={[0, 5.0, 0.48]}
          >
            <sphereGeometry args={[0.17, 10, 10]} />
            <meshBasicMaterial color="#ef2f2f" toneMapped={false} />
          </mesh>
        </group>
      ))}
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
  selectedId,
  onSelect,
  onChaseFrame,
  chaseId,
}: {
  sim: Simulation;
  curve: THREE.CatmullRomCurve3;
  colorMode: ColorMode;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onChaseFrame?: (pos: THREE.Vector3, tangent: THREE.Vector3) => void;
  chaseId?: number | null;
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

  /**
   * Which vehicle id currently occupies which instance slot, per class.
   * A click gives back an instanceId, and this is how that becomes a vehicle.
   */
  const slotToId = useRef<number[][]>(VEHICLE_CLASSES.map(() => []));

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

    for (const veh of sim.vehicles) {
      const ci = VEHICLE_CLASSES.findIndex((c) => c.id === veh.cls.id);
      if (ci < 0) continue;
      const mesh = meshRefs.current[ci];
      if (!mesh) continue;
      const idx = counts[ci];
      if (idx >= capacity) continue;

      const lateral = (veh.lane - (sim.config.lanes - 1) / 2) * LANE_WIDTH;
      frameAt(curve, veh.x, CORRIDOR_LENGTH, lateral, frame);

      const angle = Math.atan2(frame.tangent.x, frame.tangent.z);
      quat.setFromAxisAngle(up, angle);
      matrix.compose(frame.position, quat, scale);
      mesh.setMatrixAt(idx, matrix);

      if (veh.id === selectedId) {
        color.copy(SELECTED);
      } else if (colorMode === 'speed') {
        const t = Math.max(0, Math.min(0.999, 1 - veh.v / Math.max(sim.params.vf, 0.1)));
        color.copy(SPEED_RAMP[Math.floor(t * SPEED_RAMP.length)]);
      } else {
        color.copy(PAINT[veh.id % PAINT.length]);
      }
      mesh.setColorAt(idx, color);

      const brakeMesh = brakeRefs.current[ci];
      if (brakeMesh) {
        const prev = prevSpeeds.get(veh.id) ?? veh.v;
        const decel = prev - veh.v;
        prevSpeeds.set(veh.id, veh.v);
        const on = decel > 0.02 || veh.braking > 0 || veh.v < 0.3;
        brakeMesh.setMatrixAt(idx, matrix);
        color.setRGB(on ? 1 : 0.07, on ? 0.09 : 0.012, on ? 0.07 : 0.012);
        brakeMesh.setColorAt(idx, color);
      }

      const headMesh = headRefs.current[ci];
      if (headMesh) headMesh.setMatrixAt(idx, matrix);

      slotToId.current[ci][idx] = veh.id;

      if (chaseId != null && veh.id === chaseId && onChaseFrame) {
        onChaseFrame(frame.position, frame.tangent);
      }

      counts[ci] = idx + 1;
    }

    meshRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      mesh.count = counts[i];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      // Three.js raycasts an InstancedMesh against a bounding sphere derived
      // from the instance matrices, and caches it. Ours move every frame, so
      // without this the cached sphere is wherever the traffic was when the
      // mesh was created — and every click silently misses.
      mesh.computeBoundingSphere();
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

  const handleClick = (ci: number) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const idx = e.instanceId;
    if (idx == null) return;
    const id = slotToId.current[ci]?.[idx];
    if (id != null) onSelect(id);
  };

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
            onClick={handleClick(i)}
            onPointerOver={() => {
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
              document.body.style.cursor = '';
            }}
          >
            <meshStandardMaterial roughness={0.42} metalness={0.35} toneMapped={false} />
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
/* A ring under the selected vehicle                                      */
/* --------------------------------------------------------------------- */

function SelectionRing({
  sim,
  curve,
  selectedId,
}: {
  sim: Simulation;
  curve: THREE.CatmullRomCurve3;
  selectedId: number | null;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const frame = useMemo(() => makeFrame(), []);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const veh = selectedId == null ? undefined : sim.getVehicle(selectedId);
    if (!veh) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    const lateral = (veh.lane - (sim.config.lanes - 1) / 2) * LANE_WIDTH;
    frameAt(curve, veh.x, CORRIDOR_LENGTH, lateral, frame);
    mesh.position.set(frame.position.x, frame.position.y + 0.09, frame.position.z);
    mesh.scale.setScalar(1 + Math.sin(clock.elapsedTime * 3.2) * 0.08);
  });

  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[2.2, 2.75, 28]} />
      <meshBasicMaterial color="#fab219" transparent opacity={0.9} toneMapped={false} />
    </mesh>
  );
}

/* --------------------------------------------------------------------- */
/* Ground                                                                 */
/* --------------------------------------------------------------------- */

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.25, 0]}>
      <planeGeometry args={[6000, 6000]} />
      <meshStandardMaterial color="#0b0b0e" roughness={1} />
    </mesh>
  );
}

/* --------------------------------------------------------------------- */
/* Camera                                                                 */
/* --------------------------------------------------------------------- */

interface OrbitLike {
  target: THREE.Vector3;
  update: () => void;
}

/** Frame the corridor around Wilshire and 7th, the Financial District core. */
const ANCHOR_S = 0.52;

function CameraRig({
  mode,
  curve,
  chase,
}: {
  mode: CameraMode;
  curve: THREE.CatmullRomCurve3;
  chase: React.MutableRefObject<{ pos: THREE.Vector3; tan: THREE.Vector3 } | null>;
}) {
  const camera = useThree((s) => s.camera);
  // OrbitControls registers itself here because of makeDefault. We move its
  // target rather than calling camera.lookAt, because the controls recompute
  // orientation from their own target every frame and would undo us.
  const controls = useThree((s) => s.controls) as OrbitLike | null;
  const target = useMemo(() => new THREE.Vector3(), []);
  const desired = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    if (mode === 'chase') return;

    const frame = makeFrame();
    frameAt(curve, ANCHOR_S * CORRIDOR_LENGTH, CORRIDOR_LENGTH, 0, frame);
    const anchor = frame.position.clone();
    const tan = frame.tangent.clone();
    const nor = frame.normal.clone();
    const lookAt = new THREE.Vector3();

    if (mode === 'aerial') {
      // High and back, so the towers read as a skyline and the whole queue is
      // visible at once.
      // Steep and high. A shallow aerial over a street canyon is useless: a
      // 300 m tower hides everything behind it, so the shot has to come down
      // from above the rooftops rather than across them.
      camera.position
        .copy(anchor)
        .addScaledVector(nor, 120)
        .addScaledVector(tan, -340)
        .add(new THREE.Vector3(0, 760, 0));
      lookAt.copy(anchor).addScaledVector(tan, 40);
    } else {
      // Street level: hovering just above the centre line, looking straight
      // down the canyon. Sitting out at the kerb puts the camera inside a
      // building, because downtown towers start at the property line.
      camera.position
        .copy(anchor)
        .addScaledVector(nor, 1)
        .addScaledVector(tan, -58)
        .add(new THREE.Vector3(0, 15, 0));
      // Aim DOWN the street, not up at the facades: the subject is the
      // roadway, and the towers should frame it rather than fill it.
      lookAt.copy(anchor).addScaledVector(tan, 165).add(new THREE.Vector3(0, 1, 0));
    }

    camera.lookAt(lookAt);
    if (controls) {
      controls.target.copy(lookAt);
      controls.update();
    }
  }, [mode, curve, camera, controls]);

  useFrame((_, dt) => {
    if (mode !== 'chase') return;
    const c = chase.current;
    if (!c) return;
    desired.copy(c.pos).addScaledVector(c.tan, -15).add(new THREE.Vector3(0, 5.2, 0));
    camera.position.lerp(desired, Math.min(1, dt * 3));
    target.copy(c.pos).addScaledVector(c.tan, 24).add(new THREE.Vector3(0, 1.5, 0));
    camera.lookAt(target);
  });

  return null;
}

/* --------------------------------------------------------------------- */
/* The scene                                                              */
/* --------------------------------------------------------------------- */

export function RoadScene({
  sim,
  centerline,
  cameraMode,
  colorMode,
  selectedId,
  onSelect,
  showBuildings = true,
  showLabels = true,
  className,
  style,
}: {
  sim: Simulation;
  /** the street centreline, in local metres */
  centerline: Local[];
  cameraMode: CameraMode;
  colorMode: ColorMode;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  showBuildings?: boolean;
  showLabels?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const curve = useMemo(() => buildRoadCurve(centerline), [centerline]);
  const chase = useRef<{ pos: THREE.Vector3; tan: THREE.Vector3 } | null>(null);

  return (
    <div className={className} style={style}>
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 48, near: 0.6, far: 9000 }}
        onPointerMissed={() => onSelect(null)}
      >
        <color attach="background" args={['#07070b']} />
        <fog attach="fog" args={['#07070b', 420, 2600]} />

        <ambientLight intensity={1.15} color="#7d8aa4" />
        <directionalLight position={[220, 420, 180]} intensity={2.3} color="#e2e7f2" />
        <directionalLight position={[-260, 140, -200]} intensity={0.75} color="#3a5884" />
        <hemisphereLight args={['#5d6d8a', '#101016', 0.95]} />

        <Ground />
        {showBuildings && <Buildings showLabels={showLabels} />}
        <Road curve={curve} lanes={sim.config.lanes} />
        <Signals sim={sim} curve={curve} />
        <Traffic
          sim={sim}
          curve={curve}
          colorMode={colorMode}
          selectedId={selectedId}
          onSelect={onSelect}
          chaseId={cameraMode === 'chase' ? selectedId : null}
          onChaseFrame={(pos, tan) => {
            if (!chase.current) chase.current = { pos: pos.clone(), tan: tan.clone() };
            else {
              chase.current.pos.copy(pos);
              chase.current.tan.copy(tan);
            }
          }}
        />
        <SelectionRing sim={sim} curve={curve} selectedId={selectedId} />

        <CameraRig mode={cameraMode} curve={curve} chase={chase} />
        {cameraMode !== 'chase' && (
          <OrbitControls
            makeDefault
            minDistance={12}
            maxDistance={1800}
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
