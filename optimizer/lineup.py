"""Pure lineup optimisation: eligibility, byes/injuries/locks, exact slot assignment, swap diff."""
from .assign import hungarian_max

SLOT_ELIGIBLE = {
    "QB": {"QB"}, "RB": {"RB"}, "WR": {"WR"}, "TE": {"TE"}, "K": {"K"}, "DEF": {"DEF"},
    "FLEX": {"RB", "WR", "TE"}, "WRRB_FLEX": {"RB", "WR"}, "REC_FLEX": {"WR", "TE"},
    "SUPER_FLEX": {"QB", "RB", "WR", "TE"}, "OP": {"QB", "RB", "WR", "TE"},
    "RB/WR": {"RB", "WR"}, "WR/TE": {"WR", "TE"}, "RB/WR/TE": {"RB", "WR", "TE"},
    "D/ST": {"DEF"}, "IDP_FLEX": set(),
}
INACTIVE = {"OUT", "O", "IR", "DOUBTFUL", "D", "PUP", "SUS", "NA", "COV"}
EMPTY_PENALTY = -50.0


def is_inactive(status):
    return (status or "").upper() in INACTIVE


def optimize(players, slots, bye_teams=(), locked_teams=(), current_starters=None):
    """players: dicts with id,name,pos,team,status,score (score may be None).
    slots: starting slot names in order. current_starters: player id per slot (None/'0' = empty).
    Players whose team's game started are frozen in their current slot (or on the bench).
    Returns dict(lineup=[(slot, player|None)], swaps=[...], alerts=[...], current_pts, optimal_pts)."""
    current_starters = list(current_starters or [None] * len(slots))
    by_id = {p["id"]: p for p in players}
    bye, locked = set(bye_teams), set(locked_teams)
    alerts = []

    def usable(p):
        return not (p["team"] in bye or not p["team"] or is_inactive(p.get("status")))

    def val(p):
        return p["score"] if p.get("score") is not None else 0.0

    final = [None] * len(slots)
    frozen = set()
    for i, pid in enumerate(current_starters):
        p = by_id.get(pid)
        if p and p["team"] in locked:
            final[i] = p; frozen.add(p["id"])
    for p in players:
        if p["team"] in locked:
            frozen.add(p["id"])
    open_slots = [i for i in range(len(slots)) if final[i] is None]
    pool = [p for p in players if p["id"] not in frozen and usable(p)]
    W = []
    for i in open_slots:
        elig = SLOT_ELIGIBLE.get(slots[i], {slots[i]})
        cur_id = current_starters[i]
        # tiny tie-break bonus keeps a player in his current slot when it costs nothing,
        # so equal-value lineups do not produce pointless slot shuffles
        W.append([(val(p) + (1e-3 if p["id"] == cur_id else 0.0)) if p["pos"] in elig else -1e6
                  for p in pool])
    pick = hungarian_max(W) if pool else [-1] * len(open_slots)
    for i, j in zip(open_slots, pick):
        if 0 <= j < len(pool) and pool[j]["pos"] in SLOT_ELIGIBLE.get(slots[i], {slots[i]}):
            final[i] = pool[j]
    for i, p in enumerate(final):
        if p is None:
            alerts.append(f"No eligible active player for {slots[i]} - waiver/FA add needed")
    cur = [by_id.get(pid) for pid in current_starters]
    for i, p in enumerate(cur):
        if p and not usable(p) and p["id"] not in frozen:
            why = "on bye" if p["team"] in bye else f"status {p.get('status')}"
            alerts.append(f"Current starter {p['name']} ({slots[i]}) is {why}")
    for p in players:
        if (p.get("status") or "").upper() in ("QUESTIONABLE", "Q", "DTD") and p in final:
            alerts.append(f"Monitor questionable starter {p['name']} ({p['pos']} {p['team']})")
    for p in players:
        if p.get("score") is None and p in final:
            alerts.append(f"No LateRound/FantasyLabs ranking found for starter {p['name']}; scored 0")
    cur_ids = {p["id"] for p in cur if p}
    fin_ids = {p["id"] for p in final if p}
    swaps = {
        "bench": [p for p in cur if p and p["id"] not in fin_ids],
        "start": [p for p in final if p and p["id"] not in cur_ids],
    }
    changed = [(slots[i], cur[i], final[i]) for i in range(len(slots))
               if (cur[i] or {}).get("id") != (final[i] or {}).get("id")]
    return {
        "lineup": list(zip(slots, final)),
        "slot_changes": changed,
        "bench": swaps["bench"], "start": swaps["start"],
        "alerts": alerts,
        "current_pts": round(sum(val(p) for p in cur if p and usable(p)), 2),
        "optimal_pts": round(sum(val(p) for p in final if p), 2),
    }
