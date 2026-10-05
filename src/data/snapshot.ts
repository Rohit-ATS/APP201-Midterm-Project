/**
 * snapshot.ts
 * ---------------------------------------------------------------------------
 * A frozen reading of the corridor, in the exact shape TomTom returns.
 *
 * This is the fallback that keeps the site working with no API key, over
 * quota, or offline. It is also the reading used in the written explanation in
 * Section 2, so the worked example and the live dashboard agree on units and
 * meaning.
 *
 * It records a southbound PM peak: 17:45 on a Thursday, which is the worst
 * recurring hour on this corridor. The pattern below is the characteristic
 * one — traffic crawling UPSTREAM of the Skirball crest and running freely
 * DOWNSTREAM of it. That asymmetry is the whole story: cars are leaving the
 * bottleneck faster than they are arriving at it, so the queue grows
 * backwards, uphill, against the direction of travel.
 *
 * Speeds are km/h, as TomTom reports them with unit=KMPH.
 */

import type { FlowSegmentData } from '../lib/tomtom';

export interface Snapshot {
  capturedAt: string;
  label: string;
  segments: Record<string, FlowSegmentData>;
}

const seg = (
  currentKph: number,
  freeFlowKph: number,
  confidence = 0.95,
): FlowSegmentData => ({
  frc: 'FRC0',
  currentSpeed: currentKph,
  freeFlowSpeed: freeFlowKph,
  // travel times for a nominal 1 km of segment, as TomTom scales them
  currentTravelTime: Math.round(3600 / currentKph),
  freeFlowTravelTime: Math.round(3600 / freeFlowKph),
  confidence,
  roadClosure: false,
});

export const SNAPSHOT: Snapshot = {
  capturedAt: '2026-09-24T17:45:00-07:00',
  label: 'Thursday 17:45 PDT — southbound PM peak',
  segments: {
    // Upstream of the bottleneck: the queue. Speeds collapse.
    'US-101':        seg(35, 105, 0.97),
    'Ventura Blvd':  seg(24, 105, 0.98),
    'Valley Vista':  seg(15, 105, 0.96),
    'Mulholland Dr': seg(11, 105, 0.97),

    // The crest — the bottleneck itself, running AT capacity, not stopped.
    'Skirball Ctr':  seg(18, 105, 0.95),

    // Downstream: the road empties out. Nothing is holding these cars back.
    'Getty Center':  seg(45, 105, 0.96),
    'Moraga Dr':     seg(66, 105, 0.94),
    'Sunset Blvd':   seg(56, 105, 0.95),
    'Montana Ave':   seg(71, 105, 0.93),
    'Wilshire Blvd': seg(50, 105, 0.96),
  },
};
