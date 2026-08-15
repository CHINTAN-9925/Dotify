import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { GAME_CONFIG, PROTOCOL_VERSION } from '@split/config';
import type { GameEvent, PlayerInput } from '@split/protocol';
import { GameConnection } from './network';
import type { WireBlob, WireFood, WirePrime } from './types';

interface VisualParticle {
  x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string;
}

interface VisualBlob {
  source: WireBlob;
  x: number; y: number; targetX: number; targetY: number;
  alpha: number; seen: boolean;
}

interface VisualFood extends WireFood { alpha: number; targetAlpha: number; seen: boolean }

interface VisualPrime {
  source: WirePrime; x: number; y: number; alpha: number; seen: boolean;
}

interface VisualRing {
  x: number; y: number; life: number; maxLife: number; startRadius: number; endRadius: number; color: string;
}

export interface HudSnapshot { mass: number; chain: number; bestChain: number; cooldown: number; status: string; banner: string }

export class SplitGame {
  private readonly app = new Application();
  private readonly worldLayer = new Container();
  private readonly scene = new Graphics();
  private readonly labels = new Container();
  private readonly connection = new GameConnection();
  private readonly particles: VisualParticle[] = [];
  private readonly visualBlobs = new Map<string, VisualBlob>();
  private readonly visualFood = new Map<number, VisualFood>();
  private readonly visualPrimes = new Map<number, VisualPrime>();
  private readonly blobLabels = new Map<string, Text>();
  private readonly primeLabels = new Map<number, Text>();
  private readonly rings: VisualRing[] = [];
  private pointerX = 0; private pointerY = 0; private sequence = 0;
  private burstQueued = false; private lastSend = 0; private bestChain = 0;
  private renderTime = 0; private cameraKick = 0; private banner = ''; private bannerLife = 0;
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
    return { mass: player?.mass ?? 0, chain: player?.chain ?? 0, bestChain: this.bestChain, cooldown: player?.cooldown ?? 0, status: this.status, banner: this.bannerLife > 0 ? this.banner : '' };
  }

  private frame(dt: number): void {
    if (this.destroyed) return;
    const safeDt = Math.min(dt, 0.05);
    this.renderTime += safeDt;
    this.cameraKick *= Math.exp(-9 * safeDt);
    this.bannerLife = Math.max(0, this.bannerLife - safeDt);
    this.syncVisualState(safeDt);
    const player = this.visualBlobs.get(this.connection.playerId);
    if (!player) return;
    this.sendInput();
    this.updateParticles(safeDt);
    this.updateRings(safeDt);
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
    const shakeX = Math.sin(this.renderTime * 91) * this.cameraKick;
    const shakeY = Math.cos(this.renderTime * 77) * this.cameraKick;
    const sx = (x: number) => (x - player.x) * zoom + width / 2 + shakeX;
    const sy = (y: number) => (y - player.y) * zoom + height / 2 + shakeY;
    this.scene.clear();
    for (const label of this.blobLabels.values()) label.visible = false;
    for (const label of this.primeLabels.values()) label.visible = false;

    this.scene.rect(sx(0), sy(0), GAME_CONFIG.worldSize * zoom, GAME_CONFIG.worldSize * zoom).stroke({ color: 0xffffff, alpha: 0.12, width: 2 });
    for (const food of this.visualFood.values()) {
      const x = sx(food.x), y = sy(food.y);
      if (x < -20 || y < -20 || x > width + 20 || y > height + 20) continue;
      this.scene.circle(x, y, GAME_CONFIG.foodRadius * zoom).fill({ color: food.color, alpha: food.alpha });
    }
    for (const visual of this.visualPrimes.values()) {
      if (visual.alpha <= 0.01) continue;
      const prime = visual.source;
      const x = sx(visual.x), y = sy(visual.y), radius = prime.radius * zoom;
      if (x < -80 || y < -80 || x > width + 80 || y > height + 80) continue;
      const pulse = 1 + Math.sin(this.renderTime * (prime.armed ? 10 : 3)) * (prime.armed ? 0.11 : 0.04);
      this.scene.circle(x, y, radius * 1.8 * pulse).fill({ color: GAME_CONFIG.primeColor, alpha: visual.alpha * (prime.armed ? 0.13 : 0.07) });
      this.scene.circle(x, y, radius * pulse).fill({ color: GAME_CONFIG.primeColor, alpha: visual.alpha * 0.94 });
      this.scene.circle(x, y, radius * 0.48).fill({ color: 0xffffff, alpha: visual.alpha * 0.76 });
      const progress = prime.armed ? Math.max(0, prime.fuse / GAME_CONFIG.primeFuseSeconds) : prime.charge / GAME_CONFIG.primeChargeRequired;
      if (progress > 0) {
        this.scene.arc(x, y, radius + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress).stroke({ color: prime.armed ? 0xff6b4a : GAME_CONFIG.primeColor, alpha: visual.alpha, width: prime.armed ? 5 : 3 });
      }
      if (prime.armed) {
        this.scene.circle(x, y, radius + 16 + Math.sin(this.renderTime * 12) * 4).stroke({ color: 0xff6b4a, alpha: visual.alpha * 0.8, width: 3 });
      }
      let label = this.primeLabels.get(prime.id);
      if (!label) {
        label = new Text({ text: '', style: new TextStyle({ fill: 0xffffff, fontFamily: 'system-ui', fontSize: 12, fontWeight: '700', align: 'center' }) });
        label.anchor.set(0.5, 0); this.labels.addChild(label); this.primeLabels.set(prime.id, label);
      }
      label.text = prime.armed ? `PRIME ${Math.ceil(prime.fuse)}s` : `${Math.floor(prime.charge)}/${GAME_CONFIG.primeChargeRequired}`;
      label.style.fill = prime.armed ? 0xff8a6b : 0xffe98a;
      label.alpha = visual.alpha; label.position.set(x, y + radius + 12); label.visible = true;
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
    for (const ring of this.rings) {
      const progress = 1 - ring.life / ring.maxLife;
      const radius = ring.startRadius + (ring.endRadius - ring.startRadius) * progress;
      this.scene.circle(sx(ring.x), sy(ring.y), radius * zoom).stroke({ color: ring.color, alpha: (1 - progress) * 0.8, width: Math.max(2, 6 * zoom * (1 - progress)) });
    }
    this.drawMinimap(player, width, height);
  }

  private drawMinimap(player: VisualBlob, width: number, height: number): void {
    const size = Math.min(116, Math.max(88, Math.min(width, height) * 0.16));
    const left = 18, top = height - size - 18;
    this.scene.roundRect(left, top, size, size, 10).fill({ color: 0x08080d, alpha: 0.72 }).stroke({ color: 0xffffff, alpha: 0.16, width: 1 });
    const point = (value: number) => value / GAME_CONFIG.worldSize * (size - 14) + 7;
    for (const prime of this.visualPrimes.values()) {
      if (prime.alpha <= 0.05) continue;
      this.scene.circle(left + point(prime.x), top + point(prime.y), prime.source.armed ? 4.5 : 3.5).fill({ color: prime.source.armed ? 0xff6b4a : GAME_CONFIG.primeColor, alpha: prime.alpha });
    }
    this.scene.circle(left + point(player.x), top + point(player.y), 3).fill({ color: 0x31c4ff, alpha: 1 });
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
        visual = { id: food.id, clusterId: food.clusterId, x: food.x, y: food.y, color: food.color, alpha: 0, targetAlpha: 1, seen: true };
        this.visualFood.set(food.id, visual);
      }
      visual.clusterId = food.clusterId; visual.x = food.x; visual.y = food.y; visual.color = food.color;
      visual.seen = true; visual.targetAlpha = 1;
    }
    for (const [id, food] of this.visualFood) {
      // Food enters and leaves over ~120 ms instead of flashing for one frame.
      food.alpha += (food.targetAlpha - food.alpha) * blend(food.targetAlpha ? 16 : 20);
      if (!food.seen && food.alpha < 0.01) this.visualFood.delete(id);
    }

    for (const prime of this.visualPrimes.values()) prime.seen = false;
    for (const prime of state.primes as unknown as Iterable<WirePrime>) {
      let visual = this.visualPrimes.get(prime.id);
      if (!visual) {
        visual = { source: prime, x: prime.x, y: prime.y, alpha: 0, seen: true };
        this.visualPrimes.set(prime.id, visual);
      }
      const relocated = visual.source.clusterId !== prime.clusterId;
      visual.source = prime; visual.seen = true;
      if (relocated || visual.alpha < 0.02) { visual.x = prime.x; visual.y = prime.y; }
      else { visual.x += (prime.x - visual.x) * blend(12); visual.y += (prime.y - visual.y) * blend(12); }
    }
    for (const [id, prime] of this.visualPrimes) {
      const targetAlpha = prime.seen && prime.source.cooldown <= 0 ? 1 : 0;
      prime.alpha += (targetAlpha - prime.alpha) * blend(targetAlpha ? 5 : 9);
      if (!prime.seen && prime.alpha < 0.01) {
        this.visualPrimes.delete(id);
        const label = this.primeLabels.get(id);
        if (label) { label.destroy(); this.primeLabels.delete(id); }
      }
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]; if (!p) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  private updateRings(dt: number): void {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i]; if (!ring) continue;
      ring.life -= dt;
      if (ring.life <= 0) this.rings.splice(i, 1);
    }
  }

  private handleEvent(event: GameEvent): void {
    if (event.type === 'primeArmed') {
      this.rings.push({ x: event.x, y: event.y, life: 0.7, maxLife: 0.7, startRadius: GAME_CONFIG.primeRadius, endRadius: 90, color: '#ff6b4a' });
      return;
    }
    if (event.type !== 'burst' && event.type !== 'foodPopped' && event.type !== 'blobShattered' && event.type !== 'primeDetonated') return;
    const count = event.type === 'burst' || event.type === 'primeDetonated' ? event.count : event.type === 'blobShattered' ? 3 : 1;
    if (event.type === 'primeDetonated') {
      this.cameraKick = Math.max(this.cameraKick, 13);
      this.rings.push({ x: event.x, y: event.y, life: 1, maxLife: 1, startRadius: GAME_CONFIG.primeRadius, endRadius: 260, color: event.color });
      this.banner = event.ownerId === this.connection.playerId ? 'PRIME CHAIN +3' : event.neutral ? 'PRIME ERUPTION' : 'PRIME CLAIMED';
      this.bannerLife = 1.8;
    }
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
