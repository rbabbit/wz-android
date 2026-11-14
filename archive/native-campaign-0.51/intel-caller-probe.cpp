
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
void addIntelScreen()
{
	if (intMode == INT_INTELMAP)
	{
		// screen is already up - do nothing
		return;
	}

	intResetScreen(false);
	intHideGroupSelectionMenu();

	intMode = INT_INTELMAP;

	//lock the reticule button
	// The Campaign mobile host removes the stock reticule. Intel itself
	// remains native; only lock its optional button when that button exists.
	if (!campaignMobileEnabled() || widgGetFromID(psWScreen, IDRET_INTEL_MAP) != nullptr)
	{
		widgSetButtonState(psWScreen, IDRET_INTEL_MAP, WBUT_CLICKLOCK);
	}

	//add the power bar - for looks!
	intShowPowerBar();

	//add all the intelligence screen interface
	(void)intAddIntelMap();
}


int main(){
 for(bool c:{false,true})for(bool p:{false,true}){
  campaign=c;present=p;intMode=INT_NORMAL;resets=locks=errors=panels=power=0;
  addIntelScreen();assert(resets==1&&panels==1&&power==1&&intMode==INT_INTELMAP);
  assert(locks==((!c||p)?1:0));assert(errors==((!c&&!p)?1:0));
  addIntelScreen();assert(resets==1&&panels==1); // already open is unchanged
 }
 std::cout<<"four caller combinations and already-open checks passed\n";
}
