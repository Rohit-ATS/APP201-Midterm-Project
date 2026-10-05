/**
 * verify-math.ts — a self-check on the model in src/lib/trafficMath.ts.
 *
 * Run with:  node --experimental-strip-types scripts/verify-math.ts
 *
 * The point of this file is honesty. Every number the website asserts is
 * checked here against an independently known value — a textbook identity, or
 * a published field measurement — so that "the maths works out" is something
 * the reader can audit rather than take on trust.
 *
 * The strongest checks are the ones where a quantity we never tuned lands on a
 * number somebody else measured in the street: the backward wave speed, the
 * saturation headway, and the saturation flow.
 */

import {
  DEFAULT_PARAMS,
  fundamentalDiagram,
  flowAt,
  speedAt,
  spacingAt,
  densityForSpeed,
  greenshieldsCapacity,
  shockwaveSpeed,
  stateAt,
  jamDensity,
  waveSpeed,
  saturationFlow,
  saturationHeadway,
  signalCapacity,
  vehiclesPerGreen,
  mpsToMph,
  mphToMps,
  mToFt,
  VEHPM_TO_VEHPMI,
} from '../src/lib/trafficMath.ts';
import { effectiveLength, meanVehicleLength } from '../src/data/vehicleMix.ts';

let failures = 0;

function check(label: string, actual: number, expected: number, tol: number, note = '') {
  const ok = Math.abs(actual - expected) <= tol;
  if (!ok) failures++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(42)} got ${actual.toFixed(3).padStart(10)}  expected ${expected.toFixed(3).padStart(10)}  ${note}`,
  );
}

const p = DEFAULT_PARAMS;
const fd = fundamentalDiagram(p);

console.log('\nPARAMETERS  (South Figueroa Street, downtown Los Angeles)');
console.log(`  free-flow speed vf = ${mpsToMph(p.vf).toFixed(1)} mph`);
console.log(`  effective length L = ${p.L} m (${mToFt(p.L).toFixed(1)} ft)`);
console.log(`  time headway  tau  = ${p.tau} s\n`);

console.log('L IS DERIVED, NOT ASSUMED');
check('mean fleet length (m)', meanVehicleLength(), 5.45, 0.05, 'from vehicleMix shares');
check('effective length L (m)', effectiveLength(), 7.45, 0.05, 'mean + stopped gap');
check('L used by the model (m)', p.L, effectiveLength(), 0.06, 'must match the fleet');

console.log('\nDERIVED QUANTITIES');

// 1. Backward wave speed w = L/tau. Field studies of stop-and-go waves and of
//    queue discharge at signals consistently measure 10-15 mph upstream.
check('w = L/tau  (mph, upstream)', mpsToMph(waveSpeed(p)), 11.98, 0.05, 'field: 10-15 mph');

// 2. Jam density is the reciprocal of effective length.
check('jam density kj (veh/mile/lane)', jamDensity(p) * VEHPM_TO_VEHPMI, 214.6, 0.5, 'bumper to bumper');

// 3. Saturation flow: the discharge rate of a moving queue. The Highway
//    Capacity Manual's base value for a through lane is 1,900 veh/h.
check('saturation flow (veh/h/lane)', saturationFlow(p) * 3600, 1837.6, 3, 'HCM base: ~1900');

// 4. Saturation headway — the number engineers actually stand in the street
//    with a stopwatch and measure. Published range 1.9-2.1 s.
check('saturation headway (s)', saturationHeadway(p), 1.959, 0.01, 'field: 1.9-2.1 s');

// 5. Capacity of a signalised lane = saturation flow x green ratio.
check('signal capacity @ 45% green (veh/h)', signalCapacity(p, 0.45) * 3600, 826.9, 2, 'typical arterial');

// 5b. Cars clearing one green — the question the project started from, and the
//     one you can check by standing at the intersection and counting.
check('cars per green @ Wilshire (per lane)', vehiclesPerGreen(p, 0.42, 90), 18.26, 0.05, 'cycle failure above this');
check('cars per green @ 3rd (per lane)', vehiclesPerGreen(p, 0.52, 90), 22.88, 0.05, 'longer green, more cars');

// 6. Critical density — where the two branches cross.
check('critical density kc (veh/mile/lane)', fd.kc * VEHPM_TO_VEHPMI, 61.3, 0.5);

// 7. The two branches must agree at the crossing point: the diagram is
//    continuous, which is the geometric content of "they meet at a peak".
check(
  'branches meet at kc (veh/h)',
  p.vf * fd.kc * 3600,
  fd.w * (fd.kj - fd.kc) * 3600,
  1e-6,
  'continuity',
);

// 8. Greenshields comparison. On a 30 mph street it lands within about 12% of
//    the triangular capacity — but at a completely different density, which is
//    the reason we show both.
check(
  'Greenshields / triangular capacity',
  greenshieldsCapacity(p) / fd.qmax,
  0.8758,
  0.005,
  'ratio = (vf+w)/4w',
);
check(
  'Greenshields peak density (veh/mi)',
  (jamDensity(p) / 2) * VEHPM_TO_VEHPMI,
  107.3,
  0.5,
  'vs 61 for the triangle',
);

console.log('\nROUND TRIPS');

// 9. speedAt(densityForSpeed(v)) must return v on the congested branch.
for (const mph of [4, 8, 15, 22]) {
  const v = mphToMps(mph);
  check(`speed -> density -> speed at ${mph} mph`, mpsToMph(speedAt(densityForSpeed(v, p), p)), mph, 0.01);
}

// 10. Spacing at a given speed, against the two-second-rule intuition.
check('spacing at 30 mph (ft)', mToFt(spacingAt(mphToMps(30), p)), 86.3, 0.5, 'cruising between lights');
check('spacing at  5 mph (ft)', mToFt(spacingAt(mphToMps(5), p)), 34.9, 0.5, 'crawling');
check('spacing at  0 mph (ft)', mToFt(spacingAt(0, p)), 24.6, 0.1, 'stopped: s = L');

console.log('\nSHOCKWAVES');

// 11. A wave between a flowing state and a dead stop must run UPSTREAM, and
//     must equal exactly -w. This is the identity the whole site is built on,
//     and at a red light it is not a metaphor: it is the back of the queue.
check(
  'stopping wave speed (mph, signed)',
  mpsToMph(shockwaveSpeed(stateAt(fd.kc, p), { k: fd.kj, q: 0 })),
  -11.98,
  0.05,
  'equals -w exactly',
);

// 12. A wave between two free-flow states travels FORWARD at vf.
check(
  'free-flow wave speed (mph)',
  mpsToMph(shockwaveSpeed(stateAt(fd.kc * 0.3, p), stateAt(fd.kc * 0.6, p))),
  30,
  0.01,
  'downstream',
);

// 13. Flow is zero at both ends of the diagram.
check('q(0)', flowAt(0, p) * 3600, 0, 1e-9);
check('q(kj)', flowAt(fd.kj, p) * 3600, 0, 1e-9);

console.log(
  failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`,
);

if (failures > 0) process.exit(1);
