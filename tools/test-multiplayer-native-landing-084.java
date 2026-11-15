package com.rbabbit.blocknight.warzone;
import java.util.Arrays;
import java.util.List;
final class CheckMultiplayerLanding084 {
    static int assertions;
    static void check(boolean value,String label){assertions++;if(!value)throw new AssertionError(label);}
    static MultiplayerLobbyModel.Room room(String id,Integer n,int max){return new MultiplayerLobbyModel.Room(id,"EMAJ","Real room",n,max,true,true,false);}
    public static void main(String[] args){
        MultiplayerLobbyModel.Room occupied=room("occupied",2,6),empty=room("empty",0,4),unknown=room("unknown",null,8);
        List<MultiplayerLobbyModel.Room> visible=MultiplayerLobbyModel.visible(Arrays.asList(empty,unknown,occupied,occupied),false);
        check(visible.size()==3&&visible.get(0)==occupied&&visible.get(1)==unknown&&visible.get(2)==empty,"Stable occupied/unknown/empty ordering and unique IDs");
        visible=MultiplayerLobbyModel.visible(Arrays.asList(empty,unknown,occupied),true);
        check(visible.size()==2&&visible.get(1)==unknown,"Hide only known zero");
        check(occupied.mapLabel().equals("EMAJ"),"Never rename real map to mock spelling");
        check(occupied.counts().equals("2 | 6"),"Compact actual count");check(unknown.counts().equals("Up to 8"),"Unknown is not fabricated occupancy");
        check(occupied.joinable()&&unknown.joinable(),"Available actual and unknown rooms join");
        check(!room("full",4,4).joinable()&&room("full",4,4).actionLabel().equals("FULL"),"Full disabled");
        check(!new MultiplayerLobbyModel.Room("v","x","y",1,4,false,true,false).joinable(),"Version blocked");
        check(new MultiplayerLobbyModel.Room("v","x","y",1,4,false,true,false).actionLabel().equals("VERSION"),"Version reason visible without version strings");
        check(!new MultiplayerLobbyModel.Room("ip6","x","y",1,4,true,false,false).joinable(),"Missing IPv4 blocked");
        check(new MultiplayerLobbyModel.Room("pw","x","y",1,4,true,true,true).roomLabel().endsWith("Password"),"Password marked, no invented support");
        check(new MultiplayerLobbyModel.Room("blank","","",null,4,true,true,false).mapLabel().equals("Map not supplied"),"Blind/absent map truthful");
        for(String id:new String[]{"","bad id","bad\nid"}){boolean denied=false;try{room(id,0,4);}catch(IllegalArgumentException e){denied=true;}check(denied,"Malformed ID refused");}
        for(int[] counts:new int[][]{{-1,4},{5,4},{0,-1},{0,1025}}){boolean denied=false;try{room("bad",counts[0],counts[1]);}catch(IllegalArgumentException e){denied=true;}check(denied,"Malformed counts refused");}
        check(MultiplayerLobbyModel.limitBase("abcdefghijklm").equals("abcdefghijkl"),"ASCII12");
        String rockets="🚀".repeat(13),limited=MultiplayerLobbyModel.limitBase(rockets);check(limited.codePointCount(0,limited.length())==12&&limited.length()==24,"12 complete astral codepoints");
        check(new MultiplayerLobbyModel.Room("literal","<b>EMAJ</b>","<img src=x>",1,4,true,true,false).mapLabel().equals("<b>EMAJ</b>"),"Native text stays literal");
        System.out.println("{\"passed\":true,\"assertions\":"+assertions+"}");
    }
}
