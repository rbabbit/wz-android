package com.rbabbit.blocknight.warzone;

/** Only the unobscured mode-selection Home uses portrait; existing pages do not. */
final class HomeOrientationPolicy {
  private HomeOrientationPolicy() {}

  static boolean usePortrait(boolean homeAttached, boolean homeModesVisible,
      boolean anotherScreenVisible) {
    return homeAttached && homeModesVisible && !anotherScreenVisible;
  }
}
