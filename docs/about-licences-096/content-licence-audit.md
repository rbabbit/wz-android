# Content and native-runtime licence audit — normal test 0.96

Audit date: 18 November 2026. Frozen source inspected read-only: `C:/timerApp/candidates/hub-replay-test-0.95-20261118`, accepted 0.95 normal APK baseline. No product files, devices, publication state or gameplay content changed by this audit.

## Result and remaining release issues

The audit produced **101 original-notice / evidence documents, 955,668 bytes**, in `licence-texts/`. `content-licence-texts-inventory.json` records every document's source, byte count and SHA-256, including `noticeFiles` and `officialLinks` suitable for the new offline reader. The final inventory SHA-256 is `371381dccffee191d0b4ff941be5e15e0bb64abb41a8fcbb6b515219cfb2a8fb`.

Two material issues remain for public-release preparation:

1. **The supplied More Fortress v0.6 archives do not declare an author or redistribution licence.** `More-Fortress-0.6.zip` has a descriptive README but no licence grant; `MoreFortress-v0.6.wz` has neither. A similarly named broader forum mod is not proof that these particular files have the same author or licence. The About page must not invent a GPL/CC0 grant. The generated credits preserve provenance and identify the missing declaration. Attribution alone does not resolve this gap.
2. **The Android repository is private.** A user without access cannot use it as a source download. The app should describe this accurately and preserve a separate source-delivery route matching the exact binary. The existing 0.95 private release is not anonymously accessible either. This audit creates no public source offer, external hosting or public-release approval.

This is a technical licence/provenance inventory, not a certification of complete legal compliance or of compatibility among all SDK terms. Android runtime Maven/Google SDK notices are being audited separately by the dependency audit agent.

## Main component findings

| Component | Observed provenance and licence | Offline documents |
|---|---|---|
| Warzone engine/data | Official 4.7.0, commit `7d3d8e51a61ceee89e6bf672a41337e1a9cd7392`; retained `COPYING.README` states GPL-2.0-or-later and an additional linking exception | `GPL-2.0.txt`, `WARZONE-COPYING.README.txt`, `WARZONE-COPYING.NONGPL.txt` |
| Native dependency source/runtime | Full source and exact source archives retained in `archive/native-blueprint-4.7.0-source.tar.gz`; extracted original notices, described below | `NATIVE-THIRD-PARTY-NOTICES.txt`, original `native/` files, `EMSCRIPTEN-LICENSE.txt` |
| Original soundtrack | Martin Severn; official music source/data GPL-2.0-or-later | `MUSIC-NOTICE.txt`, upstream GPL/readme |
| Legacy/Aftermath/Reclamation | Alexandru “LupusMechanicus” Trif; per-album dual CC BY-SA 3.0-or-later / GPL-2.0-or-later grants; Aftermath `track3_enhanced` is GPL-2.0-or-later only | Three `MUSIC-*-LICENSE.txt` original documents |
| Terrain/artwork | Official high terrain v3 and upstream game artwork; GPL with individual CC0/CC BY-SA/MIT/CC BY exceptions in the original lists | `TERRAIN-NOTICE.txt`, `WARZONE-COPYING.NONGPL.txt` |
| Oswald | Embedded TTF name tables: Copyright 2016 The Oswald Project Authors, SIL OFL 1.1; both APK TTFs byte-identical | `OSWALD-OFL-1.1.txt` from original project |
| DejaVu | Original native package includes Bitstream Vera/Arev licences and public-domain DejaVu additions | `DEJAVU-LICENSE.txt`, extracted exact bytes |
| Phosphor Icons | Copyright 2023 Phosphor Icons, MIT | `PHOSPHOR-MIT.txt` |
| Replay UI / MapMaker | MaWay2000/boha by MM, pinned `dcaf96520aa47f7a71160cae33da32e5ece1d5f0`, MIT; focused Android adaptations described | `BOHA-MIT.txt`, `MAPMAKER-MIT.txt`, `REPLAY-NOTICE.txt` |
| Three.js | r149, MIT, original author notice retained | `THREE-MIT.txt` |
| Replay artwork | Warzone-derived models/textures/effects retain Warzone terms rather than website MIT | `REPLAY-EFFECTS-NOTICE.txt` and Warzone originals |
| Tower Defense / supplied Survival scripts | `aco4/WZmodTowerDefense`, GPL-2.0-or-later, pinned `5e071ac886a9adf2ecf288cd3719d1a5d0d410ac`; exact comparison described below | `TOWER-DEFENSE-LICENSE`, `TOWER-DEFENSE-README.txt`, `CONTENT-CREDITS.txt` |
| Supplied More Fortress v0.6 | No explicit licence or author found in the actual supplied archives; retain provenance without inventing a grant | `CONTENT-CREDITS.txt` |

## Native notice coverage

Retained source archive SHA-256: `9b7e7edc229c5f40d6fce8b9042659370dc45ee9f006d3d9cde70455cca1186b` (565,368,157 bytes). Source and build records identify the official 4.7.0 commit, Emscripten SDK **4.0.10**, emsdk commit `1693ce7359fc9694f198694f902a2cc061239b86`, vcpkg repository `6fdd23fa0a9479a9f9a1c48178696f60cf39255d` and baseline `77df67cfff9c12ccfdb52284e07c87c75092f723`.

