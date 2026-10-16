import type { Place } from '../shared/worlds';

// Keep persisted/network coordinates unchanged. The painted courtyard has a
// smaller walkable foreground, below the architecture, for every participant.
export function toCourtyard({ x, y }: { x: number; y: number }) {
  return { x: 260 + (x - 40) / 1920 * 1480, y: 810 + (y - 70) / 1290 * 470 };
}
export function fromCourtyard({ x, y }: { x: number; y: number }) {
  return { x: 40 + (x - 260) / 1480 * 1920, y: 70 + (y - 810) / 470 * 1290 };
}
// Preserve the wide composition when it fits, reserving visible paving below
// the resident on short maps and at high zoom. Phaser offsets are world units.
export function courtyardFollowOffset(height:number,zoom:number){
  return Math.min(430,Math.max(0,(height/2-64)/Math.max(zoom,.01)));
}
export function courtyardArt(place?: Pick<Place, 'theme'|'landscape'>) {
  const landscape=place?.landscape;
  return landscape&&!['garden','japan','future','fantasy'].includes(landscape)?'/art/world-'+landscape+'.webp':'/art/courtyard-'+(landscape||place?.theme||'garden')+'.webp';
}
export const avatarFrames = ['cap', 'beanie', 'hair', 'cat', 'fox', 'resident'] as const;
export function avatarFrame(style: string) { return Math.max(0, avatarFrames.indexOf(style as typeof avatarFrames[number])); }
