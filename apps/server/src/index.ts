import { defineRoom, defineServer } from 'colyseus';
import { Encoder } from '@colyseus/schema';
import cors from 'cors';
import type { Request, Response } from 'express';
import { ArenaRoom } from './arena-room.js';

// The initial arena contains 520 food entities plus the active population.
Encoder.BUFFER_SIZE = 128 * 1024;

const server = defineServer({
  rooms: { arena: defineRoom(ArenaRoom) },
  express: app => {
    app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }));
    app.get('/health', (_request: Request, response: Response) => response.json({ ok: true, region: process.env.GAME_REGION ?? 'local' }));
  }
});

server.listen(Number(process.env.PORT ?? 2567));
