import { Client, CloseCode, Room } from 'colyseus';
import { CONFIG_VERSION, GAME_CONFIG, PROTOCOL_VERSION } from '@split/config';
import { isPlayerInput, MESSAGE, type JoinOptions, type PlayerInput } from '@split/protocol';
import { SimulationWorld } from '@split/simulation';
import { authenticate, type PlayerIdentity } from './auth.js';
import { checkpointSession } from './persistence.js';
import { ArenaState, syncState } from './state.js';

interface ClientAuth extends PlayerIdentity { playerId: string }

export class ArenaRoom extends Room<{ state: ArenaState }> {
  override maxClients = GAME_CONFIG.arenaPopulation;
  private world!: SimulationWorld;
  private checkpointTimer = 0;
  private readonly respawnAt = new Map<string, number>();

  override onCreate(): void {
    this.autoDispose = false;
    this.patchRate = 1000 / GAME_CONFIG.patchRate;
    this.world = new SimulationWorld(Math.floor(Math.random() * 0xffffffff));
    const state = new ArenaState();
    state.configVersion = CONFIG_VERSION; state.seed = this.world.seed;
    this.setState(state);
    this.fillBots();
    syncState(this.world, state);
    this.onMessage(MESSAGE.input, (client, payload: unknown) => this.receiveInput(client, payload));
    this.setSimulationInterval(() => this.updateWorld(), 1000 / GAME_CONFIG.tickRate);
  }

  override async onAuth(client: Client, options: JoinOptions): Promise<ClientAuth> {
    if (options.protocolVersion !== PROTOCOL_VERSION) throw new Error('upgrade_required');
    const identity = await authenticate(options, client.sessionId);
    return { ...identity, playerId: identity.userId };
  }

  override onJoin(client: Client, _options: JoinOptions, auth: ClientAuth): void {
    this.removeOneBot();
    if (!this.world.blobs.has(auth.playerId)) this.world.addPlayer(auth.playerId, auth.displayName);
    client.send(MESSAGE.ready, { playerId: auth.playerId, tickRate: GAME_CONFIG.tickRate, protocolVersion: PROTOCOL_VERSION });
    syncState(this.world, this.state);
  }

  override async onLeave(client: Client, code?: number): Promise<void> {
    const auth = client.auth as ClientAuth;
    if (code !== CloseCode.CONSENTED) {
      try { await this.allowReconnection(client, GAME_CONFIG.reconnectSeconds); return; }
      catch { /* grace expired */ }
    }
    const blob = this.world.blobs.get(auth.playerId);
    if (blob) await checkpointSession(this.roomId, auth.userId, blob, 'disconnect').catch(error => console.error('checkpoint_failed', error));
    this.world.removeBlob(auth.playerId);
    this.fillBots();
  }

  private receiveInput(client: Client, payload: unknown): void {
    if (!isPlayerInput(payload)) return;
    const auth = client.auth as ClientAuth;
    this.world.applyInput(auth.playerId, payload as PlayerInput);
  }

  private updateWorld(): void {
    this.world.step();
    for (const event of this.world.drainEvents()) {
      this.broadcast(MESSAGE.event, event);
      if (event.type === 'playerDied') this.respawnAt.set(event.playerId, this.world.tick + GAME_CONFIG.tickRate * 2);
    }
    for (const [id, tick] of this.respawnAt) {
      if (this.world.tick >= tick) { this.world.respawnBlob(id); this.respawnAt.delete(id); }
    }
    this.replaceDeadBots();
    syncState(this.world, this.state);

    this.checkpointTimer++;
    if (this.checkpointTimer >= GAME_CONFIG.checkpointSeconds * GAME_CONFIG.tickRate) {
      this.checkpointTimer = 0;
      for (const client of this.clients) {
        const auth = client.auth as ClientAuth;
        const blob = this.world.blobs.get(auth.playerId);
        if (blob) void checkpointSession(this.roomId, auth.userId, blob, 'periodic').catch(error => console.error('checkpoint_failed', error));
      }
    }
  }

  private fillBots(): void {
    const targetBots = Math.max(0, GAME_CONFIG.arenaPopulation - this.clients.length);
    let botCount = [...this.world.blobs.values()].filter(blob => blob.kind === 'bot').length;
    while (botCount++ < targetBots) this.world.addBot(`bot-${this.roomId}-${botCount}`);
  }

  private removeOneBot(): void {
    const bot = [...this.world.blobs.values()].find(blob => blob.kind === 'bot');
    if (bot) this.world.removeBlob(bot.id);
  }

  private replaceDeadBots(): void {
    for (const blob of [...this.world.blobs.values()]) if (blob.kind === 'bot' && blob.dead) this.world.removeBlob(blob.id);
    this.fillBots();
  }
}
