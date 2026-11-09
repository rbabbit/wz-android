/*
 * Packaged at /data/mp/config.js. The native map name is available before the
 * supplied mods/init.js includes this file, including through canonical loads.
 * Keep the supplied schedule as the default for every other map/context.
 */
if (typeof mapName === "string" && mapName === "Greenhaven-T1")
{
    include("tests/towers-beginner-config.js");
}
else
{
    include("tests/towers-original-config.js");
}
