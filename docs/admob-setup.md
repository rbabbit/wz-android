# Warzone Towers AdMob setup

The app offers a voluntary rewarded ad in Home and in-game Rewards. One earned
ad adds **10 crystals** to the existing phone wallet. Crystals remain usable
across maps. Ad clicks are not required. Ads that cannot load/show and ads
dismissed before Google's earned event do not grant crystals or block normal
game access.

## Configured identity

| Setting | Value |
| --- | --- |
| Android package | `com.rbabbit.warzonetowers.lab` |
| AdMob app ID | `ca-app-pub-3430279660625393~3119801475` |
| Rewarded unit | `ca-app-pub-3430279660625393/5338770704` |
| Reward name/amount | Crystals / 10 |
| Mobile Ads SDK | `com.google.android.gms:play-services-ads:25.5.0` |
| UMP SDK | `com.google.android.ump:user-messaging-platform:4.0.0` |

These are public app/ad-unit identifiers, not account credentials. Ensure the
rewarded unit's AdMob reward settings also describe ten Crystals so the SDK
and user-facing promise agree. The app itself awards a fixed ten only after
the native earned callback, with persistent duplicate suppression.

## AdMob dashboard tasks

The supplied screenshot shows that the payment profile is complete, while
account approval and linking the app to a supported store remain pending.
Finish those dashboard steps and check the app's readiness/verification status.
Creating an ad unit does not establish account approval or guarantee live ad
fill. See [Google's getting-started guide](https://support.google.com/admob/answer/15948559)
and [app verification guidance](https://support.google.com/admob/answer/14538460).

Publish an accurate privacy policy describing the app and its advertising
data handling. Configure and publish the relevant message(s) in AdMob
**Privacy & messaging**, including the UK/EEA/Switzerland consent flow where
required and other messages appropriate to the app's audience/distribution.
The app's UMP integration retrieves current consent information and presents
required choices before requesting ads. A privacy-options action is available
when UMP requires one. See [Google's UMP guide](https://developers.google.com/admob/android/privacy).
No publisher message was configured in the AdMob account as part of this
delivery, and UMP returned no publisher form during the focused emulator run.
The integration does not reset existing consent choices or force a test
geography. A successful sample ad therefore does not establish coverage of
an externally configured consent form that was not present.

The publisher must choose an accurate audience/age policy and store disclosure
for the actual app; optional ads do not make these declarations unnecessary.
Do not treat the presence of the SDK or consent code as proof that dashboard
messages, privacy-policy URLs or app-review requirements are configured.

## Developer website and VPS

Rewarded ad delivery and local crystal crediting do **not** require a VPS.
Google serves ads to the SDK. This version does not add accounts, a remote
wallet or server-side verification, and makes no VPS changes.

AdMob may require an `app-ads.txt` file for app verification. Host it at the root
of the developer website linked from the app's store listing, such as
`https://your-developer-domain/app-ads.txt`. Copy the personalized seller line
from AdMob's **app-ads.txt → How to set up** view; do not substitute the app ID
or rewarded-ad ID for its publisher ID. Your existing VPS can serve this small
public text file if it hosts that website. Other website hosting also works.
See [Google's setup guide](https://support.google.com/admob/answer/9363762).

Optional future [server-side verification](https://developers.google.com/admob/android/ssv)
can validate Google's signed reward transactions on a backend. It provides
additional protection against spoofed client callbacks. The current phone-only
wallet is not a server-authoritative anti-tampering system.

## Build and test behavior

Normal development builds use Google's official sample app/rewarded IDs. Build
the direct-install delivery with `assembleDebug -PadmobLiveAds=true` to embed
the supplied production IDs. It remains debug-signed with the existing
certificate for compatibility with earlier direct-install versions; this is
separate from a future Play production-signing/distribution setup.

Use sample IDs or explicitly registered test devices during development. Google
automatically treats Android emulators as test devices. In addition, this app's
controller explicitly uses Google's official sample rewarded unit whenever it
detects an Android emulator, including the exact production-ID delivery APK.
Physical devices use the configured unit for their build: the sample unit in
normal development builds and the supplied live unit in the live-ID build.
Never test real ad clicks or repeated production impressions on an ordinary
phone. Register a physical test device in the SDK test configuration or use a
sample-ID development build first. See [test-ad guidance](https://developers.google.com/admob/android/test-ads).

Ad loading depends on network access, consent status, account/app readiness
and available inventory. The app displays a concise status and offers retry
when an ad is unavailable. The game remains playable. No timing promise about
AdMob approval or ad availability is made by the integration.

Focused evidence separates actual emulator observations from simulated SDK
callback fixtures and host-JVM wallet checks. Production fill, revenue, AdMob
dashboard approval and website verification must not be inferred from passing
test ads. Reward presentation follows [Google's rewarded-ad policies](https://support.google.com/admob/answer/7313578).
