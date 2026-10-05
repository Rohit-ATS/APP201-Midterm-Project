import { Badge, Panel, Stat } from '../components/ui/primitives';
import { CorridorProfile } from '../components/charts/CorridorProfile';
import { RoadScene } from '../components/scene/RoadScene';
import type { TrafficHook } from '../lib/useTraffic';
import type { SimulationHook } from '../lib/useSimulation';
import { mpsToMph, waveSpeed, mToFt } from '../lib/trafficMath';
import { CORRIDOR_LENGTH } from '../data/corridor';

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
            cameraMode="corridor"
            colorMode="paint"
            style={{ width: '100%', height: '100%' }}
          />
        </div>
        <div className="hero-veil" />

        <div className="hero-content">
          <div className="wrap-wide">
            <div className="hero-kicker">
              <Badge color="var(--series-1)">APP201 · Geometry in the World</Badge>
              <Badge color={reading.source === 'live' ? 'var(--good)' : 'var(--warning)'}>
                {reading.source === 'live' ? 'Live traffic' : 'Recorded traffic'} · I-405 Sepulveda Pass
              </Badge>
            </div>

            <h1 className="display">
              A traffic jam is a wave,
              <br />
              and it travels the wrong way.
            </h1>

            <p className="hero-sub">
              On the 405 through the Sepulveda Pass, the cars go south at 60 mph and the jam goes
              north at 11. That second number is not a coincidence and not a measurement — it is a
              car&rsquo;s length divided by a driver&rsquo;s reaction time, and you can derive it
              from a single straight line.
            </p>

            <div className="hero-actions">
              <button className="btn btn-primary" onClick={() => onNavigate('maths')}>
                See the geometry
              </button>
              <button className="btn" onClick={() => onNavigate('live')}>
                Open the live corridor
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
                label="Vehicles on the stretch"
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
            <h2 className="h2">The jam that was not there</h2>
            <p className="lede">
              Everyone who drives the 405 has had the same experience. Traffic stops. You crawl for
              two minutes. Then it clears, and there is nothing there — no crash, no closure, no
              reason. You spend the next mile looking for the thing that caused it and never find it.
            </p>
          </div>

          <div className="split split-wide-right">
            <div className="prose">
              <h3 className="h3">What I noticed</h3>
              <p>
                I started paying attention to those empty jams, and I noticed something I had been
                driving past for years without seeing: <strong>the jam was moving</strong>.
              </p>
              <p>
                Not moving the way traffic moves. Moving <em>against</em> it. If I looked in the
                mirror after getting through one, I could watch the brake lights behind me light up
                in sequence, a few cars at a time, travelling steadily backwards up the freeway
                while every single car involved was going forwards.
              </p>
              <p>
                The cars and the jam were going in opposite directions at the same time. That is a
                strange enough sentence that I wanted to know whether it was really true, and if it
                was, how fast the backwards thing was going.
              </p>

              <h3 className="h3" style={{ marginTop: 34 }}>
                Why it caught my attention
              </h3>
              <p>
                Because it meant the jam was not made of cars. It was a <em>shape</em> that cars
                passed through — the way a wave on water is not made of water travelling across the
                ocean, but of water going up and down in place while the shape moves.
              </p>
              <p>
                And if a jam is a shape, then it has geometry. It has a speed, a direction, a front
                and a back edge, and a slope on a graph. Those are things I can measure and predict
                instead of just complaining about.
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
              <Panel title="Visual evidence · the corridor right now">
                <CorridorProfile analysis={analysis} />
              </Panel>

              <div className="callout" style={{ marginTop: 20 }}>
                <div className="callout-title">The evidence in one sentence</div>
                <p>
                  Right now the slowest point on this stretch is{' '}
                  <strong>{analysis.worst.name}</strong> at{' '}
                  <strong>{mpsToMph(analysis.worst.v).toFixed(0)} mph</strong>, while traffic
                  further <em>down</em> the road is moving faster. Cars are leaving the slow
                  section quicker than they are arriving at it — so the back of the queue has to be
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
                q: 'Why did widening the 405 not work?',
                a: 'Los Angeles spent $1.6 billion adding a lane through this pass. Travel times did not improve. Is that bad luck, or geometry?',
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
              <h2 className="h2">Why the Sepulveda Pass</h2>
              <p>
                This {miles.toFixed(1)}-mile stretch of Interstate 405, where it climbs over the
                Santa Monica Mountains between Sherman Oaks and Westwood, carries around 300,000
                vehicles a day. It is routinely measured as the most congested stretch of freeway in
                the United States.
              </p>
              <p>
                It is also the site of one of the most expensive counterexamples in American
                transport planning. Between 2009 and 2014, Los Angeles spent{' '}
                <strong>$1.6 billion</strong> widening it — ten miles of construction, a demolished
                bridge, the weekend the press called &ldquo;Carmageddon.&rdquo; When it reopened,
                peak northbound travel times were <em>slightly worse</em> than before.
              </p>
              <p>
                I chose it because the mathematics has something specific and uncomfortable to say
                about that outcome, and because it is a road I can actually go and sit on.
              </p>
            </div>

            <Panel title="The corridor, geometrically">
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
                    <td>Measurement points</td>
                    <td style={{ textAlign: 'right' }}>{analysis.stations.length}</td>
                  </tr>
                  <tr>
                    <td>Lanes (narrowest point)</td>
                    <td style={{ textAlign: 'right' }}>4</td>
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
