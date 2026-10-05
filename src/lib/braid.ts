/**
 * braid.ts
 * ---------------------------------------------------------------------------
 * Generates the raw material for the artwork in Section 3.
 *
 * It runs the same simulation as the rest of the site, offline and faster than
 * real time, and records where every vehicle was at every moment. The result
 * is two families of lines:
 *
 *   WARP  — the vehicle trajectories. Slope = the speed of a car. They lean
 *           one way.
 *   WEFT  — the jam fronts. Slope = -L/tau. They lean the OTHER way.
 *
 * Two families of lines crossing at opposite angles is, mathematically, a
 * weave. That is the entire idea behind the piece: the fabric exists only
 * because traffic and traffic jams travel in opposite directions.
 */

import { Simulation, type SimConfig } from './simulation';
import { waveSpeed, type TrafficParams } from './trafficMath';

export interface BraidThread {
  /** points in (time, position) space */
  pts: Array<{ t: number; x: number; v: number }>;
}

export interface BraidField {
  warp: BraidThread[];
  /** jam fronts: each is a start point that travels at -w */
  weft: Array<{ t: number; x: number; strength: number }>;
  duration: number;
  length: number;
  /** backward wave speed used, m/s */
  w: number;
  vf: number;
}

export interface BraidOptions {
  duration: number;
  sampleDt: number;
  /** density of the cloth, vehicles per mile of lane */
  perMile: number;
  /** how many times to tap the brakes during the run */
  perturbations: number;
}

export const DEFAULT_BRAID: BraidOptions = {
  duration: 420,
  sampleDt: 0.6,
  perMile: 34,
  perturbations: 5,
};

export function generateBraid(
  params: TrafficParams,
  opts: BraidOptions = DEFAULT_BRAID,
): BraidField {
  const lengthM = 2600;
  const config: SimConfig = {
    length: lengthM,
    lanes: 1,
    perLane: Math.max(6, Math.round(opts.perMile * (lengthM / 1609.344))),
    bottleneck: false,
    bottleneckFactor: 0.5,
    bottleneckAt: 0.5,
    bottleneckWidth: 0.05,
  };

  const sim = new Simulation(config, params);
  const dt = 0.1;
  const steps = Math.round(opts.duration / dt);
  const sampleEvery = Math.max(1, Math.round(opts.sampleDt / dt));

  // let the traffic settle before we start recording
  for (let i = 0; i < 300; i++) sim.step(dt);

  const n = sim.vehicles.length;
  const warp: BraidThread[] = Array.from({ length: n }, () => ({ pts: [] }));
  const weft: BraidField['weft'] = [];

  const perturbAt = new Set(
    Array.from({ length: opts.perturbations }, (_, i) =>
      Math.floor(((i + 0.5) / opts.perturbations) * steps),
    ),
  );

  let prevFront: number | null = null;

  for (let i = 0; i < steps; i++) {
    if (perturbAt.has(i)) sim.perturb(2.4);
    sim.step(dt);

    if (i % sampleEvery !== 0) continue;

    const t = i * dt;
    const ordered = [...sim.vehicles].sort((a, b) => a.id - b.id);
    for (let j = 0; j < ordered.length && j < n; j++) {
      warp[j].pts.push({ t, x: ordered[j].x, v: ordered[j].v });
    }

    // record a new jam front whenever one appears where there was none
    const front = sim.jamFrontPosition();
    if (front !== null && prevFront === null) {
      const slowCount = sim.vehicles.filter((v) => v.v < params.vf * 0.35).length;
      weft.push({ t, x: front, strength: slowCount / Math.max(1, n) });
    }
    prevFront = front;
  }

  return {
    warp,
    weft,
    duration: opts.duration,
    length: config.length,
    w: waveSpeed(params),
    vf: params.vf,
  };
}
