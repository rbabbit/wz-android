"""Compile the actual client-selection helper with deterministic unit views.
This is source-only policy verification, not native engine/emulator gameplay.
"""
from pathlib import Path
import hashlib,json,subprocess,tempfile

ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/'vendor/multiplayer/native-071/mobile-ui-native.cpp.inc').read_text()
policy=source.split('// BEGIN MP_COMBAT_SELECTION_POLICY\n',1)[1].split('// END MP_COMBAT_SELECTION_POLICY',1)[0]
predicate=source.split('static bool mpMobileCombatEligible(',1)[1].split('\n}',1)[0]
predicate='static bool mpMobileCombatEligible('+predicate+'\n}\n'
fixture=r'''
struct Weapon { unsigned nStat=0; };
struct DROID {unsigned player=0;Weapon asWeaps[1];bool transporter=false,selectable=true;bool isTransporter()const{return transporter;}};
static unsigned selectedPlayer=2;
bool isSelectable(const DROID *d){return d->selectable;}
'''
tests=r'''
int main(){
 DROID armed;armed.player=2;armed.asWeaps[0].nStat=1;assert(mpMobileCombatEligible(&armed));
 DROID support=armed;support.asWeaps[0].nStat=0;assert(!mpMobileCombatEligible(&support));
 DROID transporter=armed;transporter.transporter=true;assert(!mpMobileCombatEligible(&transporter));
 DROID enemy=armed;enemy.player=1;assert(!mpMobileCombatEligible(&enemy));
 DROID unselectable=armed;unselectable.selectable=false;assert(!mpMobileCombatEligible(&unselectable));
 MpCombatSelectionPolicy p;
 std::vector<MpCombatSelectionUnit> units={{1,true,false},{2,true,false},{3,false,true}};
 auto apply=[&]{for(auto &u:units)u.selected=p.expectedSelection.count(u.id)>0;};
 assert(!p.enabled);p.intent(true,false,"on-1");assert(p.reconcile(units,true));
 assert(p.expectedSelection==std::set<uint32_t>({1,2}));apply();assert(!p.reconcile(units,true));
 units.push_back({5,true,false});assert(p.reconcile(units,true));assert(p.expectedSelection.count(5));apply();
 units.push_back({6,false,true});assert(p.reconcile(units,true));assert(p.enabled&&!p.expectedSelection.count(6));apply();
 units.erase(units.begin());assert(!p.reconcile(units,true));assert(p.enabled&&!p.expectedSelection.count(1));
 units.erase(units.begin());assert(!p.reconcile(units,true));assert(p.enabled&&!p.expectedSelection.count(2));
 for(auto &u:units)u.selected=u.id==3;assert(!p.reconcile(units,true));assert(!p.enabled&&p.reason=="manual-selection");
 p.intent(true,true,"build-pause");units.push_back({7,true,false});assert(!p.reconcile(units,true));assert(p.enabled&&p.suspended);
 assert(units[0].selected);p.intent(true,false,"build-resume");assert(p.reconcile(units,true));apply();
 assert(p.expectedSelection==std::set<uint32_t>({5,7}));assert(!p.reconcile(units,true));
 assert(!p.reconcile(units,false));assert(p.enabled&&p.suspended);
 assert(!p.reconcile(units,true));assert(p.enabled&&!p.suspended);
 p.intent(false,false,"off");units.push_back({8,true,false});assert(!p.reconcile(units,true));assert(!p.enabled&&!units.back().selected);
 p.intent(true,false,"on-2");assert(p.reconcile(units,true));apply();
 for(auto &u:units)if(u.id==7)u.selected=false;
 assert(!p.reconcile(units,true));assert(!p.enabled&&p.reason=="manual-selection");
 p.intent(true,false,"on-3","user-on-3");assert(p.reconcile(units,true));apply();
 p.stop("manual-selection");p.intent(true,false,"late-unsuspend","user-on-3");
 assert(!p.enabled&&p.requestNonce=="late-unsuspend");assert(!p.reconcile(units,true));
 p.intent(false,false,"off-after-manual","user-on-3");p.intent(true,false,"late-again","user-on-3");assert(!p.enabled);
 p.intent(true,false,"deliberate-on","user-on-4");assert(p.enabled);p.reconcile(units,true);apply();
 p.intent(true,false,"old-activation-after-new","user-on-3");assert(p.enabled&&p.activation=="user-on-4");
 p.stop("session-ended");assert(!p.enabled);
}
'''
unit='#include <vector>\n#include <set>\n#include <string>\n#include <cstdint>\n#include <utility>\n#include <cassert>\n'+fixture+predicate+policy+tests
with tempfile.TemporaryDirectory(prefix='mp-combat-071-') as scratch:
 path=Path(scratch);(path/'probe.cpp').write_text(unit)
 subprocess.run(['g++','-std=c++17','-O2',str(path/'probe.cpp'),'-o',str(path/'probe')],check=True)
 subprocess.run([str(path/'probe')],check=True)
record={'passed':True,'fixture':'Actual native helper/predicate compiled with source-only deterministic unit views; not engine gameplay',
 'sourceSHA256':hashlib.sha256(source.encode()).hexdigest(),
 'checks':['own armed first weapon','all-map scope without screen predicate','support/transporter/enemy/unselectable exclusion','new combat birth',
 'stock newborn support selection corrected','death','ownership removal','manual selection/control group override','temporary build suspension/resume',
 'unsafe world gate','ordinary unchanged selection idempotence','OFF preserves selection and excludes births',
 'manual override rejects late same-activation ON','new deliberate activation enables','session reset']}
(ROOT/'qa/multiplayer-071/native-combat-policy-check.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record))
