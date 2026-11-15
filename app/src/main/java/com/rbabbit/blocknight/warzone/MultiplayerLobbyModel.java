package com.rbabbit.blocknight.warzone;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Presentation of already validated official lobby rows; never a join authority. */
final class MultiplayerLobbyModel {
    static final class Room {
        final String id, map, name;
        final Integer current;
        final int maximum;
        final boolean compatible, ipv4, password;
        Room(String id, String map, String name, Integer current, int maximum,
                boolean compatible, boolean ipv4, boolean password) {
            if (id == null || id.isEmpty() || id.length() > 256 || id.codePoints().anyMatch(p->Character.isWhitespace(p)||Character.isISOControl(p)))
                throw new IllegalArgumentException("Invalid lobby room ID");
            if (maximum < 0 || maximum > 1024 || current != null && (current < 0 || current > maximum))
                throw new IllegalArgumentException("Invalid advertised player count");
            this.id=id;this.map=bounded(map,512);this.name=bounded(name,512);
            this.current=current;this.maximum=maximum;this.compatible=compatible;this.ipv4=ipv4;this.password=password;
        }
        boolean joinable() { return compatible && ipv4 && maximum > 0 && (current == null || current < maximum); }
        String mapLabel() { return map.isEmpty() ? "Map not supplied" : map; }
        String roomLabel() { return (name.isEmpty() ? "Unnamed room" : name) + (password ? " · Password" : ""); }
        String counts() { return current == null ? "Up to " + maximum : current + " | " + maximum; }
        String actionLabel() { return !compatible ? "VERSION" : !ipv4 ? "NO IPv4" : !joinable() ? "FULL" : "JOIN"; }
        String reason() { return !compatible ? "Different engine version" : !ipv4 ? "IPv4 TCP unavailable" : !joinable() ? "Room full" : password ? "Password-protected room" : ""; }
    }
    static List<Room> visible(List<Room> rooms, boolean hideEmpty) {
        List<Room> result=new ArrayList<>();Set<String> seen=new HashSet<>();
        for(Room room:rooms) {
            if(room == null || !seen.add(room.id) || hideEmpty && Integer.valueOf(0).equals(room.current))continue;
            result.add(room);if(result.size()==1000)break;
        }
        // List.sort is stable: preserve official ordering inside each group.
        Collections.sort(result, Comparator.comparingInt(MultiplayerLobbyModel::rank));
        return result;
    }
    private static int rank(Room room) { return room.current==null ? 1 : room.current>0 ? 0 : 2; }
    private static String bounded(String value,int maximum) {
        if(value==null)return "";return value.length()<=maximum?value:value.substring(0,maximum);
    }
    static String limitBase(String value) {
        if(value==null)return "";int count=value.codePointCount(0,value.length());
        return count<=12?value:value.substring(0,value.offsetByCodePoints(0,12));
    }
    private MultiplayerLobbyModel() { }
}
