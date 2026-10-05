import { useEffect, useState } from 'react';
import type { Simulation, SimVehicle } from '../lib/simulation';
import {
  type TrafficParams,
  mpsToMph,
  mToFt,
  VEHPM_TO_VEHPMI,
} from '../lib/trafficMath';
import { CENTERLINE, CORRIDOR, CORRIDOR_LENGTH } from '../data/corridor';
import { pointAt, unproject } from '../lib/geo';

/**
 * THE VEHICLE INSPECTOR
 *
 * Click any car in the scene and this panel solves that car's own copy of the
 * equation, live, with its own numbers in it.
 *
 * The point is that the model is not a statement about traffic in general. It
 * is a rule each individual driver is following right now, and every one of
 * them is solving the same two-term expression with different values. Watch
 * one car through a red light and you can see the binding constraint hand over
 * from the open road, to the car in front, to the stop line, and back.
 */

const LIMIT_LABEL: Record<SimVehicle['limitedBy'], string> = {
  free: 'Open road',
  leader: 'The car in front',
  signal: 'A red light',
  braking: 'Braking',
};

const LIMIT_COLOR: Record<SimVehicle['limitedBy'], string> = {
  free: 'var(--good)',
  leader: 'var(--series-2)',
  signal: 'var(--critical)',
  braking: 'var(--warning)',
};

