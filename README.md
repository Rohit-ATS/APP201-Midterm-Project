# The Shape of a Jam

**A geometry investigation of stop-and-go waves on South Figueroa Street, downtown Los Angeles.**

APP201 — *Geometry in the World*, midterm project.

---

## The finding

At a red light on Figueroa the cars go south and the back of the queue goes **north at 12 mph**.

That number is not measured and not a coincidence. It is

```
w = L / τ
```

the effective length of a vehicle divided by a driver's reaction time — 24.6 ft ÷ 1.4 s ≈ **11.98 mph, backwards**.

Nothing about the street appears in that formula. Not the number of lanes, not how many cars there are, not which city you are in. Which predicts that queue-discharge waves run backwards at roughly the same speed everywhere on Earth — and field measurements land between 10 and 15 mph.

The whole site is the derivation of that one line, starting from a single geometric statement: **a moving car owns a segment of road, and that segment has a length.**

---

## Why a street, and why this one

South Figueroa runs at the foot of the tallest buildings in the western United States. The **Wilshire Grand** (335 m) and the **US Bank Tower** (310 m) are both on it, and the 3D scene renders their real footprints at their real heights. That skyline *is* the demand: all of it empties onto one street twice a day, through ten signalised intersections in a single mile.

It is also the better laboratory. On a freeway you wait for a jam and hope. Here a red light builds one every ninety seconds, releases it, and builds it again — so the backward wave can be watched on demand.

---

## What is real in this project

Almost all of it, and the parts that are not are labelled.

| Thing | Source |
|---|---|
| **Traffic speeds** | TomTom Traffic Flow Segment API, live, sampled at all ten intersections every 2 minutes |
| **The street itself** | The real OpenStreetMap centreline of South Figueroa (`scripts/build-street.mjs`), corrected block-by-block by the GPS traces TomTom returns with each reading |
| **The buildings** | 413 real OpenStreetMap footprints, extruded to their recorded heights, in the same metre grid as the road (`scripts/build-buildings.mjs`) |
| **Signal timing** | 90-second cycles on an offset progression, as LADOT runs the downtown grid |
| **Vehicle mix** | LADOT downtown classification counts — this is where the constant `L` is *derived* rather than assumed |
| **The vehicles themselves** | Simulated. A traffic API reports how fast vehicles move, never what they are, so types are drawn at random from the real fleet composition at true dimensions |

> An early version used hand-placed intersection coordinates as the street's spine. They were out by up to **85 m**, which put the roadway inside the lobby of the Wilshire Grand. Since the buildings are real OSM geometry, the street had to be too.

---

## Click a car

The feature worth opening the site for. Click any vehicle in the 3D scene (or press **Inspect a car**) and the panel solves *that vehicle's* own copy of the equation, live, with its own numbers:

```
v = (s − L) / τ
v = (95.2 − 22.6) / 1.40
v = 35.3 mph          …but capped at v_f = 30 mph, so it drives 30.0
```

It also names which constraint is currently binding — the open road, the car in front, or a red light — and shows what that one car contributes to the macroscopic numbers (`k = 1/s`, `q = k·v`). Follow one car through a light and you can watch the binding term hand over.

---

## The mathematics, in one page

Everything derives from the **spacing line**:

```
s(v) = L + v·τ          the road one car occupies, bumper to bumper
```

Then, in order:

1. **Density is the reciprocal of spacing.** `k = 1/s`. At a dead stop `s = L`, so jam density is `kj = 1/L ≈ 215 veh/mile/lane`.
2. **Flow is density times speed.** `q = k·v`. Substituting the spacing line gives `q = 1/τ − (L/τ)·k` — a straight line whose slope is `−L/τ`.
3. **The fundamental diagram is a triangle.** A free branch `q = vf·k` and the congested branch above, meeting at a peak.
4. **On a street that peak is the saturation flow**, not the capacity: **1,837 veh/h/lane**. Invert it and you get the **saturation headway, 1.96 s** — the number engineers measure with a stopwatch, published range 1.9–2.1 s. We did not fit that. It fell out of a car's length and a reaction time.
5. **Capacity = saturation flow × green ratio.** At Wilshire's 42% green that is **772 veh/h/lane** — less than half what the asphalt could do. The lanes are not the constraint.
6. **Every slope on the diagram is a speed,** because `(veh/hour) ÷ (veh/mile) = miles/hour`. The chord between two states is the speed of the *boundary* between them.
7. **Therefore the jam travels at `−L/τ`.** Any two congested states lie on one straight line, so the chord between them *is* that line.

Greenshields' smooth parabola is plotted alongside and **rejected** — not because its peak height is far off (it is 12% low) but because it puts that peak at 107 veh/mile when the street actually breaks down at 61.

### Verification

The model is not taken on trust. [`scripts/verify-math.ts`](scripts/verify-math.ts) checks **24 identities and published field measurements**, and CI fails the deploy if any break:

```bash
node --experimental-strip-types scripts/verify-math.ts
```

