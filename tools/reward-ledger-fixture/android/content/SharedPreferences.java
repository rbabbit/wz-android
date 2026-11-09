package android.content;

/** Only the actual RewardStore's string-record boundary is simulated. */
public interface SharedPreferences {
  String getString(String key, String fallback);
  Editor edit();
  interface Editor {
    Editor putString(String key, String value);
    boolean commit();
  }
}