/** Nearest cross street to an arc position, for a human-readable location. */
function nearestCross(x: number): { name: string; delta: number } {
  let best = CORRIDOR[0];
  let bestD = Infinity;
  for (const c of CORRIDOR) {
    const d = Math.abs(c.offset - x);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return { name: best.name, delta: x - best.offset };
}

export function VehicleInspector({
  sim,
  params,
  selectedId,
  onClose,
}: {
  sim: Simulation;
  params: TrafficParams;
  selectedId: number | null;
  onClose: () => void;
}) {
  // The simulation object mutates in place, so the panel samples it on its own
  // clock rather than waiting for React to notice.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (selectedId == null) return;
    const id = setInterval(() => setTick((t) => t + 1), 110);
    return () => clearInterval(id);
  }, [selectedId]);

  if (selectedId == null) return null;
  const veh = sim.getVehicle(selectedId);
  if (!veh) return null;

  const vMph = mpsToMph(veh.v);
  const sFt = mToFt(veh.gap);
  const lFt = mToFt(veh.L);
  const gapFt = mToFt(Math.max(0, veh.gap - veh.L));
  const vTargetMph = mpsToMph(veh.vTarget);

  // where it is, in the real world
  const local = pointAt(CENTERLINE, Math.min(veh.x, CORRIDOR_LENGTH));
  const { lat, lon } = unproject(local.x, local.z);
  const cross = nearestCross(veh.x);

  // what this one vehicle contributes to the macroscopic numbers
  const kVeh = veh.gap > 0 ? 1 / veh.gap : 0; // veh/m implied by its own spacing
  const headway = veh.v > 0.2 ? veh.gap / veh.v : null; // seconds to the leader
  const kPerMile = kVeh * VEHPM_TO_VEHPMI;

  const signalLimited = veh.limitedBy === 'signal' && veh.toSignal != null;

  return (
    <aside className="inspector" aria-live="polite">
      <header className="inspector-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 2 }}>
            Vehicle #{veh.id}
          </div>
          <strong style={{ fontSize: 15 }}>{veh.cls.label}</strong>
        </div>
        <button className="btn" onClick={onClose} aria-label="Close inspector">
          Close
        </button>
      </header>

      {/* --------- what is limiting this driver right now --------- */}
      <div
        className="inspector-limit"
        style={{ borderColor: LIMIT_COLOR[veh.limitedBy] }}
      >
        <span className="badge-dot" style={{ background: LIMIT_COLOR[veh.limitedBy] }} />
        <span>
          Held back by <strong>{LIMIT_LABEL[veh.limitedBy]}</strong>
          {signalLimited && veh.nextSignal ? ` at ${veh.nextSignal}` : ''}
        </span>
      </div>

      {/* --------- the three numbers the question asked for --------- */}
      <div className="inspector-stats">
        <div>
          <div className="inspector-value">{vMph.toFixed(1)}</div>
          <div className="stat-label">Speed · mph</div>
        </div>
        <div>
          <div className="inspector-value">{sFt.toFixed(0)}</div>
          <div className="stat-label">Spacing s · ft</div>
        </div>
        <div>
          <div className="inspector-value">{(veh.x / 1609.344).toFixed(2)}</div>
          <div className="stat-label">Position · mi</div>
        </div>
      </div>

      {/* --------- this vehicle's own equation --------- */}
      <div className="formula" style={{ margin: '14px 0', fontSize: 13.5 }}>
        <span style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--ink-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
          This vehicle&rsquo;s spacing rule
        </span>
        <span className="fx" style={{ fontSize: 15 }}>
          v = (s &minus; L) / &tau;
        </span>
        <span className="fx" style={{ fontSize: 15, color: 'var(--series-1)' }}>
          v = ({sFt.toFixed(1)} &minus; {lFt.toFixed(1)}) / {params.tau.toFixed(2)}
        </span>
        <span className="fx" style={{ fontSize: 15, color: 'var(--series-1)' }}>
          v = {mpsToMph(Math.max(0, (veh.gap - veh.L) / params.tau)).toFixed(1)} mph
        </span>
        {veh.limitedBy === 'free' && (
          <span className="fx" style={{ fontSize: 13.5, color: 'var(--good)' }}>
            …but capped at v_f = {mpsToMph(params.vf).toFixed(0)} mph, so it drives{' '}
            {vMph.toFixed(1)}
          </span>
        )}
        <span className="where">
          <b>s</b> = {sFt.toFixed(1)} ft to the car in front
          {veh.leaderId != null && ` (#${veh.leaderId})`}
          <br />
          <b>L</b> = {lFt.toFixed(1)} ft — this {veh.cls.label} plus its stopped gap
          <br />
          <b>&tau;</b> = {params.tau.toFixed(2)} s reaction time
        </span>
      </div>

      {signalLimited && (
        <div className="formula" style={{ margin: '14px 0', fontSize: 13.5, borderLeftColor: 'var(--critical)' }}>
          <span style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--ink-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
            …but the red light binds first
          </span>
          <span className="fx" style={{ fontSize: 15 }}>
            v = d / &tau; = {mToFt(veh.toSignal!).toFixed(0)} ft / {params.tau.toFixed(2)} s
          </span>
          <span className="fx" style={{ fontSize: 15, color: 'var(--critical)' }}>
            v = {mpsToMph(veh.toSignal! / params.tau).toFixed(1)} mph
          </span>
          <span className="where">
            A red light is treated as a stopped vehicle of zero length parked on the stop line, so
            the <em>same</em> rule brings this car to a halt. No braking logic exists anywhere in
            the simulation.
          </span>
        </div>
      )}

      <div className="formula" style={{ margin: '14px 0', fontSize: 13.5, borderLeftColor: 'var(--series-3)' }}>
        <span style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--ink-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
          What this one car contributes
        </span>
        <span className="fx" style={{ fontSize: 15 }}>
          k = 1/s = {kPerMile.toFixed(0)} veh/mi
        </span>
        <span className="fx" style={{ fontSize: 15 }}>
          q = k&middot;v = {(kVeh * veh.v * 3600).toFixed(0)} veh/h
        </span>
        <span className="where">
          Density and flow are not properties of a crowd. They are what you get when you take one
          car&rsquo;s spacing and invert it, then multiply by its speed.
        </span>
      </div>

      {/* --------- the rest of the state --------- */}
      <table className="table" style={{ marginTop: 4 }}>
        <tbody>
          <tr>
            <td>Target speed</td>
            <td style={{ textAlign: 'right' }}>{vTargetMph.toFixed(1)} mph</td>
          </tr>
          <tr>
            <td>Clear gap ahead</td>
            <td style={{ textAlign: 'right' }}>{gapFt.toFixed(0)} ft</td>
          </tr>
          <tr>
            <td>Time headway</td>
            <td style={{ textAlign: 'right' }}>
              {headway == null ? 'stopped' : `${headway.toFixed(1)} s`}
            </td>
          </tr>
          <tr>
            <td>Lane</td>
            <td style={{ textAlign: 'right' }}>
              {veh.lane === 0 ? 'kerbside' : `lane ${veh.lane + 1}`}
            </td>
          </tr>
          <tr>
            <td>Nearest cross street</td>
            <td style={{ textAlign: 'right' }}>
              {cross.name} {cross.delta >= 0 ? '+' : '−'}
              {Math.abs(mToFt(cross.delta)).toFixed(0)} ft
            </td>
          </tr>
          <tr>
            <td>Next signal</td>
            <td style={{ textAlign: 'right' }}>
              {veh.nextSignal ? `${veh.nextSignal} · red` : 'all green ahead'}
            </td>
          </tr>
          <tr>
            <td>GPS</td>
            <td style={{ textAlign: 'right' }} className="mono">
              {lat.toFixed(5)}, {lon.toFixed(5)}
            </td>
          </tr>
          <tr>
            <td>Distance travelled</td>
            <td style={{ textAlign: 'right' }}>{(veh.odometer / 1609.344).toFixed(2)} mi</td>
          </tr>
        </tbody>
      </table>

      <p className="muted" style={{ fontSize: 11.5, marginTop: 12, marginBottom: 0 }}>
        Switch the camera to <strong>Chase</strong> to ride with this vehicle through the next
        light.
      </p>
    </aside>
  );
}
