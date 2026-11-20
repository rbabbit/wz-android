package com.rbabbit.blocknight.warzone;

/** Validated choices captured once for a battle, including its replay. */
final class BattleLaunchSpec {
  static final String CRYSTAL_SKIRMISH_MAP = "crystal-skirmish";
  final String matchMode;
  final String duelWeapon;
  final String mapId;
  final boolean musicEnabled;
  final String ffaDifficulty;
  final String ffaBotType;
  final int[] mapTeams;

  BattleLaunchSpec(String matchMode, String duelWeapon, String mapId, boolean musicEnabled) {
    this(matchMode, duelWeapon, mapId, musicEnabled, "easy");
  }

  BattleLaunchSpec(String matchMode, String duelWeapon, String mapId, boolean musicEnabled, String difficulty) {
    this(matchMode, duelWeapon, mapId, musicEnabled, difficulty, "cobra");
  }

  BattleLaunchSpec(String matchMode, String duelWeapon, String mapId, boolean musicEnabled, String difficulty, String botType) {
    this(matchMode, duelWeapon, mapId, musicEnabled, difficulty, botType, null);
  }

  BattleLaunchSpec(String matchMode, String duelWeapon, String mapId, boolean musicEnabled, String difficulty, String botType, int[] teams) {
    this.matchMode = matchMode(matchMode);
    this.duelWeapon = duelWeapon(duelWeapon);
    this.mapId = "challenge".equals(this.matchMode) ? challengeMapId(mapId)
        : "ffa".equals(this.matchMode) ? (CRYSTAL_SKIRMISH_MAP.equals(mapId) ? mapId : ffaMapId(mapId))
        : "survival".equals(this.matchMode) ? SurvivalMapCatalog.get(mapId).id : mapId(mapId);
    this.musicEnabled = musicEnabled;
    this.ffaDifficulty = ffaDifficulty(difficulty);
    this.ffaBotType = "challenge".equals(this.matchMode) ? "dumbot25a" : ffaBotType(botType);
    if (teams != null && (!isFfa() || !FfaMapCatalog.isDownloaded(this.mapId)))
      throw new IllegalArgumentException("Team selection is available for downloaded Maps games.");
    this.mapTeams = teams == null ? null : MapsTeamSetup.validate(teams, FfaMapCatalog.playerCount(this.mapId));
  }

  static String matchMode(String value) {
    return "challenge".equals(value) ? "challenge" : "survival".equals(value) ? "survival" : "ffa".equals(value) ? "ffa" : "campaign".equals(value) ? "campaign" : "duel".equals(value) ? "duel" : "towers";
  }
  static String ffaDifficulty(String value) {
    String normalized = value == null ? "" : value.toLowerCase(java.util.Locale.ROOT);
    return "hard".equals(normalized) ? "hard" : "medium".equals(normalized) ? "medium" : "easy";
  }
  static String ffaBotType(String value) {
    if (value == null || value.isEmpty() || "nullbot".equals(value)) return "nullbot";
    if (MapsBotCatalog.isKnownId(value)) return value;
    throw new IllegalArgumentException("Invalid FFA bot identity.");
  }
  static String ffaBotName(String value) { return MapsBotCatalog.get(ffaBotType(value)).name; }
  static String ffaMapId(String value) {
    if (value == null || value.isEmpty()) return "emag";
    if (!FfaMapCatalog.isKnownId(value)) throw new IllegalArgumentException("Unknown FFA map.");
    return value;
  }
  boolean isFfa() { return "ffa".equals(matchMode); }
  boolean isCrystalSkirmish() { return isFfa() && CRYSTAL_SKIRMISH_MAP.equals(mapId); }
  boolean isChallenge() { return "challenge".equals(matchMode); }
  static String challengeMapId(String value) {
    if (!ChallengeMapCatalog.isKnownId(value)) throw new IllegalArgumentException("Unknown Challenge map.");
    return value;
  }
  static String duelWeapon(String value) { return "rockets".equals(value) ? "rockets" : "cannon"; }
  static String mapId(String value) {
    return MapLevelCatalog.normalizeId(value);
  }
  boolean isDuel() { return "duel".equals(matchMode); }
  boolean isCampaign() { return "campaign".equals(matchMode); }
  boolean isSurvival() { return "survival".equals(matchMode); }
  static String campaignChapter(String level) {
    String name = level == null ? "" : level.toUpperCase(java.util.Locale.ROOT);
    if (name.startsWith("CAM_1") || name.startsWith("SUB_1")) return "Alpha campaign";
    if (name.startsWith("CAM_2") || name.startsWith("SUB_2")) return "Beta campaign";
    if (name.startsWith("CAM_3") || name.startsWith("SUB_3")) return "Gamma campaign";
    return "Campaign";
  }
  String botWeapon() { return "rockets".equals(duelWeapon) ? "cannon" : "rockets"; }
}
