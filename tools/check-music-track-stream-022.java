package com.rbabbit.blocknight.warzone;

import android.webkit.WebResourceResponse;
import java.io.EOFException;
import java.io.File;
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

final class MusicTrackStreamCheck022 {
    private static void require(boolean value,String description) {
        if(!value)throw new AssertionError(description);
    }
    private static final Map<String,String> HEADERS=Map.of("Cross-Origin-Resource-Policy","same-origin");

    public static void main(String[] args) throws Exception {
        File pack=new File(args[0]); int tracks=0; boolean legacyFailure=false;
        for(String line:Files.readAllLines(Path.of(args[1]),StandardCharsets.UTF_8)) {
            String[] row=line.split("\\t");
            MapMusicIndex.Slice track=new MapMusicIndex.Slice(row[0],Long.parseLong(row[1]),Long.parseLong(row[2]));
            WebResourceResponse response=MusicTrackResponse.open(pack,track,"GET",null,HEADERS);
            require(response.getStatusCode()==200 && "audio/ogg".equals(response.getMimeType()),"Whole-track response");
            require(Long.toString(track.length).equals(response.getResponseHeaders().get("Content-Length")),"Track length header");
            require("none".equals(response.getResponseHeaders().get("Accept-Ranges")),"No native range slicing");
            require(!response.getResponseHeaders().containsKey("Content-Range"),"No false partial-content header");
            require("same-origin".equals(response.getResponseHeaders().get("Cross-Origin-Resource-Policy")),"Isolation headers preserved");
            MessageDigest hash=MessageDigest.getInstance("SHA-256");long count=0;
            try(InputStream stream=response.getData()) {
                require(stream.available()==track.length,"Available is one complete track, never the whole pack");
                byte[] beginning=stream.readNBytes(64);hash.update(beginning);count+=beginning.length;
                require(new String(beginning,0,4,StandardCharsets.US_ASCII).equals("OggS"),"Whole-track starts at its real Ogg header");
                require(new String(beginning,StandardCharsets.ISO_8859_1).contains("OpusHead"),"Original Opus header");
                byte[] bytes=new byte[8195];Arrays.fill(bytes,(byte)77);int length;
                while((length=stream.read(bytes,2,8191))!=-1) {
                    hash.update(bytes,2,length);count+=length;
                    require(bytes[0]==77&&bytes[1]==77&&bytes[8194]==77,"Read respects caller buffer bounds");
                }
                require(count==track.length,"Exact original track byte count");
                require(stream.read()==-1&&stream.read(bytes)==-1&&stream.read(new byte[0])==0,"EOF cannot cross into next track");
                require(stream.skip(Long.MAX_VALUE)==0&&stream.available()==0,"No bytes after track EOF");
            }
            require(HexFormat.of().formatHex(hash.digest()).equals(row[3]),"Original track SHA256: "+track.id);
            try(InputStream stream=MusicTrackResponse.open(pack,track,"GET",null,HEADERS).getData();RandomAccessFile reference=new RandomAccessFile(pack,"r")) {
                long offset=track.length/2;
                require(stream.skip(offset)==offset,"Skip advances within track");
                reference.seek(track.start+offset);byte[] expected=new byte[32];reference.readFully(expected);
                require(Arrays.equals(stream.readNBytes(32),expected),"Skipped byte position matches the canonical pack");
                require(stream.skip(Long.MAX_VALUE)==track.length-offset-32,"Skip cannot leave the track");
                require(stream.read()==-1,"Skip stops at exact track EOF");
            }
            WebResourceResponse head=MusicTrackResponse.open(pack,track,"HEAD",null,HEADERS);
            require(head.getStatusCode()==200&&Long.toString(track.length).equals(head.getResponseHeaders().get("Content-Length")),"HEAD keeps full metadata");
            try(InputStream stream=head.getData()){require(stream.read()==-1,"HEAD has no audio body");}
            for(String range:new String[]{"bytes=0-","bytes=2000000-","bytes=-65536","invalid",""}) {
                WebResourceResponse denied=MusicTrackResponse.open(pack,track,"GET",range,HEADERS);
                require(denied.getStatusCode()==416&&"0".equals(denied.getResponseHeaders().get("Content-Length")),"Direct Range explicitly rejected");
                try(InputStream stream=denied.getData()){require(stream.read()==-1,"No partial-track bytes escape");}
            }
            WebResourceResponse denied=MusicTrackResponse.open(pack,track,"POST",null,HEADERS);
            require(denied.getStatusCode()==405,"Unsupported method rejected");denied.getData().close();
            if(track.id.equals("original_soundtrack/track1.opus")) {
                // This is the actual delivered v0.21 Java class, renamed only
                // for side-by-side compilation. Chromium applies the same
                // original Range to its returned available/skip stream.
                try(InputStream old=LegacyMusicTrackResponse022.open(pack,track,"GET","bytes=2000000-",HEADERS).getData()) {
                    require(old.available()==track.length-2_000_000,"Legacy reader was already range-sliced");
                    require(2_000_000>=old.available(),"WebView rejects the second range against this shortened stream");
                    legacyFailure=true;
                }
            }
            tracks++;
        }
        require(tracks==39&&legacyFailure,"All tracks and legacy reproduction covered");
        try {
            MusicTrackResponse.open(pack,new MapMusicIndex.Slice("bad",pack.length()-2,pack.length()+3),"GET",null,HEADERS);
            throw new AssertionError("Out-of-pack bounds accepted");
        } catch(IOException expected) {}
        Path tiny=Path.of(args[2],"truncated-track.data");Files.write(tiny,new byte[64]);
        try(InputStream stream=MusicTrackResponse.open(tiny.toFile(),new MapMusicIndex.Slice("tiny",10,50),"GET",null,HEADERS).getData()) {
            try(RandomAccessFile editor=new RandomAccessFile(tiny.toFile(),"rw")){editor.setLength(20);}
            try {stream.readNBytes(40);throw new AssertionError("Premature EOF was silently accepted");}
            catch(EOFException expected) {}
        }
        System.out.println("{\"sourceStreamChecksPassed\":true,\"canonicalTrackHashesMatched\":"+tracks+",\"legacyDoubleRangeFailureReproduced\":true,\"wholeTrackHeaderAndEOFSafety\":true,\"boundedSkipChecked\":true,\"headAndRejectedRangeChecked\":true,\"outOfPackAndPrematureEOFRejected\":true}");
    }
}
