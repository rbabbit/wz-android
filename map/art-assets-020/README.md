# Native ground material sources

These 28 PNGs contain the actual 512×512 ground material pixels decoded from
the KTX2 textures already bundled in the preserved Warzone Towers 0.19 APK.
They are source inputs for map-preview generation, not replacement game assets.
The compiled engine and its native compressed textures remain unchanged.

Run `python tools/map-art-reference-020.py --decode-materials` from the project
root to recreate them. The preserved `C:/timerApp/Warzone-Towers-0.19.apk`, Python
with Pillow, and Node are required. The source ZIP retains every PNG, so normal
map generation does not need to perform this decoding or download anything.

`PROVENANCE.json` records each original virtual texture path, source KTX2 hash,
decoded RGBA hash, PNG hash, material repeat scale and dimensions. It also
records the original URLs and hashes of the vendored Basis asset transcoder.
That decoder runs only to convert image assets; it does not run the game.

The native data retain Warzone's existing source/data licensing and attribution
in the copied `COPYING`, `COPYING.README` and `COPYING.NONGPL`. The Basis decoder
uses the Apache 2.0 license retained in `decoder/LICENSE-Apache-2.0.txt`, with
the bundled Zstandard BSD notice in `decoder/LICENSE-Zstd-BSD.txt`.
