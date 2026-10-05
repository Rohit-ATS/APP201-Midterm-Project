/**
 * simulation.ts
 * ---------------------------------------------------------------------------
 * A microscopic simulation of South Figueroa Street in which the mathematics
 * of Section 2 is the only rule any driver is given:
 *
 *     keep a spacing of  s = L + v*tau  from the car in front
 *
 * Rearranged: given the gap you actually have, drive at
 *
 *     v = (s - L) / tau          (never faster than the free-flow speed)
 *
 * This is Newell's car-following model. Nothing about waves, queues or
 * capacity is programmed in. No vehicle is ever told to stop by the code.
 *
 * The one thing added for a city street is TRAFFIC SIGNALS, and even those use
 * the same rule: a red light is treated as a stationary vehicle of zero length
 * parked on the stop line. A driver approaching one therefore obeys
 * v = (distance to the line)/tau and glides to a halt without any braking
 * logic existing anywhere in this file.
 *
 * That is what makes the street a better laboratory than the freeway. On a
 * freeway you wait for a jam. Here every red light manufactures one on
 * schedule, and when it releases you can watch the back of the queue travel
 * away from the light at exactly L/tau.
 */

import { type TrafficParams, mphToMps } from './trafficMath';
import {
  sampleVehicleClass,
  STOPPED_GAP,
  type VehicleClass,
} from '../data/vehicleMix';
import { CORRIDOR, CORRIDOR_LENGTH, LANES } from '../data/corridor';

export interface SimVehicle {
  id: number;
  /** position along the corridor from the north end, metres */
  x: number;
  /** speed, m/s */
  v: number;
  /** lane index, 0 = kerbside */
  lane: number;
  cls: VehicleClass;
  /** this vehicle's own effective length: body + stopped gap */
  L: number;
  /** seconds remaining of a forced brake, if it was perturbed */
  braking: number;

  /* --- the working of the rule, kept for the vehicle inspector --- */
  /** front-bumper to front-bumper gap to the leader, metres */
  gap: number;
  /** the speed the spacing rule asks for, m/s */
  vTarget: number;
  /** which constraint is currently binding */
  limitedBy: 'free' | 'leader' | 'signal' | 'braking';
  /** distance to the next stop line, metres (null when none ahead) */
  toSignal: number | null;
  /** name of the next signal ahead */
  nextSignal: string | null;
  /** id of the vehicle in front */
  leaderId: number | null;
  /** metres travelled since it entered the corridor */
  odometer: number;
}

export interface SignalState {
  name: string;
  /** distance from the north end, metres */
  offset: number;
  cycle: number;
  greenSplit: number;
  phase: number;
  green: boolean;
  /** seconds until this signal next changes */
  changesIn: number;
}

export interface SimConfig {
  /** corridor length, metres — fixed to the real street */
  length: number;
  lanes: number;
  /** vehicles per lane */
  perLane: number;
  /** whether the signals are running */
  signals: boolean;
}

export const DEFAULT_SIM: SimConfig = {
  length: CORRIDOR_LENGTH,
  lanes: LANES,
  // About 55 veh/mile/lane over this street — just under the critical density,
  // which is where a signalised arterial sits during an evening peak.
  perLane: 52,
  signals: true,
};

/** Speed relaxation time, s. Shorter than tau, so it smooths the animation
 *  without changing the wave speed the model predicts. */
const RELAX = 0.4;

/** How far ahead a driver looks for a red light, metres. */
const SIGNAL_LOOKAHEAD = 160;

