/**
 * story.ts
 * ---------------------------------------------------------------------------
 * The running order of the animated proof, and the one number that drives it.
 *
 * The page is a tall scroll. Each chapter owns `len` screen-heights of it.
 * Scroll position becomes a single value, `story.current`, read as
 * "chapter index + progress through that chapter" — so 4.5 means halfway
 * through chapter 4. The 3D scene reads it every frame and the text overlay
 * re-renders from it. Nothing is on a timer: scroll back and the film runs
 * backwards.
 */

import { useSyncExternalStore } from 'react';

export const CHAPTERS = [
  { id: 'intro', len: 1.6, label: 'Start' },
  { id: 'own', len: 2.0, label: 'L' },
  { id: 'gap', len: 2.4, label: 's = L + vτ' },
  { id: 'flip', len: 2.4, label: 'k = 1/s' },
  { id: 'flow', len: 3.0, label: 'q = kv' },
  { id: 'triangle', len: 2.8, label: 'Triangle' },
  { id: 'slope', len: 2.2, label: 'Slopes' },
  { id: 'jam', len: 4.2, label: 'The wave' },
  { id: 'answer', len: 2.2, label: 'w = L/τ' },
  { id: 'green', len: 3.6, label: 'One green' },
  { id: 'outro', len: 1.4, label: 'End' },
] as const;

export type ChapterId = (typeof CHAPTERS)[number]['id'];

export const TOTAL_LEN = CHAPTERS.reduce((s, c) => s + c.len, 0);

/** Scroll offsets (in screen heights) where each chapter begins. */
export const CHAPTER_STARTS = CHAPTERS.map((_, i) =>
  CHAPTERS.slice(0, i).reduce((s, c) => s + c.len, 0),
);

/** Screen-heights scrolled → story position (chapter index + progress). */
export function storyFromScroll(screens: number): number {
  for (let i = CHAPTERS.length - 1; i >= 0; i--) {
    if (screens >= CHAPTER_STARTS[i]) {
      return Math.min(i + (screens - CHAPTER_STARTS[i]) / CHAPTERS[i].len, CHAPTERS.length - 0.0001);
    }
  }
  return 0;
}

/** Split a story position into its chapter and the progress through it. */
export function split(pos: number): { index: number; p: number; id: ChapterId } {
  const index = Math.min(Math.max(Math.floor(pos), 0), CHAPTERS.length - 1);
  return { index, p: Math.min(Math.max(pos - index, 0), 1), id: CHAPTERS[index].id };
}

/* ------------------------------------------------------------------ */
/* the shared value                                                    */
/* ------------------------------------------------------------------ */

export const story = {
  /** where the scrollbar says we are */
  target: 0,
  /** where the film is — eases toward target, so scrubbing feels like film */
  current: 0,
  /** seconds since the proof mounted, for ambient motion */
  clock: 0,
  /** skip all easing — for reduced motion, and for taking stills (?snap) */
  snap: false,
};

const listeners = new Set<() => void>();

export function publish() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** React hook: re-render with the current story position. */
export function useStory(): number {
  return useSyncExternalStore(subscribe, () => story.current);
}

/* ------------------------------------------------------------------ */
/* easing helpers shared by the scene and the overlay                  */
/* ------------------------------------------------------------------ */

export const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);

/** progress of p through the window [a, b], clamped to 0..1 */
export const span = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));

export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
