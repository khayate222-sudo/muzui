// Local integration-test relay. Binds loopback only; credentials are ephemeral.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

const binary=process.env.WALK_TEST_TURN_BIN||'turnserver';
const directory=await mkdtemp(join(tmpdir(),'walk-test-relay-'));
const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
const username='walk-integration',credential=randomBytes(24).toString('hex'),config=join(directory,'turn.conf');
await writeFile(config,`listening-ip=127.0.0.1\nrelay-ip=127.0.0.1\nlistening-port=${port}\nrealm=walk-integration.local\nfingerprint\nlt-cred-mech\nuser=${username}:${credential}\nno-tls\nno-dtls\nno-cli\nno-multicast-peers\nallow-loopback-peers\nrelay-threads=1\nmin-port=50000\nmax-port=50100\nlog-file=${join(directory,'relay.log')}\nuserdb=${join(directory,'turn.sqlite')}\npidfile=${join(directory,'relay.pid')}\nno-stdout-log\n`,{mode:0o600});
let startupError;
const relay=spawn(binary,['-c',config],{stdio:'ignore',env:{...process.env,...(process.env.WALK_TEST_TURN_LIB?{LD_LIBRARY_PATH:process.env.WALK_TEST_TURN_LIB}:{})}});relay.on('error',e=>startupError=e);
let runner;
const stop=()=>{runner?.kill('SIGTERM');relay.kill('SIGTERM');};
process.once('SIGINT',stop);process.once('SIGTERM',stop);
try{
  let ready=false;
  for(let attempt=0;attempt<50;attempt++){
    if(startupError)throw new Error('coturnが見つかりません。turnserverを導入するかWALK_TEST_TURN_BINを指定してください。');
    if(relay.exitCode!==null)throw new Error('テスト用TURNを起動できませんでした');
    ready=await new Promise(resolve=>{const s=net.createConnection({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(true);});s.once('error',()=>resolve(false));});
    if(ready)break;await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!ready)throw new Error('テスト用TURNの起動を確認できませんでした');
  console.log('Loopback TURN ready. Running browser tests with real relayed audio.');
  const args=['run','test:e2e','--',...process.argv.slice(2)];
  runner=spawn(process.env.npm_execpath?process.execPath:'npm',process.env.npm_execpath?[process.env.npm_execpath,...args]:args,{stdio:'inherit',env:{...process.env,WALK_STUN_URL:'off',WALK_TURN_URL:`turn:127.0.0.1:${port}?transport=tcp`,WALK_TURN_USERNAME:username,WALK_TURN_CREDENTIAL:credential}});
  process.exitCode=await new Promise((resolve,reject)=>{runner.once('error',reject);runner.once('exit',code=>resolve(code??1));});
}catch(e){console.error(e.message);process.exitCode=1;}finally{stop();if(relay.exitCode===null)await new Promise(resolve=>{relay.once('exit',resolve);setTimeout(()=>{relay.kill('SIGKILL');resolve();},1000).unref();});await rm(directory,{recursive:true,force:true});}
