import { PROTOCOL_VERSION } from '@split/config';

export const MESSAGE = {
  input: 'input',
  event: 'event',
  ready: 'ready',
  error: 'error'
} as const;

export interface PlayerInput {
  protocolVersion: number;
  sequence: number;
  directionX: number;
  directionY: number;
  burstPressed: boolean;
}

export interface JoinOptions {
  protocolVersion: number;
  accessToken?: string;
  displayName?: string;
  skinId?: string;
}

export type GameEvent =
  | { type: 'burst'; id: number; tick: number; ownerId: string; x: number; y: number; color: string; seed: number; count: number }
  | { type: 'foodPopped'; id: number; tick: number; ownerId: string; foodId: number; x: number; y: number; color: string; seed: number }
  | { type: 'blobCracked'; id: number; tick: number; ownerId: string; targetId: string; x: number; y: number; cracks: number; hitsToPop: number }
  | { type: 'blobShattered'; id: number; tick: number; ownerId: string; targetId: string; x: number; y: number; color: string; seed: number }
  | { type: 'playerDied'; id: number; tick: number; playerId: string; cause: 'eaten' | 'shattered' }
  | { type: 'upgradeRequired'; id: number; tick: number; requiredVersion: number };

export function isPlayerInput(value: unknown): value is PlayerInput {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.protocolVersion === PROTOCOL_VERSION &&
    Number.isSafeInteger(v.sequence) && (v.sequence as number) >= 0 &&
    typeof v.directionX === 'number' && Number.isFinite(v.directionX) && Math.abs(v.directionX) <= 1.001 &&
    typeof v.directionY === 'number' && Number.isFinite(v.directionY) && Math.abs(v.directionY) <= 1.001 &&
    typeof v.burstPressed === 'boolean';
}
