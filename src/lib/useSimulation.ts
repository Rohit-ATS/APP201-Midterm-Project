import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Simulation, DEFAULT_SIM, type SimConfig } from './simulation';
import { type TrafficParams, mpsToMph } from './trafficMath';

export interface SimStats {
  meanSpeedMph: number;
  /** the live mean the loop is calibrating toward, mph (null when free) */
  targetMph: number | null;
  /** the cruise-speed multiplier the loop has settled on */
  speedScale: number;
  densityPerMile: number;
  flowPerHour: number;
  /** measured backward wave speed, mph (negative = upstream). null if no jam */
  measuredWaveMph: number | null;
}

export interface SimulationHook {
  sim: Simulation;
  stats: SimStats;
  running: boolean;
  setRunning: (r: boolean) => void;
  speed: number;
  setSpeed: (s: number) => void;
  config: SimConfig;
  setConfig: (patch: Partial<SimConfig>) => void;
  perturb: () => void;
  reset: () => void;
  /** tell the loop what mean speed, in mph, the street is actually doing */
  setTargetMeanMph: (mph: number | null) => void;
  /** monotonically increasing frame counter — subscribe to force a redraw */
  frame: number;
}

const PHYSICS_DT = 0.05; // s — small enough to stay well inside tau

/**
 * Runs the simulation on a single animation loop and hands the live object to
 * whoever needs it. The 3D scene and the space-time diagram both read from the
 * SAME Simulation instance, so what you watch in the plot is literally the
 * traffic you are watching in the 3D view — not a second model that happens to
 * look similar.
 */
export function useSimulation(params: TrafficParams): SimulationHook {
  const [config, setConfigState] = useState<SimConfig>(DEFAULT_SIM);
  const [running, setRunning] = useState(true);
  // 1 = real time. The simulation used to run at 3x, which made the traffic
  // look like a time-lapse and made the geometry impossible to talk through:
  // you cannot point at a wave travelling 12 mph backwards if the clock is
  // lying by a factor of three.
  const [speed, setSpeed] = useState(1);
  const [frame, setFrame] = useState(0);
  const [stats, setStats] = useState<SimStats>({
    meanSpeedMph: 0,
    targetMph: null,
    speedScale: 1.6,
    densityPerMile: 0,
    flowPerHour: 0,
    measuredWaveMph: null,
  });

  const sim = useMemo(() => new Simulation(config, params), []); // eslint-disable-line react-hooks/exhaustive-deps

  // keep the live object's parameters in sync without rebuilding the traffic
  useEffect(() => {
    sim.params = params;
  }, [sim, params]);

  useEffect(() => {
    const needsReset =
      sim.config.perLane !== config.perLane ||
      sim.config.lanes !== config.lanes ||
      sim.config.length !== config.length;
    sim.config = config;
    if (needsReset) sim.reset();
  }, [sim, config]);

  // ---- the loop --------------------------------------------------------
  const frontRef = useRef<{ x: number; t: number } | null>(null);
  const waveRef = useRef<number | null>(null);
  const targetRef = useRef<number | null>(null);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let statsAcc = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const realDt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!running) return;

      acc += realDt * speed;
      let steps = 0;
      while (acc >= PHYSICS_DT && steps < 40) {
        sim.step(PHYSICS_DT);
        acc -= PHYSICS_DT;
        steps++;
      }

      // --- measure the wave speed from the vehicles themselves ----------
      const x = sim.jamFrontPosition();
      if (x !== null) {
        const prev = frontRef.current;
        if (prev && sim.t > prev.t) {
          let dx = x - prev.x;
          // unwrap around the loop
          if (dx > sim.config.length / 2) dx -= sim.config.length;
          if (dx < -sim.config.length / 2) dx += sim.config.length;
          const u = dx / (sim.t - prev.t);
          if (Math.abs(u) < 30) {
            // exponential smoothing — a single frame is far too noisy
            waveRef.current =
              waveRef.current === null ? u : waveRef.current * 0.94 + u * 0.06;
          }
        }
        frontRef.current = { x, t: sim.t };
      } else {
        frontRef.current = null;
      }

      statsAcc += realDt;
      if (statsAcc > 0.25) {
        statsAcc = 0;

        // ---- calibration ------------------------------------------------
        // Nudge the cruise-speed scale until the simulated mean matches the
        // mean TomTom measured. Gentle gain: this should settle over a few
        // seconds, not chase every fluctuation in the feed.
        const target = targetRef.current;
        if (target !== null && target > 0.5 && sim.speedProfile.length) {
          const err = target - mpsToMph(sim.meanSpeed());
          sim.speedScale = Math.max(0.6, Math.min(4.5, sim.speedScale + err * 0.016));
        }

        setStats({
          meanSpeedMph: mpsToMph(sim.meanSpeed()),
          targetMph: targetRef.current,
          speedScale: sim.speedScale,
          densityPerMile: sim.density() * 1609.344,
          flowPerHour: sim.flow() * 3600,
          measuredWaveMph: waveRef.current === null ? null : mpsToMph(waveRef.current),
        });
        // React re-renders four times a second, not sixty: the 3D scene and the
        // space-time canvas each draw from the live simulation object on their
        // own animation loop, so forcing a re-render per frame would cost a lot
        // and buy nothing.
        setFrame((f) => f + 1);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sim, running, speed]);

  const setConfig = useCallback(
    (patch: Partial<SimConfig>) => setConfigState((c) => ({ ...c, ...patch })),
    [],
  );

  const perturb = useCallback(() => sim.perturb(), [sim]);

  const setTargetMeanMph = useCallback((mph: number | null) => {
    targetRef.current = mph;
  }, []);

  const reset = useCallback(() => {
    sim.reset();
    waveRef.current = null;
    frontRef.current = null;
  }, [sim]);

  return {
    sim,
    stats,
    running,
    setRunning,
    speed,
    setSpeed,
    config,
    setConfig,
    perturb,
    reset,
    setTargetMeanMph,
    frame,
  };
}
