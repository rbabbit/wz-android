#!/usr/bin/env bash
# Cold source build; run only in a NEW workspace prepared by the paired tool.
# Generated data/music/HTML are NOT delivery inputs. Integrate the raw pair
# against the retained0.87 app data using the separate integration recipe.
set -euo pipefail
native89_workspace="${1:?usage: build-native-selection-cold-089.sh PREPARED_WORKSPACE}"
test -f "$native89_workspace/prepared-native-089.json"
test ! -e "$native89_workspace/build"
test ! -e "$native89_workspace/emsdk"
git clone --filter=blob:none https://github.com/emscripten-core/emsdk.git "$native89_workspace/emsdk"
git -C "$native89_workspace/emsdk" checkout 1693ce7359fc9694f198694f902a2cc061239b86
"$native89_workspace/emsdk/emsdk" install 4.0.10
"$native89_workspace/emsdk/emsdk" activate 4.0.10
source "$native89_workspace/emsdk/emsdk_env.sh"
if test -d "$native89_workspace/emscripten-port-sources"; then
 mkdir -p "$native89_workspace/emsdk/upstream/emscripten/cache/ports"
 cp -a "$native89_workspace/emscripten-port-sources/." "$native89_workspace/emsdk/upstream/emscripten/cache/ports/"
fi
mkdir -p "$native89_workspace/build"
git clone --filter=blob:none https://github.com/microsoft/vcpkg.git "$native89_workspace/build/vcpkg"
git -C "$native89_workspace/build/vcpkg" checkout 6fdd23fa0a9479a9f9a1c48178696f60cf39255d
if test -d "$native89_workspace/dependency-source-archives"; then
 mkdir -p "$native89_workspace/build/vcpkg/downloads"
 cp -a "$native89_workspace/dependency-source-archives/." "$native89_workspace/build/vcpkg/downloads/"
fi
export VCPKG_MAX_CONCURRENCY=6 CMAKE_BUILD_PARALLEL_LEVEL=6
cmake -S "$native89_workspace/source" -B "$native89_workspace/build" -G Ninja \
 -DCMAKE_MAKE_PROGRAM=/usr/bin/ninja -DCMAKE_BUILD_TYPE=Release \
 -DCMAKE_EXE_LINKER_FLAGS=-sEXPORTED_RUNTIME_METHODS=FS -DWZ_DISTRIBUTOR=Towers \
 -DCMAKE_TOOLCHAIN_FILE="$native89_workspace/build/vcpkg/scripts/buildsystems/vcpkg.cmake" \
 -DVCPKG_TARGET_TRIPLET=wasm32-emscripten -DCMAKE_INSTALL_PREFIX="$native89_workspace/installed" \
 -DENABLE_DOCS=OFF -DWZ_ENABLE_WARNINGS=OFF -DWZ_ENABLE_WARNINGS_AS_ERRORS=OFF \
 -DWZ_INCLUDE_TERRAIN_HIGH=OFF -DWZ_EMSCRIPTEN_COMPRESS_OUTPUT=OFF
cmake --build "$native89_workspace/build" --target warzone2100 --parallel 6
sha256sum "$native89_workspace/build/src/warzone2100.js" "$native89_workspace/build/src/warzone2100.wasm"
