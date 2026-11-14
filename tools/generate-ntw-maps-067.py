"""Author 45 original NTW-style FFA maps and honest native-data previews.

This is an offline map authoring/format/geometry audit. It does not execute the
native engine, an emulator, native pathfinding, Cobra or a balance simulation.
The six supplied maps are read-only. Every generated map has its own immutable
ID, design record, native records, measured route graph and terrain preview.
"""
from __future__ import annotations

from collections import Counter, deque
from hashlib import sha256
from pathlib import Path
import argparse
import heapq
import json
import math
import struct

from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'app/src/main/assets'
MANIFEST = ROOT / 'scenario/ffa/generated-maps-067.json'
LIBRARY = ROOT / 'tools/map-art-library-020.json'
FILES = ('level.json', 'gam.json', 'game.map', 'ttypes.ttp', 'struct.json', 'droid.json', 'feature.json')
ORIGINAL_IDS = ('emag', 'contact', 'templar-ffa', 'rb-simple', 'rb-usefull', 'emaj-6p')
THEMES = ('arizona', 'urban', 'rockies')

# Explicit compositions: the same broad NTW economy, but different geography,
# attack bearings, terrain silhouettes, routes and dimensions. Parameter rows
# are authored plans, not palette/rotation variants of a universal map.
FAMILIES = (
    ('open-ribs', 'Open field with low rock ribs and broad lateral flanks.'),
    ('twin-basins', 'Paired lakes divide a direct front from wide outer flanks.'),
    ('lake-ring', 'A central lake creates a broad encircling battlefield.'),
    ('stone-spokes', 'Stone spokes split the centre into linked fighting courts.'),
    ('canal-gates', 'Radial canals have inner and outer ground crossings.'),
    ('courtyard', 'A stone court anchors several broad approaches.'),
    ('braided-marsh', 'Alternating pools create a loose network of open lanes.'),
    ('mesa-loop', 'A central mesa has a wide ring and longer outer flanks.'),
    ('inlet-bays', 'Deep perimeter bays leave a connected inland front.'),
    ('split-front', 'Broken rock bars create parallel fronts and cross routes.'),
    ('crater-gates', 'A broken crater lake surrounds a connected central court.'),
    ('paired-courts', 'Broad forward building courts share direct and flanking approaches.'),
    ('causeway', 'Large water basins are joined by broad ground causeways.'),
    ('shard-basin', 'Offset rock shards frame a clear central fighting basin.'),
    ('crown-lakes', 'A crown of lakes leaves several direct and flanking routes.'),
)

NAMES = {
    2: ('Sunbreak Divide', 'Copper Twin Lakes', 'Slatewater Ring', 'Redstone Elbow',
        'Canal Exchange', 'Ash Court', 'Willow Braid', 'Granite Loop', 'Longshore Duel',
        'Twin Rail Front', 'Amber Crater', 'Cedar Courts', 'Broadwater Crossing',
        'Shatterstone', 'Crownwater'),
    3: ('Triad Plain', 'Three Rivers', 'Trinity Reservoir', 'Meridian Spokes',
        'Triple Lock', 'Civic Triangle', 'Reedwater Weave', 'Three Mesa Loop',
        'Three Harbours', 'Broken Triskelion', 'Caldera Three', 'Juniper Courts',
        'Trident Causeways', 'Triune Shards', 'Three Crowns'),
    4: ('Compass Plain', 'Four Basins', 'Citadel Lake', 'Cardinal Stone',
        'Four Canal Gates', 'Civic Square', 'Crosswind Wetlands', 'Four Mesa Loop',
        'Quarter Harbours', 'Railway Crossfront', 'Caldera Cross', 'Pine Quadrants',
        'Four Causeways', 'Shattered Compass', 'Crown Junction'),
}

DIMENSIONS = {
    2: ((176,144), (192,160), (168,168), (184,152), (176,176),
        (160,184), (200,160), (176,160), (192,176), (184,160),
        (176,192), (168,184), (192,192), (200,176), (184,184)),
    3: ((184,184), (192,192), (200,200), (188,188), (204,204),
        (192,192), (208,208), (196,196), (212,212), (200,200),
        (204,204), (188,188), (216,216), (208,208), (212,212)),
    4: ((200,200), (208,208), (216,216), (204,204), (220,220),
        (208,208), (224,224), (212,212), (228,228), (216,216),
        (220,220), (204,204), (232,232), (224,224), (228,228)),
}
BEARINGS = {
    2: (180, 35, 135, 15, 90, 155, 60, 0, 110, 25, 145, 70, 165, 45, 120),
    3: (90, 150, 25, 105, 170, 45, 125, 10, 80, 155, 35, 115, 175, 65, 135),
    4: (45, 0, 30, 60, 15, 45, 75, 0, 30, 60, 15, 45, 75, 0, 30),
}


def require(value, message):
    if not value:
        raise RuntimeError(message)


def digest(value):
    return sha256(value).hexdigest()


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(value if isinstance(value, bytes) else value.encode('utf-8'))


