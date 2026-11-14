package com.rbabbit.blocknight.warzone;

import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FilterInputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/** Whole-track fetch only; playback seeks inside the browser's local Blob. */
final class MusicTrackResponse {
    @FunctionalInterface private interface OpenTrack {
        InputStream open() throws IOException;
    }

    static WebResourceResponse open(MusicPackStore archive, MapMusicIndex.Slice track, String method,
            String range, Map<String, String> isolationHeaders) throws IOException {
        if (!archive.ready()) throw new IOException("Bundled music is missing or incomplete");
        return open(track, method, range, isolationHeaders, MusicPackStore.BYTES, () -> {
            InputStream input = archive.openArchive();
            try {
                // AssetInputStream uses native asset seeks. Keep the pack in
                // the APK rather than extracting 115 MB into app storage.
                skipFully(input, track.start);
                return input;
            } catch (IOException error) { input.close(); throw error; }
        });
    }

    static WebResourceResponse open(File archive, MapMusicIndex.Slice track, String method,
            String range, Map<String, String> isolationHeaders) throws IOException {
        return open(track, method, range, isolationHeaders, archive.length(), () -> {
            FileInputStream input = new FileInputStream(archive);
            try { input.getChannel().position(track.start); }
            catch (IOException error) { input.close(); throw error; }
            return input;
        });
    }

    private static WebResourceResponse open(MapMusicIndex.Slice track, String method,
            String range, Map<String, String> isolationHeaders, long archiveLength,
            OpenTrack opener) throws IOException {
        Map<String, String> headers = new HashMap<>(isolationHeaders);
        headers.put("Accept-Ranges", "none");
        if (!"GET".equals(method) && !"HEAD".equals(method)) {
            headers.put("Allow", "GET, HEAD");
            return empty(405, "Method Not Allowed", headers);
        }
        // WebView applies a request Range to intercepted InputStreams itself.
        // Pre-seeking/truncating here would apply the same seek a second time.
        // The music controller fetches a whole track, then plays its Blob URL;
        // direct range requests are deliberately unsupported on this route.
        if (range != null) {
            headers.put("Content-Range", "bytes */" + track.length);
            return empty(416, "Range Not Satisfiable", headers);
        }
        if (track.start < 0 || track.length <= 0 || track.length > archiveLength - track.start)
            throw new IOException("Music track lies outside the verified pack");
        // WebView derives GET length from the bounded stream's available().
        // Adding it again makes Fetch expose a comma-joined duplicate header.
        if ("HEAD".equals(method)) headers.put("Content-Length", Long.toString(track.length));
        InputStream stream;
        if ("HEAD".equals(method)) stream = new ByteArrayInputStream(new byte[0]);
        else stream = new LimitedInputStream(opener.open(), track.length);
        return new WebResourceResponse("audio/ogg", null, 200, "OK", headers, stream);
    }

    private static void skipFully(InputStream input, long amount) throws IOException {
        long remaining = amount;
        while (remaining > 0) {
            long skipped = input.skip(remaining);
            if (skipped > 0) remaining -= skipped;
            else {
                if (input.read() < 0) throw new EOFException("Music archive ended before the track");
                remaining--;
            }
        }
    }

    private static WebResourceResponse empty(int code, String reason, Map<String, String> headers) {
        headers.put("Content-Length", "0");
        return new WebResourceResponse("audio/ogg", null, code, reason, headers,
                new ByteArrayInputStream(new byte[0]));
    }

    private static final class LimitedInputStream extends FilterInputStream {
        private long remaining;
        LimitedInputStream(InputStream source, long length) { super(source); remaining = length; }
        @Override public int read() throws IOException {
            if (remaining <= 0) return -1;
            int value = in.read();
            if (value < 0) throw new EOFException("Music track ended before its declared length");
            remaining--;
            return value;
        }
        @Override public int read(byte[] bytes, int offset, int length) throws IOException {
            if (length == 0) return 0;
            if (remaining <= 0) return -1;
            int count = in.read(bytes, offset, (int) Math.min(remaining, length));
            if (count < 0) throw new EOFException("Music track ended before its declared length");
            if (count > 0) remaining -= count;
            return count;
        }
        @Override public long skip(long count) throws IOException {
            long skipped = in.skip(Math.max(0, Math.min(count, remaining)));
            remaining -= skipped;
            return skipped;
        }
        @Override public int available() throws IOException {
            return (int) Math.min(remaining, in.available());
        }
    }
}
