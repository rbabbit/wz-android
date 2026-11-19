# Warzone Towers 0.99.4 Support test source

This branch preserves the existing complete source history and adds all current app source through 0.99.4, including About & Licences, compact About, replay minimap removal, FFA Challenge, icon/touch refinements, and Satellite Uplink Centre support. Existing map, scenario, tool, vendor and archived native source remain in the Git tree.

Satellite Uplink Centre costs 100 crystals in Support and is limited to one per match; it uses A0Sat-linkCentre and R-Sys-Sensor-UpLink. ATGM design is no longer sold or displayed in the shop; legacy ownership and saves are retained. The three existing data packages include appended reward scripts and updated loader indices; no native engine compile was required.

The normal APK is a release asset. Local complete source ZIP: warzone-towers-0.99.4-support-test-source.zip. Native reward sources are under vendor/support-0994/native-source/, and tools/add-satellite-0994.py records the original packaging reproduction. Normal APK build helper: tools/build-normal-apk.py. Signing credentials are supplied separately and are not committed.

No tests or emulator runs were requested for 0.99.1 through 0.99.4. No VPS/update-feed changes or Google Play publication are included in this GitHub backup.
