import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { GAME_CONFIG, PROTOCOL_VERSION } from '@split/config';
import type { GameEvent, PlayerInput } from '@split/protocol';
import { GameConnection } from './network';
import type { WireBlob, WireFood } from './types';

interface VisualParticle {
  x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string;
}

interface VisualBlob {
  source: WireBlob;
  x: number; y: number; targetX: number; targetY: number;
  alpha: number; seen: boolean;
}

interface VisualFood extends WireFood { alpha: number; targetAlpha: number; seen: boolean }

export interface HudSnapshot { mass: number; chain: number; bestChain: number; cooldown: number; status: string }

export class SplitGame {
  private readonly app = new Application();
  private readonly worldLayer = new Container();
  private readonly scene = new Graphics();
  private readonly labels = new Container();
  private readonly connection = new GameConnection();
  private readonly particles: VisualParticle[] = [];
  private readonly visualBlobs = new Map<string, VisualBlob>();
  private readonly visualFood = new Map<number, VisualFood>();
  private readonly blobLabels = new Map<string, Text>();
  private pointerX = 0; private pointerY = 0; private sequence = 0;
  private burstQueued = false; private lastSend = 0; private bestChain = 0;
  private status = 'starting'; private destroyed = false; private initialized = false;

  async mount(host: HTMLElement, displayName: string): Promise<void> {
    await this.app.init({ resizeTo: host, background: GAME_CONFIG.background, antialias: true, autoDensity: true, resolution: Math.min(devicePixelRatio, 2), preference: 'webgl' });
    this.initialized = true;
    if (this.destroyed) {
      this.app.destroy({ removeView: true }, { children: true });
      return;
    }
    host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.worldLayer);
    this.worldLayer.addChild(this.scene, this.labels);
    this.connection.onEvent = event => this.handleEvent(event);
    this.connection.onStatus = status => { this.status = status; };
    this.installInput(this.app.canvas);
    this.app.ticker.add(ticker => this.frame(ticker.deltaMS / 1000));
    await this.connection.connect(displayName);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.initialized) this.app.destroy({ removeView: true }, { children: true });
  }

  queueBurst(): void { this.burstQueued = true; }

  hud(): HudSnapshot {
    const player = this.player();
    if (player) this.bestChain = Math.max(this.bestChain, player.chain);
    return { mass: player?.mass ?? 0, chain: player?.chain ?? 0, bestChain: this.bestChain, cooldown: player?.cooldown ?? 0, status: this.status };
  }

  private frame(dt: number): void {
    if (this.destroyed) return;
    const safeDt = Math.min(dt, 0.05);
    this.syncVisualState(safeDt);
    const player = this.visualBlobs.get(this.connection.playerId);
    if (!player) return;
    this.sendInput();
    this.updateParticles(safeDt);
    this.draw(player);
  }

  private sendInput(): void {
    const now = performance.now();
    if (now - this.lastSend < 50 && !this.burstQueued) return;
    const centerX = this.app.screen.width / 2, centerY = this.app.screen.height / 2;
    const dx = this.pointerX - centerX, dy = this.pointerY - centerY;
    const length = Math.hypot(dx, dy);
    const input: PlayerInput = {
      protocolVersion: PROTOCOL_VERSION,
      sequence: ++this.sequence,
      directionX: length > 5 ? dx / length : 0,
      directionY: length > 5 ? dy / length : 0,
      burstPressed: this.burstQueued
    };
    this.connection.sendInput(input);
    this.burstQueued = false; this.lastSend = now;
  }

  private draw(player: VisualBlob): void {
    const width = this.app.screen.width, height = this.app.screen.height;
    const zoom = Math.max(0.35, Math.min(1.1, Math.pow(70 / Math.max(player.source.radius, 1), 0.45)));
    const sx = (x: number) => (x - player.x) * zoom + width / 2;
    const sy = (y: number) => (y - player.y) * zoom + height / 2;
    this.scene.clear();
    for (const label of this.blobLabels.values()) label.visible = false;

    this.scene.rect(sx(0), sy(0), GAME_CONFIG.worldSize * zoom, GAME_CONFIG.worldSize * zoom).stroke({ color: 0xffffff, alpha: 0.12, width: 2 });
    for (const food of this.visualFood.values()) {
      const x = sx(food.x), y = sy(food.y);
      if (x < -20 || y < -20 || x > width + 20 || y > height + 20) continue;
      this.scene.circle(x, y, GAME_CONFIG.foodRadius * zoom).fill({ color: food.color, alpha: food.alpha });
    }
    for (const visual of this.visualBlobs.values()) {
      const blob = visual.source;
      if (visual.alpha <= 0.01) continue;
      const x = sx(visual.x), y = sy(visual.y), radius = blob.radius * zoom;
      if (x < -radius || y < -radius || x > width + radius || y > height + radius) continue;
      this.scene.circle(x, y, radius).fill({ color: blob.color, alpha: visual.alpha * (blob.kind === 'bot' ? 0.88 : 1) });
      this.scene.circle(x, y, radius + 3).stroke({ color: blob.id === player.source.id ? 0x31c4ff : 0xffffff, alpha: visual.alpha * (blob.id === player.source.id ? 0.9 : 0.2), width: 2 });
      if (blob.cracks > 0) this.scene.circle(x, y, radius + 7).stroke({ color: 0xff3b6b, alpha: 0.9, width: 3 });
      if (radius > 14) {
        let label = this.blobLabels.get(blob.id);
        if (!label) {
          label = new Text({ text: blob.name, style: new TextStyle({ fill: 0x101016, fontFamily: 'system-ui', fontSize: 14, fontWeight: '600' }) });
          label.anchor.set(0.5); this.labels.addChild(label); this.blobLabels.set(blob.id, label);
        }
        label.text = blob.name; label.style.fontSize = Math.min(18, radius * 0.45);
        label.alpha = visual.alpha; label.position.set(x, y); label.visible = true;
      }
    }
    for (const particle of this.particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      this.scene.circle(sx(particle.x), sy(particle.y), GAME_CONFIG.fragmentRadius * zoom).fill({ color: particle.color, alpha });
    }
  }

  private syncVisualState(dt: number): void {
    const state = this.connection.room?.state;
    if (!state) return;
    const blend = (rate: number) => 1 - Math.exp(-rate * dt);

    for (const visual of this.visualBlobs.values()) visual.seen = false;
    state.blobs.forEach((blob: WireBlob) => {
      let visual = this.visualBlobs.get(blob.id);
      if (!visual) {
        visual = { source: blob, x: blob.x, y: blob.y, targetX: blob.x, targetY: blob.y, alpha: 0, seen: true };
        this.visualBlobs.set(blob.id, visual);
      }
      visual.source = blob; visual.targetX = blob.x; visual.targetY = blob.y; visual.seen = true;
    });
    for (const [id, visual] of this.visualBlobs) {
      // Exponential interpolation is frame-rate independent and avoids the
      // visible 20 Hz stepping of raw server positions.
      const positionBlend = blend(id === this.connection.playerId ? 18 : 12);
      visual.x += (visual.targetX - visual.x) * positionBlend;
      visual.y += (visual.targetY - visual.y) * positionBlend;
      const targetAlpha = visual.seen && !visual.source.dead ? 1 : 0;
      visual.alpha += (targetAlpha - visual.alpha) * blend(14);
      if (!visual.seen && visual.alpha < 0.01) {
        this.visualBlobs.delete(id);
        const label = this.blobLabels.get(id);
        if (label) { label.destroy(); this.blobLabels.delete(id); }
      }
    }

    for (const food of this.visualFood.values()) { food.seen = false; food.targetAlpha = 0; }
    for (const food of state.food as unknown as Iterable<WireFood>) {
      let visual = this.visualFood.get(food.id);
      if (!visual) {
        visual = { id: food.id, x: food.x, y: food.y, color: food.color, alpha: 0, targetAlpha: 1, seen: true };
        this.visualFood.set(food.id, visual);
      }
      visual.x = food.x; visual.y = food.y; visual.color = food.color;
      visual.seen = true; visual.targetAlpha = 1;
    }
    for (const [id, food] of this.visualFood) {
      // Food enters and leaves over ~120 ms instead of flashing for one frame.
      food.alpha += (food.targetAlpha - food.alpha) * blend(food.targetAlpha ? 16 : 20);
      if (!food.seen && food.alpha < 0.01) this.visualFood.delete(id);
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]; if (!p) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  private handleEvent(event: GameEvent): void {
    if (event.type !== 'burst' && event.type !== 'foodPopped' && event.type !== 'blobShattered') return;
    const count = event.type === 'burst' ? event.count : event.type === 'blobShattered' ? 3 : 1;
    let state = event.seed >>> 0;
    const random = () => { state += 0x6d2b79f5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const offset = random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const angle = offset + i * Math.PI * 2 / count;
      this.particles.push({ x: event.x, y: event.y, vx: Math.cos(angle) * GAME_CONFIG.fragmentSpeed, vy: Math.sin(angle) * GAME_CONFIG.fragmentSpeed, life: GAME_CONFIG.fragmentLifeSeconds, maxLife: GAME_CONFIG.fragmentLifeSeconds, color: event.color });
    }
  }

  private player(): WireBlob | undefined {
    return this.connection.room?.state.blobs.get(this.connection.playerId);
  }

  private installInput(canvas: HTMLCanvasElement): void {
    const update = (event: PointerEvent) => { this.pointerX = event.clientX; this.pointerY = event.clientY; };
    canvas.addEventListener('pointerdown', event => { canvas.setPointerCapture(event.pointerId); update(event); });
    canvas.addEventListener('pointermove', update);
    window.addEventListener('keydown', event => { if (event.code === 'Space') { event.preventDefault(); this.queueBurst(); } });
  }
}
