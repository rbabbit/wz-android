#pragma once

#include "fpath.h"
#include "map.h"
#include "multiplay.h"
#include <map>

// Local control intent only. Every simulation order goes through the engine's
// usual synchronized queue, including when the other clients are desktop PCs.
class MobilePatrol
{
    enum class Stage { Assigned, Patrolling, Repairing, Rejoining };
    struct Route
    {
        Vector2i start;
        Vector2i destination;
        Stage stage;
        uint32_t dispatched;
    };

    std::map<uint32_t, Route> routes;
    std::string context;
    std::string lastNonce;

    static bool canReach(const DROID *droid, const Vector2i &point)
    {
        const auto propulsion = droid->getPropulsionStats()->propulsionType;
        const auto landing = droid->isVtol() ? PROPULSION_TYPE_WHEELED : propulsion;
        return tileOnMap(map_coord(point.x), map_coord(point.y))
            && !fpathBlockingTile(map_coord(point.x), map_coord(point.y), landing)
            && fpathCheck(droid->pos, Position(point.x, point.y, 0), propulsion);
    }

    void assign(const nlohmann::json &request, bool safe, const std::vector<DROID *> &droids,
                const MobileRepairPolicyV93 &repair)
    {
        if (!request.is_object() || !request.contains("nonce") || !request["nonce"].is_string()) return;
        const auto nonce = request["nonce"].get<std::string>();
        if (nonce.empty() || nonce.size() > 96 || nonce == lastNonce) return;
        lastNonce = nonce;
        ack = {{"nonce", nonce}, {"context", context}, {"count", 0}, {"reason", "stale-world"}};
        if (!safe || context.empty() || !request.contains("context") || request["context"] != context) return;
        if (!request.contains("x") || !request["x"].is_number()
            || !request.contains("y") || !request["y"].is_number()) return;
        const double x = request["x"].get<double>(), y = request["y"].get<double>();
        if (!(x >= 0 && x < 1 && y >= 0 && y < 1)) return;
        const Vector2i screen(int(x * pie_GetVideoBufferWidth()), int(y * pie_GetVideoBufferHeight()));
        Vector2i destination(0, 0);
        SDWORD tileX = -1, tileY = -1;
        screenCoordToWorld(screen, destination, tileX, tileY);
        ack["reason"] = "unreachable";
        if (!tileOnMap(tileX, tileY)) return;

        int count = 0;
        bool selectedCombat = false;
        for (DROID *droid : droids)
        {
            if (!droid->selected || !mobileRepairCombatEligibleV93(droid)) continue;
            selectedCombat = true;
            if (repair.protects(droid) || !canReach(droid, destination)) continue;
            if (secondaryGetState(droid, DSO_ATTACK_LEVEL, ModeQueue) != DSS_ALEV_ALWAYS)
                secondarySetState(droid, DSO_ATTACK_LEVEL, DSS_ALEV_ALWAYS, ModeQueue);
            routes[droid->id] = {droid->pos.xy(), destination, Stage::Assigned, gameTime};
            orderDroidLoc(droid, DORDER_PATROL, destination.x, destination.y, ModeQueue);
            ++count;
        }
        ack["count"] = count;
        ack["reason"] = count ? "" : selectedCombat ? "unavailable-units" : "select-combat";
    }

    bool follow(DROID *droid, Route &route, bool safe, const MobileRepairPolicyV93 &repair)
    {
        const auto &order = droid->order;
        const bool patrol = order.type == DORDER_PATROL
            && (order.pos == route.destination || order.pos2 == route.destination);
        const bool travellingForRepair = mobileRepairActiveTripV93(droid);
        if (patrol)
        {
            // Native Patrol captures the starting position when the queued
            // order takes effect. pos and pos2 swap at each end of the route.
            route.start = order.pos == route.destination ? order.pos2 : order.pos;
            route.stage = Stage::Patrolling;
            return true;
        }
        if (route.stage == Stage::Assigned) return gameTime - route.dispatched < 5000;
        if (travellingForRepair)
        {
            route.stage = Stage::Repairing;
            return true;
        }
        if (route.stage == Stage::Rejoining)
            return order.type == DORDER_MOVE && order.pos == route.start
                || gameTime - route.dispatched < 3000;
        if (route.stage != Stage::Repairing || droid->body < droid->originalBody) return false;
        if (order.type != DORDER_GUARD && order.type != DORDER_MOVE && order.type != DORDER_NONE) return false;
        if (!safe || repair.protects(droid)) return true;
        if (!canReach(droid, route.start)) return false;
        orderDroidLoc(droid, DORDER_MOVE, route.start.x, route.start.y, ModeQueue);
        sendDroidInfo(droid, DroidOrder(DORDER_PATROL, route.destination), true);
        route.stage = Stage::Rejoining;
        route.dispatched = gameTime;
        return true;
    }

public:
    nlohmann::json ack = nlohmann::json::object();

    void forget(uint32_t id) { routes.erase(id); }

    void frame(const std::string &world, bool safe, const std::vector<DROID *> &droids,
               const MobileRepairPolicyV93 &repair)
    {
        if (world != context)
        {
            context = world;
            // Keep the last request nonce across context changes so that a
            // pending tap from the previous world can never become an order.
            routes.clear();
            ack = nlohmann::json::object();
        }
        if (!routes.empty())
        {
            std::set<uint32_t> live;
            for (DROID *droid : droids)
            {
                auto route = routes.find(droid->id);
                if (route != routes.end() && follow(droid, route->second, safe, repair))
                    live.insert(droid->id);
            }
            for (auto i = routes.begin(); i != routes.end();)
            {
                if (!live.count(i->first)) i = routes.erase(i);
                else ++i;
            }
        }
        if (FILE *file = fopen("/tmp/warzone-mobile-patrol.json", "rb"))
        {
            char bytes[1025];
            const auto length = fread(bytes, 1, sizeof(bytes), file);
            fclose(file);
            if (length < sizeof(bytes))
                assign(nlohmann::json::parse(bytes, bytes + length, nullptr, false), safe, droids, repair);
        }
    }
};