Three of those checks are quantities we never tuned landing on numbers somebody else measured in the street: the backward wave speed, the saturation flow, and the saturation headway.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build
```

### Live traffic

The site works with no setup — it falls back to a recorded evening-peak reading, so it cannot go blank during a presentation.

For live data: get a free key at <https://developer.tomtom.com/> with the **Traffic API** product enabled, then `cp .env.example .env` and paste it into `VITE_TOMTOM_KEY`.

The free tier allows 2,500 requests/day. The site samples **ten** intersections per refresh every two minutes — roughly 300 requests/hour per open tab.

> **Security note.** This is a static site, so the key ships inside the JavaScript bundle. Restrict it to your GitHub Pages origin in the TomTom dashboard, and rotate it after the presentation.

### Regenerating the map data

Both baked data files are reproducible:

```bash
# buildings
curl -G https://overpass-api.de/api/interpreter -A "your-project/1.0" \
  --data-urlencode 'data=[out:json][timeout:120];way["building"](34.0425,-118.2672,34.0558,-118.2532);out tags geom;' \
  -o osm-buildings.json
node scripts/build-buildings.mjs osm-buildings.json

# the street centreline
curl -G https://overpass-api.de/api/interpreter -A "your-project/1.0" \
  --data-urlencode 'data=[out:json][timeout:90];way["highway"]["name"~"Figueroa",i](34.0400,-118.2700,34.0600,-118.2500);out tags geom;' \
  -o osm-fig.json
node scripts/build-street.mjs osm-fig.json
```

### Deploying

Pushing to `main` builds and publishes to GitHub Pages via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Add `VITE_TOMTOM_KEY` as a repository secret for live data in the published build.

---

## How it is built

```
src/
  lib/
    trafficMath.ts     the model — spacing, density, flow, the triangular
                       diagram, saturation flow, signal capacity, shockwaves
    simulation.ts      Newell car-following plus signals. A red light is a
                       stopped car of zero length on the stop line, so the
                       same rule stops traffic — no braking logic exists
    geo.ts             one projection, shared by the road and the buildings
    analysis.ts        turns a speed reading into density, flow, wave speeds
    tomtom.ts          live data, and the GPS-corrected street centreline
    braid.ts           generates the trajectories the artwork is woven from
  data/
    street.json        real OSM centreline of South Figueroa
    buildings.json     413 real OSM footprints with heights
    corridor.ts        the ten intersections, snapped onto the real street
    vehicleMix.ts      the fleet — where L is DERIVED
    snapshot.ts        a frozen real evening-peak reading
  components/
    VehicleInspector.tsx   one car's own equation, solved live
    scene/                 the 3D street, buildings, signals, vehicles
    charts/                spacing line, fundamental diagram, corridor
                           profile, space-time diagram, fleet composition
  sections/            the four pages of the site
scripts/
  verify-math.ts       the self-check (24 assertions)
  build-street.mjs     OSM street centreline -> street.json
  build-buildings.mjs  OSM footprints -> buildings.json
```

---

## What this model gets wrong

Stated on the site too, because a model that explains everything explains nothing:

- **Density is inferred, not measured.** TomTom reports speed; density comes from inverting the fundamental diagram — so the model partly produces the data it is then tested against.
- **Nobody changes lanes.**
- **Every driver is identical.** One `τ` for everybody; in reality it ranges from about 0.8 s to over 2.5 s, and that spread is itself a cause of waves.
- **Traffic recirculates.** A vehicle leaving 11th re-enters at 3rd, so traffic is conserved; real Figueroa gains and loses cars at every cross street.
- **Nothing turns, parks or crosses.** A large share of real downtown delay is left-turners, double-parked vans and pedestrians holding the turn phase.
- **The triangle has sharp corners.** Measured data scatters near the peak, partly because capacity drops once a queue forms.

---

## Showcase notes (3–5 minutes)

1. **Open on the hero.** "The cars go south. The jam goes north at 12." *(~30 s)*
2. **Overview → what I noticed.** Brake lights lighting up backwards down the block from a red at 7th. *(~45 s)*
3. **Live Street → click a car.** Its own equation, solved live, with the binding constraint named. Switch to **Chase** and ride it through the light. *(~60 s)*
4. **The Mathematics → the spacing line,** then the big number. One line: `s = L + vτ`. Flip it, and the slope is the wave speed. *(~75 s)*
5. **Drag the τ slider.** Everything moves at once. Then saturation headway: 1.96 s, which engineers measure at 1.9–2.1 and we never fitted. *(~45 s)*
6. **The Creation → Shockwave Braid.** Two families of lines leaning opposite ways is a weave. Drag τ and every diagonal pivots together. *(~45 s)*

---

## Data sources

- **Live traffic** — [TomTom Traffic Flow Segment Data API](https://developer.tomtom.com/traffic-api/documentation/traffic-flow/flow-segment-data)
- **Street centreline and buildings** — OpenStreetMap, via the Overpass API. © OpenStreetMap contributors, ODbL
- **Fleet composition** — LADOT downtown vehicle classification counts; FHWA urban-arterial distribution
- **Saturation flow, headway and level-of-service bands** — Highway Capacity Manual
- **The model** — G. F. Newell, *A simplified car-following theory: a lower order model* (2002); B. D. Greenshields, *A study of traffic capacity* (1935), used as the rejected comparison
