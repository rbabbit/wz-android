"""Host checks of actual0.90 render functions and shared native latch policy."""
from pathlib import Path
import argparse,json,re,runpy,subprocess
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'vendor/native-090'
H=runpy.run_path(str(ROOT/'tools/check-native-selection-089.py'))
POLICY=r'''
#include "mobile-combat-latch-v90.h"
#include <cassert>
#include <iostream>
using Units=std::vector<MobileCombatUnitV90>;
void applyChangesV90(Units &units,const MobileCombatChangesV90 &change){for(auto &u:units){if(change.select.count(u.id))u.selected=true;if(change.deselect.count(u.id))u.selected=false;}}
int main(){unsigned checks=0;MobileCombatLatchV90 p;Units u={{1,true,false},{2,true,false},{3,false,true}};
 assert(!p.intent(true,false,"early","a","",false));++checks;
 p.observeWorld(true,0,100,200);const auto first=p.context;assert(!first.empty()&&!p.enabled);++checks;
 assert(p.intent(true,false,"on","a",first,false));auto c=p.reconcile(u,true);assert(c.select==std::set<uint32_t>({1,2})&&c.deselect==std::set<uint32_t>({3}));applyChangesV90(u,c);++checks;
 assert(!p.reconcile(u,true).changed()&&p.enabled);++checks;
 u.push_back({4,false,false});assert(!p.reconcile(u,true).changed());u.back().combat=true;c=p.reconcile(u,true);assert(c.select==std::set<uint32_t>({4}));applyChangesV90(u,c);++checks;
 assert(p.intent(true,true,"build","a",first,false));u[0].selected=false;u[2].selected=true;assert(!p.reconcile(u,true).changed()&&p.enabled&&p.suspended);++checks;
 assert(p.intent(true,false,"back","a",first,false));c=p.reconcile(u,true);assert(c.select.count(1)&&c.deselect.count(3));applyChangesV90(u,c);++checks;
 assert(p.intent(false,true,"off","a",first,true));assert(!p.enabled&&p.pendingDeselect&&!p.reconcile(u,true).changed());++checks;
 u[2].selected=true;assert(p.intent(false,false,"off-unsuspend","a",first,false));c=p.reconcile(u,true);assert(c.select.empty()&&c.deselect==std::set<uint32_t>({1,2,4}));applyChangesV90(u,c);assert(u[2].selected&&!p.pendingDeselect&&p.deselectNonce=="off"&&p.deselectAppliedNonce=="off");++checks;
 assert(!p.reconcile(u,true).changed());assert(!p.intent(true,false,"late-on","a",first,false));++checks;
 assert(p.intent(true,false,"on2","b",first,false));applyChangesV90(u,p.reconcile(u,true));assert(p.intent(false,true,"off2","b",first,true));assert(p.pendingDeselect);assert(p.intent(true,false,"on3","c",first,false));assert(!p.pendingDeselect&&!p.reconcile(u,true).deselect.count(1));++checks;
 assert(!p.intent(false,false,"late-off","b",first,true));++checks;
 assert(p.intent(false,false,"cleanup","c",first,false));assert(!p.enabled&&!p.pendingDeselect&&!p.reconcile(u,true).changed());++checks;
 assert(p.intent(true,false,"on4","d",first,false));assert(!p.reconcile(u,false).changed()&&p.enabled&&p.suspended);++checks;
 p.observeWorld(false,0,110,210);assert(!p.enabled&&!p.pendingDeselect&&p.context.empty());p.observeWorld(true,1,50,220);assert(p.context!=first);assert(!p.intent(false,false,"stale-world","d",first,true));assert(!p.reconcile(u,true).changed());++checks;
 const auto second=p.context;assert(p.intent(true,false,"on5","e",second,false));assert(p.intent(false,true,"off5","e",second,true));p.observeWorld(true,1,10,230);assert(p.context!=second&&!p.pendingDeselect&&!p.enabled);++checks;
 MobileCombatLatchV90 fast;fast.observeWorld(true,0,1,1);assert(fast.intent(false,false,"fast-off","unseen-on",fast.context,true));assert(fast.pendingDeselect);c=fast.reconcile(u,true);assert(!fast.pendingDeselect&&fast.deselectAppliedNonce=="fast-off");++checks;
 MobileCombatLatchV90 empty;empty.observeWorld(true,0,1,1);Units none;assert(empty.intent(true,false,"empty-on","z",empty.context,false));assert(!empty.reconcile(none,true).changed()&&empty.enabled);none.push_back({99,true,false});assert(empty.reconcile(none,true).select.count(99));++checks;
 std::cout<<"{\"passed\":true,\"transitionChecks\":"<<checks<<",\"globalNewProductionEnrollment\":true,\"offCombatOnlyOnce\":true,\"constructorSuspension\":true,\"contextResetNoNewWorldDeselect\":true}";
}
'''
RENDER=r'''
int main(){unsigned cases=0;for(bool selected:{false,true})for(unsigned body:{10u,50u,100u})for(int shield:{-1,0,50}){
 DROID d;d.selected=selected;d.body=body;d.shieldPoints=shield;BatchedMultiRectRenderer before,after;
 original(&d,selected,before,3);updated(&d,selected,after,3);auto expected=before.rects;
 if(selected)expected.erase(expected.begin(),expected.begin()+4);
 assert(after.rects==expected);assert(d.selected==selected&&d.body==body&&d.shieldPoints==shield);++cases;
}std::cout<<"{\"passed\":true,\"nativeCallerCases\":"<<cases<<",\"selectedBracketsAndHealthAbsent\":true,\"unselectedStatusAndShieldsUnchanged\":true}";}
'''

def health(text):
    m=re.search(r'static void queueDroidPowerBarsRects\(DROID \*psDroid,[^\n]*\)\n\{',text);assert m
    return text[m.start():text.index('\nstatic void queueDroidEnemyHealthBarsRects',m.start())]

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--baseline-project',type=Path,default=Path('/mnt/c/timerApp/candidates/normal-0.89-20261116'))
    p.add_argument('--json-include',type=Path,default=Path('/home/punkech/wz-blueprint-20261107/source/3rdparty/json/include'))
    a=p.parse_args();tests=OUT/'checks';tests.mkdir(parents=True,exist_ok=True);report={}
    def check(name,text):
        source=tests/(name+'.cpp');source.write_text(text);exe=tests/name
        subprocess.run(['g++','-std=c++17','-O2','-I',str(a.json_include),'-I',str(OUT/'source/common'),str(source),'-o',str(exe)],check=True)
        return json.loads(subprocess.check_output([str(exe)],text=True))
    report['policy']=check('latch-policy',POLICY)
    for family in ['offline','multiplayer']:
        before=(a.baseline_project/'vendor/native-089/source'/family/'src/display3d.cpp').read_text();after=(OUT/'source'/family/'src/display3d.cpp').read_text()
        assert after.count('queueDroidPowerBarsRects(psDroid, psDroid->selected,')==1
        report[family+'Render']=check(family+'-render',H['HEAD']+health(before).replace('queueDroidPowerBarsRects','original')+health(after).replace('queueDroidPowerBarsRects','updated')+RENDER)
    report.update(passed=True,actualGameOrAndroidRun=False,scope='Actual shared native policy header and extracted renderer functions; exact APK runtime is separate')
    (tests/'source-checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))

if __name__=='__main__':main()
