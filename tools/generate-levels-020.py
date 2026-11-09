"""Author the 43 scenic replacement maps using genuine bundled game artwork.

Only source authoring constraints and data-derived preview rendering are run.
No emulator, engine, native pathfinding or balance test is performed.
The native themes, terrain tables and feature dimensions are verified in
map-art-library-020.json. Preview textures are read from the preserved 0.19 APK.
"""
from __future__ import annotations
from pathlib import Path
from collections import Counter, deque
from hashlib import sha256
import argparse
import io
import json
import math
import random
import runpy
import struct
import numpy as np

from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'app/src/main/assets/warzone'
OUT=ROOT/'map/levels'
LIBRARY=ROOT/'tools/map-art-library-020.json'


def line(*v): return list(zip(v[::2],v[1::2]))
def E(x,y,rx,ry): return (x,y,rx,ry)


# Each composition is a separate geographical plan. Coordinates are percentage
# points, not transformations of another map; dimensions and base plan vary.
# Basins/courts are broad native ground, lakes and high rock islands are real
# terrain, and the road/causeway graph remains available for construction.
RECIPES=[
 # id, theme, dimensions, homeX, family, routes, open courts, water, rock islands, landmark districts
 ('easy01','rockies',(112,128),55,'pine tarn valley',
  [line(18,0,18,14,34,27,30,43,49,57,70,66,58,83)],
  [E(31,30,17,13),E(46,57,22,13),E(69,71,16,13)], [E(70,36,18,15),E(14,58,10,18)], [E(47,29,6,9)],[(25,33,'forest'),(66,60,'cabin'),(78,78,'forest')]),
 ('easy02','arizona',(128,112),41,'copper river horseshoe',
  [line(76,0,73,16,48,23,22,32,18,54,38,67,47,84)],
  [E(58,24,24,12),E(25,48,17,22),E(47,69,19,11)], [E(57,47,18,21),E(82,66,9,17)], [E(26,31,5,6)],[(29,46,'village'),(55,67,'industry'),(68,22,'palm')]),
 ('easy03','urban',(104,120),59,'abandoned park terraces',
  [line(22,0,22,18,63,18,63,37,32,37,32,61,62,61,62,84)],
  [E(43,19,28,10),E(35,47,22,19),E(65,64,23,14)], [E(78,42,10,15)], [E(48,40,7,10)],[(20,47,'city'),(66,20,'park'),(76,66,'city')]),
 ('easy04','arizona',(120,128),61,'amber crater rim',
  [line(49,0,32,17,17,40,24,63,54,76,62,85)],
  [E(26,28,14,17),E(24,57,16,18),E(51,75,26,12)], [E(77,53,12,18)], [E(52,43,23,23)],[(18,45,'boulder'),(43,72,'village'),(80,78,'palm')]),
 ('easy05','rockies',(128,112),42,'juniper high meadow',
  [line(22,0,22,15,41,29,69,35,72,58,46,71,43,85)],
  [E(42,30,25,15),E(70,48,18,18),E(51,71,22,12)], [E(20,55,12,14)], [E(54,48,8,10)],[(33,29,'forest'),(78,47,'forest'),(41,72,'cabin')]),
 ('easy06','urban',(128,128),52,'old civic ring',
  [line(50,0,49,19,25,30,24,58,46,70,54,85),line(49,19,75,31,75,57,46,70)],
  [E(50,21,30,11),E(25,47,14,22),E(74,47,14,22),E(50,71,25,12)], [], [E(50,47,17,18)],[(22,43,'city'),(78,40,'city'),(53,69,'park')]),
 ('easy07','arizona',(104,128),48,'quarry scar and haul road',
  [line(79,0,77,18,61,30,27,36,20,57,37,71,48,85)],
  [E(67,24,19,14),E(27,47,17,21),E(40,71,21,11)], [E(64,59,15,14)], [E(48,41,9,15)],[(70,23,'quarry'),(24,51,'industry'),(57,73,'boulder')]),
 ('easy08','rockies',(128,120),58,'longford lake causeway',
  [line(16,0,16,20,35,33,63,38,74,56,59,75,58,85)],
  [E(28,28,22,15),E(70,55,16,22),E(56,75,22,10)], [E(43,54,19,18),E(82,25,10,15)], [],[(24,23,'cabin'),(78,58,'forest'),(42,77,'forest')]),
 ('easy09','rockies',(112,136),41,'pine ridge saddle',
  [line(76,0,74,20,54,32,28,42,29,62,44,78,42,86)],
  [E(66,24,21,14),E(31,49,19,19),E(44,74,19,13)], [E(77,64,10,17)], [E(52,51,11,15)],[(70,22,'forest'),(21,49,'cabin'),(48,76,'forest')]),
 ('easy10','urban',(120,112),54,'slate rail district',
  [line(26,0,26,22,72,22,72,49,32,49,32,72,54,85)],
  [E(48,23,30,10),E(66,47,21,14),E(36,70,18,13)], [E(17,53,9,20)], [E(51,36,13,6)],[(24,25,'industry'),(80,47,'city'),(32,68,'industry')]),
 ('easy11','rockies',(128,128),63,'orchard reservoir',
  [line(20,0,22,21,39,34,41,58,63,72,63,85)],
  [E(24,22,15,17),E(43,49,18,21),E(65,71,22,14)], [E(72,34,17,20)], [E(20,57,7,13)],[(28,24,'forest'),(37,53,'cabin'),(77,70,'forest')]),
 ('easy12','arizona',(112,120),38,'ochre badland amphitheatre',
  [line(82,0,80,21,61,34,39,36,20,53,25,73,38,86)],
  [E(66,27,24,15),E(31,50,24,14),E(25,71,17,13)], [], [E(56,58,17,16),E(17,31,8,10)],[(67,29,'boulder'),(18,54,'village'),(34,72,'quarry')]),
 ('easy13','rockies',(128,104),59,'cedar river bend',
  [line(17,0,18,20,36,27,66,25,77,47,62,68,58,85)],
  [E(36,29,26,14),E(76,47,13,20),E(59,70,23,14)], [E(45,49,19,15),E(20,70,11,9)], [],[(24,24,'cabin'),(80,48,'forest'),(54,73,'forest')]),
 ('easy14','urban',(112,128),40,'lantern docklands',
  [line(72,0,73,19,43,23,24,41,24,65,41,84)],
  [E(59,22,25,12),E(29,44,18,18),E(34,68,20,14)], [E(63,48,22,20),E(81,76,13,14)], [],[(63,22,'industry'),(20,46,'city'),(43,69,'industry')]),
 ('easy15','arizona',(128,128),56,'quiet observatory basin',
  [line(28,0,27,21,55,36,77,51,72,69,55,85)],
  [E(29,24,17,18),E(63,40,24,17),E(70,69,21,14)], [E(28,59,13,17)], [E(52,56,8,9)],[(21,23,'palm'),(75,48,'science'),(66,73,'village')]),
 ('medium01','arizona',(128,128),51,'twin red gorges',
  [line(16,0,17,22,36,42,27,62,47,84),line(82,0,80,24,66,40,75,64,55,84)],
  [E(27,31,19,17),E(72,47,18,23),E(44,74,24,12)], [E(49,27,9,16)], [E(48,53,13,20)],[(22,38,'village'),(79,49,'quarry'),(48,76,'palm')]),
 ('medium02','rockies',(136,112),62,'crosswind snow saddle',
  [line(16,0,20,22,48,38,69,56,62,85),line(80,0,78,22,48,38)],
  [E(25,25,20,17),E(68,26,21,17),E(57,52,24,20),E(62,75,19,13)], [E(21,59,13,17)], [E(82,59,7,17)],[(22,27,'snowforest'),(75,27,'cabin'),(64,62,'snowforest')]),
 ('medium03','urban',(128,120),39,'westmere canal wards',
  [line(18,0,18,25,37,25,37,56,40,85),line(77,0,77,18,66,18,66,57,37,57)],
  [E(24,26,18,16),E(70,32,17,25),E(41,65,21,14)], [E(50,31,7,22),E(79,73,11,13)], [],[(19,27,'city'),(74,36,'city'),(44,66,'industry')]),
 ('medium04','rockies',(112,136),52,'granite caldera gates',
  [line(20,0,19,23,32,39,22,58,49,75,52,85),line(79,0,80,25,66,44,72,61,49,75)],
  [E(27,29,18,17),E(73,37,18,23),E(45,74,27,12)], [E(49,44,12,15)], [E(50,27,6,8)],[(20,49,'forest'),(80,47,'snowforest'),(41,75,'cabin')]),
 ('medium05','rockies',(128,128),54,'two rivers moraine',
  [line(20,0,18,22,29,45,23,69,44,85),line(79,0,81,26,66,49,74,70,61,85)],
  [E(24,37,16,23),E(74,45,17,25),E(45,75,24,12)], [E(46,35,11,23),E(45,63,8,10)], [E(87,52,5,12)],[(21,47,'cabin'),(75,54,'forest'),(47,79,'forest')]),
 ('medium06','arizona',(136,120),43,'high mesa low wash',
  [line(18,0,21,26,43,40,38,64,42,85),line(82,0,78,21,61,32,43,40)],
  [E(28,25,21,18),E(66,29,22,16),E(38,62,22,20)], [E(76,65,14,19)], [E(54,58,9,15)],[(23,24,'village'),(72,26,'quarry'),(34,65,'palm')]),
 ('medium07','urban',(128,128),62,'crescent waterfront',
  [line(20,0,18,23,24,51,45,72,61,85),line(78,0,81,24,76,55,62,85)],
  [E(22,34,16,24),E(77,38,14,22),E(47,72,25,14)], [E(49,40,20,26)], [],[(17,42,'city'),(82,37,'industry'),(46,73,'city')]),
 ('medium08','arizona',(112,128),40,'staggered caravan courts',
  [line(17,0,20,22,45,33,63,49,51,66,41,85),line(81,0,79,21,63,49)],
  [E(29,24,23,17),E(68,39,21,20),E(46,66,22,15)], [], [E(26,52,10,14),E(73,68,8,10)],[(25,25,'village'),(68,35,'village'),(45,70,'palm')]),
 ('medium09','arizona',(128,112),57,'split mesa oilfields',
  [line(21,0,22,23,38,39,29,61,49,85),line(80,0,77,28,70,49,78,66,62,85)],
  [E(27,34,18,22),E(74,45,17,23),E(45,73,25,13)], [E(49,22,11,13)], [E(51,51,15,20)],[(23,43,'industry'),(79,45,'quarry'),(52,74,'industry')]),
 ('medium10','rockies',(120,136),46,'willow braided wetlands',
  [line(17,0,18,23,34,42,27,64,46,85),line(80,0,79,23,64,43,68,66,48,85),line(34,42,49,49,64,43)],
  [E(28,36,18,22),E(71,41,17,23),E(47,67,22,17)], [E(49,29,10,15),E(46,59,8,10),E(82,74,8,10)], [],[(22,36,'forest'),(70,34,'cabin'),(52,71,'forest')]),
 ('medium11','rockies',(128,120),60,'basalt glacial bow',
  [line(22,0,17,22,17,46,37,66,60,85),line(80,0,81,28,65,46,60,85)],
  [E(20,33,14,26),E(74,37,17,23),E(39,65,20,14)], [E(48,34,15,20)], [E(45,56,10,10)],[(20,40,'snowforest'),(80,39,'cabin'),(43,72,'forest')]),
 ('medium12','urban',(136,112),39,'long industrial branches',
  [line(19,0,19,25,40,25,40,52,24,52,24,72,39,85),line(78,0,78,20,64,20,64,61,53,75,39,85)],
  [E(25,28,18,16),E(70,36,19,26),E(30,65,18,17),E(48,76,24,10)], [E(87,65,7,17)], [E(49,43,6,12)],[(25,28,'industry'),(74,43,'industry'),(34,68,'city')]),
 ('medium13','urban',(128,128),53,'old canal locks',
  [line(20,0,20,23,36,23,36,58,28,58,28,75,49,85),line(79,0,79,24,65,24,65,62,77,62,77,75,56,85),line(36,43,65,43)],
  [E(25,29,17,17),E(74,30,17,17),E(48,46,29,11),E(51,74,29,12)], [E(50,27,7,16),E(50,61,7,13)], [],[(22,31,'city'),(76,31,'city'),(50,72,'industry')]),
 ('medium14','arizona',(112,136),59,'arrowhead salt basin',
  [line(20,0,20,23,46,43,70,60,59,85),line(80,0,77,24,46,43)],
  [E(27,28,19,18),E(70,29,20,17),E(50,48,24,17),E(69,65,17,17)], [E(29,64,14,20)], [E(51,26,8,11)],[(21,30,'village'),(77,30,'boulder'),(66,65,'science')]),
 ('medium15','urban',(128,120),41,'broken boulevard ring',
  [line(19,0,19,22,28,40,23,61,41,85),line(79,0,80,23,73,47,57,65,41,85),line(28,40,48,31,73,47)],
  [E(22,32,15,20),E(76,37,17,22),E(45,65,25,16)], [], [E(47,47,12,13)],[(19,44,'city'),(80,42,'city'),(46,68,'park')]),
 ('hard01','rockies',(128,136),51,'three crown massifs',
  [line(14,0,17,22,30,40,23,65,44,85),line(49,0,48,25,51,49,51,85),line(84,0,81,25,69,45,77,67,59,85)],
  [E(24,34,18,21),E(51,49,13,24),E(75,40,17,22),E(48,74,30,12)], [E(36,20,8,12)], [E(36,50,7,19),E(62,60,6,13)],[(23,38,'snowforest'),(75,38,'snowforest'),(48,71,'cabin')]),
 ('hard02','arizona',(136,128),43,'trident stone gorge',
  [line(14,0,16,26,35,45,46,57,43,85),line(49,0,49,24,46,57),line(85,0,83,21,65,37,46,57)],
  [E(25,31,20,20),E(52,33,15,19),E(76,29,20,18),E(46,65,27,16)], [E(77,70,11,16)], [E(26,62,6,13)],[(21,33,'quarry'),(74,27,'village'),(51,65,'industry')]),
 ('hard03','urban',(128,128),61,'flanking ridge metropolis',
  [line(14,0,15,26,29,26,29,64,50,85),line(49,0,49,44,61,62,61,85),line(84,0,84,25,72,25,72,64,66,85)],
  [E(22,32,16,24),E(50,41,17,24),E(78,35,15,25),E(55,73,27,13)], [], [E(39,40,5,20),E(63,32,5,15)],[(20,35,'city'),(48,44,'industry'),(81,42,'city')]),
 ('hard04','urban',(136,120),40,'triune shattered junction',
  [line(15,0,15,26,35,40,29,64,40,85),line(50,0,50,24,35,40,62,55,40,85),line(84,0,83,28,62,55)],
  [E(26,29,21,18),E(50,30,17,16),E(73,38,19,23),E(43,64,27,17)], [E(80,74,10,13)], [E(47,49,6,7)],[(24,32,'city'),(75,40,'city'),(40,69,'industry')]),
 ('hard05','rockies',(120,144),57,'three glacial rivers',
  [line(14,0,16,24,35,43,43,64,57,85),line(49,0,49,28,43,64),line(84,0,81,26,67,48,43,64)],
  [E(25,30,19,20),E(50,35,17,21),E(74,36,18,23),E(48,66,25,17)], [E(32,65,10,15),E(73,68,10,15)], [E(60,22,5,11)],[(22,36,'forest'),(74,43,'snowforest'),(48,68,'cabin')]),
 ('hard06','arizona',(128,120),40,'needle badland forks',
  [line(15,0,17,24,33,42,45,60,40,85),line(50,0,49,25,45,60),line(84,0,82,24,65,44,45,60),line(45,60,71,71,40,85)],
  [E(25,31,18,19),E(51,32,15,18),E(73,33,18,19),E(46,67,28,16)], [], [E(35,52,5,12),E(57,48,5,10),E(74,63,5,7)],[(24,33,'boulder'),(73,36,'quarry'),(55,72,'village')]),
 ('hard07','rockies',(136,136),61,'braided forest front',
  [line(15,0,17,23,31,43,25,64,51,85),line(50,0,49,28,51,51,61,85),line(85,0,83,22,70,44,77,66,68,85),line(31,43,51,51,70,44)],
  [E(25,30,20,18),E(50,39,17,24),E(76,33,18,20),E(49,69,30,14)], [E(37,58,8,11),E(64,23,7,10)], [],[(22,35,'forest'),(74,36,'forest'),(53,72,'cabin')]),
 ('hard08','rockies',(128,128),41,'split summit lake',
  [line(15,0,18,26,42,40,34,64,41,85),line(49,0,50,23,42,40),line(84,0,82,27,69,49,70,71,49,85)],
  [E(24,30,20,20),E(51,31,16,18),E(75,43,17,24),E(42,69,24,14)], [E(53,54,13,18)], [E(22,57,7,15)],[(21,34,'snowforest'),(77,44,'cabin'),(43,72,'forest')]),
 ('hard09','arizona',(136,128),57,'canyon council city',
  [line(15,0,16,21,32,38,45,58,57,85),line(50,0,50,25,45,58),line(85,0,84,26,67,44,45,58)],
  [E(24,29,20,18),E(50,35,17,22),E(75,35,19,22),E(49,66,27,17)], [E(25,67,11,16)], [E(65,64,7,12)],[(24,31,'village'),(74,34,'village'),(48,67,'science')]),
 ('hard10','urban',(128,136),43,'triple refinery bends',
  [line(15,0,15,31,31,31,31,66,43,85),line(50,0,50,22,46,48,57,64,43,85),line(85,0,84,25,71,25,71,55,60,75,43,85)],
  [E(23,35,17,23),E(49,41,17,25),E(77,35,16,23),E(46,70,27,15)], [E(87,72,6,13)], [E(37,23,5,10)],[(22,41,'industry'),(50,47,'industry'),(79,42,'industry')]),
 ('hard11','arizona',(120,128),60,'crown redstone basin',
  [line(14,0,16,24,35,43,29,66,53,85),line(49,0,49,25,35,43,62,57,60,85),line(84,0,83,21,69,37,62,57)],
  [E(25,31,20,19),E(49,32,17,19),E(75,31,17,20),E(46,68,27,15)], [], [E(46,54,10,11),E(80,61,6,12)],[(21,35,'quarry'),(74,33,'boulder'),(47,72,'palm')]),
 ('hard12','urban',(144,120),41,'ridge research network',
  [line(14,0,15,22,29,35,27,65,41,85),line(49,0,50,25,50,52,41,85),line(85,0,84,23,70,36,74,65,48,85),line(29,35,50,44,70,36)],
  [E(23,29,18,19),E(50,34,17,22),E(78,31,18,20),E(48,68,29,15)], [E(54,23,7,10)], [E(40,58,5,13),E(65,55,5,11)],[(22,34,'science'),(50,39,'science'),(78,37,'science')]),
 ('hard13','urban',(136,136),58,'final estuary confluence',
  [line(15,0,17,22,33,39,46,61,58,85),line(50,0,49,25,33,39),line(85,0,83,26,66,44,46,61)],
  [E(25,29,19,19),E(51,30,17,17),E(75,34,18,21),E(48,67,28,16)], [E(24,64,12,18),E(76,67,12,20)], [E(50,49,6,9)],[(21,31,'city'),(77,36,'industry'),(51,70,'city')]),
]


