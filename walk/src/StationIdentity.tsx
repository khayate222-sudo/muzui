import {t} from './i18n';
import type { ReactNode } from 'react';
import type { Genre } from './model';

export function WalkLogo() {
  return <span className="brand station-brand">
    <svg className="station-emblem" width="42" height="44" viewBox="0 0 44 46" fill="none" aria-hidden="true">
      <path d="M7 22L22 8 37 22V40H7Z" fill="#e8ddc4"/>
      <path d="M4 22L22 5 41 22 37 25 22 12 8 25Z" fill="#738068"/>
      <g stroke="#625942" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 22L22 5 41 22M8 24V40H36V24M4 41H40M16 40V32C16 24 27 24 27 32V40"/>
        <circle cx="22" cy="19" r="5" fill="#fff9e8"/>
        <path d="M22 15.5V19L24.5 20.5M11 29H14V34H11ZM30 29H33V34H30ZM3 44H41"/>
      </g>
      <path d="M33 11Q41 9 39 5Q34 5 33 11M36 14L40 8" stroke="#87946b" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
    <span className="brand-wording"><span className="brand-title">walk</span><span className="brand-caption">{t("好きへ、寄り道。")}</span></span>
    <span className="beta">BETA</span>
  </span>;
}

type Motif = Genre | 'station' | 'explore' | 'saved' | 'social' | 'journal' | 'post' | 'gate';
const motifs: Record<Motif, ReactNode> = {
  station: <><path d="M3 11L12 3 21 11M5 10V21H19V10M9 21V15A3 3 0 0115 15V21"/><circle cx="12" cy="9" r="2"/><path d="M12 8V9L13 10M2 22H22"/></>,
  explore: <><path d="M3 5L9 3 15 5 21 3V19L15 21 9 19 3 21ZM9 3V19M15 5V21"/><path d="M6 13Q12 5 18 12" strokeDasharray="1.5 2.5"/><circle cx="17" cy="12" r="1.5" fill="currentColor" stroke="none"/></>,
  saved: <><path d="M6 3H18V21L12 17 6 21ZM9 7H15M9 10H14"/><path d="M3 5V22" opacity=".45"/></>,
  social: <><path d="M3 5H21V17H11L7 21V17H3ZM3 6L12 12 21 6"/><path d="M6 2H18" opacity=".5"/></>,
  journal: <><path d="M6 3H19V21H6C2 21 2 17 6 17H19M6 3V17M9 7H16M9 10H14"/><path d="M3 6H6M3 10H6M3 14H6"/></>,
  post: <><path d="M4 6H18V21H4ZM8 3H21V17M8 10H14M8 14H13"/><path d="M15 17H19M17 15V19"/></>,
  gate: <><path d="M6 21V7Q12 1 18 7V21M3 21H21M10 20V8L18 5"/><circle cx="15" cy="13" r=".8" fill="currentColor" stroke="none"/></>,
  discovery: <><path d="M3 19H21M5 19V11M19 19V11M3 11L12 4 21 11M12 11V19"/><path d="M9 8H15M8 22H16" opacity=".5"/></>,
  music: <><path d="M9 17V6L19 3V14M9 9L19 6"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="16" cy="15" rx="3" ry="2"/></>,
  video: <><rect x="3" y="6" width="18" height="14" rx="1"/><path d="M3 6L20 2M6 2L9 5M12 1L15 4M10 10L16 13 10 17Z"/></>,
  art: <><path d="M6 3H18V17H6ZM8 17L5 22M16 17L19 22M12 17V22M5 17H19"/><path d="M8 13L11 10 14 13 16 11"/><circle cx="15" cy="7" r="1"/></>,
  meme: <><path d="M4 4H20V17H11L7 21V17H4"/><path d="M8 8H9M15 8H16M8 11Q12 16 16 11"/></>,
  game: <><path d="M4 8H20L22 18Q22 22 18 20L15 17H9L6 20Q2 22 2 18Z"/><path d="M6 10V14M4 12H8M16 11H16.2M19 14H19.2M10 8V5H14V3"/></>,
  anime: <><path d="M4 3H20V21H4ZM12 3V21M4 12H12M12 9H20M12 15H20"/><path d="M6 8L8 6 10 8M15 12H18M15 18H18"/></>,
};

// Drawn as a single ink family, so platform emoji and unrelated icon styles
// cannot change the appearance of the station's controls between devices.
export function TrailIcon({ kind, size = 24 }: { kind: Motif; size?: number }) {
  return <svg className="trail-glyph" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{motifs[kind]}</svg>;
}
