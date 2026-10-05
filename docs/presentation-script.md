# The Shape of a Jam

## Midterm Showcase script

**Rohit Maruri · APP201, Geometry in the World**

Target: 4 minutes. Cut the bracketed *[optional]* paragraphs to make 3.

Site: **rohit-ats.github.io/APP201-Midterm-Project**
Code: **github.com/Rohit-ATS**

---

## Before you start

- Open the site on **Live Street**. Camera on **Street**, clock on **Real time**.
- Check the top-right badge says **Live · TomTom**. If it says *Recorded*, say so out loud — the fallback is deliberate, and explaining why you built one is a better moment than a blank screen.
- Have **The Mathematics** and **The Creation** open in two other tabs so nothing has to load while you talk.
- One thing to remember: you are not reading the site to them. The site does the deep explaining. You are telling them where to look.

---

## 1 · What I noticed

**0:00 – 0:50**

> *[Stand on the Live Street tab. Do not touch anything yet. Let the traffic move behind you while you talk.]*

I walk the same intersection almost every day.

If you stand at one long enough you start counting without meaning to. A green light does not let "the traffic" through. It lets a **specific number of cars** through — and that number is oddly consistent. If you are inside it, you make the light. If you are one car behind it, you watch the whole cycle go past and try again.

Some days the line clears in one go. Some days a line that looks exactly the same needs two. I wanted to know what decides that.

And then I noticed a second thing, at the *back* of that line. When the light goes red, the brake lights do not all come on at once. They light up one at a time, travelling backwards down the block, away from the intersection — reaching cars that have not even arrived yet.

So the queue is moving. Not the way traffic moves. Moving **against** it.

Every car is pointed south and going south, and the back edge of the jam is travelling north. The cars and the traffic jam are going in opposite directions at the same time.

> *[Gesture at the screen.]* This is South Figueroa, downtown. The street is real, the buildings are real, and the traffic data is live.

---

## 2 · Why it caught my attention

**0:50 – 1:25**

Honestly, because a month ago I had decided I was finished with maths. I had made up my mind I would never study it again, and the only reason I did is that my degree required it.

What changed was a video about how large language models actually work — the thing behind ChatGPT and Claude, which I use every day building my own projects. It turns out an LLM is an enormous amount of mathematics stacked up until you can talk to it. And underneath that, computers are running on binary. Ones and zeroes.

That reframed the subject for me. Maths is not a topic I have to get past. It is what everything I want to build is made out of.

So when I noticed the counting at that intersection, I did not dismiss it the way I would have a week earlier. A jam that moves backwards is not a complaint. It is a **shape** — and a shape has geometry. A speed, a direction, a front edge, a back edge, and a slope on a graph.

---

## 3 · The mathematics

**1:25 – 2:45**

> *[Switch to The Mathematics tab. Scroll to the spacing line chart.]*

It all comes down to one question: **how much road does one car need?**

Not just the car's body. The body *plus* the gap in front that the driver will not give up. Call that the **spacing**.

And how big is that gap? Drivers do not think in feet. They think in *time* — the two-second rule. A driver holds a fixed number of **seconds** of following distance, which means the gap in **feet** is that time multiplied by speed.

> *[Point at the formula on screen.]*

```
s  =  L  +  v × τ

spacing  =  car length  +  (speed × reaction time)
```

That is a straight line. The intercept is the length of a car. The slope is the driver's reaction time.

Here is the part I did not expect. A car stopped at a red still takes up room — about 24 and a half feet, its own length plus the bumper gap. That stubborn intercept is what makes a jam a jam.

> *[Scroll to the fundamental diagram.]*

Rearrange that line and you get this. The thing worth knowing about this diagram is that **every slope you can draw on it is a speed** — because vehicles-per-hour divided by vehicles-per-mile cancels the vehicles and leaves miles per hour.

So when two states of traffic meet, the boundary between them moves at the slope of the line joining them. And that slope comes out as:

```
        L         24.6 ft
w  =  —————  =  —————————  ≈  12 mph, BACKWARDS
        τ          1.4 s
```

> *[Pause. This is the line to land. Let it sit for a second.]*

Look at what is **not** in that formula. Not the street. Not the number of lanes. Not how many cars there are, or what caused the jam, or what city you are in. Only the length of a car, and the reaction time of a human being.

Which predicts something checkable: jam waves should run backwards at about the same speed everywhere on Earth. Measurements from Los Angeles, a Japanese test track and German autobahns all land between 10 and 15 miles an hour.

> *[Optional — cut this first if you are over time.]* And the counting I started with has an answer too. Flip the peak of that diagram upside down and you get **1.96 seconds** — the gap between cars crossing a stop line. Take the green time, subtract the two seconds the first few drivers lose reacting, divide by 1.96, and at Wilshire you get **18 cars per lane**. If you are the nineteenth, you are not getting through, and no amount of impatience changes it.