def require(ok,message):
    if not ok: raise RuntimeError(message)
def dump(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
def write(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(data if isinstance(data,(bytes,bytearray)) else data.encode('utf-8'))
def clamp(x,a,b): return max(a,min(b,x))
def smooth(x): return x*x*(3-2*x)
def noise(x,y,s): return (math.sin(x*.167+s*.71)+math.sin(y*.131-s*.37)+math.sin((x+y)*.071+s))*0.333


def sample_line(points,w,h,urban=False):
    points=[(x*(w-1)/100,y*(h-1)/100) for x,y in points]
    result=[]
    for i,(a,b) in enumerate(zip(points,points[1:])):
        p=points[max(0,i-1)];q=points[min(len(points)-1,i+2)]
        n=max(2,round(math.dist(a,b)*2))
        for step in range(n):
            t=step/n
            if urban:
                x=a[0]+t*(b[0]-a[0]);y=a[1]+t*(b[1]-a[1])
            else:
                x=.5*((2*a[0])+(-p[0]+b[0])*t+(2*p[0]-5*a[0]+4*b[0]-q[0])*t*t+(-p[0]+3*a[0]-3*b[0]+q[0])*t*t*t)
                y=.5*((2*a[1])+(-p[1]+b[1])*t+(2*p[1]-5*a[1]+4*b[1]-q[1])*t*t+(-p[1]+3*a[1]-3*b[1]+q[1])*t*t*t)
            result.append((x,y))
    result.append(points[-1]);return result


def brush(points,radius,w,h,seed=0,irregular=False):
    cells=set()
    for i,(cx,cy) in enumerate(points):
        r=radius+(math.sin(i*.08+seed)*1.1 if irregular else 0)
        for y in range(max(0,int(cy-r-2)),min(h,int(cy+r+3))):
            for x in range(max(0,int(cx-r-2)),min(w,int(cx+r+3))):
                if (x-cx)**2+(y-cy)**2 <= (r+(noise(x,y,seed)*.8 if irregular else 0))**2: cells.add((x,y))
    return cells


def ellipse(shape,w,h,seed=0,rough=False):
    cx,cy,rx,ry=shape;cx*=w/100;cy*=h/100;rx*=w/100;ry*=h/100
    return {(x,y) for y in range(max(0,int(cy-ry-3)),min(h,int(cy+ry+4)))
            for x in range(max(0,int(cx-rx-3)),min(w,int(cx+rx+4)))
            if ((x-cx)/rx)**2+((y-cy)/ry)**2 <= 1+(noise(x,y,seed)*.13 if rough else 0)}


def shoreline(shape,w,h,seed,urban):
    cx,cy,rx,ry=shape
    if urban:
        # Authored rectilinear docks/canals, with stepped quay cuts. Water is
        # actual terrain; the banks remain real dry native cliff/ground.
        x1,x2=round((cx-rx)*w/100),round((cx+rx)*w/100)
        y1,y2=round((cy-ry)*h/100),round((cy+ry)*h/100)
        result={(x,y) for x in range(x1,x2+1) for y in range(y1,y2+1)}
        cut=max(2,round(rx*w/450))
        for n in range(1,5):
            yy=y1+n*(y2-y1)//5
            if (seed+n)%2:result-={(x,y) for x in range(x1,x1+cut+1) for y in range(yy,yy+cut+1)}
            else:result-={(x,y) for x in range(x2-cut,x2+1) for y in range(yy,yy+cut+1)}
        if seed%2:result-={(x,y) for x in range(x1,x1+(x2-x1)//3) for y in range(y1,y1+(y2-y1)//3)}
        return result
    # Natural lakes have asymmetric coves, narrow inlets, bays and headlands.
    # They are not simply differently sized oval holes in the ridge.
    result=ellipse(shape,w,h,seed,True)
    result|=ellipse((cx-rx*.36,cy+ry*.24,rx*.85,ry*.72),w,h,seed+3,True)
    result|=ellipse((cx+rx*.43,cy-ry*.31,rx*.65,ry*.78),w,h,seed+9,True)
    headland=ellipse((cx-rx*.82,cy-ry*.16,rx*.6,ry*.32),w,h,seed+7,True)
    result-=headland
    if seed%2:
        tail=sample_line([(cx+rx*.4,cy+ry*.5),(cx+rx*.72,cy+ry*1.4),(cx+rx*.47,cy+ry*1.8)],w,h)
        result|=brush(tail,max(1.5,rx*w/900),w,h,seed,True)
    return result


def distance_field(ground,w,h):
    distance={p:0 for p in ground};pending=deque(ground)
    while pending:
        x,y=pending.popleft();d=distance[x,y]+1
        for a,b in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
            if 0<=a<w and 0<=b<h and (a,b) not in distance:
                distance[a,b]=d;pending.append((a,b))
    return distance


def connected(cells,origin,diagonal=False):
    require(origin in cells,'Connectivity origin not ground')
    seen={origin};pending=deque([origin])
    while pending:
        x,y=pending.popleft()
        neighbours=[(x-1,y),(x+1,y),(x,y-1),(x,y+1)]
        if diagonal:neighbours += [(x-1,y-1),(x+1,y-1),(x-1,y+1),(x+1,y+1)]
        for p in neighbours:
            if p in cells and p not in seen: seen.add(p);pending.append(p)
    return seen


def expanded(cells,r):
    return {(x+dx,y+dy) for x,y in cells for dx in range(-r,r+1) for dy in range(-r,r+1)}
def footprint(spec,x,y):
    a,b=spec['width'],spec['breadth']
    return {(u,v) for u in range(x-a//2,x-a//2+a) for v in range(y-b//2,y-b//2+b)}


def connected_road_samples(samples):
    result=set()
    for points in samples:
        previous=None
        for px,py in points:
            x,y=round(px),round(py)
            if previous is not None:
                a,b=previous
                # Four-connected tile centreline: native road elbows join
                # cardinally instead of leaving diagonal cracks in asphalt.
                while (a,b)!=(x,y):
                    if abs(x-a)>=abs(y-b) and a!=x:a+=1 if x>a else -1
                    elif b!=y:b+=1 if y>b else -1
                    result.add((a,b))
            result.add((x,y));previous=x,y
    return result


def geography(recipe,seed):
    level,theme,(w,h),home_x,family,routes,courts,waters,islands,districts=recipe
    samples=[sample_line(p,w,h,theme=='urban') for p in routes]
    primary=set().union(*(brush(p,4.1,w,h) for p in samples))
    ground=set().union(*(brush(p,5.1+(i%2)*1.2,w,h,seed+i,True) for i,p in enumerate(samples)))
    for shape in courts: ground|=ellipse(shape,w,h,seed,True)
    # Villages, parks and industrial campuses get their own lateral clearings
    # and short access streets, rather than a few props scattered on a road.
    for dx,dy,kind in districts:
        if kind in ('boulder','palm','forest','snowforest'):continue
        clearing=ellipse((dx,dy,12 if kind!='city' else 14,11),w,h,seed+7,True)
        ground|=clearing
        centre=(dx*w/100,dy*h/100)
        nearest=min((p for sample in samples for p in sample),key=lambda p:math.dist(centre,p))
        ground|=brush([centre,nearest]+sample_line([(dx,dy),(nearest[0]*100/w,nearest[1]*100/h)],w,h,True),3.1,w,h)
    # Every base is an organic collection of linked building courts, varied
    # among five plans rather than the 0.19 universal southern rectangle.
    cx=round(home_x*w/100);cy=h-24
    style=seed%5
    base=ellipse((home_x,100*(h-24)/h,34 if style!=2 else 29,18),w,h,seed,True)
    if style==0:
        base|=ellipse((home_x-18,80,16,12),w,h,seed+3,True)
    elif style==1:
        base|=ellipse((home_x+17,81,17,13),w,h,seed+3,True)
    elif style==2:
        base|=ellipse((home_x-22,85,16,12),w,h,seed+2,True)|ellipse((home_x+22,85,16,12),w,h,seed+4,True)
    elif style==3:
        base|=ellipse((home_x-13,78,23,11),w,h,seed+5,True)
    else:
        base|=ellipse((home_x+12,78,22,11),w,h,seed+5,True)
    # A fully clear protected rear uplink court is intentional native ground.
    rear={(x,y) for x in range(cx-6,cx+7) for y in range(h-17,h-5)}
    base|=rear
    ground|=base
    water=set().union(*(shoreline(p,w,h,seed+19,theme=='urban') for p in waters)) if waters else set()
    cliffs=set().union(*(ellipse(p,w,h,seed+31,True) for p in islands)) if islands else set()
    ground-=((water|cliffs)-primary-base)
    # A one-tile rock bank separates the water plane from traversable slopes.
    water-=expanded(ground,1)
    mouths=[]
    # Secondary paths inside a single-entry recipe do not invent an entrance.
    for p in routes:
        if p[0][1]==0:
            x=round(p[0][0]*(w-1)/100)
            if all(abs(x-a)>10 for a in mouths): mouths.append(x)
    allowed={(x,y) for y in range(h) for x in range(w)
             if 4<=x<w-4 and 4<=y<h-5 or y<4 and any(abs(x-a)<=4 for a in mouths)}
    ground&=allowed;primary&=ground;base&=ground;water&=allowed
    # Uniform nine-tile spawn mouths, then irregular, broad natural valleys.
    mouth_cells={(x,y) for a in mouths for x in range(a-4,a+5) for y in range(4)}
    ground|=mouth_cells;primary|=mouth_cells
    origin=(mouths[0],1)
    reached=connected(ground,origin)
    # Ellipse tips can rasterize a one-tile diagonal island. Keep connected
    # native ground only; the removed cell becomes honest native cliff.
    ground=reached;base&=ground;primary&=ground
    roads=set().union(*(brush(p,1.25 if theme!='urban' else 1.7,w,h) for p in samples))&ground
    aisle=sample_line([(home_x,80),(home_x,91)],w,h,True)
    roads|=brush(aisle,1.3,w,h)&ground
    road_centres=connected_road_samples(samples+[aisle])&ground
    roads|=road_centres
    return dict(w=w,h=h,cx=cx,cy=cy,base=base,ground=ground,primary=primary,water=water,
                roads=roads,road_centres=road_centres,mouths=mouths,samples=samples,style=style,
                ground_distance=distance_field(ground,w,h))


def objects(recipe,g,seed,specs,feature_specs):
    level,theme,_,_,_,_,_,_,_,districts=recipe
    w,h,cx,cy=g['w'],g['h'],g['cx'],g['cy']
    ground,base=g['ground'],g['base']
    structures=[];droids=[];features=[];occupied=set();next_id=100
    rng=random.Random(seed*997)
    def place(name,tx,ty,player=0,force=False):
        nonlocal next_id,occupied
        spec=specs[name]
        candidates=sorted(((x,y) for x,y in (base if player==0 else ground)
                           if player==0 or y<17),key=lambda p:(p[0]-tx)**2+(p[1]-ty)**2)
        for x,y in candidates:
            f=footprint(spec,x,y)
            if f<=ground and not expanded(f,1)&occupied and (player or f<=base):
                structures.append(dict(name=name,id=next_id,position=[round((x+spec['width']%2*.5)*128),round((y+spec['breadth']%2*.5)*128)],rotation=0,startpos=player))
                next_id+=1;occupied|=f;return x,y,f
        raise RuntimeError('No base footprint '+level+' '+name)
    # Uplink first, with its entire clear court reserved against all later
    # structures/scenery/units. Its feature is the actual owned native centre.
    satx,saty,sat=place('A0Sat-linkCentre',cx,h-12)
    sat_court=expanded(sat,3);occupied|=sat_court
    hqx,hqy,_=place('A0CommandCentre',cx+(-3 if seed%2 else 3),h-23)
    # Individually shifted campus targets are packed onto each authored base.
    spread=1 if seed%2 else -1
    targets=[('A0ResearchFacility',cx-22,cy-5),('A0ResearchFacility',cx-17,cy+5),
             ('A0LightFactory',cx+21,cy-5),('A0LightFactory',cx+24,cy+5),
             ('A0CyborgFactory',cx+13,cy+8),('A0PowerGenerator',cx-29,cy+1)]
    for n,(name,x,y) in enumerate(targets): place(name,x+spread*(n%3-1)*2,y+(seed%3-1)*2)
    difficulty=level.rstrip('0123456789')
    if difficulty!='easy' or seed%2==0: place('A0PowerGenerator',cx-29,cy+9)
    for x,y in [(cx-12,cy-13),(cx+13,cy-13)]+([(cx-27,cy-10),(cx+28,cy-10)] if difficulty=='hard' else []): place('GuardTower1',x,y)
    oil_targets=[(cx-28,cy+12),(cx-21,cy+14),(cx-9,cy+11),(cx+28,cy+12)]
    for x,y in oil_targets:
        x,y,f=place('A0ResourceExtractor',x,y)
        features.append(dict(name='OilResource',id=next_id,position=[x*128+64,y*128+64],rotation=0));next_id+=1
    entry=g['mouths'][0]
    place('A0CommandCentre',entry-1,8,1)
    count={'easy':4,'medium':5,'hard':6}[difficulty]
    free=ground-occupied
    for player,amount,target in [(0,count,(cx,cy-5)),(1,1,(entry+2,12))]:
        candidates=sorted((p for p in free if (p[1]>h*.7 if player==0 else p[1]<17)),key=lambda p:math.dist(p,target))
        for n in range(amount):
            p=next(p for p in candidates if p in free and not expanded({p},1)&occupied)
            x,y=p;occupied.add(p);free.remove(p)
            droids.append(dict(template='ConstructionDroid',id=next_id,position=[x*128+64,y*128+64],rotation=0,startpos=player));next_id+=1
    # Feature placement is explicit district composition, using verified native
    # models; no crates/oil drums that could change the economy or research.
    palettes={
      'forest':['Tree1','Tree2','Tree3'],'snowforest':['TreeSnow1','TreeSnow2','TreeSnow3'],
      'cabin':['LogCabin1','LogCabin2','LogCabin3','Tree1','Tree2'],
      'palm':['arizonatree1','arizonatree2','arizonabush1','arizonabush3'],
      'village':['BarbHUT','BarbWarehouse1','BarbWarehouse2','BarbTechRuin','WaterTower'],
      'city':['building1','building2','building3','building7','building8','WreckedBuilding9','Ruin1','Ruin5','BlueCar'],
      'industry':['OldFactory','bigcooltowr','Crane','OilTower','Pylon','Pipe','WreckedTankerV'],
      'science':['Advmaterialslab','Powlab','Laseropticslab','AirTrafficControl','Nanolab'],
      'park':['Tree1','Tree2','Tree3','Ruin3','WaterTower'],
      'quarry':['Crane','Boulder1','Boulder2','Boulder3','OldFactory','Wreck2'],
      'boulder':['Boulder1','Boulder2','Boulder3'],
    }
    feature_cells=set();landmarks=[]
    # Keep the full primary movement route and broad starting construction
    # campus clear. Scenic districts lie in lateral ground courts/on ridges.
    forbidden=expanded(g['primary'],1)|expanded(occupied,2)|{(x,y) for y in range(15) for x in range(w)}
    for dx,dy,kind in districts:
        px,py=dx*w/100,dy*h/100
        targets=[]
        # Deliberate block/wood patterns differ from random confetti.
        if kind in ('city','industry','science','village'):
            targets=[(round(px+a),round(py+b)) for b in (-13,-7,-1,5,11) for a in (-13,-7,-1,5,11)]
        else:
            targets=[(round(px+math.cos(a)*r),round(py+math.sin(a)*r*.75)) for r in (5,9,13) for a in (0,.8,1.7,2.6,3.5,4.4,5.4)]
        accepted=0
        for n,(x,y) in enumerate(targets):
            name=palettes[kind][(n+seed)%len(palettes[kind])];spec=feature_specs[name]
            f=footprint(spec,x,y)
            if not all(5<=a<w-5 and 14<=b<h-6 for a,b in f):continue
            if f&forbidden or expanded(f,1)&feature_cells or f&g['water']:continue
            if kind not in ('boulder','forest','snowforest','palm') and not f<=ground:continue
            if kind in ('forest','snowforest','palm') and not f<=ground:continue
            features.append(dict(name=name,id=next_id,position=[round((x+spec['width']%2*.5)*128),round((y+spec['breadth']%2*.5)*128)],rotation=(n%4)*16384))
            next_id+=1;feature_cells|=f;accepted+=1
        landmarks.append(dict(kind=kind,tile=[round(px),round(py)],nativeFeatures=accepted))
    # Small terrain-aware edge clusters soften cliff/forest silhouettes. They
    # remain absent from the protected route and do not create tactical loot.
    ground_edges=[(x,y) for x,y in sorted(ground) if y>16 and y<h-38 and any((x+dx,y+dy) not in ground for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)))]
    for n,(x,y) in enumerate(ground_edges):
        if (x*19+y*31+seed)%9:continue
        names=['arizonabush1','arizonabush2','Boulder1','Boulder2'] if theme=='arizona' else ['Tree1','Tree2','Boulder2'] if theme=='rockies' else ['Ruin1','Ruin4','Wreck1']
        name=names[(n+seed)%len(names)];spec=feature_specs[name];f=footprint(spec,x,y)
        if f&forbidden or expanded(f,1)&feature_cells or f&g['water']:continue
        features.append(dict(name=name,id=next_id,position=[x*128+64,y*128+64],rotation=(n%4)*16384));next_id+=1;feature_cells|=f
    # Sparse background landmarks sit on the high enclosed massifs: these
    # are native scenery, never loot or required player infrastructure.
    for y in range(16,h-31,9):
        for x in range(9,w-9,9):
            if (x*7+y*3+seed)%4 or g['ground_distance'][x,y]<5:continue
            if theme=='urban':names=['Ruin1','Ruin5','WreckedBuilding9','Boulder2']
            elif theme=='arizona':names=['Boulder1','Boulder2','Boulder3','arizonabush1']
            else:names=['Boulder1','TreeSnow1' if seed%3==0 else 'Tree1','TreeSnow2' if seed%3==0 else 'Tree2']
            name=names[(x+y+seed)%len(names)];spec=feature_specs[name];f=footprint(spec,x,y)
            if f&forbidden or expanded(f,1)&feature_cells or f&g['water']:continue
            features.append(dict(name=name,id=next_id,position=[round((x+spec['width']%2*.5)*128),round((y+spec['breadth']%2*.5)*128)],rotation=0));next_id+=1;feature_cells|=f
    g['satellite']=[satx,saty];g['hq']=[hqx,hqy];g['occupied']=occupied;g['feature_cells']=feature_cells;g['landmarks']=landmarks
    return structures,droids,features


def tile_material(theme,x,y,g,seed):
    """Broad spatially coherent native materials; never material confetti."""
    w,h=g['w'],g['h'];nx=x/w;ny=y/h;value=noise(x*.67,y*.67,seed)
    if theme=='arizona':
        if value>.34:return 'a_red'
        if value<-.24:return 'a_mud'
        if .34<nx<.71 and .31<ny<.78 and value<.19:return 'a_green' if seed%3==0 else 'a_sand'
        return 'a_yellow' if seed%2 else 'a_sand'
    if theme=='urban':
        if value>.37:return 'u_green'
        if value<-.3:return 'u_brown'
        return ['u_blue','u_gray','u_stone'][seed%3]
    snow=seed%3
    if snow==0 and (ny<.58+value*.3 or value>.3):return 'r_snow'
    if snow!=2 and value>.24:return 'r_snowgrass'
    if value<-.27:return 'r_brown'
    return 'r_grass' if snow!=0 or ny>.69 else 'r_rock'


def terrain(recipe,g,seed,library):
    theme=recipe[1];w,h=g['w'],g['h'];info=library['themes'][theme]
    types=info['terrainTypes'];uniform=info['safeUniformByMaterial']
    corners=[[info['groundNames'][n] for n in row] for row in info['groundCornersNW_NE_SE_SW']]
    ground,roads,water=g['ground'],g['roads'],g['water']
    decals={int(v) for v in info['decalDefinitions']}
    allowed=[i for i,t in enumerate(types[:len(corners)]) if t not in (7,8) and i not in decals]
    # Height field is gentle on all reachable ground; the protected base is
    # flat. Real rock masses rise beyond the cliffs, within native max510.
    floor_vertices=expanded(ground,0)|{(x+dx,y+dy) for x,y in ground for dx,dy in ((0,0),(1,0),(0,1),(1,1))}
    water_vertices={(x+dx,y+dy) for x,y in water for dx,dy in ((0,0),(1,0),(0,1),(1,1))}
    require(not water_vertices&floor_vertices,'Water plane touches a sloped walkable vertex')
    base_vertices={p for x,y in g['base'] for p in ((x,y),(x+1,y),(x,y+1),(x+1,y+1))}
    def floor_height(x,y):
        blend=clamp((h-35-y)/18,0,1)
        return round(128+blend*(32+20*math.sin(x/24+seed*.3)+17*math.sin(y/27-seed*.2)))
    heights={}
    for y in range(h):
        for x in range(w):
            if (x,y) in floor_vertices: value=128 if (x,y) in base_vertices else floor_height(x,y)
            elif (x,y) in water_vertices: value=90
            else:
                value=clamp(290+round(85*noise(x*.6,y*.6,seed)+43*math.sin((x+y)/15+seed)),180,480)
            heights[x,y]=value
    # Base and scenery footprints stay flat for stable native rendering. The
    # floor field itself never makes an accessible build pad excessively steep.
    textures=[];material_counts=Counter();decorative_ground=set();water_bank=expanded(water,2)
    for y in range(h):
        for x in range(w):
            if (x,y) in water:
                index=info.get('waterTile',17)
            elif (x,y) not in ground:
                # The native cliff-ground material remains coherent across
                # ridges. Mixed cliff/decal tiles in rectangular chunks would
                # create the very patchwork the scenic revision removes.
                d=g['ground_distance'][x,y]
                interior=d>=4 and 5<=x<w-5 and 5<=y<h-6 and (x,y) not in water_bank
                if interior:
                    altitude=heights[x,y]
                    if theme=='arizona':
                        material='a_yellow' if altitude>360 else 'a_red' if altitude>260 else 'a_mud'
                    elif theme=='urban':
                        material='u_gray' if altitude>355 else 'u_brown' if altitude<260 else 'u_blue'
                    else:
                        material='r_snow' if altitude>375 else 'r_snowrock' if altitude>325 else 'r_rock' if altitude>270 else 'r_brown'
                    candidates=[i for i in uniform[material] if types[i] not in (7,8)]
                    index=candidates[0];decorative_ground.add((x,y))
                elif theme=='rockies' and seed%3==0 and y<h*.57:index=44
                else:index={'arizona':18,'urban':69,'rockies':30}[theme]
            elif (x,y) in g['road_centres']:
                # Genuine asphalt is used only on long cardinal street runs.
                # The legacy atlas has no true elbow tile; natural curved
                # tracks use coherent native earth instead of broken stubs.
                horizontal=all((x+n,y) in g['road_centres'] for n in range(-2,3))
                vertical=all((x,y+n) in g['road_centres'] for n in range(-2,3))
                if horizontal or vertical:index={'arizona':59,'urban':40,'rockies':59}[theme]
                else:index={'arizona':6,'urban':51,'rockies':53}[theme]
            elif (x,y) in roads:
                index={'arizona':6,'urban':51,'rockies':53}[theme]
            else:
                labels=[tile_material(theme,x+dx,y+dy,g,seed) for dx,dy in ((0,0),(1,0),(1,1),(0,1))]
                # Prefer the true four-corner blend tile. If this combination
                # has no native tile, use its dominant coherent ground type.
                candidates=[i for i in allowed if corners and corners[i]==labels]
                if candidates:index=candidates[(x//7+y//11+seed)%len(candidates)]
                else:
                    material=Counter(labels).most_common(1)[0][0]
                    candidates=[i for i in uniform.get(material,[]) if types[i] not in (7,8)]
                    require(candidates,'No native ground tile '+theme+' '+material)
                    index=candidates[0]
                material_counts[tile_material(theme,x,y,g,seed)]+=1
            require(0<=index<96,'Native texture range')
            # Flip uniform non-decal ground only; native corner blend IDs keep
            # their exact source orientation and source class.
            flag=0
            if (x,y) in g['road_centres']:
                horizontal=all((x+n,y) in g['road_centres'] for n in range(-2,3))
                vertical=all((x,y+n) in g['road_centres'] for n in range(-2,3))
                flag=4096 if vertical and not horizontal else 0
            elif (x,y) in ground and (x,y) not in roads and len(set(info['groundCorners'][index]))==1:
                flag=((x//5+y//7+seed)%4)<<12
            textures.append(index|flag)
    g['heights']=heights;g['textures']=textures;g['materialCounts']=dict(material_counts);g['decorative_ground']=decorative_ground
    tiles=b''.join(struct.pack('<HH',texture,heights[(n%w,n//w)]) for n,texture in enumerate(textures))
    # The pathfinder can derive regions without gateways. Empty native gateway
    # list is valid; no guessed gateways cross organic/ramped cliff boundaries.
    return b'map '+struct.pack('<III',40,w,h)+tiles+struct.pack('<II',1,0)


def constraints(recipe,g,structures,droids,features,specs,feature_specs,types):
    level=recipe[0];difficulty=level.rstrip('0123456789');w,h=g['w'],g['h'];ground=g['ground']
    expected={(x,1) for a in g['mouths'] for x in range(a-4,a+5)}
    edge={(x,1) for x in range(1,w-1)}|{(x,h-2) for x in range(1,w-1)}|{(1,y) for y in range(2,h-1)}|{(w-2,y) for y in range(2,h-1)}
    require(ground&edge==expected,'Unexpected perimeter '+level)
    require(len(g['mouths'])=={'easy':1,'medium':2,'hard':3}[difficulty],'Wrong entrance count '+level)
    occupied=set();ids=[]
    for s in structures:
        x,y=[v//128 for v in s['position']];f=footprint(specs[s['name']],x,y)
        require(f<=ground and not f&occupied,'Native building overlaps '+level)
        occupied|=f;ids.append(s['id'])
        values=[g['heights'][p] for a,b in f for p in ((a,b),(a+1,b),(a,b+1),(a+1,b+1)) if p in g['heights']]
        require(max(values)-min(values)<=50,'Native build footprint too steep '+level)
    blocked=set(occupied)
    for f in features:
        if f['name']=='OilResource':continue
        x,y=[v//128 for v in f['position']];fp=footprint(feature_specs[f['name']],x,y)
        require(not fp&occupied,'Scenery overlaps infrastructure '+level)
        blocked|=fp
    origin=(g['mouths'][0],1);free=ground-blocked;seen=connected(free,origin)
    require(expected<=seen,'Feature blocks entry '+level)
    for d in droids:
        p=tuple(v//128 for v in d['position']);require(p in seen,'Starting truck unreachable '+level);ids.append(d['id'])
    for s in structures:
        x,y=[v//128 for v in s['position']];f=footprint(specs[s['name']],x,y)
        require(bool((expanded(f,1)-blocked)&seen),'Building inaccessible '+level)
    for f in features: ids.append(f['id'])
    require(len(ids)==len(set(ids)),'Duplicate authored native IDs '+level)
    sat=next(s for s in structures if s['name']=='A0Sat-linkCentre' and s['startpos']==0)
    x,y=[v//128 for v in sat['position']];sf=footprint(specs[sat['name']],x,y)
    court=expanded(sf,3)-sf
    require(court<=ground and not court&(blocked-sf),'Uplink court obstructed '+level)
    require(all(tuple(v//128 for v in d['position']) not in court for d in droids),'Truck in uplink court '+level)
    require(g['satellite'][1]>g['hq'][1],'Uplink not behind HQ '+level)
    require(max(g['heights'].values())<=510,'Native height exceeds cap')
    native_ground=set()
    for n,texture in enumerate(g['textures']):
        p=(n%w,n//w)
        if types[texture&511] not in (7,8):native_ground.add(p)
    require(native_ground==ground|g['decorative_ground'],'Native terrain class differs from authored floor '+level)
    require(connected(native_ground,origin)==ground,'Decorative plateau leaks through cliff ring '+level)
    require(connected(native_ground,origin,True)==ground,'Decorative plateau has a diagonal cliff-ring leak '+level)
    require(native_ground&edge==expected,'Decorative plateau adds an accidental perimeter spawn '+level)
    return dict(dimensions=[w,h],nativeMapFormat=40,groundTiles=len(ground),spawnMouthGroups=len(g['mouths']),
                entranceCenters=[[x,1] for x in g['mouths']],staticConnectedPlayableGround=True,
                decorativeEnclosedPlateauTiles=len(g['decorative_ground']),staticEnclosedPlateausHaveNoPlayableConnection=True,
                staticEightNeighbourPlateauEnclosure=True,waterPlaneVertexHeight=90,
                staticStartingFootprintsAndRoutes=True,staticFeatureFootprintsAndRouteClearance=True,
                staticSatelliteThreeTileClearCourt=True,humanSatelliteTile=g['satellite'],humanHQTile=g['hq'],
                startingHumanTrucks=sum(d['startpos']==0 for d in droids),nativeHeightRange=[min(g['heights'].values()),max(g['heights'].values())],
                nativeMaterialTileCounts=g['materialCounts'],nativeSceneryCount=len(features)-4,
                landmarkDistricts=g['landmarks'],runtimeNativeIdsObserved=False,nativePathfindingOrGameplayTested=False,difficultyPlaytested=False)


def native_material_art(library):
    result={}
    for theme,info in library['themes'].items():
        scales={}
        for row in info['groundTexturesDefinition'].strip().splitlines()[1:]:
            name,_,scale=row.split(',');scales[name]=float(scale)
        result[theme]={name:(Image.open(ROOT/'map/art-assets-020'/(name+'.png')).convert('RGB'),scales[name]) for name in info['groundNames']}
    return result


def native_road_art(library):
    helper=runpy.run_path(str(ROOT/'tools/integrate-native-runtime.py'),run_name='native_road_preview_source')
    _,_,_,metadata=helper['package_call']((ASSETS/'warzone2100.js').read_text(encoding='utf-8'))
    data=(ASSETS/'warzone2100.data').read_bytes();rows={e['filename']:e for e in metadata['files']}
    result={}
    for theme,ids in {'arizona':(59,),'urban':(40,),'rockies':(59,)}.items():
        result[theme]={}
        for number in ids:
            row=rows[library['themes'][theme]['tileImages'][str(number)]]
            result[theme][number]=Image.open(io.BytesIO(data[int(row['start']):int(row['end'])])).convert('RGBA')
    return result


def preview(directory,entry,specs,feature_specs,material_art,theme_info,road_art):
    # Read the written V40 bytes and JSON objects. These are actual map-texture
    # data previews with height shading, not claimed engine screenshots.
    data=(directory/'game.map').read_bytes();_,w,h=struct.unpack_from('<III',data,4)
    scale=8;heights=np.zeros((h,w),dtype=np.float32);corners=np.zeros((h,w,4),dtype=np.int16)
    for y in range(h):
        for x in range(w):
            texture,height=struct.unpack_from('<HH',data,16+4*(y*w+x));heights[y,x]=height
            raw=theme_info['groundCorners'][texture&511]
            # Exact native rotFlip/determineGroundType lookup. Raw CSV order is
            # NW,NE,SW,SE; native rotations also rotate blend-corner materials.
            order=[(0,0),(1,0),(1,1),(0,1)]
            lookup={(0,0):3,(0,1):1,(1,0):2,(1,1):0}
            ids=[]
            for i,j in ((1,1),(0,1),(0,0),(1,0)):
                if texture&32768:i=1-i
                if texture&16384:j=1-j
                a,b=order[(order.index((i,j))-((texture>>12)&3))%4]
                ids.append(raw[lookup[a,b]])
            corners[y,x]=ids
    names=theme_info['groundNames'];count=len(names)
    # Native ground selection votes at shared vertices. Cliff materials have
    # weight100, ordinary10 and water1 in the native source. That makes banks
    # and paths continuous instead of composing debug-looking PNG tile grids.
    votes=np.zeros((h+1,w+1,count),dtype=np.uint16)
    for slot,(dx,dy) in enumerate(((0,0),(1,0),(1,1),(0,1))):
        for material,name in enumerate(names):
            weight=100 if 'cliff' in name else 1 if 'water' in name else 10
            votes[dy:dy+h,dx:dx+w,material]+=(corners[:,:,slot]==material).astype(np.uint16)*weight
    vertices=votes.argmax(axis=2)
    ids=[vertices[:h,:w],vertices[:h,1:],vertices[1:,1:],vertices[1:,:w]]
    yy,xx=np.mgrid[0:scale,0:scale]/float(scale)
    weights=[(1-xx)*(1-yy),xx*(1-yy),xx*yy,(1-xx)*yy]
    canvas=np.zeros((h*scale,w*scale,3),dtype=np.float32)
    gy,gx=np.mgrid[0:h*scale,0:w*scale]
    for material,name in enumerate(names):
        mask=np.zeros((h*scale,w*scale),dtype=np.float32)
        for slot in range(4):
            mask+=np.repeat(np.repeat(ids[slot]==material,scale,axis=0),scale,axis=1)*np.tile(weights[slot],(h,w))
        if not mask.any():continue
        art,period=material_art[name]
        # UV repetition follows the genuine material scale. These are decoded
        # native KTX2 ground pixels, with no AI or fabricated terrain artwork.
        size=max(8,round(period*scale));sample=np.asarray(art.resize((size,size),Image.Resampling.LANCZOS),dtype=np.float32)
        sampled=sample[gy%size,gx%size]
        if 'water' in name:sampled=sampled*.48+np.array([31,79,98])*.52
        canvas+=sampled*mask[:,:,None]
    dhy,dhx=np.gradient(heights)
    shade=np.clip(.97-dhx*.0015-dhy*.001,.55,1.29)
    canvas*=np.repeat(np.repeat(shade,scale,axis=0),scale,axis=1)[:,:,None]
    image=Image.fromarray(np.clip(canvas,0,255).astype(np.uint8),'RGB')
    # Native road PNG decals are genuine asphalt and markings. Other classic
    # tile PNGs are obsolete diagnostic/fallback art and deliberately omitted.
    for y in range(h):
        for x in range(w):
            texture=struct.unpack_from('<H',data,16+4*(y*w+x))[0]
            if texture&511 not in road_art:continue
            decal=road_art[texture&511].resize((scale,scale),Image.Resampling.LANCZOS)
            if (texture>>12)&3:decal=decal.rotate(-90*((texture>>12)&3))
            image.paste(decal,(x*scale,y*scale),decal)
    draw=ImageDraw.Draw(image)
    features=json.loads((directory/'feature.json').read_text(encoding='utf-8'))['features']
    for obj in features:
        if obj['name']=='OilResource':continue
        x,y=[v//128 for v in obj['position']];spec=feature_specs[obj['name']]
        f=footprint(spec,x,y);xs,ys=zip(*f)
        c=(41,66,40) if spec['type']=='TREE' else (101,106,109) if spec['type']=='SKYSCRAPER' else (116,109,94)
        if 'Snow' in obj['name']:c=(164,181,163)
        rectangle=(min(xs)*scale,min(ys)*scale,(max(xs)+1)*scale-1,(max(ys)+1)*scale-1)
        if spec['type']=='TREE':draw.ellipse(rectangle,fill=c,outline=(36,50,39),width=2)
        else:draw.rectangle(rectangle,fill=c,outline=(53,50,46),width=2)
    for s in json.loads((directory/'struct.json').read_text(encoding='utf-8'))['structures']:
        x,y=[v//128 for v in s['position']];xs,ys=zip(*footprint(specs[s['name']],x,y))
        color=(241,202,83) if s['name']=='A0Sat-linkCentre' else (112,177,211) if s['startpos']==0 else (200,88,67)
        draw.rectangle((min(xs)*scale,min(ys)*scale,(max(xs)+1)*scale-1,(max(ys)+1)*scale-1),fill=color,outline=(29,39,43),width=2)
    for d in json.loads((directory/'droid.json').read_text(encoding='utf-8'))['droids']:
        x,y=[v//128 for v in d['position']];draw.ellipse((x*scale,y*scale,x*scale+scale-1,y*scale+scale-1),fill=(193,231,237) if d['startpos']==0 else (226,125,103))
    image.thumbnail((480,540),Image.Resampling.LANCZOS)
    path=ASSETS/entry['preview'].removeprefix('warzone/')
    path.parent.mkdir(parents=True,exist_ok=True);image.save(path,optimize=True)


def contact_sheet(catalog):
    entries=[e for e in catalog['levels'] if not e.get('legacy',False)]
    cellw,cellh,columns=200,238,7
    sheet=Image.new('RGB',(columns*cellw,44+math.ceil(len(entries)/columns)*cellh),(15,23,26))
    draw=ImageDraw.Draw(sheet)
    try:font=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',12)
    except OSError:font=ImageFont.load_default(size=12)
    draw.text((12,12),'Warzone Towers 0.20 - actual native map data previews (not engine screenshots)',font=font,fill=(218,231,232))
    for n,entry in enumerate(entries):
        x=(n%columns)*cellw;y=44+(n//columns)*cellh
        img=Image.open(ASSETS/entry['preview'].removeprefix('warzone/')).convert('RGB')
        img.thumbnail((cellw-12,202),Image.Resampling.LANCZOS)
        sheet.paste(img,(x+(cellw-img.width)//2,y))
        draw.text((x+6,y+205),entry['id']+'  '+entry['name'],font=font,fill=(218,231,232))
        draw.text((x+6,y+222),entry['tileset'].capitalize(),font=font,fill=(136,165,169))
    sheet.save(OUT/'SCENIC-OVERVIEW-0.20.png',optimize=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only',help='Comma-separated source IDs for an early art review; catalog retains other entries.')
    args=parser.parse_args()
    library=json.loads(LIBRARY.read_text(encoding='utf-8'))
    catalog=json.loads((ASSETS/'levels/catalog.json').read_text(encoding='utf-8'))
    by_id={e['id']:e for e in catalog['levels']}
    require(len(RECIPES)==43 and len({r[4] for r in RECIPES})==43,'Need43 distinct compositions')
    specs={e['id']:e for e in json.loads((ASSETS/'command-catalog.json').read_text(encoding='utf-8'))['buildings']}
    features=library['features'];material_art=native_material_art(library);road_art=native_road_art(library)
    chosen=set(args.only.split(',')) if args.only else {r[0] for r in RECIPES}
    proofs=[]
    for seed,recipe in enumerate(RECIPES,1):
        level,theme,(w,h),home_x,family,routes,courts,waters,islands,districts=recipe
        if level not in chosen:continue
        directory=OUT/level;g=geography(recipe,seed)
        structures,droids,objects_list=objects(recipe,g,seed,specs,features)
        data=terrain(recipe,g,seed,library)
        proof=constraints(recipe,g,structures,droids,objects_list,specs,features,library['themes'][theme]['terrainTypes'])
        write(directory/'game.map',data)
        types=library['themes'][theme]['terrainTypes']
        write(directory/'ttypes.ttp',b'ttyp'+struct.pack('<II',39,len(types))+struct.pack('<'+'H'*len(types),*types))
        for name,key,values in [('struct.json','structures',structures),('droid.json','droids',droids),('feature.json','features',objects_list)]:dump(directory/name,dict(version=2,**{key:values}))
        dump(directory/'gam.json',dict(version=7,gameTime=0,GameType=0,ScrollMinX=0,ScrollMinY=0,ScrollMaxX=w,ScrollMaxY=h,levelName=''))
        entry=dict(by_id[level]);entry.update(tileset=theme,dimensions=[w,h],routeFamily=family,
            description=family.capitalize()+'. '+str(entry['entryCount'])+' northern approach'+('es' if entry['entryCount']>1 else '')+' to a protected rear base.',
            satelliteTile=g['satellite'],entrances=[[x,1] for x in g['mouths']],previewDescription='Native ground materials, asphalt decals and map-object footprint readback with height shading; not gameplay.',
            scenicRevision='0.20',sourceOnly=True,gameplayVerified=False)
        dump(directory/'level.json',{'name':entry['nativeFolder'],'type':'skirmish','players':2,'tileset':theme,'author':{'name':'Warzone Towers'},'spdx-license-id':'CC0-1.0','generator':'tools/generate-levels-020.py'})
        write(directory/'level.lev',f'// {entry["name"]}: scenic native terrain revision0.20, original layout CC0-1.0\nlevel {entry["mapName"]}\nplayers 2\ntype 14\ndataset {library["themes"][theme]["dataset"]}\ngame "multiplay/maps/{entry["nativeFolder"]}.gam"\n')
        proof.update(id=level,name=entry['name'],tileset=theme,dataset=library['themes'][theme]['dataset'],landscapeComposition=family,
             routes=routes,landscapeCourts=courts,lakes=waters,rockMassifs=islands,
             nativeMapSHA256=sha256(data).hexdigest(),geometrySHA256=sha256(json.dumps(sorted(g['ground'])).encode()).hexdigest(),
             generator='tools/generate-levels-020.py',scope='Static native format/geometry/footprint/art-source checks only; no engine, emulator, native pathfinding or balance run.')
        dump(directory/'AUTHORING.json',proof)
        preview(directory,entry,specs,features,material_art[theme],library['themes'][theme],road_art[theme]);by_id[level]=entry;proofs.append(proof)
        print(json.dumps({'authored':level,'name':entry['name'],'theme':theme,'family':family,'scenery':proof['nativeSceneryCount'],'ground':len(g['ground'])}),flush=True)
    catalog['levels']=[by_id[e['id']] for e in catalog['levels']]
    catalog['previewDescription']='Actual native ground materials, asphalt decals and written map data, with height shading and object footprints; not engine screenshots.'
    dump(ASSETS/'levels/catalog.json',catalog)
    if not args.only:
        require(len({p['geometrySHA256'] for p in proofs})==43,'Duplicate replacement geography')
        dump(OUT/'GENERATION.json',{'schemaVersion':2,'generator':'tools/generate-levels-020.py','revision':'0.20','newLevels':43,
             'counts':{'easy':15,'medium':15,'hard':13},'uniqueNativeGeometries':43,'distinctLandscapeCompositions':43,
             'themes':dict(Counter(p['tileset'] for p in proofs)),'nativeHeightMaximum':510,
             'humanSatelliteInEveryNewRearBase':True,'satelliteClearanceTiles':3,'staticGenerationConstraintsSatisfied':True,
             'nativePathfindingOrGameplayTested':False,'difficultyPlaytested':False,
             'existingMapSourcesModified':False,'maps':[{'id':p['id'],'tileset':p['tileset'],'geometrySHA256':p['geometrySHA256'],'nativeMapSHA256':p['nativeMapSHA256']} for p in proofs]})
        contact_sheet(catalog)
    print(json.dumps({'authoredMaps':len(proofs),'scope':'Asset authoring and native-data preview only; no emulator/gameplay run.'}))


if __name__=='__main__':main()
