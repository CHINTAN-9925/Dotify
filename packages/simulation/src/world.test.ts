import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@split/config';
import { SeededRandom, SimulationWorld, SpatialHash } from './index.js';

function armPrime(world: SimulationWorld, primeIndex = 0) {
  const prime = world.primes[primeIndex];
  if (!prime) throw new Error('missing prime');
  const player = world.blobs.get('p1') ?? world.addPlayer('p1', 'player');
  player.x = prime.x; player.y = prime.y; player.directionX = 0; player.directionY = 0;
  for (let i = 0; i < world.config.primeChargeRequired; i++) {
    world.food.clear();
    const id = 100_000 + i;
    world.food.set(id, {
      id, clusterId: prime.clusterId, x: player.x, y: player.y,
      radius: world.config.foodRadius, mass: world.config.foodMass, color: '#fff'
    });
    world.step();
  }
  return { prime, player };
}

describe('authoritative simulation', () => {
  it('generates repeatable random sequences', () => {
    const a = new SeededRandom(42), b = new SeededRandom(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it('applies inputs once and constrains movement', () => {
    const world = new SimulationWorld(1);
    const player = world.addPlayer('p1', 'player');
    const before = player.x;
    world.applyInput('p1', { protocolVersion: PROTOCOL_VERSION, sequence: 1, directionX: 1, directionY: 0, burstPressed: false });
    world.step();
    expect(player.x).toBeGreaterThan(before);
    expect(player.lastProcessedSequence).toBe(1);
    world.applyInput('p1', { protocolVersion: PROTOCOL_VERSION, sequence: 1, directionX: -1, directionY: 0, burstPressed: false });
    expect(player.directionX).toBe(1);
  });

  it('queries nearby spatial entities without returning distant cells', () => {
    const hash = new SpatialHash<{ id: number; x: number; y: number; radius: number }>(100);
    hash.insert({ id: 1, x: 10, y: 10, radius: 2 });
    hash.insert({ id: 2, x: 900, y: 900, radius: 2 });
    expect(hash.query(10, 10, 20).map(x => x.id)).toEqual([1]);
  });

  it('never respawns food inside a live blob', () => {
    const world = new SimulationWorld(7);
    const player = world.addPlayer('p1', 'player');
    player.mass = 10_000;
    player.radius = Math.sqrt(player.mass) * world.config.massToRadius;
    player.x = world.config.worldSize / 2;
    player.y = world.config.worldSize / 2;
    world.food.clear();
    world.step();
    for (const food of world.food.values()) {
      const dx = food.x - player.x, dy = food.y - player.y;
      expect(dx * dx + dy * dy).toBeGreaterThanOrEqual((player.radius + world.config.foodRadius + 18) ** 2);
    }
  });

  it('places food inside persistent cluster hotspots', () => {
    const world = new SimulationWorld(99);
    expect(world.clusters).toHaveLength(world.config.clusterCount);
    for (const food of world.food.values()) {
      const nearestClusterDistance = Math.min(...world.clusters.map(cluster => Math.hypot(food.x - cluster.x, food.y - cluster.y)));
      expect(nearestClusterDistance).toBeLessThanOrEqual(world.config.clusterRadius);
    }

    const innerCoreCount = [...world.food.values()].filter(food =>
      world.clusters.some(cluster => Math.hypot(food.x - cluster.x, food.y - cluster.y) <= world.config.clusterRadius * 0.5)
    ).length;
    expect(innerCoreCount / world.food.size).toBeGreaterThan(0.55);
  });

  it('places three deterministic Prime Cores on different clusters', () => {
    const a = new SimulationWorld(808), b = new SimulationWorld(808);
    expect(a.primes).toHaveLength(a.config.primeCount);
    expect(new Set(a.primes.map(prime => prime.clusterId)).size).toBe(a.config.primeCount);
    expect(a.primes.map(prime => [prime.clusterId, prime.x, prime.y])).toEqual(
      b.primes.map(prime => [prime.clusterId, prime.x, prime.y])
    );
  });

  it('arms a Prime from food harvested in its cluster', () => {
    const world = new SimulationWorld(17);
    const { prime } = armPrime(world);
    expect(prime.armed).toBe(true);
    expect(prime.charge).toBe(world.config.primeChargeRequired);
    expect(world.drainEvents().some(event => event.type === 'primeArmed' && event.primeId === prime.id)).toBe(true);
  });

  it('awards an armed Prime detonation to the fragment owner', () => {
    const world = new SimulationWorld(23);
    const { prime, player } = armPrime(world);
    world.drainEvents();
    world.food.clear();
    world.applyInput('p1', { protocolVersion: PROTOCOL_VERSION, sequence: 1, directionX: 0, directionY: 0, burstPressed: true });
    world.step();
    const detonation = world.drainEvents().find(event => event.type === 'primeDetonated');
    expect(detonation).toMatchObject({ type: 'primeDetonated', primeId: prime.id, ownerId: 'p1', neutral: false });
    expect(player.chain).toBeGreaterThanOrEqual(world.config.primeChainBonus);
    expect(prime.cooldown).toBe(world.config.primeCooldownSeconds);
  });

  it('auto-detonates an unclaimed Prime and relocates it after cooldown', () => {
    const world = new SimulationWorld(31);
    const { prime } = armPrime(world);
    const originalCluster = prime.clusterId;
    world.drainEvents();
    for (let i = 0; i < world.config.primeFuseSeconds * world.config.tickRate + 2; i++) world.step();
    expect(world.drainEvents().some(event => event.type === 'primeDetonated' && event.ownerId === null && event.neutral)).toBe(true);
    for (let i = 0; i < world.config.primeCooldownSeconds * world.config.tickRate + 2; i++) world.step();
    expect(prime.clusterId).not.toBe(originalCluster);
    expect(prime.cooldown).toBe(0);
  });
});
