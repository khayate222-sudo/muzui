import {spawnSync} from 'node:child_process';
const value=process.env.VITE_WALK_SERVER_URL;
if(!value)throw new Error('Set VITE_WALK_SERVER_URL to the public HTTPS WALK backend before packaging a connected native app.');
const u=new URL(value);if(u.protocol!=='https:'||u.pathname!=='/'||u.search||u.hash||u.username||u.password||['localhost','127.0.0.1','[::1]'].includes(u.hostname))throw new Error('Native releases require a HTTPS server origin; loopback, credentials and paths are not allowed.');
const health=new URL('/api/public/legal',u);const response=await globalThis.fetch(health,{signal:globalThis.AbortSignal.timeout(15000)});const state=response.ok?await response.json():null;if(!state?.ready||state.publicRelease!==true)throw new Error('The public WALK server must have its operator, support contact and approved public policies configured before release packaging.');
for(const command of[['npm',['run','native:sync']]]){const result=spawnSync(command[0],command[1],{stdio:'inherit',shell:process.platform==='win32'});if(result.status!==0)process.exit(result.status||1);}
