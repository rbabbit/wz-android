"""Diagnostic contact sheets; never used as a product image asset."""
from pathlib import Path
from PIL import Image,ImageOps,ImageDraw

root=Path(__file__).resolve().parents[1];qa=root/'qa/v5.12'
source=Image.open(qa/'selected-target.png').convert('RGB')
native=Image.open(qa/'startup/compact-finished.png').convert('RGB')
def fit(im):
    result=Image.new('RGB',(1080,600),'#101719');pic=ImageOps.contain(im,(1080,600));result.paste(pic,((1080-pic.width)//2,(600-pic.height)//2));return result
a,b=fit(source),fit(native)
sheet=Image.new('RGB',(2160,630),'#101719');sheet.paste(a,(0,30));sheet.paste(b,(1080,30));draw=ImageDraw.Draw(sheet)
draw.text((12,8),'Selected mock (labels intentionally renamed in implementation)',fill='white');draw.text((1092,8),'Installed APK: original official assets, Dustfall / Iron Valley',fill='white');sheet.save(qa/'comparison-full.png')
detail=Image.new('RGB',(2160,180),'#101719');detail.paste(a.crop((0,450,1080,600)),(0,30));detail.paste(b.crop((0,450,1080,600)),(1080,30));draw=ImageDraw.Draw(detail);draw.text((12,8),'Mock footer',fill='white');draw.text((1092,8),'Native footer / 48dp controls',fill='white');detail.save(qa/'comparison-footer.png')
print('Saved diagnostic full-screen and footer comparisons')
