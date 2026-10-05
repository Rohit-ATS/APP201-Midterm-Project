import { useMemo, useRef, useState } from 'react';
import { Badge, Panel, Slider, Stat } from '../components/ui/primitives';
import { BraidCanvas, BRAID_STYLES, type BraidStyle } from '../components/BraidCanvas';
import { generateBraid, DEFAULT_BRAID } from '../lib/braid';
import type { TrafficHook } from '../lib/useTraffic';
import type { SimulationHook } from '../lib/useSimulation';
import { mpsToMph, mToFt, waveSpeed } from '../lib/trafficMath';

const STYLE_LABELS: Record<string, string> = {
  dusk: 'Dusk',
  ember: 'Ember',
  blueprint: 'Blueprint',
  bone: 'Bone',
};

export function Creation({ traffic }: { traffic: TrafficHook; sim: SimulationHook }) {
  const { params } = traffic;
  const [styleKey, setStyleKey] = useState<keyof typeof BRAID_STYLES>('dusk');
  const [density, setDensity] = useState(34);
  const [seed, setSeed] = useState(0);
  const [weight, setWeight] = useState(1);
  const [showWeft, setShowWeft] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const field = useMemo(
    () => generateBraid(params, { ...DEFAULT_BRAID, perMile: density }),
    // seed is in the dependency list so "weave another" produces a new cloth
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params, density, seed],
  );

  const style: BraidStyle = useMemo(
    () => ({ ...BRAID_STYLES[styleKey], weight, showWeft }),
    [styleKey, weight, showWeft],
  );

  const w = mpsToMph(waveSpeed(params));

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = `shockwave-braid-tau${params.tau.toFixed(2)}-L${params.L.toFixed(1)}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  };

  return (
    <>
      <section className="section" style={{ paddingTop: 64 }}>
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">Section 3 · Create</div>
            <h2 className="h2">Shockwave Braid</h2>
            <p className="lede">
              A woven cloth in which the warp threads are cars and the weft threads are traffic
              jams. It is a weaving because the mathematics is a weaving: two families of straight
              lines, leaning opposite ways, crossing forever.
            </p>
          </div>

          <div className="split split-wide-right" style={{ alignItems: 'start' }}>
            <div>
              <Panel title="The loom" aside={<Badge color="var(--series-4)">{w.toFixed(1)} mph</Badge>}>
                <p style={{ fontSize: 13, marginBottom: 18 }}>
                  Every control here is a term in the equation. Nothing is decorative.
                </p>

                <div className="control">
                  <span className="control-head">
                    <span className="control-label">Palette</span>
                  </span>
                  <div className="seg" style={{ width: '100%' }}>
                    {Object.keys(BRAID_STYLES).map((k) => (
                      <button
                        key={k}
                        data-on={styleKey === k}
                        onClick={() => setStyleKey(k as keyof typeof BRAID_STYLES)}
                        style={{ flex: 1 }}
                      >
                        {STYLE_LABELS[k]}
                      </button>
                    ))}
                  </div>
                </div>

                <Slider
                  label="Threads (vehicles per mile)"
                  value={density}
                  min={12}
                  max={70}
                  step={1}
                  onChange={setDensity}
                  format={(v) => `${v} cars/mi`}
                  hint="Below the critical density of about 31 the cloth is plain. Above it, the weft appears on its own."
                />

                <Slider
                  label="Thread weight"
                  value={weight}
                  min={0.5}
                  max={2}
                  step={0.05}
                  onChange={setWeight}
                  format={(v) => `${v.toFixed(2)}×`}
                />

                <Slider
                  label="Reaction time τ"
                  value={params.tau}
                  min={0.6}
                  max={3}
                  step={0.05}
                  onChange={(tau) => traffic.setParams({ tau })}
                  format={(v) => `${v.toFixed(2)} s`}
                  hint="This is the ANGLE of the weft. Changing it re-weaves the whole cloth."
                />

                <div className="row row-wrap" style={{ marginTop: 10 }}>
                  <button className="btn" onClick={() => setShowWeft((s) => !s)}>
                    {showWeft ? 'Hide' : 'Show'} weft
                  </button>
                  <button className="btn" onClick={() => setSeed((s) => s + 1)}>
                    Weave another
                  </button>
                  <button className="btn btn-primary" onClick={download}>
                    Download PNG
                  </button>
                </div>

                <div
                  className="dash-strip"
                  style={{ marginTop: 22, paddingTop: 20, borderTop: '1px solid var(--hairline)' }}
                >
                  <Stat value={field.warp.length} label="Warp threads" />
                  <Stat value={field.weft.length} label="Weft threads" color="var(--series-4)" />
                  <Stat
                    value={w.toFixed(1)}
                    unit="mph"
                    label="Weft angle"
                    color="var(--series-4)"
                  />
                </div>
              </Panel>
            </div>

            <div>
              <BraidCanvas field={field} style={style} canvasRef={canvasRef} />
              <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
                Time runs left to right across roughly seven minutes. Distance runs up the
                page across {(field.length / 1609.344).toFixed(1)} miles of a single lane. Every
                thread is one real trajectory from the simulation — nothing here is drawn by hand.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- THE REFLECTION ---------------- */}
      <section className="section">
        <div className="wrap">
          <div className="split">
            <div className="prose">
              <h3 className="h3">How it connects to the mathematics</h3>
              <p>
                In Section 2 the key realisation was that a space-time diagram contains two
                families of lines with <em>opposite</em> slopes: cars climbing to the right at{' '}
                {mpsToMph(params.vf).toFixed(0)} mph, and jam fronts falling to the right at{' '}
                {w.toFixed(1)} mph.
              </p>
              <p>
                That is the definition of a woven fabric. Warp and weft are two sets of parallel
                threads crossing at an angle; cloth holds together because of the crossing. So
                rather than illustrate the mathematics with a picture of a weave, I let the
                mathematics <em>be</em> the weave: every warp thread is a vehicle trajectory
                recorded from the simulation, and every weft thread is a jam front, drawn at the
                one angle a jam front is allowed to have.
              </p>

              <h3 className="h3" style={{ marginTop: 34 }}>
                Three choices, and the mathematics behind them
              </h3>

              <div className="step">
                <span className="step-num">1</span>
                <div className="step-body">
                  <strong>Thread thickness is slowness, not speed.</strong>
                  <p style={{ marginTop: 6 }}>
                    A thread swells where its car is slow. My first attempt did the opposite — fast
                    cars drawn boldly — and the cloth came out almost blank, because the
                    interesting thing was being drawn in the thinnest ink. Inverting it is honest
                    to the subject: a jam is where <em>time</em> accumulates, and this is a picture
                    with time on one axis.
                  </p>
                </div>
              </div>

              <div className="step">
                <span className="step-num">2</span>
                <div className="step-body">
                  <strong>Every weft thread is parallel. On purpose.</strong>
                  <p style={{ marginTop: 6 }}>
                    It would be prettier to let the jam fronts fan out at different angles. They do
                    not, and that is the whole finding: <code>w = L/τ</code> contains nothing about
                    the jam, so every jam front on a given road has the same slope. The
                    monotony is the result. Drag τ and watch all of them pivot together — that
                    simultaneity is the thing I most want someone to see.
                  </p>
                </div>
              </div>

              <div className="step">
                <span className="step-num">3</span>
                <div className="step-body">
                  <strong>The weave is real, not painted on.</strong>
                  <p style={{ marginTop: 6 }}>
                    The weft is drawn with a dash pattern whose period is the on-screen spacing
                    between warp threads, and whose phase comes from where that jam started. So the
                    weft genuinely passes behind every other thread and in front of the rest —
                    over, under, over, under. If the warp spacing changes because you added
                    vehicles, the dash spacing follows it automatically. The cloth is woven by the
                    same numbers that produced it.
                  </p>
                </div>
              </div>

              <h3 className="h3" style={{ marginTop: 34 }}>
                What I hope someone notices
              </h3>
              <p>
                First, I hope they notice the pattern before they notice the explanation — that it
                reads as a textile, something you might find on a loom rather than in a transport
                engineering paper. I wanted it to be worth looking at before it was worth
                understanding.
              </p>
              <p>
                Then I hope they move the τ slider, see every diagonal pivot in unison, and{' '}
                <em>wonder why those lines are not allowed to disagree with each other</em>. That
                question is the whole project. They cannot disagree, because the angle was never
                theirs to choose. It was set by the length of a car and the speed of a human
                thought.
              </p>
              <p>
                The thing I would most like someone to take away is the one that surprised me: this
                cloth is a picture of something nobody designed. No driver is trying to make a
                pattern. Every one of them is just leaving a gap. The pattern is what a few hundred
                people leaving gaps <em>adds up to</em>, and it has an exact shape.
              </p>
              <p>
                And if someone walks down Figueroa afterwards, stands at a red at 7th, counts the
                cars that clear and thinks <em>I know why it was that many</em> — then this worked.
              </p>
            </div>

            <div>
              <Panel title="A note on the method">
                <p style={{ fontSize: 13.5 }}>
                  The cloth is regenerated from scratch every time you change a control: the
                  simulation runs {DEFAULT_BRAID.duration} seconds of traffic in a fraction of a
                  second, taps the brakes {DEFAULT_BRAID.perturbations} times at evenly spaced
                  moments, and records every position.
                </p>
                <p style={{ fontSize: 13.5 }}>
                  Because the vehicle types and starting positions are drawn at random, no two
                  weaves are identical. I decided to keep that rather than fix a seed. Every jam on
                  Figueroa is a one-off too; the thing that repeats is not the cloth but the angle.
                </p>
                <p style={{ fontSize: 13.5, marginBottom: 0 }}>
                  <strong>Print note:</strong> the <em>Bone</em> palette is the one meant for
                  paper — dark threads on a light ground, with the weft in red so the jam fronts
                  stay legible in ink. The PNG exports at 1400 × 900, large enough for a letter-size
                  print at about 150 dpi.
                </p>
              </Panel>

              <Panel title="Dimensions" style={{ marginTop: 14 }}>
                <table className="table">
                  <tbody>
                    <tr>
                      <td>Warp</td>
                      <td style={{ textAlign: 'right' }}>{field.warp.length} trajectories</td>
                    </tr>
                    <tr>
                      <td>Weft</td>
                      <td style={{ textAlign: 'right' }}>{field.weft.length} jam fronts</td>
                    </tr>
                    <tr>
                      <td>Time axis</td>
                      <td style={{ textAlign: 'right' }}>
                        {(field.duration / 60).toFixed(1)} min
                      </td>
                    </tr>
                    <tr>
                      <td>Distance axis</td>
                      <td style={{ textAlign: 'right' }}>
                        {(field.length / 1609.344).toFixed(2)} mi
                      </td>
                    </tr>
                    <tr>
                      <td>Weft slope</td>
                      <td style={{ textAlign: 'right', color: 'var(--series-4)', fontWeight: 650 }}>
                        −{w.toFixed(1)} mph
                      </td>
                    </tr>
                    <tr>
                      <td>From</td>
                      <td style={{ textAlign: 'right' }}>
                        L = {mToFt(params.L).toFixed(1)} ft, τ = {params.tau.toFixed(2)} s
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Panel>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
