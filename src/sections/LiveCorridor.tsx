import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Panel, Stat } from '../components/ui/primitives';
import { CorridorProfile } from '../components/charts/CorridorProfile';
import { FundamentalDiagramChart } from '../components/charts/FundamentalDiagram';
import { RoadScene, type CameraMode, type ColorMode } from '../components/scene/RoadScene';
import { VehicleInspector } from '../components/VehicleInspector';
import { BUILDING_COUNT, BUILDINGS_REMOVED } from '../components/scene/Buildings';
import type { TrafficHook } from '../lib/useTraffic';
import type { SimulationHook } from '../lib/useSimulation';
import {
  mpsToMph,
  waveSpeed,
  saturationFlow,
  VEHPM_TO_VEHPMI,
} from '../lib/trafficMath';
import {
  CORRIDOR_LENGTH,
  CORRIDOR_NAME,
  CORRIDOR_SUBTITLE,
  SEGMENTS,
} from '../data/corridor';

const LOS_COLOR: Record<string, string> = {
  A: 'var(--good)',
  B: 'var(--good)',
  C: 'var(--warning)',
  D: 'var(--serious)',
  E: 'var(--serious)',
  F: 'var(--critical)',
};

export function LiveCorridor({
  traffic,
  sim,
}: {
  traffic: TrafficHook;
  sim: SimulationHook;
}) {
  const { analysis, params, reading, loading, refresh, nextRefreshIn } = traffic;
  const [cameraMode, setCameraMode] = useState<CameraMode>('street');
  const [colorMode, setColorMode] = useState<ColorMode>('paint');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showBuildings, setShowBuildings] = useState(true);
  const rightColRef = useRef<HTMLDivElement>(null);

  // Bring the inspector into view when a vehicle is picked: on a short screen
  // the panel can open below the fold.
  useEffect(() => {
    if (selectedId != null) rightColRef.current?.scrollTo({ top: 0 });
  }, [selectedId]);

  const w = mpsToMph(waveSpeed(params));
  const delayMin = (analysis.travelTime - analysis.freeFlowTravelTime) / 60;
  const miles = CORRIDOR_LENGTH / 1609.344;

  // Drive the 3D traffic from the live reading: the corridor's mean density
  // becomes the vehicle count on the simulated street, so what is moving on
  // screen is as crowded as Figueroa is right now.
  const liveMeanDensity = useMemo(
    () =>
      analysis.stations.reduce((sum, st) => sum + st.k, 0) /
      Math.max(1, analysis.stations.length),
    [analysis.stations],
  );

  const { setConfig } = sim;
  useEffect(() => {
    const perLane = Math.round(liveMeanDensity * CORRIDOR_LENGTH);
    setConfig({ perLane: Math.max(12, Math.min(95, perLane)) });
  }, [liveMeanDensity, setConfig]);

  const waveFeed = [...analysis.waves]
    .filter((v) => Math.abs(v.u) > 0.05)
    .sort((a, b) => a.u - b.u);

  const greens = sim.sim.signals.filter((s) => s.green).length;

  return (
    <>
      <div className="dash">
        <div className="dash-scene">
          <RoadScene
            sim={sim.sim}
            centerline={reading.centerline}
            cameraMode={cameraMode}
            colorMode={colorMode}
            selectedId={selectedId}
            onSelect={setSelectedId}
            showBuildings={showBuildings}
            style={{ width: '100%', height: '100%' }}
          />
        </div>

        <div className="dash-overlay">
          {/* ---------------- LEFT ---------------- */}
          <div className="dash-col">
            <Panel
              glass
              title={`${CORRIDOR_NAME} → southbound`}
              aside={
                <Badge color={reading.source === 'live' ? 'var(--good)' : 'var(--warning)'}>
                  {reading.source === 'live' ? `live · ${nextRefreshIn}s` : 'recorded'}
                </Badge>
              }
            >
              <div className="row" style={{ alignItems: 'baseline', gap: 10 }}>
                <div
                  className="stat-value tabular"
                  style={{
                    color:
                      analysis.congestionLevel > 55
                        ? 'var(--critical)'
                        : analysis.congestionLevel > 30
                          ? 'var(--serious)'
                          : 'var(--good)',
                  }}
                >
                  {analysis.congestionLevel}
                  <span className="stat-unit">%</span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', lineHeight: 1.35 }}>
                  of your drive
                  <br />
                  is pure delay
                </div>
              </div>

              <div className="dash-strip" style={{ marginTop: 18 }}>
                <Stat
                  value={mpsToMph(analysis.meanSpeed).toFixed(0)}
                  unit="mph"
                  label="Mean speed"
                />
                <Stat
                  value={`${Math.round(analysis.travelTime / 60)}`}
                  unit="min"
                  label={`Over ${miles.toFixed(1)} mi`}
                />
                <Stat
                  value={delayMin > 0 ? `+${delayMin.toFixed(0)}` : '0'}
                  unit="min"
                  label="Delay"
                  color={delayMin > 4 ? 'var(--critical)' : undefined}
                />
              </div>

              <div className="row" style={{ marginTop: 16, gap: 8 }}>
                <button className="btn" onClick={refresh} disabled={loading}>
                  {loading ? 'Refreshing…' : 'Refresh now'}
                </button>
              </div>

              <p className="muted" style={{ fontSize: 11.5, marginTop: 12, marginBottom: 0 }}>
                {reading.note ??
                  `${BUILDING_COUNT} real OpenStreetMap buildings beside the real OSM centreline of Figueroa` +
                    (reading.centerlineSource === 'gps'
                      ? `, refined by ${reading.gpsPointCount.toLocaleString()} GPS points returned live by TomTom.`
                      : '.') +
                    (BUILDINGS_REMOVED > 0
                      ? ` ${BUILDINGS_REMOVED} footprint${BUILDINGS_REMOVED === 1 ? '' : 's'} overlapping the roadway removed.`
                      : '')}
              </p>
            </Panel>

            <Panel glass title="Speed along the street">
              <CorridorProfile analysis={analysis} aspect={0.52} />
            </Panel>

            <Panel glass title="Where each intersection sits on the diagram">
              <FundamentalDiagramChart
                params={params}
                stations={analysis.stations}
                showGreenshields={false}
                chord={
                  analysis.dominantWave
                    ? [analysis.dominantWave.from, analysis.dominantWave.to]
                    : undefined
                }
                aspect={0.72}
              />
            </Panel>
          </div>

          {/* ---------------- CENTRE ---------------- */}
          <div className="dash-col dash-col-mid">
            <div className="row row-wrap" style={{ justifyContent: 'space-between', gap: 10 }}>
              <Panel glass style={{ padding: '10px 14px' }}>
                <div className="row" style={{ gap: 14 }}>
                  <div>
                    <div
                      className="tabular"
                      style={{ fontSize: 20, fontWeight: 650, color: 'var(--series-4)', lineHeight: 1 }}
                    >
                      {w.toFixed(1)}
                      <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}> mph ←</span>
                    </div>
                    <div className="stat-label" style={{ marginTop: 3 }}>
                      Wave speed L/τ
                    </div>
                  </div>
                  <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--hairline)' }} />
                  <div>
                    <div className="tabular" style={{ fontSize: 20, fontWeight: 650, lineHeight: 1 }}>
                      {greens}
                      <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                        {' '}
                        / {sim.sim.signals.length} green
                      </span>
                    </div>
                    <div className="stat-label" style={{ marginTop: 3 }}>
                      Signals now
                    </div>
                  </div>
                  <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--hairline)' }} />
                  <div>
                    <div className="tabular" style={{ fontSize: 20, fontWeight: 650, lineHeight: 1 }}>
                      {sim.stats.meanSpeedMph.toFixed(0)}
                      <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}> mph</span>
                    </div>
                    <div className="stat-label" style={{ marginTop: 3 }}>
                      Simulated mean
                    </div>
                  </div>
                </div>
              </Panel>

              {selectedId == null && (
                <span className="pick-hint">
                  <span className="badge-dot" style={{ background: 'var(--series-4)' }} />
                  Click any vehicle to open its own equation
                </span>
              )}
            </div>

            <Panel glass style={{ padding: '10px 12px' }}>
              <div className="scene-controls">
                <div className="seg">
                  {(['street', 'aerial', 'chase'] as CameraMode[]).map((m) => (
                    <button
                      key={m}
                      data-on={cameraMode === m}
                      onClick={() => setCameraMode(m)}
                      disabled={m === 'chase' && selectedId == null}
                      title={
                        m === 'chase' && selectedId == null
                          ? 'Select a vehicle first'
                          : undefined
                      }
                    >
                      {m === 'street' ? 'Street' : m === 'aerial' ? 'Aerial' : 'Chase'}
                    </button>
                  ))}
                </div>
                <div className="seg">
                  {(['paint', 'speed'] as ColorMode[]).map((m) => (
                    <button key={m} data-on={colorMode === m} onClick={() => setColorMode(m)}>
                      {m === 'paint' ? 'Real paint' : 'Colour by speed'}
                    </button>
                  ))}
                </div>
                <button className="btn" onClick={() => setShowBuildings((b) => !b)}>
                  {showBuildings ? 'Hide' : 'Show'} buildings
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    // Clicking a moving car during a live presentation is
                    // fiddly, so this picks one that is doing something
                    // interesting: queued at a red, or else the slowest car on
                    // the street.
                    const vs = sim.sim.vehicles;
                    if (!vs.length) return;
                    const queued = vs.filter((v) => v.limitedBy === 'signal');
                    const pool = queued.length ? queued : vs;
                    const pick = pool.reduce((m, v) => (v.v < m.v ? v : m), pool[0]);
                    setSelectedId(pick.id);
                  }}
                >
                  Inspect a car
                </button>
                <button className="btn" onClick={() => sim.setRunning(!sim.running)}>
                  {sim.running ? 'Pause' : 'Play'}
                </button>
                <button className="btn btn-primary" onClick={sim.perturb}>
                  Tap the brakes
                </button>
              </div>
              <p className="muted" style={{ fontSize: 11.5, margin: '10px 2px 0', lineHeight: 1.5 }}>
                Real street, real buildings, real signal timing. Every vehicle obeys{' '}
                <code>v = (s − L)/τ</code> and nothing else — a red light is just a stopped car of
                zero length on the stop line. Vehicle types are drawn from the real downtown fleet,
                because a traffic API reports how fast vehicles move but never what they are.
              </p>
            </Panel>
          </div>

          {/* ---------------- RIGHT ---------------- */}
          <div className="dash-col dash-col-right" ref={rightColRef}>
            {selectedId != null && (
              <VehicleInspector
                sim={sim.sim}
                params={params}
                selectedId={selectedId}
                onClose={() => {
                  setSelectedId(null);
                  if (cameraMode === 'chase') setCameraMode('street');
                }}
              />
            )}

            <Panel
              glass
              title="Signals"
              aside={<Badge color="var(--good)">{greens} green</Badge>}
            >
              {sim.sim.signals.map((s) => (
                <div className="signal-row" key={s.name}>
                  <span className="row" style={{ gap: 8 }}>
                    <span
                      className="signal-lamp"
                      style={{ background: s.green ? 'var(--good)' : 'var(--critical)' }}
                    />
                    {s.name}
                  </span>
                  <span className="muted tabular" style={{ fontSize: 11.5 }}>
                    {s.green ? 'green' : 'red'} · {s.changesIn.toFixed(0)}s
                  </span>
                </div>
              ))}
              <p className="muted" style={{ fontSize: 11.5, marginTop: 10, marginBottom: 0 }}>
                90-second cycles on an offset progression, as LADOT runs the downtown grid. Every
                time one of these turns red it manufactures a queue, and the back of that queue
                travels away from the light at {w.toFixed(1)} mph.
              </p>
            </Panel>

            <Panel glass title="Intersection readings" aside={<Badge>{analysis.stations.length}</Badge>}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Cross street</th>
                    <th style={{ textAlign: 'right' }}>mph</th>
                    <th style={{ textAlign: 'right' }}>veh/mi</th>
                    <th style={{ textAlign: 'right' }}>LOS</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.stations.map((s) => (
                    <tr key={s.name}>
                      <td style={{ fontSize: 12.5 }}>{s.name}</td>
                      <td style={{ textAlign: 'right' }}>{mpsToMph(s.v).toFixed(0)}</td>
                      <td style={{ textAlign: 'right' }}>{(s.k * VEHPM_TO_VEHPMI).toFixed(0)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span
                          className="badge"
                          style={{
                            borderColor: 'transparent',
                            padding: '2px 7px',
                            color: LOS_COLOR[s.los],
                          }}
                        >
                          {s.los}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            <Panel
              glass
              title="Wave readings"
              aside={
                <Badge color="var(--series-4)">
                  {waveFeed.filter((v) => v.u < 0).length} upstream
                </Badge>
              }
            >
              <p className="muted" style={{ fontSize: 11.5, marginTop: 0, marginBottom: 12 }}>
                The boundary between each neighbouring pair of intersections. Every pair has a
                different speed drop — and yet, wherever both are congested, the boundary comes out
                at the same <strong style={{ color: 'var(--series-4)' }}>{w.toFixed(1)} mph</strong>
                . That is not the data repeating itself. Two points on the congested branch lie on
                one straight line, so the chord between them <em>is</em> that line, and its slope is
                &minus;L/&tau; whichever two you pick.
              </p>
              <div style={{ display: 'grid', gap: 10 }}>
                {waveFeed.map((wv) => {
                  const up = wv.u < 0;
                  return (
                    <div
                      key={`${wv.from}-${wv.to}`}
                      style={{
                        borderLeft: `2px solid ${up ? 'var(--series-4)' : 'var(--series-3)'}`,
                        paddingLeft: 11,
                      }}
                    >
                      <div
                        className="row"
                        style={{ justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}
                      >
                        <strong style={{ fontSize: 12.5 }}>
                          {wv.from} → {wv.to}
                        </strong>
                        <span
                          className="tabular"
                          style={{
                            fontSize: 13,
                            fontWeight: 650,
                            color: up ? 'var(--series-4)' : 'var(--series-3)',
                          }}
                        >
                          {up ? '←' : '→'} {Math.abs(mpsToMph(wv.u)).toFixed(1)} mph
                        </span>
                      </div>
                      <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                        {up ? 'queue growing upstream' : 'clearing downstream with the traffic'}
                      </div>
                    </div>
                  );
                })}
                {waveFeed.length === 0 && (
                  <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
                    Every intersection is in the same state — no boundaries to report.
                  </p>
                )}
              </div>
            </Panel>

            <Panel glass title="Lane geometry">
              <table className="table">
                <thead>
                  <tr>
                    <th>Block</th>
                    <th style={{ textAlign: 'right' }}>Lanes</th>
                    <th style={{ textAlign: 'right' }}>Sat. flow</th>
                  </tr>
                </thead>
                <tbody>
                  {SEGMENTS.map((s) => (
                    <tr key={s.from} title={s.note}>
                      <td style={{ fontSize: 12 }}>{s.from}</td>
                      <td style={{ textAlign: 'right' }}>{s.lanes}</td>
                      <td style={{ textAlign: 'right' }}>
                        {Math.round(s.lanes * saturationFlow(params) * 3600).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted" style={{ fontSize: 11.5, marginTop: 12, marginBottom: 0 }}>
                Saturation flow is what the lanes could discharge with a permanent green. Multiply
                by the green share of the cycle to get what they actually carry — roughly 45% of
                these numbers.
              </p>
            </Panel>
          </div>
        </div>
      </div>

      {/* ---------------- READING GUIDE ---------------- */}
      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">How to read this</div>
            <h2 className="h2">{CORRIDOR_SUBTITLE}</h2>
            <p className="lede">
              Three views of the same geometry, and one of them you can click.
            </p>
          </div>
          <div className="cards">
            <Panel>
              <strong style={{ display: 'block', marginBottom: 8 }}>Click a car</strong>
              <p style={{ fontSize: 13.5, margin: 0 }}>
                The inspector solves that vehicle&rsquo;s own copy of{' '}
                <code>v = (s − L)/τ</code> with its own numbers, and names which constraint is
                binding: the open road, the car in front, or a red light. Follow one car through a
                light and watch the binding term hand over.
              </p>
            </Panel>
            <Panel>
              <strong style={{ display: 'block', marginBottom: 8 }}>The street is real</strong>
              <p style={{ fontSize: 13.5, margin: 0 }}>
                The road mesh is built from the GPS trace TomTom returns with each reading, and the{' '}
                {BUILDING_COUNT} buildings are real OpenStreetMap footprints at their real heights,
                in the same metre grid. The Wilshire Grand is 335 m here because it is 335 m.
              </p>
            </Panel>
            <Panel>
              <strong style={{ display: 'block', marginBottom: 8 }}>The signals do the work</strong>
              <p style={{ fontSize: 13.5, margin: 0 }}>
                On a freeway you wait for a jam. Here one is manufactured every 90 seconds by a red
                light, which means the backward wave can be watched on demand. Switch to{' '}
                <em>Colour by speed</em> and the queues light up as bands moving the wrong way.
              </p>
            </Panel>
          </div>
        </div>
      </section>
    </>
  );
}
