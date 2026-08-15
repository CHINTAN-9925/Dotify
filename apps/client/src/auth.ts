import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const supabase = url && key ? createClient(url, key) : undefined;

export async function getAccessToken(): Promise<string | undefined> {
  if (!supabase) return undefined;
  let session = (await supabase.auth.getSession()).data.session;
  if (!session) {
    const result = await supabase.auth.signInAnonymously();
    if (result.error) throw result.error;
    session = result.data.session;
  }
  return session?.access_token;
}

export async function linkGoogleAccount(): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase.auth.linkIdentity({ provider: 'google' });
  if (error) throw error;
}
