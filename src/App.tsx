import { useEffect, useState } from 'react';
import { TooltipProvider } from './components/ui/primitives';
import { useTraffic } from './lib/useTraffic';
import { useSimulation } from './lib/useSimulation';
import { Overview } from './sections/Overview';
import { LiveCorridor } from './sections/LiveCorridor';
import { Mathematics } from './sections/Mathematics';
import { Creation } from './sections/Creation';
import { mpsToMph } from './lib/trafficMath';

const VIEWS = [
  { id: 'overview', label: 'Overview' },
  { id: 'live', label: 'Live Street' },
  { id: 'maths', label: 'The Mathematics' },
  { id: 'creation', label: 'The Creation' },
] as const;

type ViewId = (typeof VIEWS)[number]['id'];

function isView(v: string): v is ViewId {
  return VIEWS.some((x) => x.id === v);
}

export default function App() {
  const traffic = useTraffic();
  const sim = useSimulation(traffic.params);

  // Hand the live per-block speeds to the simulation, so the traffic on screen
  // moves at the speed the traffic on Figueroa is moving. This lives here
  // rather than in one section so every view shares it.
  const { stations } = traffic.analysis;
  const simObject = sim.sim;
  useEffect(() => {
    simObject.speedProfile = stations.map((st) => ({ s: st.offset, vf: st.vf }));
  }, [simObject, stations]);

  const liveMeanMph = mpsToMph(traffic.analysis.meanSpeed);
  const { setTargetMeanMph } = sim;
  useEffect(() => {
    setTargetMeanMph(liveMeanMph);
  }, [setTargetMeanMph, liveMeanMph]);

  const [view, setView] = useState<ViewId>(() => {
    const h = window.location.hash.replace('#', '');
    return isView(h) ? h : 'overview';
  });

  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace('#', '');
      if (isView(h)) setView(h);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (v: ViewId) => {
    window.location.hash = v;
    setView(v);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  const live = traffic.reading.source === 'live';
  const worstMph = mpsToMph(traffic.analysis.worst.v);

  return (
    <TooltipProvider>
      <header className="topnav">
        <div className="topnav-inner">
          <button className="brand" onClick={() => go('overview')}>
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <path
                d="M1 15 L6 15 L9 5 L12 15 L19 15"
                fill="none"
                stroke="var(--series-1)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>
              The Shape of a Jam
              <em>S Figueroa St · Downtown LA</em>
            </span>
          </button>

          <nav className="topnav-tabs" aria-label="Sections">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                className={`tab ${view === v.id ? 'tab-on' : ''}`}
                onClick={() => go(v.id)}
                aria-current={view === v.id ? 'page' : undefined}
              >
                {v.label}
              </button>
            ))}
          </nav>

          <div className="topnav-status">
            <span className="badge" title={traffic.reading.note ?? undefined}>
              <span
                className="badge-dot"
                style={{ background: live ? 'var(--good)' : 'var(--warning)' }}
              />
              {live ? 'Live · TomTom' : 'Recorded'}
            </span>
            <span className="badge" style={{ borderColor: 'transparent' }}>
              <span
                className="badge-dot"
                style={{
                  background:
                    worstMph < 15 ? 'var(--critical)' : worstMph < 30 ? 'var(--serious)' : 'var(--good)',
                }}
              />
              {traffic.analysis.worst.name} {worstMph.toFixed(0)} mph
            </span>
          </div>
        </div>
      </header>

      <main>
        {view === 'overview' && <Overview traffic={traffic} sim={sim} onNavigate={go} />}
        {view === 'live' && <LiveCorridor traffic={traffic} sim={sim} />}
        {view === 'maths' && <Mathematics traffic={traffic} sim={sim} />}
        {view === 'creation' && <Creation traffic={traffic} sim={sim} />}
      </main>

      <footer className="site-footer">
        <div className="wrap">
          <div className="footer-grid">
            <div>
              <strong>The Shape of a Jam</strong>
              <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                A geometry investigation of stop-and-go waves on South Figueroa Street, downtown
                Los Angeles. Built for APP201, Geometry in the World.
              </p>
              <p style={{ fontSize: 13, marginTop: 10, marginBottom: 0 }}>
                By <strong>Rohit Maruri</strong> ·{' '}
                <a
                  href="https://github.com/Rohit-ATS"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  github.com/Rohit-ATS
                </a>
              </p>
            </div>
            <div>
              <strong>Data &amp; method</strong>
              <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                Live speeds from the TomTom Traffic Flow Segment API, sampled at ten
                interchanges. Fleet composition from Caltrans District 7 classification counts.
                The model is Newell&rsquo;s car&#8209;following rule; every number on this site is
                re&#8209;derived from it and checked in <code>scripts/verify-math.ts</code>.
              </p>
            </div>
            <div>
              <strong>Honest limits</strong>
              <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                Density is inferred from speed rather than measured directly, lane&#8209;changing is
                not modelled, and the simulation runs on a closed loop. Each of these is
                explained where it matters rather than hidden.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </TooltipProvider>
  );
}
