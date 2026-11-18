package com.rbabbit.blocknight.warzone;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Canonical portable reward stock; shared by wallet policy and the native shop. */
final class RewardCatalog {
  static final class Item {
    final String id, name, category, nativeId, description, kind, requires;
    final int price, maxPerMatch;
    final boolean fortress, moreFortress;

    Item(String id, String name, String category, int price, String nativeId,
        String description, boolean fortress, int maxPerMatch) {
      this.id = id; this.name = name; this.category = category; this.price = price;
      this.nativeId = nativeId; this.description = description;
      this.fortress = fortress; this.maxPerMatch = maxPerMatch;
      this.kind = nativeId.isEmpty() ? "effect" : "structure";
      this.moreFortress = false; this.requires = "";
    }
    Item(String id, String name, String category, int price, String nativeId,
        String description, boolean fortress, String kind, String requires) {
      this.id=id; this.name=name; this.category=category; this.price=price;
      this.nativeId=nativeId; this.description=description; this.fortress=fortress;
      this.kind=kind; this.requires=requires; this.moreFortress=true;
      this.maxPerMatch="structure".equals(kind) ? (fortress ? 3 : 999) : 1;
    }
    boolean structure() { return "structure".equals(kind); }
    boolean consumedOnApply() { return !structure(); }
    boolean inNativeItems() { return !"research".equals(id) && !"supply".equals(id); }
  }

  private static Item building(String id, String name, String category, int price,
      String nativeId, boolean fortress, int maximum) {
    return new Item(id, name, category, price, nativeId,
        "Build normally in this match. Normal power cost applies.", fortress, maximum);
  }

  private static final List<Item> ITEMS = Collections.unmodifiableList(Arrays.asList(
      building("fortress", "Cannon Fortress", "Fortresses", 120, "X-Super-Cannon", true, 3),
      building("missile_fortress", "Missile Fortress", "Fortresses", 180, "X-Super-Missile", true, 3),
      building("mass_driver_fortress", "Mass Driver Fortress", "Fortresses", 200, "X-Super-MassDriver", true, 3),
      building("rocket_bastion", "Heavy Rocket Bastion", "Fortresses", 150, "X-Super-Rocket", true, 3),
      building("gauss_hardpoint", "Gauss Cannon Hardpoint", "Defences", 25, "WallTower-Rail3", false, 999),
      building("gauss_emplacement", "Gauss Cannon Emplacement", "Defences", 25, "Emplacement-Rail3", false, 999),
      building("scourge_hardpoint", "Scourge Missile Hardpoint", "Defences", 20, "WallTower-Atmiss", false, 999),
      building("pulse_hardpoint", "Pulse Laser Hardpoint", "Defences", 15, "WallTower-PulseLas", false, 999),
      building("heavy_laser", "Heavy Laser Emplacement", "Defences", 25, "Emplacement-HeavyLaser", false, 999),
      building("emp_hardpoint", "EMP Cannon Hardpoint", "Defences", 20, "WallTower-EMP", false, 999),
      building("emp_mortar", "EMP Mortar Pit", "Artillery", 15, "Emplacement-MortarEMP", false, 999),
      building("archangel", "Archangel Missile Emplacement", "Artillery", 30, "Emplacement-HvART-pit", false, 999),
      building("ripple", "Ripple Rocket Battery", "Artillery", 10, "Emplacement-Rocket06-IDF", false, 999),
      building("hellstorm", "Hellstorm Emplacement", "Artillery", 20, "Emplacement-RotHow", false, 999),
      building("ground_shaker", "Ground Shaker Emplacement", "Artillery", 20, "Emplacement-Howitzer150", false, 999),
      building("wide_sensor", "Wide Spectrum Sensor Tower", "Support", 10, "Sys-SensoTowerWS", false, 999),
      building("laser_sat", "Laser Satellite Command Post", "Support", 250, "A0LasSatCommand", false, 1),
      new Item("research", "Research accelerator", "Support", 60, "",
          "25% faster research for one match. You choose the topics.", false, 1),
      new Item("supply", "Supply reserve", "Support", 30, "",
          "+1,000 starting power for one match.", false, 1),
      more("mf_aa_flak", "AA Flak Fortress", "Fortresses", 140, "X-Super-AA", true,
          "Air targets only. Survival incoming waves are ground-only. Normal build power applies."),
      more("mf_assault_gun", "Assault Gun Fortress", "Fortresses", 110, "X-Super-AG", true,
          "Rapid-fire ground and air defence. Normal build power applies."),
      more("mf_flamer", "Flamer Fortress", "Fortresses", 110, "X-Super-Flame", true,
          "Short-range ground flame defence. Normal build power applies."),
      more("mf_laser", "Laser Fortress", "Fortresses", 200, "X-Super-Laser", true,
          "Ground and air laser defence. Normal build power applies."),
      more("mf_rim116", "RIM-116 AA Fortress", "Fortresses", 220, "X-Super-RIM116", true,
          "Air targets only. Survival incoming waves are ground-only. Normal build power applies."),
      more("mf_howitzer", "M1299 Howitzer Fortress", "Fortresses", 240, "X-Super-Howitzer", true,
          "Long-range ground artillery with a minimum firing range. Normal build power applies."),
      more("mf_atgm_emplacement", "ATGM Emplacement", "Defences", 35, "Emplacement-ATGM", false,
          "Ground anti-tank missiles with a minimum firing range. Normal build power applies."),
      new Item("mf_atgm_design", "ATGM design licence", "Support", 60, "Rocket-ATGM",
          "Unlocks the ATGM weapon in Design for this run. Normal manufacturing power applies.", false, "component", ""),
      new Item("mf_fortress_sensor", "Fortress sensor upgrade", "Support", 40, "FortressSensor",
          "+48% of base fortress sensor range for this run. Does not unlock a fortress.", false, "upgrade", ""),
      new Item("mf_concrete_1", "Concrete I", "Support", 40, "",
          "+100% of base wall and defence hit points for this run.", false, "upgrade", ""),
      new Item("mf_concrete_2", "Concrete II", "Support", 70, "",
          "Requires Concrete I. Adds another +100% of base wall and defence hit points.", false, "upgrade", "mf_concrete_1"),
      new Item("mf_concrete_3", "Concrete III", "Support", 100, "",
          "Requires Concrete II. Adds another +100% of base wall and defence hit points; no healing effect.", false, "upgrade", "mf_concrete_2")));

