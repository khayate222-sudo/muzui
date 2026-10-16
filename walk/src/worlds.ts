// Browser catalog, refreshed atomically with bootstrap before React renders.
// The server always uses its own database catalog and never this module.
import * as worlds from '../shared/worlds';
export type { Place, Landscape, WorldDraft } from '../shared/worlds';
export { landscapes, canAddWorld } from '../shared/worlds';
export let places:worlds.Place[] = worlds.places;
export function setWorldCatalog(next:worlds.Place[]|undefined){places=next||worlds.places;}
export const findPlace=(id:string)=>worlds.findPlace(id,places);
export const childrenOf=(id:string)=>worlds.childrenOf(id,places);
export const pathTo=(id:string)=>worlds.pathTo(id,places);
export const postWorld=(post:Parameters<typeof worlds.postWorld>[0])=>worlds.postWorld(post,places);
export const gatePoints=(id:string)=>worlds.gatePoints(id,places);
