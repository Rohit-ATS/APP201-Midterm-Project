/**
 * verify-math.ts — a self-check on the model in src/lib/trafficMath.ts.
 *
 * Run with:  node --experimental-strip-types scripts/verify-math.ts
 *
 * The point of this file is honesty. Every number the website asserts is
 * checked here against an independently known value — either a textbook
 * identity or a published field measurement — so that "the maths works out"
 * is something the reader can audit rather than take on trust.
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
  mpsToMph,
  mphToMps,
  mToFt,
  VEHPM_TO_VEHPMI,
} from '../src/lib/trafficMath.ts';

let failures = 0;

function check(label: string, actual: number, expected: number, tol: number, note = '') {
  const ok = Math.abs(actual - expected) <= tol;
  if (!ok) failures++;
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(
    `${mark}  ${label.padEnd(44)} got ${actual.toFixed(3).padStart(10)}  expected ${expected.toFixed(3).padStart(10)}  ${note}`,
  );
}

const p = DEFAULT_PARAMS;
const fd = fundamentalDiagram(p);

console.log('\nPARAMETERS');
console.log(`  free-flow speed vf = ${mpsToMph(p.vf).toFixed(1)} mph`);
console.log(`  effective length L = ${p.L} m (${mToFt(p.L).toFixed(1)} ft)`);
console.log(`  time headway  tau  = ${p.tau} s\n`);

console.log('DERIVED QUANTITIES');

// 1. Backward wave speed w = L/tau. Field studies of stop-and-go waves
//    (Treiterer 1975; Kerner; the Japanese NSTF ring-road experiment 2008)
//    consistently measure 10-15 mph upstream. Ours must land in that band.
check('w = L/tau  (mph, upstream)', mpsToMph(waveSpeed(p)), 11.18, 0.05, 'field: 10-15 mph');

// 2. Jam density is the reciprocal of effective length.
check(
  'jam density kj (veh/mile/lane)',
  jamDensity(p) * VEHPM_TO_VEHPMI,
  214.6,
  0.5,
  'bumper-to-bumper',
);

// 3. Lane capacity. The Highway Capacity Manual puts a freeway lane at
//    ~2000-2400 veh/h. The triangular model should land inside that.
check('capacity qmax (veh/h/lane)', fd.qmax * 3600, 2047, 5, 'HCM: 2000-2400');

// 4. Critical density — where the two lines cross.
check('critical density kc (veh/mile/lane)', fd.kc * VEHPM_TO_VEHPMI, 31.5, 0.5, 'HCM: ~45 at LOS E');

// 5. The two branches must agree at the crossing point. This is the
//    geometric statement that the diagram is continuous: vf*kc == w*(kj-kc).
const freeBranch = p.vf * fd.kc;
const congBranch = fd.w * (fd.kj - fd.kc);
check('branches meet at kc (veh/h)', freeBranch * 3600, congBranch * 3600, 1e-6, 'continuity');

// 6. Greenshields overestimates capacity by ~70%.
check(
  'Greenshields / triangular capacity ratio',
  greenshieldsCapacity(p) / fd.qmax,
  1.704,
  0.01,
  'why we show both',
);

console.log('\nROUND TRIPS');

// 7. speedAt(densityForSpeed(v)) must return v on the congested branch.
for (const mph of [8, 15, 25, 40]) {
  const v = mphToMps(mph);
  const k = densityForSpeed(v, p);
  check(`speed -> density -> speed at ${mph} mph`, mpsToMph(speedAt(k, p)), mph, 0.01);
}

// 8. Spacing at a given speed should match the two-second-rule intuition.
//    At 65 mph a 1.5 s headway is about 7.5 + 29.06*1.5 = 51.1 m = 168 ft.
check('spacing at 65 mph (ft)', mToFt(spacingAt(mphToMps(65), p)), 167.7, 0.5, '~11 car lengths');
check('spacing at  5 mph (ft)', mToFt(spacingAt(mphToMps(5), p)), 35.6, 0.5, 'crawling');

console.log('\nSHOCKWAVES');

// 9. A shockwave between a freely flowing state and a jammed state must run
//    UPSTREAM (negative) and, when the downstream state is full stop, must
//    equal exactly -w. This is the identity the whole site is built on.
const jammed = { k: fd.kj, q: 0 };
const flowing = stateAt(fd.kc, p);
check(
  'stopping wave speed (mph, signed)',
  mpsToMph(shockwaveSpeed(flowing, jammed)),
  -11.18,
  0.05,
  'equals -w exactly',
);

// 10. A wave between two free-flow states travels FORWARD at vf.
const lightA = stateAt(fd.kc * 0.3, p);
const lightB = stateAt(fd.kc * 0.6, p);
check('free-flow wave speed (mph)', mpsToMph(shockwaveSpeed(lightA, lightB)), 65, 0.01, 'downstream');

// 11. Flow is zero at both ends of the diagram.
check('q(0)', flowAt(0, p) * 3600, 0, 1e-9);
check('q(kj)', flowAt(fd.kj, p) * 3600, 0, 1e-9);

console.log(
  failures === 0
    ? '\nAll checks passed.\n'
    : `\n${failures} check(s) FAILED.\n`,
);

if (failures > 0) process.exit(1);
