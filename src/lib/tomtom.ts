/**
 * tomtom.ts
 * ---------------------------------------------------------------------------
 * Live traffic for South Figueroa Street, from the TomTom Traffic Flow Segment
 * Data API.
 *
 * TWO THINGS COME BACK FROM EACH CALL, AND WE USE BOTH
 *
 * 1. the current and free-flow speed of that piece of road
 * 2. `coordinates.coordinate` — the actual GPS trace of the road segment,
 *    typically 30 to 150 points of real latitude and longitude
 *
 * The second one is what the 3D street is built from. The road you drive on in
 * the scene is not a drawing of Figueroa; it is the GPS polyline TomTom
 * returns for Figueroa, projected into metres and laid down as mesh. The
 * buildings beside it are real OpenStreetMap footprints in the same
 * coordinate frame, so the cars pass the real towers in the real places.
 *
 * WHY TEN SEPARATE CALLS
 *
 * One average for the whole street would destroy the subject of the project. A
 * wave is a DIFFERENCE between neighbouring places; average it away and the
 * wave is gone. So we sample every intersection and keep them apart.
 *
 * QUOTA. The free tier allows 2,500 requests/day. Ten points per refresh at
 * one refresh every two minutes is about 300 requests/hour, so a tab left open
 * all day will exhaust it. The site falls back to a recorded reading rather
 * than breaking.
 */

import { CORRIDOR, CENTERLINE } from '../data/corridor';
import { SNAPSHOT } from '../data/snapshot';
import { kphToMps } from './trafficMath';
import {
  project,
  measure,
  nearestOnPolyline,
  normalAt,
  pointAt,
  resample,
  smooth,
  type Local,
  type PolyPoint,
} from './geo';

/** TomTom spells its GPS points out in full. */
export interface TomTomCoord {
  latitude: number;
  longitude: number;
}

/** The shape TomTom returns for one flow segment. */
export interface FlowSegmentData {
  frc: string;
  currentSpeed: number; // km/h
  freeFlowSpeed: number; // km/h
  currentTravelTime: number; // s
  freeFlowTravelTime: number; // s
  confidence: number; // 0-1
  roadClosure: boolean;
  coordinates?: { coordinate: TomTomCoord[] };
}

export interface StationReading {
  name: string;
  lat: number;
  lon: number;
  /** distance from the north end, metres */
  offset: number;
  /** current mean speed, m/s */
  v: number;
  /** free-flow speed for this segment, m/s */
  vf: number;
  confidence: number;
  roadClosure: boolean;
  /** how many real GPS points this station contributed to the road mesh */
  gpsPoints: number;
}

export interface CorridorReading {
  stations: StationReading[];
  at: Date;
  source: 'live' | 'snapshot';
  note?: string;
  /**
   * The street centreline. Built from the GPS traces when they come back
   * usable, otherwise from the surveyed intersection list.
   */
  centerline: Local[];
  centerlineSource: 'gps' | 'surveyed';
  /** total real GPS points used */
  gpsPointCount: number;
}

export const REFRESH_MS = 120_000;

const API_KEY = import.meta.env.VITE_TOMTOM_KEY as string | undefined;

const ENDPOINT =
  'https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json';

/** Points further than this from the surveyed line belong to a cross street. */
const MAX_OFFSET_FROM_LINE = 45;

/** The fallback centreline: the surveyed intersections, smoothed. */
function surveyedCenterline(): Local[] {
  return smooth(resample(CENTERLINE, 6), 1);
}

/**
 * Build the street from the real GPS traces.
 *
 * The obvious approach — project every GPS point, sort along the street, join
 * the dots — produces a snake. TomTom returns one trace per query, the traces
 * overlap, and two points at the same place on Figueroa can sit ten metres
 * apart because they were recorded in different lanes. Averaging their raw
 * positions makes the centreline wander from kerb to kerb.
 *
 * So the GPS is used to correct a straight spine rather than to replace it.
 * For each 12 m bin along the surveyed line we take the mean SIGNED lateral
 * offset of the GPS points that fall in it, smooth those offsets heavily, clamp
 * them, and lay the centreline down at that offset from the spine.
 *
 * The result is a street that is genuinely positioned by hundreds of real GPS
 * fixes, and is also straight, which Figueroa is.
 */
