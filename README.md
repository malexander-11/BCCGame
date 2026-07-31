# Bagshot CC — Bowl First, Then Chase

A browser cricket game for Bagshot Cricket Club, in the spirit of
[500-0.com](https://500-0.com/) but as a real match rather than a chase.

You win the toss and bowl. Pick eleven from the squad, decide who bowls which
45 overs, watch the opposition bat — and then chase whatever they leave you.

- **45 overs a side**, the Surrey Cricket Championship Saturday league length.
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

Every ball resolves both duels: SKILL against ATT decides whether the batter
survives, PWR against DEF decides how many runs come. That makes the two
bowling ratings genuinely different tools — an ATT-heavy attack buys wickets
but leaks, a DEF-heavy attack strangles but never breaks a set batter, and
deciding when to use each is the game.

Rough guide for a Surrey Championship side:

| Rating | Standard |
|--:|---|
| 85+ | League star, best in the division |
| 75 | First-team regular who wins games on his own |
| 60 | Solid first-teamer — the baseline |
| 45 | Second-team standard |
| 30 | Genuine rabbit, or doesn't bowl |

---

## Entering the real squad

The game ships with **placeholder players** so it runs out of the box. There are
two ways to replace them.

**In the app** — tap *Manage Squad*. Edit names, ratings and batting positions
inline; it saves to the browser and overrides the file. *Export* copies the
squad as JSON, *Import* pastes one back.

**In the code** — edit [`src/data/squad.ts`](src/data/squad.ts):

```ts
{
  id: 'p01',
  name: 'Sam Opener',
  positions: [1, 2],                    // legal batting slots, inclusive
  bat:  { skill: 74, pwr: 62 },
  bowl: { def: 0, att: 0 },             // both 0 = doesn't bowl
  wk: true,                             // optional, wicketkeeper
  bowlType: 'pace',                     // optional, 'pace' | 'spin'
}
```

Any number of players is fine as long as there are at least 11. `positions` is
advisory — you can bat someone outside his range, he just won't be as good at
it, and the scorecard flags him `OOP`.

A squad saved in the browser wins over the file. *Reset to placeholder squad*
clears it.

---

## How a match runs

1. **Selection** — eleven from the squad. You need a keeper and at least five
   who can bowl.
2. **The attack** — share 45 overs between five and seven bowlers, max nine
   each, and give each a spell: new ball, middle, or death. The engine builds
   the over-by-over rota from that, and nobody bowls two overs in a row.
3. **Fielding innings** — they bat. Wickets, drops, maidens, extras and full
   bowling figures. Their total is your target.
4. **Interval** — set your batting order having seen what you have to chase.
5. **The chase** — you bat, with the required rate driving how hard the side
   pushes.
6. **Result** — both scorecards, bowling figures, fall of wickets, and a man of
   the match.

---

## Opposition

Real Surrey Cricket Championship club names across four difficulty tiers, from
local derbies (Camberley, Valley End, Woking & Horsell) up to the Premier
Division (Wimbledon, Reigate Priory, Banstead).

**The opposition players and their ratings are entirely invented** — fictional
names generated from a hash of the club name, so a given opponent always fields
the same XI. No real cricketer is depicted. This is an unofficial fan-made
game with no affiliation to any club, league or player.

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
| `rng.ts` | Seeded PRNG — every match is a pure function of its seed, shown on the result screen. |

Cricketers are streaky, so each player rolls a form multiplier for the innings:
roughly a third turn up with nothing, one in six is unplayable that day.

### Calibration

`npm run bench` runs 2000 headless matches and asserts the aggregate output
looks like 45-over club cricket rather than a video game. Current numbers:

```
median first innings   215        run rate            4.94
10th / 90th pct        153 / 264  wickets lost        7.35
all-out rate           32.6%      extras             11.6
ducks per innings      0.79       fifties per innings 1.19
mean top score         72.3       hundreds/innings    0.18
```

It also checks that better ratings win more often, that no bowler exceeds nine
overs or bowls consecutively, and that runs, wickets and balls reconcile
against the scorecard. All 21 checks pass.

The mirror-match check plays a side against itself: the chasing side wins 55.5%,
in line with real limited-overs cricket, where knowing the target is worth
something.

---

## Theme

Colours live in [`src/theme.ts`](src/theme.ts) and nothing else hardcodes one —
swap those hex values for the real club colours and the whole game re-skins.
