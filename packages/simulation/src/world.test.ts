import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@split/config';
import { SeededRandom, SimulationWorld, SpatialHash } from './index.js';

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
});
