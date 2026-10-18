import {legalConfiguration} from './release';
import {nativeServerUrl} from './native';

type Environment=Record<string,string|undefined>;
type Check={id:string;status:'configured'|'pending'|'verified'|'failed'|'not_checked';required:boolean;action:string};
function origin(value:string|undefined){try{return nativeServerUrl(value);}catch{return null;}}
// A shareable report contains status and next actions, never environment values,
// tokens, URLs with query strings, provider responses or exception messages.
export async function releaseReport(env:Environment,probe=false,fetcher:typeof fetch=fetch){
  const web=origin(env.APP_ORIGIN),native=origin(env.VITE_WALK_SERVER_URL);
  const checks:Check[]=[
    {id:'operator_and_policies',status:legalConfiguration(env).ready?'configured':'pending',required:true,action:'Set the actual operator, support contact, reviewed public policies and policy version.'},
    {id:'https_origin',status:web?'configured':'pending',required:true,action:'Set APP_ORIGIN to the public HTTPS WALK server.'},
    {id:'secure_web_cookie',status:env.COOKIE_SECURE==='true'?'configured':'pending',required:true,action:'Set COOKIE_SECURE=true for the public web server.'},
    {id:'public_mode',status:env.WALK_PUBLIC_RELEASE==='true'?'configured':'pending',required:true,action:'Enable WALK_PUBLIC_RELEASE=true on the reviewed public server.'},
    {id:'administrator_key',status:(env.ADMIN_KEY||'').length>=24?'configured':'pending',required:true,action:'Configure a unique administrator key of at least 24 characters in secure environment settings.'},
    {id:'native_backend',status:native&&native===web?'configured':'pending',required:true,action:'Set VITE_WALK_SERVER_URL to the same public backend before building the native apps.'},
    {id:'voice_relay',status:env.WALK_TURN_URL&&env.WALK_TURN_USERNAME&&env.WALK_TURN_CREDENTIAL?'configured':'pending',required:false,action:'Configure the actual TURN service, then verify voice on separate networks. Presence alone is not validation.'},
  ];
  const remote:Check={id:'public_endpoint_probe',status:'not_checked',required:true,action:'Run release:report -- --probe after configuring the public backend. This checks health and public-mode legal metadata only.'};
  if(probe){
    remote.status='pending';
    if(native&&native===web){
      try{
        const get=async(path:string)=>{
          const response=await fetcher(native+path,{redirect:'error',signal:AbortSignal.timeout(10000),headers:{Accept:'application/json'}});
          if(!response.ok||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')||''))throw new Error('Invalid response');
          return await response.json();
        };
        const health=await get('/api/health'),legal=await get('/api/public/legal');
        remote.status=health?.ok===true&&legal?.ready===true&&legal?.publicRelease===true?'verified':'failed';
      }catch{remote.status='failed';}
    }
  }
  checks.push(remote);
  const manual=[
    {id:'audience_age',status:'pending',action:'Owner must decide the audience age and complete the corresponding safeguards and store declarations.'},
    {id:'content_and_markets',status:'pending',action:'Review content permissions and test actual provider playback from the intended Asian and English-speaking markets. Douyin/Kuaishou collection needs real registrations and permissions.'},
    {id:'devices',status:'pending',action:'Compile iOS and test iPhone and Android: first playback, next video, recovery, accounts, uploads, backgrounding, voice and sharing.'},
    {id:'operations',status:'pending',action:'Deploy HTTPS, verify backups and restore, monitoring, moderation access and support procedures.'},
    {id:'stores',status:'pending',action:'Set up developer accounts, signing, listings, privacy disclosures, age ratings, reviewer access and review submission.'},
  ];
  return {format:'walk-release-report-1',configurationReady:checks.filter(c=>c.required&&c!==remote).every(c=>c.status==='configured'),publicEndpointsVerified:remote.status==='verified',readyForPublicRelease:false,checks,manual,paymentsEnabled:false,notice:'Configuration and endpoint checks do not establish device testing, policy approval, content rights, store acceptance or public release.'};
}
