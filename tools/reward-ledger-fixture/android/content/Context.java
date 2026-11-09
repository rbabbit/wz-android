package android.content;

/** Host-only boundary fixture; never part of Android app sources. */
public abstract class Context {
  public static final int MODE_PRIVATE = 0;
  public abstract SharedPreferences getSharedPreferences(String name, int mode);
}
