# Bagshot CC — Bowl First, Then Chase

A browser cricket game for Bagshot Cricket Club, in the spirit of
[500-0.com](https://500-0.com/) but as a real match rather than a chase.

You win the toss and bowl. Pick eleven from the squad, give somebody the new
ball, and captain the innings nine overs at a time — then chase whatever they
leave you.

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
best asset. Archie Graham, Derek Budd and Jack Brown have it, and so do a couple
of bowlers at every club you play.

And a flag rather than a rating: **`OPENER`**, meaning he can see off the new
ball. Whoever is facing in the first dozen overs *without* it carries about a
third more risk, fading as the shine goes — and it applies to whoever is at the
crease, not to slots one and two, so losing both openers cheaply exposes your
number four whether you planned it or not.

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

Instructions are therefore **per batter**, not per side — telling your set
striker to attack shouldn't also tell the number nine who has just walked in to
attack. Each man at the crease gets his own row of four and his own numbers, and
they're stamped with the ball they were given on: an order at over 27 can never
reach back and change over 3.

Anyone you haven't spoken to reads the game for himself, and **how set he is**
is part of that read — a new man plays himself in unless the rate genuinely
won't wait. So the two ends are on different instructions even when you let the
default ride.

### Seam and spin

Whether a bowler is **pace** or **spin** changes what he does with the same
ratings. It used to be decoration — flipping every bowler's type produced
literally identical innings — and now it decides when he's worth having:

| per over | powerplay | middle | death |
|---|---|---|---|
| **pace** | 5.51 econ · 0.13 wkts | 4.16 · 0.11 | 3.81 · 0.28 |
| **spin** | 6.58 econ · 0.08 wkts | **3.75 · 0.15** | 4.47 · 0.18 |

A seamer owns the new ball and the death and leaks through the middle once the
shine has gone. A spinner is the opposite: carted at either end, but through the
middle he's both cheaper *and* takes half again as many wickets. Across a whole
innings the two are within a couple of runs of each other, so this is about when
you bowl someone, not who's better.

Together with swing, that's what makes the bowling a decision. A good deployment
— swing on the new ball, spin squeezing the middle, your strike bowlers at the
death — is worth about **20 runs** against working down the list by bowling
average. It used to be two and a half runs for the whole screen, which is why
the attack screen was rebuilt twice before anyone noticed the problem wasn't the
interface.

### Getting in

The other thing that decides an innings is how long you've been there. A batter
is at his most vulnerable on arrival and roughly **half as easy to dismiss once
he's in** — and most of that is won early:

| balls faced | 0 | 3 | 6 | 12 | 18 | 26+ |
|---|---|---|---|---|---|---|
| **settled** | 0.00 | 0.22 | 0.41 | 0.71 | 0.91 | 1.00 |

Scoring comes back on a separate and much faster curve — he'll nudge a single
off his third ball long before he's happy driving. Tying the two together
produced a 22% duck rate, because a new man sat on nought for twenty balls,
which is twenty chances to be dismissed for nought.

Past that, concentration lapses: risk creeps back about 0.7% a ball once he's
set. Getting out having got in is the most familiar dismissal there is, and
without it the innings came out polarised — a bulge of single figures and a
handful of ninety-odds, with nothing in the twenties and thirties where club
cricket actually lives.

This is what makes the **field** a decision rather than a dial, and why the
attack screen shows you how set the two men are before it asks. It's also why
play stops the moment a wicket falls rather than at the end of the over: a new
batter is the cheapest wicket in the game and the instruction has to reach the
field before his first ball, not his sixth.

### The field

Where the fielders go, set at every nine-over mark and at every wicket — the
bowling side's half of the intent decision. The ladder is how many men are up:
**SPREAD · CONTAIN · PRESS · ATTACK**. Bring them in and you buy chances at the
cost of the gaps behind them; push them back and you save the boundary but
concede the single and never get him out. A ring field is the tightest thing
there is, which is what stops SPREAD being a strictly better CONTAIN.

It works the same way intent does — the setting is how many men are up, not how
many wickets you get, and turning that into wickets takes ATT while surviving
the gaps takes DEF:

| told to ATTACK | wickets | boundaries |
|---|---|---|
| an 88-ATT strike bowler | **+44%** | +22% |
| a 45-ATT part-timer | +21% | +22% |

And it depends just as much on who's in. Men round the bat are a bargain
against someone who has just walked out and an indulgence against someone set —
he'll simply hit through the gaps you've left. Without that, attacking was
flatly the best field at every moment of every innings, which is no decision at
all.

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
  opener: false,                          // optional — can face the new ball
  bat:  { skill: 79, pwr: 93 },
  bowl: { def: 81, att: 76 },
}
```

One field isn't in the source table: **`bowlType`**, set to `spin` for the spin
roles and `pace` otherwise.

There is **no preferred batting position** — bat anyone anywhere. The one
exception is the top of the order: five players are marked `opener` (Grinstead,
Doyle, Funnell, Michael Davis and Gandhi), which is a guess from the ratings and
the role labels rather than anything the club told me. **Correct them** with the
`OPENER` toggle on the squad screen. Five are marked rather than two so a couple
of Saturday absences can't leave you without one. What you also need to watch is
that everyone you pick gets a go; see fresh air games below.

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
   rather than filled with silent replacements. The team sheet is always eleven
   slots, so a hole in the side has somewhere to live and is impossible to miss.
   Every change is two taps and lands **in place**: pick a man up — off the sheet
   or out of the squad — then tap where he bats or who he replaces. Both
   directions work, so tapping a squad player when you already have eleven arms
   him and asks who he's coming in for rather than quietly doing nothing.
   Dropping someone with `✕` leaves his number open and the next man you pick
   walks into it, instead of arriving at eleven and needing eight taps to get
   back. `▲▼` still nudge one place at a time, and `CLEAR` empties the sheet if
   you want to start again. Anyone unavailable is hidden by default
   — one toggle brings them back if you want to see what you're missing. You
   need a keeper and at least five who can bowl. Openers carry an `OP` next to
   their name, and the screen says so if you've pushed someone up who isn't one.
   `AUTO` picks a legal side that also has a **shape**: a keeper, two new-ball
   bowlers, a spinner, five bowlers all told, and two openers. Ranking on raw
   bowling index instead — which is what it used to do — hands you five seamers
   and no spinner, and half the bowling stops mattering.
2. **The new ball** — who bowls the first nine overs, and where the fielders
   stand for them. Nine overs, not forty-five: no captain plans a whole innings
   before a ball is bowled, he gives the new ball to two men and decides the
   next spell from what he's just watched. The block has to come out exact, so
   the counter turns gold only when it adds up, and the counts are honoured to
   the over. A preview strip shows the **over-by-over rota you'll actually
   get** — seeded from the match itself, so it isn't an estimate. Bowlers work
   in tandem from either end, so they bowl proper spells rather than one over
   each in rotation.
3. **Fielding innings** — they bat, and it **stops every nine overs** so you can
   pick the next spell. Each break shows the score, who's in and **how set they
   are**, **every bowler's figures so far** (`4-0-18-2`, coloured by what it's
   costing), what he has left, and who bowled the last over — he can't open the
   next block. The same screen four more times: first change, middle overs, the
   squeeze, the death.

   It also **stops the moment a wicket falls**, mid-over, on a compact card: who
   went, who's in, and where you want the fielders for him. That's the point of
   stopping there rather than at the end of the over — a new batter is the
   cheapest wicket in the game and the field has to be set before his first ball.

   The scoreboard carries the two men at the crease, and the feed runs a
   scorebook strip for every over (`. 1 4 . W 2`), so every single ball is
   visible; an over interrupted by a wicket shows only what's been bowled and
   fills in when you play on. Pause, run it at 4×, or skip it entirely.
4. **Interval** — your order shown back with the target now known, and how the
   openers play the first nine overs.
5. **The chase** — you bat, and the innings **stops for drinks every nine overs
   and every time you lose a wicket**. A drinks break shows the score, the asking
   rate, the DLS par and both men in, then asks how **each of them** plays the
   next nine: **defend, build, push, attack**, one row per batter with his own
   numbers. A wicket gets the same compact card the fielding innings does — who's
   out, who's in, and what the new man is to do about it.

   There is no autopilot underneath — tell them to block out a chase you could
   have won and they will. A **DLS par score** runs alongside the required rate,
   because par prices in wickets as well as balls: nine down and level with the
   rate is not level at all.
6. **Result** — both scorecards, bowling figures, fall of wickets, and a man of
   the match.

The phone's back gesture steps back through the app rather than leaving it.
Once an innings has been bowled there's deliberately no route back into
selection — re-picking after seeing the total would be bowling it twice — and
none out of a break, because the overs behind it have already been bowled. Back
during a sim skips to the end of that innings instead.

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
median first innings   172        run rate            3.98
10th / 90th pct        100 / 208  wickets lost        7.65
all-out rate           46.2%      extras             11.6
ducks per innings      1.35       fifties per innings 0.83
median batter score      7        50+ per batting card 11%
```

