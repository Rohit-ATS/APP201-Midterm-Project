import { useEffect, useRef, useState, type ReactNode } from 'react';

/* --------------------------------------------------------------------- */
/* Responsive sizing                                                      */
/* --------------------------------------------------------------------- */

export function useChartSize(aspect = 0.58, minHeight = 160, maxHeight = 420) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 340 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.max(220, entry.contentRect.width);
      setSize({ w, h: Math.max(minHeight, Math.min(maxHeight, w * aspect)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect, minHeight, maxHeight]);

  return { ref, ...size };
}

/* --------------------------------------------------------------------- */
/* Scales                                                                 */
/* --------------------------------------------------------------------- */

export interface Scale {
  (v: number): number;
  invert: (px: number) => number;
  domain: [number, number];
  range: [number, number];
}

export function linear(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const f = ((v: number) => r0 + ((v - d0) / span) * (r1 - r0)) as Scale;
  f.invert = (px: number) => d0 + ((px - r0) / (r1 - r0 || 1)) * span;
  f.domain = domain;
  f.range = range;
  return f;
}

/** "Nice" tick values for an axis — at most `count`, on 1/2/5 steps. */
export function ticks(d0: number, d1: number, count = 5): number[] {
  if (d1 === d0) return [d0];
  const raw = (d1 - d0) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const start = Math.ceil(d0 / step) * step;
  const out: number[] = [];
  for (let v = start; v <= d1 + step * 1e-6; v += step) {
    out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  }
  return out;
}

/* --------------------------------------------------------------------- */
/* Plot frame: margins, grid, axes                                        */
/* --------------------------------------------------------------------- */

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const M: Margin = { top: 14, right: 16, bottom: 34, left: 48 };

export function Axes({
  x,
  y,
  xLabel,
  yLabel,
  xTicks,
  yTicks,
  xFormat = (v) => String(Math.round(v)),
  yFormat = (v) => String(Math.round(v)),
  grid = 'y',
}: {
  x: Scale;
  y: Scale;
  xLabel?: string;
  yLabel?: string;
  xTicks?: number[];
  yTicks?: number[];
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
  grid?: 'x' | 'y' | 'both' | 'none';
}) {
  const xt = xTicks ?? ticks(x.domain[0], x.domain[1], 5);
  const yt = yTicks ?? ticks(y.domain[0], y.domain[1], 4);
  const [x0, x1] = x.range;
  const [y0, y1] = y.range;

  return (
    <>
      <g className="chart-grid">
        {(grid === 'y' || grid === 'both') &&
          yt.map((t) => <line key={`gy${t}`} x1={x0} x2={x1} y1={y(t)} y2={y(t)} />)}
        {(grid === 'x' || grid === 'both') &&
          xt.map((t) => <line key={`gx${t}`} y1={y0} y2={y1} x1={x(t)} x2={x(t)} />)}
      </g>

      <g className="chart-axis">
        <line x1={x0} x2={x1} y1={y0} y2={y0} />
        <line x1={x0} x2={x0} y1={y0} y2={y1} />
      </g>

      <g className="chart-tick">
        {xt.map((t) => (
          <text key={`tx${t}`} x={x(t)} y={y0 + 15} textAnchor="middle">
            {xFormat(t)}
          </text>
        ))}
        {yt.map((t) => (
          <text key={`ty${t}`} x={x0 - 8} y={y(t) + 3.5} textAnchor="end">
            {yFormat(t)}
          </text>
        ))}
      </g>

      {xLabel && (
        <text
          className="chart-axis-label"
          x={(x0 + x1) / 2}
          y={y0 + 31}
          textAnchor="middle"
        >
          {xLabel}
        </text>
      )}
      {yLabel && (
        <text
          className="chart-axis-label"
          transform={`translate(11, ${(y0 + y1) / 2}) rotate(-90)`}
          textAnchor="middle"
        >
          {yLabel}
        </text>
      )}
    </>
  );
}

/* --------------------------------------------------------------------- */
/* Path builder                                                           */
/* --------------------------------------------------------------------- */

export function path<T>(
  data: T[],
  x: (d: T) => number,
  y: (d: T) => number,
): string {
  return data
    .map((d, i) => {
      const px = x(d);
      const py = y(d);
      if (!Number.isFinite(px) || !Number.isFinite(py)) return '';
      return `${i === 0 ? 'M' : 'L'}${px.toFixed(2)},${py.toFixed(2)}`;
    })
    .join('');
}

/* --------------------------------------------------------------------- */
/* Figure wrapper — caption below, consistent across every chart          */
/* --------------------------------------------------------------------- */

export function Figure({
  caption,
  children,
}: {
  caption?: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure style={{ margin: 0 }}>
      {children}
      {caption && (
        <figcaption
          style={{
            fontSize: 12,
            color: 'var(--ink-muted)',
            marginTop: 10,
            lineHeight: 1.55,
          }}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
