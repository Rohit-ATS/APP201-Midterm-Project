/**
 * analysis.ts
 * ---------------------------------------------------------------------------
 * Turning a speed reading into geometry.
 *
 * The traffic API gives us ONE number per station: current mean speed. That is
 * not enough to draw anything interesting. This module recovers the rest —
 * density, flow, spacing, level of service — by reading each speed back
 * through the fundamental diagram, and then computes the quantity the whole
 * project is about: the speed and direction of the boundary between each pair
 * of neighbouring states.
 */

import type { CorridorReading, StationReading } from './tomtom';
import { SEGMENTS } from '../data/corridor';
import {
  type TrafficParams,
  type TrafficState,
  densityForSpeed,
  flowAt,
  spacingAt,
  levelOfService,
  shockwaveSpeed,
  fundamentalDiagram,
  type LOS,
} from './trafficMath';

export interface StationAnalysis extends StationReading {
  /** density, veh/m/lane */
  k: number;
  /** flow, veh/s/lane */
  q: number;
  /** front-bumper-to-front-bumper spacing, m */
  s: number;
  /** lanes at this point */
  lanes: number;
  /** flow across all lanes, veh/h */
  qTotal: number;
  los: LOS;
  /** true when this station is on the congested branch of the diagram */
  congested: boolean;
}

export interface Shockwave {
  /** the upstream station */
  from: string;
  /** the downstream station */
  to: string;
  /** midpoint offset along the corridor, m — where we draw it */
  offset: number;
  /** signed wave speed, m/s. Negative = travelling upstream. */
  u: number;
  /** the two states the wave separates */
  upstream: TrafficState;
  downstream: TrafficState;
}

export interface CorridorAnalysis {
  stations: StationAnalysis[];
  waves: Shockwave[];
  /** mean speed across the corridor, m/s */
  meanSpeed: number;
  /** total vehicles currently on the corridor, all lanes */
  vehiclesOnRoad: number;
  /** travel time now vs. free flow, seconds */
  travelTime: number;
  freeFlowTravelTime: number;
  /** the station with the lowest speed */
  worst: StationAnalysis;
  /** 0-100, how far the corridor is from free flow */
  congestionLevel: number;
  /** the fastest-growing queue, if any wave is running upstream */
  dominantWave?: Shockwave;
}

/** Lanes at a given corridor offset, from the segment table. */
function lanesAt(name: string): number {
  const seg = SEGMENTS.find((s) => s.from === name) ?? SEGMENTS[SEGMENTS.length - 1];
  return seg.lanes;
}

export function analyse(
  reading: CorridorReading,
  p: TrafficParams,
): CorridorAnalysis {
  const stations: StationAnalysis[] = reading.stations.map((st) => {
    // Use the station's own free-flow speed, so a slow segment is not
    // mistaken for congestion when it is simply a lower limit.
    const local: TrafficParams = { ...p, vf: st.vf || p.vf };
    const k = densityForSpeed(st.v, local);
    const q = flowAt(k, local);
    const lanes = lanesAt(st.name);
    return {
      ...st,
      k,
      q,
      s: spacingAt(st.v, local),
      lanes,
      qTotal: q * lanes * 3600,
      los: levelOfService(k),
      congested: k > fundamentalDiagram(local).kc,
    };
  });

  // The waves: one per adjacent pair. u = (q2 - q1)/(k2 - k1), the slope of
  // the chord between the two states on the flow-density diagram.
  const waves: Shockwave[] = [];
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i];
    const b = stations[i + 1];
    const upstream: TrafficState = { k: a.k, q: a.q };
    const downstream: TrafficState = { k: b.k, q: b.q };
    waves.push({
      from: a.name,
      to: b.name,
      offset: (a.offset + b.offset) / 2,
      u: shockwaveSpeed(upstream, downstream),
      upstream,
      downstream,
    });
  }

  // Travel time: sum of segment length / speed.
  let travelTime = 0;
  let freeFlowTravelTime = 0;
  let vehiclesOnRoad = 0;
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i];
    const b = stations[i + 1];
    const len = b.offset - a.offset;
    const v = Math.max(0.5, (a.v + b.v) / 2);
    const vf = Math.max(0.5, (a.vf + b.vf) / 2);
    travelTime += len / v;
    freeFlowTravelTime += len / vf;
    vehiclesOnRoad += ((a.k + b.k) / 2) * len * a.lanes;
  }

  const meanSpeed =
    stations.reduce((sum, s) => sum + s.v, 0) / stations.length;
  const worst = stations.reduce((m, s) => (s.v < m.v ? s : m), stations[0]);

  // How far the corridor is from free flow, as a percentage of the trip that
  // is pure delay: 0 means free flow, 80 means four fifths of the drive is
  // time you would not have spent on an empty road.
  const delayFraction =
    travelTime > 0 ? 1 - freeFlowTravelTime / travelTime : 0;
  const congestionLevel = Math.max(0, Math.min(100, Math.round(delayFraction * 100)));

  // The dominant wave is the one running upstream fastest — the queue that is
  // growing toward the rest of the city quickest.
  const upstreamWaves = waves.filter((w) => w.u < -0.1);
  const dominantWave = upstreamWaves.length
    ? upstreamWaves.reduce((m, w) => (w.u < m.u ? w : m))
    : undefined;

  return {
    stations,
    waves,
    meanSpeed,
    vehiclesOnRoad,
    travelTime,
    freeFlowTravelTime,
    worst,
    congestionLevel,
    dominantWave,
  };
}
