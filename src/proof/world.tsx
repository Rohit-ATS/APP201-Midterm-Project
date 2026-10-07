/**
 * world.tsx
 * ---------------------------------------------------------------------------
 * The set the proof is filmed on: a wet downtown boulevard at night.
 *
 *  - Asphalt that reflects, so every headlight and brake light doubles on the
 *    road surface.
 *  - Sodium streetlights every 36 m, each throwing a warm pool on the road.
 *  - Office towers whose windows are computed in the shader from world
 *    position, so a 200 m tower and a 20 m block have the same size windows.
 *  - A sky that glows orange at the horizon, the way a city sky does.
 *
 * Everything here is scenery. The mathematics lives in the cars.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, Lightformer, MeshReflectorMaterial } from '@react-three/drei';
import * as THREE from 'three';

export const LANE_W = 3.5;
export const ROAD_HALF = LANE_W * 3;
/** streetlight spacing; also a multiple of the 12 m dash cycle */
export const LIGHT_GAP = 36;
export const CITY_TILE = 600;

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export const wrap = (x: number, lo: number, hi: number) => {
  const w = hi - lo;
  return ((((x - lo) % w) + w) % w) + lo;
};

/** A soft round glow, used for every light pool and distant light. */
export function useGlowTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

/* ------------------------------------------------------------------ */
/* the road                                                            */
/* ------------------------------------------------------------------ */

/**
 * The asphalt, its markings, and the streetlights. `roll()` returns how far
 * the world should slide under a camera that is travelling with a car.
 */
