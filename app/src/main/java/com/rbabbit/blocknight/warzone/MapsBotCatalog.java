package com.rbabbit.blocknight.warzone;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/** Bundled native AI identities for downloaded maps. */
final class MapsBotCatalog {
    static final class Bot {
        final String id, name, script, description;

        Bot(String id, String name, String script, String description) {
            this.id = id;
            this.name = name;
            this.script = script;
            this.description = description;
        }

        boolean needsAssetBundle() {
            return "dumbot25a".equals(id) || "wally".equals(id) || "ratbot".equals(id)
                    || "ratbot_mg".equals(id) || "squeedlerbot".equals(id);
        }
    }

    static final List<Bot> ALL = Collections.unmodifiableList(Arrays.asList(
            new Bot("cobra", "Cobra", "multiplay/skirmish/Cobra.js", "Research-focused opponent."),
            new Bot("nexus", "Nexus", "multiplay/skirmish/nexus.js", "Classic AI suited to beginners."),
            new Bot("nullbot", "NullBot", "multiplay/skirmish/nb_generic.js", "Adaptive opponent with several personalities."),
            new Bot("semperfi", "SemperFi", "multiplay/skirmish/semperfi.js", "Focuses on rockets and missiles."),
            new Bot("bonecrusher", "BoneCrusher!", "multiplay/skirmish/bonecrusher/bonecrusher.js", "Aggressive opponent."),
            new Bot("hover", "Hover AI", "multiplay/skirmish/nb_hover.js", "NullBot variant for sea and island maps."),
            new Bot("turtle", "Turtle AI", "multiplay/skirmish/nb_turtle.js", "NullBot variant for defensive tower battles."),
            new Bot("dumbot25a", "Dumbot25a", "multiplay/skirmish/maps-dumbot25a.js", "Cannon or rocket opponent."),
            new Bot("ratbot", "RatBot", "multiplay/skirmish/ratbot/personality_cannons.js", "High-oil cannon opponent."),
            new Bot("ratbot_mg", "RatBot MG", "multiplay/skirmish/ratbot/personality_mg.js", "Heavy-body machinegun opponent."),
            new Bot("squeedlerbot", "Squeedlerbot", "multiplay/skirmish/ratbot/personality_squeedlers.js", "Small assault-gun tank opponent."),
            new Bot("wally", "Wally", "multiplay/skirmish/wally.js", "Cooperative rockets, machineguns and VTOL opponent.")
    ));

    static Bot get(String id) {
        for (Bot bot : ALL) if (bot.id.equals(id)) return bot;
        throw new IllegalArgumentException("Unknown map bot.");
    }

    static boolean isKnownId(String id) {
        for (Bot bot : ALL) if (bot.id.equals(id)) return true;
        return false;
    }

    static String difficulty(String value) {
        String normalized = value == null ? "" : value.toLowerCase(Locale.ROOT);
        return "hard".equals(normalized) ? "hard" : "medium".equals(normalized) ? "medium" : "easy";
    }

    static String nativeDifficulty(String value) {
        String difficulty = difficulty(value);
        return "hard".equals(difficulty) ? "Hard" : "medium".equals(difficulty) ? "Medium" : "Easy";
    }

    static int nativeDifficultyLevel(String value) {
        String difficulty = difficulty(value);
        return "hard".equals(difficulty) ? 3 : "medium".equals(difficulty) ? 2 : 1;
    }

    private MapsBotCatalog() {}
}
