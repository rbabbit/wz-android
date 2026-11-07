"""Compile actual renderer functions against deterministic engine-type stubs.

This is a source-level geometry regression probe, not a gameplay/rendering pass.
The expected centre is extracted from the unchanged native foundation snap.
"""
from pathlib import Path
from hashlib import sha256
import json
import re
import subprocess

root = Path('/home/punkech/wz-blueprint-20261107/source')
out = Path('/mnt/c/timerApp/native-blueprint-build-20261107')
catalogue = json.loads(Path('/mnt/c/timerApp/audits/structure-preview-20261107/catalogue-alignment-audit.json').read_text())['rows']

def function(text):
    first = text.index('static void renderBuildOrder(')
    last = text.index('\nstd::unique_ptr<Blueprint> playerBlueprint', first)
    return text[first:last].strip()

before = function((out / 'display3d.cpp.original').read_text())
after = function((root / 'src/display3d.cpp').read_text())
foundation = (root / 'src/structure.cpp').read_text()
snap = re.search(r'\n\s*x = \(x & ~TILE_MASK\).*?;\s*y = \(y & ~TILE_MASK\).*?;', foundation, re.S)[0]
sizes = (root / 'src/structuredef.h').read_text()
size_first = sizes.index('\tinline Vector2i size(uint16_t direction) const')
size_last = sizes.index('\n};', size_first)
size_method = sizes[size_first:size_last]
rows = '\n'.join('{"%s",%d,%d},' % (r['id'],r['width'],r['breadth']) for r in catalogue)
scaffold = r'''
#include <algorithm>
#include <cassert>
#include <cstdint>
#include <iostream>
#include <vector>
constexpr int TILE_MASK=127,TILE_UNITS=128;
struct Vector2i{int x,y;Vector2i(int a=0,int b=0):x(a),y(b){}};
struct Vector3i{int x,y,z;Vector3i(Vector2i p,int h):x(p.x),y(p.y),z(h){}};
uint16_t snapDirection(uint16_t d){return (d+0x2000)&0xc000;}
struct STRUCTURE_STATS{int baseWidth,baseBreadth;bool module=false;
SIZE_METHOD
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
BEFORE
AFTER
Vector2i foundation(Vector2i p,const STRUCTURE_STATS&s,uint16_t direction){int x=p.x,y=p.y;const auto size=s.size(direction);SNAP return{x,y};}
struct Row{const char*name;int width,height;};
Row rows[]={ROWS};
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
'''
# native Vector3i exposes xy(), so the stub matches that tiny part of its interface.
scaffold=scaffold.replace('Vector3i(Vector2i p,int h):x(p.x),y(p.y),z(h){}','Vector3i(Vector2i p,int h):x(p.x),y(p.y),z(h){} Vector2i xy()const{return{x,y};}')
source=scaffold.replace('SIZE_METHOD',size_method).replace('BEFORE',before.replace('renderBuildOrder(','renderBuildOrder_before(',1)).replace('AFTER',after.replace('renderBuildOrder(','renderBuildOrder_after(',1)).replace('SNAP',snap).replace('ROWS',rows)
cpp=Path('/home/punkech/wz-blueprint-20261107/native-preview-probe.cpp')
cpp.write_text(source)
binary=cpp.with_suffix('')
subprocess.run(['g++','-std=c++17','-O2',str(cpp),'-o',str(binary)],check=True)
result=json.loads(subprocess.check_output([str(binary)],text=True))
result.update(method='Actual before/after renderBuildOrder compiled against deterministic engine-type stubs; expected centre from unchanged native foundation snap. Not emulator gameplay.',catalogueTypes=len(catalogue),directions=[0,90,180,270],sampleTiles=[[23,18],[9,7],[47,30]],probeSHA256=sha256(source.encode()).hexdigest(),rendererBeforeSHA256=sha256(before.encode()).hexdigest(),rendererAfterSHA256=sha256(after.encode()).hexdigest())
(out/'native-preview-probe.cpp').write_text(source)
(out/'native-preview-probe.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
