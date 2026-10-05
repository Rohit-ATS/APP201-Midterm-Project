import { useEffect, useMemo, useState } from 'react';
import { Badge, Panel, Stat } from '../components/ui/primitives';
import { CorridorProfile } from '../components/charts/CorridorProfile';
import { FundamentalDiagramChart } from '../components/charts/FundamentalDiagram';
import { RoadScene, type CameraMode, type ColorMode } from '../components/scene/RoadScene';
import type { TrafficHook } from '../lib/useTraffic';
import type { SimulationHook } from '../lib/useSimulation';
import {
  mpsToMph,
  mToFt,
  waveSpeed,
  VEHPM_TO_VEHPMI,
} from '../lib/trafficMath';
import { CORRIDOR_LENGTH, SEGMENTS } from '../data/corridor';

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
  const [cameraMode, setCameraMode] = useState<CameraMode>('corridor');
  const [colorMode, setColorMode] = useState<ColorMode>('speed');

  const w = mpsToMph(waveSpeed(params));
  const delayMin = (analysis.travelTime - analysis.freeFlowTravelTime) / 60;
  const miles = CORRIDOR_LENGTH / 1609.344;

  // Drive the 3D traffic from the live reading. The corridor's mean density is
  // converted into a vehicle count for the simulated loop, so what you see
  // moving is as crowded as the real road is right now. It is capped at 140
  // per lane purely so the browser stays smooth — at the true jam density this
  // loop would hold over 500 vehicles per lane.
  const liveMeanDensity = useMemo(
    () =>
      analysis.stations.reduce((sum, st) => sum + st.k, 0) /
      Math.max(1, analysis.stations.length),
    [analysis.stations],
  );

  const { setConfig } = sim;
  useEffect(() => {
    const perLane = Math.round(liveMeanDensity * 4000);
    setConfig({ perLane: Math.max(18, Math.min(140, perLane)) });
  }, [liveMeanDensity, setConfig]);

  // Waves sorted by how fast they are running upstream — the "alert feed"
  const waveFeed = [...analysis.waves]
    .filter((v) => Math.abs(v.u) > 0.05)
    .sort((a, b) => a.u - b.u);

  return (
    <>
      <div className="dash">
        <div className="dash-scene">
          <RoadScene
            sim={sim.sim}
            cameraMode={cameraMode}
            colorMode={colorMode}
            style={{ width: '100%', height: '100%' }}
          />
        </div>

        <div className="dash-overlay">
          {/* ---------------- LEFT ---------------- */}
          <div className="dash-col">
            <Panel
              glass
              title="I-405 S → Sepulveda Pass"
              aside={
                <Badge color={reading.source === 'live' ? 'var(--good)' : 'var(--warning)'}>
                  {reading.source === 'live' ? `${nextRefreshIn}s` : 'recorded'}
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
                  value={`${Math.floor(analysis.travelTime / 60)}`}
                  unit="min"
                  label={`Over ${miles.toFixed(1)} mi`}
                />
                <Stat
                  value={delayMin > 0 ? `+${delayMin.toFixed(0)}` : '0'}
                  unit="min"
                  label="Delay"
                  color={delayMin > 8 ? 'var(--critical)' : undefined}
                />
              </div>

              <div className="row" style={{ marginTop: 16, gap: 8 }}>
                <button className="btn" onClick={refresh} disabled={loading}>
                  {loading ? 'Refreshing…' : 'Refresh now'}
                </button>
              </div>

              {reading.note && (
                <p className="muted" style={{ fontSize: 11.5, marginTop: 12, marginBottom: 0 }}>
                  {reading.note}
                </p>
              )}
            </Panel>

            <Panel glass title="Speed along the pass">
              <CorridorProfile analysis={analysis} aspect={0.52} />
            </Panel>

            <Panel glass title="Where each station sits on the diagram">
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
            <div className="row row-wrap" style={{ justifyContent: 'space-between' }}>
              <Panel glass style={{ padding: '10px 14px' }}>
                <div className="row" style={{ gap: 14 }}>
                  <div>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 650,
                        color: 'var(--series-4)',
                        lineHeight: 1,
                      }}
                      className="tabular"
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
                    <div
                      style={{ fontSize: 20, fontWeight: 650, lineHeight: 1 }}
                      className="tabular"
                    >
                      {sim.stats.meanSpeedMph.toFixed(0)}
                      <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}> mph</span>
                    </div>
                    <div className="stat-label" style={{ marginTop: 3 }}>
                      Simulated mean
                    </div>
                  </div>
                </div>
              </Panel>
            </div>

            <Panel glass style={{ padding: '10px 12px' }}>
              <div className="scene-controls">
                <div className="seg">
                  {(['corridor', 'roadside', 'chase'] as CameraMode[]).map((m) => (
                    <button
                      key={m}
                      data-on={cameraMode === m}
                      onClick={() => setCameraMode(m)}
                    >
                      {m === 'corridor' ? 'Corridor' : m === 'roadside' ? 'Roadside' : 'Chase car'}
                    </button>
                  ))}
                </div>
                <div className="seg">
                  {(['speed', 'paint'] as ColorMode[]).map((m) => (
                    <button key={m} data-on={colorMode === m} onClick={() => setColorMode(m)}>
                      {m === 'speed' ? 'Colour by speed' : 'Real paint'}
                    </button>
                  ))}
                </div>
                <button className="btn" onClick={() => sim.setRunning(!sim.running)}>
                  {sim.running ? 'Pause' : 'Play'}
                </button>
                <button className="btn btn-primary" onClick={sim.perturb}>
                  Tap the brakes
                </button>
              </div>
              <p
                className="muted"
                style={{ fontSize: 11.5, margin: '10px 2px 0', lineHeight: 1.5 }}
              >
                The 3D traffic is a simulation driven by the live speeds on the left: every vehicle
                obeys <code>v = (s − L)/τ</code> and nothing else. Vehicle types are drawn at random
                from the real fleet composition for this corridor, since the traffic API reports how
                fast vehicles move but never what they are.
              </p>
            </Panel>
          </div>

          {/* ---------------- RIGHT ---------------- */}
          <div className="dash-col dash-col-right">
            <Panel glass title="Station readings" aside={<Badge>{analysis.stations.length}</Badge>}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Interchange</th>
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
                      <td style={{ textAlign: 'right' }}>
                        {(s.k * VEHPM_TO_VEHPMI).toFixed(0)}
                      </td>
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
                <Badge color="var(--series-2)">
                  {waveFeed.filter((v) => v.u < 0).length} upstream
                </Badge>
              }
            >
              <p className="muted" style={{ fontSize: 11.5, marginTop: 0, marginBottom: 12 }}>
                The boundary between each neighbouring pair of stations. Every one of these pairs
                has a different speed drop — and yet, wherever both stations are congested, the
                boundary between them comes out at the same{' '}
                <strong style={{ color: 'var(--series-4)' }}>{w.toFixed(1)} mph</strong>. That is
                not the data repeating itself. Two points on the congested branch of the diagram
                lie on one straight line, so the chord between them <em>is</em> that line, and its
                slope is &minus;L/&tau; no matter which two you pick.
              </p>
              <div style={{ display: 'grid', gap: 10 }}>
                {waveFeed.map((wv) => {
                  const up = wv.u < 0;
                  return (
                    <div
                      key={`${wv.from}-${wv.to}`}
                      style={{
                        borderLeft: `2px solid ${up ? 'var(--series-2)' : 'var(--series-3)'}`,
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
                            color: up ? 'var(--series-2)' : 'var(--series-3)',
                          }}
                        >
                          {up ? '←' : '→'} {Math.abs(mpsToMph(wv.u)).toFixed(1)} mph
                        </span>
                      </div>
                      <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                        {up
                          ? 'queue growing upstream'
                          : 'clearing downstream with the traffic'}
                      </div>
                    </div>
                  );
                })}
                {waveFeed.length === 0 && (
                  <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
                    Every station is in the same state — no boundaries to report. The corridor is
                    uniform right now.
                  </p>
                )}
              </div>
            </Panel>

            <Panel glass title="Lane geometry">
              <table className="table">
                <thead>
                  <tr>
                    <th>Segment</th>
                    <th style={{ textAlign: 'right' }}>Lanes</th>
                    <th style={{ textAlign: 'right' }}>Capacity</th>
                  </tr>
                </thead>
                <tbody>
                  {SEGMENTS.map((s) => (
                    <tr key={s.from} title={s.note}>
                      <td style={{ fontSize: 12 }}>{s.from}</td>
                      <td style={{ textAlign: 'right' }}>{s.lanes}</td>
                      <td style={{ textAlign: 'right' }}>
                        {Math.round(
                          s.lanes *
                            (analysis.stations[0]
                              ? (analysis.stations[0].qTotal / analysis.stations[0].lanes)
                              : 0),
                        ).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted" style={{ fontSize: 11.5, marginTop: 12, marginBottom: 0 }}>
                The pass drops from five lanes to four at Valley Vista and does not get the fifth
                back until the Getty. That narrowing is the bottleneck — and the jam is born at its
                upstream edge.
              </p>
            </Panel>
          </div>
        </div>
      </div>

      {/* ---------------- READING GUIDE ---------------- */}
      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">How to read this dashboard</div>
            <h2 className="h2">Three views of one geometry</h2>
          </div>
          <div className="cards">
            <Panel>
              <strong style={{ display: 'block', marginBottom: 8 }}>The profile</strong>
              <p style={{ fontSize: 13.5, margin: 0 }}>
                Speed against distance. A single average for the corridor would hide the only thing
                that matters — the <em>difference</em> between neighbouring sections. A wave is a
                difference; average it away and the wave disappears.
              </p>
            </Panel>
            <Panel>
              <strong style={{ display: 'block', marginBottom: 8 }}>The diagram</strong>
              <p style={{ fontSize: 13.5, margin: 0 }}>
                The same ten stations replotted as flow against density. Stations on the left arm
                are working; stations on the right arm are failing. The dashed chord between two of
                them has a slope, and that slope is a speed in miles per hour.
              </p>
            </Panel>
            <Panel>
              <strong style={{ display: 'block', marginBottom: 8 }}>The 3D view</strong>
              <p style={{ fontSize: 13.5, margin: 0 }}>
                Vehicles at true scale — a sedan is {mToFt(4.7).toFixed(0)} ft here and a
                semi-trailer is {mToFt(21).toFixed(0)} ft, because the length of these boxes{' '}
                <em>is</em> the L in the equation. Switch to <em>Colour by speed</em> and the jams
                light up as bright bands moving against the traffic.
              </p>
            </Panel>
          </div>
        </div>
      </section>
    </>
  );
}
