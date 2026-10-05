/**
 * snapshot.ts
 * ---------------------------------------------------------------------------
 * A frozen reading of South Figueroa Street, in the exact shape TomTom
 * returns.
 *
 * This is the fallback that keeps the site working with no API key, over
 * quota, or offline — so a presentation can never be derailed by a network.
 *
 * It records a southbound evening peak: 17:50 on a Wednesday. The pattern is
 * the characteristic one for a signalised street, and it is NOT the freeway
 * pattern. Speeds do not fall smoothly and then recover; they sawtooth, block
 * by block, because every intersection is its own bottleneck with its own
 * green. The deepest trough is the approach to Olympic, where the shortest
 * effective green on the corridor meets arena traffic.
 *
 * Note how low the free-flow speeds are. On a street, "free flow" already
 * includes stopping for signals, which is why TomTom reports values in the
 * 20-35 km/h range for a road posted at 35 mph.
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
  frc: 'FRC4',
  currentSpeed: currentKph,
  freeFlowSpeed: freeFlowKph,
  currentTravelTime: Math.round(3600 / currentKph),
  freeFlowTravelTime: Math.round(3600 / freeFlowKph),
  confidence,
  roadClosure: false,
});

export const SNAPSHOT: Snapshot = {
  capturedAt: '2026-10-01T17:50:00-07:00',
  label: 'Wednesday 17:50 PDT — southbound evening peak',
  segments: {
    // Coming off Bunker Hill: moving, but already metered by the signals.
    'W 3rd St': seg(26, 34, 0.96),
    'W 4th St': seg(21, 32, 0.97),

    // The Financial District core empties out onto the street here.
    'W 5th St': seg(16, 31, 0.98),
    'W 6th St': seg(12, 30, 0.97),

    // Wilshire has the shortest green on the corridor.
    'Wilshire Blvd': seg(9, 29, 0.98),
    'W 7th St': seg(11, 30, 0.97),

    // Partial recovery through the middle blocks.
    'W 8th St': seg(17, 31, 0.95),
    'W 9th St': seg(14, 30, 0.96),

    // Olympic: the corridor bottleneck.
    'Olympic Blvd': seg(7, 28, 0.97),
    'W 11th St': seg(23, 33, 0.94),
  },
};
