#!/usr/bin/env bash
# Retained pinned compiler/dependencies; only the prepared C++ overlay differs.
set -euo pipefail
players91_workspace="${1:?usage: build-native-players-cold-091.sh NEW_PREPARED_WORKSPACE}"
test -f "$players91_workspace/prepared-native-091.json"
test -f "$players91_workspace/source/src/mobile-players-v91.h"
test -f "$players91_workspace/source/src/mobile-players-policy-v91.h"
players91_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
exec bash "$players91_root/tools/build-native-selection-cold-090.sh" "$players91_workspace"