These are measured **par club against par club**, never against Bagshot — so
editing the squad can't move the calibration.

**This is pitched at Division 6 West, not at good limited-overs cricket.** The
engine used to produce a median of 219 at nearly five an over, which is a fine
number for a decent standard and far too rich for this league: only a fifth of
innings landed in the 160-200 band and a quarter cleared 250. Boundaries took
most of the cut — village outfields are slow and the ropes are long, so runs
come in ones far more than in fours. Playing the real Div 6 West clubs against
each other now gives a median of 168, with **42% of innings between 160 and
200** and 250-plus down from a quarter of all innings to one in a hundred and
fifty.

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
bowls, **block counts are honoured exactly, 100% of the time**, and **bowlers
bowl in spells** — averaging several unbroken overs from one end rather than
being rotated one over at a time.

Those last two are scar tissue. The first model asked for a *preference*, which
the rota treated as a hint, so 16% of overs were bowled outside the window you
picked and nothing said so. The fix for that was explicit spells, which was
honest but made the screen twelve phone-screens long — and, because the rota
underneath was rotating five bowlers an over at a time, rendered as thirty
one-over "spells". Then counts per third of the innings, readable but still
asking you to plan forty-five overs blind. Nine overs at a time is the answer to
all three; the tandem rule is what makes them describe real spells.

