// Browser catalog, refreshed atomically with bootstrap before React renders.
// The server always uses its own database catalog and never this module.
import * as worlds from '../shared/worlds';
import {t} from './i18n';
export type { Place, Landscape, WorldDraft } from '../shared/worlds';
export { landscapes, canAddWorld } from '../shared/worlds';
function localize(catalog:worlds.Place[]){return catalog.map(place=>{
  const original=worlds.places.find(p=>p.id===place.id);
  if(place.ownerId||!original)return place;
  return {...place,get title(){return place.title===original.title?t(place.title):place.title;},get description(){return place.description===original.description?t(place.description):place.description;}};
});}
export let places:worlds.Place[] = localize(worlds.places);
export function setWorldCatalog(next:worlds.Place[]|undefined){places=localize(next||worlds.places);}
export const findPlace=(id:string)=>worlds.findPlace(id,places);
export const childrenOf=(id:string)=>worlds.childrenOf(id,places);
export const pathTo=(id:string)=>worlds.pathTo(id,places);
export const postWorld=(post:Parameters<typeof worlds.postWorld>[0])=>worlds.postWorld(post,places);
export const gatePoints=(id:string)=>worlds.gatePoints(id,places);
