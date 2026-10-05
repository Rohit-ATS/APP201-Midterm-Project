import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchCorridor, snapshotReading, REFRESH_MS, type CorridorReading } from './tomtom';
import { analyse, type CorridorAnalysis } from './analysis';
import { DEFAULT_PARAMS, type TrafficParams } from './trafficMath';

export interface TrafficHook {
  reading: CorridorReading;
  analysis: CorridorAnalysis;
  params: TrafficParams;
  setParams: (p: Partial<TrafficParams>) => void;
  resetParams: () => void;
  loading: boolean;
  refresh: () => void;
  /** seconds until the next automatic refresh */
  nextRefreshIn: number;
}

/**
 * Polls the corridor and keeps the derived geometry in sync.
 *
 * The model parameters live here too, because the dashboard lets you change
 * them: dragging the reaction-time slider changes the backward wave speed,
 * which changes every chart on the page at once. That coupling is the point —
 * it makes visible that these are not independent dials but one geometry seen
 * from several sides.
 */
export function useTraffic(): TrafficHook {
  const [reading, setReading] = useState<CorridorReading>(() => snapshotReading());
  const [loading, setLoading] = useState(true);
  const [params, setParamsState] = useState<TrafficParams>(DEFAULT_PARAMS);
  const [nextRefreshIn, setNextRefreshIn] = useState(REFRESH_MS / 1000);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const next = await fetchCorridor(ctrl.signal);
      if (!ctrl.signal.aborted) {
        setReading(next);
        setNextRefreshIn(REFRESH_MS / 1000);
      }
    } catch {
      if (!ctrl.signal.aborted) setReading(snapshotReading('Network error — recorded reading.'));
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), REFRESH_MS);
    const tick = setInterval(
      () => setNextRefreshIn((s) => (s <= 1 ? REFRESH_MS / 1000 : s - 1)),
      1000,
    );
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      abortRef.current?.abort();
    };
  }, [load]);

  const setParams = useCallback((patch: Partial<TrafficParams>) => {
    setParamsState((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetParams = useCallback(() => setParamsState(DEFAULT_PARAMS), []);

  const analysis = useMemo(() => analyse(reading, params), [reading, params]);

  return {
    reading,
    analysis,
    params,
    setParams,
    resetParams,
    loading,
    refresh: () => void load(),
    nextRefreshIn,
  };
}
