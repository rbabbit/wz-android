"""Build the public, dependency-free website from approved app assets.

Only dist/ is deployable. Source metadata and the APK stay outside dist/.
The existing public downloads/feed remain the authority for release metadata.
"""
from pathlib import Path
from html import escape
import argparse, json, re, urllib.request

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT/'dist'
URL = 'https://wz2100.uk'
APK = '/downloads/warzone/warzone2100-andriod.apk'
CSS_VERSION = '20261116-desktop-fit'
MODES = {
 'campaign': ('Campaign', 'Lead your forces through the original campaign. Build your base, discover technology and command your squad.', ['campaign-squad','campaign-build','campaign-production']),
 'towers': ('Towers', 'Research upgrades. Build and deploy units. Hold back the waves and protect your Command Centre.', ['towers-base','towers-research','towers-defence']),
 'ffa': ('Free for All', 'Choose your battlefield and take on computer opponents. Expand your base and build an army your way.', ['ffa-base','ffa-building','ffa-map']),
 'multiplayer': ('Multiplayer', 'Find a room, meet the other commanders and take your forces online. Ready, team and chat controls are built into the waiting room.', ['multiplayer-lobby','multiplayer-room','multiplayer-production']),
 'guide': ('Field guide', 'Explore the built-in research paths and practical guides. Keep the information you need close to the battlefield.', ['guide-research']),
 'hub': ('Game Hub', 'Browse public multiplayer results and player rankings in the app. Follow the games and the commanders behind them.', ['hub-results'])
}
NAV = [('campaign','Campaign'),('towers','Towers'),('ffa','FFA'),('multiplayer','Multiplayer'),('guide','Guide'),('hub','Hub'),('download','Download')]

def validate_release(release):
 assert release['schemaVersion']==1
 assert release['applicationId']=='com.rbabbit.warzonetowers.lab'
 assert release['apkUrl']==URL+APK and re.fullmatch(r'[a-f0-9]{64}',release['sha256'])
 assert isinstance(release['versionCode'],int) and release['versionCode']>0
 assert isinstance(release['sizeBytes'],int) and release['sizeBytes']>0
 assert isinstance(release['versionName'],str) and re.fullmatch(r'\d+(?:\.\d+){1,3}',release['versionName'])
 return release

