"""Exercise the production Java name, UI-route and viewport policies without Android.

This checks pure methods extracted verbatim from MultiplayerActivity. Runtime
WebView geometry, persistence and IME behavior still require the delivery APK.
"""
from pathlib import Path
import json
import re
import subprocess
import tempfile
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'app/src/main/java/com/rbabbit/blocknight/warzone/MultiplayerActivity.java'
JAVA = Path('C:/Program Files/Android/Android Studio/jbr/bin')


def method(text, name):
    match = re.search(r'  private static [^\n]+\b' + re.escape(name) + r'\([^\n]*\) \{', text)
    if not match:
        raise AssertionError('Production method missing: ' + name)
    start = match.start()
    depth = 0
    # These policies contain no brace-bearing strings or comments.
    for offset in range(text.index('{', start), len(text)):
        depth += (text[offset] == '{') - (text[offset] == '}')
        if depth == 0:
            return text[start:offset + 1]
    raise AssertionError('Unclosed method: ' + name)


source = SOURCE.read_text(encoding='utf-8')
# Follow the actual artwork URLs, including percent-encoded spaces, through the
# decoded path received by AssetsPathHandler. A fabricated PNG fixture alone
# would not exercise the GIF assets used by the real Research catalogue.
assets = ROOT / 'app/src/main/assets'
art = (assets / 'warzone/ui/research-art.js').read_text(encoding='utf-8')
urls = set(re.findall(r'"url":"([^"]+)"', art))
urls.update(re.findall(r"\b(?:genericUrl|labUrl)\s*=\s*['\"]([^'\"]+)['\"]", art))
def catalogue_urls(value):
    if isinstance(value, dict):
        image = value.get('image')
        if isinstance(image, str) and image.startswith(('research-icons/', 'build-icons/', 'ui/')):
            urls.add('/warzone/' + image)
        for child in value.values():
            catalogue_urls(child)
    elif isinstance(value, list):
        for child in value:
            catalogue_urls(child)
catalogue_urls(json.loads((assets / 'warzone/command-catalog.json').read_text(encoding='utf-8')))
inventory = {path.relative_to(assets).as_posix() for path in (assets / 'warzone').rglob('*') if path.is_file()}
matrix = []
for url in sorted(urls):
    decoded = unquote(urlsplit(url).path)
    if not decoded.startswith('/warzone/') or decoded[1:] not in inventory:
        raise AssertionError('Real artwork URL has no exact-case bundled asset: ' + url)
    if decoded.endswith('.gif') and (assets / decoded[1:]).read_bytes()[:6] not in (b'GIF87a', b'GIF89a'):
        raise AssertionError('Bundled GIF has an invalid image header: ' + url)
    matrix.append((url, decoded[len('/warzone/'):]))
asset_matrix = 'new String[][]{' + ','.join('{' + json.dumps(url) + ',' + json.dumps(decoded) + '}' for url, decoded in matrix) + '}'
relative_art = (assets / 'warzone-mobile-research.js').read_text(encoding='utf-8')
relative_urls = set(re.findall(r'''["']((?:build-icons|research-icons)/[^"'`]+)["']''', relative_art))
relative_urls.update(url[len('/warzone/'):] for url, _ in matrix if url.startswith(('/warzone/build-icons/', '/warzone/research-icons/')))
relative_matrix = []
for url in sorted(relative_urls):
    decoded = unquote(urlsplit(url).path)
    if 'warzone/' + decoded not in inventory:
        raise AssertionError('Relative artwork URL has no exact-case bundled asset: ' + url)
    relative_matrix.append((url, decoded))
relative_asset_matrix = 'new String[][]{' + ','.join('{' + json.dumps(url) + ',' + json.dumps(decoded) + '}' for url, decoded in relative_matrix) + '}'
methods = '\n'.join(method(source, name) for name in (
    'playerNameError', 'sharedRenderer', 'sharedUiAsset', 'sharedMultiplayerArt', 'viewportScale'))
