export type WorldLight = 'afternoon' | 'evening';
export type LightPreference = 'auto' | WorldLight;
// A local visual preference, not shared-world time or evidence of a user's location.
export function worldLight(preference: LightPreference, date = new Date()): WorldLight {
  if (preference !== 'auto') return preference;
  const hour = date.getHours();
  return hour >= 6 && hour < 17 ? 'afternoon' : 'evening';
}
