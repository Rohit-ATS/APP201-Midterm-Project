/**
 * beats.ts
 * ---------------------------------------------------------------------------
 * What the model is doing at each moment of each chapter. The 3D scene and
 * the text overlay both read from here, so the number printed on screen is
 * always the number the cars are obeying.
 */

import { fundamentalDiagram, type TrafficParams } from '../lib/trafficMath';
import type { BrakeRun, QueueRun } from './newell';
import { easeInOut, lerp, span } from './story';

export const MILE = 1609.344;

/** Step 2: the hero car's speed, m/s, as the reader scrolls. */
export const heroSpeed = (p: number, params: TrafficParams) => params.vf * easeInOut(span(p, 0.12, 0.72));

/** Step 3: cars per mile in the packed lane. */
export const flipPerMile = (p: number, params: TrafficParams) =>
  lerp(24, MILE / params.L, easeInOut(span(p, 0.12, 0.82)));

/** Steps 4-6: the density being shown, veh/m. */
export function sweepK(id: 'flow' | 'triangle' | 'slope', p: number, params: TrafficParams) {
  const fd = fundamentalDiagram(params);
  if (id === 'flow') return fd.kj * lerp(0.02, 0.985, easeInOut(span(p, 0.08, 0.9)));
  if (id === 'triangle') return fd.kc;
  return fd.kj * lerp(0.06, 0.92, easeInOut(span(p, 0.15, 0.9)));
}

/** Step 7: model seconds into the brake run. */
export const jamTime = (p: number, brake: BrakeRun) => lerp(0, brake.duration - 0.6, span(p, 0.04, 0.97));

/** Step 8: the fly-over replays the back half of the same run. */
export const answerTime = (p: number, brake: BrakeRun) => lerp(brake.duration * 0.25, brake.duration - 0.6, p);

/** Step 9: seconds since the light went green (negative = still red). */
export const greenTime = (p: number, queue: QueueRun) => lerp(-2.5, queue.green + 5, span(p, 0.06, 0.96));

/** Wilshire's signal: 42 % green on a 90-second cycle. */
export const WILSHIRE = { split: 0.42, cycle: 90 };
