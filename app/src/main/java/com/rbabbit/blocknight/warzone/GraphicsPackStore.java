package com.rbabbit.blocknight.warzone;

import android.content.Context;

final class GraphicsPackStore extends OptionalPackStore {
    static final String URL = "https://krishna.org.uk/game/graphics/hq-v3/high.wz";
    static final long BYTES = 99_639_408L;
    static final String SHA256 = "a16a06c2a6b68e86a03934240880ec0b0fd72666606af3bf12ed5ffda7734f0e";
    GraphicsPackStore(Context context) { super(context, "graphics/hq-v3", "high.wz", URL, BYTES, SHA256); }
}
