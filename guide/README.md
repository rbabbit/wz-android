# Offline research catalogue

`build-research-data.py` writes only the new Guide catalogue asset and its proof.
It never regenerates a mission, game VFS, JavaScript loader, native engine or APK.
Run it from the repository root, then run `python guide/check-research-data.py`.

The retained official Warzone 4.7.0 stock prefix supplies multiplayer and Campaign
research and component data. Towers uses the 390-topic multiplayer graph. FFA
uses its exact no-air overlay, displaying the 24 blocked topics with an explicit
mode restriction and retaining the two ground prerequisite replacements. The
implementation-only air sentinel is not presented as a researchable topic.
Campaign has a separate 413-topic graph. Literal artifact references are indexed
from retained mission scripts, with a conditional-availability caveat; their
classic/modern/difficulty branches are not executed or flattened into a mission
order. Campaign includes some scripted references that are not player lab choices.

All prerequisite arrays are AND relationships. Nodes preserve costs, typed
component and structure unlocks, native upgrade effects and replacement links.
Base component numbers do not represent upgraded live units or fixed research
completion times. Existing local research icons are referenced, not copied.

Section explanations are original paraphrases informed by the official-hosted
Guide and official quick-start documentation. They do not reuse the older web
Guide's balance numbers or desktop controls. Each section links its source IDs;
the generated catalogue includes source URLs and version/availability notes.
Native stock data remains attributed to the Warzone 2100 Project and subject to
the licences already retained with the full application source. No website
images or substantial copied prose are added.
