import { supabase } from "@/lib/supabaseClient";
import { PostgrestError } from "@supabase/supabase-js";

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

export async function ensureProfile(role: string = "pharmacist", pharmacy_location?: string) {
  const user = await getCurrentUser();
  if (!user) return;
  const { data } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (!data) {
    await supabase.from("profiles").insert({ id: user.id, role, pharmacy_location: pharmacy_location ?? null });
  }
}

export async function signOut() {
  await supabase.auth.signOut();
  try { localStorage.removeItem('pc_active_location'); } catch (error) {
    console.warn('Failed to remove active location from localStorage:', error);
  }
}

// Username/password + location login via Edge Function
export async function signInWithLocation(params: { location: 'Mount Vernon' | 'New Rochelle' | 'Admin'; username: string; password: string }) {
  const { username, password, location } = params;
  
  // Convert username to email format for Supabase compatibility
  const email = username.includes('@') ? username : `${username}@narayanpharmacy.com`;
  
  // 1) Sign in with password via Supabase Auth
  const { data: sessionData, error: signErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signErr) throw signErr as unknown as PostgrestError;
  // 2) Call RPC to set active location using the user session
  const { data: loc, error: rpcErr } = await supabase.rpc('set_active_location', { selected: location });
  if (rpcErr) throw rpcErr as unknown as PostgrestError;
  try { localStorage.setItem('pc_active_location', String(loc)); } catch (error) {
    console.warn('Failed to save active location to localStorage:', error);
  }
  return { session: sessionData.session, activeLocation: loc as any } as { session: any; activeLocation: 'Mount Vernon' | 'New Rochelle' | 'Admin' };
}

// Set active location for current user after validating against server-side profile
export async function setActiveLocation(selected: 'Mount Vernon' | 'New Rochelle' | 'Admin'): Promise<'Mount Vernon' | 'New Rochelle' | 'Admin'> {
  const { data, error } = await supabase.rpc('set_active_location', { selected });
  if (error) throw error;
  try { localStorage.setItem('pc_active_location', String(data)); } catch (error) {
    console.warn('Failed to save active location to localStorage:', error);
  }
  return data as any;
}

// Get current active location (if set)
export async function getActiveLocation(): Promise<string | null> {
  // Fast path from cache to avoid UI flicker
  try {
    const cached = localStorage.getItem('pc_active_location');
    if (cached) return cached;
  } catch (error) {
    console.warn('Failed to read active location from localStorage:', error);
  }
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('user_active_locations')
    .select('selected_location')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) return null;
  const selected = (data as any)?.selected_location ?? null;
  try { if (selected) localStorage.setItem('pc_active_location', String(selected)); } catch (error) {
    console.warn('Failed to save active location to localStorage:', error);
  }
  return selected;
}


