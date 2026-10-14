import {beforeAll,afterAll,expect,it} from 'vitest';
import {io,type Socket} from 'socket.io-client';
import {createApp} from '../server/app';
import {nativeServerUrl} from '../shared/native';
let instance:Awaited<ReturnType<typeof createApp>>,origin:string,token:string;const clients:Socket[]=[];
const req=(path:string,method:'GET'|'POST'|'PATCH'='GET',payload?:object)=>instance.app.inject({url:'/api'+path,method,headers:{authorization:'Bearer '+token,'x-walk-client':'1',origin:'capacitor://localhost'},payload});
beforeAll(async()=>{instance=await createApp({database:':memory:',adminKey:'native-tests-admin-key'});origin=await instance.app.listen({port:0,host:'127.0.0.1'});const r=await instance.app.inject({url:'/api/native/session',method:'POST',headers:{'x-walk-client':'1'},payload:{userId:'forged'}});expect(r.statusCode).toBe(200);expect(r.headers['cache-control']).toBe('no-store');token=r.json().token;});
afterAll(async()=>{clients.forEach(s=>s.disconnect());await instance.app.close();});
it('keeps native guest identity with bearer authentication while rejecting forged identity and cross-origin web mutation',async()=>{
 const a=(await req('/bootstrap')).json();expect(a.user.id).not.toBe('forged');expect((await req('/bootstrap')).json().user.id).toBe(a.user.id);
 expect((await req('/profile','PATCH',{...a.user,displayName:'スマホ旅人'})).statusCode).toBe(200);
 expect((await instance.app.inject({url:'/api/profile',method:'PATCH',headers:{authorization:'Bearer '+token,'x-walk-client':'1',origin:'https://evil.example'},payload:a.user})).statusCode).toBe(403);
 expect((await instance.app.inject({url:'/api/bootstrap',headers:{authorization:'Bearer '+'a'.repeat(64)}})).statusCode).toBe(401);
 expect((await instance.app.inject({url:'/api/activities',headers:{authorization:'Bearer '+'a'.repeat(64)}})).statusCode).toBe(401);
 expect((await req('/admin/login','POST',{key:'native-tests-admin-key'})).statusCode).toBe(200);expect((await req('/admin/reports')).statusCode).toBe(200);
});
it('authenticates the native websocket without web cookies and rejects unauthenticated native sockets',async()=>{
 const s=io(origin,{transports:['websocket'],auth:{token},extraHeaders:{Origin:'capacitor://localhost'},reconnection:false});clients.push(s);await new Promise<void>((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);});
 expect((await s.timeout(5000).emitWithAck('room:enter',{worldId:'world:game'})).ok).toBe(true);
 const bad=io(origin,{transports:['websocket'],auth:{token:'fake',userId:'forged'},extraHeaders:{Origin:'capacitor://localhost'},reconnection:false});clients.push(bad);const error=await new Promise<Error>(resolve=>bad.once('connect_error',resolve));expect(error.message).toContain('セッション');
});
it('refuses unsafe or loopback release endpoints and retains a HTTPS server origin',()=>{
 expect(nativeServerUrl('https://walk.example.org')).toBe('https://walk.example.org');
 for(const v of[undefined,'http://walk.example.org','https://localhost','https://user:pass@walk.example.org','https://walk.example.org/path','https://walk.example.org/?token=example'])expect(()=>nativeServerUrl(v)).toThrow();
});
