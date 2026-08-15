import { Client, type Room } from '@colyseus/sdk';
import { PROTOCOL_VERSION } from '@split/config';
import { MESSAGE, type GameEvent, type PlayerInput } from '@split/protocol';
import { getAccessToken } from './auth';
import type { ArenaWireState } from './types';

export interface ReadyMessage { playerId: string; tickRate: number; protocolVersion: number }

export class GameConnection {
  room?: Room<ArenaWireState>;
  playerId = '';
  onEvent: (event: GameEvent) => void = () => undefined;
  onStatus: (status: string) => void = () => undefined;
  private client: Client;
  private displayName = 'drifter';

  constructor(endpoint = import.meta.env.VITE_GAME_SERVER_URL ?? 'http://localhost:2567') {
    this.client = new Client(endpoint);
  }

  async connect(displayName: string): Promise<void> {
    this.displayName = displayName;
    this.onStatus('connecting');
    const accessToken = await getAccessToken();
    const room = await this.client.joinOrCreate<ArenaWireState>('arena', {
      protocolVersion: PROTOCOL_VERSION, accessToken, displayName, skinId: 'default'
    });
    this.bind(room);
  }

  sendInput(input: PlayerInput): void {
    if (this.room?.connection.isOpen) this.room.send(MESSAGE.input, input);
  }

  private bind(room: Room<ArenaWireState>): void {
    this.room = room;
    room.onMessage(MESSAGE.ready, (message: ReadyMessage) => {
      this.playerId = message.playerId;
      this.onStatus('online');
    });
    room.onMessage(MESSAGE.event, (event: GameEvent) => this.onEvent(event));
    room.onLeave(() => {
      this.onStatus('reconnecting');
      void this.reconnect(room.reconnectionToken);
    });
    room.onError((code, message) => this.onStatus(`error ${code}: ${message}`));
  }

  private async reconnect(token: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { this.bind(await this.client.reconnect<ArenaWireState>(token)); return; }
      catch { await new Promise(resolve => window.setTimeout(resolve, 750)); }
    }
    this.onStatus('finding new arena');
    try { await this.connect(this.displayName); }
    catch { this.onStatus('disconnected'); }
  }
}
