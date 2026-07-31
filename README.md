# Bagshot CC — Bowl First, Then Chase

A browser cricket game for Bagshot Cricket Club, in the spirit of
[500-0.com](https://500-0.com/) but as a real match rather than a chase.

You win the toss and bowl. Pick eleven from the squad, decide who bowls which
45 overs, watch the opposition bat — and then chase whatever they leave you.

- **Season mode.** Nine fixtures in **Surrey Cricket Championship Division 6
  West**, against the clubs Bagshot actually play. Full league table, bonus
  points, net run rate, and the rest of the division playing itself around you.
- **45 overs a side**, the Saturday league length.
- **Both innings are simulated ball by ball.** Nothing is decided in advance.
- Runs on any phone or desktop browser, no account, no backend.

```bash
npm install
npm run dev        # play it at localhost:5173
npm run build      # static site in dist/
npm run bench      # 2000 headless matches, checks the engine is calibrated
npm run typecheck
```

---

## Deploying

The build is a plain static site with no backend, no environment variables and
no server-side routing, so any static host will do.

**Vercel** — import the repo and accept the defaults. It detects Vite and uses:

| Setting | Value |
|---|---|
| Framework preset | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm install` |

Nothing else to configure. There is no client-side router, so no rewrite rules
are needed. Vercel builds the repo's production branch on every push and gives
every other branch a preview URL.

`vite.config.ts` sets `base: './'`, so the built asset paths are relative and
the same `dist/` works at a domain root or in a subdirectory — Vercel, Netlify,
GitHub Pages or a folder on the club website.

---

## The four ratings

Every player carries four numbers, all 0-100, all centred so that
**60 is league average**:

| | Wicket duel | Runs duel |
|---|---|---|
| **Batting** | `SKILL` — survival, how hard he is to get out | `PWR` — boundaries and strike rate |
| **Bowling** | `ATT` — taking wickets | `DEF` — economy, dots, fewer extras |

A fifth, optional rating sits on top: **`SWING`**, what a bowler does with a new
ball. It lifts ATT sharply and DEF a little for the first twelve overs and then
fades to nothing, so a swing bowler held back to first change has wasted his
best asset. Archie Graham, Derek Budd and Jack Brown have it. Opening with them
rather than holding them back is worth roughly **8 runs an innings**.

Every ball resolves both duels: SKILL against ATT decides whether the batter
survives, PWR against DEF decides how many runs come. That makes the two
bowling ratings genuinely different tools — an ATT-heavy attack buys wickets
but leaks, a DEF-heavy attack strangles but never breaks a set batter, and
deciding when to use each is the game.

### Batting intent

The other place those two ratings pull apart is when you tell the batters how
hard to go. **Intent is how many shots they play, not how many runs they get** —
turning intent into runs takes PWR, and surviving it takes SKILL. So the same
order is a different deal for different men:

| told to ATTACK | boundaries | risk |
|---|---|---|
| Adit Gandhi (SKILL 83 / PWR 88) | **+103%** | +28% |
| a tailender (SKILL 20 / PWR 25) | +35% | +77% |

Told to DEFEND, an 85-SKILL batter cuts his chance of getting out by about a
quarter; a 25-SKILL bowler cuts it by under a tenth, because he was going to get
out anyway. Anyone can stop playing shots — that's why only the upside is scaled
by power.

That makes the instruction interact with the batting order and with whoever
happens to be at the crease when the break comes. The screen shows you the
actual numbers for the two men out there, so it's a decision rather than a dial.

### Seam and spin

Whether a bowler is **pace** or **spin** changes what he does with the same
ratings. It used to be decoration — flipping every bowler's type produced
literally identical innings — and now it decides when he's worth having:

| per over | powerplay | middle | death |
|---|---|---|---|
| **pace** | 4.75 econ · 0.20 wkts | 5.14 · 0.11 | 5.85 · 0.24 |
| **spin** | 5.40 econ · 0.17 wkts | **4.83 · 0.16** | 6.92 · 0.21 |

A seamer owns the new ball and the death and leaks through the middle once the
shine has gone. A spinner is the opposite: carted at either end, but through the
middle he's both cheaper *and* takes half again as many wickets — and he's the
one who removes a **set** batter, because that's the man trying to hit over the
top. Across a whole innings the two are within a couple of runs of each other,
so this is about when you bowl someone, not who's better.

Rough guide for a Surrey Championship side:

| Rating | Standard |
|--:|---|
| 85+ | League star, best in the division |
| 75 | First-team regular who wins games on his own |
| 60 | Solid first-teamer — the baseline |
| 45 | Second-team standard |
| 30 | Genuine rabbit, or doesn't bowl |

---

## The squad

The Bagshot squad is in [`src/data/squad.ts`](src/data/squad.ts) — 27 players,
trimmed from the full 42 so that everyone listed is someone who could actually
make the side:

```ts
{
  id: 'alex-dunnage',
  name: 'Alex Dunnage',
  value: 1.5,                             // £m — displayed, not spent
  role: 'Spin all-rounder',               // the club's own label
  bowlType: 'spin',
  swing: 0,                               // optional — new-ball movement
  bat:  { skill: 79, pwr: 93 },
  bowl: { def: 81, att: 76 },
}
```

One field isn't in the source table: **`bowlType`**, set to `spin` for the spin
roles and `pace` otherwise.

There is **no preferred batting position** — bat anyone anywhere. What you do
need to watch is that everyone you pick gets a go; see fresh air games below.

A rating **below 20 in either DEF or ATT means the player doesn't bowl**, so the
1s against the specialist batters keep them out of the attack. Whoever is
keeping wicket can't bowl either — which matters for Michael Davis, the one
keeper with real bowling ratings.

`value` is shown on the team sheet but **doesn't constrain selection**; there's
no budget cap, so pick whoever you like.

Ratings can also be edited in-app under *Manage Squad*, which saves to the
browser and overrides the file, with JSON import and export. That's per-device,
though — to change the squad for everyone, edit the file and push.

**The default team.** Whatever XI you last played, in the order it batted,
becomes next week's starting point — including any change you made at the
interval. With nothing saved, the first match opens on the best side by ratings.
Anyone since dropped from the squad or unavailable simply isn't there.

---

## How a match runs

1. **Selection** — eleven from the squad **in batting order**. The side you
   picked last week loads automatically, minus anyone now unavailable, so a
   settled team is a glance and a tap; gaps are left where players are missing
   rather than filled with silent replacements. Reorder with the `▲▼` arrows, or
   tap two names to swap them outright. Anyone unavailable is hidden by default
   — one toggle brings them back if you want to see what you're missing. You
   need a keeper and at least five who can bowl, and `AUTO` picks a legal side.
2. **The attack** — say how many overs each bowler gets in each third of the
   innings: **new ball, middle, death**. Three numbers per man. Each window has
   to come out exact — 9, 26 and 10 — so the panel at the top turns green only
   when the plan actually adds up, and the counts are honoured to the over.
   Your frontline sits above the part-timers, sorted by what they're here for,
   unused bowlers collapse to a line, and a preview strip shows the
   **over-by-over rota you'll actually get** — seeded from the match itself, so
   it isn't an estimate. Bowlers work in tandem from either end, so they bowl
   proper spells rather than one over each in rotation.
3. **Fielding innings** — they bat. The scoreboard carries the two men at the
   crease with their runs and balls, and the feed runs a scorebook strip for
   every over (`. 1 4 . W 2`), so every single ball is visible. Pause, run it at
   4×, or skip it entirely.
4. **Interval** — your order shown back with the target now known, and how the
   openers play the first nine overs.
5. **The chase** — you bat, and the innings **stops for drinks every nine
   overs**. Each break shows the score, the asking rate, the DLS par and who's
   in, then asks how they play the next nine: **defend, build, push, attack**.
   There is no autopilot underneath — tell them to block out a chase you could
   have won and they will. A **DLS par score** runs alongside the required rate,
   because par prices in wickets as well as balls: nine down and level with the
   rate is not level at all.
6. **Result** — both scorecards, bowling figures, fall of wickets, and a man of
   the match.

The phone's back gesture steps back through the app rather than leaving it.
Once an innings has been bowled there's deliberately no route back into
selection or the plan — re-planning after seeing the total would be bowling it
twice — so back during a sim skips to the end of that innings instead.

---

## Team news

Availability is what actually decides a village Saturday XI, so a season models
it. Every round:

- **some have other plans** — a wedding, a stag do, work, "a long-standing golf
  booking". One week only, and rolled per player against his availability score
  (below).
- **three to five are injured** — topped back up to that band each round, with
  absences running one to eight weeks depending on what they've done.
- **occasionally somebody falls out with the club** — roughly twice a season,
  and it always seems to be one of the good ones.

### The availability score

Every player carries an **availability score out of 10**: how many weeks in ten
he actually turns up. Ten never misses; three is the lad who plays a handful of
games and is a genuine gamble every time you pencil him in. It's editable per
player in the squad screen, shown as a coloured chip on selection, and you can
sort the squad list by it.

It's rolled fresh each round rather than applied as a flat penalty, so a 4/10
is not "a worse player" — he's the same player, available less often. That
changes what a rating is worth: a brilliant 3/10 might win you two games a
season, while a solid 9/10 is in your side every week and quietly worth more.

The score covers **other plans only**. Injuries are rolled separately and ignore
it entirely, because a torn hamstring doesn't care how keen anybody is — so your
most reliable man can still be crocked for a month.

Typically eight or nine of twenty-seven are missing on any given week, which is
the point: you cannot pick the same eleven every week, so squad depth stops
being decoration and selection becomes a real decision. Unavailable players stay
visible on the selection screen, greyed out with the reason, so you can see
exactly what you're missing.

There is one guard on all of it. If absences ever leave a squad that can't raise
a legal XI — eleven players including five who bowl — the game talks the busy
ones round, most reliable first, until it can. It never recalls the injured or
anyone who has walked out. A side you can't pick is a bug, not a challenge.

Both keepers are out about one round in ten. Rather than block selection, the
gloves go to whoever bats last — and it shows, in byes and in chances put down
behind the stumps.

Flavour text lives in [`src/data/events.ts`](src/data/events.ts) and the
mechanics in [`src/engine/availability.ts`](src/engine/availability.ts). It's
deterministic in the season seed, so reloading can't reshuffle who is fit.

## Form and fresh air games

Two things make selection more than a ratings lookup.

**Form** is a 0-100 read on how a player is going right now, moved by what he
has actually done rather than what his ratings say he should do. Fifty is
neutral. A batting or bowling performance is scored against a par that scales
with his ability — thirty from the number nine is a good day and a failure from
your best batter — and an exponential average means one innings nudges rather
than resets.

**Anyone who doesn't play goes stale.** Form used to drift back toward neutral
when you sat someone out, which made dropping your out-of-nick batter the
cheapest way to fix him — the exact opposite of how it works. Idle players now
lose ground instead, down to a floor around "out of nick" that a long injury
can't take them past. The consequence is the interesting bit: **the only way
back into form is to play**. Carrying a struggling batter until he comes good
is a real decision with a real cost, rather than something the bench does for
free. Over a season the regulars sit near fifty and anyone who never gets a
game settles on the floor.

It shows on the selection row as a band (ON FIRE / IN FORM / STEADY / OUT OF
NICK / STRUGGLING) and there's a `FORM` sort. In the simulation it replaces the
hidden per-innings roll, and it bites: the same side at form 80 scores about
**70 more per innings** than at form 20. Neutral form is exactly 1.0, so
friendlies — which have no history — play precisely as they always did.

**A fresh air game** is a player you picked who then neither faced a ball nor
bowled one. He gave up his Saturday, put his whites on and did nothing, and club
cricketers do not take that well: he may walk out for two to four weeks.

It doesn't fire every time — a short chase can leave three players idle, and
removing three a week would empty the squad by August — but it escalates:
**30% first offence, 55% second, 80% third**. About 1.3 fresh air games a match,
five or six walk-outs a season. Both numbers are one constant each in
[`src/engine/freshair.ts`](src/engine/freshair.ts).

You get warned first. The batting-order screen knows who bowled, so it flags
anyone batting low who didn't get a spell. This is the reason dropping preferred
batting positions matters: you're free to bat anyone anywhere, and now you have
a reason to care where.

## Season stats

The season screen has a `STATS` button: batting (M, I, runs, HS, average, strike
rate), bowling (overs, maidens, runs, wickets, average, economy, best figures),
fielding (catches, stumpings, run outs), each with the player's current form,
plus a fresh air games table so you can see who you've been letting down.

## The season

`src/data/league.ts` holds the ten Division 6 West clubs and their real 2025
finishing order. Nine fixtures, single round-robin. Win 20, tie 10, plus a
bonus point per fifty runs (max 4) and per two wickets (max 5); net run rate
breaks ties, with a side bowled out charged the full quota of overs.

The other four fixtures each round are simulated headlessly, so the table moves
around you.

**On difficulty.** Bagshot really finished 7th of 10. Pitching the league so an
auto-picked side lands there needed the opposition so strong that the title was
a 1-in-50 shot — accurate, but not a game. It's tuned instead so a well-managed
Bagshot is around 4th-5th: top four a bit over half of seasons, champions
roughly one in nine, and still capable of a bad year. The real 7th is the
benchmark shown on the table for you to beat.

One constant, `DIVISION_BASELINE`, controls it, and it has moved twice to hold
that difficulty as the game gained mechanics — down when availability landed,
back up when form did. A strong side in form compounds.

## Friendlies

Real Surrey Cricket Championship club names across four difficulty tiers, from
local derbies (Camberley, Valley End, Woking & Horsell) up to the Premier
Division (Wimbledon, Reigate Priory, Banstead).

**The opposition players and their ratings are entirely invented** — fictional
names generated from a hash of the club name, so a given opponent always fields
the same XI. No real cricketer is depicted. This is an unofficial fan-made
game with no affiliation to any club, league or player.

The tiers are tuned against Bagshot's actual best XI, which is a strong side by
the game's own scale (BAT 83, BWL 86, against a league average of 60):

| Tier | Bagshot win rate |
|---|--:|
| Local derby | 96% |
| Mid-table | 92% |
| Promotion push | 66% |
| Premier Division | 45% |

So the local games are a run-out and the Premier sides will beat you more often
than not. Mid-table is deliberately left at par — it's the anchor the engine's
absolute calibration is measured against, so moving it would move the
goalposts.

---

## The engine

`src/engine/` — deliberately UI-free, so it can be exercised headlessly.

| | |
|---|---|
| `innings.ts` | The ball-by-ball engine. **Both innings run through it** — the only difference is whether a target is set. |
| `match.ts` | Bowl-first-then-bat orchestration, result, margin, man of the match. |
| `rota.ts` | Over allocation → a legal over-by-over rota, with an exact feasibility guard for the no-consecutive-overs rule. |
| `ratings.ts` | 0-100 ratings → simulation multipliers, plus per-innings form. |
| `ai.ts` | Auto XI selection and batting order, used for the opposition and the AUTO buttons. |
| `season.ts` | Fixtures, league table, points and net run rate for Division 6 West. |
| `availability.ts` | Who's away, injured or sulking, and the running team-news log. |
| `form.ts` | Rolling form from recent performances, and its simulation multiplier. |
| `freshair.ts` | Players who did nothing all day, and whether they walk out over it. |
| `dls.ts` | Duckworth-Lewis Standard Edition resource table and par scores. |
| `rng.ts` | Seeded PRNG — every match is a pure function of its seed, shown on the result screen. |

Cricketers are streaky, so each player rolls a form multiplier for the innings:
roughly a third turn up with nothing, one in six is unplayable that day.

### Calibration

`npm run bench` runs 2000 headless matches and asserts the aggregate output
looks like 45-over club cricket rather than a video game. Current numbers:

```
median first innings   174        run rate            4.05
10th / 90th pct        122 / 215  wickets lost        7.70
all-out rate           39.8%      extras             11.7
ducks per innings      0.99       fifties per innings 0.71
mean top score         55.8       hundreds/innings    0.04
```

These are measured **par club against par club**, never against Bagshot — so
editing the squad can't move the calibration.

**This is pitched at Division 6 West, not at good limited-overs cricket.** The
engine used to produce a median of 219 at nearly five an over, which is a fine
number for a decent standard and far too rich for this league: only a fifth of
innings landed in the 160-200 band and a quarter cleared 250. Boundaries took
most of the cut — village outfields are slow and the ropes are long, so runs
come in ones far more than in fours. Playing the real Div 6 West clubs against
each other now gives a median of 178, with **48% of innings between 160 and
200** and 250-plus down from a quarter of all innings to one in a hundred.

It also checks that better ratings win more often, that no bowler exceeds nine
overs or bowls consecutively, that lopsided allocations can't produce an
illegal rota, that the DLS resource table is monotonic and pars correctly at
both ends of an innings, that swing fires inside its window and nowhere else,
that an availability score means what it says at every point on the scale, that
form stays in range and actually changes what you score, that fresh air games
and walk-outs can never leave you unable to field a legal XI, and that a season
lands in the intended difficulty band.

Five of them keep the *display* honest rather than the simulation: the
scorebook strip must reconcile with its own over, the crease snapshot can never
show a batter already out, the rota preview must name the bowler who really
bowls, **window counts are honoured exactly, 100% of the time**, and **bowlers
bowl in spells** — averaging seven-and-a-half unbroken overs from one end
rather than being rotated one over at a time.

Those last two are scar tissue. The first model asked for a *preference*, which
the rota treated as a hint, so 16% of overs were bowled outside the window you
picked and nothing said so. The fix for that was explicit spells, which was
honest but made the screen twelve phone-screens long — and, because the rota
underneath was rotating five bowlers an over at a time, rendered as thirty
one-over "spells". Counts per window are both honest and three numbers you can
read at a glance; the tandem rule is what makes them describe real spells.

Batting intent has its own two. One asserts the trade is **player-dependent** —
a striker's exchange rate of runs for risk has to be several times better than a
tailender's — which is the check that would have failed the first version, where
one multiplier was applied to everybody regardless of who was holding the bat.
The other asserts that **re-simulating with a fuller plan leaves the earlier
overs untouched**, ball for ball. The whole drinks-break design rests on that:
each decision re-runs the innings from scratch, and it would be a cheat if the
overs you had already watched quietly changed underneath you.

Three of them keep the display honest rather than the simulation: the scorebook
strip has to reconcile with its own over — six legal balls, wickets and runs
matching the summary — the crease snapshot can never show a batter who is
already out, and the rota preview on the plan screen has to name the bowler who
really bowls each over. A preview that lied would be worse than no preview.

All 54 checks pass.

The mirror-match check plays a side against itself: the chasing side wins 55.5%,
in line with real limited-overs cricket, where knowing the target is worth
something.

---

## Theme

Colours live in [`src/theme.ts`](src/theme.ts) and nothing else hardcodes one —
swap those hex values for the real club colours and the whole game re-skins.
