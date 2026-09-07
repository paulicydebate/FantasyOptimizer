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
