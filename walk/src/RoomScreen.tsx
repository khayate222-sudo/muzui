import type { ReactNode } from 'react';
import { Maximize2, Moon } from 'lucide-react';
import './room-watching.css';

export default function RoomScreen({ active, title, focus, hasPost, children }: {
  active: boolean; title?: string; focus: () => void; hasPost: boolean; children: ReactNode;
}) {
  return <div className={'room-screen' + (active ? ' in-room' : '')} data-testid={active ? 'room-interior' : undefined}>
    <div className="room-scenery" aria-hidden="true" />
    <div className="room-scene-heading"><span>YOUR LITTLE WINDOW</span><h3>{title}</h3><p><Moon size={13}/> 窓の向こうの夕暮れ <span>· 背景</span></p></div>
    <div className="room-player"><div className="room-player-content">{children}</div>{active && hasPost && <button className="room-enlarge" onClick={focus}><Maximize2 size={15}/>大きく見る</button>}</div>
    <p className="room-window-note">いつもの世界を、あなたの窓から。</p>
  </div>;
}
