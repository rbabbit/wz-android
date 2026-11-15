"""Host C++ tests of the actual080 map export and079 room helper.

Reads the retained079 harness literal without executing or changing its proofs.
Official map generation/network handlers are stubs; no game/emulator is run.
"""
from pathlib import Path
import ast, hashlib, json, os, subprocess

ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'qa/multiplayer-room-080';QA.mkdir(parents=True,exist_ok=True)
tree=ast.parse((ROOT/'tools/test-multiplayer-room-native-079.py').read_text())
HARNESS=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='HARNESS' for t in n.targets))
HARNESS=HARNESS.replace('constexpr unsigned MAX_CONNECTED_PLAYERS=6;', 'constexpr unsigned MAX_CONNECTED_PLAYERS=6,MAX_PLAYERS=4;')
HARNESS=HARNESS.replace('struct {std::string name="Actual room"', 'struct Hash {std::string value="actual-hash";std::string toString()const{return value;}};\nstruct {Hash hash;std::string name="Actual room"')
HARNESS=HARNESS.replace('#define __EMSCRIPTEN__ 1', 'namespace WzMap {struct MapPreviewImage {std::vector<uint8_t> imageData;uint32_t width=0,height=0,channels=3;};}\n#define __EMSCRIPTEN__ 1')
linux_root='/mnt/c/timerApp/wz-towers-lab'
HARNESS=HARNESS.replace('#include "ROOM_INCLUDE"', '#include "'+linux_root+'/vendor/multiplayer/native-080/mobile-room-map-preview.cpp.inc"\n#include "'+linux_root+'/vendor/multiplayer/native-080/mobile-room-native.cpp.inc"')
EXTRA=r'''
 selectedPlayer=1;game.blindMode=0;downloaded=true;
 WzMap::MapPreviewImage image;image.width=3;image.height=2;image.imageData={0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,255};
 mpMobileMapPreviewBegin();mpMobileMapPreviewCapture(image);auto preview=mpMobileMapPreviewSnapshot(mpRoomGeneration);
 check(preview["status"]=="ready"&&preview["width"]==3&&preview["height"]==2&&preview["channels"]==3,"Actual native RGB dimensions and channels are exported uncropped");
 std::ifstream rgb("/tmp/mp-mobile-room-preview.rgb",std::ios::binary);std::vector<uint8_t> bytes((std::istreambuf_iterator<char>(rgb)),{});rgb.close();
 check(bytes==image.imageData,"Exported file preserves every actual RGB byte and row order");
 const auto firstRevision=mpRoomPreviewRevision;mpMobileMapPreviewCapture(image);
 check(mpRoomPreviewRevision==firstRevision,"Repeated identical native previews reuse one binary revision");
 check(preview["generation"]==mpRoomGeneration&&preview["mapHash"]==game.hash.toString(),"Preview metadata identifies actual room generation and map hash");
 game.hash.value="downloaded-custom-map-hash";preview=mpMobileMapPreviewSnapshot(mpRoomGeneration);
 check(preview["status"]=="loading"&&mpRoomPreviewPixels.empty()&&!std::ifstream("/tmp/mp-mobile-room-preview.rgb"),"Changed hash invalidates a same-named prior map and its RGB file");
 image.imageData[0]=245;mpMobileMapPreviewCapture(image);preview=mpMobileMapPreviewSnapshot(mpRoomGeneration);
 check(preview["status"]=="ready"&&preview["mapHash"]=="downloaded-custom-map-hash"&&mpRoomPreviewPixels[0]==245,"Downloaded custom-map pixels are captured without map-name thumbnail lookup");
 NetPlay.players[1].colour++;preview=mpMobileMapPreviewSnapshot(mpRoomGeneration);
 check(preview["status"]=="loading"&&mpRoomPreviewPixels.empty(),"Changed player colour mapping invalidates stale preview pixels");mpMobileMapPreviewCapture(image);
 NetPlay.players[1].position=3;preview=mpMobileMapPreviewSnapshot(mpRoomGeneration);
 check(preview["status"]=="loading","Changed start-position mapping invalidates stale preview pixels");mpMobileMapPreviewCapture(image);
 downloaded=false;preview=mpMobileMapPreviewSnapshot(mpRoomGeneration);
 check(preview["status"]=="loading"&&preview["reason"]=="Downloading map / mods"&&mpRoomPreviewPixels.empty(),"Incomplete custom-map download cannot expose a previous ready image");
 mpMobileMapPreviewCapture(image);check(mpRoomPreviewStatus=="loading"&&mpRoomPreviewPixels.empty(),"Capture during download is rejected");downloaded=true;mpMobileMapPreviewCapture(image);
 game.blindMode=1;preview=mpMobileMapPreviewSnapshot(mpRoomGeneration);
 check(preview["status"]=="blind"&&mpRoomPreviewPixels.empty()&&preview["file"]=="","Blind-simple client rooms fail closed and remove exported pixels");
 mpMobileMapPreviewCapture(image);check(mpRoomPreviewStatus=="blind"&&mpRoomPreviewPixels.empty(),"Hidden native map cannot be exported through capture");game.blindMode=0;
 image.width=0;mpMobileMapPreviewCapture(image);check(mpRoomPreviewStatus=="unavailable","Zero image dimensions are rejected");
 image.width=257;mpMobileMapPreviewCapture(image);check(mpRoomPreviewStatus=="unavailable","Oversized native image is rejected before copying");
 image.width=3;image.channels=4;mpMobileMapPreviewCapture(image);check(mpRoomPreviewStatus=="unavailable","Non-RGB native image is rejected");
 image.channels=3;image.imageData.pop_back();mpMobileMapPreviewCapture(image);check(mpRoomPreviewStatus=="unavailable","Incomplete RGB byte count is rejected");image.imageData.push_back(255);
 mpMobileMapPreviewCapture(image);mpMobileMapPreviewUnavailable();check(mpRoomPreviewStatus=="unavailable"&&mpRoomPreviewPixels.empty(),"Official empty/question-mark fallback does not become an exported map image");
 mpMobileMapPreviewCapture(image);mpMobileRoomLifecycle(false);check(mpRoomPreviewPixels.empty()&&!std::ifstream("/tmp/mp-mobile-room-preview.rgb"),"Actual room exit removes cached RGB and preview file");
'''
HARNESS=HARNESS.replace(' std::cout<<nlohmann::json(passed).dump();return 0;',EXTRA+'\n std::cout<<nlohmann::json(passed).dump();return 0;')
(QA/'native-host-harness.cpp').write_text(HARNESS,newline='\n')
command=['bash','-lc','g++ -std=c++17 -O0 -I/home/punkech/wz-mp-070/source/3rdparty/json/include '+linux_root+'/qa/multiplayer-room-080/native-host-harness.cpp -o /tmp/mp-room-native-080-host && /tmp/mp-room-native-080-host']
if os.name=='nt':command=['wsl','-d','Ubuntu-24.04','--']+command
result=subprocess.run(command,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
if result.returncode:raise SystemExit(result.stderr or result.stdout)
checks=json.loads(result.stdout)
old=ROOT/'vendor/multiplayer/native-079';native=ROOT/'vendor/multiplayer/native-080'
for name in ['quickjs_backend.cpp','mobile-ui-native.cpp.inc','main_sdl.cpp','hci.cpp','display3d.cpp','wrappers.cpp','mobile-ui-bootstrap.js','netplay_config.h','autorevision.cache']:
 assert (native/name).read_bytes()==(old/name).read_bytes(),name
checks.append('All079 non-preview translation units/bootstrap/protocol bytes are unchanged')
multi=(native/'multiint.cpp').read_text()
assert multi.count('mpMobileMapPreviewCapture(*mapPreviewResult);')==1
assert multi.index('if (!mapPreviewResult ||') < multi.index('mpMobileMapPreviewCapture(*mapPreviewResult);')
assert multi.count('mpMobileMapPreviewUnavailable();')==2 # declaration and empty-loader call
assert 'loadMapPreview(' not in (native/'mobile-room-map-preview.cpp.inc').read_text()
checks.append('Only successful official generator output is captured; getter cannot generate maps or expose placeholder images')
paths=['tools/test-multiplayer-room-native-080.py','tools/test-multiplayer-room-native-079.py','vendor/multiplayer/native-080/mobile-room-map-preview.cpp.inc','vendor/multiplayer/native-080/mobile-room-native.cpp.inc','vendor/multiplayer/native-080/multiint.cpp','vendor/multiplayer/native-080/quickjs_backend.cpp','tools/prepare-multiplayer-native-080.py','tools/build-multiplayer-native-080.py','tools/integrate-multiplayer-native-080.py']
proof={'version':'0.80','passed':True,'emulatorUsed':False,'actualNativeEngineExecuted':False,'actualHostCppHelperExecuted':True,'nativeMapGeneratorAndNetworkHandlersStubbed':True,'checks':checks,'checksPassed':len(checks),'sources':[{'path':p,'sha256':hashlib.sha256((ROOT/p).read_bytes()).hexdigest()}for p in paths]}
(QA/'native-checks.json').write_text(json.dumps(proof,indent=2))
print(json.dumps({'passed':True,'checksPassed':len(checks),'scope':'Actual room and RGB exporter helpers in host C++; native generator/request seams stubbed'}))
