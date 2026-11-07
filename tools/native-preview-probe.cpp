
#include <algorithm>
#include <cassert>
#include <cstdint>
#include <iostream>
#include <vector>
constexpr int TILE_MASK=127,TILE_UNITS=128;
struct Vector2i{int x,y;Vector2i(int a=0,int b=0):x(a),y(b){}};
struct Vector3i{int x,y,z;Vector3i(Vector2i p,int h):x(p.x),y(p.y),z(h){} Vector2i xy()const{return{x,y};}};
uint16_t snapDirection(uint16_t d){return (d+0x2000)&0xc000;}
struct STRUCTURE_STATS{int baseWidth,baseBreadth;bool module=false;
	inline Vector2i size(uint16_t direction) const
	{
		Vector2i size(baseWidth, baseBreadth);
		if ((snapDirection(direction) & 0x4000) != 0) // if building is rotated left or right by 90°, swap width and height
		{
			std::swap(size.x, size.y);
		}
		return size;
	}
};
bool IsStatExpansionModule(const STRUCTURE_STATS*s){return s->module;}
struct STRUCTURE{STRUCTURE_STATS*stats;Vector3i pos;};
STRUCTURE*castStructure(STRUCTURE*p){return p;}
STRUCTURE_STATS*getModuleStat(const STRUCTURE*p){return p->stats;}
enum{DORDER_BUILD=4,DORDER_BUILDMODULE=5,DORDER_LINEBUILD=6};
using STRUCT_STATES=int;
struct DroidOrder{int type;Vector2i pos,pos2;uint16_t direction;const STRUCTURE_STATS*psStats;STRUCTURE*psObj=nullptr;int index=0;};
Vector2i map_coord(Vector2i p){return {p.x/128,p.y/128};}
int mapTile(Vector2i){return 0;}
bool tileHasIncompatibleStructure(int,const STRUCTURE_STATS*,int){return false;}
struct StructureBounds{Vector2i map,size;};
StructureBounds getStructureBounds(const STRUCTURE_STATS*s,Vector2i p,uint16_t d){const auto z=s->size(d);return {{p.x/128-z.x/2,p.y/128-z.y/2},z};}
int map_TileHeight(int x,int y){return 256+3*x+7*y;}
int lineCalls=0;
void drawLineBuild(uint8_t,const STRUCTURE_STATS*,Vector2i,Vector2i,uint16_t,int){++lineCalls;}
struct Blueprint{const STRUCTURE_STATS*stats;Vector3i pos;uint16_t direction;Blueprint(const STRUCTURE_STATS*s,Vector3i p,uint16_t d,int,int,uint8_t):stats(s),pos(p),direction(d){}};
std::vector<Blueprint> blueprints;
static void renderBuildOrder_before(uint8_t droidPlayer, DroidOrder const &order, STRUCT_STATES state)
{
	STRUCTURE_STATS const *stats;
	Vector2i pos = order.pos;
	if (order.type == DORDER_BUILDMODULE)
	{
		STRUCTURE const *structure = castStructure(order.psObj);
		if (structure == nullptr)
		{
			return;
		}
		stats = getModuleStat(structure);
		pos = structure->pos.xy();
	}
	else
	{
		stats = order.psStats;
	}

	if (stats == nullptr)
	{
		return;
	}

	//draw the current build site if its a line of structures
	if (order.type == DORDER_LINEBUILD)
	{
		drawLineBuild(droidPlayer, stats, pos, order.pos2, order.direction, state);
	}
	if ((order.type == DORDER_BUILD || order.type == DORDER_BUILDMODULE) && !tileHasIncompatibleStructure(mapTile(map_coord(pos)), stats, order.index))
	{
		StructureBounds b = getStructureBounds(stats, pos, order.direction);
		int z = 0;
		for (int j = 0; j <= b.size.y; ++j)
			for (int i = 0; i <= b.size.x; ++i)
			{
				z = std::max(z, map_TileHeight(b.map.x + i, b.map.y + j));
			}
		Blueprint blueprint(stats, Vector3i(pos, z), snapDirection(order.direction), order.index, state, droidPlayer);
		blueprints.push_back(blueprint);
	}
}
static void renderBuildOrder_after(uint8_t droidPlayer, DroidOrder const &order, STRUCT_STATES state)
{
	STRUCTURE_STATS const *stats;
	Vector2i pos = order.pos;
	if (order.type == DORDER_BUILDMODULE)
	{
		STRUCTURE const *structure = castStructure(order.psObj);
		if (structure == nullptr)
		{
			return;
		}
		stats = getModuleStat(structure);
		pos = structure->pos.xy();
	}
	else
	{
		stats = order.psStats;
	}

	if (stats == nullptr)
	{
		return;
	}

	//draw the current build site if its a line of structures
	if (order.type == DORDER_LINEBUILD)
	{
		drawLineBuild(droidPlayer, stats, pos, order.pos2, order.direction, state);
	}
	// Scripted build orders carry tile-centre positions for every footprint.
	// Match buildStructureDir's parity snap for this visual blueprint only.
	// Use the rotated size; never alter the actual order or foundation rules.
	if (order.type == DORDER_BUILD && !IsStatExpansionModule(stats))
	{
		const Vector2i size = stats->size(order.direction);
		pos.x = (pos.x & ~TILE_MASK) + size.x % 2 * TILE_UNITS / 2;
		pos.y = (pos.y & ~TILE_MASK) + size.y % 2 * TILE_UNITS / 2;
	}
	if ((order.type == DORDER_BUILD || order.type == DORDER_BUILDMODULE) && !tileHasIncompatibleStructure(mapTile(map_coord(pos)), stats, order.index))
	{
		StructureBounds b = getStructureBounds(stats, pos, order.direction);
		int z = 0;
		for (int j = 0; j <= b.size.y; ++j)
			for (int i = 0; i <= b.size.x; ++i)
			{
				z = std::max(z, map_TileHeight(b.map.x + i, b.map.y + j));
			}
		Blueprint blueprint(stats, Vector3i(pos, z), snapDirection(order.direction), order.index, state, droidPlayer);
		blueprints.push_back(blueprint);
	}
}
Vector2i foundation(Vector2i p,const STRUCTURE_STATS&s,uint16_t direction){int x=p.x,y=p.y;const auto size=s.size(direction);
		x = (x & ~TILE_MASK) + size.x % 2 * TILE_UNITS / 2;
		y = (y & ~TILE_MASK) + size.y % 2 * TILE_UNITS / 2; return{x,y};}
