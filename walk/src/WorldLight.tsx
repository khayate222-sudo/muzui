import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { worldLight, type LightPreference } from './world-light';
import './world-illustration.css';
function savedLight(): LightPreference {
  try { const value = localStorage.getItem('walk-world-light'); return value === 'afternoon' || value === 'evening' ? value : 'auto'; } catch { return 'auto'; }
}
export function useWorldLight() {
  const [preference, setPreference] = useState<LightPreference>(savedLight), [date, setDate] = useState(() => new Date());
  useEffect(() => {
    const update = () => setDate(new Date()), timer = setInterval(update, 60_000);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, []);
  function change(value: LightPreference) {
    setDate(new Date()); setPreference(value);
    try { localStorage.setItem('walk-world-light', value); } catch { /* Still works for this session without storage. */ }
  }
  return { preference, light: worldLight(preference, date), change };
}
export default function WorldLightControl({ state }: { state: ReturnType<typeof useWorldLight> }) {
  return <label className="world-light-control" title="この端末に見える風景の光を変更します。自動は端末の時刻に合わせます。">{state.light === 'evening' ? <Moon size={13}/> : <Sun size={13}/>}<select aria-label="箱庭の光" value={state.preference} onChange={e => state.change(e.target.value as LightPreference)}><option value="auto">時間に合わせる</option><option value="afternoon">放課後</option><option value="evening">夕暮れ</option></select></label>;
}