The fulltext aggregate includes retained `source/pkg/copyright`, original in-tree third-party notices, and source-archive notices for PhysFS 3.2.0, SDL 3.4.2 (including HIDAPI/yuv2rgb notices), libjpeg-turbo 3.1.4.1, Ogg 1.3.6, Theora 1.2.0, Vorbis 1.3.7, Opus 1.5.2, libspng 0.7.4, zlib 1.3.1, SQLite 3.49.2 public-domain declaration, libsodium 1.0.21, libzip 1.11.4 and bzip2 1.0.8. Exact retained Emscripten ports supply FreeType 2.13.3 and HarfBuzz 3.2.0 notices. The SDK's original licence and musl/compiler-rt/libc++/libc++abi/libunwind/LLVM-libc/mimalloc notices were obtained from the exact SDK 4.0.10 source tag.

The aggregate is **416,494 bytes**. It deliberately preserves original upstream source notices and platform alternatives, rather than pretending each retained source file was linked into the delivered Android binary. Build-time/test/source-only alternatives are labelled as such in its introduction. It is not a binary symbol-by-symbol link trace. Exact original notice copies remain separately hashed; the convenience aggregate adds headings and decodes originals for presentation.

The source archive's `sqlite-autoconf-3490200.zip` filename actually contains gzip/TAR bytes. Inspection used file signatures and the original `sqlite3.c` dedication header; no source was altered to handle this packaging quirk.

## Mods and maps

Public upstream Tower Defense source was retrieved read-only from `https://github.com/aco4/WZmodTowerDefense` at `5e071ac886a9adf2ecf288cd3719d1a5d0d410ac`. Its README explicitly declares GPL-2.0-or-later. All **18** retained `scenario/survival/supplied/` JS/JSON files match exact upstream bytes: the EMAG `config.js` overlay and main mod tree. Comparison records: `tower-compare-supplied.json`. The original Waves mod matches 14 exact files; four same-path source versions differ. No file is unexplained by path. Those four versions were not exhaustively traced through history; `tower-compare-mod.json` reports the difference accurately.

Map metadata was read from original `.wz` ZIPs, including nested archives rather than inferred from names:

- EMAG TDN2, EMAG Wave, TowerDefense2_m/Dustfall and dumb25a: **arc, CC0**, explicitly in original `.lev` headers.
- TD1 v3/Iron Valley: **NoQ, CC0-1.0**, original `level.json`.
- RO_1v1Full: **CC0-1.0**, original `level.json`; author not declared there.
- EMAG FFA: **arc, CC0-1.0**.
- Contact: **klubowicz, CC0-1.0**.
- Templar FFA: **nergal, GPL-2.0-or-later**.
- RB Simple/RB Usefull: **rb, GPL-2.0-or-later**.
- EMAJ six-player adaptation: **arc original, six-player Android adaptation, CC0-1.0**. The generated app notice avoids AI/tool labels; original provenance metadata is unchanged.

All identities are recorded in `map-licence-inventory.json` and the generated `CONTENT-CREDITS.txt`.

Supplied archive hashes:

- More-Fortress-0.6.zip: `2032d321ddd549d13d286001f8a8a649279a63cb43bbc2282f305ac5e48e0246`.
- MoreFortress-v0.6.wz: `19d58e8d729387e11d431247fb6d5c24965b4814b7018a4bad3be3cc51b6b73b`.
- emag-survival.zip: `aa510333b961b84fdd14d709b625a3b994e112ef2a125223aa15809bb8936b0f`.

## Original packaged identities and links

Oswald SHA-256: `5b38c246e255a12f5712d640d56bcced0472466fc68983d2d0410ec0457c2817`. Original full OFL fetched from [the font project](https://github.com/googlefonts/OswaldFont/blob/main/OFL.txt), matching the font's embedded copyright/URL; no font binary changed.

DejaVu notice was extracted from the actual `warzone2100.data`, range 44,513,542–44,522,358, SHA-256 `7a083b136e64d064794c3419751e5c7dd10d2f64c108fe5ba161eae5e5958a93`.

Music uses official `Warzone2100/data-music-opus` commit `db73d2b2e58dfaa8a09ab27ad771cc636be31118`, `music.data` SHA-256 `602ea6c69f4073a9617676a39f8397232953637a9b7a36e7cc28e93dd15184cd`. Three per-album licence entries and hashes match the retained music manifest; historical PROVENANCE text about download-only handling predates APK embedding, so the app notice uses the actual current `NOTICE.txt`.

Verified primary-source links include [official Warzone site](https://wz2100.net/), [official repository](https://github.com/Warzone2100/warzone2100), [exact 4.7.0 release licence/exception](https://github.com/Warzone2100/warzone2100/blob/4.7.0/COPYING.README), [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), [SIL OFL 1.1](https://openfontlicense.org/open-font-license-official-text/), [MIT](https://opensource.org/license/mit), [MPL 2.0](https://www.mozilla.org/MPL/2.0/) and [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0). The canonical [GNU GPL v2 page](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html) repeatedly timed out in this web tool; the app's complete original offline GPL text avoids relying on that network request. Do not claim that external GNU site loaded successfully in this audit.

No licence grant was invented for undeclared supplied content, and no promise of upstream endorsement or approval is made.
