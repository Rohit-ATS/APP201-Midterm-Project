/**
 * trafficMath.ts
 * ---------------------------------------------------------------------------
 * The mathematics behind the project, in one place.
 *
 * Everything here comes from a single geometric statement:
 *
 *     a moving car owns a SEGMENT of road, and that segment has a length.
 *
 * Call that length the SPACING  s  (front bumper to front bumper). It is the
 * car's own length plus the gap the driver leaves. If the driver leaves a gap
 * measured in TIME (the "two second rule"), then the gap in metres grows in
 * direct proportion to speed, and we get the spacing line
 *
 *     s(v) = L + v * tau                                            [SPACING]
 *
 * L    = effective length (mean car length + the bumper gap kept when stopped), m
 * tau  = following time headway (reaction + reflex), s
 * v    = speed, m/s
 *
 * Every other formula in this file is an algebraic consequence of that line.
 *
 * UNITS: all internal maths is SI (metres, seconds, veh/m). Conversion to the
 * units a Californian actually reads (mph, feet, veh/mile) happens only at the
 * display edge, via the helpers at the bottom.
 */

/* ------------------------------------------------------------------ */
/* Unit conversion                                                     */
/* ------------------------------------------------------------------ */

export const MPS_TO_MPH = 2.236936;
export const MPH_TO_MPS = 1 / MPS_TO_MPH;
export const KPH_TO_MPS = 1 / 3.6;
export const M_TO_FT = 3.28084;
export const VEHPM_TO_VEHPMI = 1609.344; // veh per metre -> veh per mile

export const mpsToMph = (v: number) => v * MPS_TO_MPH;
export const mphToMps = (v: number) => v * MPH_TO_MPS;
export const kphToMps = (v: number) => v * KPH_TO_MPS;
export const mToFt = (m: number) => m * M_TO_FT;

/* ------------------------------------------------------------------ */
/* The model parameters                                                */
/* ------------------------------------------------------------------ */

export interface TrafficParams {
  /** Free-flow speed: the speed of a car with the road to itself. m/s */
  vf: number;
  /** Effective vehicle length = mean length + stopped bumper gap. m */
  L: number;
  /** Following time headway. s */
  tau: number;
}

/** Defaults tuned to the I-405 Sepulveda Pass fleet (see data/vehicleMix.ts). */
export const DEFAULT_PARAMS: TrafficParams = {
  vf: mphToMps(65),
  L: 7.5,
  tau: 1.5,
};

/* ------------------------------------------------------------------ */
/* 1. SPACING - the geometric starting point                           */
/* ------------------------------------------------------------------ */

/** s(v) = L + v*tau. The length of road one car owns, in metres. */
export const spacingAt = (v: number, p: TrafficParams) => p.L + v * p.tau;

/** Inverse of the spacing line: the speed implied by a given spacing. */
export const speedForSpacing = (s: number, p: TrafficParams) =>
  Math.max(0, (s - p.L) / p.tau);

/* ------------------------------------------------------------------ */
/* 2. DENSITY - spacing turned upside down                             */
/* ------------------------------------------------------------------ */
/* If every car owns s metres, then one kilometre of lane holds 1000/s cars.
 * Density k is literally the reciprocal of a length. That reciprocal is why
 * the free-flow branch of the diagram is a straight line while the
 * speed-density relation bends: they are the same fact read along different
 * axes. */

/** k = 1/s, in veh/m. */
export const densityForSpacing = (s: number) => 1 / s;

/** JAM DENSITY: bumper to bumper, v = 0, so s = L and k = 1/L. veh/m */
export const jamDensity = (p: TrafficParams) => 1 / p.L;

/* ------------------------------------------------------------------ */
/* 3. THE BACKWARD WAVE SPEED - the headline result                    */
/* ------------------------------------------------------------------ */
/*
 * In congestion, substitute the spacing line into q = k*v:
 *
 *     v = (1/k - L)/tau
 *     q = k*v = (1 - k*L)/tau = 1/tau - (L/tau)*k
 *
 * That is a STRAIGHT LINE in (k, q) with slope  -L/tau.
 *
 * The slope of a line on the flow-density diagram is a physical velocity, so
 * the jam travels BACKWARD along the freeway at
 *
 *     w = L / tau
 *
 * ...the length a car occupies when stopped, divided by the driver's reaction
 * time. Nothing about the freeway, the cars, or the city appears in it. This
 * is why measured jam waves run backward at nearly the same speed in Los
 * Angeles, Tokyo and Paris: everyone's car is about the same length and
 * everyone's reaction time is about the same.
 */

/** w = L / tau, in m/s. The speed a jam front travels UPSTREAM. */
export const waveSpeed = (p: TrafficParams) => p.L / p.tau;

/* ------------------------------------------------------------------ */
/* 4. THE TRIANGULAR FUNDAMENTAL DIAGRAM (Newell)                      */
/* ------------------------------------------------------------------ */
/*
 * Two straight lines meeting at a peak:
 *
 *   free branch       q = vf * k                 (every car at full speed)
 *   congested branch  q = w * (kj - k)           (every car following)
 *
 * They cross at the CRITICAL density kc. Solving vf*k = w*(kj - k):
 *
 *     kc    = w*kj / (vf + w)
 *     qmax  = vf*w*kj / (vf + w)
 *
 * qmax is the CAPACITY of one lane. Notice what it depends on: vf, L and tau.
 * Adding a lane multiplies capacity; it does not raise this peak. That is the
 * geometric reason the 405 widening did not fix the 405.
 */

