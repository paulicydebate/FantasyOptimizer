# Fantasy Roster Optimizer

A client-side web app that finds the highest-scoring fantasy roster you can build within a budget, given your own player cost and projection data.

## How it works

1. **Upload** a CSV export of your player pool (name, position, auction cost, projected points, and optionally team).
2. **Map columns** — the app guesses which spreadsheet column is which field; adjust if needed.
3. **Configure your roster**: set your total budget and define roster slots (e.g. QB x1, RB x2, WR x2, FLEX x1 eligible for RB/WR/TE, etc.). Slot positions are driven entirely by whatever positions appear in your data, so this works for any sport.
4. **Lock in required players**: check "Require" on any player in the table to guarantee they're included in the generated roster.
5. **Generate the optimal roster**: the app solves an integer program (maximize total projected points, subject to the budget, one player per slot, each player used at most once, and any required players) and shows you the resulting roster, total cost, and total points.

Everything runs in the browser — no backend, no server-side data storage. Nothing you upload leaves your machine.

## Tech

- React + TypeScript + Vite
- [PapaParse](https://www.papaparse.com/) for CSV parsing
- [glpk.js](https://github.com/jvail/glpk.js) (GLPK compiled to WebAssembly) for solving the roster as a mixed-integer program

## Development

```sh
npm install
npm run dev
```

Build for production:

```sh
npm run build
```

The `dist/` folder is a static site that can be deployed anywhere (Netlify, Vercel, GitHub Pages, S3, etc.) with no server required.

## Lineup CLI (`optimizer/`) — read-only weekly lineups for every league

A pure-Python (3.9+, stdlib only) command-line tool that recommends the optimal starting lineup in
every Sleeper league for a user plus one ESPN league. **It never changes a lineup**: every network
call is an HTTP GET, and output is advice to apply by hand (or by an agent such as JJZ).

```bash
# live: Sleeper leagues for the user, current week from Sleeper state, ESPN via cookies
export ESPN_S2=...  ESPN_SWID='{...}'        # omit both to skip ESPN with a warning
python -m optimizer lineups \
  --lateround /path/lateround_weekly.json --fantasylabs /path/fantasylabs_weekly.json
python -m optimizer lineups --json --league "metal"   # one league, machine-readable
python -m optimizer lineups --week 9 --w-lr 0.6 --w-fl 0.4
```

| Flag | Default | Meaning |
|---|---|---|
| `--user-id` | `1254688196034306048` (`SLEEPER_USER_ID`) | Sleeper user whose leagues are read |
| `--exclude-league` | none (all leagues included) | League id to exclude (repeatable) |
| `--espn-league` | `67205459` | ESPN league (needs `ESPN_S2` + `ESPN_SWID`) |
| `--week` / `--season` | Sleeper `/state/nfl` | Override week/season |
| `--lateround` / `--fantasylabs` | `lateround_weekly.json` / `fantasylabs_weekly.json` (env `LATEROUND_WEEKLY`, `FANTASYLABS_WEEKLY`) | Ranking files |
| `--w-lr` / `--w-fl` | `0.7` / `0.3` | Blend weights |
| `--allow-stale` | off | Bypass the same-day (PT) LateRound freshness guard (exit code 2 otherwise) |
| `--league` | all | Substring filter on league id or name |
| `--json` | off | JSON output |
| `--state-file --players-file --sleeper-snapshot --espn-snapshot --schedule-file` | live | Offline snapshots (tests/replays) |

Rules: starters on bye, OUT / IR / Doubtful / PUP / suspended are never started; players whose
game has kicked off are frozen in place; slots come from each league's own roster settings
(QB/RB/WR/TE/K/DEF/FLEX/SUPER_FLEX/WRRB_FLEX/REC_FLEX); assignment is an exact max-weight
(Hungarian) solve, not greedy. Score = `w_lr * LR_pts + w_fl * FL_pts`, where LateRound's positional
rank is converted to points via FantasyLabs' positional points curve.

LateRound refresh: no browser login is needed. Same-day LateRound updates are posted in the
LateRound Discord; the operator (JJZ) copies them into `lateround_weekly.json` (with today's PT
`fetched_date`) before running. The CLI refuses rankings not dated today.

Tests (no network): `python -m unittest discover -s optimizer/tests -t .`
