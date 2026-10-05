import { Figure, linear, M, useChartSize } from './chartKit';
import { TipRow, useTip } from '../ui/primitives';
import {
  VEHICLE_CLASSES,
  meanVehicleLength,
  effectiveLength,
  STOPPED_GAP,
} from '../../data/vehicleMix';
import { mToFt } from '../../lib/trafficMath';

/**
 * THE FLEET
 *
 * This chart exists to justify a single number. L — the effective length of a
 * vehicle — is the intercept of the spacing line and half of the formula for
 * the wave speed, so it had better not be a guess. It is the weighted mean
 * length of what actually drives this corridor, plus the gap drivers leave
 * when stopped.
 */
export function VehicleMixChart({ aspect = 0.62 }: { aspect?: number }) {
  const { ref, w, h } = useChartSize(aspect, 240, 360);
  const tip = useTip();

  const sorted = [...VEHICLE_CLASSES].sort((a, b) => b.share - a.share);
  const maxShare = Math.max(...sorted.map((v) => v.share));

  const rowH = (h - M.top - 18) / sorted.length;
  const barLeft = 92;
  const x = linear([0, maxShare], [barLeft, w - M.right - 54]);

  return (
    <Figure
      caption={
        <>
          Mean length across this fleet is{' '}
          <b style={{ color: 'var(--ink-secondary)' }}>
            {mToFt(meanVehicleLength()).toFixed(1)} ft
          </b>
          . Add the {mToFt(STOPPED_GAP).toFixed(1)} ft of bumper gap drivers keep at a dead stop
          and you get the effective length{' '}
          <b style={{ color: 'var(--ink-secondary)' }}>
            L = {mToFt(effectiveLength()).toFixed(1)} ft
          </b>{' '}
          used everywhere on this site. Semi-trailers are only 2% of the traffic but they are four
          times the length of a sedan, which is why they pull the average up more than their share
          suggests.
        </>
      }
    >
      <div ref={ref} style={{ width: '100%' }}>
        <svg
          width={w}
          height={h}
          role="img"
          aria-label="Share of each vehicle class on the corridor"
          onMouseLeave={() => tip.hide()}
        >
          {sorted.map((v, i) => {
            const cy = M.top + i * rowH;
            const barW = x(v.share) - barLeft;
            return (
              <g key={v.id}>
                <text
                  className="chart-tick"
                  x={barLeft - 10}
                  y={cy + rowH / 2 + 3.5}
                  textAnchor="end"
                  style={{ fontSize: 11.5, fill: 'var(--ink-secondary)' }}
                >
                  {v.label}
                </text>
                <rect
                  x={barLeft}
                  y={cy + rowH * 0.22}
                  width={Math.max(2, barW)}
                  height={rowH * 0.56}
                  rx={4}
                  fill="var(--series-1)"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) =>
                    tip.show(
                      e.clientX,
                      e.clientY,
                      <>
                        <div className="tip-title">{v.label}</div>
                        <TipRow label="Share of fleet" value={`${(v.share * 100).toFixed(1)}%`} />
                        <TipRow label="Length" value={`${mToFt(v.length).toFixed(1)} ft`} />
                        <TipRow
                          label="Contribution to L"
                          value={`${mToFt(v.share * v.length).toFixed(2)} ft`}
                        />
                      </>,
                    )
                  }
                />
                <text
                  className="chart-tick"
                  x={barLeft + Math.max(2, barW) + 8}
                  y={cy + rowH / 2 + 3.5}
                  style={{ fontSize: 11.5, fill: 'var(--ink-primary)', fontWeight: 600 }}
                >
                  {(v.share * 100).toFixed(1)}%
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </Figure>
  );
}
