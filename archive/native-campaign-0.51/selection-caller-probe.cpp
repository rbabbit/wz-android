
#include <cassert>
#include <cstdio>
#include <cstring>
#include <cstdint>
#include <map>
#include <string>
#include <vector>
#include <iostream>
#include <nlohmann/json.hpp>
struct JSContext{};using JSValue=int;using JSValueConst=int;constexpr int JS_FALSE=0,JS_TRUE=1;
struct Weapon{int nStat;};
struct DROID{unsigned id;Weapon asWeaps[1];bool selected,transport,selectable;int order,x,y;bool isTransporter()const{return transport;}};
bool isSelectable(const DROID*d){return d->selectable&&!d->transport;}
std::vector<DROID*> apsDroidLists[1];unsigned selectedPlayer=0;
enum class LEVEL_TYPE{CAMPAIGN,SKIRMISH};struct{LEVEL_TYPE type=LEVEL_TYPE::CAMPAIGN;}game;
struct Instance{int me=0;int player(){return me;}}instance;
std::map<JSContext*,Instance*>engineToInstanceMap;
bool enabledMode=true,worldSafe=true,allowFile=true;int refreshes=0,events=0,resultCount=-1;
std::string control=R"({"enabled":true,"suspended":false})";std::vector<char>controlBytes;std::vector<unsigned>resultIds;
bool campaignMobileScriptEnabled(){return enabledMode;}
std::string campaignMobileNativeStateJSON(){return nlohmann::json{{"worldSafe",worldSafe}}.dump();}
void intRefreshScreen(){++refreshes;}void triggerEventSelected(){++events;}
JSValue JS_NewObject(JSContext*){resultIds.clear();resultCount=-1;return 7;}
JSValue JS_NewArray(JSContext*){return 8;}JSValue JS_NewUint32(JSContext*,unsigned n){return n;}
int JS_SetPropertyUint32(JSContext*,int,unsigned,int value){resultIds.push_back(value);return 1;}
int JS_SetPropertyStr(JSContext*,int,const char*key,int value){if(std::strcmp(key,"count")==0)resultCount=value;return 1;}
FILE*fixtureOpen(const char*,const char*){if(!allowFile)return nullptr;controlBytes.assign(control.begin(),control.end());return fmemopen(controlBytes.data(),controlBytes.size(),"r");}
#define fopen fixtureOpen
static unsigned campaignReconcileCombatSelection()
{
    unsigned count = 0;
    bool changed = false;
    for (DROID *droid : apsDroidLists[selectedPlayer])
    {
        const bool eligible = droid->asWeaps[0].nStat > 0 && !droid->isTransporter() && isSelectable(droid);
        if (eligible) ++count;
        if (droid->selected != eligible)
        {
            droid->selected = eligible;
            changed = true;
        }
    }
    if (changed)
    {
        intRefreshScreen();
        triggerEventSelected();
    }
    return count;
}

static JSValue campaignSelectCombatJS(JSContext *ctx, JSValueConst, int, JSValueConst *)
{
    if (!campaignMobileScriptEnabled() || game.type != LEVEL_TYPE::CAMPAIGN
        || engineToInstanceMap.at(ctx)->player() != selectedPlayer) return JS_FALSE;
    const auto state = nlohmann::json::parse(campaignMobileNativeStateJSON());
    if (!state.value("worldSafe",false)) return JS_FALSE;
    // Re-read the latest HTML intent; an in-flight command must not steal a
    // builder/transport selection after the user opens another control.
    FILE *file = fopen("/data/base/script/campaign/mobile/campaign-control.json","rb");
    if (!file) return JS_FALSE;
    char buffer[4097]; const size_t length = fread(buffer,1,4096,file); fclose(file);
    const auto control = nlohmann::json::parse(buffer,buffer+length,nullptr,false);
    if (!control.is_object() || !control.value("enabled",false) || control.value("suspended",true)) return JS_FALSE;
    const unsigned count = campaignReconcileCombatSelection();
    JSValue result = JS_NewObject(ctx), ids = JS_NewArray(ctx); uint32_t index=0;
    for (const DROID *droid : apsDroidLists[selectedPlayer])
        if (droid->selected) JS_SetPropertyUint32(ctx,ids,index++,JS_NewUint32(ctx,droid->id));
    JS_SetPropertyStr(ctx,result,"ok",JS_TRUE);
    JS_SetPropertyStr(ctx,result,"count",JS_NewUint32(ctx,count));
    JS_SetPropertyStr(ctx,result,"selectedIds",ids);
    return result;
}


#undef fopen
int main(){
 JSContext ctx;engineToInstanceMap[&ctx]=&instance;
 DROID a{1,{1},false,false,true,25,14,50},b{2,{2},false,false,true,25,13,51};
 DROID truck{3,{0},true,false,true,2,16,50},sensor{4,{0},false,false,true,0,17,50};
 DROID repair{5,{0},false,false,true,0,18,50},transport{6,{1},false,true,true,0,19,50};
 DROID unselectable{7,{1},false,false,false,0,20,50};
 apsDroidLists[0]={&a,&b,&truck,&sensor,&repair,&transport,&unselectable};
 auto call=[&](){return campaignSelectCombatJS(&ctx,0,0,nullptr);};
 assert(call()==7);assert(a.selected&&b.selected&&!truck.selected&&!sensor.selected&&!repair.selected&&!transport.selected&&!unselectable.selected);
 assert(resultCount==2&&refreshes==1&&events==1);assert(a.order==25&&a.x==14&&a.y==50&&truck.order==2);
 for(int n=0;n<20;++n)assert(call()==7);
 assert(refreshes==1&&events==1&&a.order==25&&b.order==25);
 DROID reinforcement{8,{3},false,false,true,2,22,49};apsDroidLists[0].push_back(&reinforcement);
 assert(call()==7);assert(reinforcement.selected&&a.selected&&b.selected&&resultCount==3);
 assert(refreshes==2&&events==2&&reinforcement.order==2&&reinforcement.x==22&&reinforcement.y==49&&a.order==25);
 auto blocked=[&](){const int r=refreshes,e=events;assert(call()==JS_FALSE);assert(refreshes==r&&events==e&&a.selected&&b.selected&&reinforcement.selected);};
 enabledMode=false;blocked();enabledMode=true;
 game.type=LEVEL_TYPE::SKIRMISH;blocked();game.type=LEVEL_TYPE::CAMPAIGN;
 instance.me=1;blocked();instance.me=0;
 worldSafe=false;blocked();worldSafe=true;
 control=R"({"enabled":false,"suspended":false})";blocked();
 control=R"({"enabled":true,"suspended":true})";blocked();
 control="invalid-json";blocked();
 control=R"({"enabled":true,"suspended":false})";allowFile=false;blocked();allowFile=true;
 assert(call()==7&&refreshes==2&&events==2&&resultIds.size()==3);
 std::cout<<"initial selection,20 unchanged polls, moving reinforcement,8 guard cases passed\n";
}