struct Row{const char*name;int width,height;};
Row rows[]={{"A0BaBaVtolPad",1,1},
{"bbaatow",1,1},
{"A0BaBaVtolFactory",2,2},
{"ScavRepairCentre",1,1},
{"A0BaBaBunker",1,1},
{"A0BaBaFactory",2,1},
{"A0BaBaFlameTower",1,1},
{"A0BaBaGunTower",1,1},
{"A0BaBaGunTowerEND",1,1},
{"A0BaBaHorizontalWall",1,1},
{"A0BaBaMortarPit",1,1},
{"A0BaBaPowerGenerator",1,1},
{"A0BaBaRocketPit",1,1},
{"A0BaBaRocketPitAT",1,1},
{"A0BabaCornerWall",1,1},
{"A0CannonTower",1,1},
{"A0ComDroidControl",2,2},
{"A0CommandCentre",2,2},
{"A0CommandCentreCO",2,2},
{"A0CommandCentreNE",2,2},
{"A0CommandCentreNP",2,2},
{"A0CyborgFactory",1,2},
{"A0HardcreteMk1CWall",1,1},
{"A0HardcreteMk1Gate",1,1},
{"A0HardcreteMk1Wall",1,1},
{"A0LasSatCommand",2,2},
{"A0LightFactory",3,3},
{"A0PowerGenerator",2,2},
{"A0RepairCentre3",1,1},
{"A0ResearchFacility",2,2},
{"A0ResourceExtractor",1,1},
{"A0Sat-linkCentre",2,2},
{"A0TankTrap",1,1},
{"A0VTolFactory1",3,3},
{"A0VtolPad",1,1},
{"AASite-QuadBof",1,1},
{"AASite-QuadBof02",1,1},
{"AASite-QuadMg1",1,1},
{"AASite-QuadRotMg",1,1},
{"CO-Tower-HVCan",1,1},
{"CO-Tower-HvATRkt",1,1},
{"CO-Tower-HvFlame",1,1},
{"CO-Tower-LtATRkt",1,1},
{"CO-Tower-MG3",1,1},
{"CO-Tower-MdCan",1,1},
{"CO-Tower-RotMG",1,1},
{"CO-WallTower-HvCan",1,1},
{"CO-WallTower-RotCan",1,1},
{"CollectiveCWall",1,1},
{"CollectiveWall",1,1},
{"CoolingTower",1,1},
{"ECM1PylonMk1",1,1},
{"Emplacement-HPVcannon",1,1},
{"Emplacement-HeavyLaser",1,1},
{"Emplacement-ParticleGun",1,1},
{"Emplacement-Howitzer-Incendiary",1,1},
{"Emplacement-Howitzer-Incenediary",1,1},
{"Emplacement-Howitzer105",1,1},
{"Emplacement-Howitzer150",1,1},
{"Emplacement-HvART-pit",1,1},
{"Emplacement-HvyATrocket",1,1},
{"Emplacement-MRL-pit",1,1},
{"Emplacement-MRLHvy-pit",1,1},
{"Emplacement-MdART-pit",1,1},
{"Emplacement-MortarEMP",1,1},
{"Emplacement-MortarPit-Incendiary",1,1},
{"Emplacement-MortarPit-Incenediary",1,1},
{"Emplacement-MortarPit01",1,1},
{"Emplacement-MortarPit02",1,1},
{"Emplacement-PlasmaCannon",1,1},
{"Emplacement-HeavyPlasmaLauncher",1,1},
{"Emplacement-PrisLas",1,1},
{"Emplacement-PulseLaser",1,1},
{"Emplacement-Rail2",1,1},
{"Emplacement-Rail3",1,1},
{"Emplacement-Rocket06-IDF",1,1},
{"Emplacement-RotHow",1,1},
{"Emplacement-RotMor",1,1},
{"GuardTower-ATMiss",1,1},
{"GuardTower-BeamLas",1,1},
{"GuardTower-Rail1",1,1},
{"GuardTower-RotMg",1,1},
{"GuardTower1",1,1},
{"GuardTower2",1,1},
{"GuardTower3",1,1},
{"GuardTower4",1,1},
{"GuardTower5",1,1},
{"GuardTower6",1,1},
{"LookOutTower",1,1},
{"NEXUSCWall",1,1},
{"NEXUSWall",1,1},
{"NX-ANTI-SATSite",1,1},
{"NX-CruiseSite",1,1},
{"NX-Emp-MedArtMiss-Pit",1,1},
{"NX-Emp-MultiArtMiss-Pit",1,1},
{"NX-Emp-Plasma-Pit",1,1},
{"NX-Tower-ATMiss",1,1},
{"NX-Tower-PulseLas",1,1},
{"NX-Tower-Rail1",1,1},
{"NX-WallTower-BeamLas",1,1},
{"NX-WallTower-Rail2",1,1},
{"NX-WallTower-Rail3",1,1},
{"NuclearReactor",2,2},
{"P0-AASite-Laser",1,1},
{"P0-AASite-SAM1",1,1},
{"P0-AASite-SAM2",1,1},
{"P0-AASite-Sunburst",1,1},
{"PillBox-Cannon6",1,1},
{"PillBox1",1,1},
{"PillBox2",1,1},
{"PillBox3",1,1},
{"PillBox4",1,1},
{"PillBox5",1,1},
{"PillBox6",1,1},
{"Pillbox-RotMG",1,1},
{"Plasmite-flamer-bunker",1,1},
{"Sys-CB-Tower01",1,1},
{"Sys-NEXUSLinkTOW",1,1},
{"Sys-NX-CBTower",1,1},
{"Sys-NX-SensorTower",1,1},
{"Sys-NX-VTOL-CB-Tow",1,1},
{"Sys-NX-VTOL-RadTow",1,1},
{"Sys-RadarDetector01",1,1},
{"Sys-SensoTower01",1,1},
{"Sys-SensoTower02",1,1},
{"Sys-SensoTowerWS",1,1},
{"Sys-SpyTower",1,1},
{"Sys-VTOL-CB-Tower01",1,1},
{"Sys-VTOL-RadarTower01",1,1},
{"TankTrapC",1,1},
{"Tower-Projector",1,1},
{"Tower-RotMg",1,1},
{"Tower-VulcanCan",1,1},
{"UplinkCentre",2,2},
{"Wall-RotMg",1,1},
{"Wall-VulcanCan",1,1},
{"WallTower-Atmiss",1,1},
{"WallTower-DoubleAAGun",1,1},
{"WallTower-DoubleAAGun02",1,1},
{"WallTower-EMP",1,1},
{"WallTower-HPVcannon",1,1},
{"WallTower-HvATrocket",1,1},
{"WallTower-Projector",1,1},
{"WallTower-PulseLas",1,1},
{"WallTower-QuadRotAAGun",1,1},
{"WallTower-Rail2",1,1},
{"WallTower-Rail3",1,1},
{"WallTower-SamHvy",1,1},
{"WallTower-SamSite",1,1},
{"WallTower-TwinAssaultGun",1,1},
{"WallTower01",1,1},
{"WallTower02",1,1},
{"WallTower03",1,1},
{"WallTower04",1,1},
{"WallTower05",1,1},
{"WallTower06",1,1},
{"WreckedTransporter",3,3},
{"X-Super-Cannon",2,2},
{"X-Super-MassDriver",2,2},
{"X-Super-Missile",2,2},
{"X-Super-Rocket",2,2},};
int main(){int total=0,oldMismatch=0,newMismatch=0,orderMutations=0,heightChanges=0;
 for(const auto&r:rows)for(unsigned d: {0u,16384u,32768u,49152u})for(Vector2i tile: {Vector2i(23,18),Vector2i(9,7),Vector2i(47,30)}){
  STRUCTURE_STATS stats{r.width,r.height};DroidOrder order{DORDER_BUILD,{tile.x*128+64,tile.y*128+64},{},uint16_t(d),&stats};
  const auto expected=foundation(order.pos,stats,d);const auto unchanged=order.pos;
  blueprints.clear();renderBuildOrder_before(0,order,0);assert(blueprints.size()==1);const auto old=blueprints[0].pos;
  blueprints.clear();renderBuildOrder_after(0,order,0);assert(blueprints.size()==1);const auto now=blueprints[0].pos;
  ++total;oldMismatch+=old.x!=expected.x||old.y!=expected.y;newMismatch+=now.x!=expected.x||now.y!=expected.y;
  orderMutations+=order.pos.x!=unchanged.x||order.pos.y!=unchanged.y;heightChanges+=old.z!=now.z;
 }
 STRUCTURE_STATS mod{1,1,true};STRUCTURE parent{&mod,Vector3i({2944,2304},256)};
 DroidOrder module{DORDER_BUILDMODULE,{3008,2368},{},0,&mod,&parent};
 blueprints.clear();renderBuildOrder_before(0,module,0);const auto old=blueprints[0].pos;
 blueprints.clear();renderBuildOrder_after(0,module,0);const auto now=blueprints[0].pos;
 bool moduleSame=old.x==now.x&&old.y==now.y&&old.z==now.z;
 DroidOrder line{DORDER_LINEBUILD,{3008,2368},{3200,2560},16384,&mod};
 lineCalls=0;renderBuildOrder_before(0,line,0);renderBuildOrder_after(0,line,0);bool lineSame=lineCalls==2;
 std::cout<<"{\"passed\":"<<(!newMismatch&&!orderMutations&&!heightChanges&&moduleSame&&lineSame?"true":"false")<<",\"ordinaryCases\":"<<total<<",\"beforeMismatch\":"<<oldMismatch<<",\"afterMismatch\":"<<newMismatch<<",\"orderMutations\":"<<orderMutations<<",\"heightChanges\":"<<heightChanges<<",\"moduleParentUnchanged\":"<<(moduleSame?"true":"false")<<",\"lineBuildUnchanged\":"<<(lineSame?"true":"false")<<"}\n";
 return newMismatch||orderMutations||heightChanges||!moduleSame||!lineSame;
}
