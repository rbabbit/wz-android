# Music source audit for 0.66

The app already contains the original 114,721,578-byte soundtrack archive,
SHA256 `602ea6c69f4073a9617676a39f8397232953637a9b7a36e7cc28e93dd15184cd`.
Its four albums contain 39 tracks. No soundtrack bytes, album metadata,
licences or notices are converted, downloaded or replaced for this change.

Campaign does not have an official one-song-per-mission or Alpha/Beta/Gamma
assignment table. The native player filters albums by their music-mode
defaults. Only `original_soundtrack/track1.opus`, `track2.opus` and `track3.opus`
are enabled for Campaign in the bundled album definitions. All three remain
available across missions. See the [official album definition](https://github.com/Warzone2100/data-music-opus/blob/db73d2b2e58dfaa8a09ab27ad771cc636be31118/albums/original_soundtrack/album.json)
and [native playlist implementation](https://github.com/Warzone2100/warzone2100/blob/4.7.0/lib/sound/playlist.cpp).

Native in-game initialization randomizes a matching song. Completion advances
through the matching playlist in order, wrapping around. Mission/save loading
runs `stageThreeInitialise`, which requests in-game music again; repeated
status reports do not. The app therefore observes the actual native Campaign
session rather than assigning songs from a mission name. See [audio playback](https://github.com/Warzone2100/warzone2100/blob/4.7.0/lib/sound/cdaudio.cpp),
[initialization](https://github.com/Warzone2100/warzone2100/blob/4.7.0/src/init.cpp)
and [level loading](https://github.com/Warzone2100/warzone2100/blob/4.7.0/src/levels.cpp).

Videos pause the native music stream and resume it afterward. The browser
player follows the observed video state and retains its decoded track and
position. Ordinary native pauses do not select a different track. Native
mission results use a separate frontend/menu cue; this is distinct from the
three-track in-game Campaign playlist. The app suspends its in-game player
when the existing native frame reports the mission result screen; it does not
add or claim to reproduce that separate frontend cue. See [video entry](https://github.com/Warzone2100/warzone2100/blob/4.7.0/src/seqdisp.cpp)
and [video exit](https://github.com/Warzone2100/warzone2100/blob/4.7.0/src/loop.cpp).

FFA uses a shuffled bag of all 39 bundled album tracks, advancing on media
completion and avoiding a repeat at the bag boundary. Towers retains its
existing 46 map assignments and single-track loops. The MUSIC popover uses
the existing shared On/Off preference. Sound effects and voices are unchanged.

Host fixtures exercise the actual Java metadata classes and JavaScript loader
with synthetic assets/media. They do not establish Android decoding, audible
playback or gameplay. Exact-delivery APK checks remain separate evidence.
