from pathlib import Path
from PIL import Image, ImageDraw
import shutil,sys

root = Path(__file__).resolve().parents[1] / "qa" / "v4"
source = Path(sys.argv[1]) if len(sys.argv)>1 else root / "selected-reference.png"
if source.resolve() != (root / "selected-reference.png").resolve():
    shutil.copy2(source, root / "selected-reference.png")
target = Image.open(source).convert("RGB").resize((1280,576), Image.Resampling.LANCZOS)
actual = Image.open(root / "wide.png").convert("RGB").crop((0,0,2560,1152)).resize((1280,576),Image.Resampling.LANCZOS)
actual.save(root / "wide-normalized.png")
def compare(name, a, b):
    panel = Image.new("RGB",(a.width+b.width,max(a.height,b.height)+30),"#e3e7e5")
    d=ImageDraw.Draw(panel)
    d.text((10,8),"SELECTED REFERENCE",fill="black")
    d.text((a.width+10,8),"LIVE ANDROID WEBVIEW",fill="black")
    panel.paste(a,(0,30));panel.paste(b,(a.width,30));panel.save(root / name)
compare("comparison-full.png",target,actual)
compare("comparison-controls.png",target.crop((0,0,760,54)),actual.crop((0,0,760,54)))
compare("comparison-wave.png",target.crop((1000,52,1280,130)),actual.crop((1000,52,1280,130)))
for name,width,height in [("compact",642,482),("wide",1280,576)]:
    for suffix in ["-help","-help-bottom"]:
        img=Image.open(root / (name+suffix+".png"))
        img.crop((0,0,width*2,height*2)).resize((width,height),Image.Resampling.LANCZOS).save(root / (name+suffix+"-normalized.png"))
