package com.rbabbit.blocknight.warzone;

/** Validated choices captured once for a battle, including its replay. */
final class BattleLaunchSpec {
  final String matchMode;
  final String duelWeapon;
  final String mapId;
  final boolean musicEnabled;

  BattleLaunchSpec(String matchMode, String duelWeapon, String mapId, boolean musicEnabled) {
    this.matchMode = matchMode(matchMode);
    this.duelWeapon = duelWeapon(duelWeapon);
    this.mapId = mapId(mapId);
    this.musicEnabled = musicEnabled;
  }

  static String matchMode(String value) { return "duel".equals(value) ? "duel" : "towers"; }
  static String duelWeapon(String value) { return "rockets".equals(value) ? "rockets" : "cannon"; }
  static String mapId(String value) {
    return MapLevelCatalog.normalizeId(value);
  }
  boolean isDuel() { return "duel".equals(matchMode); }
  String botWeapon() { return "rockets".equals(duelWeapon) ? "cannon" : "rockets"; }
}
