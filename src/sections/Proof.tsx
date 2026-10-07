import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { TrafficHook } from '../lib/useTraffic';
import { ProofScene } from '../proof/ProofScene';
import { ProofOverlay, spaceTimeLayer } from '../proof/ProofOverlay';
import { brakeScenario, queueScenario } from '../proof/newell';
import { CHAPTERS, CHAPTER_STARTS, TOTAL_LEN, publish, story, storyFromScroll } from '../proof/story';
import { WILSHIRE } from '../proof/beats';

/**
 * The animated proof: a tall scroll with a pinned full-screen stage. Scroll
 * position is turned into a story position, eased so scrubbing feels like
 * film, and handed to the 3D scene and the overlay.
 */
export function Proof({
  traffic,
  onNavigate,
}: {
  traffic: TrafficHook;
  onNavigate: (v: 'overview' | 'live' | 'proof' | 'maths' | 'creation') => void;
}) {
  const { params } = traffic;
  const track = useRef<HTMLDivElement>(null);

  const data = useMemo(
    () => ({
      params,
      brake: brakeScenario(params),
      queue: queueScenario(params, WILSHIRE.split * WILSHIRE.cycle),
    }),
    [params],
  );

  useEffect(() => {
    story.target = 0;
    story.current = 0;
    let raf = 0;
    let last = performance.now();
    story.snap =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      new URLSearchParams(window.location.search).has('snap');
    // ?at=4.5 pins the film halfway through chapter 4 — for taking stills
    const pinned = Number.parseFloat(new URLSearchParams(window.location.search).get('at') ?? '');
    if (Number.isFinite(pinned)) story.snap = true;
    // ?perf plays the whole film on its own and reports frame times per chapter
    const perfArg = new URLSearchParams(window.location.search).get('perf');
    const perf = perfArg !== null ? { t0: 0, warm: Number(perfArg) || 3, frames: [] as number[][] } : null;

    const loop = (now: number) => {
      const raw = now - last;
      const dt = Math.min(raw / 1000, 0.1);
      last = now;
      const el = track.current;
      if (perf) {
        perf.t0 ||= now;
        const s = (now - perf.t0) / 1000 - perf.warm; // let loading finish first
        story.target = Math.max(0, Math.min(s / 2.2, CHAPTERS.length - 0.001));
        if (s > 0) (perf.frames[Math.floor(story.current)] ??= []).push(raw);
        if (s / 2.2 > CHAPTERS.length + 0.5 && !document.getElementById('perf')) {
          const out = document.createElement('pre');
          out.id = 'perf';
          out.textContent = JSON.stringify(
            perf.frames.map((f, i) => {
              const sorted = [...f].sort((a, b) => a - b);
              return {
                ch: CHAPTERS[i]?.id,
                avg: +(f.reduce((a, b) => a + b, 0) / f.length).toFixed(1),
                p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1),
                max: +sorted[sorted.length - 1].toFixed(1),
              };
            }),
          );
          document.body.appendChild(out);
        }
      } else if (el) {
        const screens = -el.getBoundingClientRect().top / window.innerHeight;
        story.target = Number.isFinite(pinned) ? pinned : storyFromScroll(Math.max(0, screens));
      }
      const before = story.current;
      const gap = story.target - story.current;
      story.current = story.snap || Math.abs(gap) < 1e-4 ? story.target : story.current + gap * Math.min(1, dt * 5.5);
      if (story.current !== before) publish();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // build the space-time chart while the browser is idle, not when step 7 arrives
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 600));
    const id = idle(() => spaceTimeLayer(data.brake));
    return () => (window.cancelIdleCallback ?? window.clearTimeout)(id);
  }, [data.brake]);

  const jump = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + (CHAPTER_STARTS[i] + 0.02) * window.innerHeight, behavior: 'smooth' });
  }, []);

  return (
    <section className="proof" aria-label="The proof, animated">
      <div ref={track} className="proof-track" style={{ height: `${(TOTAL_LEN + 1) * 100}vh` }}>
        <div className="proof-stage">
          <div className="proof-canvas">
            <ProofScene data={data} />
          </div>
          <ProofOverlay data={data} onNavigate={onNavigate} onJump={jump} />
        </div>
      </div>
    </section>
  );
}
