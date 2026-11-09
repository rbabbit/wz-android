package com.rbabbit.blocknight.warzone;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Canonical portable reward stock; shared by wallet policy and the native shop. */
final class RewardCatalog {
  static final class Item {
    final String id, name, category, nativeId, description;
    final int price, maxPerMatch;
    final boolean fortress;

    Item(String id, String name, String category, int price, String nativeId,
        String description, boolean fortress, int maxPerMatch) {
      this.id = id; this.name = name; this.category = category; this.price = price;
      this.nativeId = nativeId; this.description = description;
      this.fortress = fortress; this.maxPerMatch = maxPerMatch;
    }
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
          "+1,000 starting power for one match.", false, 1)));

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
