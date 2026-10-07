/**
 * newell.ts
 * ---------------------------------------------------------------------------
 * Exact, replayable car-following for the animated proof.
 *
 * The live simulation elsewhere on the site steps forward in real time, which
 * is right for a dashboard but wrong for a film you can scrub backwards. Here
 * the whole run is computed once, up front, so any scroll position maps to one
 * moment and the picture is identical every time you return to it.
 *
 * The rule is the spacing line, nothing else. A driver keeps s = L + v*tau of
 * road, which is the same as saying: do exactly what the car ahead did, tau
 * seconds later and L metres further back (Newell, 2002).
 *
 *     x_n(t) = min( x_n(t - dt) + vf*dt ,  x_{n-1}(t - tau) - L )
 *
 * Because every follower is a shifted copy of its leader, any disturbance is
 * handed back one car every tau seconds, a distance L each time. That is a
 * wave travelling upstream at exactly L / tau, and the animation shows it
 * without being told to.
 */

import type { TrafficParams } from '../lib/trafficMath.ts';
import { STARTUP_LOST_TIME, saturationHeadway } from '../lib/trafficMath.ts';

export interface Run {
  /** seconds between samples */
  dt: number;
  /** number of samples */
  steps: number;
  /** total duration, s */
  duration: number;
  /** x[car][step], metres, front bumper */
  x: Float32Array[];
}

/** Position of one car at an arbitrary time, linearly interpolated. */
export function posAt(run: Run, car: number, t: number): number {
  const xs = run.x[car];
  const f = Math.min(Math.max(t / run.dt, 0), run.steps - 1);
  const i = Math.floor(f);
  const j = Math.min(i + 1, run.steps - 1);
  return xs[i] + (xs[j] - xs[i]) * (f - i);
}

/** Speed of one car at time t, m/s, by central difference. */
export function speedAt(run: Run, car: number, t: number): number {
  const h = run.dt * 2;
  return (posAt(run, car, t + h) - posAt(run, car, t - h)) / (2 * h);
}

/** Acceleration of one car at time t, m/s². Negative means the brake lights are on. */
export function accelAt(run: Run, car: number, t: number): number {
  const h = 0.25;
  return (speedAt(run, car, t + h) - speedAt(run, car, t - h)) / (2 * h);
}

/**
 * Integrate a chain of followers behind a prescribed leader.
 *
 * `history(n, t)` supplies car n's position for t < 0, so a queue can start
 * already stopped and a moving platoon can start already moving.
 */
function follow(
  leader: (t: number) => number,
  cars: number,
  duration: number,
  p: TrafficParams,
  history: (n: number, t: number) => number,
  dt = 0.05,
): Run {
  const steps = Math.ceil(duration / dt) + 1;
  const lag = Math.round(p.tau / dt);
  const x: Float32Array[] = [];

  const lead = new Float32Array(steps);
  for (let i = 0; i < steps; i++) lead[i] = leader(i * dt);
  x.push(lead);

  for (let n = 1; n < cars; n++) {
    const me = new Float32Array(steps);
    const ahead = x[n - 1];
    me[0] = history(n, 0);
    for (let i = 1; i < steps; i++) {
      const j = i - lag;
      const aheadLagged = j >= 0 ? ahead[j] : history(n - 1, j * dt);
      const free = me[i - 1] + p.vf * dt;
      // never reverse: a stopped car stays stopped
      me[i] = Math.max(me[i - 1], Math.min(free, aheadLagged - p.L));
    }
    x.push(me);
  }

  return { dt, steps, duration, x };
}

/* ------------------------------------------------------------------ */
/* Scenario 1: one driver taps the brakes                              */
/* ------------------------------------------------------------------ */

export interface BrakeRun extends Run {
  /** cruising speed of the platoon, m/s */
  v0: number;
  /** time the first driver starts braking, s */
  brakeAt: number;
  /** time the first driver is fully stopped, s */
  stopAt: number;
  /** where the first driver stops, m */
  stopX: number;
  /** how long the first driver stays stopped, s */
  hold: number;
}

/**
 * A platoon cruising at v0, each car exactly on the spacing line. At brakeAt
 * the front driver brakes to a stop, waits, and pulls away again. Nobody else
 * is told anything.
 */
