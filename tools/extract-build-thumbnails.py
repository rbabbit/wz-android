"""Extract original engine-rendered build cards from the recorded v5.4 screen.

No drawn/generated substitute artwork. Coordinates are the stock 1280x576
BuildController grid, scaled to the actual 2400x1080 Android screenshot.
"""
from pathlib import Path
from PIL import Image
import json

root = Path(__file__).resolve().parents[1]
source = root / 'qa/v5.5/stock-build-menu.png'
image = Image.open(source)
assert image.size == (2400, 1080)
output = root / 'app/src/main/assets/warzone/build-icons'
output.mkdir(exist_ok=True)
cards = {'A0CyborgFactory': 2, 'A0LightFactory': 6,
         'A0PowerGenerator': 8, 'A0ResearchFacility': 9,
         'A0ResourceExtractor': 11}
for name, index in cards.items():
    col, row = index % 2, index // 2
    left, top = 11 + col*62, 149 + row*48
    box = tuple(round(v*1.875) for v in (left, top, left+58, top+43))
    image.crop(box).save(output / (name+'.png'))
(output/'SOURCES.json').write_text(json.dumps({
    'source': 'qa/v5.5/stock-build-menu.png',
    'description': 'Unmodified Warzone 4.7 native BuildController card crops.',
    'cards': cards}, indent=2)+'\n', encoding='utf8')
print('Extracted', len(cards), 'original Warzone build cards')
