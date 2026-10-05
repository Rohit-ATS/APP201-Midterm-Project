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
            <h2 className="h2">Why do some cars make the light and others wait twice?</h2>
            <p className="lede">
              I walk the same intersection almost every day. Standing there long enough, you start
              counting without meaning to: this many cars got through on that green, and the ones
              behind them had to sit through the whole cycle again. Some days the line clears in
              one go. Some days the same-looking line needs two. I wanted to know what decides it.
            </p>
          </div>

          <div className="split split-wide-right">
            <div className="prose">
              <h3 className="h3">What I observed</h3>
              <p>
                Two things, and it took me a while to realise they were the same thing.
              </p>
              <p>
                The first is the counting. A green light does not let &ldquo;the traffic&rdquo;
                through — it lets a <em>specific number</em> of cars through, and that number is
                oddly consistent. If you are inside it you make the light. If you are one place
                behind it, you watch the whole cycle go by and try again.
              </p>
              <p>
                The second is what happens at the <em>back</em> of that line. When the light goes
                red, the brake lights do not all come on at once. They light up one at a time,
                travelling backwards down the block, away from the intersection — reaching cars
                that have not even arrived yet. And when it goes green, the same thing happens in
                reverse: the movement works its way back to you.
              </p>
              <p>
                <strong>So the queue is moving.</strong> Not the way traffic moves — moving{' '}
                <em>against</em> it. Every car is pointed south and going south, and the back edge
                of the jam is travelling north. The cars and the traffic jam are going in opposite
                directions at the same time.
              </p>

              <h3 className="h3" style={{ marginTop: 34 }}>
                Why it caught my attention
              </h3>
              <p>
                Honestly? Because for a long time I decided I was done with maths. I had made up my
                mind that I would never study it again, and the only reason I did is that my degree
                required it.
              </p>
              <p>
                What changed was a video I watched about how large language models actually work —
                the thing behind ChatGPT and Claude, which I use every day building my own
                projects. It turns out an LLM is an enormous amount of mathematics stacked up until
                you can talk to it. And underneath that, computers are running on binary. Ones and
                zeroes.
              </p>
              <p>
                That reframed the whole subject for me. Maths is not a topic I have to get past. It
                is the thing everything I want to build is made out of, and as a software engineer
                I am going to be using it constantly without always being able to tell that that is
                what I am doing.
              </p>
              <p>
                So when I noticed the counting at that intersection, I did not dismiss it the way I
                would have a week earlier. A jam that moves backwards is not a complaint — it is a{' '}
                <em>shape</em>, and a shape has geometry. It has a speed, a direction, a front and a
                back edge, and a slope on a graph. Those are things I can measure and predict.
              </p>

              <h3 className="h3" style={{ marginTop: 34 }}>
                Naming it
              </h3>
              <p>
                Both things I noticed have names, and finding them out was most of the work.
              </p>
              <p>
                The backwards-travelling edge is a <strong>stop-and-go wave</strong>, or more
                precisely a <strong>shockwave</strong>: the moving boundary between two different
                states of traffic. The property I wanted was its <strong>wave speed</strong> — how
                fast that boundary travels, and in which direction.
              </p>
              <p>
                And the counting has a name too. When more cars are queued than can clear on one
                green, that is a <strong>cycle failure</strong>. Section 2 works out exactly where
                that line falls, and it turns out to be the same piece of mathematics.
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
                q: 'How many cars actually clear one green?',
                a: 'The number I kept counting at the intersection. If I can predict it, I can predict who makes the light and who waits for the next one.',
              },
              {
                n: 2,
                q: 'How fast does the back of the queue travel?',
                a: 'It clearly moves, and it clearly moves the wrong way. Is it the same speed every time, or does it depend on the day, the street, the drivers?',
              },
              {
                n: 3,
                q: 'Where do those two numbers come from?',
                a: 'If they are predictable then something determines them. What is the thing being divided by what?',
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
              straight line. It answers all four of those at once. The whole of{' '}
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

      {/* ================= WHERE THIS GOES ================= */}
      <section className="section">
        <div className="wrap">
          <div className="prose" style={{ maxWidth: '72ch' }}>
            <div className="eyebrow">Where I want to take this</div>
            <h2 className="h2">Starting with the city everyone says is impossible</h2>
            <p>
              Traffic is not a side issue. For anyone who commutes to an office it is a permanent
              part of their life and it takes a real piece of every day. That is the problem I
              actually want to work on, and I wanted to start on it now rather than wait until I
              felt qualified.
            </p>
            <p>
              I picked Los Angeles on purpose. People say LA traffic is unsolvable, and I would
              rather work on the hard version — partly because I like difficult problems, and
              partly because if I ever want someone to trust me with a problem of theirs, I need to
              be able to show my work on one that is genuinely hard.
            </p>
            <p>
              This project is one mile of one street, which is nowhere near solving anything. But it
              is a mile where the model and the measurements agree, where the geometry predicts a
              number an engineer can verify with a stopwatch, and where I can say exactly which
              assumptions I would have to fix next. That is a real starting point rather than an
              opinion about traffic.
            </p>
            <p>
              A month ago I had decided I was finished with mathematics. This is what changed my
              mind: not a lecture about why maths matters, but one question at one intersection
              that turned out to have an exact answer.
            </p>
            <p className="muted" style={{ fontSize: 14 }}>
              — Rohit Maruri ·{' '}
              <a href="https://github.com/Rohit-ATS" target="_blank" rel="noreferrer noopener">
                github.com/Rohit-ATS
              </a>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
