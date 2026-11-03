package com.rbabbit.blocknight.warzone;

import android.content.Context;

final class MusicPackStore extends OptionalPackStore {
    static final String URL = "https://krishna.org.uk/game/music/official-v1/music.data";
    static final long BYTES = 114_721_578L;
    static final String SHA256 = "602ea6c69f4073a9617676a39f8397232953637a9b7a36e7cc28e93dd15184cd";
    MusicPackStore(Context context) { super(context, "music/official-v1", "music.data", URL, BYTES, SHA256); }
}
