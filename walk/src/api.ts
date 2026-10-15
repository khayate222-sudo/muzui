import {walkFetch} from './native';
export class ApiError extends Error{constructor(message:string,public status:number){super(message);this.name='ApiError';}}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await walkFetch('/api' + path, { method, headers: { 'X-Walk-Client': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error || '通信に失敗しました',response.status);
  return data;
}
