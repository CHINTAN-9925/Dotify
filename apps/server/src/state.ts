import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';
import type { Blob, Food, SimulationWorld } from '@split/simulation';

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
  @type('number') x = 0;
  @type('number') y = 0;
  @type('string') color = '';
}

export class ArenaState extends Schema {
  @type('uint32') tick = 0;
  @type('string') configVersion = '';
  @type('uint32') seed = 0;
  @type({ map: BlobSchema }) blobs = new MapSchema<BlobSchema>();
  @type([FoodSchema]) food = new ArraySchema<FoodSchema>();
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
}

function toFoodSchema(food: Food): FoodSchema {
  const result = new FoodSchema();
  result.id = food.id; result.x = food.x; result.y = food.y; result.color = food.color;
  return result;
}