def json_bytes(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode('utf-8')


def rotate(x, y, angle):
    return x * math.cos(angle) - y * math.sin(angle), x * math.sin(angle) + y * math.cos(angle)


def expand(cells, radius):
    return {(x + dx, y + dy) for x, y in cells
            for dx in range(-radius, radius + 1) for dy in range(-radius, radius + 1)}


def connected(cells, origin):
    if origin not in cells:
        return set()
    reached, queue = {origin}, deque([origin])
    while queue:
        x, y = queue.popleft()
        for p in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if p in cells and p not in reached:
                reached.add(p); queue.append(p)
    return reached


def distances(cells, origin):
    result, queue = {origin: 0}, deque([origin])
    while queue:
        x, y = queue.popleft()
        for p in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if p in cells and p not in result:
                result[p] = result[x, y] + 1; queue.append(p)
    return result


def octile_distances(cells, origins):
    """Offline wheel-sized point graph, not the engine's native pathfinder."""
    result = {p: 0 for p in origins}
    pending = [(0, p[0], p[1]) for p in origins]
    heapq.heapify(pending)
    while pending:
        distance, x, y = heapq.heappop(pending)
        if result[x, y] != distance:
            continue
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            p = x + dx, y + dy
            if p not in cells or dx and dy and ((x + dx, y) not in cells or (x, y + dy) not in cells):
                continue
            candidate = distance + (141 if dx and dy else 100)
            if candidate < result.get(p, 10**12):
                result[p] = candidate; heapq.heappush(pending, (candidate, p[0], p[1]))
    return result


def recipe(players, number):
    width, height = DIMENSIONS[players][number - 1]
    family, geography = FAMILIES[number - 1]
    return dict(id=f'ntw-{players}p-{number:02}', name=NAMES[players][number - 1],
                players=players, number=number, width=width, height=height,
                tileset=THEMES[(number - 1 + players - 2) % 3], family=family,
                bearing=BEARINGS[players][number - 1], geography=geography,
                innerRadius=21 + number % 4, crossingWidth=13 + 2 * (number % 2),
                baseRadius=33, oilPerPlayer=24, neutralOilPerPlayer=8,
                startingTrucks=4, laboratories=5, vehicleFactories=1, cyborgFactories=1,
                powerGenerators=6, powerModules=6, satelliteUplinks=1, author='rbabbit', license='CC0-1.0')


class Geography:
    def __init__(self, design):
        self.d = design
        self.w, self.h = design['width'], design['height']
        self.cx, self.cy = self.w / 2, self.h / 2
        self.players = design['players']
        self.angle = math.radians(design['bearing'])
        self.radius = min(self.w, self.h) * ({2: .28, 3: .30, 4: .32}[self.players])
        self.starts = [tuple(round(n) for n in self.point(self.radius, self.angle + p * 2 * math.pi / self.players))
                       for p in range(self.players)]
        self.water_image = Image.new('1', (self.w, self.h))
        self.rock_image = Image.new('1', (self.w, self.h))
        self.ground_image = Image.new('1', (self.w, self.h))
        self.roads_image = Image.new('1', (self.w, self.h))
        outer = ImageDraw.Draw(self.ground_image)
        if self.players == 3:
            # Distinct balanced triangle, faceted and round arenas. The broad
            # rounded triangular field is the convex start triangle plus an
            # identical 35-tile rear apron at every vertex.
            if design['number'] in (1, 4, 6, 7, 10, 12, 14):
                outer.polygon(self.starts, fill=1)
                self.stroke(self.ground_image, self.starts + [self.starts[0]], 70)
            elif design['number'] in (2, 5, 9):
                vertices = [self.point(min(self.w, self.h) * .49, self.angle + k * math.tau / 9) for k in range(9)]
                outer.polygon(vertices, fill=1)
            else:
                margin = 4
                outer.ellipse((margin, margin, self.w - margin - 1, self.h - margin - 1), fill=1)
        else:
            if design['number'] in (1, 2, 5, 6, 10, 12, 13):
                outer.rectangle((4, 4, self.w - 5, self.h - 5), fill=1)
            elif design['number'] in (4, 8, 14):
                cut = 13 + design['number']
                outer.polygon([(4 + cut, 4), (self.w - 5 - cut, 4), (self.w - 5, 4 + cut),
                               (self.w - 5, self.h - 5 - cut), (self.w - 5 - cut, self.h - 5),
                               (4 + cut, self.h - 5), (4, self.h - 5 - cut), (4, 4 + cut)], fill=1)
            else:
                outer.rounded_rectangle((4, 4, self.w - 5, self.h - 5), radius=12 + design['number'] % 5, fill=1)
        self.author_obstacles()
        self.author_connections()
        self.finalize()

    def point(self, radius, angle):
        return self.cx + radius * math.cos(angle), self.cy + radius * math.sin(angle)

    def poly(self, image, points, fill=1):
        ImageDraw.Draw(image).polygon(points, fill=fill)

    def disk(self, image, x, y, rx, ry=None, angle=0):
        ry = rx if ry is None else ry
        points = []
        for n in range(64):
            u, v = rotate(rx * math.cos(n * math.tau / 64), ry * math.sin(n * math.tau / 64), angle)
            points.append((x + u, y + v))
        self.poly(image, points)

    def rectangle(self, image, x, y, rx, ry, angle=0, fill=1):
        points = []
        for u, v in ((-rx, -ry), (rx, -ry), (rx, ry), (-rx, ry)):
            a, b = rotate(u, v, angle); points.append((x + a, y + b))
        self.poly(image, points, fill)

    def stroke(self, image, points, width):
        draw = ImageDraw.Draw(image)
        draw.line(points, fill=1, width=width, joint='curve')
        radius = width / 2
        for x, y in points:
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=1)

    def sector(self, p, forward, lateral=0):
        angle = self.angle + p * math.tau / self.players
        a, b = rotate(forward, lateral, angle)
        return self.cx + a, self.cy + b

    def author_obstacles(self):
        d, n, r = self.d, self.players, self.radius
        family = d['family']
        for p in range(n):
            a = self.angle + (p + .5) * math.tau / n
            if family == 'open-ribs':
                x, y = self.point(19 + n, a)
                self.disk(self.rock_image, x, y, 6, 3, a + .45)
            elif family == 'twin-basins':
                for length, offset, rx, ry in ((17, -.23, 9, 6), (35, .16, 7, 4)):
                    x, y = self.point(length, a + offset)
                    self.rectangle(self.water_image, x, y, rx, ry, a + math.pi / 2)
            elif family == 'lake-ring':
                if n == 3:
                    self.poly(self.water_image, [self.point(23, self.angle + k * math.tau / 3) for k in range(3)])
                else:
                    self.rectangle(self.water_image, self.cx, self.cy, 19, 11 if n == 2 else 19, self.angle)
                x, y = self.point(39, a)
                self.disk(self.rock_image, x, y, 6, 3, a)
            elif family == 'stone-spokes':
                self.stroke(self.rock_image, [self.point(8, a), self.point(29, a + .12)], 8)
                x, y = self.point(42, a - .12)
                self.disk(self.water_image, x, y, 7, 4, a)
            elif family == 'canal-gates':
                self.stroke(self.water_image, [self.point(7, a), self.point(r + 13, a)], 9)
            elif family == 'courtyard':
                # A different polygon per player group, surrounded by open
                # streets; shallow bays interrupt the distant flanks.
                vertices = [self.point(13 + n, self.angle + k * math.tau / (n * 2)) for k in range(n * 2)]
                self.poly(self.rock_image, vertices)
                x, y = self.point(r - 3, a)
                self.disk(self.water_image, x, y, 9, 5, a)
            elif family == 'braided-marsh':
                for length, shift, rx, ry in ((13, -.22, 6, 4), (31, .23, 8, 5), (48, -.10, 5, 3)):
                    x, y = self.point(length, a + shift)
                    self.disk(self.water_image, x, y, rx, ry, a)
            elif family == 'mesa-loop':
                self.poly(self.rock_image, [self.point(21 + n, self.angle + math.pi / 4 + k * math.tau / (n * 2)) for k in range(n * 2)])
                x, y = self.point(40, a)
                self.stroke(self.rock_image, [(x - 4, y - 4), (x + 4, y + 4)], 5)
            elif family == 'inlet-bays':
                edge = min(self.w, self.h) * .52
                self.stroke(self.water_image, [self.point(edge, a), self.point(39, a + .08)], 14)
                x, y = self.point(17, a - .14)
                self.disk(self.rock_image, x, y, 7, 4, a)
            elif family == 'split-front':
                for length, sign in ((15, 1), (34, -1)):
                    x, y = self.point(length, a)
                    u, v = rotate(10, 0, a + sign * .7)
                    self.stroke(self.rock_image, [(x - u, y - v), (x + u, y + v)], 6)
            elif family == 'crater-gates':
                # Angular reservoir/canal courts, with equal broad ground gates.
                if n == 3:
                    self.poly(self.water_image, [self.point(43, self.angle + k * math.tau / 3) for k in range(3)])
                    self.poly(self.water_image, [self.point(22, self.angle + k * math.tau / 3) for k in range(3)], 0)
                else:
                    self.rectangle(self.water_image, self.cx, self.cy, 33, 25 if n == 2 else 33, self.angle)
                    self.rectangle(self.water_image, self.cx, self.cy, 17, 12 if n == 2 else 17, self.angle, 0)
                x, y = self.point(46, a)
                self.disk(self.rock_image, x, y, 6, 4, a)
            elif family == 'paired-courts':
                base_a = self.angle + p * math.tau / n
                for side in (-1, 1):
                    x, y = self.point(31, base_a + side * .30)
                    self.rectangle(self.water_image, x, y, 8, 5, base_a)
                x, y = self.point(12, a)
                self.disk(self.rock_image, x, y, 5, 3, a)
            elif family == 'causeway':
                if n == 3:
                    self.poly(self.water_image, [self.point(r + 14, self.angle + k * math.tau / 3) for k in range(3)])
                    self.poly(self.water_image, [self.point(20, self.angle + k * math.tau / 3) for k in range(3)], 0)
                else:
                    self.rectangle(self.water_image, self.cx, self.cy, r + 7, r * .73 if n == 2 else r + 7, self.angle)
                    self.rectangle(self.water_image, self.cx, self.cy, 17, 13 if n == 2 else 17, self.angle, 0)
            elif family == 'shard-basin':
                vertices = [self.point(9, a - .14), self.point(29, a - .23),
                            self.point(36, a + .03), self.point(19, a + .19)]
                self.poly(self.rock_image, vertices)
                x, y = self.point(48, a + .15)
                self.disk(self.water_image, x, y, 7, 4, a)
            elif family == 'crown-lakes':
                for length, offset, size in ((15, -.10, 9), (36, .12, 8)):
                    x, y = self.point(length, a + offset)
                    self.disk(self.water_image, x, y, size, size * .70, a)
        if family in ('open-ribs', 'twin-basins', 'braided-marsh', 'paired-courts'):
            self.disk(self.roads_image, self.cx, self.cy, 11 + n)

    def author_connections(self):
        d, n = self.d, self.players
        radial = d['innerRadius']
        width = d['crossingWidth']
        self.routes = []
        open_centre = d['family'] in ('open-ribs', 'twin-basins', 'canal-gates', 'braided-marsh', 'inlet-bays', 'paired-courts', 'causeway', 'crown-lakes')
        for p, base in enumerate(self.starts):
            a = self.angle + p * math.tau / n
            target = (self.cx, self.cy) if open_centre else self.point(radial, a)
            points = [base, self.point(self.radius * .64, a + .03 * (d['number'] % 3 - 1)), target]
            self.routes.append(points)
            self.stroke(self.roads_image, points, width)
        # Equal adjacent paths preserve independent FFA options. Their outer
        # flanks differ in radius and width among the authored compositions.
        radius = max(radial + 6, self.radius - (9 + d['number'] % 5))
        if n == 2 and d['number'] not in (3, 8, 15):
            # Two long angular side flanks, rather than another circular rim.
            # Both have equal length and meet the opposed bases directly.
            for side in (-1, 1):
                points = [self.starts[0]]
                for u, v in ((self.radius, side * radius * .82), (-self.radius, side * radius * .82)):
                    x, y = rotate(u, v, self.angle); points.append((self.cx + x, self.cy + y))
                points.append(self.starts[1]); self.routes.append(points)
                self.stroke(self.roads_image, points, 13 + 2 * (d['number'] % 3))
        else:
            for p in range(n):
                a = self.angle + p * math.tau / n
                b = self.angle + (p + 1) * math.tau / n
                if d['number'] in (1, 2, 4, 5, 6, 9, 10, 12, 13, 14):
                    points = [self.point(radius, a), self.point(radius, b)]
                else:
                    points = [self.point(radius, a + (b - a) * k / 32) for k in range(33)]
                self.routes.append(points)
                self.stroke(self.roads_image, points, 13 + 2 * (d['number'] % 3))
        if not open_centre:
            for p in range(n):
                a = self.angle + p * math.tau / n
                b = self.angle + (p + 1) * math.tau / n
                points = [self.point(radial, a + (b - a) * k / 32) for k in range(33)]
                self.routes.append(points)
                self.stroke(self.roads_image, points, width)
        # Broad flat campuses, with clear factory exits and space to expand.
        self.base_image = Image.new('1', (self.w, self.h))
        self.campus_image = Image.new('1', (self.w, self.h))
        for x, y in self.starts:
            self.disk(self.base_image, x, y, d['baseRadius'])
            quarter = round((math.atan2(self.cy - y, self.cx - x) - math.pi / 2) / (math.pi / 2)) % 4
            pads = (
                [(-20,-25),(-15,-30),(15,-30),(20,-25),(20,15),(14,21),(-14,21),(-20,15)],
                [(-23,-23),(-15,-30),(15,-30),(23,-23),(23,12),(13,21),(-13,21),(-23,12)],
                [(-20,-29),(20,-29),(23,-23),(23,13),(15,20),(-15,20),(-23,13),(-23,-23)],
                [(-21,-24),(-13,-31),(13,-31),(21,-24),(21,17),(-21,17)],
            )
            points = []
            for u, v in pads[(d['number'] - 1) % len(pads)]:
                a, b = rotate(u, v, quarter * math.pi / 2)
                points.append((x + a, y + b))
            self.poly(self.campus_image, points)

    def cells(self, image):
        return {(x, y) for y in range(self.h) for x in range(self.w) if image.getpixel((x, y))}

    def finalize(self):
        bounds = {(x, y) for y in range(self.h) for x in range(self.w)}
        allowed = self.cells(self.ground_image)
        roads, bases = self.cells(self.roads_image), self.cells(self.base_image)
        # Rounded raster brushes can lose a corner pixel on a diagonal. The
        # authored route contract reserves its full 9x9 native source corridor.
        for points in self.routes:
            for a, b in zip(points, points[1:]):
                steps = max(1, math.ceil(math.dist(a, b) * 2))
                for k in range(steps + 1):
                    tile = tuple(round(a[j] + (b[j] - a[j]) * k / steps) for j in (0, 1))
                    roads |= expand({tile}, 4)
        reserved = (roads | bases) & allowed
        water = (self.cells(self.water_image) & allowed) - expand(reserved, 1)
        rocks = ((self.cells(self.rock_image) & allowed) | (expand(water, 1) - water)) - reserved
        rocks -= water
        ground = allowed - water - rocks
        reachable = connected(ground, self.starts[0])
        # Tiny raster tips are turned into cliff, never left as inaccessible
        # buildable islands. The source proof records this correction count.
        self.raster_tips = len(ground - reachable)
        ground = reachable
        rocks |= allowed - ground - water
        self.ground, self.water = ground, water
        self.cliffs = (bounds - allowed) | rocks
        self.roads, self.bases = roads & ground, bases & ground
        self.campus_art = self.cells(self.campus_image) & ground
        require(all(p in ground for p in self.starts), dmsg(self.d, 'Start disconnected'))
        # Every point on every authored route needs a full nine-tile corridor.
        self.primary_clearance = []
        for points in self.routes:
            for a, b in zip(points, points[1:]):
                steps = max(1, math.ceil(math.dist(a, b) * 2))
                for k in range(steps + 1):
                    x, y = (round(a[j] + (b[j] - a[j]) * k / steps) for j in (0, 1))
                    require(expand({(x, y)}, 4) <= ground, dmsg(self.d, 'Authored crossing narrower than nine tiles'))


