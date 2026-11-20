#pragma once

#include <cstdio>
#include <nlohmann/json.hpp>

// The Android HUD opts into this event after installing its notice
// renderer. Other launchers keep their normal native loss message.
static bool mobileUnitLossNotice(const DROID *droid)
{
    FILE *marker = fopen("/tmp/warzone-mobile-unit-loss", "rb");
    if (!marker) return false;
    const bool enabled = fgetc(marker) == '1';
    fclose(marker);
    if (!enabled) return false;

    const nlohmann::json notice = {
        {"kind", "unit-lost"}, {"id", droid->id}, {"name", droid->aName},
        {"constructor", droid->droidType == DROID_CONSTRUCT || droid->droidType == DROID_CYBORG_CONSTRUCT},
        {"player", droid->player}, {"gameTime", gameTime}
    };
    const auto packet = notice.dump(-1, ' ', false, nlohmann::json::error_handler_t::replace);
    fprintf(stderr, "BNNOTICE:%s\n", packet.c_str());
    return true;
}