export function brakeScenario(p: TrafficParams, cars = 64, duration = 44): BrakeRun {
  const v0 = Math.min(p.vf * 0.82, 11);
  const s0 = p.L + v0 * p.tau;
  const brakeAt = 2.5;
  const decel = 3.2;
  const hold = 3.5;
  const accel = 1.6;
  const tStop = v0 / decel;
  const dStop = (v0 * v0) / (2 * decel);
  const x0 = 40; // front car's starting position

  const stopAt = brakeAt + tStop;
  const goAt = stopAt + hold;
  const stopX = x0 + v0 * brakeAt + dStop;

  const leader = (t: number) => {
    if (t <= brakeAt) return x0 + v0 * t;
    if (t <= stopAt) {
      const u = t - brakeAt;
      return x0 + v0 * brakeAt + v0 * u - 0.5 * decel * u * u;
    }
    if (t <= goAt) return stopX;
    const u = t - goAt;
    const tUp = v0 / accel;
    if (u <= tUp) return stopX + 0.5 * accel * u * u;
    return stopX + 0.5 * accel * tUp * tUp + v0 * (u - tUp);
  };

  const history = (n: number, t: number) => x0 - n * s0 + v0 * t;
  const run = follow(leader, cars, duration, { ...p, vf: v0 }, history);
  return { ...run, v0, brakeAt, stopAt, stopX, hold };
}

/* ------------------------------------------------------------------ */
/* Scenario 2: a red light turns green                                 */
/* ------------------------------------------------------------------ */

export interface QueueRun extends Run {
  /** seconds of green */
  green: number;
  /** crossing time of each car at the stop line (x = 0), s, or Infinity */
  crossings: number[];
  /** front car's launch acceleration, m/s² */
  launch: number;
}

/**
 * A queue standing bumper to bumper behind a stop line at x = 0. The light
 * goes green at t = 0.
 *
 * The front car's launch acceleration is not a free choice. Car n is car 0
 * shifted by n*tau and n*L, so car n reaches the line at
 *
 *     t_n = n*(tau + L/vf) + d0/vf + vf/(2a)  =  n*h + d0/vf + vf/(2a)
 *
 * The textbook count is n = (green - lost)/h, which assumes car n crosses at
 * lost + (n+1)*h. Setting those equal fixes a, and it comes out at a calm,
 * realistic 1.7 m/s²: the same model that makes the jam wave also produces
 * the startup lost time a traffic engineer measures with a stopwatch.
 */
export function queueScenario(p: TrafficParams, green: number, cars = 26): QueueRun {
  const d0 = 1; // front bumper starts 1 m behind the line
  const h = saturationHeadway(p);
  const launch = p.vf / (2 * (STARTUP_LOST_TIME + h - d0 / p.vf));
  const duration = green + 6;

  const tUp = p.vf / launch;
  const dUp = 0.5 * launch * tUp * tUp;
  const leader = (t: number) => {
    if (t <= 0) return -d0;
    if (t <= tUp) return -d0 + 0.5 * launch * t * t;
    return -d0 + dUp + p.vf * (t - tUp);
  };
  const history = (n: number) => -d0 - n * p.L;
  const run = follow(leader, cars, duration, p, history);

  const crossingOf = (xs: Float32Array) => {
    for (let i = 1; i < xs.length; i++) {
      if (xs[i - 1] < 0 && xs[i] >= 0) {
        const f = -xs[i - 1] / (xs[i] - xs[i - 1]);
        return (i - 1 + f) * run.dt;
      }
    }
    return Infinity;
  };

  // The light goes red at t = green. Every car that has not crossed by then
  // brakes smoothly to a stop in a fresh queue behind the line.
  const iRed = Math.round(green / run.dt);
  let place = 0;
  for (const xs of run.x) {
    if (crossingOf(xs) <= green) continue;
    const xr = xs[iRed];
    const vr = (xs[iRed] - xs[iRed - 1]) / run.dt;
    const target = -d0 - place * p.L;
    place++;
    const room = target - xr;
    if (room <= 0.01 || vr <= 0.01) {
      for (let i = iRed; i < run.steps; i++) xs[i] = Math.min(xs[i], Math.max(xr, xs[iRed]));
      continue;
    }
    const dec = (vr * vr) / (2 * room);
    const tStop = vr / dec;
    for (let i = iRed; i < run.steps; i++) {
      const u = Math.min((i - iRed) * run.dt, tStop);
      xs[i] = Math.min(xs[i], xr + vr * u - 0.5 * dec * u * u);
    }
  }

  const crossings = run.x.map(crossingOf);
  return { ...run, green, crossings, launch };
}
