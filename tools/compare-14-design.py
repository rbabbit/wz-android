"""QA-only reference/actual contact sheets; no content edits or acceptance claim."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import argparse
import hashlib
import json

ROOT=Path(__file__).resolve().parents[1]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('page',choices=('production','design','research'))
    parser.add_argument('--actual',type=Path,required=True)
    parser.add_argument('--suffix',choices=('', 'compact'),default='')
    parser.add_argument('--profile',choices=('normal','compact'))
    parser.add_argument('--state')
    args=parser.parse_args()
    actual=args.actual.resolve();reference=ROOT/f'docs/ui-0.14/approved-{args.page}.png'
    if not actual.is_file():raise FileNotFoundError(actual)
    out=ROOT/'qa/test-14/comparisons';out.mkdir(parents=True,exist_ok=True)
    sheet=Image.new('RGB',(2048,800),'#09151a');draw=ImageDraw.Draw(sheet)
    fonts=Path('C:/Windows/Fonts')
    title=ImageFont.truetype(str(fonts/'segoeuib.ttf'),22)
    caption=ImageFont.truetype(str(fonts/'segoeui.ttf'),15)
    records=[]
    for index,(label,path) in enumerate((('Approved reference - illustrative game state',reference),('0.14 R5 APK - actual native emulator state',actual))):
        image=Image.open(path).convert('RGB');original=image.size
        factor=min(1000/image.width,600/image.height)
        size=(round(image.width*factor),round(image.height*factor));image=image.resize(size,Image.Resampling.LANCZOS)
        left=12+index*1024;draw.text((left,12),label,font=title,fill='white')
        if index==1 and (args.profile or args.state):draw.text((left,40),' | '.join(filter(None,[args.profile and f'{args.profile.title()} {original[0]}x{original[1]}',args.state])),font=caption,fill='#b9cfcd')
        sheet.paste(image,(left+(1000-size[0])//2,58+(600-size[1])//2))
        name=path.relative_to(ROOT).as_posix();sha=hashlib.sha256(path.read_bytes()).hexdigest()
        lines=[name[i:i+100] for i in range(0,len(name),100)]
        for line in lines:draw.text((left,675+22*lines.index(line)),line,font=caption,fill='#b9cfcd')
        draw.text((left,675+22*len(lines)),f'SHA256 {sha}',font=caption,fill='#b9cfcd')
        records.append({'role':'reference' if index==0 else 'actual','path':name,'sha256':sha,'originalSize':list(original),'displaySize':list(size),'scale':factor})
    name=args.page+('-'+args.suffix if args.suffix else '')+'-full';dest=out/(name+'.png');sheet.save(dest)
    evidence={'reviewed':False,'purpose':'Full actual screenshot beside approved reference; isotropic resizing/letterboxing only, no cropped or fabricated content. Root manual review remains required.','inputs':records,'output':{'path':dest.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()}}
    if args.profile:evidence['actualProfile']=args.profile
    if args.state:evidence['actualState']=args.state
    (out/(name+'.json')).write_text(json.dumps(evidence,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(evidence,indent=2))


if __name__=='__main__':main()
