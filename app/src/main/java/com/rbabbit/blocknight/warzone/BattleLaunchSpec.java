package com.rbabbit.blocknight.warzone;

/** Validated choices captured once for a battle, including its replay. */
final class BattleLaunchSpec {
  final String matchMode;
  final String duelWeapon;
  final String mapId;
  final String graphicsMode;
  final boolean musicEnabled;

  BattleLaunchSpec(String matchMode, String duelWeapon, String mapId,
      String graphicsMode, boolean musicEnabled) {
    this.matchMode = matchMode(matchMode);
    this.duelWeapon = duelWeapon(duelWeapon);
    this.mapId = "td1".equals(mapId) ? "td1" : "td2";
    this.graphicsMode = "high".equals(graphicsMode) ? "high" : "normal";
    this.musicEnabled = musicEnabled;
  }

  static String matchMode(String value) { return "duel".equals(value) ? "duel" : "towers"; }
  static String duelWeapon(String value) { return "rockets".equals(value) ? "rockets" : "cannon"; }
  boolean isDuel() { return "duel".equals(matchMode); }
  String botWeapon() { return "rockets".equals(duelWeapon) ? "cannon" : "rockets"; }
}
