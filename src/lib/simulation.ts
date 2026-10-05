/**
 * simulation.ts
 * ---------------------------------------------------------------------------
 * A microscopic traffic simulation in which the mathematics of Section 2 is
 * the ONLY rule.
 *
 * Every driver here obeys one instruction:
 *
 *     keep a spacing of  s = L + v*tau  from the car in front
 *
 * Rearranged, that says: given the gap you actually have, drive at
 *
 *     v = (s - L) / tau          (but never faster than the free-flow speed)
 *
 * This is Newell's car-following model. It is worth knowing that NOTHING about
 * waves, jams or capacity is programmed in. No car is told to stop. No jam is
 * placed anywhere. The backward-travelling waves you see emerge from that one
 * line, and when you measure their speed it comes out at L/tau — which is what
 * the fundamental diagram predicted from the same line of algebra.
 *
 * That agreement between a microscopic rule and a macroscopic prediction is
 * the strongest evidence the project has that the geometry is right.
 */

import {
  type TrafficParams,
  mphToMps,
} from './trafficMath';
import {
  sampleVehicleClass,
  STOPPED_GAP,
  type VehicleClass,
} from '../data/vehicleMix';

export interface SimVehicle {
  id: number;
  /** position along the loop, metres */
  x: number;
  /** speed, m/s */
  v: number;
  /** lane index, 0 = rightmost */
  lane: number;
  cls: VehicleClass;
  /** this vehicle's own effective length: body + stopped gap */
  L: number;
  /** seconds remaining of a forced brake, if it was perturbed */
  braking: number;
}

export interface SimConfig {
  /** loop length, metres */
  length: number;
  lanes: number;
  /** vehicles per lane */
  perLane: number;
  /** whether the grade bottleneck is active */
  bottleneck: boolean;
  /** fraction of free-flow speed inside the bottleneck */
  bottleneckFactor: number;
  /** centre of the bottleneck as a fraction of the loop */
  bottleneckAt: number;
  /** half-width of the bottleneck as a fraction of the loop */
  bottleneckWidth: number;
}

export const DEFAULT_SIM: SimConfig = {
  length: 4000,
  lanes: 4,
  // 70 vehicles over 2.49 miles is about 28 veh/mile/lane — just under the
  // critical density of ~31, which is exactly where phantom jams live. Set it
  // much lower and the road never jams; much higher and it never clears.
  perLane: 70,
  bottleneck: true,
  bottleneckFactor: 0.52,
  bottleneckAt: 0.5,
  bottleneckWidth: 0.045,
};

/** Speed relaxation time, s. Smaller than tau, so it smooths the animation
 *  without changing the wave speed the model predicts. */
const RELAX = 0.4;

export class Simulation {
  vehicles: SimVehicle[] = [];
  t = 0;
  config: SimConfig;
  params: TrafficParams;

  constructor(config: SimConfig, params: TrafficParams) {
    this.config = config;
    this.params = params;
    this.reset();
  }

  reset() {
    const { length, lanes, perLane } = this.config;
    this.vehicles = [];
    this.t = 0;
    let id = 0;
    for (let lane = 0; lane < lanes; lane++) {
      const spacing = length / perLane;
      for (let i = 0; i < perLane; i++) {
        const cls = sampleVehicleClass();
        // a little jitter so the lanes do not start in lockstep
        const jitter = (Math.random() - 0.5) * spacing * 0.3;
        this.vehicles.push({
          id: id++,
          x: (i * spacing + jitter + lane * 7) % length,
          v: this.params.vf * (0.9 + Math.random() * 0.1),
          lane,
          cls,
          L: cls.length + STOPPED_GAP,
          braking: 0,
        });
      }
    }
    this.sort();
  }

  /** Keep each lane ordered by position so the leader is always the next one. */
  private sort() {
    this.vehicles.sort((a, b) => a.lane - b.lane || a.x - b.x);
  }

