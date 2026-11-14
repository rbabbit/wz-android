package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.res.AssetManager;
import android.webkit.WebResourceResponse;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.Map;

final class BundledMusicStreamCheck032 {
    private static void require(boolean value, String description) {
        if (!value) throw new AssertionError(description);
    }
    private static final Map<String,String> HEADERS = Map.of("Cross-Origin-Resource-Policy", "same-origin");

    public static void main(String[] args) throws Exception {
        Path pack = Path.of(args[0]);
        AssetManager assets = new AssetManager(pack);
        MusicPackStore store = new MusicPackStore(new Context(assets));
        require(store.ready() && assets.openFdCalls == 1 && assets.openCalls == 0,
                "Bundled readiness uses descriptor metadata without reading/copying the pack");
        int count = 0;
        for (String line : Files.readAllLines(Path.of(args[1]), StandardCharsets.UTF_8)) {
            String[] row = line.split("\\t");
            MapMusicIndex.Slice track = new MapMusicIndex.Slice(row[0], Long.parseLong(row[1]), Long.parseLong(row[2]));
            WebResourceResponse response = MusicTrackResponse.open(store, track, "GET", null, HEADERS);
            require(response.getStatusCode() == 200 && "audio/ogg".equals(response.getMimeType()), "Whole-track response");
            require(!response.getResponseHeaders().containsKey("Content-Length"), "GET length is derived once from bounded available");
            require(!response.getResponseHeaders().containsKey("Content-Range"), "No double media range slicing");
            require("none".equals(response.getResponseHeaders().get("Accept-Ranges")), "Explicit whole-track route");
            require("same-origin".equals(response.getResponseHeaders().get("Cross-Origin-Resource-Policy")), "Isolation retained");
            MessageDigest hash = MessageDigest.getInstance("SHA-256");
            long bytes = 0;
            try (InputStream input = response.getData()) {
                require(input.available() == track.length, "Available is the complete single track");
                byte[] first = input.readNBytes(64);
                require(new String(first, 0, 4, StandardCharsets.US_ASCII).equals("OggS"), "Track starts at its own Ogg page");
                require(new String(first, StandardCharsets.ISO_8859_1).contains("OpusHead"), "Original Opus header retained");
                hash.update(first); bytes += first.length;
                byte[] block = new byte[8195]; Arrays.fill(block, (byte) 77);
                int n;
                while ((n = input.read(block, 2, 8191)) != -1) {
                    hash.update(block, 2, n); bytes += n;
                    require(block[0] == 77 && block[1] == 77 && block[8194] == 77, "Caller buffer boundaries preserved");
                }
                require(bytes == track.length, "Read exactly one original track");
                require(input.read() == -1 && input.read(block) == -1 && input.read(new byte[0]) == 0,
                        "EOF cannot leak into the next track");
                require(input.available() == 0 && input.skip(Long.MAX_VALUE) == 0, "No data after track end");
            }
            require(HexFormat.of().formatHex(hash.digest()).equals(row[3]), "Original track SHA256 " + track.id);
            try (InputStream input = MusicTrackResponse.open(store, track, "GET", null, HEADERS).getData();
                    RandomAccessFile reference = new RandomAccessFile(pack.toFile(), "r")) {
                long offset = track.length / 2;
                require(input.skip(offset) == offset, "Skip reaches the requested byte within the track");
                reference.seek(track.start + offset);
                byte[] expected = new byte[32]; reference.readFully(expected);
                require(Arrays.equals(input.readNBytes(32), expected), "Asset stream byte position matches original pack");
                require(input.skip(Long.MAX_VALUE) == track.length - offset - 32 && input.read() == -1,
                        "Skip is bounded at track EOF");
            }
            int opened = assets.openCalls;
            WebResourceResponse head = MusicTrackResponse.open(store, track, "HEAD", null, HEADERS);
            require(head.getStatusCode() == 200 && Long.toString(track.length).equals(head.getResponseHeaders().get("Content-Length")),
                    "HEAD exposes exact track metadata");
            require(head.getData().read() == -1 && assets.openCalls == opened, "HEAD never opens the audio asset");
            head.getData().close();
            for (String range : new String[] {"bytes=0-", "bytes=2000000-", "bytes=-65536", "invalid", ""}) {
                WebResourceResponse denied = MusicTrackResponse.open(store, track, "GET", range, HEADERS);
                require(denied.getStatusCode() == 416 && denied.getData().read() == -1 && assets.openCalls == opened,
                        "Direct range rejected without opening a stream");
                denied.getData().close();
            }
            WebResourceResponse denied = MusicTrackResponse.open(store, track, "POST", null, HEADERS);
            require(denied.getStatusCode() == 405 && assets.openCalls == opened, "Unsupported method never opens a stream");
            denied.getData().close();
            count++;
        }
        require(count == 39 && assets.openCalls == 78 && assets.closedStreams == 78, "All tracks are read and closed without leaked streams");
        try {
            MusicTrackResponse.open(store, new MapMusicIndex.Slice("invalid", MusicPackStore.BYTES - 2, MusicPackStore.BYTES + 3), "GET", null, HEADERS);
            throw new AssertionError("Out-of-pack bounds accepted");
        } catch (IOException expected) { }
        Path tiny = Path.of(args[2], "truncated.data"); Files.write(tiny, new byte[64]);
        MusicPackStore missing = new MusicPackStore(new Context(new AssetManager(Path.of(args[2], "missing.data"))));
        require(!missing.ready(), "Missing asset is unavailable without falling back to network/cache");
        MusicPackStore incomplete = new MusicPackStore(new Context(new AssetManager(tiny)));
        require(!incomplete.ready(), "Wrong asset length is rejected");
        AssetManager failingAssets = new AssetManager(tiny);
        failingAssets.declaredLength = MusicPackStore.BYTES;
        MusicPackStore failing = new MusicPackStore(new Context(failingAssets));
        try (InputStream input = MusicTrackResponse.open(failing,
                new MapMusicIndex.Slice("eof", 70, 80), "GET", null, HEADERS).getData()) {
            input.read();
            throw new AssertionError("Premature archive EOF accepted by the reader");
        } catch (EOFException expected) { }
        require(failingAssets.openCalls == 1 && failingAssets.closedStreams == 1, "Failed asset seeking closes its stream");
        failingAssets.zeroSkip = true;
        try (InputStream input = MusicTrackResponse.open(failing, new MapMusicIndex.Slice("fallback", 10, 50), "GET", null, HEADERS).getData()) {
            require(input.readNBytes(40).length == 40 && input.read() == -1, "Zero-skip fallback still seeks and bounds correctly");
        }
        try (InputStream input = MusicTrackResponse.open(pack.toFile(), new MapMusicIndex.Slice("legacy", 0, 64), "GET", null, HEADERS).getData()) {
            require(input.readNBytes(64).length == 64 && input.read() == -1, "Retained file overload stays usable");
        }
        store.close();
        System.out.println("{\"sourceCheckGroupsPassed\":10,\"trackHashesMatched\":" + count
                + ",\"assetReadyWithoutReadingPack\":true,\"boundedAssetStreamsClosed\":true,\"headAndRangeDoNotOpenAsset\":true,"
                + "\"nativeRangeDoubleSeekAvoided\":true,\"missingAndTruncatedAssetRejected\":true,\"zeroSkipFallbackChecked\":true,\"legacyFileOverloadRetained\":true}");
    }
}