---

## 4 · What I created

**2:45 – 3:45**

> *[Back to Live Street. Press "Inspect a car".]*

The first thing I built is this. Click any car and it solves **that car's own copy** of the equation, live, with its own numbers in it.

> *[Read the panel off the screen — do not memorise it, the numbers change.]*

Its spacing to the car in front, minus its own length, divided by reaction time. And it tells you which thing is holding that driver back right now: the open road, the car in front, or a red light.

That is the point I most wanted to make. The model is not a statement about traffic in general. It is a rule that every single driver is following right now, and all of them are solving the same two-term expression with different numbers.

> *[Press "Tap the brakes".]*

And here — one driver brakes for two seconds, then carries on normally. Watch what happens behind them. Nothing in this simulation is ever told to stop. The jam that appears came out of the rule.

> *[Switch to The Creation tab.]*

Then I made this. It is called **Shockwave Braid**.

A space-time diagram has two families of lines in it: the cars, climbing one way, and the jam fronts, falling the other. Two sets of parallel threads crossing at an angle is the definition of woven cloth.

So rather than draw a picture *about* the mathematics, I let the mathematics *be* the weave. Every warp thread is a real vehicle trajectory. Every weft thread is a jam front, drawn at the one angle a jam front is allowed to have.

> *[Drag the τ slider. Slowly. This is the money moment.]*

When I change the reaction time, every single diagonal pivots **together**. They cannot disagree with each other. The angle was never theirs to choose — it was set by the length of a car and the speed of a human thought.

---

## 5 · Close

**3:45 – 4:00**

The site does the deeper explaining — the full derivation, the model I rejected and why, and a list of six things this model gets wrong.

What I want to do next is bigger than one street. Traffic takes a real piece of everyone's day, and I want to work on it properly. I picked LA because people say it is unsolvable, and I would rather work on the hard version.

A month ago I had decided I was done with maths. What changed my mind was not a lecture about why maths matters. It was one question, at one intersection, that turned out to have an exact answer.

Thank you.

---

## Numbers cheat sheet

Glance at this if you blank. Everything is re-derived live on the site, so if a number on screen differs slightly, trust the screen.

| Quantity | Value | Why it matters |
|---|---|---|
| Effective vehicle length **L** | 24.6 ft | Derived from the real downtown fleet, not assumed |
| Reaction time **τ** | 1.4 s | The slope of the spacing line |
| **Wave speed = L / τ** | **≈ 12 mph, backwards** | The headline. Field studies: 10–15 mph |
| Saturation headway | 1.96 s | Field-measured at 1.9–2.1 s. Never fitted |
| Cars per green at Wilshire | 18 per lane | Queue longer than this = cycle failure |
| Saturation flow | ~1,837 veh/h/lane | Highway Capacity Manual base: ~1,900 |
| Study corridor | 3rd St → 11th St, 1.02 mi | 10 signalised intersections |
| Real buildings rendered | 413 | OpenStreetMap, real heights |
| Real street network | 1,955 ways | Cross streets, 110 ramps, sidewalks |
| Maths self-checks | 26, gating the deploy | `scripts/verify-math.ts` |

---

## If someone asks

**"Did you just make the cars up?"**
The *speeds* are live from TomTom, sampled at all ten intersections every two minutes. The *vehicle types* are invented, because a traffic API tells you how fast things are moving but never what they are — so types are drawn at random from the real downtown fleet mix, at true dimensions. A bus is 40 feet here because a bus is 40 feet.

**"Why a street and not a freeway?"**
On a freeway you wait for a jam and hope. On Figueroa a red light builds one every ninety seconds, releases it, and builds it again — so the thing I wanted to measure arrives on a schedule.

**"Is the simulation just playing back the data?"**
No. Every driver is given one rule and nothing else, and the waves emerge from it. The one thing I do fit is a single cruise-speed scale, calibrated so the simulated mean speed matches the measured mean speed — and what that converges to is the cruising speed between lights, which is a number TomTom never reports.

**"Does adding lanes fix it?"**
Lanes are not the constraint. Capacity is saturation flow times the green share of the cycle, and at Wilshire that is 42% — so the street gives away more than half its capacity to red time before you count anything else. The leverage is in τ and in signal timing, and neither of those is made of concrete.

**"What is wrong with it?"**
Plenty, and it is listed on the site. The biggest one: density is *inferred* from speed rather than measured, which means the model partly produces the data it is then tested against. Loop-detector counts from Caltrans would break that circularity, and that is the first thing I would add.

**"How do I know the maths is right?"**
There are 26 assertions in the repository that run on every deploy, and three of them check quantities I never tuned against numbers other people measured in the street. If any of them break, the site does not publish.
