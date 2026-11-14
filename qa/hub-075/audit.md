# Hub scope and pre-implementation review

The user approved the clean results/rankings/player reader and a Home button named Hub.
The prior Research-screen cleanup remains a separate unapproved task.

- Public results use SSE at https://warzone2100.retropaganda.info/results.json?id=
  with Accept: text/event-stream. Events include reset, message and synced.
  Stop or bound initial synchronization; never interpret a partial history as
  complete rankings. Use the source account-alias and exclusion data.
- The current summary history is around 11 MB, suitable for a worker and local
  cache. Avoid the much larger ordinary raw results response.
- Ratings are derived from match history rather than returned as fixed ranks.
  Independently implement the published default mathematical method, validate it
  against reference calculations, and label the source and supported boards.
- The Hub must be a local, responsive app surface, not an embedded copy of the
  wide website. Result rows open match/player details. Search, empty, load, stale
  cache and error states must be understandable without blocking navigation.
- Keep Home's artwork and compact row. Add one readable Hub destination, allowing
  a compact fallback arrangement only where the available width requires it.
- The Hub WebView has no engine bridge. Allow local assets and the specific public
  HTTPS data requests only; remote scripts, arbitrary navigation and game commands
  are outside this feature. Dispose workers and keyboard state when returning Home.
- The existing multiplayer room listing and Join path remain byte-for-byte intact.

Verification follows the user's recent no-emulator preference: actual host worker,
parser/rating fixtures, live data, browser UI, Java geometry/source and build/package
checks. These do not establish Android rendering/touch or gameplay behavior.
