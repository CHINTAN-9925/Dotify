import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';
import type { AftershockZone, Blob, Food, PrimeCore, SimulationWorld } from '@split/simulation';

export class BlobSchema extends Schema {
  @type('string') id = '';
  @type('string') kind = '';
  @type('string') name = '';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') velocityX = 0;
  @type('number') velocityY = 0;
  @type('number') mass = 0;
  @type('number') radius = 0;
  @type('string') color = '';
  @type('uint8') cracks = 0;
  @type('number') cooldown = 0;
  @type('uint16') chain = 0;
  @type('int32') lastProcessedSequence = -1;
  @type('boolean') dead = false;
}

export class FoodSchema extends Schema {
  @type('uint32') id = 0;
  @type('uint8') clusterId = 0;
  @type('number') x = 0;
  @type('number') y = 0;
  @type('string') color = '';
}

export class PrimeSchema extends Schema {
  @type('uint8') id = 0;
  @type('uint8') clusterId = 0;
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') radius = 0;
  @type('number') charge = 0;
  @type('boolean') armed = false;
  @type('number') fuse = 0;
  @type('number') cooldown = 0;
}

export class AftershockSchema extends Schema {
  @type('uint32') id = 0;
  @type('uint8') primeId = 0;
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') radius = 0;
  @type('number') timeRemaining = 0;
  @type('number') duration = 0;
}

export class ArenaState extends Schema {
  @type('uint32') tick = 0;
  @type('string') configVersion = '';
  @type('uint32') seed = 0;
  @type({ map: BlobSchema }) blobs = new MapSchema<BlobSchema>();
  @type([FoodSchema]) food = new ArraySchema<FoodSchema>();
  @type([PrimeSchema]) primes = new ArraySchema<PrimeSchema>();
  @type([AftershockSchema]) aftershocks = new ArraySchema<AftershockSchema>();
}

function copyBlob(source: Blob, target: BlobSchema): void {
  target.id = source.id; target.kind = source.kind; target.name = source.name;
  target.x = source.x; target.y = source.y;
  target.velocityX = source.vx; target.velocityY = source.vy;
  target.mass = source.mass; target.radius = source.radius; target.color = source.color;
  target.cracks = source.cracks; target.cooldown = source.cooldown; target.chain = source.chain;
  target.lastProcessedSequence = source.lastProcessedSequence; target.dead = source.dead;
}

export function syncState(world: SimulationWorld, state: ArenaState): void {
  state.tick = world.tick;
  for (const blob of world.blobs.values()) {
    let target = state.blobs.get(blob.id);
    if (!target) { target = new BlobSchema(); state.blobs.set(blob.id, target); }
    copyBlob(blob, target);
  }
  for (const id of [...state.blobs.keys()]) if (!world.blobs.has(id)) state.blobs.delete(id);

  const known = new Map<number, FoodSchema>();
  for (const item of state.food) known.set(item.id, item);
  for (let i = state.food.length - 1; i >= 0; i--) {
    const item = state.food[i];
    if (item && !world.food.has(item.id)) state.food.splice(i, 1);
  }
  for (const food of world.food.values()) {
    if (!known.has(food.id)) state.food.push(toFoodSchema(food));
  }


  while (state.primes.length < world.primes.length) state.primes.push(new PrimeSchema());
  while (state.primes.length > world.primes.length) state.primes.pop();
  world.primes.forEach((prime, index) => {
    const target = state.primes[index];
    if (target) copyPrime(prime, target);
  });

  const knownAftershocks = new Map<number, AftershockSchema>();
  for (const zone of state.aftershocks) knownAftershocks.set(zone.id, zone);
  for (let i = state.aftershocks.length - 1; i >= 0; i--) {
    const zone = state.aftershocks[i];
    if (zone && !world.aftershocks.some(candidate => candidate.id === zone.id)) state.aftershocks.splice(i, 1);
  }
  for (const zone of world.aftershocks) {
    let target = knownAftershocks.get(zone.id);
    if (!target) { target = new AftershockSchema(); state.aftershocks.push(target); }
    copyAftershock(zone, target);
  }
}

function toFoodSchema(food: Food): FoodSchema {
  const result = new FoodSchema();
  result.id = food.id; result.clusterId = food.clusterId; result.x = food.x; result.y = food.y; result.color = food.color;
  return result;
}

function copyPrime(source: PrimeCore, target: PrimeSchema): void {
  target.id = source.id; target.clusterId = source.clusterId;
  target.x = source.x; target.y = source.y; target.radius = source.radius;
  target.charge = source.charge; target.armed = source.armed;
  target.fuse = source.fuse; target.cooldown = source.cooldown;
}

function copyAftershock(source: AftershockZone, target: AftershockSchema): void {
  target.id = source.id; target.primeId = source.primeId;
  target.x = source.x; target.y = source.y; target.radius = source.radius;
  target.timeRemaining = source.timeRemaining; target.duration = source.duration;
}