function centerlineFromGps(traces: TomTomCoord[][]): Local[] | null {
  const total = CENTERLINE[CENTERLINE.length - 1].s;
  const BIN = 12;
  const binCount = Math.ceil(total / BIN) + 1;
  const sum = new Float64Array(binCount);
  const hits = new Int32Array(binCount);

  let used = 0;
  for (const trace of traces) {
    for (const c of trace) {
      if (typeof c?.latitude !== 'number' || typeof c?.longitude !== 'number') continue;
      const p = project(c.latitude, c.longitude);
      const near = nearestOnPolyline(CENTERLINE, p);
      // too far from Figueroa to be Figueroa: it belongs to a cross street
      if (near.dist > MAX_OFFSET_FROM_LINE) continue;
      const bin = Math.min(binCount - 1, Math.max(0, Math.round(near.s / BIN)));
      sum[bin] += near.offset;
      hits[bin]++;
      used++;
    }
  }

  const covered = hits.reduce((n, h) => n + (h > 0 ? 1 : 0), 0);
  if (used < 30 || covered < binCount * 0.2) return null;

  // mean offset per bin; bins with no GPS hold the spine
  let offsets = Array.from({ length: binCount }, (_, i) =>
    hits[i] > 0 ? sum[i] / hits[i] : 0,
  );

  // Heavy smoothing. The offsets are a noisy signal sampled at 12 m; without
  // this the street still ripples at the bin scale.
  for (let pass = 0; pass < 10; pass++) {
    const next = offsets.slice();
    for (let i = 1; i < binCount - 1; i++) {
      next[i] = (offsets[i - 1] + offsets[i] * 2 + offsets[i + 1]) / 4;
    }
    offsets = next;
  }

  const MAX_SHIFT = 14; // metres — beyond this the spine itself is wrong
  const line: Local[] = [];
  for (let i = 0; i < binCount; i++) {
    const s = Math.min(total, i * BIN);
    const base = pointAt(CENTERLINE, s);
    const n = normalAt(CENTERLINE, s);
    const off = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, offsets[i]));
    line.push({ x: base.x + n.x * off, z: base.z + n.z * off });
  }

  return smooth(resample(measure(line), 8), 2);
}

export function snapshotReading(note?: string): CorridorReading {
  const line = surveyedCenterline();
  return {
    at: new Date(SNAPSHOT.capturedAt),
    source: 'snapshot',
    note,
    centerline: line,
    centerlineSource: 'surveyed',
    gpsPointCount: 0,
    stations: CORRIDOR.map((p) => {
      const s = SNAPSHOT.segments[p.name];
      return {
        name: p.name,
        lat: p.lat,
        lon: p.lon,
        offset: p.offset,
        v: kphToMps(s.currentSpeed),
        vf: kphToMps(s.freeFlowSpeed),
        confidence: s.confidence,
        roadClosure: s.roadClosure,
        gpsPoints: 0,
      };
    }),
  };
}

async function fetchPoint(
  lat: number,
  lon: number,
  signal: AbortSignal,
): Promise<FlowSegmentData> {
  const url = `${ENDPOINT}?key=${API_KEY}&point=${lat},${lon}&unit=KMPH`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`TomTom ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (!json?.flowSegmentData) throw new Error('Unexpected TomTom payload');
  return json.flowSegmentData as FlowSegmentData;
}

export async function fetchCorridor(
  signal: AbortSignal,
): Promise<CorridorReading> {
  if (!API_KEY) {
    return snapshotReading(
      'No TomTom key configured — showing a recorded evening-peak reading.',
    );
  }

  const fallback = snapshotReading();
  let liveCount = 0;
  const traces: TomTomCoord[][] = [];

  const stations = await Promise.all(
    CORRIDOR.map(async (p, i): Promise<StationReading> => {
      try {
        const d = await fetchPoint(p.lat, p.lon, signal);
        liveCount++;
        const trace = d.coordinates?.coordinate ?? [];
        if (trace.length) traces.push(trace);
        return {
          name: p.name,
          lat: p.lat,
          lon: p.lon,
          offset: p.offset,
          v: kphToMps(d.currentSpeed),
          vf: kphToMps(d.freeFlowSpeed),
          confidence: d.confidence,
          roadClosure: d.roadClosure,
          gpsPoints: trace.length,
        };
      } catch {
        return fallback.stations[i];
      }
    }),
  );

  if (liveCount === 0) {
    return snapshotReading(
      'TomTom unreachable or over quota — showing a recorded evening-peak reading.',
    );
  }

  const gps = centerlineFromGps(traces);
  const gpsPointCount = traces.reduce((n, t) => n + t.length, 0);

  return {
    stations,
    at: new Date(),
    source: 'live',
    centerline: gps ?? surveyedCenterline(),
    centerlineSource: gps ? 'gps' : 'surveyed',
    gpsPointCount,
    note:
      liveCount < CORRIDOR.length
        ? `${CORRIDOR.length - liveCount} of ${CORRIDOR.length} intersections fell back to recorded values.`
        : undefined,
  };
}

export const hasApiKey = () => Boolean(API_KEY);

export type { PolyPoint };
