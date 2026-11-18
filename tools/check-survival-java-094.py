"""Compile current normal Java sources against cached Android APIs; no Gradle/APK/device."""
from pathlib import Path
import hashlib, json, os, re, subprocess, tempfile

ROOT=Path(__file__).resolve().parents[1]
JAVA=ROOT/'app/src/main/java'
JDK=Path('C:/Program Files/Android/Android Studio/jbr/bin/javac.exe')
SDK=Path('C:/Users/punke/AppData/Local/Android/Sdk/platforms/android-36/android.jar')

def main():
    sources=sorted(JAVA.rglob('*.java'))
    inputs=[{'path':p.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in sources]
    dependencies=sorted((Path.home()/'.gradle/caches/9.8.0/transforms').rglob('*-api.jar'))
    assert dependencies,'Cached Android API dependencies missing'
    with tempfile.TemporaryDirectory(prefix='survival-java-094-') as directory:
        work=Path(directory);pkg=work/'com/rbabbit/blocknight/warzone';pkg.mkdir(parents=True)
        names=sorted({m for p in sources for m in re.findall(r'(?<!android\.)\bR\.drawable\.(\w+)',p.read_text())})
        resources=pkg/'R.java';resources.write_text('package com.rbabbit.blocknight.warzone; final class R {static final class drawable {'+
            ''.join('static final int '+n+'='+str(i+1)+';'for i,n in enumerate(names))+'}}')
        config=pkg/'BuildConfig.java';config.write_text('package com.rbabbit.blocknight.warzone; final class BuildConfig {'
            'static final boolean PLAY_STORE_BUILD=false,DEBUG=false,ADMOB_TEST_ADS=true;static final String ADMOB_REWARDED_AD_UNIT_ID="host-compile-only";}')
        classes=work/'classes';classes.mkdir()
        args=['-encoding','UTF-8','-cp',os.pathsep.join(map(str,[SDK,*dependencies])),'-d',str(classes),*map(str,sources),str(resources),str(config)]
        argfile=work/'javac.args';argfile.write_text('\n'.join('"'+a.replace('\\','/')+'"'for a in args),encoding='utf-8')
        p=subprocess.run([str(JDK),'@'+str(argfile)],capture_output=True,text=True,timeout=60)
        if p.returncode: raise AssertionError(p.stdout+p.stderr)
        for row in inputs:assert hashlib.sha256((ROOT/row['path']).read_bytes()).hexdigest()==row['sha256'],'Sources changed during compilation'
    report={'passed':True,'javaSourcesCompiled':len(sources),'androidAPI':36,'dependencies':'Existing cached Gradle9.8.0 API jars',
        'generatedBoundaries':'Temporary normal-build BuildConfig and integer drawable R constants only; no package/resource generation',
        'gradleRun':False,'apkBuilt':False,'deviceUsed':False,'scope':'Actual normal MainActivity, navigation, save and reward Java source integration compiles; Android views and gameplay not executed.',
        'compilerOutput':p.stdout+p.stderr,'sources':inputs}
    target=ROOT/'qa/survival-094/java-compile.json';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:report[k]for k in ['passed','javaSourcesCompiled','androidAPI','gradleRun','apkBuilt','deviceUsed']}))
if __name__=='__main__':main()
