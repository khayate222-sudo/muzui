import { avatarFrame } from './world-layout';
export default function Avatar({ color, style = 'cap', size = 42 }: { color: string; style?: string; size?: number }) {
  const frame = avatarFrame(style), x = frame % 3 * 512, y = Math.floor(frame / 3) * 512;
  return <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="illustrated-avatar"><rect width="64" height="64" rx="22" fill="#ece5d8"/><rect x="2" y="2" width="60" height="60" rx="20" fill={color+'22'}/><svg x="1" y="-2" width="62" height="70" viewBox={`${x+100} ${y} 312 360`} overflow="hidden"><image href="/art/walk-residents.webp" width="1536" height="1024"/></svg><circle cx="53" cy="53" r="7" fill={color} stroke="#fff9ed" strokeWidth="3"/></svg>;
}
