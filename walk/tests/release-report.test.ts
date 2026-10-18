import {it,expect,vi} from 'vitest';
import {releaseReport} from '../shared/release-report';
const configured={APP_ORIGIN:'https://walk.example',VITE_WALK_SERVER_URL:'https://walk.example',COOKIE_SECURE:'true',WALK_PUBLIC_RELEASE:'true',ADMIN_KEY:'private-administrator-key-do-not-print',WALK_OPERATOR_NAME:'Private Operator',WALK_SUPPORT_EMAIL:'private@walk.example',WALK_TERMS_URL:'https://walk.example/terms',WALK_PRIVACY_URL:'https://walk.example/privacy',WALK_POLICY_VERSION:'private-policy-v1',WALK_POLICIES_APPROVED:'true',WALK_TURN_URL:'turn:private.example',WALK_TURN_USERNAME:'private-turn-user',WALK_TURN_CREDENTIAL:'private-turn-secret'};
it('lists missing prerequisites without contacting anything or pretending the app is released',async()=>{
 const fetcher=vi.fn();const report=await releaseReport({},true,fetcher);
 expect(fetcher).not.toHaveBeenCalled();expect(report.configurationReady).toBe(false);expect(report.readyForPublicRelease).toBe(false);expect(report.checks.find(c=>c.id==='native_backend')?.status).toBe('pending');expect(report.manual.every(c=>c.status==='pending')).toBe(true);
});
it('separates configuration from live verification and omits all operator and secret values',async()=>{
 const fetcher=vi.fn();const report=await releaseReport(configured,false,fetcher);
 expect(fetcher).not.toHaveBeenCalled();expect(report.configurationReady).toBe(true);expect(report.publicEndpointsVerified).toBe(false);expect(report.readyForPublicRelease).toBe(false);
 const raw=JSON.stringify(report);for(const value of Object.values(configured).filter(v=>v.startsWith('private')||v.includes('Private')))expect(raw).not.toContain(value);
});
it('only verifies actual JSON health and public-mode metadata from the configured origin',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ok:true})).mockResolvedValueOnce(Response.json({ready:true,publicRelease:true}));
 const report=await releaseReport(configured,true,fetcher);expect(report.publicEndpointsVerified).toBe(true);expect(report.readyForPublicRelease).toBe(false);
 expect(fetcher.mock.calls.map(c=>c[0])).toEqual(['https://walk.example/api/health','https://walk.example/api/public/legal']);
 for(const [,options] of fetcher.mock.calls){expect(options?.redirect).toBe('error');expect(options?.signal).toBeInstanceOf(AbortSignal);expect(options?.headers).toEqual({Accept:'application/json'});}
});
it('rejects HTML, malformed JSON, redirects, private-mode metadata, type tricks and unreachable hosts without leaking errors',async()=>{
 for(const response of [new Response('<html>private-proxy-details</html>',{headers:{'content-type':'text/html'}}),new Response('{broken',{headers:{'content-type':'application/json'}}),new Response('',{status:302}),Response.json({ok:'true'})]){
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(response);const report=await releaseReport(configured,true,fetcher);expect(report.publicEndpointsVerified).toBe(false);expect(JSON.stringify(report)).not.toContain('private-proxy');
 }
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ok:true})).mockResolvedValueOnce(Response.json({ready:true,publicRelease:false}));expect((await releaseReport(configured,true,fetcher)).publicEndpointsVerified).toBe(false);
 const unavailable=await releaseReport(configured,true,vi.fn().mockRejectedValue(new Error('private-turn-secret')));expect(unavailable.publicEndpointsVerified).toBe(false);expect(JSON.stringify(unavailable)).not.toContain('private-turn-secret');
});
it('does not probe loopback, credential-bearing or mismatched native endpoints',async()=>{
 for(const url of ['https://localhost','https://user:password@walk.example','https://other.example']){
  const fetcher=vi.fn();const report=await releaseReport({...configured,VITE_WALK_SERVER_URL:url},true,fetcher);expect(fetcher).not.toHaveBeenCalled();expect(report.configurationReady).toBe(false);
 }
});