export class Simulation {
  vehicles: SimVehicle[] = [];
  signals: SignalState[] = [];
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
        const jitter = (Math.random() - 0.5) * spacing * 0.3;
        this.vehicles.push({
          id: id++,
          x: (i * spacing + jitter + lane * 5 + length) % length,
          v: this.params.vf * (0.6 + Math.random() * 0.4),
          lane,
          cls,
          L: cls.length + STOPPED_GAP,
          braking: 0,
          gap: spacing,
          vTarget: this.params.vf,
          limitedBy: 'free',
          toSignal: null,
          nextSignal: null,
          leaderId: null,
          odometer: 0,
        });
      }
    }
    this.updateSignals();
    this.sort();
  }

  private sort() {
    this.vehicles.sort((a, b) => a.lane - b.lane || a.x - b.x);
  }

  updateSignals() {
    this.signals = CORRIDOR.map((c) => {
      const into = (((this.t - c.phase) % c.cycle) + c.cycle) % c.cycle;
      const greenFor = c.cycle * c.greenSplit;
      const green = into < greenFor;
      return {
        name: c.name,
        offset: c.offset,
        cycle: c.cycle,
        greenSplit: c.greenSplit,
        phase: c.phase,
        green,
        changesIn: green ? greenFor - into : c.cycle - into,
      };
    });
  }

  /** Distance from x to the next red stop line ahead, or null. */
  private distanceToRed(x: number): { d: number; name: string } | null {
    if (!this.config.signals) return null;
    const L = this.config.length;
    let best: { d: number; name: string } | null = null;
    for (const s of this.signals) {
      let d = s.offset - x;
      if (d < 0) d += L; // wrap around the loop
      if (d > SIGNAL_LOOKAHEAD) continue;
      if (s.green) continue;
      if (!best || d < best.d) best = { d, name: s.name };
    }
    return best;
  }

  /** Force one vehicle to brake — the perturbation that seeds a phantom jam. */
  perturb(seconds = 2.2) {
    if (!this.vehicles.length) return;
    const pool = this.vehicles.filter((v) => v.v > mphToMps(10));
    const list = pool.length ? pool : this.vehicles;
    list[Math.floor(Math.random() * list.length)].braking = seconds;
  }

  getVehicle(id: number): SimVehicle | undefined {
    return this.vehicles.find((v) => v.id === id);
  }

  step(dt: number) {
    const { length, lanes } = this.config;
    const { tau } = this.params;
    this.t += dt;
    this.updateSignals();
    this.sort();

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

      // ---- the gap to the car in front --------------------------------
      let gap = Infinity;
      let leaderId: number | null = null;
      if (count >= 2) {
        const localIndex = i - start;
        const leader = this.vehicles[start + ((localIndex + 1) % count)];
        gap = leader.x - veh.x;
        if (gap <= 0) gap += length;
        leaderId = leader.id;
      }

      // ---- THE RULE ---------------------------------------------------
      //   s = L + v*tau      =>      v = (s - L)/tau
      // -----------------------------------------------------------------
      const vLeader = Number.isFinite(gap) ? (gap - veh.L) / tau : Infinity;

      // A red light is a stopped vehicle of zero length on the stop line,
      // so the very same rule applies: v = distance / tau.
      const red = this.distanceToRed(veh.x);
      const vSignal = red ? red.d / tau : Infinity;

      const vFree = this.params.vf;
      let vTarget = Math.max(0, Math.min(vFree, vLeader, vSignal));

      let limitedBy: SimVehicle['limitedBy'] =
        vTarget >= vFree - 1e-6
          ? 'free'
          : vSignal < vLeader
            ? 'signal'
            : 'leader';

      if (veh.braking > 0) {
        vTarget = 0;
        limitedBy = 'braking';
        veh.braking -= dt;
      }

      veh.gap = Number.isFinite(gap) ? gap : veh.L;
      veh.vTarget = vTarget;
      veh.limitedBy = limitedBy;
      veh.toSignal = red ? red.d : null;
      veh.nextSignal = red ? red.name : null;
      veh.leaderId = leaderId;

      veh.v += (vTarget - veh.v) * Math.min(1, dt / RELAX);
      if (veh.v < 0.01) veh.v = 0;

      const advance = veh.v * dt;
      veh.odometer += advance;
      veh.x = (veh.x + advance) % length;
    }
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

  /** How many vehicles are stopped right now. */
  stoppedCount(): number {
    return this.vehicles.filter((v) => v.v < 0.3).length;
  }

  /**
   * Find the upstream edge of the slowest cluster in the kerbside lane, so the
   * backward wave can be measured from the vehicles themselves rather than
   * assumed from the formula.
   */
  jamFrontPosition(threshold = mphToMps(6)): number | null {
    const lane0 = this.vehicles.filter((v) => v.lane === 0).sort((a, b) => a.x - b.x);
    if (lane0.length < 4) return null;
    const slow = lane0.map((v) => v.v < threshold);
    if (!slow.some(Boolean) || slow.every(Boolean)) return null;
    for (let i = 0; i < lane0.length; i++) {
      const prev = (i - 1 + lane0.length) % lane0.length;
      if (slow[i] && !slow[prev]) return lane0[i].x;
    }
    return null;
  }
}