def dmsg(design, message):
    return design['id'] + ': ' + message


def sizes(spec, rotation):
    return (spec['breadth'], spec['width']) if rotation % 32768 else (spec['width'], spec['breadth'])


def footprint(spec, tile, rotation=0):
    a, b = sizes(spec, rotation)
    x, y = tile
    return {(u, v) for u in range(x - a // 2, x - a // 2 + a)
            for v in range(y - b // 2, y - b // 2 + b)}


def native_objects(design, geography, specs):
    structures, droids, features, occupied = [], [], [], set()
    next_id = 1000
    oil_by_player, building_centres, truck_tiles = {}, {}, {}
    # Campus local +Y points towards the battlefield. Four metre-grid aisles
    # between 2x2 facilities and four clear 1x1 constructor positions.
    campus = [('A0CommandCentre', 0, 7), ('A0LightFactory', -8, 7), ('A0CyborgFactory', 8, 7),
              ('A0Sat-linkCentre', 0, -9)]
    campus += [('A0ResearchFacility', x, 0) for x in (-10, -5, 0, 5, 10)]
    campus += [('A0PowerGenerator', x, -6) for x in (-12, -7, 7, 12)]
    campus += [('A0PowerGenerator', x, -11) for x in (-12, 12)]
    oil = [(x, y) for y in (-26, -23, -20, -17) for x in (-14, -9, -4, 4, 9, 14)]
    player_proofs = []
    for player, centre in enumerate(geography.starts):
        inward = math.atan2(geography.cy - centre[1], geography.cx - centre[0])
        # Local Y is South; native quarter-turns also rotate non-square bounds.
        quarter = round((inward - math.pi / 2) / (math.pi / 2)) % 4
        angle, rotation = quarter * math.pi / 2, quarter * 16384
        def at(u, v):
            x, y = rotate(u, v, angle)
            return centre[0] + round(x), centre[1] + round(y)
        own_centres, own_oil, own_trucks = [], [], []
        for name, u, v in campus + [('A0ResourceExtractor', u, v) for u, v in oil]:
            tile = at(u, v); spec = specs[name]
            fp = footprint(spec, tile, rotation)
            require(fp <= geography.ground, dmsg(design, 'Building outside native ground ' + name))
            require(not expand(fp, 1) & occupied, dmsg(design, 'Starting structures lack clear aisle ' + name))
            a, b = sizes(spec, rotation)
            position = [round((tile[0] + a % 2 * .5) * 128), round((tile[1] + b % 2 * .5) * 128)]
            row = dict(name=name, id=next_id, position=position, rotation=rotation, startpos=player)
            structures.append(row); next_id += 1
            occupied |= fp; own_centres.append((name, tile, rotation))
            if name == 'A0PowerGenerator':
                structures.append(dict(name='A0PowMod1', id=next_id, position=position, rotation=rotation, startpos=player)); next_id += 1
            if name == 'A0ResourceExtractor':
                features.append(dict(name='OilResource', id=next_id, position=position, rotation=0)); next_id += 1
                own_oil.append(tile)
        for u in (-6, -2, 2, 6):
            tile = at(u, 13)
            require(expand({tile}, 1) <= geography.ground - occupied, dmsg(design, 'Truck spawn/exit blocked'))
            occupied.add(tile); own_trucks.append(tile)
            droids.append(dict(template='ConstructionDroid', id=next_id,
                               position=[tile[0] * 128 + 64, tile[1] * 128 + 64], rotation=rotation, startpos=player)); next_id += 1
        oil_by_player[player], building_centres[player], truck_tiles[player] = own_oil, own_centres, own_trucks
        player_proofs.append(dict(player=player, centre=list(centre), rotation=rotation,
                                  structures=dict(Counter(r['name'] for r in structures if r['startpos'] == player)),
                                  truckTiles=[list(p) for p in own_trucks], ownedOil=24))
    # Eight unclaimed oils per player sit in equivalent forward courts. Their
    # positions use per-sector geodesic targets, not random global scatter.
    expansion = {}
    for player, centre in enumerate(geography.starts):
        angle = geography.angle + player * math.tau / geography.players
        targets = []
        for side in (-1, 1):
            x, y = geography.point(geography.radius * .52, angle + side * .28)
            for dx, dy in ((-2, -2), (2, -2), (-2, 2), (2, 2)):
                targets.append((round(x + dx), round(y + dy)))
        chosen = []
        for target in targets:
            # Greedy nearest free native tile, with a full wheel-turning
            # perimeter. Equal counts are enforced and read back later.
            candidates = sorted(geography.ground, key=lambda p: ((p[0] - target[0]) ** 2 + (p[1] - target[1]) ** 2, p))
            tile = next((p for p in candidates if expand({p}, 2) <= geography.ground
                         and not expand({p}, 2) & occupied), None)
            require(tile is not None, dmsg(design, 'No reachable expansion oil'))
            require(math.dist(tile, target) <= 12, dmsg(design, 'Expansion oil displaced out of its court'))
            occupied.add(tile); chosen.append(tile)
            features.append(dict(name='OilResource', id=next_id, position=[tile[0] * 128 + 64, tile[1] * 128 + 64], rotation=0)); next_id += 1
        expansion[player] = chosen
    return dict(structures=structures, droids=droids, features=features, occupied=occupied,
                buildings=building_centres, trucks=truck_tiles, oil=oil_by_player, expansion=expansion,
                playerProofs=player_proofs)


def terrain(design, geography, library):
    w, h = geography.w, geography.h
    info = library['themes'][design['tileset']]
    types, uniform = info['terrainTypes'], info['safeUniformByMaterial']
    material_names = {'arizona': ('a_mud', 'a_yellow', 'a_red', 'a_sand', 'a_concrete'),
                      'urban': ('u_gray', 'u_blue', 'u_brown', 'u_green', 'u_stone'),
                      'rockies': ('r_grass', 'r_rock', 'r_snowgrass', 'r_snow', 'r_tiles')}[design['tileset']]
    corners = [[info['groundNames'][i] for i in row] for row in info['groundCornersNW_NE_SE_SW']]
    allowed = [i for i in range(min(96, len(corners))) if types[i] not in (7, 8) and str(i) not in info['decalDefinitions']]
    def material(x, y):
        if (x, y) in geography.campus_art:
            return material_names[4]
        if (x, y) in geography.roads:
            return material_names[0 if design['tileset'] != 'urban' else 4]
        distance = math.hypot(x - geography.cx, y - geography.cy)
        theta = math.atan2(y - geography.cy, x - geography.cx) - geography.angle
        # Broad coherent soil/grass districts, rather than repeated concentric
        # colour rings. Their sector symmetry preserves equivalent approaches.
        phase = design['number'] * .57
        band = (.33 * math.cos(theta * design['players'] + phase)
                + .16 * math.cos(theta * design['players'] * 2 - phase)
                + 1.2 * (distance / min(w, h) - .33))
        if design['tileset'] == 'rockies':
            return material_names[3] if band > .48 else material_names[2] if band > .18 else material_names[0 if band > -.45 else 1]
        return material_names[1] if band > .36 else material_names[2] if band < -.48 else material_names[0]
    ground_vertices = {(x + dx, y + dy) for x, y in geography.ground for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1))}
    water_vertices = {(x + dx, y + dy) for x, y in geography.water for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1))}
    require(not ground_vertices & water_vertices, dmsg(design, 'Water shares a traversable foundation vertex'))
    textures, heights = [], []
    cliff_tile = {'arizona': 18, 'urban': 69, 'rockies': 30}[design['tileset']]
    for y in range(h):
        for x in range(w):
            p = x, y
            if p in geography.water:
                texture = info['waterTile']
            elif p not in geography.ground:
                texture = cliff_tile
            else:
                labels = [material(x + dx, y + dy) for dx, dy in ((0, 0), (1, 0), (1, 1), (0, 1))]
                candidates = [i for i in allowed if corners[i] == labels]
                if candidates:
                    texture = candidates[(x // 9 + y // 13) % len(candidates)]
                else:
                    preferred = Counter(labels).most_common(1)[0][0]
                    texture = next(i for i in uniform[preferred] if types[i] not in (7, 8))
            height = 128 if p in ground_vertices else 80 if p in water_vertices else 256
            textures.append(texture); heights.append(height)
    tiles = b''.join(struct.pack('<HH', t, z) for t, z in zip(textures, heights))
    raw = b'map ' + struct.pack('<III', 40, w, h) + tiles + struct.pack('<II', 1, 0)
    return raw, textures, heights


def native_readback(design, directory, specs):
    raw = (directory / 'game.map').read_bytes()
    require(raw[:4] == b'map ', dmsg(design, 'Map magic'))
    version, w, h = struct.unpack_from('<III', raw, 4)
    require((version, w, h) == (40, design['width'], design['height']), dmsg(design, 'Map header round trip'))
    require(len(raw) == 16 + w * h * 4 + 8 and struct.unpack_from('<II', raw, 16 + w * h * 4) == (1, 0), dmsg(design, 'Native gateway trailer'))
    terrain = (directory / 'ttypes.ttp').read_bytes()
    require(terrain[:4] == b'ttyp', dmsg(design, 'Terrain table magic'))
    table_version, count = struct.unpack_from('<II', terrain, 4)
    types = struct.unpack_from('<' + 'H' * count, terrain, 12)
    require(table_version == 39 and len(terrain) == 12 + count * 2, dmsg(design, 'Terrain table round trip'))
    textures, heights, ground, water, cliffs = [], [], set(), set(), set()
    for y in range(h):
        for x in range(w):
            texture, height = struct.unpack_from('<HH', raw, 16 + (y * w + x) * 4)
            require(texture & 511 < count and height <= 510, dmsg(design, 'Native tile range'))
            textures.append(texture); heights.append(height)
            (water if types[texture & 511] == 7 else cliffs if types[texture & 511] == 8 else ground).add((x, y))
    structures = json.loads((directory / 'struct.json').read_text())['structures']
    droids = json.loads((directory / 'droid.json').read_text())['droids']
    features = json.loads((directory / 'feature.json').read_text())['features']
    ids = [row['id'] for row in structures + droids + features]
    require(len(ids) == len(set(ids)), dmsg(design, 'Duplicate object identifier'))
    ordinary = [row for row in structures if row['name'] != 'A0PowMod1']
    occupied, hqs, trucks = set(), {}, {}
    for row in ordinary:
        tile = tuple(value // 128 for value in row['position'])
        fp = footprint(specs[row['name']], tile, row['rotation'])
        require(fp <= ground and not expand(fp, 1) & occupied, dmsg(design, 'Native footprint spacing ' + row['name']))
        for x, y in fp:
            z = [heights[min(h - 1, y + dy) * w + min(w - 1, x + dx)] for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1))]
            require(max(z) - min(z) == 0 and z[0] == 128, dmsg(design, 'Non-flat starting foundation'))
        occupied |= fp
        if row['name'] == 'A0CommandCentre':
            hqs[row['startpos']] = tile
    for row in structures:
        if row['name'] == 'A0PowMod1':
            owners = [s for s in ordinary if s['name'] == 'A0PowerGenerator' and s['startpos'] == row['startpos'] and s['position'] == row['position']]
            require(len(owners) == 1, dmsg(design, 'Orphan/ambiguous native power module'))
    for row in droids:
        tile = tuple(v // 128 for v in row['position'])
        require(tile in ground - occupied and row['template'] == 'ConstructionDroid', dmsg(design, 'Invalid constructor spawn'))
        occupied.add(tile); trucks.setdefault(row['startpos'], []).append(tile)
    oils = [tuple(v // 128 for v in row['position']) for row in features if row['name'] == 'OilResource']
    require(len(oils) == len(set(oils)) == design['players'] * 32, dmsg(design, 'Oil count/uniqueness'))
    require(set(oils) <= ground, dmsg(design, 'Oil on blocked terrain'))
    owned_oils = {tuple(v // 128 for v in s['position']) for s in ordinary if s['name'] == 'A0ResourceExtractor'}
    require(len(owned_oils) == design['players'] * 24 and owned_oils <= set(oils), dmsg(design, 'Owned oil linkage'))
    all_trucks = {p for values in trucks.values() for p in values}
    free = ground - (occupied - all_trucks)
    reached = connected(free, trucks[0][0])
    require(all(tile in reached for values in trucks.values() for tile in values), dmsg(design, 'Starting constructors disconnected'))
    require(all((expand(footprint(specs[s['name']], tuple(v // 128 for v in s['position']), s['rotation']), 1) & reached) for s in ordinary), dmsg(design, 'Structure perimeter unreachable'))
    # Oils with an owned extractor are reached from their perimeter; neutral
    # oils are free source cells and cannot silently sit behind a cliff.
    require(all(tile in reached for tile in set(oils) - owned_oils), dmsg(design, 'Neutral oil unreachable'))
    counts = [dict(Counter(s['name'] for s in structures if s['startpos'] == p)) for p in range(design['players'])]
    require(all(count == counts[0] for count in counts) and all(len(trucks[p]) == 4 for p in trucks), dmsg(design, 'Unequal starting infrastructure'))
    expected_counts = dict(A0CommandCentre=1, A0LightFactory=1, A0CyborgFactory=1,
                           **{'A0Sat-linkCentre': 1}, A0ResearchFacility=5,
                           A0PowerGenerator=6, A0PowMod1=6, A0ResourceExtractor=24)
    require(all(count == expected_counts for count in counts), dmsg(design, 'Native starting infrastructure differs from promised setup'))
    require(design['oilPerPlayer'] + design['neutralOilPerPlayer'] == 8 * 4,
            dmsg(design, 'Expansion economy exceeds unchanged eight-generator capacity'))
    require(all(v <= design['players'] - 1 for v in trucks) and len(hqs) == design['players'], dmsg(design, 'Invalid native owner slots'))
    # Octile distances are measured on the written terrain with starting
    # footprints blocked. Every player reaches every opponent and eight oils.
    matrix = []
    for p in range(design['players']):
        dist = octile_distances(free, trucks[p])
        matrix.append([0 if q == p else round(min(dist[t] for t in trucks[q]) / 100, 2) for q in range(design['players'])])
    # Rotation into a square tile grid introduces at most a small opening
    # difference; report the actual spread rather than claiming play balance.
    nearest = [min(v for v in row if v) for row in matrix]
    spread = max(nearest) - min(nearest)
    require(spread <= max(12, min(nearest) * .12), dmsg(design, 'Opening route imbalance exceeds authoring tolerance'))
    # Native wheel passability is terrain+height, not PNG colours. Flat ground
    # has no unmodelled native slope blocker. Full native pathfinding remains
    # explicitly untested at the user's request.
    return dict(mapVersion=version, width=w, height=h, nativeBytes=len(raw),
                nativeTerrainCounts=dict(Counter(types[t & 511] for t in textures)),
                flatReachableGround=True, groundTiles=len(ground), waterTiles=len(water), cliffTiles=len(cliffs),
                occupiedTiles=len(occupied), freeReachableTiles=len(reached),
                nativePlayerCounts=counts, constructorCount=len(droids), oilLocations=len(oils), ownedOilPerPlayer=24,
                neutralOilTotal=len(set(oils) - owned_oils), allModuleOwnersUnique=True,
                starts=[dict(player=p, x=hqs[p][0], y=hqs[p][1]) for p in sorted(hqs)],
                openingDistanceMatrix=matrix, nearestOpponentDistanceSpread=round(spread, 2),
                openingDistanceMethod='Offline eight-neighbour octile graph, no diagonal corner cutting; native pathfinder not executed.',
                allStructurePerimetersReachable=True, allConstructorSpawnsConnected=True,
                allNeutralOilReachable=True, originalSourceOnly=True,
                expectedStartingInfrastructureVerified=True,
                expansionUsesTwoAdditionalGeneratorsWithinStockCap=True,
                emulatorUsed=False, nativeEngineExecuted=False, nativePathfindingExecuted=False,
                gameplayBalancedOrPlaytested=False), (w, h, textures, heights, structures, droids, features, types)


def canonical_geometry(geometry):
    w, h, textures, _, structures, _, _, types = geometry
    # Deliberately ignore palette/native texture IDs: a rotated/reflected
    # terrain class image of another map is still a duplicate geography.
    image = Image.new('L', (w, h))
    image.putdata([2 if types[t & 511] == 7 else 1 if types[t & 511] == 8 else 0 for t in textures])
    hashes = []
    for flipped in (image, image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)):
        for quarter in range(4):
            variant = flipped.rotate(quarter * 90, expand=True)
            hashes.append(digest(struct.pack('<II', *variant.size) + variant.tobytes()))
    return min(hashes)


def preview(design, geometry, library, path):
    w, h, textures, heights, structures, droids, features, types = geometry
    info = library['themes'][design['tileset']]
    names = info['groundNames']
    # Native materials are decoded real game ground textures already retained
    # by the app source. No generated/fabricated battle art or screenshot claim.
    scales = {}
    for line in info['groundTexturesDefinition'].strip().splitlines()[1:]:
        name, _, factor = line.split(','); scales[name] = float(factor)
    dominant = []
    for texture in textures:
        raw = info['groundCorners'][texture & 511]
        vote = Counter()
        for i in raw:
            name = names[i]; vote[name] += 100 if 'cliff' in name else 1 if 'water' in name else 10
        dominant.append(vote.most_common(1)[0][0])
    scale = 4
    size = w * scale, h * scale
    image = Image.new('RGB', size)
    for name in sorted(set(dominant)):
        source = Image.open(ROOT / 'map/art-assets-020' / (name + '.png')).convert('RGB')
        period = max(8, round(scales[name] * scale))
        art = source.resize((period, period), Image.Resampling.LANCZOS)
        layer = Image.new('RGB', size)
        for y in range(0, size[1], period):
            for x in range(0, size[0], period):
                layer.paste(art, (x, y))
        if 'water' in name:
            layer = Image.blend(layer, Image.new('RGB', size, (31, 79, 98)), .48)
        mask = Image.new('L', (w, h)); mask.putdata([255 if m == name else 0 for m in dominant])
        image.paste(layer, (0, 0), mask.resize(size, Image.Resampling.BILINEAR))
    shade = Image.new('L', (w, h))
    values = []
    for y in range(h):
        for x in range(w):
            dx = heights[y * w + min(w - 1, x + 1)] - heights[y * w + max(0, x - 1)]
            dy = heights[min(h - 1, y + 1) * w + x] - heights[max(0, y - 1) * w + x]
            values.append(max(140, min(255, round(245 - dx * .28 - dy * .17))))
    shade.putdata(values); image = ImageChops.multiply(image, shade.resize(size, Image.Resampling.BILINEAR).convert('RGB'))
    draw = ImageDraw.Draw(image)
    owned = {tuple(s['position']) for s in structures if s['name'] == 'A0ResourceExtractor'}
    for feature in features:
        x, y = [p / 128 * scale for p in feature['position']]
        if tuple(feature['position']) not in owned:
            draw.ellipse((x - 2.5, y - 2.5, x + 2.5, y + 2.5), fill=(241, 197, 65), outline=(64, 51, 23))
    for row in structures:
        if row['name'] == 'A0PowMod1':
            continue
        x, y = [p / 128 * scale for p in row['position']]
        colour = (102, 196, 229) if row['startpos'] == 0 else (226, 123, 103)
        radius = 1.2 if row['name'] == 'A0ResourceExtractor' else 2.6
        draw.rectangle((x - radius, y - radius, x + radius, y + radius), fill=colour)
    try:
        face = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 17)
    except OSError:
        face = ImageFont.load_default(size=17)
    for row in structures:
        if row['name'] != 'A0CommandCentre':
            continue
        x, y = [p / 128 * scale for p in row['position']]
        draw.ellipse((x - 11, y - 11, x + 11, y + 11), fill=(56, 139, 181) if row['startpos'] == 0 else (171, 64, 49), outline=(248, 245, 234), width=2)
        draw.text((x, y), str(row['startpos'] + 1), font=face, anchor='mm', fill='white')
    image.thumbnail((640, 640), Image.Resampling.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True); image.save(path, optimize=True)
    return dict(path=path.relative_to(ROOT).as_posix(), sha256=digest(path.read_bytes()),
                width=image.width, height=image.height,
                method='Written native V40 textures/terrain/heights, decoded bundled ground material pixels, exact native object positions; data overview, not gameplay screenshot.')


def author(design, library, specs):
    directory = ROOT / 'map' / ('ffa-' + design['id'])
    geography = Geography(design)
    objs = native_objects(design, geography, specs)
    native_map, textures, heights = terrain(design, geography, library)
    info = library['themes'][design['tileset']]
    design_raw = json_bytes(design)
    entry = dict(id=design['id'], name=design['name'], players=design['players'],
                 level=f'FFA-NTW{design["players"]}-{design["number"]:02}-T1',
                 mapDirectory='ffa-' + design['id'], tileset=design['tileset'],
                 sourceSHA256=digest(design_raw), bots=design['players'] - 1,
                 preview='ffa-previews/' + design['id'] + '.png', width=design['width'], height=design['height'],
                 description=design['geography'] + ' Equal high-oil bases: four trucks, five labs, vehicle and cyborg factories; 24 working oils each plus eight expansion oils.')
    descriptor = ('// Original rbabbit NTW-style map, CC0-1.0; see DESIGN-067.json.\n'
                  f'level {entry["level"]}\nplayers {entry["players"]}\ntype 14\ndataset {info["dataset"]}\n'
                  f'game "multiplay/maps/{entry["mapDirectory"]}.gam"\n')
    payload = {
        'level.json': json_bytes(dict(name=entry['name'], type='skirmish', players=entry['players'], tileset=entry['tileset'],
                                     author=dict(name='rbabbit'), **{'spdx-license-id': 'CC0-1.0'}, generator='tools/generate-ntw-maps-067.py')),
        'gam.json': json_bytes(dict(version=7, gameTime=0, GameType=0, ScrollMinX=0, ScrollMinY=0,
                                   ScrollMaxX=entry['width'], ScrollMaxY=entry['height'], levelName='')),
        'game.map': native_map,
        'ttypes.ttp': b'ttyp' + struct.pack('<II', 39, len(info['terrainTypes'])) + struct.pack('<' + 'H' * len(info['terrainTypes']), *info['terrainTypes']),
        'struct.json': json_bytes(dict(version=2, structures=objs['structures'])),
        'droid.json': json_bytes(dict(version=2, droids=objs['droids'])),
        'feature.json': json_bytes(dict(version=2, features=objs['features'])),
    }
    for name, raw in payload.items():
        write(directory / name, raw)
    write(directory / 'DESIGN-067.json', design_raw)
    write(directory / 'level.lev', descriptor)
    checks, readback = native_readback(design, directory, specs)
    canonical = canonical_geometry(readback)
    photo = preview(design, readback, library, ASSETS / entry['preview'])
    mappings = [dict(host=(directory / name).relative_to(ROOT).as_posix(),
                     virtual='/data/mp/multiplay/maps/' + entry['mapDirectory'] + '/' + name,
                     sha256=digest(raw)) for name, raw in payload.items()]
    mappings.append(dict(host=(directory / 'gam.json').relative_to(ROOT).as_posix(),
                         virtual='/data/mp/multiplay/maps/' + entry['mapDirectory'] + '.gam', sha256=digest(payload['gam.json'])))
    proof = dict(id=entry['id'], descriptor=descriptor, mappings=mappings, requiredInitialStructureLimits={},
                 sourceDesign=dict(path=(directory / 'DESIGN-067.json').relative_to(ROOT).as_posix(), sha256=digest(design_raw)),
                 sourceSHA256=digest(design_raw), sourceSHA256Meaning='Exact deterministic DESIGN-067.json authoring input bytes, not an external archive.',
                 dataset=info['dataset'], family=design['family'], bearing=design['bearing'],
                 playerBases=objs['playerProofs'], baseCounts={str(p): dict(Counter(s['name'] for s in objs['structures'] if s['startpos'] == p)) for p in range(entry['players'])},
                 expansionOil={str(p): [list(t) for t in objs['expansion'][p]] for p in range(entry['players'])},
                 starts=checks['starts'], mapVersion=40, width=entry['width'], height=entry['height'],
                 geometryD4SHA256=canonical, nativeMapSHA256=digest(native_map), preview=photo,
                 rasterTipsConvertedToCliff=geography.raster_tips,
                 authoredCrossingWidth=design['crossingWidth'], minimumGuaranteedGroundCorridorTiles=9,
                 checks=checks, generator='tools/generate-ntw-maps-067.py', originalMapFilesModified=False)
    dump(directory / 'AUTHORING-067.json', proof)
    return entry, proof


def contact_sheets(entries):
    for players in (2, 3, 4):
        rows = [r for r in entries if r['players'] == players]
        columns, cw, ch = 5, 242, 282
        image = Image.new('RGB', (columns * cw, 50 + 3 * ch), (15, 17, 19))
        draw = ImageDraw.Draw(image)
        try:
            font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 14)
            title = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 20)
        except OSError:
            font = title = ImageFont.load_default()
        draw.text((12, 12), f'{players}-player original NTW maps — native-data previews, no gameplay claims', font=title, fill=(240, 240, 235))
        for i, row in enumerate(rows):
            x, y = i % columns * cw, 50 + i // columns * ch
            tile = Image.open(ASSETS / row['preview']).convert('RGB')
            tile.thumbnail((cw - 12, ch - 54), Image.Resampling.LANCZOS)
            image.paste(tile, (x + (cw - tile.width) // 2, y))
            draw.text((x + 7, y + ch - 46), f'{i + 1:02}  {row["name"]}', font=font, fill=(238, 238, 232))
            draw.text((x + 7, y + ch - 23), f'{row["tileset"].capitalize()} · {row["width"]}×{row["height"]}', font=font, fill=(159, 171, 177))
        image.save(ROOT / f'map/NTW-{players}P-OVERVIEW-067.png', optimize=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', help='One or more comma-separated IDs for focused authoring; does not publish the catalogue/manifest.')
    args = parser.parse_args()
    library = json.loads(LIBRARY.read_text(encoding='utf-8'))
    specs = {row['id']: row for row in json.loads((ASSETS / 'warzone/command-catalog.json').read_text())['buildings']}
    existing = json.loads((ASSETS / 'ffa-maps.json').read_text(encoding='utf-8'))
    originals = [r for r in existing['maps'] if r['id'] in ORIGINAL_IDS]
    require(tuple(r['id'] for r in originals) == ORIGINAL_IDS and len(originals) == 6, 'The six original FFA rows must remain intact')
    old_hashes = {str(p.relative_to(ROOT)): digest(p.read_bytes()) for map_id in ORIGINAL_IDS
                  for p in (ROOT / 'map' / ('ffa-' + map_id)).rglob('*') if p.is_file()}
    old_hashes.update({str((ASSETS / row['preview']).relative_to(ROOT)): digest((ASSETS / row['preview']).read_bytes()) for row in originals})
    chosen = set(args.only.split(',')) if args.only else None
    entries, proofs = [], []
    for players in (2, 3, 4):
        for number in range(1, 16):
            design = recipe(players, number)
            if chosen and design['id'] not in chosen:
                continue
            entry, proof = author(design, library, specs)
            entries.append(entry); proofs.append(proof)
            print(json.dumps(dict(authored=entry['id'], name=entry['name'], players=players,
                                  family=design['family'], nativeMapSHA256=proof['nativeMapSHA256'],
                                  openingDistanceSpread=proof['checks']['nearestOpponentDistanceSpread'])), flush=True)
    require(all(digest((ROOT / path).read_bytes()) == value for path, value in old_hashes.items()), 'Original FFA map/preview bytes changed')
    if not chosen:
        require(len(entries) == 45 and Counter(r['players'] for r in entries) == {2: 15, 3: 15, 4: 15}, 'Expected fifteen maps in each new group')
        require(len({p['geometryD4SHA256'] for p in proofs}) == 45, 'Rotated/reflected duplicate terrain geography')
        require(len({p['nativeMapSHA256'] for p in proofs}) == 45, 'Duplicate native map bytes')
        output = dict(version=1, maps=entries, proofs=proofs,
                      originalSixPreserved=True, generatedCounts={'2': 15, '3': 15, '4': 15},
                      uniqueGeographiesIgnoringRotationReflectionAndPalette=45,
                      sourceOnly=True, emulatorUsed=False, nativeEngineExecuted=False,
                      scope='Original offline native-map authoring, binary readback, geometry/resource/footprint/route checks and real-data preview rendering. No native pathfinder, gameplay or difficulty balancing was executed.')
        dump(MANIFEST, output)
        dump(ASSETS / 'ffa-maps.json', dict(version=1, maps=originals + entries))
        contact_sheets(entries)
        report = dict(version='0.67', passed=True, generatedMaps=45, totalFFAChoices=51,
                      playerCounts={'2': 15, '3': 15, '4': 15}, originalSixPreserved=True,
                      uniqueD4Geographies=45, moduleOwnersChecked=True, exactOilPerPlayer=24,
                      neutralOilPerPlayer=8, startInfrastructureEqual=True,
                      allStartingTrucksGroundConnected=True, allStructurePerimetersReachable=True,
                      allNativeFoundationVerticesFlat=True, nativeFormatRoundtrip=True,
                      crossingSourceCellsChecked=True, authoredMinimumCorridorWidth=9,
                      previewsFromWrittenNativeData=True, emulatorUsed=False, nativeEngineExecuted=False,
                      nativePathfindingOrCobraOrBalancePlaytested=False,
                      manifest=dict(path=MANIFEST.relative_to(ROOT).as_posix(), sha256=digest(MANIFEST.read_bytes())),
                      maps=[dict(id=p['id'], geometryD4SHA256=p['geometryD4SHA256'], nativeMapSHA256=p['nativeMapSHA256'], checks=p['checks']) for p in proofs])
        source_paths = {Path(__file__).resolve(), LIBRARY,
                        ASSETS / 'warzone/command-catalog.json', ASSETS / 'ffa-maps.json', MANIFEST}
        source_paths.update(ROOT / f'map/NTW-{players}P-OVERVIEW-067.png' for players in (2, 3, 4))
        for entry in entries:
            source_paths.update(p for p in (ROOT / 'map' / entry['mapDirectory']).rglob('*') if p.is_file())
            source_paths.add(ASSETS / entry['preview'])
            info = library['themes'][entry['tileset']]
            source_paths.update(ROOT / 'map/art-assets-020' / (name + '.png') for name in info['groundNames'])
        report['sources'] = [dict(path=p.relative_to(ROOT).as_posix(), bytes=p.stat().st_size,
                                  sha256=digest(p.read_bytes())) for p in sorted(source_paths)]
        dump(ROOT / 'archive/ntw-0.67-map-checks.json', report)
    print(json.dumps(dict(passed=True, authoredMaps=len(entries), emulatorUsed=False, nativeEngineExecuted=False)))


if __name__ == '__main__':
    main()
