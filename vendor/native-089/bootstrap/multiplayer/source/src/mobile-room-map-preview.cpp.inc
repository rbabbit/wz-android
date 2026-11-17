// Export only the real RGB image already prepared by the official map loader.
// This does not load/generate maps, change a seed, or issue network/game orders.
#if defined(__EMSCRIPTEN__)
#include <fstream>
namespace {
static const char *mpRoomPreviewFile = "/tmp/mp-mobile-room-preview.rgb";
static uint64_t mpRoomPreviewRevision = 0;
static std::string mpRoomPreviewContext, mpRoomPreviewStatus = "loading", mpRoomPreviewReason = "Waiting for the map preview";
static uint32_t mpRoomPreviewWidth = 0, mpRoomPreviewHeight = 0;
static std::vector<uint8_t> mpRoomPreviewPixels;

static std::string mpRoomPreviewCurrentContext()
{
    // Position and colour remapping are inputs to the official colour provider.
    // Never serve the image of a prior map, room layout, or blind-mode choice.
    std::string key = std::string(game.map) + "\n" + game.hash.toString() + "\n" +
        std::to_string(static_cast<int>(game.blindMode)) + ":" + std::to_string(game.maxPlayers);
    for (size_t i = 0; i < NetPlay.players.size() && i < MAX_PLAYERS; ++i)
        key += ":" + std::to_string(NetPlay.players[i].position) + "," + std::to_string(NetPlay.players[i].colour);
    return key;
}

static void mpRoomPreviewInvalidate(const std::string &status, const std::string &reason)
{
    const auto context = mpRoomPreviewCurrentContext();
    if (mpRoomPreviewStatus != status || mpRoomPreviewReason != reason || mpRoomPreviewContext != context || !mpRoomPreviewPixels.empty()) ++mpRoomPreviewRevision;
    mpRoomPreviewContext = context; mpRoomPreviewStatus = status; mpRoomPreviewReason = reason;
    mpRoomPreviewPixels.clear(); mpRoomPreviewWidth = mpRoomPreviewHeight = 0;
    std::remove(mpRoomPreviewFile);
}

static bool mpRoomPreviewRestricted()
{
    return isBlindSimpleLobby(game.blindMode) && !NetPlay.isHost;
}
} // namespace

void mpMobileMapPreviewBegin()
{
    if (mpRoomPreviewRestricted()) { mpRoomPreviewInvalidate("blind", "The host has hidden the map preview in this blind room"); return; }
    if (mpRoomPreviewContext != mpRoomPreviewCurrentContext())
        mpRoomPreviewInvalidate("loading", "Waiting for the map preview");
}

void mpMobileMapPreviewUnavailable()
{
    if (mpRoomPreviewRestricted()) mpRoomPreviewInvalidate("blind", "The host has hidden the map preview in this blind room");
    else if (!NET_getDownloadingWzFiles().empty()) mpRoomPreviewInvalidate("loading", "Downloading map / mods");
    else mpRoomPreviewInvalidate("unavailable", "The native map preview is not available");
}

void mpMobileMapPreviewCapture(const WzMap::MapPreviewImage &image)
{
    if (mpRoomPreviewRestricted() || !NET_getDownloadingWzFiles().empty()) { mpMobileMapPreviewUnavailable(); return; }
    // Official maps are bounded to256x256. Reject inconsistent/oversized input
    // before multiplication or copying; the bridge never exports placeholders.
    if (!image.width || !image.height || image.width > 256 || image.height > 256 || image.channels != 3 ||
        image.imageData.size() != size_t(image.width) * image.height * 3)
    { mpRoomPreviewInvalidate("unavailable", "The native map preview has invalid dimensions"); return; }
    const auto context = mpRoomPreviewCurrentContext();
    if (mpRoomPreviewStatus == "ready" && context == mpRoomPreviewContext && image.width == mpRoomPreviewWidth &&
        image.height == mpRoomPreviewHeight && image.imageData == mpRoomPreviewPixels) return;
    std::ofstream stream(mpRoomPreviewFile, std::ios::binary | std::ios::trunc);
    stream.write(reinterpret_cast<const char *>(image.imageData.data()), image.imageData.size()); stream.flush();
    if (!stream) { mpRoomPreviewInvalidate("unavailable", "The map preview could not be prepared"); return; }
    mpRoomPreviewPixels = image.imageData; mpRoomPreviewWidth = image.width; mpRoomPreviewHeight = image.height;
    mpRoomPreviewContext = context; mpRoomPreviewStatus = "ready"; mpRoomPreviewReason.clear(); ++mpRoomPreviewRevision;
}

void mpMobileMapPreviewRoomEnded()
{
    mpRoomPreviewInvalidate("loading", "Waiting for the map preview");
}

static nlohmann::json mpMobileMapPreviewSnapshot(const std::string &generation)
{
    if (mpRoomPreviewRestricted()) mpRoomPreviewInvalidate("blind", "The host has hidden the map preview in this blind room");
    else if (!NET_getDownloadingWzFiles().empty()) mpRoomPreviewInvalidate("loading", "Downloading map / mods");
    else if (mpRoomPreviewContext != mpRoomPreviewCurrentContext()) mpRoomPreviewInvalidate("loading", "Waiting for the map preview");
    return nlohmann::json{{"status",mpRoomPreviewStatus},{"generation",generation},{"mapName",std::string(game.map)},
        {"mapHash",game.hash.toString()},{"revision",mpRoomPreviewRevision},{"width",mpRoomPreviewWidth},{"height",mpRoomPreviewHeight},
        {"channels",3},{"file",mpRoomPreviewStatus == "ready" ? mpRoomPreviewFile : ""},{"reason",mpRoomPreviewReason}};
}
#else
void mpMobileMapPreviewBegin() {}
void mpMobileMapPreviewUnavailable() {}
void mpMobileMapPreviewCapture(const WzMap::MapPreviewImage &) {}
void mpMobileMapPreviewRoomEnded() {}
static nlohmann::json mpMobileMapPreviewSnapshot(const std::string &) { return nlohmann::json::object(); }
#endif
