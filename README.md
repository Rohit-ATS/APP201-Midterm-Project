# The Shape of a Jam

**A geometry investigation of stop-and-go waves on Interstate 405 through the Sepulveda Pass, Los Angeles.**

APP201 — *Geometry in the World*, midterm project.

---

## The finding

On the 405, the cars go south at 60 mph and the traffic jam goes **north at 11**.

That second number is not measured and not a coincidence. It is

```
w = L / τ
```

the effective length of a vehicle divided by a driver's reaction time — about 24.5 ft ÷ 1.5 s ≈ **11.2 mph, backwards**.

Nothing about the freeway appears in that formula. Not the number of lanes, not how many cars there are, not what caused the jam, not which city you are in. Which predicts that stop-and-go waves should run backwards at roughly the same speed everywhere on Earth — and measurements from Los Angeles, a Japanese test track, and German autobahns all land between 10 and 15 mph.

The whole site is the derivation of that one line, starting from a single geometric statement: **a moving car owns a segment of road, and that segment has a length.**

---

## The three required sections

| Rubric section | Where it lives on the site | Source |
|---|---|---|
| **1 · Notice + Name** | *Overview* tab | [`src/sections/Overview.tsx`](src/sections/Overview.tsx) |
| **2 · Explain the Mathematics** | *The Mathematics* tab | [`src/sections/Mathematics.tsx`](src/sections/Mathematics.tsx) |
| **3 · Create** | *The Creation* tab | [`src/sections/Creation.tsx`](src/sections/Creation.tsx) |
| Live evidence / dashboard | *Live Corridor* tab | [`src/sections/LiveCorridor.tsx`](src/sections/LiveCorridor.tsx) |

---

## The mathematics, in one page

Everything derives from the **spacing line**:

```
s(v) = L + v·τ          the road one car occupies, bumper to bumper
```

Then, in order:

1. **Density is the reciprocal of spacing.** `k = 1/s`. At a dead stop `s = L`, so jam density is `kj = 1/L ≈ 215 veh/mile/lane`.
2. **Flow is density times speed.** `q = k·v`. Substituting the spacing line gives
   `q = 1/τ − (L/τ)·k` — a straight line whose slope is `−L/τ`.
3. **The fundamental diagram is a triangle.** A free branch `q = vf·k` and the congested branch above, meeting at capacity ≈ **2,048 veh/h/lane** (the Highway Capacity Manual says 2,000–2,400 — so the model lands in the measured range).
4. **Every slope on that diagram is a speed,** because `(veh/hour) ÷ (veh/mile) = miles/hour`. The chord between two states is the speed of the *boundary* between them.
5. **Therefore the jam travels at `−L/τ`.** Any two congested states lie on one straight line, so the chord between them *is* that line.

A comparison model (Greenshields 1935, the smooth parabola) is plotted alongside and **rejected** — it overestimates capacity by about 70%. The site shows both so the reader can judge that call.

### Verification

The model is not taken on trust. [`scripts/verify-math.ts`](scripts/verify-math.ts) checks 17 identities and published field measurements:

```bash
node --experimental-strip-types scripts/verify-math.ts
```

