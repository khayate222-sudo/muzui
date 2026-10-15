import { expect, it } from 'vitest';
import { fromCourtyard, toCourtyard } from '../src/world-layout';
import { gatePoints, findPlace } from '../shared/worlds';

it('keeps saved post, room and network positions reversible across the courtyard foreground', () => {
  for (const x of [40, 440, 1000, 1100, 1570, 1960]) for (const y of [70, 230, 340, 690, 750, 1050, 1360]) {
    const scene = toCourtyard({x,y}), saved = fromCourtyard(scene);
    expect(scene.x).toBeGreaterThanOrEqual(260); expect(scene.x).toBeLessThanOrEqual(1740);
    expect(scene.y).toBeGreaterThanOrEqual(810); expect(scene.y).toBeLessThanOrEqual(1280);
    expect(saved.x).toBeCloseTo(x, 8); expect(saved.y).toBeCloseTo(y, 8);
  }
});
it('uses real destinations for the two physical gates, retaining the parent path in nested worlds', () => {
  expect(gatePoints('public').map(g=>g.place.id)).toEqual(['world:discovery','world:art']);
  for (const id of ['world:game','world:game-rpg','world:game-rpg-original','world:music','activity:study']) {
    const gates = gatePoints(id);
    expect(gates.length).toBeLessThanOrEqual(2);
    expect(gates.some(g=>g.place.id===findPlace(id)?.parentId)).toBe(true);
    expect(gates.every(g=>g.place.id!==id)).toBe(true);
  }
});
