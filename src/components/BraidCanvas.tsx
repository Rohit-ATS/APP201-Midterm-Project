import { useEffect, useRef } from 'react';
import type { BraidField } from '../lib/braid';

/**
 * SHOCKWAVE BRAID — the rendering.
 *
 * Warp threads are vehicle trajectories, drawn thick where the car is slow,
 * because a slow car occupies less road but more TIME, and the piece is about
 * time. Weft threads are jam fronts, every one of them at exactly the same
 * angle, because every one of them travels at exactly -L/tau.
 *
 * The weave is faked the way a real weave works: the weft is drawn with a dash
 * pattern phased against the warp spacing, so it disappears behind every other
 * thread and reappears between them. Over, under, over, under.
 */

export interface BraidStyle {
  /** warp palette, slow -> fast */
  ramp: string[];
  weft: string;
  background: string;
  /** thread weight multiplier */
  weight: number;
  showWeft: boolean;
  /** mirror the panel to make a symmetric textile */
  mirror: boolean;
}

export const BRAID_STYLES: Record<string, BraidStyle> = {
  dusk: {
    ramp: ['#cde2fb', '#86b6ef', '#3987e5', '#2a78d6', '#1c5cab', '#0d366b'],
    weft: '#c98500',
    background: '#0b0b0d',
    weight: 1,
    showWeft: true,
    mirror: false,
  },
  ember: {
    ramp: ['#ffd9a8', '#f0a860', '#d95926', '#a83c18', '#6e2810', '#3a160a'],
    weft: '#3987e5',
    background: '#0c0906',
    weight: 1.1,
    showWeft: true,
    mirror: false,
  },
  blueprint: {
    ramp: ['#ffffff', '#cde2fb', '#86b6ef', '#3987e5', '#1c5cab', '#0d366b'],
    weft: '#ffffff',
    background: '#071428',
    weight: 0.85,
    showWeft: true,
    mirror: true,
  },
  bone: {
    ramp: ['#1a1a19', '#3d3c38', '#6b6962', '#949188', '#c3c2b7', '#e8e7df'],
    weft: '#d03b3b',
    background: '#f4f2ec',
    weight: 0.9,
    showWeft: true,
    mirror: false,
  },
};

function rampColor(ramp: string[], v: number, vf: number): string {
  const t = Math.max(0, Math.min(0.999, 1 - v / Math.max(vf, 0.1)));
  return ramp[Math.floor(t * ramp.length)];
}

export function drawBraid(
  ctx: CanvasRenderingContext2D,
  field: BraidField,
  style: BraidStyle,
  width: number,
  height: number,
) {
  ctx.save();
  ctx.fillStyle = style.background;
  ctx.fillRect(0, 0, width, height);

  const pad = Math.min(width, height) * 0.06;
  const pw = width - pad * 2;
  const ph = height - pad * 2;

  const sx = (t: number) => pad + (t / field.duration) * pw;
  const sy = (x: number) => pad + ph - (x / field.length) * ph;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const drawPanel = (flip: boolean) => {
    ctx.save();
    if (flip) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    // ---- WARP: the vehicle trajectories ------------------------------
    for (const thread of field.warp) {
      for (let i = 1; i < thread.pts.length; i++) {
        const a = thread.pts[i - 1];
        const b = thread.pts[i];
        // skip the wrap-around jump
        if (Math.abs(b.x - a.x) > field.length / 2) continue;

        const slow = 1 - Math.min(1, b.v / field.vf);
        ctx.strokeStyle = rampColor(style.ramp, b.v, field.vf);
        ctx.lineWidth = (0.9 + slow * 3.6) * style.weight;
        ctx.globalAlpha = 0.52 + slow * 0.45;
        ctx.beginPath();
        ctx.moveTo(sx(a.t), sy(a.x));
        ctx.lineTo(sx(b.t), sy(b.x));
        ctx.stroke();
      }
    }

    // ---- WEFT: the jam fronts, all at the same angle ------------------
    if (style.showWeft) {
      // the warp threads are about this far apart on screen — phase the dash
      // against that spacing so the weft appears to pass under them
      const warpGap = ph / Math.max(1, field.warp.length);
      ctx.setLineDash([warpGap * 0.6, warpGap * 0.4]);
      ctx.globalAlpha = 1;

      for (const f of field.weft) {
        // a jam front travels backwards at exactly w
        const tEnd = field.duration;
        const dt = tEnd - f.t;
        const xEnd = f.x - field.w * dt;

        ctx.strokeStyle = style.weft;
        // The weft carries half the idea, so it has to hold its own against a
        // very dense warp. Thinner than this and the cloth reads as shredding
        // rather than weaving.
        ctx.lineWidth = (2.6 + f.strength * 5.0) * style.weight;
        ctx.lineDashOffset = (f.x / field.length) * warpGap;

        // the front wraps around the loop, so draw it in pieces
        let x0 = f.x;
        let t0 = f.t;
        while (t0 < tEnd) {
          const tToZero = x0 / field.w;
          const tSeg = Math.min(tEnd - t0, tToZero);
          const x1 = x0 - field.w * tSeg;
          ctx.beginPath();
          ctx.moveTo(sx(t0), sy(x0));
          ctx.lineTo(sx(t0 + tSeg), sy(Math.max(0, x1)));
          ctx.stroke();
          t0 += tSeg + 0.001;
          x0 = field.length;
          if (tSeg <= 0.002) break;
        }
        void xEnd;
      }
      ctx.setLineDash([]);
    }

    ctx.restore();
  };

  drawPanel(false);
  if (style.mirror) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    drawPanel(true);
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

export function BraidCanvas({
  field,
  style,
  width = 1400,
  height = 900,
  canvasRef,
}: {
  field: BraidField;
  style: BraidStyle;
  width?: number;
  height?: number;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}) {
  const localRef = useRef<HTMLCanvasElement>(null);
  const ref = canvasRef ?? localRef;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = width;
    canvas.height = height;
    drawBraid(ctx, field, style, width, height);
  }, [field, style, width, height, ref]);

  return (
    <canvas
      ref={ref}
      style={{
        width: '100%',
        height: 'auto',
        display: 'block',
        borderRadius: 'var(--r-md)',
        border: '1px solid var(--hairline)',
      }}
      aria-label="Shockwave Braid — a weaving generated from traffic trajectories"
    />
  );
}