The live version needs one more guarantee, and it's the one the whole design
rests on: **a decision can never re-bowl what came before it**. Each block's
rota is dealt from its own seeded stream for exactly that reason, and every
player's form roll comes from a private stream too — drawing them from the ball
sequence meant bringing on a sixth bowler at the twenty-seventh over shifted
every delivery back to the first, silently rewriting overs you had already
watched. Instructions are an append-only log stamped in *balls* rather than
overs, so the same holds at a wicket that falls mid-over.

That last one can't be checked ball for ball, and it's worth saying why: an
order moves the *probabilities*, not the outcomes. The same roll often lands in
the same bucket either way, so "the next ball must differ" fails two thirds of
the time for a perfectly correct engine. What the check does instead is give the
same order at the wicket and at the end of that over, and assert the two innings
diverge — which catches the thing worth catching, an order that quietly doesn't
apply until the next over.

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
already out, and the rota preview on the attack screen has to name the bowler who
really bowls each over. A preview that lied would be worse than no preview.

Then the ones that would have caught the attack screen being decorative:
**deployment has to be worth having** — a good plan against working down the
list, same five bowlers, only the timing differing — and **pace and spin have to
stay level** across a whole innings, so widening the phase table can never
quietly make one type flatly better and collapse the plan into "pick the good
bowlers". Nothing in the suite noticed the first problem, which is how it
survived two rebuilds of the screen. Alongside them, six checks on the shape of
the suggested XI, and two on openers: pushing a non-opener up has to cost runs,
and marking the *tail* as openers has to change nothing at all — otherwise the
penalty has become a flat tax on not being an opener rather than a new ball a
specialist sees off.

The field has its own five, in the same shape as intent: it has to be worth real
runs, **no setting can run away with it**, a ring field has to be the tightest,
and attacking has to pay a strike bowler substantially more than a part-timer.

And six on the shape of a batting innings. These are the ones where it's easiest
to fool yourself, because the aggregate totals can be perfect while every
individual score is wrong. The first version of this block had *professional*
numbers in it — a median of twelve, one duck in ten dismissals. Work it out from
a real card instead: a side bowled out for 175 has ten dismissed batters sharing
about 160 off the bat, and club cards are heavily right-skewed. 45, 38, 22, 15,
8, 6, 4, 3, 1, 0, 0 is an utterly ordinary Saturday, and its median is 6 with two
ducks in ten. Chasing a median of twelve would have meant an engine nobody gets
out in. What the checks actually hold is the *shape*: single figures common but
not the whole innings, fifties an event, and — the one that was genuinely broken
before confidence existed — **the top three outscoring the middle order**, which
they have to, because openers face by far the most deliveries.

All 103 checks pass.

The mirror-match check plays a side against itself: the chasing side wins ~55%,
in line with real limited-overs cricket, where knowing the target is worth
something.

---

## Theme

Colours live in [`src/theme.ts`](src/theme.ts) and nothing else hardcodes one —
swap those hex values for the real club colours and the whole game re-skins.
