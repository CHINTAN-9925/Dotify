import { useEffect, useRef, useState } from 'react';
import { SplitGame, type HudSnapshot } from './game';

const emptyHud: HudSnapshot = { mass: 0, chain: 0, bestChain: 0, cooldown: 0, status: 'starting', banner: '', aftershock: 0 };

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<SplitGame | undefined>(undefined);
  const [hud, setHud] = useState(emptyHud);
  const [fatal, setFatal] = useState('');

  useEffect(() => {
    if (!host.current) return;
    const instance = new SplitGame(); game.current = instance;
    void instance.mount(host.current, localStorage.getItem('split.displayName') ?? 'drifter').catch(error => setFatal(error instanceof Error ? error.message : String(error)));
    const timer = window.setInterval(() => setHud(instance.hud()), 100);
    return () => { window.clearInterval(timer); instance.destroy(); };
  }, []);

  return <main>
    <div className="game" ref={host} />
    <section className="hud" aria-live="polite">
      <div className="mass"><strong>{Math.floor(hud.mass)}</strong><span>mass · best chain {hud.bestChain}</span></div>
      {hud.chain > 0 && <div className="chain"><strong>{hud.chain}</strong><span>CHAIN</span></div>}
      {hud.banner && <div className="banner">{hud.banner}</div>}
      {hud.aftershock > 0 && <div className="aftershock"><strong>2× AFTERSHOCK</strong><span>{hud.aftershock.toFixed(1)}s</span></div>}
      <div className={`status ${hud.status === 'online' ? 'online' : ''}`}>{fatal || hud.status}</div>
      <button className="burst" disabled={hud.cooldown > 0 || hud.mass < 30} onPointerDown={() => game.current?.queueBurst()}>
        <strong>BURST</strong><span>{hud.cooldown > 0 ? `${hud.cooldown.toFixed(1)}s` : 'READY'}</span>
      </button>
    </section>
  </main>;
}