export function Boulevard({ roll }: { roll: () => number }) {
  const glowTex = useGlowTexture();
  const group = useRef<THREE.Group>(null);
  const span = CITY_TILE * 7;

  const dashes = useMemo(() => {
    const g = new THREE.PlaneGeometry(3, 0.13).rotateX(-Math.PI / 2);
    const m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color('#d8d8d0') }), 4 * Math.ceil(span / 12));
    const o = new THREE.Object3D();
    let i = 0;
    for (const z of [LANE_W, LANE_W * 2, -LANE_W, -LANE_W * 2]) {
      for (let x = -span / 2; x < span / 2; x += 12) {
        o.position.set(x, 0.025, z);
        o.updateMatrix();
        m.setMatrixAt(i++, o.matrix);
      }
    }
    m.count = i;
    m.frustumCulled = false;
    return m;
  }, [span]);

  const lights = useMemo(() => {
    const n = 2 * Math.ceil(span / LIGHT_GAP);
    const pole = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.12, 0.18, 9, 8).translate(0, 4.5, 0),
      new THREE.MeshStandardMaterial({ color: '#3a3d44', metalness: 0.8, roughness: 0.4 }),
      n,
    );
    const arm = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.12, 0.12, 2.6).translate(0, 8.9, 1.3),
      new THREE.MeshStandardMaterial({ color: '#3a3d44', metalness: 0.8, roughness: 0.4 }),
      n,
    );
    const head = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.7, 0.18, 0.4).translate(0, 8.82, 2.5),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc58a').multiplyScalar(9), toneMapped: false }),
      n,
    );
    const pool = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(26, 26).rotateX(-Math.PI / 2).translate(0, 0.035, 3.2),
      new THREE.MeshBasicMaterial({
        map: glowTex,
        color: new THREE.Color('#ff9f4a').multiplyScalar(0.55),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      n,
    );
    const o = new THREE.Object3D();
    let i = 0;
    for (const side of [1, -1]) {
      for (let x = -span / 2; x < span / 2; x += LIGHT_GAP) {
        o.position.set(x + (side > 0 ? 0 : LIGHT_GAP / 2), 0, side * (ROAD_HALF + 1.6));
        o.rotation.set(0, side > 0 ? Math.PI : 0, 0);
        o.updateMatrix();
        for (const m of [pole, arm, head, pool]) m.setMatrixAt(i, o.matrix);
        i++;
      }
    }
    for (const m of [pole, arm, head, pool]) {
      m.count = i;
      m.frustumCulled = false;
    }
    return { pole, arm, head, pool };
  }, [span, glowTex]);

  useFrame(() => {
    if (group.current) group.current.position.x = -wrap(roll(), 0, LIGHT_GAP);
  });

  return (
    <group>
      {/* wet asphalt */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <planeGeometry args={[span, ROAD_HALF * 2 + 1.2]} />
        <MeshReflectorMaterial
          resolution={1024}
          mirror={0.75}
          blur={[420, 90]}
          mixBlur={1}
          mixStrength={9}
          mixContrast={1.1}
          depthScale={1.1}
          minDepthThreshold={0.35}
          maxDepthThreshold={1.3}
          roughness={0.75}
          metalness={0.55}
          color="#141519"
        />
      </mesh>
      {/* kerbs and sidewalks */}
      {[1, -1].map((side) => (
        <mesh key={side} position={[0, 0.09, side * (ROAD_HALF + 2.4)]}>
          <boxGeometry args={[span, 0.18, 3.6]} />
          <meshStandardMaterial color="#2a2c31" roughness={0.9} />
        </mesh>
      ))}
      {/* ground beyond */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]}>
        <planeGeometry args={[CITY_TILE * 12, 5000]} />
        <meshStandardMaterial color="#07080b" roughness={1} />
      </mesh>
      {/* double yellow and edge lines */}
      {[
        { z: 0.14, c: '#e2a91c' },
        { z: -0.14, c: '#e2a91c' },
        { z: ROAD_HALF - 0.25, c: '#dcdcd4' },
        { z: -ROAD_HALF + 0.25, c: '#dcdcd4' },
      ].map((l) => (
        <mesh key={l.z} rotation-x={-Math.PI / 2} position={[0, 0.026, l.z]}>
          <planeGeometry args={[span, 0.13]} />
          <meshBasicMaterial color={l.c} />
        </mesh>
      ))}
      <group ref={group}>
        <primitive object={dashes} />
        <primitive object={lights.pole} />
        <primitive object={lights.arm} />
        <primitive object={lights.head} />
        <primitive object={lights.pool} />
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* the skyline                                                         */
/* ------------------------------------------------------------------ */

/** Lit windows computed from world position — no texture to stretch. */
function windowMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#0c0e13', roughness: 0.35, metalness: 0.6 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;\nvarying float vSeed;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        vWPos = wp.xyz;
        vWNorm = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);
        vSeed = instanceMatrix[3].x * 0.137 + instanceMatrix[3].z * 0.311;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;\nvarying float vSeed;\nfloat h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (abs(vWNorm.y) < 0.5) {
          float along = abs(vWNorm.x) > 0.5 ? vWPos.z : vWPos.x;
          vec2 cell = vec2(floor(along / 3.4), floor(vWPos.y / 3.8));
          vec2 f = vec2(fract(along / 3.4), fract(vWPos.y / 3.8));
          float pane = step(0.18, f.x) * step(f.x, 0.82) * step(0.22, f.y) * step(f.y, 0.8);
          float r = h21(cell + vSeed);
          float lit = step(0.74, r);
          vec3 warm = mix(vec3(1.0, 0.72, 0.42), vec3(0.75, 0.86, 1.0), step(0.86, h21(cell * 1.7 + vSeed)));
          vec3 sharp = pane * lit * warm * (0.35 + 0.75 * h21(cell + 3.1));
          // once a window is smaller than a pixel, draw its average instead of shimmering
          float px = max(fwidth(along / 3.4), fwidth(vWPos.y / 3.8));
          float aa = clamp(1.6 - px * 2.4, 0.0, 1.0);
          totalEmissiveRadiance += mix(vec3(1.0, 0.75, 0.48) * 0.085, sharp, aa);
          diffuseColor.rgb += pane * 0.05;
        }`,
      );
  };
  return m;
}

export function Skyline({ roll }: { roll: () => number }) {
  const group = useRef<THREE.Group>(null);
  const mesh = useMemo(() => {
    const perTile = 70;
    const tiles = 8;
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), windowMaterial(), perTile * tiles);
    const o = new THREE.Object3D();
    let i = 0;
    for (let t = 0; t < tiles; t++) {
      for (let j = 0; j < perTile; j++) {
        // the towers stand behind the road (-z), where the camera looks;
        // the camera's own side (+z) is kept low and set back so no shot
        // ever starts inside a building
        const side = j % 3 === 0 ? 1 : -1;
        const row = Math.floor(hash(j * 3.1) * 3);
        const depth = side > 0 ? 230 + row * 120 + hash(j + 5) * 80 : 40 + row * 95 + hash(j + 5) * 50;
        const tall = side < 0 && hash(j * 7.7) < 0.16;
        const h = tall ? 120 + hash(j + 1) * 150 : side > 0 ? 10 + hash(j + 2) * 35 : 14 + Math.pow(hash(j + 2), 1.8) * 70;
        const w = 18 + hash(j + 3) * 30;
        const d = 18 + hash(j + 4) * 30;
        const x = (t - tiles / 2) * CITY_TILE + hash(j + 9) * CITY_TILE;
        o.position.set(x, 0, side * (ROAD_HALF + 6 + depth));
        o.scale.set(w, h, d);
        o.updateMatrix();
        m.setMatrixAt(i++, o.matrix);
      }
    }
    m.count = i;
    m.frustumCulled = false;
    return m;
  }, []);

  useFrame(() => {
    if (group.current) group.current.position.x = -wrap(roll(), 0, CITY_TILE);
  });

  return (
    <group ref={group}>
      <primitive object={mesh} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* sky and reflections                                                 */
/* ------------------------------------------------------------------ */

export function Sky() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {},
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying vec3 vDir;
          void main(){
            float y = vDir.y;
            vec3 top = vec3(0.006, 0.008, 0.022);
            vec3 mid = vec3(0.03, 0.035, 0.08);
            vec3 haze = vec3(0.32, 0.16, 0.09);
            vec3 c = mix(mid, top, smoothstep(0.05, 0.6, y));
            c = mix(haze, c, smoothstep(-0.02, 0.16, y));
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    [],
  );
  return (
    <mesh material={mat} renderOrder={-1}>
      <sphereGeometry args={[4500, 32, 16]} />
    </mesh>
  );
}

/** A night-city light environment so clear-coat paint has something to reflect. */
export function NightEnvironment() {
  return (
    <Environment frames={1} resolution={256} background={false}>
      <color attach="background" args={['#05060b']} />
      {[-3, -1, 1, 3].map((x) => (
        <Lightformer key={x} form="rect" intensity={2.2} color="#ffb070" position={[x * 6, 5, -8]} scale={[3, 0.4, 1]} />
      ))}
      <Lightformer form="rect" intensity={1.2} color="#7ea6ff" position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[30, 30, 1]} />
      <Lightformer form="ring" intensity={1.5} color="#ffd2a1" position={[12, 3, 8]} scale={4} />
      <Lightformer form="rect" intensity={0.8} color="#ff6a3d" position={[0, 1, 14]} scale={[40, 2, 1]} />
    </Environment>
  );
}
