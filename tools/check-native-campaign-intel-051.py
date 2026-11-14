"""Compile the actual Intel caller against widget stubs to check its narrow guard."""
from pathlib import Path
from hashlib import sha256
import json,os,subprocess,tempfile
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'archive/native-campaign-0.51'
def main():
    assert os.name!='nt','Run host C++ probe in WSL'
    source=(OUT/'intel-hci.cpp').read_text();a=source.index('void addIntelScreen()\n{');b=source.index('//sets up the Transporter Screen',a);body=source[a:b]
    stub=r'''
#include <cassert>
#include <iostream>
constexpr int INT_NORMAL=0, INT_INTELMAP=1, IDRET_INTEL_MAP=6, WBUT_CLICKLOCK=1;
int intMode=INT_NORMAL,psWScreen=1;bool campaign=false,present=false;
int resets=0,locks=0,errors=0,panels=0,power=0;
bool campaignMobileEnabled(){return campaign;}
void intResetScreen(bool){++resets;}
void intHideGroupSelectionMenu(){}
void* widgGetFromID(int,int){return present?&psWScreen:nullptr;}
void widgSetButtonState(int,int,int){++locks;if(!present)++errors;}
void intShowPowerBar(){++power;}
bool intAddIntelMap(){++panels;return true;}
'''
    cases=r'''
int main(){
 for(bool c:{false,true})for(bool p:{false,true}){
  campaign=c;present=p;intMode=INT_NORMAL;resets=locks=errors=panels=power=0;
  addIntelScreen();assert(resets==1&&panels==1&&power==1&&intMode==INT_INTELMAP);
  assert(locks==((!c||p)?1:0));assert(errors==((!c&&!p)?1:0));
  addIntelScreen();assert(resets==1&&panels==1); // already open is unchanged
 }
 std::cout<<"four caller combinations and already-open checks passed\n";
}
'''
    probe=stub+body+cases
    (OUT/'intel-caller-probe.cpp').write_text(probe,encoding='utf-8',newline='\n')
    with tempfile.TemporaryDirectory(prefix='campaign-intel051-') as folder:
        cpp=Path(folder)/'probe.cpp';binary=Path(folder)/'probe';cpp.write_text(probe)
        subprocess.run(['c++','-std=c++17',str(cpp),'-o',str(binary)],check=True,capture_output=True)
        result=subprocess.check_output([str(binary)],text=True).strip()
    proof={'version':'0.51','passed':True,'method':'Actual addIntelScreen body compiled against widget/native-state stubs','callerSourceSHA256':sha256(body.encode()).hexdigest(),'combinations':4,'alreadyOpenCases':4,'campaignAbsentOptionalButtonDoesNotAssert':True,'nonCampaignMissingButtonPolicyUnchanged':True,'nativeIntelSetupPreserved':True,'emulatorUsed':False,'result':result}
    (OUT/'intel-source-checks.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof))
if __name__=='__main__':main()
