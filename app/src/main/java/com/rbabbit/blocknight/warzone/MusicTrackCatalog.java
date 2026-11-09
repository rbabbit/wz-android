package com.rbabbit.blocknight.warzone;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Titles and IDs read from the verified original albums; no audio is embedded. */
final class MusicTrackCatalog {
    static final class Album {
        final String title, author;
        final List<Track> tracks = new ArrayList<>();
        Album(JSONObject value) throws Exception {
            title=value.getString("title"); author=value.getString("author");
            JSONArray items=value.getJSONArray("tracks");
            for(int i=0;i<items.length();i++) tracks.add(new Track(items.getJSONObject(i)));
        }
    }
    static final class Track {
        final String id, title, author;
        Track(JSONObject value) throws Exception {
            id=value.getString("id"); title=value.getString("title");
            author=value.optString("author", "");
        }
    }
    final List<Album> albums = new ArrayList<>();
    MusicTrackCatalog(Context context) {
        try(InputStream input=context.getAssets().open("warzone/music-tracks.json")) {
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] block=new byte[4096];int count;
            while((count=input.read(block))!=-1) bytes.write(block,0,count);
            JSONArray items=new JSONObject(new String(bytes.toByteArray(),StandardCharsets.UTF_8)).getJSONArray("albums");
            for(int i=0;i<items.length();i++) albums.add(new Album(items.getJSONObject(i)));
        } catch(Exception error) { throw new IllegalStateException("Music catalogue unavailable",error); }
    }
    Set<String> allIds() {
        Set<String> result=new HashSet<>();
        for(Album album:albums) for(Track track:album.tracks) result.add(track.id);
        return result;
    }
    Track find(String id) {
        for(Album album:albums) for(Track track:album.tracks) if(track.id.equals(id)) return track;
        return null;
    }
    String selectionJson(Set<String> selected) {
        JSONArray value=new JSONArray();
        for(Album album:albums) for(Track track:album.tracks) if(selected.contains(track.id)) value.put(track.id);
        return value.toString();
    }
}
