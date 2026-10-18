import {z} from 'zod';
import {genres} from '../shared/model';

const prefix='walk-post-draft-v1:';
const attachmentSchema=z.object({id:z.string().uuid(),url:z.string().regex(/^\/media\/[a-f0-9-]{36}\.(png|jpg|gif|webp|mp4|webm)$/),mime:z.enum(['image/png','image/jpeg','image/gif','image/webp','video/mp4','video/webm'])});
const draftSchema=z.object({
  version:z.literal(1),requestId:z.string().uuid(),title:z.string().max(120),body:z.string().max(4000),
  genre:z.enum(genres),worldId:z.string().max(80),attachment:attachmentSchema.nullable(),
  attempted:z.boolean(),savedPostId:z.string().uuid().nullable(),
});
export type PostDraft=z.infer<typeof draftSchema>;
export function readPostDraft(owner:string):PostDraft|null{
  try{const raw=localStorage.getItem(prefix+owner);if(!raw||raw.length>16000)return null;const result=draftSchema.safeParse(JSON.parse(raw));return result.success?result.data:null;}catch{return null;}
}
export function writePostDraft(owner:string,draft:PostDraft):boolean{
  try{localStorage.setItem(prefix+owner,JSON.stringify(draft));return true;}catch{return false;}
}
export function removePostDraft(owner:string){try{localStorage.removeItem(prefix+owner);}catch{/* Storage may be unavailable. */}}
export function clearPostDrafts(){
  try{for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key?.startsWith(prefix))localStorage.removeItem(key);}}catch{/* Other session cleanup must still run. */}
}
