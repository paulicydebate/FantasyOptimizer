"""Read-only data sources. Every network call is an HTTP GET; nothing here can change a lineup."""
import json
import os
import sys
import urllib.request

SLEEPER = "https://api.sleeper.app/v1"
ESPN_READS = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}/segments/0/leagues/{lid}"
ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week={week}&seasontype=2"

TEAM_NAMES = {
    "ARI": "Arizona Cardinals", "ATL": "Atlanta Falcons", "BAL": "Baltimore Ravens", "BUF": "Buffalo Bills",
    "CAR": "Carolina Panthers", "CHI": "Chicago Bears", "CIN": "Cincinnati Bengals", "CLE": "Cleveland Browns",
    "DAL": "Dallas Cowboys", "DEN": "Denver Broncos", "DET": "Detroit Lions", "GB": "Green Bay Packers",
    "HOU": "Houston Texans", "IND": "Indianapolis Colts", "JAX": "Jacksonville Jaguars", "KC": "Kansas City Chiefs",
    "LV": "Las Vegas Raiders", "LAC": "Los Angeles Chargers", "LAR": "Los Angeles Rams", "MIA": "Miami Dolphins",
    "MIN": "Minnesota Vikings", "NE": "New England Patriots", "NO": "New Orleans Saints", "NYG": "New York Giants",
    "NYJ": "New York Jets", "PHI": "Philadelphia Eagles", "PIT": "Pittsburgh Steelers", "SEA": "Seattle Seahawks",
    "SF": "San Francisco 49ers", "TB": "Tampa Bay Buccaneers", "TEN": "Tennessee Titans", "WAS": "Washington Commanders",
}
TEAM_ALIAS = {"JAC": "JAX", "WSH": "WAS", "LA": "LAR", "OAK": "LV"}
ESPN_SLOTS = {0: "QB", 2: "RB", 4: "WR", 6: "TE", 16: "DEF", 17: "K", 23: "FLEX", 7: "SUPER_FLEX",
              3: "RB/WR", 5: "WR/TE", 20: "BN", 21: "IR"}
