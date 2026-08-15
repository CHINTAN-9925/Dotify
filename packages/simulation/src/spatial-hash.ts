export interface SpatialEntity { id: string | number; x: number; y: number; radius: number }

export class SpatialHash<T extends SpatialEntity> {
  private readonly cells = new Map<string, T[]>();

  constructor(private readonly cellSize: number) {}

  clear(): void { this.cells.clear(); }

  insert(entity: T): void {
    const key = this.key(entity.x, entity.y);
    const cell = this.cells.get(key);
    if (cell) cell.push(entity);
    else this.cells.set(key, [entity]);
  }

  query(x: number, y: number, radius: number): T[] {
    const result: T[] = [];
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const cell = this.cells.get(`${cx}:${cy}`);
        if (cell) result.push(...cell);
      }
    }
    return result;
  }

  private key(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)}:${Math.floor(y / this.cellSize)}`;
  }
}
