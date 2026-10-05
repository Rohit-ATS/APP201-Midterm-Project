import { Badge, Panel, Stat } from '../components/ui/primitives';
import { CorridorProfile } from '../components/charts/CorridorProfile';
import { RoadScene } from '../components/scene/RoadScene';
import type { TrafficHook } from '../lib/useTraffic';
import type { SimulationHook } from '../lib/useSimulation';
import { mpsToMph, waveSpeed, mToFt } from '../lib/trafficMath';
import { CORRIDOR_LENGTH } from '../data/corridor';
import { BUILDING_COUNT } from '../components/scene/Buildings';

export function Overview({
  traffic,
  sim,
  onNavigate,
}: {
  traffic: TrafficHook;
  sim: SimulationHook;
  onNavigate: (v: 'overview' | 'live' | 'maths' | 'creation') => void;
}) {
  const { analysis, params, reading } = traffic;
  const w = mpsToMph(waveSpeed(params));
  const delayMin = (analysis.travelTime - analysis.freeFlowTravelTime) / 60;
  const miles = CORRIDOR_LENGTH / 1609.344;

  return (
    <>
      {/* ================= HERO ================= */}
      <section className="hero">
        <div className="hero-scene">
          <RoadScene
            sim={sim.sim}
            centerline={reading.centerline}
            cameraMode="aerial"
            colorMode="paint"
            selectedId={null}
            onSelect={() => {}}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
        <div className="hero-veil" />

        <div className="hero-content">
          <div className="wrap-wide">
            <div className="hero-kicker">
              <Badge color="var(--series-1)">APP201 · Geometry in the World</Badge>
              <Badge color={reading.source === 'live' ? 'var(--good)' : 'var(--warning)'}>
                {reading.source === 'live' ? 'Live traffic' : 'Recorded traffic'} · S Figueroa St, DTLA
              </Badge>
            </div>

            <h1 className="display">
              A traffic jam is a wave,
              <br />
              and it travels the wrong way.
            </h1>

            <p className="hero-sub">
              On Figueroa, at the foot of the tallest towers in the western United States, the
              cars go south and the jam goes north at {w.toFixed(0)} mph. That second number is not
              a coincidence and not a measurement — it is a car&rsquo;s length divided by a
              driver&rsquo;s reaction time, and you can derive it from a single straight line.
            </p>

            <div className="hero-actions">
              <button className="btn btn-primary" onClick={() => onNavigate('maths')}>
                See the geometry
              </button>
              <button className="btn" onClick={() => onNavigate('live')}>
                Open the live street
              </button>
            </div>

            <div className="hero-stats">
              <Stat
                value={w.toFixed(1)}
                unit="mph"
                label="Backward wave speed"
                color="var(--series-4)"
                sub="= L / τ"
              />
              <Stat
                value={mpsToMph(analysis.meanSpeed).toFixed(0)}
                unit="mph"
                label="Corridor mean, now"
                color="var(--series-1)"
              />
              <Stat
                value={delayMin > 0 ? `+${delayMin.toFixed(0)}` : '0'}
                unit="min"
                label={`Delay over ${miles.toFixed(1)} mi`}
                color={delayMin > 8 ? 'var(--critical)' : 'var(--ink-primary)'}
              />
              <Stat
                value={Math.round(analysis.vehiclesOnRoad).toLocaleString()}
                label="Vehicles on the street"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ================= 1 · NOTICE ================= */}
      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">Section 1 · Notice + Name</div>
            <h2 className="h2">The light turned green ten seconds ago</h2>
            <p className="lede">
              You are stopped on Figueroa, six cars back from the red at 7th. The light turns
              green. Nothing happens to you. A beat later the first car moves, then the second,
              then the third — and the movement arrives at you like something travelling down the
              line. Which is exactly what it is.
            </p>
          </div>

          <div className="split split-wide-right">
            <div className="prose">
              <h3 className="h3">What I noticed</h3>
              <p>
                I started counting the delay. It was always about the same — and when I watched the
                brake lights come <em>on</em> at a red instead of off at a green, the same thing
                happened in reverse: a line of red lighting up backwards down the block, one car at
                a time, at a steady pace.
              </p>
              <p>
                <strong>The queue was moving.</strong> Not the way traffic moves. Moving{' '}
                <em>against</em> it. Every car was pointed south and going south, and the back edge
                of the jam was travelling north, up Figueroa, reaching cars that had not even
                arrived at the intersection yet.
              </p>
              <p>
                The cars and the traffic jam were going in opposite directions at the same time.
                That is a strange enough sentence that I wanted to know whether it was really true,
                and if it was, how fast the backwards thing was going.
              </p>

              <h3 className="h3" style={{ marginTop: 34 }}>
                Why it caught my attention
              </h3>
              <p>
                Because it meant the jam was not made of cars. It was a <em>shape</em> that cars
                passed through — the way a wave on water is not water travelling across the ocean,
                but water going up and down in place while the shape moves.
              </p>
              <p>
                And if a jam is a shape, then it has geometry. It has a speed, a direction, a front
                and a back edge, and a slope on a graph. Those are things I can measure and predict
                instead of just complaining about.
              </p>
              <p>
                Downtown turned out to be the right place to look. On a freeway you have to wait
                for a jam to happen. On Figueroa one is manufactured every ninety seconds by a red
                light, so the thing I wanted to measure arrives on a schedule.
              </p>

              <h3 className="h3" style={{ marginTop: 34 }}>
                Naming it
              </h3>
              <p>
                The thing I had been watching has a name: a <strong>stop-and-go wave</strong>, or
                more precisely a <strong>shockwave</strong> — the moving boundary between two
                different states of traffic. The property I wanted was its{' '}
                <strong>wave speed</strong>: how fast that boundary travels, and in which direction.
              </p>
            </div>

            <div>
              <Panel title="Visual evidence · the street right now">
                <CorridorProfile analysis={analysis} />
              </Panel>

              <div className="callout" style={{ marginTop: 20 }}>
                <div className="callout-title">The evidence in one sentence</div>
                <p>
                  Right now the slowest point on this street is{' '}
                  <strong>{analysis.worst.name}</strong> at{' '}
                  <strong>{mpsToMph(analysis.worst.v).toFixed(0)} mph</strong>, while traffic
                  further <em>down</em> the street is moving faster. Cars are leaving the slow
                  block quicker than they are arriving at it — so the back of the queue has to be
                  moving backwards. That is the wave, visible in a chart instead of a mirror.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= THE QUESTIONS ================= */}
      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">The investigation</div>
            <h2 className="h2">Four questions I wanted to answer</h2>
          </div>

          <div className="cards">
            {[
              {
                n: 1,
                q: 'How fast does a jam travel backwards?',
                a: 'And is it the same speed every time, or does it depend on the day, the road, the drivers?',
              },
              {
                n: 2,
                q: 'Where does that speed come from?',
                a: 'If it is predictable, something must determine it. What is the thing being divided by what?',
              },
              {
                n: 3,
                q: 'Why do jams start with no cause?',
                a: 'A crash explains a jam. But most of these have no crash. What makes one appear out of nothing?',
              },
              {
                n: 4,
                q: 'Why can a street this wide carry so little?',
                a: 'Four lanes under the densest office towers in the west, and it crawls. Is the answer more lanes, or is the lane count not the thing that matters?',
              },
            ].map((c) => (
              <Panel key={c.n}>
                <div className="row" style={{ alignItems: 'flex-start', marginBottom: 10 }}>
                  <span className="step-num">{c.n}</span>
                  <strong style={{ fontSize: 15.5, lineHeight: 1.35 }}>{c.q}</strong>
                </div>
                <p style={{ margin: 0, fontSize: 14 }}>{c.a}</p>
              </Panel>
            ))}
          </div>

          <div className="callout" style={{ marginTop: 34 }}>
            <div className="callout-title">The guess I started with</div>
            <p>
              My first idea was that it had to do with <strong>space</strong>. A fast car needs more
              room in front of it than a slow car, so when a road fills up, something has to give.
              I did not know what that meant mathematically yet — but &ldquo;how much road does one
              car need?&rdquo; turned out to be exactly the right question, and the answer is a
              straight line. The whole of{' '}
              <button
                className="btn"
                style={{ padding: '2px 8px', fontSize: 13 }}
                onClick={() => onNavigate('maths')}
              >
                Section 2
              </button>{' '}
              comes out of it.
            </p>
          </div>
        </div>
      </section>

      {/* ================= WHY THIS PLACE ================= */}
      <section className="section">
        <div className="wrap">
          <div className="split">
            <div className="prose">
              <div className="eyebrow">The site</div>
              <h2 className="h2">Why South Figueroa</h2>
              <p>
                This {miles.toFixed(1)}-mile run of Figueroa, from 3rd Street down to 11th, passes
                the foot of the tallest buildings in the western United States. The{' '}
                <strong>Wilshire Grand</strong> at 335 m and the <strong>US Bank Tower</strong> at
                310 m are both on it, and the scene on this site renders their real footprints at
                their real heights.
              </p>
              <p>
                That skyline <em>is</em> the demand. All of that floor space empties onto one
                street twice a day, through ten signalised intersections in under a mile. Figueroa
                is also a trunk bus route, which puts a 40-foot vehicle in the mix roughly every
                twenty-second car.
              </p>
              <p>
                But the real reason I chose a street over a freeway is that a street is a better
                laboratory. On the 405 you wait for a jam and hope. Here a red light builds one on a
                ninety-second cycle, releases it, and builds it again — so the backward wave can be
                watched on demand, over and over, from the kerb.
              </p>
            </div>

            <Panel title="The street, geometrically">
              <table className="table">
                <thead>
                  <tr>
                    <th>Property</th>
                    <th style={{ textAlign: 'right' }}>Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Length studied</td>
                    <td style={{ textAlign: 'right' }}>{miles.toFixed(2)} mi</td>
                  </tr>
                  <tr>
                    <td>Signalised intersections</td>
                    <td style={{ textAlign: 'right' }}>{analysis.stations.length}</td>
                  </tr>
                  <tr>
                    <td>Lanes (narrowest block)</td>
                    <td style={{ textAlign: 'right' }}>3</td>
                  </tr>
                  <tr>
                    <td>Real buildings rendered</td>
                    <td style={{ textAlign: 'right' }}>{BUILDING_COUNT}</td>
                  </tr>
                  <tr>
                    <td>Tallest neighbour</td>
                    <td style={{ textAlign: 'right' }}>Wilshire Grand · 335 m</td>
                  </tr>
                  <tr>
                    <td>Effective vehicle length L</td>
                    <td style={{ textAlign: 'right' }}>{mToFt(params.L).toFixed(1)} ft</td>
                  </tr>
                  <tr>
                    <td>Following time τ</td>
                    <td style={{ textAlign: 'right' }}>{params.tau.toFixed(2)} s</td>
                  </tr>
                  <tr>
                    <td>Predicted wave speed L/τ</td>
                    <td style={{ textAlign: 'right', color: 'var(--series-4)', fontWeight: 650 }}>
                      {w.toFixed(1)} mph
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 14, marginBottom: 0 }}>
                Every one of these numbers is used somewhere on this site, and the last one is
                derived from the two above it.
              </p>
            </Panel>
          </div>
        </div>
      </section>
    </>
  );
}
