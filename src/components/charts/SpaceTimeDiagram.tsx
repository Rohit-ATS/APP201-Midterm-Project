import { useEffect, useRef } from 'react';
import { Axes, Figure, linear, M, useChartSize } from './chartKit';
import { Legend } from '../ui/primitives';
import type { Simulation } from '../../lib/simulation';
import { mpsToMph, waveSpeed, type TrafficParams } from '../../lib/trafficMath';

/**
 * THE SPACE-TIME DIAGRAM
 *
 * Distance up the page, time across it. Every thin line is one car.
 *
 * Read it like this:
 *   - the SLOPE of a car's line is its speed
 *   - lines that rise steeply are cars moving freely
 *   - lines that flatten out are cars crawling
 *   - where many lines flatten at once, that is a jam
 *
 * And then the thing the whole project is about: the jam itself is a shape on
 * this picture, and it LEANS THE OTHER WAY. Cars travel up and to the right.
 * The jam travels down and to the right — backwards up the street. The
 * dashed reference line has slope exactly -L/tau, and the jam's edge runs
 * parallel to it.
 */

const HISTORY_SECONDS = 110;
const SAMPLE_DT = 0.3;

interface Sample {
  t: number;
  pos: Float32Array;
  spd: Float32Array;
}

/** Slowness ramp: free-flow recedes into the surface, stopped traffic glows. */
const RAMP = ['#0d366b', '#1c5cab', '#2a78d6', '#3987e5', '#86b6ef', '#cde2fb'];

function slownessColor(v: number, vf: number): string {
  const t = Math.max(0, Math.min(1, 1 - v / Math.max(vf, 0.1)));
  const i = Math.min(RAMP.length - 1, Math.floor(t * RAMP.length));
  return RAMP[i];
}

