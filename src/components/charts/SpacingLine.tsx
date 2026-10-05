import { useState } from 'react';
import { Axes, Figure, linear, M, path, useChartSize } from './chartKit';
import { Legend, TipRow, useTip } from '../ui/primitives';
import {
  type TrafficParams,
  sampleSpacing,
  spacingAt,
  mphToMps,
  mToFt,
} from '../../lib/trafficMath';

/**
 * THE SPACING LINE — where everything in this project starts.
 *
 *     s(v) = L + v * tau
 *
 * A straight line. The intercept is the length of a car. The slope is the
 * driver's reaction time. That is the entire model, and every curve elsewhere
 * on this site is this line, rearranged.
 */
export function SpacingLine({
  params,
  markSpeedMph,
  aspect = 0.56,
}: {
  params: TrafficParams;
  /** optional live speed to mark on the line */
  markSpeedMph?: number;
  aspect?: number;
}) {
  const { ref, w, h } = useChartSize(aspect, 220, 380);
  const tip = useTip();
  const [hoverMph, setHoverMph] = useState<number | null>(null);

  const data = sampleSpacing(params, 75, 75);
  const maxFt = mToFt(spacingAt(mphToMps(75), params)) * 1.08;

  const x = linear([0, 75], [M.left, w - M.right]);
  const y = linear([0, maxFt], [h - M.bottom, M.top]);

  const px = (mph: number) => x(mph);
  const py = (mph: number) => y(mToFt(spacingAt(mphToMps(mph), params)));

  const active = hoverMph ?? markSpeedMph ?? null;

  return (
    <Figure
      caption={
        <>
          The line never starts at zero. Even stopped dead at a red, a car still takes up{' '}
          <b style={{ color: 'var(--ink-secondary)' }}>L = {mToFt(params.L).toFixed(0)} ft</b> of
          road. That stubborn intercept is what makes a jam a jam — and, divided by the slope, it
          is the speed the jam travels backwards.
        </>
      }
    >
      <div ref={ref} style={{ width: '100%' }}>
        <svg
          width={w}
          height={h}
          role="img"
          aria-label="Following spacing against speed"
          onMouseMove={(e) => {
            const rect = (e.target as SVGElement).ownerSVGElement!.getBoundingClientRect();
            const mph = Math.max(0, Math.min(75, x.invert(e.clientX - rect.left)));
            setHoverMph(mph);
            const s = spacingAt(mphToMps(mph), params);
            tip.show(
              e.clientX,
              e.clientY,
              <>
                <div className="tip-title">{mph.toFixed(0)} mph</div>
                <TipRow label="Spacing s" value={`${mToFt(s).toFixed(0)} ft`} />
                <TipRow label="of which car L" value={`${mToFt(params.L).toFixed(0)} ft`} />
                <TipRow
                  label={`gap v×τ`}
                  value={`${mToFt(s - params.L).toFixed(0)} ft`}
                />
              </>,
            );
          }}
          onMouseLeave={() => {
            setHoverMph(null);
            tip.hide();
          }}
        >
          <Axes
            x={x}
            y={y}
            xLabel="Speed — mph"
            yLabel="Spacing — feet"
            grid="both"
          />

          {/* the fixed part: the car itself */}
          <path
            d={`${path(data, (d) => x(d.v * 2.236936), () => y(mToFt(params.L)))}L${x(75)},${y(0)}L${x(0)},${y(0)}Z`}
            fill="var(--series-2)"
            opacity={0.14}
          />
          <line
            x1={x(0)}
            x2={x(75)}
            y1={y(mToFt(params.L))}
            y2={y(mToFt(params.L))}
            stroke="var(--series-2)"
            strokeWidth={2}
          />

          {/* the spacing line itself */}
          <path
            className="chart-series"
            d={path(data, (d) => x(d.v * 2.236936), (d) => y(mToFt(d.s)))}
            stroke="var(--series-1)"
            strokeWidth={2.25}
          />

          {/* intercept marker */}
          <circle
            cx={x(0)}
            cy={y(mToFt(params.L))}
            r={4.5}
            fill="var(--series-2)"
            stroke="var(--surface-1)"
            strokeWidth={2}
          />
          <text
            className="chart-tick"
            x={x(0) + 9}
            y={y(mToFt(params.L)) - 8}
            fill="var(--series-2)"
            style={{ fontWeight: 700 }}
          >
            L = {mToFt(params.L).toFixed(0)} ft
          </text>

          {/* the active reading */}
          {active !== null && (
            <g>
              <line
                x1={px(active)}
                x2={px(active)}
                y1={y(0)}
                y2={py(active)}
                stroke="var(--ink-muted)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <circle
                cx={px(active)}
                cy={py(active)}
                r={5}
                fill="var(--series-1)"
                stroke="var(--surface-1)"
                strokeWidth={2}
              />
            </g>
          )}
        </svg>
      </div>

      <Legend
        items={[
          { label: 'Spacing s = L + vτ', color: 'var(--series-1)' },
          { label: 'The car itself (L)', color: 'var(--series-2)' },
        ]}
      />
    </Figure>
  );
}
