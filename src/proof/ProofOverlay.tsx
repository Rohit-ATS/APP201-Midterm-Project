/**
 * ProofOverlay.tsx
 * ---------------------------------------------------------------------------
 * The words, formulas and small charts that sit over the 3D scene. Each
 * chapter reveals itself line by line as you scroll through it, and every
 * number on it is computed from the same model the cars are following.
 */

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import {
  fundamentalDiagram,
  mpsToMph,
  mToFt,
  saturationHeadway,
  spacingAt,
  speedAt as fdSpeedAt,
  STARTUP_LOST_TIME,
  vehiclesPerGreen,
  type TrafficParams,
} from '../lib/trafficMath';
import { meanVehicleLength, VEHICLE_CLASSES } from '../data/vehicleMix';
import { posAt, speedAt, type BrakeRun, type QueueRun } from './newell';
import { CHAPTERS, split, span, easeOut, useStory, type ChapterId } from './story';
import { flipPerMile, greenTime, heroSpeed, jamTime, MILE, sweepK, WILSHIRE } from './beats';

export interface OverlayData {
  params: TrafficParams;
  brake: BrakeRun;
  queue: QueueRun;
}

type Nav = (v: 'overview' | 'live' | 'proof' | 'maths' | 'creation') => void;

/* ------------------------------------------------------------------ */
/* reveal helpers                                                      */
/* ------------------------------------------------------------------ */

/** A line that slides and un-blurs in once p passes `at`. */
function R({ p, at, children, className = '', style }: { p: number; at: number; children: ReactNode; className?: string; style?: CSSProperties }) {
  const k = easeOut(span(p, at, at + 0.07));
  return (
    <div
      className={`p-reveal ${className}`}
      style={{
        ...style,
        opacity: k,
        transform: `translateY(${(1 - k) * 18}px)`,
      }}
    >
      {children}
    </div>
  );
}

