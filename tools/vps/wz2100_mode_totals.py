"""Aggregate game starts and play time by UTC day. --report prints start totals."""

import argparse
from contextlib import closing
from datetime import date, datetime, timezone
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sqlite3
from urllib.parse import parse_qs

DATABASE = "/var/lib/wz2100-mode-totals/counts.sqlite3"
PATH = "/api/game-mode-count"
MODES = ("campaign", "towers", "survival", "ffa", "challenge", "duel",
         "crystal-skirmish", "multiplayer")
PAYLOADS = {mode.encode("ascii"): mode for mode in MODES}
MAX_START_BYTES = max(map(len, PAYLOADS))
MAX_SUMMARY_BYTES = 1024
STATS_STYLES = Path(__file__).with_name("wz2100_stats.css")
STATS_MAPS = Path(__file__).with_name("wz2100_stats_maps.json")
MODE_LABELS = {
    "campaign": "Campaign",
    "towers": "Towers",
    "survival": "Survival",
    "ffa": "Free for All",
    "challenge": "Challenge",
    "duel": "1v1 Duel",
    "crystal-skirmish": "Crystal Skirmish",
    "multiplayer": "Online Multiplayer",
}
DIFFICULTIES = {
    "easy": "Easy", "medium": "Medium", "hard": "Hard", "insane": "Insane",
    "online": "Online", "unknown": "Unknown",
}


def day():
    return datetime.now(timezone.utc).date().isoformat()


def initialise_database():
    with closing(sqlite3.connect(DATABASE)) as database, database:
        database.execute("""CREATE TABLE IF NOT EXISTS mode_totals (
            day TEXT NOT NULL,
            mode TEXT NOT NULL,
            starts INTEGER NOT NULL,
            PRIMARY KEY (day, mode)
        ) WITHOUT ROWID""")
        database.execute("""CREATE TABLE IF NOT EXISTS mode_sessions (
            day TEXT NOT NULL,
            mode TEXT NOT NULL,
            map TEXT NOT NULL,
            difficulty TEXT NOT NULL,
            result TEXT NOT NULL,
            sessions INTEGER NOT NULL,
            seconds INTEGER NOT NULL,
            PRIMARY KEY (day, mode, map, difficulty, result)
        ) WITHOUT ROWID""")


def parse_summary(payload, known_maps):
    try:
        summary = json.loads(payload.decode("utf-8"))
    except (ValueError, RecursionError):
        return None
    if not isinstance(summary, dict) or set(summary) != {"mode", "map", "difficulty", "result", "seconds"}:
        return None
    mode, map_name, difficulty, result, seconds = (summary[key] for key in
                                                   ("mode", "map", "difficulty", "result", "seconds"))
    if not all(isinstance(value, str) for value in (mode, map_name, difficulty, result)):
        return None
    if (mode not in MODES or difficulty not in DIFFICULTIES or result not in ("finished", "left")
            or type(seconds) is not int or not 1 <= seconds <= 604800):
        return None
    # Only names from the shipped catalogues may become stored labels.
    if map_name not in known_maps.get(mode, ()):
        return None
    return mode, map_name, difficulty, result, seconds


def duration(seconds):
    hours, remainder = divmod(seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours}h {minutes:02d}m {seconds:02d}s" if hours else f"{minutes}m {seconds:02d}s"


def play_time_rows(groups):
    return "\n".join(
        f'<tr><th scope="row">{MODE_LABELS[mode]}</th><td>{escape(map_name)}</td>'
        f'<td>{DIFFICULTIES[difficulty]}</td><td>{finished:,}</td><td>{left:,}</td>'
        f'<td>{duration(seconds)}</td><td>{duration(seconds // (finished + left))}</td></tr>'
        for mode, map_name, difficulty, finished, left, seconds in groups
    ) or '<tr><td class="empty" colspan="7">No play-time reports for this day.</td></tr>'