constants = '\n'.join(re.findall(r'  private static final float (?:MIN_ENGINE_CSS_WIDTH|MIN_ENGINE_CSS_HEIGHT) = [^;]+;', source))
harness = r'''
import java.nio.charset.StandardCharsets;
final class MultiplayerActivityPolicies070 {
__CONSTANTS__
__METHODS__
  static int checks;
  static void check(boolean condition, String label) {
    checks++; if (!condition) throw new AssertionError(label);
  }
  static void valid(String value) { check(playerNameError(value).isEmpty(), "Rejected valid name: " + value); }
  static void invalid(String value) { check(!playerNameError(value).isEmpty(), "Accepted invalid name"); }
  static void viewport(int width, int height, float density, float reserved) {
    float scale = viewportScale(width, height, density, reserved);
    float cssWidth = width / scale / density, cssHeight = height / scale / density;
    check(scale > 0 && scale <= 1, "Invalid scale");
    check(cssWidth >= 641.99f, "Native width squeezed below minimum");
    check(cssHeight - reserved >= 481.99f, "Native height squeezed below minimum");
  }
  public static void main(String[] args) {
    valid("noobcrusher"); valid("123456789012345"); valid("[Bob]+_Ace-1"); valid("Zoë");
    valid("ééééééé"); valid("😀😀😀"); valid("One Space");
    invalid(null); invalid(""); invalid(" "); invalid("1234567890123456");
    invalid("éééééééé"); invalid("😀😀😀😀"); invalid("\uD800"); invalid("\uDC00");
    invalid("name\nplayerName=bad"); invalid("name\r"); invalid("name\t"); invalid("name\u0000");
    invalid("na\u200Bme"); invalid("<script>"); invalid("name/name"); invalid("Two  Spaces");
    check(sharedRenderer("warzone-command-pages.js"), "Shared renderer denied");
    check(!sharedRenderer("warzone2100.js"), "Other engine allowed");
    check(sharedUiAsset("ui/towers-shell.css"), "Shared stylesheet denied");
    check(sharedUiAsset("ui/Oswald.ttf"), "Shared font denied");
    check(sharedUiAsset("build-icons/tower.png"), "Build art denied");
    check(sharedUiAsset("research-icons/r.png"), "Research art denied");
    check(sharedUiAsset("research-icons/Command Turret.gif"), "Real GIF research art denied");
    check(sharedUiAsset("command-catalog.json"), "Catalogue denied");
    check(sharedUiAsset("build-ghost-models.json"), "Building model catalogue denied");
    for (String path : new String[]{"index.html", "warzone2100.wasm", "warzone2100.data",
        "ui/../../index.html", "ui/%2e%2e/index.html", "ui/evil.wasm", "ui\\evil.js", "/ui/a.js",
        "research-icons/../warzone2100.data", "research-icons/%2e%2e/warzone2100.data", "config",
        "savegames/a.gif", "../shared_prefs/profile.gif"}) {
      check(!sharedUiAsset(path), "Non-UI path allowed: " + path);
    }
    String[][] artRequests = __ASSET_MATRIX__;
    for (String[] request : artRequests) {
      String decoded = java.net.URI.create(request[0]).getPath().substring("/warzone/".length());
      check(decoded.equals(request[1]), "Artwork URL decoding differs: " + request[0]);
      check(sharedUiAsset(decoded), "Actual bundled artwork request denied: " + request[0]);
    }
    String[][] relativeArtRequests = __RELATIVE_ASSET_MATRIX__;
    java.net.URI enginePage = java.net.URI.create("https://appassets.androidplatform.net/multiplayer/engine.html");
    for (String[] request : relativeArtRequests) {
      String decoded = enginePage.resolve(request[0]).getPath().substring("/multiplayer/".length());
      check(decoded.equals(request[1]), "Relative artwork URL decoding differs: " + request[0]);
      check(sharedMultiplayerArt(decoded), "Real relative artwork alias denied: " + request[0]);
    }
    check(sharedMultiplayerArt("build-icons/A0ResearchFacility.png"), "Shared laboratory tab image denied");
    check(sharedMultiplayerArt("research-icons/Research Module.gif"), "Shared research placeholder denied");
    for (String path : new String[]{"warzone2100.wasm", "ui/towers-shell.css", "config", "build-icons/script.js",
        "research-icons/../warzone2100.data", "research-icons/%2e%2e/warzone2100.data", "build-icons/../../config"}) {
      check(!sharedMultiplayerArt(path), "Non-artwork alias allowed: " + path);
    }
    viewport(2400, 1080, 3f, 72f);
    viewport(2400, 1080, 1.875f, 72f);
    viewport(1920, 1080, 3f, 72f);
    viewport(2400, 1080, 3f, 116f);
    viewport(2304, 1080, 3f, 72f); // cutout-safe available width
    viewport(2400, 600, 3f, 72f);  // resized keyboard window
    check(Math.abs(viewportScale(2400,1080,3f,72f) - 360f/554f) < .00001f,
        "Dense phone no longer matches established virtual viewport");
    check(viewportScale(2400,1080,1.875f,72f) == 1f, "Normal viewport unnecessarily shrunk");
    System.out.println("Multiplayer Java policies: " + checks + " checks passed");
  }
}
'''.replace('__CONSTANTS__', constants).replace('__METHODS__', methods).replace('__ASSET_MATRIX__', asset_matrix).replace('__RELATIVE_ASSET_MATRIX__', relative_asset_matrix)
with tempfile.TemporaryDirectory(prefix='warzone-mp070-policies-') as temporary:
    folder = Path(temporary)
    test_source = folder / 'MultiplayerActivityPolicies070.java'
    test_source.write_text(harness, encoding='utf-8')
    subprocess.run([str(JAVA / 'javac.exe'), '-encoding', 'UTF-8', str(test_source)], check=True)
    subprocess.run([str(JAVA / 'java.exe'), '-cp', str(folder), 'MultiplayerActivityPolicies070'], check=True)
print(f'Actual artwork request matrix: {len(matrix)} exact bundled URLs; GIF headers verified')
print(f'Relative multiplayer artwork aliases: {len(relative_matrix)} exact bundled URLs')