/** A number that rolls to its value. */
// one formatter per precision: toLocaleString with options builds a new one on every call
const FORMATS = [0, 1, 2].map((d) => new Intl.NumberFormat(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmt = (n: number, d = 0) => FORMATS[d].format(n);

function Card({ p, step, title, children, wide }: { p: number; step: string; title: string; children: ReactNode; wide?: boolean }) {
  const inK = easeOut(span(p, 0.0, 0.08));
  const outK = span(p, 0.93, 1);
  return (
    <div
      className={`p-card ${wide ? 'p-card-wide' : ''}`}
      style={{ opacity: inK * (1 - outK), transform: `translateY(${(1 - inK) * 30 - outK * 30}px)` }}
    >
      <div className="p-step">{step}</div>
      <h2 className="p-title">{title}</h2>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* mini charts                                                         */
/* ------------------------------------------------------------------ */

/** The spacing line s = L + vτ, with a dot riding it at the hero's speed. */
function SpacingMini({ params, v, reveal }: { params: TrafficParams; v: number; reveal: number }) {
  const W = 300;
  const H = 150;
  const pad = { l: 38, r: 10, t: 10, b: 28 };
  const vMax = params.vf * 1.05;
  const sMax = spacingAt(vMax, params) * 1.1;
  const X = (vv: number) => pad.l + (vv / vMax) * (W - pad.l - pad.r);
  const Y = (s: number) => H - pad.b - (s / sMax) * (H - pad.t - pad.b);
  const lineEnd = vMax * reveal;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="p-chart">
      <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} className="p-axis" />
      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} className="p-axis" />
      <text x={W - pad.r} y={H - 8} className="p-tick" textAnchor="end">speed v →</text>
      <text x={pad.l - 6} y={pad.t + 8} className="p-tick" textAnchor="end">s</text>
      <line x1={X(0)} y1={Y(spacingAt(0, params))} x2={X(lineEnd)} y2={Y(spacingAt(lineEnd, params))} className="p-glowline-under" />
      <line x1={X(0)} y1={Y(spacingAt(0, params))} x2={X(lineEnd)} y2={Y(spacingAt(lineEnd, params))} stroke="var(--series-1)" strokeWidth={3} />
      <circle cx={X(0)} cy={Y(params.L)} r={4} fill="var(--series-4)" />
      <text x={X(0) + 8} y={Y(params.L) + 14} className="p-tick" fill="var(--series-4)">L (intercept)</text>
      <text x={X(vMax * 0.45)} y={Y(spacingAt(vMax * 0.45, params)) - 14} className="p-tick" fill="var(--series-1)" textAnchor="end">slope = τ</text>
      <circle cx={X(v)} cy={Y(spacingAt(v, params))} r={7} fill="#fff" className="p-pulse" />
      <line x1={X(v)} y1={Y(spacingAt(v, params))} x2={X(v)} y2={H - pad.b} stroke="rgba(255,255,255,.35)" strokeDasharray="3 3" />
    </svg>
  );
}

const ST = { W: 340, H: 170, pad: { l: 30, r: 8, t: 8, b: 24 }, xMin: -420, xMax: 220 };
const stX = (tt: number, T: number) => ST.pad.l + (tt / T) * (ST.W - ST.pad.l - ST.pad.r);
const stY = (x: number) => ST.H - ST.pad.b - ((x - ST.xMin) / (ST.xMax - ST.xMin)) * (ST.H - ST.pad.t - ST.pad.b);

const pathCache = new WeakMap<BrakeRun, { d: string; stopped: string }[]>();

/** Every car's trajectory as SVG path data, cached per run. */
export function spaceTimePaths(brake: BrakeRun) {
  const hit = pathCache.get(brake);
  if (hit) return hit;
  const out: { d: string; stopped: string }[] = [];
  for (let n = 0; n < brake.x.length; n += 1) {
    let d = '';
    let stopped = '';
    let inStop = false;
    for (let i = 0; i < brake.steps; i += 4) {
      const tt = i * brake.dt;
      const x = brake.x[n][i];
      if (x < ST.xMin - 40 || x > ST.xMax + 40) continue;
      const px = stX(tt, brake.duration).toFixed(1);
      const py = stY(x).toFixed(1);
      d += d ? `L${px} ${py}` : `M${px} ${py}`;
      const v = speedAt(brake, n, tt);
      if (v < 2.5) {
        stopped += inStop ? `L${px} ${py}` : `M${px} ${py}`;
        inStop = true;
      } else inStop = false;
    }
    if (d) out.push({ d, stopped });
  }
  pathCache.set(brake, out);
  return out;
}

/** Space-time diagram: every car's trajectory, drawn up to "now". */
const layerCache = new WeakMap<BrakeRun, HTMLCanvasElement>();
const LAYER_SCALE = 2;

/**
 * Every car's trajectory drawn once into an off-screen canvas. Each frame then
 * copies only the slice of time revealed so far, which costs almost nothing —
 * re-rendering 128 clipped SVG paths every frame did not.
 */
export function spaceTimeLayer(brake: BrakeRun) {
  const hit = layerCache.get(brake);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = ST.W * LAYER_SCALE;
  c.height = ST.H * LAYER_SCALE;
  const g = c.getContext('2d')!;
  g.scale(LAYER_SCALE, LAYER_SCALE);
  g.lineJoin = 'round';
  const paths = spaceTimePaths(brake);
  g.strokeStyle = 'rgba(134,182,239,.55)';
  g.lineWidth = 1;
  for (const p of paths) g.stroke(new Path2D(p.d));
  for (const [width, color] of [
    [7, 'rgba(255,59,59,.22)'],
    [2.2, '#ff4d4d'],
  ] as const) {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'round';
    for (const p of paths) if (p.stopped) g.stroke(new Path2D(p.stopped));
  }
  layerCache.set(brake, c);
  return c;
}

/** Space-time diagram: every car's trajectory, drawn up to "now". */
function SpaceTime({ brake, params, t }: { brake: BrakeRun; params: TrafficParams; t: number }) {
  const { W, H, pad } = ST;
  const T = brake.duration;
  const X = (tt: number) => stX(tt, T);
  const Y = stY;
  const canvas = useRef<HTMLCanvasElement>(null);

  const w = params.L / params.tau;
  const t0 = brake.stopAt;
  const tEnd = Math.min(t, T);
  const showWave = t > t0;

  useLayoutEffect(() => {
    const c = canvas.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const layer = spaceTimeLayer(brake);
    g.clearRect(0, 0, c.width, c.height);
    const sw = Math.max(1, Math.round(stX(tEnd, T) * LAYER_SCALE));
    g.drawImage(layer, 0, 0, sw, layer.height, 0, 0, sw, layer.height);
  }, [brake, tEnd, T]);

  return (
    <div className="p-chart p-chart-stack">
      <canvas ref={canvas} width={W * LAYER_SCALE} height={H * LAYER_SCALE} />
      <svg viewBox={`0 0 ${W} ${H}`}>
        <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} className="p-axis" />
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} className="p-axis" />
        <text x={W - pad.r} y={H - 6} className="p-tick" textAnchor="end">time →</text>
        <text x={0} y={0} className="p-tick" textAnchor="end" transform={`translate(${pad.l - 8} ${pad.t}) rotate(-90)`}>
          ← position along the street
        </text>
        {showWave && (
          <line
            x1={X(t0)}
            y1={Y(brake.stopX)}
            x2={X(tEnd)}
            y2={Y(brake.stopX - w * (tEnd - t0))}
            stroke="#fff"
            strokeWidth={2}
            strokeDasharray="5 4"
          />
        )}
        {showWave && (
          <text x={X(tEnd) - 4} y={Y(brake.stopX - w * (tEnd - t0)) + 16} className="p-tick" fill="#fff" textAnchor="end">
            slope = −L/τ
          </text>
        )}
        <line x1={X(tEnd)} y1={pad.t} x2={X(tEnd)} y2={H - pad.b} stroke="rgba(255,255,255,.25)" />
      </svg>
    </div>
  );
}

