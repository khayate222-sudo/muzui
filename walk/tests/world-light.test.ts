import { expect, it } from 'vitest';
import { worldLight } from '../src/world-light';
it('changes the local scenery at six and seventeen, with a readable evening through the night', () => {
  const date = new Date(2026, 9, 15);
  for (const [hour, phase] of [[5, 'evening'], [6, 'afternoon'], [16, 'afternoon'], [17, 'evening'], [23, 'evening']] as const) {
    date.setHours(hour); expect(worldLight('auto', date)).toBe(phase);
  }
});
it('lets a person keep the preferred light regardless of local time', () => {
  expect(worldLight('afternoon', new Date(2026, 9, 15, 23))).toBe('afternoon');
  expect(worldLight('evening', new Date(2026, 9, 15, 12))).toBe('evening');
});
