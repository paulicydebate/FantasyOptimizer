"""Load LateRound weekly + FantasyLabs weekly projections and blend them (default 70/30)."""
import datetime
import json
import re

POSITIONS = ("QB", "RB", "WR", "TE", "K", "DEF")
SUFFIX = re.compile(r"\b(jr|sr|ii|iii|iv|v)\b")


class StaleRankingsError(RuntimeError):
    pass


def norm_name(n):
    n = (n or "").lower().replace(".", "").replace("'", "").replace("-", " ")
    n = SUFFIX.sub("", n)
    return re.sub(r"\s+", " ", n).strip()


def today_pt():
    try:
        from zoneinfo import ZoneInfo
        return datetime.datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat()
    except Exception:
        return datetime.date.today().isoformat()


def check_fresh(doc, label, today=None):
    """Same-PT-calendar-day guard carried over from ff_engine.ensure_lateround_fresh."""
    today = today or today_pt()
    if doc.get("fetched_date") != today:
        raise StaleRankingsError(
            f"{label} rankings fetched_date={doc.get('fetched_date')!r} is not today ({today}). "
            "Refresh LateRound before setting lineups, or pass --allow-stale for a dry analysis.")


def _num(s, default=None):
    d = re.sub(r"[^0-9.]", "", str(s or ""))
    try:
        return float(d) if d else default
    except ValueError:
        return default


class Rankings:
    def __init__(self, lr_weekly, fl_weekly, w_lr=0.7, w_fl=0.3):
        self.w_lr, self.w_fl = w_lr, w_fl
        self.lr_updated = lr_weekly.get("updated", "")
        self.fl = {p: {} for p in POSITIONS}   # pos -> norm -> (pos_rank, pts)
        curve = {p: [] for p in POSITIONS}
        for r in fl_weekly.get("sean_koerner", []) + fl_weekly.get("consensus", []):
            name = r.get("PlayerName") or r.get('\ufeff"PlayerName"') or ""
            pos = {"D": "DEF", "DST": "DEF"}.get(r.get("Position"), r.get("Position"))
            if pos not in self.fl:
                continue
            nm = norm_name(name)
            if nm in self.fl[pos]:
                continue
            pts = _num(r.get("Points"), 0.0)
            self.fl[pos][nm] = (int(_num(r.get("PositionRank"), 999)), pts)
            for t in (r.get("Team") or "",):
                if pos == "DEF" and t:
                    self.fl[pos].setdefault(t.lower(), (int(_num(r.get("PositionRank"), 999)), pts))
            curve[pos].append(pts)
        self.curve = {p: sorted(v, reverse=True) for p, v in curve.items()}
        self.lr = {p: {} for p in POSITIONS}    # pos -> norm -> (rank, pts or None)
        for pos in POSITIONS:
            for r in lr_weekly.get("positions", {}).get(pos, []):
                rank = int(_num(r.get("rank"), 999))
                pts = None
                keys = [norm_name(r.get("player"))]
                if pos == "DEF" and r.get("team"):
                    keys.append(r["team"].lower())
                for k in keys:
                    self.lr[pos].setdefault(k, (rank, pts))

    def _curve_pts(self, pos, rank):
        c = self.curve.get(pos) or []
        if not c:
            return 0.0
        return c[min(max(int(rank) - 1, 0), len(c) - 1)]

    def _lookup(self, table, pos, keys):
        for k in keys:
            if k and k in table[pos]:
                return table[pos][k]
        return None

    def score(self, name, pos, team=None, def_names=()):
        """Blended projected points: w_lr * LateRound + w_fl * FantasyLabs. LateRound publishes ranks, not
        points (its "total" column is the Vegas implied team total), so a LateRound positional rank is
        converted to points through FantasyLabs' positional points curve (LR WR12 -> FL's 12th-best WR)."""
        if pos not in POSITIONS:
            return None
        keys = [norm_name(name)] + [norm_name(d) for d in def_names] + ([team.lower()] if team else [])
        if pos != "DEF":
            keys = keys[:1]
        lr = self._lookup(self.lr, pos, keys)
        fl = self._lookup(self.fl, pos, keys)
        if pos == "K" and lr is None:  # LateRound kicker list uses last names only
            last = norm_name(name).split(" ")[-1]
            lr = self.lr["K"].get(last)
        lr_pts = None
        if lr:
            lr_pts = self._curve_pts(pos, lr[0])
        fl_pts = fl[1] if fl else None
        if lr_pts is None and fl_pts is None:
            return None
        if lr_pts is None:
            return round(fl_pts, 2)
        if fl_pts is None:
            return round(lr_pts, 2)
        return round(self.w_lr * lr_pts + self.w_fl * fl_pts, 2)


def load(lr_path, fl_path, w_lr=0.7, w_fl=0.3, allow_stale=False, today=None):
    with open(lr_path, encoding="utf-8") as f:
        lr = json.load(f)
    with open(fl_path, encoding="utf-8") as f:
        fl = json.load(f)
    if not allow_stale:
        check_fresh(lr, "LateRound weekly", today)
    return Rankings(lr, fl, w_lr, w_fl)
