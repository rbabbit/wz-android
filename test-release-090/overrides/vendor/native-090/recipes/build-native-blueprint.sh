#!/usr/bin/env bash
# Rebuild the matched JS/WASM pair from the accompanying patched native source.
# Run in Ubuntu 24.04 / WSL. The app's frozen virtual data package is integrated
# separately; do not ship this build's generated data over the authored game data.
# Optional third argument: existing complete project warzone assets directory.
set -euo pipefail
task_root="${1:?usage: build-native-blueprint.sh EMPTY_WORKSPACE PATCHED_SOURCE_TAR_GZ}"
source_bundle="${2:?supply the accompanying native source tar.gz}"
mkdir -p "$task_root"
test ! -e "$task_root/source" || { echo 'Choose a workspace without source/' >&2; exit 1; }
tar -xzf "$source_bundle" -C "$task_root"
test -f "$task_root/source/src/display3d.cpp"
git clone --filter=blob:none https://github.com/emscripten-core/emsdk.git "$task_root/emsdk"
git -C "$task_root/emsdk" checkout 1693ce7359fc9694f198694f902a2cc061239b86
"$task_root/emsdk/emsdk" install 4.0.10
"$task_root/emsdk/emsdk" activate 4.0.10
source "$task_root/emsdk/emsdk_env.sh"
if test -d "$task_root/emscripten-port-sources"; then
  mkdir -p "$task_root/emsdk/upstream/emscripten/cache/ports"
  cp -a "$task_root/emscripten-port-sources/." "$task_root/emsdk/upstream/emscripten/cache/ports/"
fi
mkdir -p "$task_root/build"
git clone --filter=blob:none https://github.com/microsoft/vcpkg.git "$task_root/build/vcpkg"
git -C "$task_root/build/vcpkg" checkout 6fdd23fa0a9479a9f9a1c48178696f60cf39255d
if test -d "$task_root/dependency-source-archives"; then
  mkdir -p "$task_root/build/vcpkg/downloads"
  cp -a "$task_root/dependency-source-archives/." "$task_root/build/vcpkg/downloads/"
fi
export VCPKG_MAX_CONCURRENCY=6 CMAKE_BUILD_PARALLEL_LEVEL=6
cmake -S "$task_root/source" -B "$task_root/build" -G Ninja \
  -DCMAKE_MAKE_PROGRAM=/usr/bin/ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_EXE_LINKER_FLAGS=-sEXPORTED_RUNTIME_METHODS=FS \
  -DWZ_DISTRIBUTOR=Towers \
  -DCMAKE_TOOLCHAIN_FILE="$task_root/build/vcpkg/scripts/buildsystems/vcpkg.cmake" \
  -DVCPKG_TARGET_TRIPLET=wasm32-emscripten \
  -DCMAKE_INSTALL_PREFIX="$task_root/installed" \
  -DENABLE_DOCS=OFF \
  -DWZ_ENABLE_WARNINGS=OFF \
  -DWZ_ENABLE_WARNINGS_AS_ERRORS=OFF \
  -DWZ_INCLUDE_TERRAIN_HIGH=OFF \
  -DWZ_EMSCRIPTEN_COMPRESS_OUTPUT=OFF
cmake --build "$task_root/build" --target warzone2100 --parallel 6
sha256sum "$task_root/build/src/warzone2100.js" "$task_root/build/src/warzone2100.wasm"
if test -n "${3:-}"; then
  python3 "$task_root/build-record/integrate-native-runtime.py" \
    --raw-js "$task_root/build/src/warzone2100.js" \
    --raw-wasm "$task_root/build/src/warzone2100.wasm" \
    --baseline-assets "$3" --out "$task_root/integrated-runtime"
fi