ESPN_POS = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DEF"}
ESPN_TEAMS = {1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GB", 10: "TEN",
              11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG",
              20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WAS",
              29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU"}


def team(t):
    t = (t or "").upper()
    return TEAM_ALIAS.get(t, t)


def warn(msg):
    print(f"[warn] {msg}", file=sys.stderr)


def get_json(url, headers=None, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": "FantasyOptimizer-lineup-cli", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:  # GET only
        return json.load(r)


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ---------------- Sleeper ----------------
def sleeper_state(path=None):
    return load_json(path) if path else get_json(f"{SLEEPER}/state/nfl")


def sleeper_players(path=None):
    return load_json(path) if path else get_json(f"{SLEEPER}/players/nfl")


def sleeper_leagues(user_id, season, snapshot=None):
    """Returns [{'league','rosters','users'}]. snapshot = file in sleeper_leagues_full.json format."""
    if snapshot:
        return load_json(snapshot)
    out = []
    for lg in get_json(f"{SLEEPER}/user/{user_id}/leagues/nfl/{season}"):
        lid = lg["league_id"]
        out.append({"league": lg, "rosters": get_json(f"{SLEEPER}/league/{lid}/rosters"), "users": []})
    return out


def sleeper_team(entry, user_id, pdb):
    """Normalise one Sleeper league to the common team dict."""
    lg = entry["league"]
    roster = next((r for r in entry["rosters"]
                   if r.get("owner_id") == user_id or user_id in (r.get("co_owners") or [])), None)
    if roster is None:
        return None
    slots = [s for s in lg.get("roster_positions", []) if s not in ("BN", "IR", "TAXI")]
    reserve = set(roster.get("reserve") or []) | set(roster.get("taxi") or [])
    players = []
    for pid in roster.get("players") or []:
        if pid in reserve:
            continue
        p = pdb.get(pid) or {}
        pos = p.get("position") or ("DEF" if pid.isalpha() else "")
        if pos == "DEF" or pid.isalpha():
            t = team(p.get("team") or pid)
            name = TEAM_NAMES.get(t, t)
            pos = "DEF"
        else:
            t = team(p.get("team"))
            name = p.get("full_name") or f"{p.get('first_name', '')} {p.get('last_name', '')}".strip() or pid
        players.append({"id": pid, "name": name, "pos": pos, "team": t, "status": p.get("injury_status")})
    starters = [s if s and s != "0" else None for s in (roster.get("starters") or [])]
    sc = lg.get("scoring_settings") or {}
    return {"platform": "sleeper", "league_id": lg["league_id"], "name": lg.get("name", lg["league_id"]),
            "slots": slots, "current": (starters + [None] * len(slots))[:len(slots)], "players": players,
            "scoring": {"rec": sc.get("rec", 0), "pass_td": sc.get("pass_td", 4),
                        "bonus_rec_te": sc.get("bonus_rec_te", 0)}}


# ---------------- ESPN ----------------
def espn_team_live(league_id, season, s2, swid):
    url = ESPN_READS.format(season=season, lid=league_id) + "?view=mRoster&view=mSettings&view=mTeam"
    d = get_json(url, headers={"Cookie": f"espn_s2={s2}; SWID={swid}"})
    me = next(t for t in d["teams"] if swid.strip("{}").upper() in
              [o.strip("{}").upper() for o in t.get("owners", [])])
    counts = d["settings"]["rosterSettings"]["lineupSlotCounts"]
    slots = []
    for sid, n in sorted(((int(k), v) for k, v in counts.items())):
        if n and ESPN_SLOTS.get(sid) not in (None, "BN", "IR"):
            slots += [ESPN_SLOTS[sid]] * n
    players, cur_by_slot = [], {}
    for e in me["roster"]["entries"]:
        pp = e["playerPoolEntry"]["player"]
        pos = ESPN_POS.get(pp.get("defaultPositionId"), "")
        slot = ESPN_SLOTS.get(e.get("lineupSlotId"), "BN")
        if slot == "IR":
            continue
        pid = str(pp["id"])
        t = ESPN_TEAMS.get(pp.get("proTeamId"), "")
        name = TEAM_NAMES.get(t, pp.get("fullName")) if pos == "DEF" else pp.get("fullName")
        players.append({"id": pid, "name": name, "pos": pos, "team": t, "status": pp.get("injuryStatus")})
        if slot != "BN":
            cur_by_slot.setdefault(slot, []).append(pid)
    current = [cur_by_slot.get(s, []).pop(0) if cur_by_slot.get(s) else None for s in slots]
    return {"platform": "espn", "league_id": str(league_id), "name": d.get("settings", {}).get("name", str(league_id)),
            "slots": slots, "current": current, "players": players, "scoring": {}}


def espn_team_snapshot(path, team_id):
    """Snapshot format: espn_league_<id>.json produced by the rosters-page scrape (teams[].players[])."""
    d = load_json(path)
    me = next(t for t in d["teams"] if int(t["teamId"]) == int(team_id))
    slots, current, players = [], [], []
    for i, e in enumerate(me["players"]):
        slot = {"D/ST": "DEF", "Bench": "BN"}.get(e["slot"], e["slot"])
        if slot == "IR" or not e.get("player"):
            if slot not in ("BN", "IR"):
                slots.append(slot); current.append(None)
            continue
        pos = {"D/ST": "DEF"}.get(e["position"], e["position"])
        t = team(e.get("nfl_team"))
        name = TEAM_NAMES.get(t, e["player"]) if pos == "DEF" else e["player"]
        pid = f"espn-{i}-{e['player']}"
        players.append({"id": pid, "name": name, "pos": pos, "team": t, "status": e.get("injury_status")})
        if slot != "BN":
            slots.append(slot); current.append(pid)
    return {"platform": "espn", "league_id": str(d.get("leagueId")), "name": d.get("league_name", ""),
            "slots": slots, "current": current, "players": players, "scoring": {}}


# ---------------- schedule: byes + games already started ----------------
def schedule_week(week, path=None, now_status=None):
    """Returns (teams_playing, teams_locked). File = sleeper_nfl_schedule.json format
    [{week, home, away, status}] where status != 'pre_game' means kicked off. Live = ESPN scoreboard."""
    playing, locked = set(), set()
    if path:
        for g in load_json(path):
            if int(g.get("week", -1)) != int(week):
                continue
            for side in ("home", "away"):
                playing.add(team(g[side]))
                if g.get("status") not in ("pre_game", "scheduled", None):
                    locked.add(team(g[side]))
        return playing, locked
    d = get_json(ESPN_SCOREBOARD.format(week=week))
    for ev in d.get("events", []):
        state = ev.get("status", {}).get("type", {}).get("state")
        for c in ev["competitions"][0]["competitors"]:
            t = team(c["team"]["abbreviation"])
            playing.add(t)
            if state != "pre":
                locked.add(t)
    return playing, locked
