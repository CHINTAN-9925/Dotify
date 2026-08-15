import { GAME_CONFIG, type GameConfig } from '@split/config';
import type { GameEvent, PlayerInput } from '@split/protocol';
import { SeededRandom } from './random.js';
import { SpatialHash } from './spatial-hash.js';

export interface Blob {
  id: string;
  kind: 'player' | 'bot';
  name: string;
  x: number; y: number; vx: number; vy: number;
  directionX: number; directionY: number;
  mass: number; radius: number; color: string;
  cracks: number; crackTimer: number;
  cooldown: number; chain: number;
  lastProcessedSequence: number;
  dead: boolean;
}

export interface Food {
  id: number; x: number; y: number; radius: number; mass: number; color: string;
}

export interface FoodCluster { x: number; y: number }

interface Fragment {
  id: number; x: number; y: number; vx: number; vy: number;
  radius: number; life: number; maxLife: number; speed: number;
  color: string; ownerId: string; hits: Set<string>;
}

export interface WorldSnapshot {
  tick: number;
  blobs: readonly Blob[];
  food: readonly Food[];
  fragmentCount: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export class SimulationWorld {
  readonly blobs = new Map<string, Blob>();
  readonly food = new Map<number, Food>();
  readonly clusters: FoodCluster[] = [];
  readonly events: GameEvent[] = [];
  readonly seed: number;
  tick = 0;

  private readonly rng: SeededRandom;
  private readonly fragments: Fragment[] = [];
  private readonly foodGrid: SpatialHash<Food>;
  private readonly blobGrid: SpatialHash<Blob>;
  private nextEntityId = 1;
  private nextEventId = 1;

  constructor(seed: number, readonly config: GameConfig = GAME_CONFIG) {
    this.seed = seed >>> 0;
    this.rng = new SeededRandom(this.seed);
    this.foodGrid = new SpatialHash(config.spatialCellSize);
    this.blobGrid = new SpatialHash(config.spatialCellSize);
    this.generateClusters();
    this.spawnFood(config.foodCount);
  }

  addPlayer(id: string, name: string, color = this.config.playerColor): Blob {
    const blob = this.makeBlob(id, 'player', name, color);
    this.blobs.set(id, blob);
    return blob;
  }

  addBot(id: string): Blob {
    const color = this.config.palette[this.rng.integer(0, this.config.palette.length)] ?? '#fff';
    const blob = this.makeBlob(id, 'bot', `bot-${id.slice(-4)}`, color);
    blob.directionX = this.rng.range(-1, 1);
    blob.directionY = this.rng.range(-1, 1);
    this.blobs.set(id, blob);
    return blob;
  }

  removeBlob(id: string): void { this.blobs.delete(id); }

  respawnBlob(id: string): void {
    const blob = this.blobs.get(id);
    if (!blob) return;
    const fresh = this.makeBlob(id, blob.kind, blob.name, blob.color);
    Object.assign(blob, fresh, { id, kind: blob.kind, name: blob.name, color: blob.color });
  }

  drainEvents(): GameEvent[] {
    return this.events.splice(0, this.events.length);
  }

  applyInput(id: string, input: PlayerInput): void {
    const blob = this.blobs.get(id);
    if (!blob || blob.dead || input.sequence <= blob.lastProcessedSequence) return;
    const length = Math.hypot(input.directionX, input.directionY);
    blob.directionX = length > 1 ? input.directionX / length : input.directionX;
    blob.directionY = length > 1 ? input.directionY / length : input.directionY;
    blob.lastProcessedSequence = input.sequence;
    if (input.burstPressed) this.burst(blob);
  }

  step(): void {
    const dt = 1 / this.config.tickRate;
    this.tick++;
    this.updateBlobs(dt);
    this.rebuildSpatialIndexes();
    this.consumeFood();
    this.consumeBlobs();
    this.updateFragments(dt);
  }

  snapshot(): WorldSnapshot {
    return { tick: this.tick, blobs: [...this.blobs.values()], food: [...this.food.values()], fragmentCount: this.fragments.length };
  }

  private makeBlob(id: string, kind: Blob['kind'], name: string, color: string): Blob {
    const mass = this.config.startMass;
    return {
      id, kind, name: name.slice(0, 20),
      x: this.rng.range(150, this.config.worldSize - 150),
      y: this.rng.range(150, this.config.worldSize - 150),
      vx: 0, vy: 0, directionX: 0, directionY: 0,
      mass, radius: this.radiusOf(mass), color,
      cracks: 0, crackTimer: 0, cooldown: 0, chain: 0,
      lastProcessedSequence: -1, dead: false
    };
  }

  private spawnFood(count: number): void {
    for (let i = 0; i < count; i++) {
      let x = 0, y = 0, foundSafePosition = false;
      for (let attempt = 0; attempt < 24; attempt++) {
        const cluster = this.clusters[this.rng.integer(0, this.clusters.length)];
        if (!cluster) break;
        const angle = this.rng.range(0, Math.PI * 2);
        // Exponent > 1 intentionally concentrates food near the hotspot core.
        // The thinner outer edge gives a chain room to spread before it dies.
        const distance = Math.pow(this.rng.next(), 1.7) * this.config.clusterRadius;
        x = cluster.x + Math.cos(angle) * distance;
        y = cluster.y + Math.sin(angle) * distance;
        foundSafePosition = this.isFoodSpawnSafe(x, y);
        if (foundSafePosition) break;
      }
      // A saturated arena may temporarily remain below the target food count.
      // Deferring is preferable to broadcasting a pellet that vanishes next tick.
      if (!foundSafePosition) continue;
      const id = this.nextEntityId++;
      this.food.set(id, {
        id,
        x,
        y,
        radius: this.config.foodRadius,
        mass: this.config.foodMass,
        color: this.config.palette[this.rng.integer(0, this.config.palette.length)] ?? '#fff'
      });
    }
  }

  private generateClusters(): void {
    const margin = this.config.clusterRadius + 20;
    const preferredGap = this.config.clusterRadius * 1.05;
    for (let i = 0; i < this.config.clusterCount; i++) {
      let candidate: FoodCluster = { x: margin, y: margin };
      for (let attempt = 0; attempt < 40; attempt++) {
        candidate = {
          x: this.rng.range(margin, this.config.worldSize - margin),
          y: this.rng.range(margin, this.config.worldSize - margin)
        };
        const separated = this.clusters.every(cluster => {
          const dx = candidate.x - cluster.x, dy = candidate.y - cluster.y;
          return dx * dx + dy * dy >= preferredGap * preferredGap;
        });
        if (separated) break;
      }
      this.clusters.push(candidate);
    }
  }

  private isFoodSpawnSafe(x: number, y: number): boolean {
    for (const blob of this.blobs.values()) {
      if (blob.dead) continue;
      const dx = x - blob.x, dy = y - blob.y;
      // Leave a small visual margin so network interpolation cannot make a
      // freshly spawned pellet appear underneath a moving blob.
      const clearance = blob.radius + this.config.foodRadius + 18;
      if (dx * dx + dy * dy < clearance * clearance) return false;
    }
    return true;
  }

  private updateBlobs(dt: number): void {
    for (const blob of this.blobs.values()) {
      if (blob.dead) continue;
      if (blob.kind === 'bot' && this.tick % 90 === 0) {
        blob.directionX = this.rng.range(-1, 1);
        blob.directionY = this.rng.range(-1, 1);
        if (this.rng.next() < 0.08) this.burst(blob);
      }
      const length = Math.hypot(blob.directionX, blob.directionY);
      const speed = this.config.baseSpeed * Math.pow(this.config.startMass / blob.mass, this.config.speedFalloff);
      const targetX = length > 0.001 ? blob.directionX / length * speed : 0;
      const targetY = length > 0.001 ? blob.directionY / length * speed : 0;
      const response = Math.min(1, 10.8 * dt);
      blob.vx += (targetX - blob.vx) * response;
      blob.vy += (targetY - blob.vy) * response;
      blob.x = clamp(blob.x + blob.vx * dt, blob.radius, this.config.worldSize - blob.radius);
      blob.y = clamp(blob.y + blob.vy * dt, blob.radius, this.config.worldSize - blob.radius);
      blob.cooldown = Math.max(0, blob.cooldown - dt);
      blob.crackTimer = Math.max(0, blob.crackTimer - dt);
      if (blob.crackTimer === 0) blob.cracks = 0;
      blob.radius = this.radiusOf(blob.mass);
    }
  }

  private rebuildSpatialIndexes(): void {
    this.foodGrid.clear(); this.blobGrid.clear();
    for (const food of this.food.values()) this.foodGrid.insert(food);
    for (const blob of this.blobs.values()) if (!blob.dead) this.blobGrid.insert(blob);
  }

  private consumeFood(): void {
    for (const blob of this.blobs.values()) {
      if (blob.dead) continue;
      for (const food of this.foodGrid.query(blob.x, blob.y, blob.radius)) {
        if (!this.food.has(food.id)) continue;
        const dx = blob.x - food.x, dy = blob.y - food.y;
        if (dx * dx + dy * dy < blob.radius * blob.radius) {
          blob.mass += food.mass;
          this.food.delete(food.id);
        }
      }
    }
    if (this.food.size < this.config.foodCount) this.spawnFood(Math.min(2, this.config.foodCount - this.food.size));
  }

  private consumeBlobs(): void {
    for (const blob of this.blobs.values()) {
      if (blob.dead) continue;
      for (const other of this.blobGrid.query(blob.x, blob.y, blob.radius * 2)) {
        if (other === blob || other.dead || blob.mass <= other.mass * this.config.eatRatio) continue;
        const dx = blob.x - other.x, dy = blob.y - other.y;
        const reach = blob.radius - other.radius * 0.4;
        if (dx * dx + dy * dy < reach * reach) {
          blob.mass += other.mass * 0.85;
          this.kill(other, 'eaten', blob.id);
        }
      }
    }
  }

  private burst(blob: Blob): void {
    if (blob.cooldown > 0 || blob.mass < this.config.burstMinMass || blob.dead) return;
    blob.mass *= 1 - this.config.burstCost;
    blob.cooldown = this.config.burstCooldownSeconds;
    blob.chain = 0;
    const seed = this.rng.integer(0, 0x7fffffff);
    this.events.push({ type: 'burst', id: this.nextEventId++, tick: this.tick, ownerId: blob.id, x: blob.x, y: blob.y, color: blob.color, seed, count: this.config.burstFragments });
    this.spawnFragments(blob.x, blob.y, this.config.burstFragments, blob.color, this.config.fragmentSpeed, this.config.fragmentLifeSeconds, blob.id, seed);
  }

  private spawnFragments(x: number, y: number, count: number, color: string, speed: number, life: number, ownerId: string, seed = this.rng.integer(0, 0x7fffffff)): void {
    const available = Math.max(0, this.config.fragmentCap - this.fragments.length);
    const actual = Math.min(count, available);
    const localRng = new SeededRandom(seed);
    const offset = localRng.range(0, Math.PI * 2);
    for (let i = 0; i < actual; i++) {
      const angle = offset + i * Math.PI * 2 / actual;
      this.fragments.push({
        id: this.nextEntityId++, x, y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        radius: this.config.fragmentRadius, life, maxLife: life, speed,
        color, ownerId, hits: new Set()
      });
    }
  }

  private updateFragments(dt: number): void {
    for (let index = this.fragments.length - 1; index >= 0; index--) {
      const fragment = this.fragments[index];
      if (!fragment) continue;
      fragment.x += fragment.vx * dt; fragment.y += fragment.vy * dt;
      if (fragment.x < fragment.radius || fragment.x > this.config.worldSize - fragment.radius) fragment.vx *= -1;
      if (fragment.y < fragment.radius || fragment.y > this.config.worldSize - fragment.radius) fragment.vy *= -1;
      fragment.x = clamp(fragment.x, fragment.radius, this.config.worldSize - fragment.radius);
      fragment.y = clamp(fragment.y, fragment.radius, this.config.worldSize - fragment.radius);
      fragment.life -= dt;

      for (const food of this.foodGrid.query(fragment.x, fragment.y, fragment.radius + this.config.foodRadius)) {
        if (!this.food.has(food.id)) continue;
        const dx = fragment.x - food.x, dy = fragment.y - food.y;
        const reach = fragment.radius + food.radius;
        if (dx * dx + dy * dy >= reach * reach) continue;
        this.food.delete(food.id);
        const owner = this.blobs.get(fragment.ownerId);
        if (owner && !owner.dead) { owner.mass += food.mass; owner.chain++; }
        const seed = this.rng.integer(0, 0x7fffffff);
        this.events.push({ type: 'foodPopped', id: this.nextEventId++, tick: this.tick, ownerId: fragment.ownerId, foodId: food.id, x: food.x, y: food.y, color: food.color, seed });
        this.spawnFragments(food.x, food.y, this.config.fragmentFromFood, food.color, fragment.speed * this.config.chainSpeedDecay, fragment.maxLife * this.config.chainLifeDecay, fragment.ownerId, seed);
      }

      for (const blob of this.blobGrid.query(fragment.x, fragment.y, fragment.radius + 128)) {
        if (blob.dead || blob.id === fragment.ownerId || fragment.hits.has(blob.id)) continue;
        const dx = fragment.x - blob.x, dy = fragment.y - blob.y;
        const reach = fragment.radius + blob.radius;
        if (dx * dx + dy * dy >= reach * reach) continue;
        fragment.hits.add(blob.id);
        blob.cracks++; blob.crackTimer = this.config.crackResetSeconds;
        const hitsToPop = this.hitsToPop(blob.mass);
        this.events.push({ type: 'blobCracked', id: this.nextEventId++, tick: this.tick, ownerId: fragment.ownerId, targetId: blob.id, x: blob.x, y: blob.y, cracks: blob.cracks, hitsToPop });
        if (blob.cracks >= hitsToPop) {
          const seed = this.rng.integer(0, 0x7fffffff);
          this.events.push({ type: 'blobShattered', id: this.nextEventId++, tick: this.tick, ownerId: fragment.ownerId, targetId: blob.id, x: blob.x, y: blob.y, color: blob.color, seed });
          const owner = this.blobs.get(fragment.ownerId);
          if (owner && !owner.dead) { owner.mass += blob.mass * this.config.shatterYield; owner.chain++; }
          this.kill(blob, 'shattered', fragment.ownerId);
          this.spawnFragments(blob.x, blob.y, this.config.fragmentFromBlob, blob.color, this.config.fragmentSpeed, this.config.fragmentLifeSeconds, fragment.ownerId, seed);
        }
      }

      if (fragment.life <= 0) this.fragments.splice(index, 1);
    }
  }

  private kill(blob: Blob, cause: 'eaten' | 'shattered', _ownerId: string): void {
    blob.dead = true;
    this.events.push({ type: 'playerDied', id: this.nextEventId++, tick: this.tick, playerId: blob.id, cause });
  }

  private radiusOf(mass: number): number { return Math.sqrt(mass) * this.config.massToRadius; }
  private hitsToPop(mass: number): number {
    return clamp(1 + Math.floor(Math.sqrt(mass) / this.config.crackPerRoot), 1, this.config.crackMax);
  }
}
