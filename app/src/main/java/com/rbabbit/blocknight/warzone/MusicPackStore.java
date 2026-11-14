package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.content.res.AssetManager;
import java.io.IOException;
import java.io.InputStream;

/** Signed, uncompressed APK asset. No download, extraction or legacy cache is needed. */
final class MusicPackStore implements AutoCloseable {
    static final String ASSET_PATH = "warzone/music/music.data";
    static final long BYTES = 114_721_578L;
    static final String SHA256 = "602ea6c69f4073a9617676a39f8397232953637a9b7a36e7cc28e93dd15184cd";
    private final AssetManager assets;
    private final boolean ready;

    MusicPackStore(Context context) {
        assets = context.getAssets();
        boolean present;
        // openFd is constant-time and proves the asset is stored uncompressed.
        // The build/package checks verify every byte; APK signing protects it
        // afterwards without hashing 115 MB on every phone launch.
        try (AssetFileDescriptor descriptor = assets.openFd(ASSET_PATH)) {
            present = descriptor.getDeclaredLength() == BYTES;
        } catch (IOException error) { present = false; }
        ready = present;
    }

    boolean ready() { return ready; }

    InputStream openArchive() throws IOException {
        if (!ready) throw new IOException("Bundled music is missing or incomplete");
        return assets.open(ASSET_PATH, AssetManager.ACCESS_RANDOM);
    }

    @Override public void close() { /* AssetManager belongs to Android resources. */ }
}