/** One tick per car crossing the stop line during the green. */
function GreenTimeline({ queue, t }: { queue: QueueRun; t: number }) {
  const W = 320;
  const H = 70;
  const pad = 10;
  const T = queue.green + 5;
  const X = (tt: number) => pad + (Math.max(tt, 0) / T) * (W - 2 * pad);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="p-chart">
      <rect x={X(0)} y={22} width={X(queue.green) - X(0)} height={16} fill="rgba(43,255,138,.14)" stroke="rgba(43,255,138,.5)" />
      <rect x={X(queue.green)} y={22} width={X(queue.green + 3) - X(queue.green)} height={16} fill="rgba(255,176,0,.2)" />
      {queue.crossings.map((c, i) =>
        Number.isFinite(c) ? (
          <line key={i} x1={X(c)} x2={X(c)} y1={14} y2={46} stroke={c <= t ? '#fff' : 'rgba(255,255,255,.12)'} strokeWidth={c <= t ? 2 : 1} />
        ) : null,
      )}
      <line x1={X(t)} x2={X(t)} y1={6} y2={54} stroke="var(--series-4)" strokeWidth={2} />
      <text x={X(0)} y={66} className="p-tick">green</text>
      <text x={X(queue.green)} y={66} className="p-tick" textAnchor="middle">red</text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* chapters                                                            */
/* ------------------------------------------------------------------ */

function Chapter({ id, p, d, onNavigate }: { id: ChapterId; p: number; d: OverlayData; onNavigate: Nav }) {
  const { params, brake, queue } = d;
  const fd = fundamentalDiagram(params);
  const Lc = meanVehicleLength();
  const ft = (m: number, dd = 1) => fmt(mToFt(m), dd);
  const wMph = mpsToMph(params.L / params.tau);

  switch (id) {
    case 'intro': {
      const out = span(p, 0.55, 0.95);
      return (
        <div className="p-hero" style={{ opacity: 1 - out, transform: `scale(${1 + out * 0.15})` }}>
          <div className="p-kicker">The proof, animated · scroll slowly</div>
          <h1 className="p-display">
            {'Watch the math'.split('').map((ch, i) => (
              <span key={i} className="p-letter" style={{ animationDelay: `${i * 0.04}s` }}>
                {ch === ' ' ? ' ' : ch}
              </span>
            ))}
            <br />
            <span className="p-grad">make a traffic jam.</span>
          </h1>
          <p className="p-sub">
            Every car you are about to see is placed by the same formulas as the Mathematics page.
            When the jam shows up, it is the equations doing it, not me. Nine steps, one straight line.
          </p>
          <div className="p-scrollcue">
            <span>scroll</span>
            <i />
          </div>
        </div>
      );
    }

    case 'own':
      return (
        <Card p={p} step="Step 1 · Notice" title="How much road does one car need?">
          <R p={p} at={0.04}>
            <p>Start with one car stopped at a red light on Figueroa. It is taking up road, but how much?</p>
          </R>
          <R p={p} at={0.14}>
            <div className="p-row">
              <span className="p-chip">the car</span>
              <b>{ft(Lc)} ft</b>
              <span className="p-muted">average of what drives Figueroa</span>
            </div>
          </R>
          <R p={p} at={0.38}>
            <div className="p-row">
              <span className="p-chip p-chip-y">the gap</span>
              <b>{ft(params.L - Lc)} ft</b>
              <span className="p-muted">nobody stops touching bumpers</span>
            </div>
          </R>
          <R p={p} at={0.62}>
            <div className="p-formula p-formula-y">
              L = {ft(Lc)} + {ft(params.L - Lc)} = <b>{ft(params.L)} ft</b>
            </div>
          </R>
          <R p={p} at={0.74}>
            <div className="p-mix">
              {VEHICLE_CLASSES.map((v) => (
                <div key={v.id} style={{ flex: v.share }} title={`${v.label} ${Math.round(v.share * 100)}%`} className={`p-mix-${v.id}`} />
              ))}
            </div>
            <p className="p-small">
              L is not a guess. It is the weighted average of the real fleet (40% sedans, 29% SUVs, about one bus in
              twenty-two) plus the stopped gap. This one number is the y-intercept of everything that follows.
            </p>
          </R>
        </Card>
      );

    case 'gap': {
      const v = heroSpeed(p, params);
      const s = spacingAt(v, params);
      return (
        <Card p={p} step="Step 2 · The rule" title="Faster means more room.">
          <R p={p} at={0.04}>
            <p>
              Drivers do not keep a gap in feet. They keep it in <em>seconds</em>, like the two-second rule. Here
              that time is τ = {params.tau.toFixed(1)} s, so the gap grows with speed.
            </p>
          </R>
          <R p={p} at={0.12}>
            <div className="p-formula">
              s = L + v·τ
              <span className="p-live">
                = {ft(params.L)} + <span style={{ color: 'var(--series-1)' }}>{fmt(mpsToMph(v), 0)} mph × {params.tau.toFixed(1)} s</span> ={' '}
                <b>{ft(s)} ft</b>
              </span>
            </div>
          </R>
          <R p={p} at={0.22}>
            <SpacingMini params={params} v={v} reveal={easeOut(span(p, 0.22, 0.5))} />
          </R>
          <R p={p} at={0.78}>
            <p className="p-small">
              That is a <strong>straight line</strong>. Its slope is the reaction time and its intercept is the length
              of a car. Every other result on this page is this line, rearranged.
            </p>
          </R>
        </Card>
      );
    }

    case 'flip': {
      const perMile = flipPerMile(p, params);
      const s = MILE / perMile;
      const v = Math.min(params.vf, Math.max(0, (s - params.L) / params.tau));
      const jammed = span(p, 0.8, 0.86);
      return (
        <Card p={p} step="Step 3 · Flip it" title="Turn a length upside down, get a count.">
          <R p={p} at={0.04}>
            <p>If each car needs s feet of road, a mile of road holds 5,280 ÷ s cars. That count is the density.</p>
          </R>
          <R p={p} at={0.1}>
            <div className="p-formula">k = 1 / s</div>
          </R>
          <R p={p} at={0.14}>
            <div className="p-counter">
              <div>
                <span className="p-big tabular" style={{ color: 'var(--series-2)' }}>{fmt(perMile)}</span>
                <span className="p-unit">cars in this mile</span>
              </div>
              <div>
                <span className="p-big tabular" style={{ color: v < 2 ? 'var(--critical)' : 'var(--series-1)' }}>{fmt(mpsToMph(v))}</span>
                <span className="p-unit">mph, forced by the rule</span>
              </div>
            </div>
          </R>
          <R p={p} at={0.3}>
            <p className="p-small">
              Watch the brake lights come on. As the cars pack in, each one has less room, so the spacing line forces
              it to slow: v = (s − L)/τ.
            </p>
          </R>
          <div style={{ opacity: jammed }}>
            <div className="p-formula p-formula-r">
              bumper to bumper: k<sub>j</sub> = 1/L = <b>{fmt(fd.kj * MILE)} cars per mile</b>
            </div>
          </div>
        </Card>
      );
    }

    case 'flow': {
      const k = sweepK('flow', p, params);
      const v = fdSpeedAt(k, params);
      const q = k * v;
      return (
        <Card p={p} step="Step 4 · Count them" title="How many cars get past per hour?">
          <R p={p} at={0.03}>
            <p>Stand at the glowing gate and count. That rate is the <strong>flow</strong>: how packed the cars are, times how fast they move.</p>
          </R>
          <R p={p} at={0.08}>
            <div className="p-eq tabular">
              <span style={{ color: 'var(--series-2)' }}>{fmt(k * MILE)}<small>cars/mi</small></span>
              <i>×</i>
              <span style={{ color: 'var(--series-1)' }}>{fmt(mpsToMph(v))}<small>mph</small></span>
              <i>=</i>
              <span style={{ color: 'var(--series-3)' }}>{fmt(q * 3600)}<small>cars/hr</small></span>
            </div>
            <div className="p-formula">q = k · v</div>
          </R>
          <R p={p} at={0.2}>
            <p className="p-small">
              The glowing dot above the road is this exact pair (k, q). I am sweeping the density from an empty road to a
              parked one. Watch the shape the dot leaves behind.
            </p>
          </R>
          <R p={p} at={0.6}>
            <p className="p-small">
              Empty road: hardly anyone to count. Packed road: nobody moving. The best the lane ever does is somewhere
              in between, at the corner.
            </p>
          </R>
        </Card>
      );
    }

    case 'triangle':
      return (
        <Card p={p} step="Step 5 · The shape" title="Two straight lines and a peak.">
          <R p={p} at={0.04}>
            <div className="p-alg">
              <span className="p-tag p-tag-b">empty road</span> everyone drives at v<sub>f</sub>, so q = v<sub>f</sub> · k
            </div>
          </R>
          <R p={p} at={0.16}>
            <div className="p-alg">
              <span className="p-tag p-tag-o">full road</span> put v = (s − L)/τ and s = 1/k into q = k·v:
            </div>
          </R>
          <R p={p} at={0.26} className="p-algline">q = k · (1/k − L) / τ</R>
          <R p={p} at={0.36} className="p-algline">q = (1 − kL) / τ</R>
          <R p={p} at={0.46} className="p-algline p-algline-hi">
            q = 1/τ − <span className="p-hl">(L/τ)</span> · k
          </R>
          <R p={p} at={0.56}>
            <p className="p-small">
              Also a straight line, falling with slope <b style={{ color: 'var(--series-2)' }}>−L/τ</b>. The two lines
              cross at the peak: the most one lane can ever carry.
            </p>
          </R>
          <R p={p} at={0.66}>
            <div className="p-counter">
              <div>
                <span className="p-big tabular" style={{ color: 'var(--series-4)' }}>{fmt(fd.qmax * 3600)}</span>
                <span className="p-unit">cars/hr, capacity</span>
              </div>
              <div>
                <span className="p-big tabular">{fmt(fd.kc * MILE)}</span>
                <span className="p-unit">cars/mi, where it breaks</span>
              </div>
            </div>
          </R>
        </Card>
      );

    case 'slope': {
      const k = sweepK('slope', p, params);
      const v = fdSpeedAt(k, params);
      const strike = easeOut(span(p, 0.12, 0.3));
      return (
        <Card p={p} step="Step 6 · Read the slopes" title="On this picture, every slope is a speed.">
          <R p={p} at={0.03}>
            <p>Divide the two axes and watch what cancels:</p>
          </R>
          <R p={p} at={0.06}>
            <div className="p-units">
              <div className="p-frac">
                <span>
                  <s style={{ opacity: 1 - strike * 0.6, transform: `translate(${strike * 40}px, ${-strike * 30}px) rotate(${strike * 25}deg)` }}>cars</s>
                  /hour
                </span>
                <span>
                  <s style={{ opacity: 1 - strike * 0.6, transform: `translate(${strike * 40}px, ${strike * 30}px) rotate(${-strike * 25}deg)` }}>cars</s>
                  /mile
                </span>
              </div>
              <i>=</i>
              <b style={{ opacity: strike }}>miles/hour</b>
            </div>
          </R>
          <R p={p} at={0.32}>
            <div className="p-row">
              <span className="p-chip">corner → dot</span>
              <span>
                slope = how fast the <em>cars</em> go: <b className="tabular">{fmt(mpsToMph(v))} mph</b>
              </span>
            </div>
          </R>
          <R p={p} at={0.55}>
            <div className="p-row">
              <span className="p-chip p-chip-o">falling edge</span>
              <span>
                slope = how fast the <em>edge of a jam</em> goes: <b style={{ color: 'var(--series-2)' }}>−{fmt(wMph, 1)} mph</b>
              </span>
            </div>
          </R>
          <R p={p} at={0.72}>
            <p className="p-small">Negative. The edge of a jam moves against the traffic. Let&rsquo;s check that with cars.</p>
          </R>
        </Card>
      );
    }

    case 'jam': {
      const t = jamTime(p, brake);
      let stopped = 0;
      for (let n = 0; n < brake.x.length; n++) if (speedAt(brake, n, t) < 0.5) stopped++;
      const firstStop = posAt(brake, 0, brake.stopAt);
      const edge = t > brake.stopAt ? firstStop - (params.L / params.tau) * (t - brake.stopAt) : firstStop;
      return (
        <Card p={p} step="Step 7 · Test it" title="One driver taps the brakes." wide>
          <R p={p} at={0.02}>
            <p>
              Nobody else is told anything. Every driver follows one rule: <em>do what the car ahead did, {params.tau.toFixed(1)} s later and{' '}
              {ft(params.L)} ft further back</em>. That is just s = L + vτ again.
            </p>
          </R>
          <R p={p} at={0.06}>
            <SpaceTime brake={brake} params={params} t={t} />
          </R>
          <R p={p} at={0.08}>
            <div className="p-counter p-counter-3">
              <div>
                <span className="p-big tabular">{fmt(Math.max(t, 0), 1)}</span>
                <span className="p-unit">seconds</span>
              </div>
              <div>
                <span className="p-big tabular" style={{ color: 'var(--critical)' }}>{stopped}</span>
                <span className="p-unit">cars stopped right now</span>
              </div>
              <div>
                <span className="p-big tabular" style={{ color: 'var(--series-8)' }}>{fmt(mToFt(Math.max(0, firstStop - edge)))}</span>
                <span className="p-unit">ft the jam has moved back</span>
              </div>
            </div>
          </R>
          <R p={p} at={0.5}>
            <p className="p-small">
              Each red streak is a car standing still. They line up on one line that slopes <em>down</em>: the jam crawls back up
              the street while every car in it is trying to go forward.
            </p>
          </R>
        </Card>
      );
    }

    case 'answer': {
      const k = easeOut(span(p, 0.08, 0.4));
      return (
        <div className="p-answer" style={{ opacity: easeOut(span(p, 0, 0.1)) * (1 - span(p, 0.92, 1)) }}>
          <R p={p} at={0.02}>
            <div className="p-kicker">The answer</div>
          </R>
          <R p={p} at={0.05}>
            <div className="p-answer-eq">
              w = <span className="p-grad">L / τ</span>
            </div>
          </R>
          <R p={p} at={0.14}>
            <div className="p-answer-num tabular">
              {ft(params.L)} ft ÷ {params.tau.toFixed(1)} s = <b>{fmt(wMph * k, 1)}</b> <span>mph backwards</span>
            </div>
          </R>
          <R p={p} at={0.4}>
            <p className="p-answer-sub">
              Look at what is <em>not</em> in that formula: the street, the number of lanes, the city, how many cars there are,
              what caused the jam. Only the length of a car and the reaction time of a person.
            </p>
          </R>
          <R p={p} at={0.58}>
            <p className="p-answer-sub p-muted">
              So stop-and-go waves should crawl backwards at about the same speed everywhere on Earth. Measured waves in Los
              Angeles, Japan and Germany all land between 10 and 15 mph.
            </p>
          </R>
        </div>
      );
    }

    case 'green': {
      const t = greenTime(p, queue);
      const crossed = queue.crossings.filter((c) => c <= Math.min(t, queue.green)).length;
      const h = saturationHeadway(params);
      const G = WILSHIRE.split * WILSHIRE.cycle;
      const n = vehiclesPerGreen(params, WILSHIRE.split, WILSHIRE.cycle);
      const state = t < 0 ? 'RED' : t <= queue.green ? 'GREEN' : t <= queue.green + 3 ? 'YELLOW' : 'RED';
      return (
        <Card p={p} step="Step 8 · Back to my question" title="How many cars make one green?" wide>
          <R p={p} at={0.03}>
            <p>
              This whole project started at the light on Wilshire, counting cars. It gets {fmt(G, 1)} s of green out of every{' '}
              {WILSHIRE.cycle} s. Same rule, same cars, now with a stop line.
            </p>
          </R>
          <R p={p} at={0.06}>
            <div className="p-counter p-counter-3">
              <div>
                <span className={`p-big p-light p-light-${state.toLowerCase()}`}>{state}</span>
                <span className="p-unit tabular">{t < 0 ? `${fmt(-t, 1)} s to green` : `${fmt(Math.min(t, queue.green), 1)} s of green`}</span>
              </div>
              <div>
                <span className="p-big tabular" style={{ color: 'var(--series-3)' }}>{crossed}</span>
                <span className="p-unit">cars through, per lane</span>
              </div>
              <div>
                <span className="p-big tabular">{fmt(h, 2)}</span>
                <span className="p-unit">s between bumpers</span>
              </div>
            </div>
            <GreenTimeline queue={queue} t={t} />
          </R>
          <R p={p} at={0.3}>
            <p className="p-small">
              The gap between cars crossing settles at h = τ + L/v<sub>f</sub> = {fmt(h, 2)} s. Engineers with stopwatches measure
              1.9–2.1 s. The first few gaps are longer: that slow start is the {STARTUP_LOST_TIME.toFixed(0)}-second
              &ldquo;startup lost time&rdquo;, and it came out of the same rule.
            </p>
          </R>
          <R p={p} at={0.6}>
            <div className="p-formula p-formula-g">
              n = (green − lost) / h = ({fmt(G, 1)} − {STARTUP_LOST_TIME.toFixed(0)}) / {fmt(h, 2)} = <b>{fmt(n, 1)} cars</b>
            </div>
          </R>
          <R p={p} at={0.75}>
            <p className="p-small">
              The animation counted {queue.crossings.filter((c) => c <= queue.green).length}. If you are car number{' '}
              {Math.floor(n) + 1} in your lane, you are sitting through the next red, and no amount of impatience changes that.
            </p>
          </R>
        </Card>
      );
    }

    case 'outro':
      return (
        <div className="p-hero p-outro" style={{ opacity: easeOut(span(p, 0.05, 0.35)) }}>
          <div className="p-kicker">That is the whole thing</div>
          <h2 className="p-display p-display-sm">
            One straight line, <span className="p-grad">s = L + vτ</span>,
            <br />
            and a jam that runs the wrong way.
          </h2>
          <div className="p-cta">
            <button className="btn btn-primary" onClick={() => onNavigate('maths')}>
              Play with the numbers yourself
            </button>
            <button className="btn" onClick={() => onNavigate('creation')}>
              See what I made from it
            </button>
            <button className="btn" onClick={() => onNavigate('live')}>
              Watch the real street
            </button>
          </div>
        </div>
      );
  }
}

/* ------------------------------------------------------------------ */
/* the overlay itself                                                  */
/* ------------------------------------------------------------------ */

export function ProofOverlay({ data, onNavigate, onJump }: { data: OverlayData; onNavigate: Nav; onJump: (i: number) => void }) {
  const pos = useStory();
  const { index, p, id } = split(pos);
  const total = CHAPTERS.length;
  // a white-hot flash on each cut between chapters
  const near = (index > 0 && p < 0.5) || (index < total - 1 && p >= 0.5) ? Math.min(p, 1 - p) : 1;
  const flash = Math.max(0, 1 - near / 0.035);

  return (
    <>
      <div className="proof-flash" style={{ opacity: flash * 0.9, display: flash > 0.001 ? undefined : 'none' }} />
      <div className="p-overlay">
        <Chapter key={id} id={id} p={p} d={data} onNavigate={onNavigate} />
      </div>

      <nav className="p-rail" aria-label="Proof steps">
        {CHAPTERS.map((c, i) => (
          <button
            key={c.id}
            className={`p-rail-dot ${i === index ? 'on' : ''} ${i < index ? 'done' : ''}`}
            onClick={() => onJump(i)}
            aria-label={`Go to ${c.label}`}
            aria-current={i === index ? 'step' : undefined}
          >
            <span>{c.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-progress">
        <div style={{ transform: `scaleX(${pos / total})` }} />
      </div>
    </>
  );
}