def stats_page(query):
    today = day()
    try:
        requested = parse_qs(query, max_num_fields=4).get("date", [today])[0]
        selected = date.fromisoformat(requested).isoformat()
        if selected != requested or selected > today:
            selected = today
    except ValueError:
        selected = today

    totals = dict.fromkeys(MODES, 0)
    with closing(sqlite3.connect(f"file:{DATABASE}?mode=ro", uri=True, timeout=2)) as database:
        totals.update(database.execute("SELECT mode, starts FROM mode_totals WHERE day = ?", (selected,)))
        groups = database.execute("""SELECT mode, map, difficulty,
                SUM(CASE WHEN result = 'finished' THEN sessions ELSE 0 END),
                SUM(CASE WHEN result = 'left' THEN sessions ELSE 0 END), SUM(seconds)
            FROM mode_sessions WHERE day = ? GROUP BY mode, map, difficulty
            ORDER BY mode, map COLLATE NOCASE, difficulty""", (selected,)).fetchall()
    rows = "\n".join(
        f'<tr><th scope="row">{MODE_LABELS[mode]}</th><td>{totals[mode]:,}</td></tr>'
        for mode in MODES
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Warzone game stats</title>
  <link rel="stylesheet" href="/stats/style.css">
</head>
<body>
  <main>
    <header>
      <h1>Daily game stats</h1>
      <form action="/stats" method="get">
        <div>
          <label for="date">Date (UTC)</label>
          <input id="date" name="date" type="date" value="{selected}" max="{today}" required>
        </div>
        <button type="submit">View day</button>
      </form>
    </header>
    <table>
      <caption>Match starts for {selected} UTC</caption>
      <thead><tr><th scope="col">Game mode</th><th scope="col">Starts</th></tr></thead>
      <tbody>{rows}</tbody>
      <tfoot><tr><th scope="row">Total</th><td>{sum(totals[mode] for mode in MODES):,}</td></tr></tfoot>
    </table>
    <p class="note">Online multiplayer counts each participating app that enters a match.</p>
    <section aria-labelledby="play-time">
      <h2 id="play-time">Play time by map</h2>
      <div class="table-scroll" tabindex="0" role="region" aria-labelledby="play-time">
        <table class="play-time">
          <caption>Play-time reports received on {selected} UTC</caption>
          <thead><tr><th scope="col">Game mode</th><th scope="col">Map</th><th scope="col">Difficulty</th>
            <th scope="col">Finished</th><th scope="col">Left</th>
            <th scope="col">Total time</th><th scope="col">Avg. time</th></tr></thead>
          <tbody>{play_time_rows(groups)}</tbody>
        </table>
      </div>
      <p class="note">Finished means the game recorded a result. Left means the player exited before a result.
        Average time uses all reports in that row. Play time is measured while the app is in the foreground.</p>
    </section>
  </main>
</body>
</html>""".encode("utf-8")


class ModeCountHandler(BaseHTTPRequestHandler):
    timeout = 3

    def log_message(self, *_):
        pass

    def do_GET(self):
        path, _, query = self.path.partition("?")
        if path not in ("/stats", "/stats/", "/stats/style.css"):
            self.reply(404)
            return
        try:
            if path == "/stats/style.css":
                content = STATS_STYLES.read_bytes()
                content_type = "text/css; charset=utf-8"
            else:
                content = stats_page(query)
                content_type = "text/html; charset=utf-8"
        except (OSError, sqlite3.Error):
            self.reply(503)
            return
        self.close_connection = True
        self.send_response_only(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self):
        if self.path != PATH:
            self.reply(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        is_summary = self.headers.get_content_type() == "application/json"
        if length < 1 or length > (MAX_SUMMARY_BYTES if is_summary else MAX_START_BYTES):
            self.reply(400)
            return
        try:
            payload = self.rfile.read(length)
        except OSError:
            self.reply(400)
            return
        if len(payload) != length:
            self.reply(400)
            return
        if is_summary:
            summary = parse_summary(payload, self.server.known_maps)
            if summary is None:
                self.reply(400)
                return
            mode, map_name, difficulty, result, seconds = summary
            statement = """INSERT INTO mode_sessions (day, mode, map, difficulty, result, sessions, seconds)
                VALUES (?, ?, ?, ?, ?, 1, ?) ON CONFLICT (day, mode, map, difficulty, result)
                DO UPDATE SET sessions = sessions + 1, seconds = seconds + excluded.seconds"""
            values = (day(), mode, map_name, difficulty, result, seconds)
        else:
            mode = PAYLOADS.get(payload)
            if mode is None:
                self.reply(400)
                return
            statement = """INSERT INTO mode_totals (day, mode, starts) VALUES (?, ?, 1)
                ON CONFLICT (day, mode) DO UPDATE SET starts = starts + 1"""
            values = (day(), mode)
        try:
            with closing(sqlite3.connect(DATABASE, timeout=2)) as database, database:
                database.execute(statement, values)
        except sqlite3.Error:
            self.reply(503)
            return
        self.reply(204)

    def reply(self, status):
        self.close_connection = True
        self.send_response_only(status)
        if status != 204:
            self.send_header("Content-Length", "0")
        self.end_headers()


def report():
    totals = {day(): dict.fromkeys(MODES, 0)}
    with closing(sqlite3.connect(f"file:{DATABASE}?mode=ro", uri=True)) as database:
        for date, mode, count in database.execute("SELECT day, mode, starts FROM mode_totals ORDER BY day DESC"):
            totals.setdefault(date, dict.fromkeys(MODES, 0))[mode] = count
    print(json.dumps(totals, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", action="store_true")
    if parser.parse_args().report:
        report()
        return
    initialise_database()
    known_maps = json.loads(STATS_MAPS.read_text(encoding="utf-8"))
    with ThreadingHTTPServer(("127.0.0.1", 8796), ModeCountHandler) as server:
        server.known_maps = {mode: frozenset(names) for mode, names in known_maps.items()}
        server.serve_forever()


if __name__ == "__main__":
    main()
