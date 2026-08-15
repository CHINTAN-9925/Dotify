export interface WireBlob {
  id: string; kind: string; name: string;
  x: number; y: number; velocityX: number; velocityY: number;
  mass: number; radius: number; color: string; cracks: number;
  cooldown: number; chain: number; lastProcessedSequence: number; dead: boolean;
}

export interface WireFood { id: number; clusterId: number; x: number; y: number; color: string }
export interface WirePrime {
  id: number; clusterId: number; x: number; y: number; radius: number;
  charge: number; armed: boolean; fuse: number; cooldown: number;
}
export interface WireAftershock {
  id: number; primeId: number; x: number; y: number; radius: number;
  timeRemaining: number; duration: number;
}
export interface ArenaWireState {
  tick: number; configVersion: string; seed: number;
  blobs: Map<string, WireBlob>;
  food: WireFood[];
  primes: WirePrime[];
  aftershocks: WireAftershock[];
}
