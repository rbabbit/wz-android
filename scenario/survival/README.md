# Survival0.94 source

This is an isolated native scenario inside the Towers family. It reuses the
accepted0.93 Towers JS/WASM program. It does not rebuild or patch native code.

`vendor/survival-094/original/emag-survival.zip` retains the exact supplied
archive, including both original five-slot WZ maps and the supplied Tower
Defense scripts. `MoreFortress-v0.6.wz` in that directory is also unchanged.
The package report records both SHA256 identities.

The new `tdn2` and `wave` variants retain the original terrain, features and
position0/1 object sections. These are converted to the engine-supported
version2 JSON object format, preserving IDs, transforms, templates and modules;
start positions0/1 are swapped so original corner1 is native human0/start0 and
original center0 is native enemy1/start1. The source INIs are retained. This
normalization also matches the app's native lobby Ready row. Unused defender
positions2–4 are omitted. The supplied enemy setup removes its
starting objects and spawns its army around eligible reachable map edges.
Distinct level IDs, data package and `/warzone2100-survival-<map>` config roots
keep these saves separate from existing Waves and other modes.

The authored configuration remains byte-identical:60rounds,240seconds initial
preparation,120first-round units and25seconds until round2. Existing phone
wave/skip/kill-Power/research/command/reward adapters observe that one scheduler.
The existing mobile objective observer uses the supplied HQ survival and
end-of-schedule victory rules. No extra wave loop or starting Power is added.

MoreFortress imports only7weapon stats,7structure stats and PIE assets into
the Waves/Survival packages. The native research JSON stays byte-identical;
no MoreFortress research topics or diff directory are mounted. Paid availability
and concrete effects are implemented by the shared crystal Rewards code,
which is owned separately. Native `wt_rewardContext()` matches the engine's
read-only map name against the closed profile table before a new purchase.

Regenerate after shared Rewards/catalog source edits:

```powershell
python tools/integrate-survival-094.py
python tools/check-survival-094.py
```

The retained baseline index/hash lets the helper rebuild deterministically from
the original prefix within the packaged Towers data. Frozen loader inputs are
retained as source. Atomic output replacement avoids mutating retained hardlinks.
Campaign, FFA, Duel, MP and the0.93 WASM files are outside this package change.

Static checks cover package identities, mode boundaries, declarations and early
configuration. Exact delivery-APK checks are performed separately in the owned
emulator and recorded by the parent task. The user's scope is early gameplay
only: later-wave balance, performance and full60-round victory are unverified.
