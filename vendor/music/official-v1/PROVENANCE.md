# Official optional Music download

The complete official Warzone 4.7.0 music tree is mirrored unchanged on the
owner's VPS. It contains four albums (39 album tracks) plus the menu theme:
Warzone 2100 OST, Legacy, Aftermath and Reclamation. Original Opus audio,
album descriptions/covers and notices are preserved byte-for-byte.

- Source: https://github.com/Warzone2100/data-music-opus
- Pinned commit: `db73d2b2e58dfaa8a09ab27ad771cc636be31118`
- Download: https://krishna.org.uk/game/music/official-v1/music.data
- Manifest: https://krishna.org.uk/game/music/official-v1/manifest.json
- Size: 114,721,578 bytes (109.41 MiB).
- SHA-256: `602ea6c69f4073a9617676a39f8397232953637a9b7a36e7cc28e93dd15184cd`

`tools/build-music-pack.py` ran on the VPS and checked every original Git blob
before concatenating the exact bytes. The manifest records each file's offsets
and checksum. The Android app fetches only the VPS copy, then exposes the original
files in `/data/music/` so the original Music Manager reads its own albums.
No music is embedded in the APK or streamed from another host.

The server also keeps the original 55 files and accompanying COPYING notices.
`tools/generate-music-catalog.py` generates only the small bundled offset table.
