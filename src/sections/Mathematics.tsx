import { useState } from 'react';
import { Panel, Slider, Stat, Badge } from '../components/ui/primitives';
import { SpacingLine } from '../components/charts/SpacingLine';
import { FundamentalDiagramChart } from '../components/charts/FundamentalDiagram';
import { VehicleMixChart } from '../components/charts/VehicleMix';
import { SpaceTimeDiagram } from '../components/charts/SpaceTimeDiagram';
import type { TrafficHook } from '../lib/useTraffic';
import type { SimulationHook } from '../lib/useSimulation';
import {
  mpsToMph,
  mToFt,
  waveSpeed,
  fundamentalDiagram,
  greenshieldsCapacity,
  saturationFlow,
  saturationHeadway,
  signalCapacity,
  vehiclesPerGreen,
  STARTUP_LOST_TIME,
  jamDensity,
  DEFAULT_PARAMS,
  VEHPM_TO_VEHPMI,
} from '../lib/trafficMath';
import { effectiveLength, meanVehicleLength, STOPPED_GAP } from '../data/vehicleMix';

export function Mathematics({
  traffic,
  sim,
}: {
  traffic: TrafficHook;
  sim: SimulationHook;
}) {
  const { params, setParams, resetParams, analysis } = traffic;
  const fd = fundamentalDiagram(params);
  const w = mpsToMph(waveSpeed(params));
  const [showGreenshields, setShowGreenshields] = useState(true);

  // the pair of neighbouring stations with the strongest backward wave
  const chordPair = analysis.dominantWave
    ? ([analysis.dominantWave.from, analysis.dominantWave.to] as [string, string])
    : undefined;

  const controls = (
    <Panel title="Change the assumptions" aside={<Badge>live</Badge>}>
      <p style={{ fontSize: 13, marginBottom: 16 }}>
        These sliders are the whole thing. Move one and every picture on this page moves with it,
        because they are not separate dials — they are the same idea seen from different sides.
        Play with them.
      </p>
      <Slider
        label="Reaction time τ"
        value={params.tau}
        min={0.6}
        max={3}
        step={0.05}
        onChange={(tau) => setParams({ tau })}
        format={(v) => `${v.toFixed(2)} s`}
        hint="How long after the car ahead moves before you do. Typical human: 1.2–2.0 s."
      />
      <Slider
        label="Effective vehicle length L"
        value={params.L}
        min={4}
        max={14}
        step={0.1}
        onChange={(L) => setParams({ L })}
        format={(v) => `${mToFt(v).toFixed(1)} ft`}
        hint="The average car plus the gap drivers keep when stopped."
      />
      <Slider
        label="Free-flow speed vf"
        value={mpsToMph(params.vf)}
        min={35}
        max={85}
        step={1}
        onChange={(mph) => setParams({ vf: mph / 2.236936 })}
        format={(v) => `${v.toFixed(0)} mph`}
        hint="The speed of a car with the road to itself."
      />
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn" onClick={resetParams}>
          Reset to Figueroa
        </button>
      </div>

      <div
        style={{
          marginTop: 20,
          paddingTop: 18,
          borderTop: '1px solid var(--hairline)',
          display: 'grid',
          gap: 18,
        }}
      >
        <Stat
          value={w.toFixed(1)}
          unit="mph"
          label="Jam speed = L / τ"
          color="var(--series-4)"
          sub="backwards, up the street"
        />
        <Stat
          value={Math.round(fd.qmax * 3600).toLocaleString()}
          unit="cars/hr"
          label="Most one lane can carry"
          color="var(--series-3)"
        />
        <Stat
          value={(fd.kj * VEHPM_TO_VEHPMI).toFixed(0)}
          unit="cars/mi"
          label="Cars per mile, bumper to bumper"
          color="var(--series-2)"
        />
      </div>
    </Panel>
  );

  return (
    <>
      <section className="section" style={{ paddingTop: 64 }}>
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">Section 2 · Explain the Mathematics</div>
            <h2 className="h2">
              How much road does one car need?
            </h2>
            <p className="lede">
              That is the only question I had to answer. Everything else — how many cars fit, how
              many get through a green, how fast the jam runs backwards, and why a street under the
              tallest towers in the west still crawls — comes out of the answer as ordinary
              algebra. No step below is harder than rearranging a formula.
            </p>
          </div>

          <div className="split split-wide-right">
            <div style={{ position: 'sticky', top: 72 }}>{controls}</div>

            <div>
              {/* ---------------- STEP 1 ---------------- */}
              <div className="step">
                <span className="step-num">1</span>
                <div className="step-body prose">
                  <h3 className="h3">A moving car owns a segment of road</h3>
                  <p>
                    Think about what a car actually occupies on the road. Not just its body — the
                    body <em>plus</em> the gap in front of it that the driver refuses to give up.
                    Call that total length the <strong>spacing</strong>, measured front bumper to
                    front bumper. It is the length of road one car is using.
                  </p>
                  <p>
                    Now, how big is the gap? Drivers do not think in feet. They think in{' '}
                    <em>time</em> — the two-second rule, the &ldquo;count to three&rdquo; your
                    driving instructor taught you. A driver keeps a fixed number of{' '}
                    <strong>seconds</strong> of following distance, which means the gap in{' '}
                    <strong>feet</strong> is that time multiplied by the speed.
                  </p>

                  <div className="formula">
                    <span className="fx">s(v) = L + v · τ</span>
                    <span className="where">
                      <b>s</b> — spacing, front bumper to front bumper
                      <br />
                      <b>L</b> — effective vehicle length (the car, plus the gap it keeps at a dead
                      stop) = {mToFt(params.L).toFixed(1)} ft
                      <br />
                      <b>v</b> — speed
                      <br />
                      <b>τ</b> — following time headway = {params.tau.toFixed(2)} s
                    </span>
                  </div>

                  <p>
                    That is a <strong>straight line</strong>. Its slope is the reaction time. Its
                    y-intercept is the length of a car. Both of those will matter enormously in a
                    moment.
                  </p>
                </div>
              </div>

              <Panel title="The spacing line">
                <SpacingLine params={params} markSpeedMph={mpsToMph(analysis.meanSpeed)} />
              </Panel>

              {/* ---------------- STEP 2 ---------------- */}
              <div className="step" style={{ marginTop: 44 }}>
                <span className="step-num">2</span>
                <div className="step-body prose">
                  <h3 className="h3">Where L actually comes from</h3>
                  <p>
                    L is the intercept of that line, so it had better not be a guess. The traffic
                    API tells me how fast vehicles are moving but never what they are, so I built L
                    from published counts of what actually drives this street: the average
                    length of what drives Figueroa, plus the bumper gap drivers leave when stopped.
                  </p>
                  <div className="formula">
                    <span className="fx">
                      L = Σ(share<sub>i</sub> × length<sub>i</sub>) + gap
                    </span>
                    <span className="where">
                      = {mToFt(meanVehicleLength()).toFixed(1)} ft of average vehicle +{' '}
                      {mToFt(STOPPED_GAP).toFixed(1)} ft of stopped gap ={' '}
                      <b>{mToFt(effectiveLength()).toFixed(1)} ft</b>
                    </span>
                  </div>
                </div>
              </div>

              <Panel title="What actually drives this street">
                <VehicleMixChart />
              </Panel>

              {/* ---------------- STEP 3 ---------------- */}
              <div className="step" style={{ marginTop: 44 }}>
                <span className="step-num">3</span>
                <div className="step-body prose">
                  <h3 className="h3">Turn the spacing upside down and you get density</h3>
                  <p>
                    If every car owns <em>s</em> feet of road, then a mile of road holds one car for
                    every <em>s</em> feet of it. So &ldquo;how many cars fit in a mile&rdquo; is just
                    &ldquo;how long is a mile&rdquo; divided by &ldquo;how much room does one car
                    take&rdquo;. That count has a name — <strong>density</strong>, written{' '}
                    <em>k</em> — and it is simply one divided by a length:
                  </p>
                  <div className="formula">
                    <span className="fx">k = 1 / s</span>
                    <span className="where">
                      vehicles per mile, per lane. At a dead stop s = L, so the maximum possible
                      density — the <b>jam density</b> — is k<sub>j</sub> = 1/L ={' '}
                      <b>{(fd.kj * VEHPM_TO_VEHPMI).toFixed(0)} cars per mile, one lane</b>.
                    </span>
                  </div>
                  <p>
                    That flip — turning a length upside down to get a count — is the move that
                    makes everything else work, and it is the step I found least obvious. Room per
                    car is a distance. Cars per mile is one divided by that distance. Flipping
                    between the two is why a straight line in one picture turns into a bend in the
                    next one.
                  </p>
                </div>
              </div>

              {/* ---------------- STEP 4 ---------------- */}
              <div className="step">
                <span className="step-num">4</span>
                <div className="step-body prose">
                  <h3 className="h3">Flow, and the line that falls out of it</h3>
                  <p>
                    What a city actually cares about is simpler than either of those: <strong>how
                    many cars go past per hour</strong>. That is called <strong>flow</strong>, and
                    it is just the two numbers we already have, multiplied. How many cars are
                    packed in, times how fast they are moving past you.
                  </p>
                  <div className="formula">
                    <span className="fx">q = k · v</span>
                  </div>
                  <p>
                    Now substitute. In congestion every driver is following the spacing rule, so
                    rearranging <em>s = L + vτ</em> gives <em>v = (s − L)/τ</em>, and with{' '}
                    <em>s = 1/k</em>:
                  </p>
                  <div className="formula">
                    <span className="fx">q = k · (1/k − L) / τ</span>
                    <span className="fx">q = (1 − kL) / τ</span>
                    <span className="fx">
                      q = 1/τ − (L/τ) · k
                    </span>
                    <span className="where">
                      A straight line in k and q. Its slope is <b>−L/τ</b>.
                    </span>
                  </div>
                  <p>
                    That slope is the answer to my second question, and I did not expect it to be
                    this simple. Hold on to it for one more step.
                  </p>
                </div>
              </div>

              {/* ---------------- STEP 5 ---------------- */}
              <div className="step">
                <span className="step-num">5</span>
                <div className="step-body prose">
                  <h3 className="h3">Two lines, one peak: the fundamental diagram</h3>
                  <p>
                    A road is only ever in one of two moods. <strong>Empty:</strong> nobody is
                    stuck behind anybody, so everyone just drives at their own speed, and more cars
                    simply means more cars going past. <strong>Full:</strong> everybody is now
                    following somebody, which is the case we worked out a moment ago. Draw both
                    moods on the same picture:
                  </p>
                  <div className="formula">
                    <span className="fx">free: q = v_f · k&nbsp;&nbsp;&nbsp;&nbsp;congested: q = w · (k_j − k)</span>
                    <span className="where">
                      They cross at the <b>critical density</b> k<sub>c</sub> ={' '}
                      {(fd.kc * VEHPM_TO_VEHPMI).toFixed(0)} cars per mile, one lane, and the height of that
                      crossing is the <b>capacity</b> of the lane:{' '}
                      <b>{Math.round(fd.qmax * 3600).toLocaleString()} cars/hr</b>.
                    </span>
                  </div>
                  <p>
                    The shape is a triangle. Going up the left side, the road is working, and
                    adding cars adds throughput. Coming down the right side, the road is failing,
                    and adding cars makes it worse. The peak is the best it will ever do. Every
                    state a lane can possibly be in is somewhere on those two lines.
                  </p>
                </div>
              </div>

              <Panel
                title="The fundamental diagram"
                aside={
                  <button
                    className="btn"
                    style={{ padding: '3px 9px', fontSize: 12 }}
                    onClick={() => setShowGreenshields((s) => !s)}
                  >
                    {showGreenshields ? 'Hide' : 'Show'} Greenshields
                  </button>
                }
              >
                <FundamentalDiagramChart
                  params={params}
                  stations={analysis.stations}
                  showGreenshields={showGreenshields}
                  chord={chordPair}
                />
              </Panel>

              <div className="callout">
                <div className="callout-title">A model I rejected, and why</div>
                <p>
                  The first model I found was Greenshields&rsquo; (1935), the dashed curve above. It
                  assumes speed falls <em>linearly</em> with density, which makes flow a smooth
                  parabola — much prettier than a triangle. I wanted to use it.
                </p>
                <p>
                  Its peak height is not far off: {Math.round(greenshieldsCapacity(params) * 3600).toLocaleString()}{' '}
                  against {Math.round(fd.qmax * 3600).toLocaleString()} cars/hr, about{' '}
                  {Math.abs(Math.round((greenshieldsCapacity(params) / fd.qmax - 1) * 100))}% low. The
                  problem is <em>where</em> it puts that peak. Greenshields says a lane does its best
                  work at half the jam density —{' '}
                  <strong>{((jamDensity(params) / 2) * VEHPM_TO_VEHPMI).toFixed(0)} cars/mile</strong>{' '}
                  — while the triangular model says{' '}
                  <strong>{(fd.kc * VEHPM_TO_VEHPMI).toFixed(0)}</strong>.
                </p>
                <p>
                  That is not a small disagreement. It is the difference between a model that
                  predicts this street breaks down when it is half full, and one that predicts it
                  breaks down when it is a quarter full. The street breaks down when it is a quarter
                  full. I kept the ugly one, and both are drawn above so you can judge the call
                  yourself.
                </p>
              </div>

              {/* ---------------- STEP 6 ---------------- */}
              <div className="step" style={{ marginTop: 44 }}>
                <span className="step-num">6</span>
                <div className="step-body prose">
                  <h3 className="h3">On this diagram, every slope is a speed</h3>
                  <p>
                    This is the idea that made the whole project click, and it is nothing more than
                    cancelling units. One number is cars per hour. The other is cars per mile.
                    Divide one by the other and the cars cancel out, leaving miles per hour — a
                    speed:
                  </p>
                  <div className="formula">
                    <span className="fx">
                      q / k = (cars/hrour) / (cars/mile) = miles/hour
                    </span>
                  </div>
                  <p>
                    So any slope you can read off this chart is a <strong>velocity</strong>. Two
                    slopes matter:
                  </p>
                  <ul style={{ color: 'var(--ink-secondary)', paddingLeft: 20, marginBottom: '1.1em' }}>
                    <li style={{ marginBottom: 8 }}>
                      <strong>From the corner of the chart to a dot</strong> — that slope is how
                      fast the <em>cars</em> are going. (Hover any live dot above to see the line
                      drawn.)
                    </li>
                    <li>
                      <strong>The line joining two dots</strong> — that slope is how fast the{' '}
                      <em>edge between them</em> is travelling. That edge is the back of the queue.
                      Engineers call it a <strong>shockwave</strong>.
                    </li>
                  </ul>
                  <div className="formula">
                    <span className="fx">u = (q₂ − q₁) / (k₂ − k₁)</span>
                    <span className="where">
                      the slope of the line between the two dots. If it comes out{' '}
                      <b>negative</b>, that edge is moving <b>backwards up the street</b>, against
                      the direction everybody is driving.
                    </span>
                  </div>
                </div>
              </div>

              {/* ---------------- STEP 7 ---------------- */}
              <div className="step">
                <span className="step-num">7</span>
                <div className="step-body prose">
                  <h3 className="h3">The answer</h3>
                  <p>
                    Now put the two together. When moving traffic runs into stopped traffic, the
                    edge between them sits on the falling side of the triangle — and we already
                    worked out the slope of that side back in step 4:
                  </p>
                  <div className="formula" style={{ borderLeftColor: 'var(--series-4)' }}>
                    <span className="fx" style={{ fontSize: 21, color: 'var(--series-4)' }}>
                      w = L / τ
                    </span>
                    <span className="where">
                      = {mToFt(params.L).toFixed(1)} ft ÷ {params.tau.toFixed(2)} s ={' '}
                      <b style={{ color: 'var(--series-4)' }}>{w.toFixed(1)} mph</b>, backwards.
                    </span>
                  </div>
                  <p>
                    Look at what is <em>not</em> in that formula. Not the street. Not the number of
                    lanes. Not how many cars there are, how fast they were going, what city you are
                    in, or what caused the jam. Only the length of a car and the reaction time of a
                    human being.
                  </p>
                  <p>
                    Which predicts something testable: stop-and-go waves should travel backwards at
                    about the same speed <em>everywhere on Earth</em>, because cars and humans are
                    about the same everywhere. Measurements from Los Angeles, from a Japanese test
                    track, and from German autobahns all land between 10 and 15 mph. Ours comes out
                    at {w.toFixed(1)}.
                  </p>
                </div>
              </div>

              <div
                style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  border: '1px solid var(--hairline)',
                  borderRadius: 'var(--r-md)',
                  background: 'var(--surface-1)',
                  margin: '28px 0',
                }}
              >
                <div className="bignum" style={{ color: 'var(--series-4)' }}>
                  {w.toFixed(1)}
                  <span className="bignum-unit"> mph backwards</span>
                </div>
                <p className="muted" style={{ marginTop: 14, marginBottom: 0, fontSize: 14 }}>
                  a car&rsquo;s length ÷ a driver&rsquo;s reaction time
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= VERIFICATION ================= */}
      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">Checking the answer</div>
            <h2 className="h2">Does it actually do that?</h2>
            <p className="lede">
              A derivation can be internally tidy and still describe nothing. So I built a
              simulation in which the spacing rule is the <em>only</em> instruction any driver has,
              and then measured the waves that came out of it — without telling it what answer to
              produce.
            </p>
          </div>

          <div className="split split-wide-right">
            <div className="prose">
              <h3 className="h3">What the simulation is told</h3>
              <p>
                Each vehicle looks at the gap to the car ahead and drives at{' '}
                <code>v = (s − L)/τ</code>, capped at the free-flow speed. That is the complete rule
                set. No vehicle is told to stop, no jam is placed anywhere, and nothing in the code
                mentions waves.
              </p>
              <p>
                Press <strong>Tap the brakes</strong> and one random driver slows for two seconds,
                then carries on normally. Watch what happens to everyone behind them.
              </p>

              <div className="row row-wrap" style={{ marginBottom: 18 }}>
                <button className="btn btn-primary" onClick={sim.perturb}>
                  Tap the brakes
                </button>
                <button className="btn" onClick={() => sim.setRunning(!sim.running)}>
                  {sim.running ? 'Pause' : 'Play'}
                </button>
                <button className="btn" onClick={sim.reset}>
                  Reset
                </button>
              </div>

              <Slider
                label="Density"
                value={sim.config.perLane / (sim.config.length / 1609.344)}
                min={8}
                max={70}
                step={1}
                onChange={(perMile) =>
                  sim.setConfig({
                    perLane: Math.max(
                      4,
                      Math.round(perMile * (sim.config.length / 1609.344)),
                    ),
                  })
                }
                format={(v) => `${v.toFixed(0)} cars per mile, one lane`}
                hint={`Critical density here is ${(fd.kc * VEHPM_TO_VEHPMI).toFixed(0)} cars/mi. Push past it and jams appear with no perturbation at all.`}
              />

              <div
                className="dash-strip"
                style={{ marginTop: 22, paddingTop: 20, borderTop: '1px solid var(--hairline)' }}
              >
                <Stat
                  value={w.toFixed(1)}
                  unit="mph"
                  label="Predicted L/τ"
                  color="var(--series-4)"
                />
                <Stat
                  value={
                    sim.stats.measuredWaveMph === null
                      ? '—'
                      : Math.abs(sim.stats.measuredWaveMph).toFixed(1)
                  }
                  unit={sim.stats.measuredWaveMph === null ? '' : 'mph'}
                  label="Measured in the sim"
                  color={
                    sim.stats.measuredWaveMph === null ? 'var(--ink-muted)' : 'var(--series-3)'
                  }
                  sub={sim.stats.measuredWaveMph === null ? 'no jam yet — tap the brakes' : 'backwards'}
                />
                <Stat
                  value={sim.stats.meanSpeedMph.toFixed(0)}
                  unit="mph"
                  label="Average speed"
                />
              </div>

              <div className="callout" style={{ marginTop: 24 }}>
                <div className="callout-title">The thing to notice</div>
                <p>
                  One driver braking for two seconds does not fade out. It <em>amplifies</em>,
                  because every following driver needs τ seconds to respond and so brakes slightly
                  harder than the one in front. Far enough back, somebody comes to a complete stop
                  because of a tap on the brakes they never saw. That is the phantom jam — and it
                  answers question 3.
                </p>
              </div>
            </div>

            <Panel title="Space-time diagram · the jam made visible">
              <SpaceTimeDiagram sim={sim.sim} params={params} />
            </Panel>
          </div>
        </div>
      </section>

      {/* ================= SIGNALS ================= */}
      <section className="section">
        <div className="wrap">
          <div className="split">
            <div className="prose">
              <div className="eyebrow">Question 4</div>
              <h2 className="h2">Why a street this wide carries so little</h2>
              <p>
                The peak of the triangle is not the capacity of a city street. It is the{' '}
                <strong>saturation flow</strong>: the rate cars cross the stop line while the light
                is green and the queue is still rolling. Here that is{' '}
                <strong>{Math.round(saturationFlow(params) * 3600).toLocaleString()} cars/hr per lane</strong>.
              </p>
              <p>
                Turn it upside down and you get the number traffic engineers actually measure with a
                stopwatch on a street corner — the <strong>saturation headway</strong>, the gap in
                time between successive front bumpers crossing the line:
              </p>
              <div className="formula" style={{ borderLeftColor: 'var(--series-3)' }}>
                <span className="fx">h = 1 / q_max = {saturationHeadway(params).toFixed(2)} s</span>
                <span className="where">
                  Published field measurements on American city streets: 1.9&ndash;2.1 s. We did not
                  fit this. It fell out of a car&rsquo;s length and a reaction time.
                </span>
              </div>
              <p>
                And this is the number I had been counting at the intersection without knowing it
                had a name. Divide the usable green by the headway and you get how many cars clear
                on one light:
              </p>
              <div className="formula" style={{ borderLeftColor: 'var(--series-4)' }}>
                <span className="fx">n = (green &minus; startup lost time) / h</span>
                <span className="where">
                  At Wilshire — 42% green on a 90 s cycle, so {(0.42 * 90).toFixed(0)} s of green,
                  minus about {STARTUP_LOST_TIME.toFixed(0)} s while the first few drivers react —
                  that is{' '}
                  <b style={{ color: 'var(--series-4)' }}>
                    {vehiclesPerGreen(params, 0.42, 90).toFixed(0)} cars per lane
                  </b>
                  , or about {(vehiclesPerGreen(params, 0.42, 90) * 3).toFixed(0)} across the three
                  through lanes.
                </span>
              </div>
              <p>
                So if you are the twentieth car in your lane, you are not getting through, and no
                amount of impatience changes it. More than that queued and the signal is in{' '}
                <strong>cycle failure</strong>: the leftovers wait for the next green, and if the
                next green also arrives full, the queue grows every cycle and never recovers. That
                is the difference between a street that is busy and a street that is broken.
              </p>
              <p>
                But a lane only gets that rate while it is green. Multiply by the green share of the
                cycle and you have what the street actually carries:
              </p>
              <div className="formula">
                <span className="fx">capacity = q_max &times; (green / cycle)</span>
                <span className="where">
                  At Wilshire, which has the shortest green on the street at 42%, that is{' '}
                  <b>{Math.round(signalCapacity(params, 0.42) * 3600).toLocaleString()} cars/hr per lane</b>{' '}
                  — less than half of what the asphalt could do.
                </span>
              </div>
              <p>
                So the answer to question 4 is that the lanes are not the constraint. Figueroa gives
                away more than half its capacity to red time, and the backward wave from every one
                of those reds eats into the green that follows. Adding a lane multiplies a number
                that is already being halved.
              </p>
              <p>
                The leverage is in <strong>&tau;</strong> and in the <strong>green ratio</strong> —
                neither of which is made of concrete. Drag the reaction-time slider toward 0.5 s,
                the figure for automated vehicle following, and watch the saturation flow climb.
              </p>
            </div>

            <div>
              <Panel title="What the street would carry">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Reaction time &tau;</th>
                      <th style={{ textAlign: 'right' }}>Wave</th>
                      <th style={{ textAlign: 'right' }}>Sat. flow</th>
                      <th style={{ textAlign: 'right' }}>Cars/green</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[0.5, 0.9, 1.2, 1.4, 1.8, 2.4].map((tau) => {
                      const t = { ...DEFAULT_PARAMS, L: params.L, vf: params.vf, tau };
                      const d = fundamentalDiagram(t);
                      const isNow = Math.abs(tau - params.tau) < 0.03;
                      return (
                        <tr key={tau} style={isNow ? { background: 'rgba(57,135,229,0.12)' } : undefined}>
                          <td>
                            {tau.toFixed(1)} s
                            {tau === 0.5 && <span className="muted" style={{ fontSize: 11.5 }}> · automated</span>}
                            {tau === 1.4 && <span className="muted" style={{ fontSize: 11.5 }}> · human</span>}
                          </td>
                          <td style={{ textAlign: 'right' }}>{mpsToMph(d.w).toFixed(1)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ink-primary)' }}>
                            {Math.round(d.qmax * 3600).toLocaleString()}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {vehiclesPerGreen(t, 0.45, 90).toFixed(0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 14, marginBottom: 0 }}>
                  Cutting &tau; from 1.4 s to 0.5 s raises one lane&rsquo;s saturation flow by about{' '}
                  {Math.round(
                    (fundamentalDiagram({ ...DEFAULT_PARAMS, L: params.L, vf: params.vf, tau: 0.5 }).qmax /
                      fundamentalDiagram({ ...DEFAULT_PARAMS, L: params.L, vf: params.vf, tau: 1.4 }).qmax -
                      1) * 100,
                  )}
                  % — more than doubling the number of lanes would, and without pouring any concrete.
                </p>
              </Panel>
            </div>
          </div>
        </div>
      </section>

      {/* ================= LIMITS ================= */}
      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">Being honest</div>
            <h2 className="h2">What this model gets wrong</h2>
            <p className="lede">
              A model that explains everything explains nothing. Here is where mine breaks, and what
              I would need to fix it.
            </p>
          </div>

          <div className="cards">
            {[
              {
                t: 'Density is inferred, not measured',
                d: 'TomTom reports speed. I invert the fundamental diagram to get density — which means I am using the model to produce the data I then test the model against. Loop-detector counts from Caltrans PeMS would break that circularity, and that is the first thing I would add.',
              },
              {
                t: 'Nobody changes lanes',
                d: 'Real drivers escape a slow lane, which both relieves and spreads congestion. My simulation has no lane changing at all, so its jams are cleaner and more regular than real ones.',
              },
              {
                t: 'Every driver is identical',
                d: 'One τ for everybody. In reality τ varies from about 0.8 s to over 2.5 s, and that variation is itself a cause of waves. A distribution of τ would make the model messier and more realistic.',
              },
              {
                t: 'Traffic recirculates',
                d: 'A vehicle that leaves 11th Street re-enters at 3rd, so the amount of traffic is conserved and nothing has to be invented at the boundaries. Real Figueroa gains and loses cars at every cross street and every garage entrance.',
              },
              {
                t: 'The triangle has sharp corners',
                d: 'Real measured data scatters into a cloud around the peak rather than meeting at a point, partly because capacity itself drops once a queue forms — an effect called capacity drop that this model does not include.',
              },
              {
                t: 'Nothing turns, parks or crosses',
                d: 'On a real downtown street a huge share of the delay comes from cars waiting to turn across traffic, delivery vans double-parking, and pedestrians holding the turn phase. None of that is modelled, so my street is tidier than Figueroa has ever been.',
              },
            ].map((c) => (
              <Panel key={c.t}>
                <strong style={{ fontSize: 14.5, display: 'block', marginBottom: 8 }}>{c.t}</strong>
                <p style={{ margin: 0, fontSize: 13.5 }}>{c.d}</p>
              </Panel>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
