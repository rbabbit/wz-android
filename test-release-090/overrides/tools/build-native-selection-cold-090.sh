#!/usr/bin/env bash
# Same pinned toolchain/flags as retained0.89; only prepared C++ source differs.
set -euo pipefail
native90_workspace="${1:?usage: build-native-selection-cold-090.sh PREPARED_WORKSPACE}"
test -f "$native90_workspace/prepared-native-090.json"
test -f "$native90_workspace/source/src/mobile-combat-latch-v90.h"
native90_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
exec bash "$native90_root/tools/build-native-selection-cold-089.sh" "$native90_workspace"
