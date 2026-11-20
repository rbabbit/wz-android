#pragma once

#include <algorithm>
#include <cmath>
#include <map>

// Keep a normal synchronized MOVE order ahead of each selected unit while
// the pad is held. Only renew it when the unit approaches it or turns.
class MobileSteering
{
    struct SteeringOrder
    {
        Vector2i target;
        Vector2i previous;
        DroidOrderType initialOrder;
        Vector2i initialTarget;
        Vector2f heading;
        int distance;
        uint32_t issuedAt;
        bool applied;
    };

    std::map<uint32_t, SteeringOrder> orders;
    std::string context;
    std::string nonce;
    Vector2f direction{0, 0};
    uint32_t lastInput = 0;
    uint32_t lastPoll = 0;
    uint32_t lastMove = 0;
    bool held = false;
    bool firstMove = false;

    static bool canSteer(const DROID *droid, const MobileRepairPolicyV93 &repair)
    {
        return mobileRepairCombatEligibleV93(droid) && !droid->isVtol() && !repair.protects(droid);
    }

    static bool follows(const DROID *droid, const SteeringOrder &order)
    {
        return droid->order.type == DORDER_MOVE
            && (droid->order.pos == order.target || droid->order.pos == order.previous);
    }

    static bool waitingForOrder(const DROID *droid, const SteeringOrder &order)
    {
        return !order.applied && droid->order.type == order.initialOrder && droid->order.pos == order.initialTarget;
    }

    static bool pathIsClear(const DROID *droid, const Vector2i &delta)
    {
        const auto propulsion = droid->getPropulsionStats()->propulsionType;
        const auto start = droid->pos.xy();
        const int steps = std::max(1, (std::max(std::abs(delta.x), std::abs(delta.y)) + 15) / 16);
        for (int step = 1; step <= steps; ++step)
        {
            const int x = map_coord(start.x + delta.x * step / steps);
            const int y = map_coord(start.y + delta.y * step / steps);
            if (!tileOnMap(x, y) || fpathBlockingTile(x, y, propulsion)) return false;
        }
        return true;
    }

    void readInput(bool safe)
    {
        FILE *file = fopen("/tmp/warzone-mobile-steering.json", "rb");
        if (!file) return;
        char bytes[1025];
        const auto length = fread(bytes, 1, sizeof(bytes), file);
        fclose(file);
        if (length >= sizeof(bytes)) return;
        auto request = nlohmann::json::parse(bytes, bytes + length, nullptr, false);
        if (!request.is_object() || !request.contains("nonce") || !request["nonce"].is_string()) return;
        const auto next = request["nonce"].get<std::string>();
        if (next.empty() || next.size() > 96 || next == nonce) return;
        nonce = next;
        if (context.empty() || !request.contains("context") || request["context"] != context) return;
        if (!safe || !request.contains("x") || !request["x"].is_number()
            || !request.contains("y") || !request["y"].is_number())
        {
            held = false;
            return;
        }
        const float x = request["x"].get<float>(), y = request["y"].get<float>();
        if (!(x >= -1 && x <= 1 && y >= -1 && y <= 1)) return;
        const float radius = std::hypot(x, y);
        if (radius <= 0.15f)
        {
            held = false;
            return;
        }
        firstMove = !held;
        held = true;
        direction = Vector2f{x / radius, y / radius};
        lastInput = realTime;
    }

public:
    void frame(const std::string &world, bool safe, const std::vector<DROID *> &droids,
               const MobileRepairPolicyV93 &repair, MobilePatrol &patrol)
    {
        if (world != context)
        {
            context = world;
            held = false;
            orders.clear();
        }
        if (context.empty()) return;
        if (realTime - lastPoll >= 55)
        {
            lastPoll = realTime;
            readInput(safe);
        }
        if (!safe || realTime - lastInput > 480) held = false;
        if (!safe) return;
        if (!held && orders.empty()) return;
        const bool move = held && (firstMove || realTime - lastMove >= 180);
        if (move)
        {
            firstMove = false;
            lastMove = realTime;
        }
        const auto worldDirection = Vector2f_Rotate2f(direction, -playerPos.r.y);
        std::set<uint32_t> live;
        for (DROID *droid : droids)
        {
            auto entry = orders.find(droid->id);
            const bool eligible = canSteer(droid, repair);
            if (eligible && entry != orders.end())
            {
                auto &order = entry->second;
                order.applied = order.applied || follows(droid, order);
                if (!held || !droid->selected)
                {
                    if (follows(droid, order) || waitingForOrder(droid, order))
                        orderDroid(droid, DORDER_STOP, ModeQueue);
                    continue;
                }
                live.insert(droid->id);
            }
            if (!eligible || !droid->selected || !move) continue;
            const auto position = droid->pos.xy();
            bool turning = false;
            if (entry != orders.end())
            {
                const auto &order = entry->second;
                turning = worldDirection.x * order.heading.x + worldDirection.y * order.heading.y < 0.98f;
                const auto remaining = order.target - position;
                const int renewDistance = order.distance / 3;
                const bool approaching = order.applied &&
                    std::hypot(remaining.x, remaining.y) <= renewDistance;
                const bool retry = !order.applied && realTime - order.issuedAt >= 1100;
                if (!turning && !approaching && !retry) continue;
            }

            int distance = 0;
            Vector2i target = position;
            for (const int step : {3 * TILE_UNITS, 2 * TILE_UNITS, TILE_UNITS, TILE_UNITS / 2})
            {
                const Vector2i delta(std::lround(worldDirection.x * step), std::lround(worldDirection.y * step));
                if (!pathIsClear(droid, delta)) continue;
                target += delta;
                distance = step;
                break;
            }
            if (distance == 0)
            {
                if (turning && (follows(droid, entry->second) || waitingForOrder(droid, entry->second)))
                {
                    orderDroid(droid, DORDER_STOP, ModeQueue);
                    live.erase(droid->id);
                }
                continue;
            }
            if (entry == orders.end())
            {
                patrol.forget(droid->id);
                orders.emplace(droid->id, SteeringOrder{target, target, droid->order.type, droid->order.pos,
                    worldDirection, distance, realTime, false});
            }
            else
            {
                if (target == entry->second.target && entry->second.applied) continue;
                entry->second.previous = entry->second.target;
                entry->second.target = target;
                entry->second.heading = worldDirection;
                entry->second.distance = distance;
                entry->second.issuedAt = realTime;
            }
            orderDroidLoc(droid, DORDER_MOVE, target.x, target.y, ModeQueue);
            live.insert(droid->id);
        }
        for (auto entry = orders.begin(); entry != orders.end();)
        {
            if (live.count(entry->first)) ++entry;
            else entry = orders.erase(entry);
        }
    }
};
