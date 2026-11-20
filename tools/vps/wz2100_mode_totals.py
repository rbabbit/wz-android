"""Count game starts by UTC day and mode. Run with --report to print the totals."""

import argparse
from contextlib import closing
from datetime import date, datetime, timezone
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
MAX_BYTES = max(map(len, PAYLOADS))
STATS_STYLES = Path(__file__).with_name("wz2100_stats.css")
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
    rows = "\n".join(
        f'<tr><th scope="row">{MODE_LABELS[mode]}</th><td>{totals[mode]:,}</td></tr>'
        for mode in MODES
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Warzone match totals</title>
  <link rel="stylesheet" href="/stats/style.css">
</head>
<body>
  <main>
    <header>
      <h1>Daily match starts</h1>
      <form action="/stats" method="get">
        <div>
          <label for="date">Date (UTC)</label>
          <input id="date" name="date" type="date" value="{selected}" max="{today}" required>
        </div>
        <button type="submit">View day</button>
      </form>
    </header>
    <table>
      <caption>Match totals for {selected} UTC</caption>
      <thead><tr><th scope="col">Game mode</th><th scope="col">Starts</th></tr></thead>
      <tbody>{rows}</tbody>
      <tfoot><tr><th scope="row">Total</th><td>{sum(totals[mode] for mode in MODES):,}</td></tr></tfoot>
    </table>
    <p class="note">Online multiplayer counts each participating app that enters a match.</p>
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
        if length < 1 or length > MAX_BYTES:
            self.reply(400)
            return
        try:
            payload = self.rfile.read(length)
        except OSError:
            self.reply(400)
            return
        mode = PAYLOADS.get(payload) if len(payload) == length else None
        if mode is None:
            self.reply(400)
            return
        try:
            with closing(sqlite3.connect(DATABASE, timeout=2)) as database, database:
                database.execute("""INSERT INTO mode_totals (day, mode, starts) VALUES (?, ?, 1)
                    ON CONFLICT (day, mode) DO UPDATE SET starts = starts + 1""", (day(), mode))
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
    with ThreadingHTTPServer(("127.0.0.1", 8796), ModeCountHandler) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()
