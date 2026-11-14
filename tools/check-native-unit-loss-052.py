"""Compile the real loss helper and caller, with controlled marker/audio stubs."""
from pathlib import Path
from hashlib import sha256
import argparse,json,os,subprocess,tempfile
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'archive/native-unit-loss-0.52'

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--cache',type=Path,required=True);args=parser.parse_args();assert os.name!='nt'
    source=(OUT/'droid.cpp').read_text();a=source.index('#if defined(__EMSCRIPTEN__)\n#include <nlohmann/json.hpp>');b=source.index('#define DEFAULT_RECOIL_TIME',a);helper=source[a:b]
    a=source.index('\t\t// Deal with score increase/decrease and messages to the player');b=source.index('\n\t\t// Do we have a dying animation?',a);caller=source[a:b]
    stub=r'''
#include <cassert>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#include <iostream>
#include <nlohmann/json.hpp>
enum {DROID_CONSTRUCT=1,DROID_CYBORG_CONSTRUCT=2,DROID_WEAPON=3,WD_UNITS_LOST=4,WD_UNITS_KILLED=5,ID_SOUND_UNIT_DESTROYED=6,UNIT_LOST_DELAY=7,MAX_PLAYERS=8};
struct DROID{unsigned id;char aName[128];int droidType;unsigned player;struct {int x,y,z;}pos;};
unsigned gameTime=123400,selectedPlayer=0;int stockNotices=0,lost=0,killed=0,sounds=0;bool marker=false;char markerContent='1';
FILE*fixtureOpen(const char*path,const char*){assert(std::string(path)=="/tmp/warzone-towers-ui-v34");return marker?fmemopen(&markerContent,1,"r"):nullptr;}
const char*objInfo(const DROID*d){return d->aName;}
void scoreUpdateVar(int value){if(value==WD_UNITS_LOST)++lost;else if(value==WD_UNITS_KILLED)++killed;else assert(false);}
void audio_QueueTrackMinDelayPos(int,int,int,int,int){++sounds;}
bool aiCheckAlliances(unsigned,unsigned){return false;}
#define CONPRINTF(...) (++stockNotices)
#define _(x) x
#define fopen fixtureOpen
'''
    cases=r'''
void fatalLoss(DROID*psDroid){CALLER}
#undef fopen
int main(){
 DROID d{42,"initial",DROID_CONSTRUCT,0,{1,2,3}};
 std::strcpy(d.aName,"Truck \"Viper\"\nWheels \xc2\xa3");
 marker=false;fatalLoss(&d);assert(stockNotices==1&&lost==1&&sounds==1);
 marker=true;markerContent='0';fatalLoss(&d);assert(stockNotices==2&&lost==2&&sounds==2);
 markerContent='1';fatalLoss(&d);
#if defined(__EMSCRIPTEN__)
 assert(stockNotices==2);
#else
 assert(stockNotices==3);
#endif
 d.id=43;d.droidType=DROID_CYBORG_CONSTRUCT;fatalLoss(&d);
 d.id=44;d.droidType=DROID_WEAPON;std::strcpy(d.aName,"Tank");fatalLoss(&d);
 d.id=45;d.player=1;fatalLoss(&d);assert(lost==5&&sounds==5&&killed==1);
 std::cout<<"caller score/audio preserved, marker and stock branches passed\n";
}
'''.replace('CALLER',caller)
    # Keep the actual helper/caller unedited; only these declarations are stubs.
    probe=stub+helper+cases;(OUT/'unit-loss-caller-probe.cpp').write_text(probe,encoding='utf-8',newline='\n')
    packets=[]
    with tempfile.TemporaryDirectory(prefix='unit-loss052-') as folder:
        cpp=Path(folder)/'probe.cpp';cpp.write_text(probe)
        for emscripten in [False,True]:
            binary=Path(folder)/('web' if emscripten else 'native')
            command=['c++','-std=c++17','-I'+str(args.cache/'source/3rdparty/json/include'),str(cpp),'-o',str(binary)]
            if emscripten:command.append('-D__EMSCRIPTEN__')
            subprocess.run(command,check=True,capture_output=True)
            result=subprocess.run([str(binary)],check=True,capture_output=True,text=True)
            actual=[json.loads(line.split(':',1)[1]) for line in result.stderr.splitlines() if line.startswith('BNNOTICE:')]
            if not emscripten:assert actual==[]
            else:
                assert len(actual)==3;packets=actual
                assert [p['id'] for p in actual]==[42,43,44]
                assert [p['constructor'] for p in actual]==[True,True,False]
                assert all(type(p['id'])==int and type(p['constructor'])==bool and p['player']==0 and p['gameTime']==123400 and p['kind']=='unit-lost' for p in actual)
                assert actual[0]['name']=='Truck "Viper"\nWheels £'
    proof={'version':'0.52','passed':True,'actualHelperAndFatalCallerCompiled':True,'sourceSHA256':sha256((helper+caller).encode()).hexdigest(),'nativeAndEmscriptenModes':True,'markerAbsentAndDisabledStock':True,'foreignLossNotEmitted':True,'scoreAndSoundPreserved':True,'typedPacketsAndEscapedNames':True,'packetExamples':packets,'emulatorUsed':False}
    (OUT/'source-checks.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof))

if __name__=='__main__':main()
