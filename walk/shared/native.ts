export const nativeOrigins=['capacitor://localhost','https://localhost'];
export function nativeServerUrl(value:string|undefined){
 if(!value)throw new Error('ストア版の接続先が未設定です。VITE_WALK_SERVER_URL に公開HTTPSサーバーを設定してビルドしてください。');
 const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||['localhost','127.0.0.1','0.0.0.0','[::1]'].includes(u.hostname))throw new Error('ストア版の接続先には、パスを含まない公開HTTPSのURLが必要です。');
 return u.origin;
}
