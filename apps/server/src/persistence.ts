import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Blob } from '@split/simulation';

let database: SupabaseClient | undefined;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  database = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

export async function checkpointSession(roomId: string, userId: string, blob: Blob, reason: string): Promise<void> {
  if (!database || userId.startsWith('dev-')) return;
  const idempotencyKey = `${roomId}:${userId}:${Math.floor(Date.now() / 60_000)}`;
  const { error } = await database.from('play_sessions').upsert({
    idempotency_key: idempotencyKey,
    user_id: userId,
    room_id: roomId,
    mass: Math.floor(blob.mass),
    best_chain: blob.chain,
    reason,
    updated_at: new Date().toISOString()
  }, { onConflict: 'idempotency_key' });
  if (error) throw error;
}