export interface FundamentalDiagram {
  /** critical density, veh/m */
  kc: number;
  /** jam density, veh/m */
  kj: number;
  /** capacity, veh/s per lane */
  qmax: number;
  /** backward wave speed, m/s */
  w: number;
  /** free-flow speed, m/s */
  vf: number;
}

export function fundamentalDiagram(p: TrafficParams): FundamentalDiagram {
  const kj = jamDensity(p);
  const w = waveSpeed(p);
  const kc = (w * kj) / (p.vf + w);
  const qmax = p.vf * kc;
  return { kc, kj, qmax, w, vf: p.vf };
}

/** Flow q at density k under the triangular diagram. veh/s per lane. */
export function flowAt(k: number, p: TrafficParams): number {
  const { kc, kj, w } = fundamentalDiagram(p);
  if (k <= 0) return 0;
  if (k >= kj) return 0;
  return k <= kc ? p.vf * k : w * (kj - k);
}

/** Mean speed at density k under the triangular diagram. m/s. */
export function speedAt(k: number, p: TrafficParams): number {
  if (k <= 0) return p.vf;
  return flowAt(k, p) / k;
}

/**
 * Density implied by an observed mean speed - the inverse we need for live
 * data, because a traffic API reports speed, not density.
 *
 * On the congested branch:  v = q/k = w(kj - k)/k  =>  k = w*kj / (v + w)
 * At or above free-flow speed the inverse is not unique (the free branch is
 * vertical in v), so we fall back to the free-flow sub-branch.
 */
export function densityForSpeed(v: number, p: TrafficParams): number {
  const { kc, kj, w } = fundamentalDiagram(p);
  if (v >= p.vf) return kc * 0.35;
  const k = (w * kj) / (v + w);
  return Math.min(k, kj);
}

/* ------------------------------------------------------------------ */
/* 5. GREENSHIELDS - the smooth comparison model                       */
/* ------------------------------------------------------------------ */
/*
 * The older model assumes speed falls LINEARLY with density:
 *     v = vf (1 - k/kj)
 * so  q = k*v = vf*k(1 - k/kj)  - a downward parabola, peaking at kj/2.
 *
 * It is prettier, and it is wrong in a specific, interesting way: it puts the
 * peak at half the jam density and overestimates capacity by roughly 70%.
 * We plot both so the difference is visible rather than asserted.
 */

export const greenshieldsSpeed = (k: number, p: TrafficParams) =>
  Math.max(0, p.vf * (1 - k / jamDensity(p)));

export const greenshieldsFlow = (k: number, p: TrafficParams) =>
  k * greenshieldsSpeed(k, p);

export const greenshieldsCapacity = (p: TrafficParams) =>
  (p.vf * jamDensity(p)) / 4;

/* ------------------------------------------------------------------ */
/* 6. SHOCKWAVES - the slope of a chord                                */
/* ------------------------------------------------------------------ */
/*
 * Where two traffic states meet, the boundary between them moves at
 *
 *     u = (q2 - q1) / (k2 - k1)
 *
 * which is exactly the SLOPE OF THE CHORD joining the two states on the
 * flow-density diagram. A negative slope means the boundary runs upstream,
 * against the traffic. This is the single line of algebra that turns a
 * picture into a prediction.
 */

export interface TrafficState {
  /** density, veh/m */
  k: number;
  /** flow, veh/s */
  q: number;
}

export const stateAt = (k: number, p: TrafficParams): TrafficState => ({
  k,
  q: flowAt(k, p),
});

/** Shockwave speed between two states, m/s. Negative = travels upstream. */
export function shockwaveSpeed(a: TrafficState, b: TrafficState): number {
  if (Math.abs(b.k - a.k) < 1e-12) return 0;
  return (b.q - a.q) / (b.k - a.k);
}

/* ------------------------------------------------------------------ */
/* 7. LEVEL OF SERVICE - the standard A-F bands, by density            */
/* ------------------------------------------------------------------ */

export type LOS = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** Highway Capacity Manual bands, expressed in veh/mile/lane. */
const LOS_BANDS: Array<[LOS, number]> = [
  ['A', 11],
  ['B', 18],
  ['C', 26],
  ['D', 35],
  ['E', 45],
];

export function levelOfService(kPerMetre: number): LOS {
  const perMile = kPerMetre * VEHPM_TO_VEHPMI;
  for (const [grade, limit] of LOS_BANDS) if (perMile <= limit) return grade;
  return 'F';
}

/* ------------------------------------------------------------------ */
/* 8. Sampling helpers for the charts                                  */
/* ------------------------------------------------------------------ */

/** Sample the triangular diagram into points for plotting. */
export function sampleFundamental(p: TrafficParams, n = 160) {
  const { kj } = fundamentalDiagram(p);
  return Array.from({ length: n + 1 }, (_, i) => {
    const k = (kj * i) / n;
    return { k, q: flowAt(k, p), v: speedAt(k, p) };
  });
}

export function sampleGreenshields(p: TrafficParams, n = 160) {
  const kj = jamDensity(p);
  return Array.from({ length: n + 1 }, (_, i) => {
    const k = (kj * i) / n;
    return { k, q: greenshieldsFlow(k, p), v: greenshieldsSpeed(k, p) };
  });
}

/** Sample the spacing line s(v) = L + v*tau over a speed range. */
export function sampleSpacing(p: TrafficParams, vMaxMph = 75, n = 60) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const v = mphToMps((vMaxMph * i) / n);
    return { v, s: spacingAt(v, p) };
  });
}
