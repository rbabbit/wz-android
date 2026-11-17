from pathlib import Path
import json,socket,time,sys
import device as d
ROOT=Path(__file__).resolve().parent
adb=d.adb;capture=d.capture;tap=d.tap;back=d.back

def rpc(command,**kwargs):
 with socket.create_connection(('127.0.0.1',27889),timeout=15)as s:
  s.settimeout(25);s.sendall((json.dumps({'command':command,**kwargs})+'\n').encode());out=json.loads(s.makefile('r').readline())
  if not out.get('ok'):raise RuntimeError(out)
  return out

def evaluate(js,activity='auto'):
 out=rpc('eval',javascript='top.eval('+json.dumps(js)+')',activity=activity);value=out.get('value')
 if isinstance(value,str):
  try:return json.loads(value)
  except ValueError:return value
 return value

def wait(js,predicate=lambda x:bool(x),timeout=8,activity='auto'):
 end=time.monotonic()+timeout
 while time.monotonic()<end:
  value=evaluate(js,activity)
  if predicate(value):return value
  time.sleep(.15)
 raise RuntimeError({'observableWaitFailed':js,'last':value})
if __name__=='__main__':
 cmd=sys.argv[1]
 if cmd=='eval':
  arg=sys.argv[2];p=Path(arg);print(json.dumps(evaluate(p.read_text()if len(arg)<240 and p.is_file()else arg),indent=2))
 elif cmd=='capture':capture(sys.argv[2])
 elif cmd=='tap':tap(sys.argv[2])
 elif cmd=='state':print(json.dumps(rpc('state'),indent=2))
