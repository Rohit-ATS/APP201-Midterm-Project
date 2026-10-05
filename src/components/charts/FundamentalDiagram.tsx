import { useState } from 'react';
import { Axes, Figure, linear, M, path, ticks, useChartSize } from './chartKit';
import { Legend, TipRow, useTip } from '../ui/primitives';
import {
  type TrafficParams,
  fundamentalDiagram,
  sampleFundamental,
  sampleGreenshields,
  greenshieldsCapacity,
  mpsToMph,
  shockwaveSpeed,
  VEHPM_TO_VEHPMI,
} from '../../lib/trafficMath';
import type { StationAnalysis } from '../../lib/analysis';

/**
 * THE FUNDAMENTAL DIAGRAM
 *
 * Flow against density. Two straight lines that meet at a peak.
 *
 * The thing worth staring at: the SLOPE of any line you can draw on this chart
 * is a speed. The slope from the origin to a point is the speed of the cars.
 * The slope of the chord between two points is the speed of the BOUNDARY
 * between those two states — and when that chord tilts downward, the boundary
 * runs backwards up the street.
 */
export function FundamentalDiagramChart({
  params,
  stations = [],
  showGreenshields = true,
  chord,
  aspect = 0.62,
}: {
  params: TrafficParams;
  stations?: StationAnalysis[];
  showGreenshields?: boolean;
  /** names of two stations to join with a chord, upstream first */
  chord?: [string, string];
  aspect?: number;
}) {
  const { ref, w, h } = useChartSize(aspect, 220, 420);
  const tip = useTip();
  const [hover, setHover] = useState<string | null>(null);

  const fd = fundamentalDiagram(params);
  const tri = sampleFundamental(params, 2); // triangle needs only its corners
  const gs = sampleGreenshields(params, 120);

  // Display units: cars/mile/lane and cars/hrour/lane
  const toK = (k: number) => k * VEHPM_TO_VEHPMI;
  const toQ = (q: number) => q * 3600;

  const kMax = toK(fd.kj);
  const qMax = Math.max(toQ(fd.qmax), showGreenshields ? toQ(greenshieldsCapacity(params)) : 0);

  const x = linear([0, kMax], [M.left, w - M.right]);
  const y = linear([0, qMax * 1.06], [h - M.bottom, M.top]);

  const triPts = [
    { k: 0, q: 0 },
    { k: fd.kc, q: fd.qmax },
    { k: fd.kj, q: 0 },
  ];
  void tri;

  const chordPair =
    chord &&
    ([stations.find((s) => s.name === chord[0]), stations.find((s) => s.name === chord[1])] as const);
  const chordValid = chordPair && chordPair[0] && chordPair[1];
  const chordSpeed = chordValid
    ? shockwaveSpeed(
        { k: chordPair![0]!.k, q: chordPair![0]!.q },
        { k: chordPair![1]!.k, q: chordPair![1]!.q },
      )
    : 0;

  return (
    <Figure
      caption={
        <>
          The triangle is built from the spacing rule on this page. The dashed curve is an older,
          smoother guess from 1935, drawn so you can compare them. The triangle tops out at{' '}
          <b style={{ color: 'var(--ink-secondary)' }}>
            {Math.round(toQ(fd.qmax)).toLocaleString()} cars/hr per lane
          </b>
          , which matches what engineers actually measure. The parabola peaks{' '}
          {Math.round((greenshieldsCapacity(params) / fd.qmax - 1) * 100)}% higher — a reminder
          that the prettier curve is not the truer one.
        </>
      }
    >
      <div ref={ref} style={{ width: '100%' }}>
        <svg
          width={w}
          height={h}
          role="img"
          aria-label="Flow against density for one lane of South Figueroa Street"
          onMouseLeave={() => {
            setHover(null);
            tip.hide();
          }}
        >
          <Axes
            x={x}
            y={y}
            xLabel="Density — vehicles per mile, per lane"
            yLabel="Flow — cars/hr"
            xTicks={ticks(0, kMax, 5)}
            grid="both"
            yFormat={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))}
          />

          {/* --- capacity guide line --- */}
          <line
            x1={M.left}
            x2={w - M.right}
            y1={y(toQ(fd.qmax))}
            y2={y(toQ(fd.qmax))}
            stroke="var(--series-3)"
            strokeWidth={1}
            strokeDasharray="2 4"
            opacity={0.55}
          />

          {/* --- Greenshields parabola (comparison, dashed) --- */}
          {showGreenshields && (
            <path
              className="chart-series"
              d={path(gs, (d) => x(toK(d.k)), (d) => y(toQ(d.q)))}
              stroke="var(--series-5)"
              strokeDasharray="5 4"
              strokeWidth={1.75}
              opacity={0.85}
            />
          )}

          {/* --- the triangle --- */}
          <path
            className="chart-series"
            d={path(triPts, (d) => x(toK(d.k)), (d) => y(toQ(d.q)))}
            stroke="var(--series-1)"
            strokeWidth={2.25}
          />

          {/* --- the chord whose slope is a wave speed --- */}
          {chordValid && (
            <>
              <line
                x1={x(toK(chordPair![0]!.k))}
                y1={y(toQ(chordPair![0]!.q))}
                x2={x(toK(chordPair![1]!.k))}
                y2={y(toQ(chordPair![1]!.q))}
                stroke="var(--series-4)"
                strokeWidth={2}
                strokeDasharray="6 3"
              />
              <text
                className="chart-tick"
                x={(x(toK(chordPair![0]!.k)) + x(toK(chordPair![1]!.k))) / 2}
                y={(y(toQ(chordPair![0]!.q)) + y(toQ(chordPair![1]!.q))) / 2 + 19}
                textAnchor="middle"
                fill="var(--series-4)"
                style={{ fontWeight: 700 }}
              >
                slope = {mpsToMph(chordSpeed).toFixed(1)} mph
              </text>
            </>
          )}

          {/* --- capacity point --- */}
          <circle
            cx={x(toK(fd.kc))}
            cy={y(toQ(fd.qmax))}
            r={4.5}
            fill="var(--series-3)"
            stroke="var(--surface-1)"
            strokeWidth={2}
          />
          <text
            className="chart-tick"
            x={x(toK(fd.kc)) + 9}
            y={y(toQ(fd.qmax)) - 7}
            fill="var(--series-3)"
            style={{ fontWeight: 700 }}
          >
            capacity
          </text>

          {/* --- live stations --- */}
          {stations.map((s) => {
            const cx = x(toK(s.k));
            const cy = y(toQ(s.q));
            const on = hover === s.name;
            return (
              <g key={s.name}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={on ? 7 : 5}
                  fill={s.congested ? 'var(--series-2)' : 'var(--surface-1)'}
                  stroke={s.congested ? 'var(--surface-1)' : 'var(--series-2)'}
                  strokeWidth={2}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => {
                    setHover(s.name);
                    tip.show(
                      e.clientX,
                      e.clientY,
                      <>
                        <div className="tip-title">{s.name}</div>
                        <TipRow label="Speed" value={`${mpsToMph(s.v).toFixed(0)} mph`} />
                        <TipRow
                          label="Density"
                          value={`${toK(s.k).toFixed(0)} cars/mi`}
                        />
                        <TipRow label="Flow" value={`${Math.round(toQ(s.q))} cars/hr`} />
                        <TipRow label="Level of service" value={s.los} />
                      </>,
                    );
                  }}
                />
                {on && (
                  <line
                    x1={x(0)}
                    y1={y(0)}
                    x2={cx}
                    y2={cy}
                    stroke="var(--ink-muted)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <Legend
        items={[
          { label: 'Triangular model (from the spacing rule)', color: 'var(--series-1)' },
          ...(showGreenshields
            ? [{ label: 'Greenshields parabola', color: 'var(--series-5)', dashed: true }]
            : []),
          { label: 'Capacity', color: 'var(--series-3)' },
          ...(stations.length
            ? [
                { label: 'Live station — congested (filled)', color: 'var(--series-2)' },
                { label: 'Live station — free flowing (hollow)', color: 'var(--series-2)', dashed: true },
              ]
            : []),
          ...(chordValid
            ? [{ label: 'Shockwave chord', color: 'var(--series-4)', dashed: true }]
            : []),
        ]}
      />
    </Figure>
  );
}