def main():
 parser=argparse.ArgumentParser(description='Build the static Warzone 2100 Android website.')
 parser.add_argument('--offline',action='store_true',help='Use the bundled release.json snapshot without network access.')
 args=parser.parse_args()
 if args.offline:
  release=json.loads((ROOT/'release.json').read_text(encoding='utf-8'))
 else:
  with urllib.request.urlopen(URL+'/downloads/warzone/latest.json',timeout=20) as response: release=json.load(response)
 validate_release(release)
 (ROOT/'release.json').write_text(json.dumps(release,indent=2)+'\n',encoding='utf-8')
 assets=json.loads((ROOT/'asset-manifest.json').read_text())['assets']
 gallery={Path(a['path']).stem:a for a in assets if a.get('kind')=='screenshot'}
 version=escape(release['versionName']); size=f"{release['sizeBytes']/1000000:.1f} MB"
 logo='<img src="/assets/warzone-logo.webp" width="483" height="228" alt="Warzone 2100" fetchpriority="high">'
 tank='<img class="tank" src="/assets/grey-tank.webp" width="1619" height="971" alt="Grey Warzone battle tank" fetchpriority="high">'
 dialog='''<dialog id="image-viewer" aria-label="Screenshot viewer"><div class="viewer-toolbar"><p id="image-count" aria-live="polite"></p><button type="button" class="control small" id="close-image">Close screenshot</button></div><figure><div class="image-window" tabindex="0" aria-label="Screenshot detail"><img id="large-image" alt=""></div><figcaption id="image-caption"></figcaption></figure><div class="viewer-controls"><button class="control small" id="previous-image" type="button" aria-label="Previous screenshot">Previous</button><button class="control small" id="zoom-image" type="button" aria-pressed="false">Zoom in</button><button class="control small" id="next-image" type="button" aria-label="Next screenshot">Next</button></div></dialog>'''
 for page in ['home',*MODES,'download']:
  title='Warzone 2100 for Android' if page=='home' else ('Download for Android' if page=='download' else MODES[page][0]+' — Warzone 2100 for Android')
  description='Research technology, build your base and command your units. Explore Campaign, Towers, Free for All and Multiplayer, then download the Android APK.' if page=='home' else ('Download the latest Warzone 2100 Android APK for your phone or tablet.' if page=='download' else MODES[page][1])
  nav='<nav class="mode-nav" aria-label="Explore Warzone 2100">'+''.join('<a class="control nav-{}{}" href="/{}/"{}>{}</a>'.format(key,' selected' if page==key else '',key,' aria-current="page"' if page==key else '',label) for key,label in NAV)+'</nav>'
  footer=f'''<footer class="site-footer"><details><summary>About this Android edition</summary><p>Android edition by rbabbit, based on the open-source <a href="https://wz2100.net/" target="_blank" rel="noopener noreferrer">Warzone 2100 project</a>. Game assets belong to their respective contributors. <a href="/assets/Oswald-OFL.txt">Font licence</a>.</p></details><span class="version">rbabbit v<span data-release-version>{version}</span></span></footer>'''
  if page=='home':
   header='<header class="home-header"><p>Research Tech - Build &amp; Deploy Units - Upgrade Structures</p></header>'
   content=f'<main id="main" class="home-hero"><div class="home-logo">{logo}<h1 class="sr-only">Warzone 2100 for Android</h1></div>{tank}</main>'
  else:
   header=f'<header class="page-header"><a class="brand" href="/" aria-label="Warzone 2100 home">{logo}</a><a class="control back" href="/">Back</a></header>'
   if page=='download':
    content=f'''<main id="main" class="download-hero"><section class="download-copy" aria-labelledby="download-title"><h1 id="download-title">Download for Android</h1><p class="release-line">Warzone 2100 · v<span data-release-version>{version}</span></p><p class="apk-name">warzone2100-andriod.apk</p><p class="file-meta">Android APK · <span data-release-size>{size}</span></p><a class="control selected download-cta" href="{APK}" download="warzone2100-andriod.apk">Download APK</a><p class="install-hint">Visit this page on your Android phone or tablet to download and install.</p><ol class="install-steps"><li><span>1</span> Download</li><li><span>2</span> Open the APK</li><li><span>3</span> Install</li></ol><p id="release-status" class="release-status" role="status" hidden></p></section>{tank}</main>'''
   else:
    label,copy,photos=MODES[page]
    cards=[]
    for i,name in enumerate(photos):
     a=gallery[name]; caption=escape(a['caption']); src='/'+a['path']; w,h=a['dimensions']
     cards.append(f'<figure class="screenshot"><a href="{src}" data-gallery data-caption="{caption}" aria-label="Enlarge: {caption}"><img src="{src}" width="{w}" height="{h}" alt="{caption}" loading="{("eager" if i==0 else "lazy")}" decoding="async"></a><figcaption>{caption}<span>Tap to enlarge</span></figcaption></figure>')
    extra=''
    if page=='guide':
     extra='<section class="guide-topics" aria-labelledby="guide-topics"><h2 id="guide-topics">Inside the app guide</h2><ul><li>Getting started</li><li>Research paths</li><li>Building your base</li><li>Designing units</li><li>Manufacturing and queues</li><li>Selection and movement</li></ul><p>The complete guide and research reader are available inside the Android app.</p></section>'
    if page=='hub':
     extra='<p class="section-note">The Hub connects to public results inside the app. The image above is a real app capture, not a live ranking table.</p>'
    content=f'''<main id="main" class="gallery-page"><section class="gallery-intro"><div><h1>{label}</h1><p>{escape(copy)}</p></div><a class="control selected" href="/download/">Get the Android app</a></section><div class="gallery-grid">{''.join(cards)}</div><p class="capture-note">Real Android screenshots. Appearance may vary by release and device.</p>{extra}</main>'''
  canonical=URL+('/' if page=='home' else '/'+page+'/')
  html=f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>{escape(title)}</title><meta name="description" content="{escape(description,quote=True)}"><meta name="theme-color" content="#000000"><link rel="canonical" href="{canonical}"><meta property="og:title" content="{escape(title,quote=True)}"><meta property="og:description" content="{escape(description,quote=True)}"><meta property="og:image" content="{URL}/assets/warzone-logo.webp"><meta property="og:url" content="{canonical}"><meta property="og:type" content="website"><link rel="icon" href="/assets/favicon.png" type="image/png"><link rel="preload" href="/assets/Oswald.ttf" as="font" type="font/ttf" crossorigin><link rel="stylesheet" href="/site.css?v={CSS_VERSION}"><script src="/site.js" defer></script></head><body class="page-{page}"><a class="skip-link" href="#main">Skip to content</a><div class="site-shell">{header}{content}{nav}{footer}</div>{dialog}</body></html>'''
  out=DIST/('index.html' if page=='home' else page+'/index.html');out.parent.mkdir(parents=True,exist_ok=True);out.write_text(html,encoding='utf-8')
 (DIST/'robots.txt').write_text('User-agent: *\nAllow: /\nSitemap: https://wz2100.uk/sitemap.xml\n')
 (DIST/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join('<url><loc>'+URL+('/' if p=='home' else '/'+p+'/')+'</loc></url>' for p in ['home',*MODES,'download'])+'</urlset>\n')
 print(json.dumps({'built':True,'pages':8,'version':release['versionName'],'apkSHA256':release['sha256']}))

if __name__=='__main__':main()
