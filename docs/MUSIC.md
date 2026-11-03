# Optional Music

Open **Music** on the start screen. Download the original soundtrack collection
once, turn **Music on**, and tick the tracks you want in your battle playlist.
**ALL** and **CLEAR** change the selection together. Choices save automatically
and survive restarting the app. An empty playlist requires choosing a track or
turning Music off before starting.

The small **START GAME** button stays at the top right, including while scrolling
through the albums. It starts with your selected graphics setting. There is no
Music button or Music-menu automation in the battle header. Change your playlist
before starting your next battle.

The four original albums contain 39 tracks, plus the menu theme:

- Warzone 2100 OST — Martin Severn, 3 tracks.
- Legacy — LupusMechanicus, 13 tracks.
- Aftermath — LupusMechanicus, 13 tracks.
- Reclamation — LupusMechanicus, 10 tracks.

## Hosting and verification

Runtime downloads use only the owner's VPS. HTTP redirects are disabled.

- Pack: https://krishna.org.uk/game/music/official-v1/music.data
- Manifest: https://krishna.org.uk/game/music/official-v1/manifest.json
- Size: 114,721,578 bytes, approximately 110 MiB.
- SHA-256: `602ea6c69f4073a9617676a39f8397232953637a9b7a36e7cc28e93dd15184cd`

The native downloader verifies the entire file before making it available to
WebView. A verified copy is cached in app-private `files/music/official-v1/`.
Partial downloads can be resumed. Startup checks the cached checksum again.
Music is optional: turning it off starts the ordinary game without mounting it.

The wrapper mounts the 55 unchanged original files under `/data/music/`, including
all album descriptions, original covers and 40 Opus audio files. It preserves
the original player and does not stream tracks from third-party sites. Startup
choices are written to Warzone's normal `music.json` user preferences after
saved storage is restored and before the engine reads its playlist. Album and
audio files are unchanged. The menu theme remains the original menu theme.

## Source and maintenance

The official `Warzone2100/data-music-opus` source is pinned to commit
`db73d2b2e58dfaa8a09ab27ad771cc636be31118`, used by Warzone 4.7.0. Original notices,
source-tree metadata and the per-file manifest are under `vendor/music/official-v1/`.
The pack concatenates original file bytes; it does not transcode audio or edit art.

`tools/build-music-pack.py` rebuilds and verifies the source collection; source
ingestion from upstream happens during preparation, not on players' devices.
`tools/generate-music-catalog.py --pack PATH/TO/music.data` creates the bundled
loader catalogue and original track-title metadata after checking the pack SHA.
`tools/test-music-loader.cjs` validates mounting, optional/off behavior and failures.
Set `WZ_MUSIC_DATA` to the pack path to additionally verify its checksum, every
original file checksum and all 40 Ogg/Opus headers.

Native Music screenshots and the real engine read/selection results are recorded
under `qa/v4.7/`. Emulator tests are silent (`-no-audio`); audible speaker quality
and physical Samsung tablet compatibility require a physical-device retest.
