import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/* --------------------------------------------------------------------- */
/* Panel                                                                  */
/* --------------------------------------------------------------------- */

export function Panel({
  title,
  aside,
  children,
  glass = false,
  className = '',
  style,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  glass?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section
      className={`${glass ? 'panel-glass' : 'panel'} ${className}`}
      style={glass ? { padding: 18, ...style } : style}
    >
      {title && (
        <h3 className="panel-title">
          <span>{title}</span>
          {aside}
        </h3>
      )}
      {children}
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* Stat tile — a hero number with its label and unit                      */
/* --------------------------------------------------------------------- */

export function Stat({
  value,
  unit,
  label,
  color,
  sub,
}: {
  value: ReactNode;
  unit?: string;
  label: string;
  color?: string;
  sub?: ReactNode;
}) {
  return (
    <div>
      <div className="stat-value tabular" style={color ? { color } : undefined}>
        {value}
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      <div className="stat-label">{label}</div>
      {sub && (
        <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Badge                                                                  */
/* --------------------------------------------------------------------- */

export function Badge({
  children,
  color,
  title,
}: {
  children: ReactNode;
  color?: string;
  title?: string;
}) {
  return (
    <span className="badge" title={title}>
      {color && <span className="badge-dot" style={{ background: color }} />}
      {children}
    </span>
  );
}

/* --------------------------------------------------------------------- */
/* Slider                                                                 */
/* --------------------------------------------------------------------- */

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  hint?: string;
}) {
  const id = useMemo(() => `s-${label.replace(/\W+/g, '-').toLowerCase()}`, [label]);
  return (
    <label className="control" htmlFor={id}>
      <span className="control-head">
        <span className="control-label">{label}</span>
        <span className="control-value">{format(value)}</span>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && (
        <span style={{ fontSize: 11.5, color: 'var(--ink-muted)', display: 'block', marginTop: 4 }}>
          {hint}
        </span>
      )}
    </label>
  );
}

/* --------------------------------------------------------------------- */
/* Legend — always present for 2+ series                                  */
/* --------------------------------------------------------------------- */

export interface LegendEntry {
  label: string;
  color: string;
  dashed?: boolean;
}

export function Legend({ items }: { items: LegendEntry[] }) {
  if (items.length < 2) return null;
  return (
    <div className="legend">
      {items.map((it) => (
        <span className="legend-item" key={it.label}>
          <span
            className="legend-swatch"
            style={
              it.dashed
                ? {
                    background: `repeating-linear-gradient(90deg, ${it.color} 0 3px, transparent 3px 6px)`,
                  }
                : { background: it.color }
            }
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Tooltip — one fixed-position node shared by every chart                */
/* --------------------------------------------------------------------- */

interface TipState {
  x: number;
  y: number;
  content: ReactNode;
}

const TipCtx = createContext<{
  show: (x: number, y: number, content: ReactNode) => void;
  hide: () => void;
}>({ show: () => {}, hide: () => {} });

export function TooltipProvider({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<TipState | null>(null);

  const show = useCallback(
    (x: number, y: number, content: ReactNode) => setTip({ x, y, content }),
    [],
  );
  const hide = useCallback(() => setTip(null), []);
  const api = useMemo(() => ({ show, hide }), [show, hide]);

  return (
    <TipCtx.Provider value={api}>
      {children}
      {tip && (
        <div
          className="tip"
          role="status"
          style={{
            left: Math.min(tip.x + 14, window.innerWidth - 272),
            top: Math.max(8, tip.y - 12),
          }}
        >
          {tip.content}
        </div>
      )}
    </TipCtx.Provider>
  );
}

export const useTip = () => useContext(TipCtx);

export function TipRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="tip-row">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
