"""python -m optimizer.cli lineups [...]  -- recommend (never set) optimal lineups across all leagues."""
import argparse
import json
import os
import sys

from . import rankings as R
from . import sources as S
from .lineup import optimize

DEFAULT_USER = "1254688196034306048"
DEFAULT_ESPN = "67205459"
DEFAULT_ESPN_TEAM = 14
DEF_ALIASES = {"JAX": ["jac"], "WAS": ["wsh"], "LAR": ["la"]}


def build_parser():
    ap = argparse.ArgumentParser(prog="optimizer", description="Read-only lineup recommender (Sleeper + ESPN).")
    ap.add_argument("--user-id", default=os.environ.get("SLEEPER_USER_ID", DEFAULT_USER))
    ap.add_argument("--exclude-league", action="append", default=[],
                    help="league id to exclude (repeatable; default: none, every league is included)")
    ap.add_argument("--league", help="only leagues whose id or name contains this (case-insensitive)")
    ap.add_argument("--week", type=int, help="override current NFL week (default: Sleeper state)")
    ap.add_argument("--season", help="override season (default: Sleeper state)")
    ap.add_argument("--lateround", default=os.environ.get("LATEROUND_WEEKLY", "lateround_weekly.json"))
    ap.add_argument("--fantasylabs", default=os.environ.get("FANTASYLABS_WEEKLY", "fantasylabs_weekly.json"))
    ap.add_argument("--w-lr", type=float, default=0.7, help="LateRound weight (default 0.7)")
    ap.add_argument("--w-fl", type=float, default=0.3, help="FantasyLabs weight (default 0.3)")
    ap.add_argument("--allow-stale", action="store_true", help="skip the same-day LateRound freshness guard")
    ap.add_argument("--today", help=argparse.SUPPRESS)
    ap.add_argument("--espn-league", default=DEFAULT_ESPN)
    ap.add_argument("--espn-team", type=int, default=DEFAULT_ESPN_TEAM, help="team id for --espn-snapshot")
    ap.add_argument("--no-espn", action="store_true")
    # offline snapshots (tests, replays); any omitted source is fetched live with read-only GETs
    ap.add_argument("--state-file"); ap.add_argument("--players-file"); ap.add_argument("--sleeper-snapshot")
    ap.add_argument("--espn-snapshot"); ap.add_argument("--schedule-file")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    return ap


def _pjson(p):
    return None if p is None else {k: p.get(k) for k in ("id", "name", "pos", "team", "status", "score")}


def run(args, out=sys.stdout):
    if abs(args.w_lr + args.w_fl - 1.0) > 1e-6:
        S.warn(f"weights sum to {args.w_lr + args.w_fl}, not 1.0")
    rk = R.load(args.lateround, args.fantasylabs, args.w_lr, args.w_fl, args.allow_stale, args.today)
    state = S.sleeper_state(args.state_file)
    week = args.week or int(state.get("week") or state.get("display_week"))
    season = args.season or state.get("season") or state.get("league_season")
    playing, locked = S.schedule_week(week, args.schedule_file)
    bye = set(S.TEAM_NAMES) - playing if playing else set()

    teams = []
    pdb = S.sleeper_players(args.players_file)
    skip = set(args.exclude_league or [])
    for entry in S.sleeper_leagues(args.user_id, season, args.sleeper_snapshot):
        if entry["league"]["league_id"] in skip:
            continue
        t = S.sleeper_team(entry, args.user_id, pdb)
        if t is None:
            S.warn(f"user not on a roster in Sleeper league {entry['league']['league_id']}")
        else:
            teams.append(t)
    if not args.no_espn:
        if args.espn_snapshot:
            if args.espn_league not in skip:
                teams.append(S.espn_team_snapshot(args.espn_snapshot, args.espn_team))
        else:
            s2, swid = os.environ.get("ESPN_S2"), os.environ.get("ESPN_SWID") or os.environ.get("SWID")
            if args.espn_league in skip:
                pass
            elif not (s2 and swid):
                S.warn("ESPN_S2 / ESPN_SWID not set; skipping ESPN league")
            else:
                try:
                    teams.append(S.espn_team_live(args.espn_league, season, s2, swid))
                except Exception as e:  # noqa: BLE001
                    S.warn(f"ESPN fetch failed ({e}); skipping ESPN league")
    if args.league:
        f = args.league.lower()
        teams = [t for t in teams if f in t["league_id"] or f in t["name"].lower()]

    results = []
    for t in teams:
        for p in t["players"]:
            extra = [p["team"].lower()] + DEF_ALIASES.get(p["team"], []) if p["pos"] == "DEF" else []
            p["score"] = rk.score(p["name"], p["pos"], None, extra)
        r = optimize(t["players"], t["slots"], bye, locked, t["current"])
        results.append((t, r))

    meta = {"week": week, "season": season, "weights": {"lateround": args.w_lr, "fantasylabs": args.w_fl},
            "lateround_updated": rk.lr_updated, "bye_teams": sorted(bye), "locked_teams": sorted(locked)}
    if args.json:
        json.dump({**meta, "read_only": True, "leagues": [{
            "platform": t["platform"], "league_id": t["league_id"], "name": t["name"],
            "action_needed": bool(r["slot_changes"]), "current_pts": r["current_pts"],
            "optimal_pts": r["optimal_pts"],
            "lineup": [{"slot": s, "player": _pjson(p)} for s, p in r["lineup"]],
            "bench": [_pjson(p) for p in r["bench"]], "start": [_pjson(p) for p in r["start"]],
            "slot_changes": [{"slot": s, "from": _pjson(a), "to": _pjson(b)} for s, a, b in r["slot_changes"]],
            "alerts": r["alerts"]} for t, r in results]}, out, indent=1)
        out.write("\n")
        return results
    act = [x for x in results if x[1]["slot_changes"]]
    w = f"{int(args.w_lr * 100)}/{int(args.w_fl * 100)}"
    out.write(f"=== Week {week} lineups ({w} LateRound/FantasyLabs, LR {rk.lr_updated}) - {len(results)} leagues ===\n")
    out.write(f"Action needed: {len(act)} | Already optimal: {len(results) - len(act)} | "
              f"Byes: {', '.join(sorted(bye)) or 'none'} | Locked (kicked off): {', '.join(sorted(locked)) or 'none'}\n")
    out.write("READ-ONLY: nothing was changed. Apply moves in the app.\n\n")
    for t, r in results:
        tag = "ACTION NEEDED" if r["slot_changes"] else "OPTIMAL"
        out.write(f"## [{tag}] {t['name']} ({t['platform']} {t['league_id']}) "
                  f"proj {r['current_pts']} -> {r['optimal_pts']}\n")
        for p in r["bench"]:
            out.write(f"   - BENCH {p['name']} ({p['pos']} {p['team']}, {p.get('score')})\n")
        for p in r["start"]:
            slot = next(s for s, q in r["lineup"] if q is p)
            out.write(f"   - START {p['name']} ({p['pos']} {p['team']}, {p.get('score')}) at {slot}\n")
        moved = [(s, b) for s, a, b in r["slot_changes"] if b and b not in r["start"]]
        for s, b in moved:
            out.write(f"   - MOVE  {b['name']} -> {s}\n")
        for a in r["alerts"]:
            out.write(f"   ! {a}\n")
        out.write("\n")
    return results


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] == "lineups":
        argv = argv[1:]
    args = build_parser().parse_args(argv)
    try:
        run(args)
    except R.StaleRankingsError as e:
        print(f"REFUSING: {e}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
