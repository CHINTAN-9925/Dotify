import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { JoinOptions } from '@split/protocol';

export interface PlayerIdentity { userId: string; displayName: string; skinId: string; isGuest: boolean }

let supabase: SupabaseClient | undefined;
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url && serviceKey) supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

export async function authenticate(options: JoinOptions, sessionId: string): Promise<PlayerIdentity> {
  let user: User | null = null;
  if (supabase && options.accessToken) {
    const result = await supabase.auth.getUser(options.accessToken);
    if (result.error) throw new Error('invalid_access_token');
    user = result.data.user;
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error('authentication_required');
  }

  const safeName = sanitizeName(options.displayName ?? user?.user_metadata.display_name ?? 'drifter');
  return {
    userId: user?.id ?? `dev-${sessionId}`,
    displayName: safeName,
    skinId: typeof options.skinId === 'string' ? options.skinId.slice(0, 40) : 'default',
    isGuest: user?.is_anonymous ?? true
  };
}

function sanitizeName(name: string): string {
  const normalized = name.normalize('NFKC').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 20);
  return normalized || 'drifter';
}