  private static Item more(String id, String name, String category, int price, String nativeId,
      boolean fortress, String description) {
    return new Item(id,name,category,price,nativeId,description,fortress,"structure","");
  }

  static String profile(String value) {
    if (!"towers".equals(value) && !"survival".equals(value))
      throw new IllegalArgumentException("Rewards are only available in Waves and Survival.");
    return value;
  }
  static void requireEligible(Item item, String profile, String map) {
    profile(profile);
    if (map == null || map.isEmpty() || "survival".equals(profile)
        && !"tdn2".equals(map) && !"wave".equals(map))
      throw new IllegalArgumentException("This map is not eligible for these Rewards.");
  }
  static void requireDependencies(Map<String,Integer> selected) {
    for (String id : selected.keySet()) {
      Item item=get(id);
      if (selected.get(id)>0 && !item.requires.isEmpty() && selected.getOrDefault(item.requires,0)<1)
        throw new IllegalArgumentException("Select " + get(item.requires).name + " before " + item.name + ".");
    }
  }

  private static final Map<String, Item> BY_ID;
  static {
    Map<String, Item> values = new LinkedHashMap<>();
    for (Item item : ITEMS) {
      if (values.put(item.id, item) != null) throw new IllegalStateException("Duplicate reward item.");
    }
    BY_ID = Collections.unmodifiableMap(values);
  }

  static List<Item> list() { return ITEMS; }
  static List<Item> items() { return ITEMS; }
  static Item get(String id) {
    Item item = BY_ID.get(id);
    if (item == null) throw new IllegalArgumentException("Unknown reward item.");
    return item;
  }

  private RewardCatalog() { }
}
