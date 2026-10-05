import { Axes, Figure, linear, M, path, useChartSize } from './chartKit';
import { Legend, TipRow, useTip } from '../ui/primitives';
import type { CorridorAnalysis } from '../../lib/analysis';
import { mpsToMph, VEHPM_TO_VEHPMI } from '../../lib/trafficMath';
import { BOTTLENECK, CORRIDOR_LENGTH } from '../../data/corridor';

/**
 * THE CORRIDOR PROFILE
 *
 * Speed against distance down the street, right now.
 *
 * This is the chart that shows the asymmetry a single average would hide.
 * Upstream of the Skirball crest the line is on the floor. Downstream it
 * climbs. Cars are leaving the bottleneck faster than they are arriving at it,
 * so the queue has to grow backwards — and the arrows below the axis show
 * which way each boundary is actually moving.
 */
export function CorridorProfile({
  analysis,
  aspect = 0.42,
}: {
  analysis: CorridorAnalysis;
  aspect?: number;
}) {
  const { ref, w, h } = useChartSize(aspect, 220, 360);
  const tip = useTip();

  const miles = CORRIDOR_LENGTH / 1609.344;
  // The wave arrows live in a lane of their own below the axis, so this chart
  // reserves more bottom margin than the shared default.
  const bottom = M.bottom + 26;
  const baseline = h - bottom;
  const x = linear([0, miles], [M.left, w - M.right]);
  const y = linear([0, 75], [baseline, M.top]);

  const pts = analysis.stations.map((s) => ({
    mi: s.offset / 1609.344,
    mph: mpsToMph(s.v),
    st: s,
  }));

  const bottleneckStation = analysis.stations.find((s) => s.name === BOTTLENECK);
  const waveY = baseline + 30;

  return (
    <Figure
      caption={
        <>
          Southbound, from 3rd Street at the left to 11th at the right. The arrows under the axis
          are the boundaries between neighbouring traffic states, drawn in the direction they are
          travelling. Yellow arrows point backwards up the street — those are queues growing
          toward the cars that have not arrived yet.
        </>
      }
    >
      <div ref={ref} style={{ width: '100%' }}>
        <svg
          width={w}
          height={h}
          role="img"
          aria-label="Current speed along the corridor"
          onMouseLeave={() => tip.hide()}
        >
          <Axes
            x={x}
            y={y}
            yLabel="Speed — mph"
            grid="y"
            yFormat={(v) => String(Math.round(v))}
            xFormat={(v) => v.toFixed(2)}
          />
          <text
            className="chart-axis-label"
            x={(M.left + w - M.right) / 2}
            y={baseline + 48}
            textAnchor="middle"
          >
            Miles south of 3rd Street
          </text>

          {/* free-flow reference */}
          <line
            x1={M.left}
            x2={w - M.right}
            y1={y(65)}
            y2={y(65)}
            stroke="var(--series-3)"
            strokeWidth={1}
            strokeDasharray="2 4"
            opacity={0.6}
          />
          <text className="chart-tick" x={w - M.right - 2} y={y(65) - 5} textAnchor="end" fill="var(--series-3)">
            free flow
          </text>

          {/* the bottleneck band */}
          {bottleneckStation && (
            <g>
              <rect
                x={x(bottleneckStation.offset / 1609.344) - 9}
                y={M.top}
                width={18}
                height={baseline - M.top}
                fill="var(--series-4)"
                opacity={0.1}
              />
              <text
                className="chart-tick"
                x={x(bottleneckStation.offset / 1609.344)}
                y={M.top + 11}
                textAnchor="middle"
                fill="var(--series-4)"
                style={{ fontWeight: 700 }}
              >
                crest
              </text>
            </g>
          )}

          {/* area under the speed curve */}
          <path
            d={`${path(pts, (d) => x(d.mi), (d) => y(d.mph))}L${x(pts[pts.length - 1].mi)},${y(0)}L${x(pts[0].mi)},${y(0)}Z`}
            fill="var(--series-1)"
            opacity={0.12}
          />
          <path
            className="chart-series"
            d={path(pts, (d) => x(d.mi), (d) => y(d.mph))}
            stroke="var(--series-1)"
            strokeWidth={2.25}
          />

          {/* stations */}
          {pts.map((p) => (
            <g key={p.st.name}>
              <circle
                cx={x(p.mi)}
                cy={y(p.mph)}
                r={4.5}
                fill={p.st.congested ? 'var(--series-2)' : 'var(--series-1)'}
                stroke="var(--surface-1)"
                strokeWidth={2}
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) =>
                  tip.show(
                    e.clientX,
                    e.clientY,
                    <>
                      <div className="tip-title">{p.st.name}</div>
                      <TipRow label="Speed" value={`${p.mph.toFixed(0)} mph`} />
                      <TipRow
                        label="Density"
                        value={`${(p.st.k * VEHPM_TO_VEHPMI).toFixed(0)} veh/mi/ln`}
                      />
                      <TipRow label="Lanes" value={p.st.lanes} />
                      <TipRow
                        label="Flow"
                        value={`${Math.round(p.st.qTotal).toLocaleString()} veh/h`}
                      />
                      <TipRow label="Level of service" value={p.st.los} />
                    </>,
                  )
                }
              />
            </g>
          ))}

          {/* wave direction arrows */}
          <g>
            {analysis.waves.map((wv) => {
              const cx = x(wv.offset / 1609.344);
              const upstream = wv.u < 0;
              const len = Math.min(16, 5 + Math.abs(mpsToMph(wv.u)) * 0.5);
              const dir = upstream ? -1 : 1;
              return (
                <g key={`${wv.from}-${wv.to}`}>
                  <line
                    x1={cx - dir * len}
                    x2={cx + dir * len}
                    y1={waveY}
                    y2={waveY}
                    stroke={upstream ? 'var(--series-4)' : 'var(--series-3)'}
                    strokeWidth={2}
                  />
                  <path
                    d={`M${cx + dir * len},${waveY}l${-dir * 4},-3.2l0,6.4Z`}
                    fill={upstream ? 'var(--series-4)' : 'var(--series-3)'}
                  />
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <Legend
        items={[
          { label: 'Current speed', color: 'var(--series-1)' },
          { label: 'Congested station', color: 'var(--series-2)' },
          { label: 'Boundary moving upstream', color: 'var(--series-4)' },
          { label: 'Boundary moving downstream', color: 'var(--series-3)' },
        ]}
      />
    </Figure>
  );
}