export function SpaceTimeDiagram({
  sim,
  params,
  lane = 0,
  aspect = 0.56,
}: {
  sim: Simulation;
  params: TrafficParams;
  lane?: number;
  aspect?: number;
}) {
  const { ref, w, h } = useChartSize(aspect, 260, 460);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const history = useRef<Sample[]>([]);
  const lastSample = useRef(0);

  const plotW = w - M.left - M.right;
  const plotH = h - M.top - M.bottom;

  const w_mps = waveSpeed(params);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== plotW * dpr || canvas.height !== plotH * dpr) {
        canvas.width = Math.max(1, Math.round(plotW * dpr));
        canvas.height = Math.max(1, Math.round(plotH * dpr));
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, plotW, plotH);

      // ---- sample the simulation -------------------------------------
      const laneVehicles = sim.vehicles.filter((v) => v.lane === lane);
      if (sim.t - lastSample.current >= SAMPLE_DT && laneVehicles.length) {
        lastSample.current = sim.t;
        const ordered = [...laneVehicles].sort((a, b) => a.id - b.id);
        history.current.push({
          t: sim.t,
          pos: Float32Array.from(ordered, (v) => v.x),
          spd: Float32Array.from(ordered, (v) => v.v),
        });
        while (
          history.current.length > 2 &&
          sim.t - history.current[0].t > HISTORY_SECONDS
        ) {
          history.current.shift();
        }
      }

      const hist = history.current;
      if (hist.length < 2) return;

      const tNow = sim.t;
      const tMin = tNow - HISTORY_SECONDS;
      const L = sim.config.length;

      const sx = (t: number) => ((t - tMin) / HISTORY_SECONDS) * plotW;
      const sy = (x: number) => plotH - (x / L) * plotH;

      // ---- the trajectories -------------------------------------------
      // A real space-time diagram plots a SAMPLE of vehicles, not all of them.
      // At full density the lines touch and the picture turns into a solid
      // block, which hides the very structure it exists to show. Roughly 30
      // threads is where individual trajectories stay readable.
      const n = hist[hist.length - 1].pos.length;
      const stride = Math.max(1, Math.round(n / 30));
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';

      for (let i = 0; i < n; i += stride) {
        let prevX: number | null = null;
        let prevT = 0;
        for (let j = 0; j < hist.length; j++) {
          const s = hist[j];
          if (i >= s.pos.length) continue;
          const x = s.pos[i];
          if (prevX !== null) {
            // break the line where the loop wraps around
            const jump = x - prevX;
            if (Math.abs(jump) < L / 2) {
              ctx.beginPath();
              ctx.strokeStyle = slownessColor(s.spd[i], params.vf);
              ctx.moveTo(sx(prevT), sy(prevX));
              ctx.lineTo(sx(s.t), sy(x));
              ctx.stroke();
            }
          }
          prevX = x;
          prevT = s.t;
        }
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [sim, params.vf, lane, plotW, plotH]);

  // Reference line of slope -w. A backward wave LOSES position as time runs
  // forward, so it starts high on the left and ends lower on the right — the
  // mirror image of a vehicle trajectory.
  const refLine = (() => {
    const L = sim.config.length;
    const dtSpan = HISTORY_SECONDS * 0.8;
    const tEnd = HISTORY_SECONDS * 0.96;
    const tStart = tEnd - dtSpan;
    const startM = L * 0.92;
    const endM = startM - w_mps * dtSpan;
    return {
      tStart,
      tEnd,
      startMi: startM / 1609.344,
      endMi: Math.max(0, endM) / 1609.344,
    };
  })();

  const xScale = linear([0, HISTORY_SECONDS], [M.left, w - M.right]);
  const yScale = linear([0, sim.config.length / 1609.344], [h - M.bottom, M.top]);

  return (
    <Figure
      caption={
        <>
          Each line is one vehicle in the right-hand lane. The dashed yellow line has slope
          exactly <b style={{ color: 'var(--ink-secondary)' }}>&minus;L/&tau; = &minus;
          {mpsToMph(w_mps).toFixed(1)} mph</b>. Notice that the jams line up with it, and that
          they lean the opposite way to the cars: the traffic goes one direction, the traffic
          jam goes the other. The plot draws itself from the right as the simulation runs, so
          give it a few seconds to fill.
        </>
      }
    >
      <div ref={ref} style={{ width: '100%', position: 'relative' }}>
        <svg width={w} height={h} style={{ display: 'block' }} aria-hidden="true">
          <Axes
            x={xScale}
            y={yScale}
            xLabel="Time — seconds (now at the right)"
            yLabel="Distance — miles"
            grid="both"
            xFormat={(v) => `${Math.round(v - HISTORY_SECONDS)}`}
            yFormat={(v) => v.toFixed(1)}
          />
        </svg>

        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            left: M.left,
            top: M.top,
            width: plotW,
            height: plotH,
            pointerEvents: 'none',
          }}
        />

        {/* the -L/tau reference slope, on top of the trajectories */}
        <svg
          width={w}
          height={h}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          aria-hidden="true"
        >
          <line
            x1={xScale(refLine.tStart)}
            y1={yScale(refLine.startMi)}
            x2={xScale(refLine.tEnd)}
            y2={yScale(refLine.endMi)}
            stroke="var(--series-4)"
            strokeWidth={2.25}
            strokeDasharray="7 4"
          />
          <text
            className="chart-tick"
            x={xScale((refLine.tStart + refLine.tEnd) / 2)}
            y={yScale((refLine.startMi + refLine.endMi) / 2) - 10}
            textAnchor="middle"
            fill="var(--series-4)"
            style={{ fontWeight: 700 }}
          >
            slope = &minus;L/&tau; = &minus;{mpsToMph(w_mps).toFixed(1)} mph
          </text>
        </svg>
      </div>

      <Legend
        items={[
          { label: 'Free flowing', color: RAMP[0] },
          { label: 'Slowing', color: RAMP[2] },
          { label: 'Stopped', color: RAMP[5] },
          { label: 'Predicted wave slope −L/τ', color: 'var(--series-4)', dashed: true },
        ]}
      />
    </Figure>
  );
}