  /** Free-flow speed at a position — reduced inside the bottleneck. */
  freeSpeedAt(x: number): number {
    const { length, bottleneck, bottleneckAt, bottleneckWidth, bottleneckFactor } =
      this.config;
    if (!bottleneck) return this.params.vf;
    const f = x / length;
    // distance on the loop, respecting wrap-around
    let d = Math.abs(f - bottleneckAt);
    d = Math.min(d, 1 - d);
    if (d > bottleneckWidth) return this.params.vf;
    // smooth the edges so the grade is a ramp, not a wall
    const edge = Math.min(1, (bottleneckWidth - d) / (bottleneckWidth * 0.5));
    return this.params.vf * (1 - (1 - bottleneckFactor) * edge);
  }

  /** Force one vehicle to brake — the perturbation that seeds a phantom jam. */
  perturb(seconds = 2.2) {
    if (!this.vehicles.length) return;
    const pool = this.vehicles.filter((v) => v.v > mphToMps(20));
    const target = (pool.length ? pool : this.vehicles)[
      Math.floor(Math.random() * (pool.length || this.vehicles.length))
    ];
    target.braking = seconds;
  }

  step(dt: number) {
    const { length, lanes } = this.config;
    const { tau } = this.params;
    this.sort();

    // index of the first vehicle of each lane, so we can find leaders fast
    const laneStart: number[] = new Array(lanes).fill(-1);
    const laneCount: number[] = new Array(lanes).fill(0);
    this.vehicles.forEach((v, i) => {
      if (laneStart[v.lane] === -1) laneStart[v.lane] = i;
      laneCount[v.lane]++;
    });

    for (let i = 0; i < this.vehicles.length; i++) {
      const veh = this.vehicles[i];
      const start = laneStart[veh.lane];
      const count = laneCount[veh.lane];
      if (count < 2) {
        veh.v = this.freeSpeedAt(veh.x);
        veh.x = (veh.x + veh.v * dt) % length;
        continue;
      }
      const localIndex = i - start;
      const leader = this.vehicles[start + ((localIndex + 1) % count)];

      // gap from this front bumper to the leader's front bumper, around the loop
      let s = leader.x - veh.x;
      if (s <= 0) s += length;

      // ---- THE RULE ----------------------------------------------------
      //   s = L + v*tau      =>      v = (s - L)/tau
      // ------------------------------------------------------------------
      const vSafe = (s - veh.L) / tau;
      let vTarget = Math.max(0, Math.min(this.freeSpeedAt(veh.x), vSafe));

      if (veh.braking > 0) {
        vTarget = 0;
        veh.braking -= dt;
      }

      // relax toward the target rather than snapping to it
      veh.v += (vTarget - veh.v) * Math.min(1, dt / RELAX);
      if (veh.v < 0.01) veh.v = 0;

      veh.x = (veh.x + veh.v * dt) % length;
    }

    this.t += dt;
  }

  /** Mean speed over all vehicles, m/s. */
  meanSpeed(): number {
    if (!this.vehicles.length) return 0;
    return this.vehicles.reduce((s, v) => s + v.v, 0) / this.vehicles.length;
  }

  /** Density, veh/m/lane. */
  density(): number {
    return this.config.perLane / this.config.length;
  }

  /** Flow, veh/s/lane — measured, not assumed: density times mean speed. */
  flow(): number {
    return this.density() * this.meanSpeed();
  }

  /**
   * Measure the backward wave speed directly from the vehicles, by finding the
   * upstream edge of the slowest cluster and tracking how it moves. Returned
   * in m/s, negative when travelling upstream. Null when nothing is jammed.
   */
  jamFrontPosition(threshold = mphToMps(18)): number | null {
    const lane0 = this.vehicles.filter((v) => v.lane === 0).sort((a, b) => a.x - b.x);
    if (!lane0.length) return null;
    const slow = lane0.map((v) => v.v < threshold);
    if (!slow.some(Boolean) || slow.every(Boolean)) return null;
    // the upstream edge: a slow vehicle whose predecessor (behind it) is fast
    for (let i = 0; i < lane0.length; i++) {
      const prev = (i - 1 + lane0.length) % lane0.length;
      if (slow[i] && !slow[prev]) return lane0[i].x;
    }
    return null;
  }
}
