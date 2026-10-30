import io
import json
import os
import unittest

from optimizer import cli
from optimizer.assign import hungarian_max
from optimizer.lineup import optimize
from optimizer.rankings import Rankings, StaleRankingsError, check_fresh, norm_name

FX = os.path.join(os.path.dirname(__file__), "fixtures")


def P(i, pos, score, team="AAA", status=None):
    return {"id": i, "name": i, "pos": pos, "team": team, "status": status, "score": score}


class AssignTests(unittest.TestCase):
    def test_hungarian_beats_greedy(self):
        # greedy takes col0 for row0 (10) leaving row1 with 1 => 11; optimum 9+8 = 17
        self.assertEqual(hungarian_max([[10, 9], [8, 1]]), [1, 0])

    def test_more_slots_than_players(self):
        self.assertEqual(sorted(hungarian_max([[5], [3]])), [-1, 0])


class OptimizeTests(unittest.TestCase):
    def test_flex_superflex_exact(self):
        ps = [P("qb1", "QB", 20), P("qb2", "QB", 17), P("rb1", "RB", 15), P("wr1", "WR", 14),
              P("te1", "TE", 9), P("wr2", "WR", 12), P("rb2", "RB", 6)]
        r = optimize(ps, ["QB", "RB", "WR", "TE", "FLEX", "SUPER_FLEX"])
        got = {s: p["id"] for s, p in r["lineup"]}
        self.assertEqual(got["SUPER_FLEX"], "qb2")
        self.assertEqual(got["FLEX"], "wr2")
        self.assertAlmostEqual(r["optimal_pts"], 20 + 15 + 14 + 9 + 12 + 17)

    def test_bye_out_doubtful_ir_excluded(self):
        ps = [P("a", "RB", 30, team="HOU"), P("b", "RB", 25, status="Out"), P("c", "RB", 24, status="Doubtful"),
              P("d", "RB", 23, status="IR"), P("e", "RB", 5), P("f", "RB", 22, status="Questionable")]
        r = optimize(ps, ["RB", "RB"], bye_teams={"HOU"})
        self.assertEqual({p["id"] for _, p in r["lineup"]}, {"e", "f"})
        self.assertTrue(any("questionable" in a for a in r["alerts"]))

    def test_locked_players_not_moved(self):
        ps = [P("lockedStarter", "WR", 1, team="KC"), P("lockedBench", "WR", 50, team="KC"), P("x", "WR", 10)]
        r = optimize(ps, ["WR", "WR"], locked_teams={"KC"}, current_starters=["lockedStarter", None])
        ids = [p["id"] for _, p in r["lineup"]]
        self.assertEqual(ids, ["lockedStarter", "x"])

    def test_no_shuffle_when_equal(self):
        ps = [P("r1", "RB", 10), P("r2", "RB", 10), P("w", "WR", 9)]
        r = optimize(ps, ["RB", "FLEX", "WR"], current_starters=["r2", "r1", "w"])
        self.assertEqual(r["slot_changes"], [])

    def test_empty_slot_alert(self):
        r = optimize([P("q", "QB", 10, status="Out")], ["QB"], current_starters=["q"])
        self.assertTrue(any("No eligible" in a for a in r["alerts"]))


class RankingTests(unittest.TestCase):
    def setUp(self):
        self.lr = json.load(open(os.path.join(FX, "lateround_weekly.json")))
        self.fl = json.load(open(os.path.join(FX, "fantasylabs_weekly.json")))

    def test_blend_weights(self):
        a = Rankings(self.lr, self.fl, 1.0, 0.0).score("Bijan Robinson", "RB")
        b = Rankings(self.lr, self.fl, 0.0, 1.0).score("Bijan Robinson", "RB")
        c = Rankings(self.lr, self.fl, 0.7, 0.3).score("Bijan Robinson", "RB")
        self.assertAlmostEqual(c, round(0.7 * a + 0.3 * b, 2), places=1)

    def test_freshness_guard(self):
        check_fresh(self.lr, "LR", today=self.lr["fetched_date"])
        with self.assertRaises(StaleRankingsError):
            check_fresh(self.lr, "LR", today="2099-01-01")

    def test_norm_name(self):
        self.assertEqual(norm_name("Luther Burden III"), norm_name("Luther Burden"))


class CliFixtureTests(unittest.TestCase):
    def args(self, *extra):
        f = lambda n: os.path.join(FX, n)  # noqa: E731
        base = ["--lateround", f("lateround_weekly.json"), "--fantasylabs", f("fantasylabs_weekly.json"),
                "--today", "2026-10-29", "--state-file", f("state.json"), "--players-file", f("players.json"),
                "--sleeper-snapshot", f("sleeper_leagues.json"), "--espn-snapshot", f("espn_league.json"),
                "--schedule-file", f("schedule.json")]
        return cli.build_parser().parse_args(base + list(extra))

    def run_json(self, *extra):
        buf = io.StringIO()
        cli.run(self.args("--json", *extra), out=buf)
        return json.loads(buf.getvalue())

    def test_all_leagues_included(self):
        d = self.run_json()
        ids = sorted(l["league_id"] for l in d["leagues"])
        self.assertEqual(ids, sorted(["1388646908175618048", "1390102695146176512",
                                      "1389695245863641088", "67205459"]))
        self.assertEqual(d["week"], 8)
        self.assertEqual(d["bye_teams"], ["HOU", "NO", "NYG", "SF"])

    def test_no_bye_or_out_starters(self):
        for lg in self.run_json()["leagues"]:
            for s in lg["lineup"]:
                p = s["player"]
                if p:
                    self.assertNotIn(p["team"], {"HOU", "NO", "NYG", "SF"}, lg["name"])
                    self.assertNotIn((p["status"] or "").upper(), {"OUT", "IR", "DOUBTFUL"}, lg["name"])

    def test_known_swaps(self):
        d = {l["league_id"]: l for l in self.run_json()["leagues"]}
        black = d["1388646908175618048"]
        self.assertIn("Jordan Love", [p["name"] for p in black["start"]])
        espn = d["67205459"]
        self.assertEqual({p["name"] for p in espn["bench"]}, {"C.J. Stroud", "Nico Collins"})

    def test_league_filter_and_week_override(self):
        d = self.run_json("--league", "metal", "--week", "8", "--no-espn")
        self.assertEqual([l["league_id"] for l in d["leagues"]], ["1390102695146176512"])

    def test_exclude_league_opt_in(self):
        d = self.run_json("--exclude-league", "1389695245863641088")
        self.assertNotIn("1389695245863641088", [l["league_id"] for l in d["leagues"]])

    def test_stale_refusal(self):
        a = self.args(); a.today = "2026-10-30"
        with self.assertRaises(StaleRankingsError):
            cli.run(a, out=io.StringIO())

    def test_espn_skipped_without_cookies(self):
        a = self.args(); a.espn_snapshot = None
        env = {k: os.environ.pop(k) for k in ("ESPN_S2", "ESPN_SWID", "SWID") if k in os.environ}
        try:
            buf = io.StringIO(); a.json = True
            cli.run(a, out=buf)
            self.assertNotIn("67205459", [l["league_id"] for l in json.loads(buf.getvalue())["leagues"]])
        finally:
            os.environ.update(env)


if __name__ == "__main__":
    unittest.main()
