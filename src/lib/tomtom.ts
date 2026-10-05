/**
 * tomtom.ts
 * ---------------------------------------------------------------------------
 * Live traffic for the corridor, from the TomTom Traffic Flow Segment Data API.
 *
 * WHY WE SAMPLE TEN POINTS INSTEAD OF ASKING FOR ONE AVERAGE
 *
 * An average speed for the whole Sepulveda Pass would destroy the thing this
 * project is about. A wave is a DIFFERENCE between neighbouring places. If
 * one section is doing 9 mph and the next is doing 28 mph, the boundary
 * between them is moving, and its speed is the slope of the chord between the
 * two states on the fundamental diagram. Average them together and the wave
 * disappears into a single meaningless number.
 *
 * So: one API call per interchange, ten calls per refresh.
 *
 * QUOTA. The free Developer tier allows 2,500 requests/day. At ten points a
 * refresh that is 250 refreshes — so the default poll interval is two minutes
 * (300 refreshes over a 10-hour day is already close), and results are cached.
 * Lower REFRESH_MS at your own risk.
 *
 * FAILURE. If the key is missing, the quota is spent, or the network is down,
 * we fall back to a frozen snapshot of a real southbound PM peak (see
 * snapshot.ts) and say so in the UI. The site never shows an empty screen.
 */

import { CORRIDOR } from '../data/corridor';
import { SNAPSHOT } from '../data/snapshot';
import { kphToMps } from './trafficMath';

/** The shape TomTom returns for one flow segment. */
export interface FlowSegmentData {
  frc: string;
  currentSpeed: number; // km/h
  freeFlowSpeed: number; // km/h
  currentTravelTime: number; // s
  freeFlowTravelTime: number; // s
  confidence: number; // 0-1
  roadClosure: boolean;
}

/** One corridor point, after we have attached live numbers to it. */
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
  /** TomTom's confidence in the reading, 0-1 */
  confidence: number;
  roadClosure: boolean;
}

export interface CorridorReading {
  stations: StationReading[];
  /** when the reading was taken */
  at: Date;
  /** 'live' when it came from the API, 'snapshot' when we fell back */
  source: 'live' | 'snapshot';
  /** populated when source is 'snapshot' and we fell back for a reason */
  note?: string;
}

export const REFRESH_MS = 120_000;

const API_KEY = import.meta.env.VITE_TOMTOM_KEY as string | undefined;

const ENDPOINT =
  'https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json';

/** Turn the frozen snapshot into a CorridorReading. */
export function snapshotReading(note?: string): CorridorReading {
  return {
    at: new Date(SNAPSHOT.capturedAt),
    source: 'snapshot',
    note,
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

/**
 * Fetch every corridor point. Any individual point that fails falls back to
 * its snapshot value rather than taking the whole reading down — a partial
 * live reading is still more informative than none.
 */
export async function fetchCorridor(
  signal: AbortSignal,
): Promise<CorridorReading> {
  if (!API_KEY) {
    return snapshotReading(
      'No TomTom key configured — showing a recorded PM-peak reading.',
    );
  }

  const fallback = snapshotReading();
  let liveCount = 0;

  const stations = await Promise.all(
    CORRIDOR.map(async (p, i): Promise<StationReading> => {
      try {
        const d = await fetchPoint(p.lat, p.lon, signal);
        liveCount++;
        return {
          name: p.name,
          lat: p.lat,
          lon: p.lon,
          offset: p.offset,
          v: kphToMps(d.currentSpeed),
          vf: kphToMps(d.freeFlowSpeed),
          confidence: d.confidence,
          roadClosure: d.roadClosure,
        };
      } catch {
        return fallback.stations[i];
      }
    }),
  );

  if (liveCount === 0) {
    return snapshotReading(
      'TomTom unreachable or over quota — showing a recorded PM-peak reading.',
    );
  }

  return {
    stations,
    at: new Date(),
    source: 'live',
    note:
      liveCount < CORRIDOR.length
        ? `${CORRIDOR.length - liveCount} of ${CORRIDOR.length} stations fell back to recorded values.`
        : undefined,
  };
}

export const hasApiKey = () => Boolean(API_KEY);