It runs in CI on every push, and the deploy fails if any check fails.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production bundle into dist/
```

### Live traffic (optional)

The site works with no setup — it falls back to a recorded PM-peak reading of the corridor, so it never shows an empty screen during a presentation.

For live data:

1. Create a free account at <https://developer.tomtom.com/> and make a key with the **Traffic API** product enabled.
2. `cp .env.example .env` and paste the key into `VITE_TOMTOM_KEY`.
3. Restart the dev server.

The free tier allows 2,500 requests/day. The site samples **ten** interchanges per refresh and refreshes every two minutes, so one open tab costs roughly 300 requests/hour.

> **Security note.** This is a static site, so the key ships inside the JavaScript bundle and anyone can read it. Before publishing, restrict the key to your GitHub Pages origin in the TomTom dashboard, and rotate it after the presentation. For a key that must stay secret, the site would need a serverless proxy.

### Deploying

Pushing to `main` builds and publishes to GitHub Pages via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Add `VITE_TOMTOM_KEY` as a repository secret to include live data in the published build. In the repo settings, set **Pages → Source → GitHub Actions**.

---

## How it is built

```
src/
  lib/
    trafficMath.ts     the model — spacing, density, flow, the triangular
                       fundamental diagram, shockwave speeds, level of service
    simulation.ts      Newell car-following: v = (s − L)/τ, and nothing else
    analysis.ts        turns a speed reading into density, flow and wave speeds
    tomtom.ts          live corridor data, with the recorded fallback
    braid.ts           generates the trajectories the artwork is woven from
  data/
    corridor.ts        the ten interchanges, lane counts, segment geometry
    vehicleMix.ts      the fleet — this is where L is DERIVED, not assumed
    snapshot.ts        a frozen real PM-peak reading
  components/
    charts/            spacing line, fundamental diagram, corridor profile,
                       space-time diagram, fleet composition
    scene/             the 3D road and procedurally built vehicle models
    BraidCanvas.tsx    the Shockwave Braid renderer
  sections/            the four pages of the site
scripts/
  verify-math.ts       the self-check
```

### Two details worth knowing

**Vehicle types are honest even though no individual car is.** A traffic API reports how fast vehicles move, never what they are. So the 3D scene draws vehicle classes at random from the real fleet composition for this corridor, at true dimensions — a sedan is 15.4 ft here and a semi-trailer is 68.9 ft, because the length of those boxes *is* the `L` in the equation.

**The 3D view and the space-time diagram are the same simulation.** They read from one `Simulation` instance, so the plot is literally the traffic you are watching, not a second model that happens to look similar.

---

## What this model gets wrong

Stated on the site too, because a model that explains everything explains nothing:

- **Density is inferred, not measured.** TomTom reports speed; density comes from inverting the fundamental diagram — which means the model partly produces the data it is then tested against. Caltrans PeMS loop-detector counts would break that circularity.
- **Nobody changes lanes.** Real drivers escape slow lanes, which both relieves and spreads congestion.
- **Every driver is identical.** One `τ` for everybody; in reality it ranges from about 0.8 s to over 2.5 s, and that spread is itself a cause of waves.
- **The road is a loop**, so traffic is conserved and nothing has to be invented at the boundaries. A real corridor has on- and off-ramps.
- **The triangle has sharp corners.** Measured data scatters into a cloud near the peak, partly because capacity itself drops once a queue forms.
- **Grades are a fudge** — modelled as reduced free-flow speed rather than heavy vehicles losing power on a 4% climb.

---

## Showcase notes (3–5 minutes)

1. **Open on the hero.** "The cars go south at 60. The jam goes north at 11." *(~30 s)*
2. **Overview → what I noticed.** Brake lights lighting up backwards in the mirror. The jam is a shape cars pass through, not a thing made of cars. *(~45 s)*
3. **The Mathematics → the spacing line,** then jump to the big number. One line: `s = L + vτ`. Flip it, and the slope is the wave speed. *(~90 s)*
4. **Drag the τ slider.** Everything moves at once — that is the point. Then the capacity table: cutting reaction time beats adding lanes. *(~45 s)*
5. **Tap the brakes** on the simulation and watch a phantom jam form from one two-second tap. *(~30 s)*
6. **The Creation → Shockwave Braid.** Two families of lines leaning opposite ways is a weave. Drag τ and watch every diagonal pivot together. *(~45 s)*

---

## Data sources

- **Live traffic** — [TomTom Traffic Flow Segment Data API](https://developer.tomtom.com/traffic-api/documentation/traffic-flow/flow-segment-data), sampled at ten interchanges along the corridor.
- **Fleet composition** — Caltrans District 7 vehicle classification counts for the West LA / Sepulveda corridor, with the FHWA class distribution for urban non-truck-route freeways.
- **Capacity and level-of-service bands** — Highway Capacity Manual.
- **The model** — G. F. Newell, *A simplified car-following theory: a lower order model* (2002); B. D. Greenshields, *A study of traffic capacity* (1935), used as the rejected comparison.
