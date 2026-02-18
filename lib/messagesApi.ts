import { supabase } from "@/lib/supabaseClient";
import { sendSmsMms } from "@/lib/twilioApi";

export type ConversationRow = {
  id: string;
  patient_contact_id: string; // legacy one-to-one
  unread_count: number | null;
  status: string | null;
  created_at: string;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  sender: "patient" | "staff" | "system";
  text: string | null;
  created_at: string;
  type: "text" | "prescriptionUpdate" | "attachment" | "system" | null;
};

function normalizeDigits(s?: string | null): string | null {
  if (!s) return null;
  const d = s.replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d;
}

async function findExistingConversationForContact(contactId: string): Promise<ConversationRow | null> {
  try {
    // Load contact details to derive placeholder slug for per-destination unknown threads
    const { data: c } = await supabase
      .from('contacts')
      .select('id,slug,phone,rx_notify_phone,pharmacy_location')
      .eq('id', contactId)
      .maybeSingle();
    const phone = (c as any)?.phone as string | undefined;
    const rx = (c as any)?.rx_notify_phone as string | undefined;
    const loc = (c as any)?.pharmacy_location as 'Mount Vernon' | 'New Rochelle' | undefined;
    const digits = normalizeDigits(phone) || normalizeDigits(rx);
    if (!digits || !loc) return null;
    // Find location's Twilio number last4
    const { data: ls } = await supabase
      .from('location_settings')
      .select('twilio_from_number')
      .eq('location', loc)
      .maybeSingle();
    const last4 = ((ls as any)?.twilio_from_number || '').replace(/\D/g, '').slice(-4);
    if (!last4) return null;
    const placeholderSlug = `tel-${digits}-to${last4}`;
    // Resolve placeholder contact id
    const { data: ph } = await supabase
      .from('contacts')
      .select('id')
      .eq('slug', placeholderSlug)
      .maybeSingle();
    const placeholderId = (ph as any)?.id as string | undefined;
    if (!placeholderId) return null;
    // 1) Check for a conversation already linked to the placeholder as patient
    const { data: conv1 } = await supabase
      .from('conversations')
      .select('id,patient_contact_id,unread_count,status,created_at')
      .eq('patient_contact_id', placeholderId)
      .maybeSingle();
    if (conv1) return conv1 as any;
    // 2) Check conversations where the placeholder is a participant
    const { data: parts } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('contact_id', placeholderId)
      .limit(1);
    const convId = (parts as any[])?.[0]?.conversation_id as string | undefined;
    if (!convId) return null;
    const { data: conv } = await supabase
      .from('conversations')
      .select('id,patient_contact_id,unread_count,status,created_at')
      .eq('id', convId)
      .maybeSingle();
    if (conv) return conv as any;
  } catch {}
  return null;
}

async function migrateMatchingPlaceholderToSaved(contactId: string): Promise<void> {
  try {
    const { data: c } = await supabase
      .from('contacts')
      .select('id,slug,phone,rx_notify_phone,pharmacy_location')
      .eq('id', contactId)
      .maybeSingle();
    const phone = (c as any)?.phone as string | undefined;
    const rx = (c as any)?.rx_notify_phone as string | undefined;
    const loc = (c as any)?.pharmacy_location as 'Mount Vernon' | 'New Rochelle' | undefined;
    const digits = normalizeDigits(phone) || normalizeDigits(rx);
    if (!digits || !loc) return;
    const { data: ls } = await supabase
      .from('location_settings')
      .select('twilio_from_number')
      .eq('location', loc)
      .maybeSingle();
    const last4 = ((ls as any)?.twilio_from_number || '').replace(/\D/g, '').slice(-4);
    if (!last4) return;
    const placeholderSlug = `tel-${digits}-to${last4}`;
    // Migrate any placeholder conversation to saved contact
    const { data: ph } = await supabase.from('contacts').select('id').eq('slug', placeholderSlug).maybeSingle();
    const placeholderId = (ph as any)?.id as string | undefined;
    if (!placeholderId) return;
    await supabase.from('conversations').update({ patient_contact_id: contactId }).eq('patient_contact_id', placeholderId);
    // Ensure participant link
    const { data: convs } = await supabase.from('conversations').select('id').eq('patient_contact_id', contactId);
    for (const row of ((convs as any[]) || [])) {
      try {
        await supabase.from('conversation_participants').insert({ conversation_id: row.id, contact_id: contactId });
      } catch {}
    }
  } catch {}
}

export async function createConversation(patientContactId: string, status?: string): Promise<ConversationRow> {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ patient_contact_id: patientContactId, status: status ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as ConversationRow;
}

export async function listConversations(): Promise<ConversationRow[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id,patient_contact_id,unread_count,status,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ConversationRow[];
}

export async function ensureConversationForSlug(slug: string, status: string = "new"): Promise<ConversationRow | null> {
  // Find contact by slug
  const contact = await supabase.from("contacts").select("id").eq("slug", slug).maybeSingle();
  if (contact.error) throw contact.error;
  const contactId = contact.data?.id as string | undefined;
  if (!contactId) return null;
  // If a placeholder thread exists for this contact+location, migrate it to the saved contact
  await migrateMatchingPlaceholderToSaved(contactId);
  // Find existing conversation
  const existing = await supabase.from("conversations").select("id,patient_contact_id,unread_count,status,created_at").eq("patient_contact_id", contactId).maybeSingle();
  if (!existing.error && existing.data) {
    const conv = existing.data as ConversationRow;
    // Ensure participants row for 1:1 conversations as well
    try {
      const ins = await supabase
        .from("conversation_participants")
        .insert({ conversation_id: conv.id, contact_id: contactId });
      if (ins.error && (ins.error as any).code !== '23505') throw ins.error;
    } catch {}
    return conv;
  }
  // Create (avoid select-on-insert to prevent SELECT RLS blocks). Generate id client-side.
  const clientId = crypto.randomUUID();
  const created = await supabase.from("conversations").insert({ id: clientId, patient_contact_id: contactId, status });
  if (created.error) throw created.error;
  const conv = { id: clientId, patient_contact_id: contactId, unread_count: 0, status, created_at: new Date().toISOString() } as ConversationRow;
  // Ensure participants row for 1:1 conversations
  try {
    const ins2 = await supabase
      .from("conversation_participants")
      .insert({ conversation_id: conv.id, contact_id: contactId });
    if (ins2.error && (ins2.error as any).code !== '23505') throw ins2.error;
  } catch {}
  return conv;
}

export async function ensureConversationForContactId(contactId: string, status: string = "new"): Promise<ConversationRow> {
  // Proactively migrate any matching placeholder unknown thread to the saved contact
  await migrateMatchingPlaceholderToSaved(contactId);
  // Reuse any existing placeholder-based conversation (post-migration) to avoid creating duplicates
  try {
    const migrated = await findExistingConversationForContact(contactId);
    if (migrated) return migrated;
  } catch {}
  // If inbound placeholder conversation still exists, relink it to this patient and remove dupes
  try {
    const { data: convs } = await supabase
      .from('conversations')
      .select('id, patient:contacts!conversations_patient_contact_id_fkey(slug)')
      .eq('patient_contact_id', contactId);
    for (const row of ((convs as any[]) || [])) {
      const pslug = row?.patient?.slug as string | undefined;
      if (pslug && pslug.startsWith('tel-')) {
        // Replace patient with the saved contact id
        await supabase.from('conversations').update({ patient_contact_id: contactId }).eq('id', row.id);
      }
    }
  } catch {}
  const existing = await supabase.from("conversations").select("id,patient_contact_id,unread_count,status,created_at").eq("patient_contact_id", contactId).maybeSingle();
  if (!existing.error && existing.data) return existing.data as ConversationRow;
  // Create without select; client-generated id
  const clientId = crypto.randomUUID();
  const created = await supabase.from("conversations").insert({ id: clientId, patient_contact_id: contactId, status });
  if (created.error) throw created.error;
  const conv = { id: clientId, patient_contact_id: contactId, unread_count: 0, status, created_at: new Date().toISOString() } as ConversationRow;
  // Ensure participants row for 1:1 conversations
  await supabase.from("conversation_participants").insert({ conversation_id: conv.id, contact_id: contactId }).then(() => { /* ignore errors on conflict */ });
  return conv;
}

export async function deleteConversation(conversationId: string): Promise<void> {
  // Delete messages and participants first (in case FKs aren't ON DELETE CASCADE)
  const delMsgs = await supabase.from("messages").delete().eq("conversation_id", conversationId);
  if (delMsgs.error) throw delMsgs.error;
  const delParts = await supabase.from("conversation_participants").delete().eq("conversation_id", conversationId);
  if (delParts.error) throw delParts.error;
  const delConv = await supabase.from("conversations").delete().eq("id", conversationId);
  if (delConv.error) throw delConv.error;
}

export type ConversationWithPatient = ConversationRow & {
  patient: { id: string; slug: string | null; name: string; avatar_url: string | null; contact_type?: 'patient' | 'provider' | 'social_worker' };
  display_name?: string; // derived client-side for robust search
  last_message_text?: string | null;
  last_message_at?: string | null;
};

export type ConversationWithParticipants = ConversationRow & {
  participants: Array<{ id: string; slug: string | null; name: string; avatar_url: string | null }>;
  patient?: { id: string; slug: string | null; name: string | null; avatar_url: string | null } | null;
  last_message_text?: string | null;
  last_message_at?: string | null;
  pharmacy_location?: 'Mount Vernon' | 'New Rochelle' | null;
  location_hint?: 'Mount Vernon' | 'New Rochelle' | null;
};

export async function listConversationsWithPatient(): Promise<ConversationWithPatient[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*, last_message_at, patient:contacts!conversations_patient_contact_id_fkey(id,slug,name,avatar_url,contact_type)")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as any[]).map(row => ({
    id: row.id,
    patient_contact_id: row.patient_contact_id,
    unread_count: row.unread_count,
    status: row.status,
    created_at: row.created_at,
    patient: row.patient,
    last_message_text: null,
    last_message_at: row.last_message_at ?? null,
  }));
}

export async function listConversationsWithParticipants(): Promise<ConversationWithParticipants[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*, last_message_at, location_hint, participants:conversation_participants(contact:contacts(id,slug,name,avatar_url,phone,rx_notify_phone,pharmacy_location,contact_type)), patient:contacts!conversations_patient_contact_id_fkey(id,slug,name,avatar_url,phone,rx_notify_phone,pharmacy_location,contact_type)")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as any[]).map(row => ({
    id: row.id,
    patient_contact_id: row.patient_contact_id,
    unread_count: row.unread_count,
    status: row.status,
    created_at: row.created_at,
    participants: (row.participants ?? []).map((p: any) => p.contact),
    patient: row.patient ?? null,
    pharmacy_location: row.patient?.pharmacy_location || (row.participants?.[0]?.contact?.pharmacy_location ?? null),
    location_hint: row.location_hint ?? null,
    last_message_text: null,
    last_message_at: row.last_message_at ?? null,
  }));
}

export async function createGroupConversation(contactIds: string[], status: string = "broadcast"): Promise<{ conversation_id: string }> {
  if (!Array.isArray(contactIds) || contactIds.length === 0) throw new Error('No participants provided');
  // Create a new conversation row to represent the broadcast thread. Use first contact as representative patient for RLS.
  const clientId = crypto.randomUUID();
  const first = contactIds[0];
  const ins = await supabase.from('conversations').insert({ id: clientId, status: status || 'broadcast', patient_contact_id: first });
  if (ins.error) throw ins.error;
  const convId = clientId;
  // Insert participants (skip already present)
  const unique = Array.from(new Set(contactIds));
  try {
    const { data: existing } = await supabase
      .from('conversation_participants')
      .select('contact_id')
      .eq('conversation_id', convId);
    const present = new Set<string>(((existing as any[]) || []).map(r => r.contact_id as string));
    const toInsert = unique
      .filter(id => !present.has(id))
      .map(id => ({ conversation_id: convId, contact_id: id }));
    if (toInsert.length > 0) {
      const add = await supabase.from('conversation_participants').insert(toInsert, { defaultToNull: false });
      if (add.error && (add.error as any).code !== '23505' && (add.error as any).code !== '409') throw add.error;
    }
  } catch {}
  return { conversation_id: convId };
}

// Broadcast helpers
export function getBroadcastTitleFromStatus(status: string | null | undefined): string | null {
  if (!status) return null;
  if (status === 'broadcast') return null;
  if (status.startsWith('broadcast:')) return status.slice('broadcast:'.length).trim() || null;
  return null;
}

export async function setBroadcastTitle(conversationId: string, title: string): Promise<void> {
  const status = (title && title.trim().length > 0) ? `broadcast:${title.trim()}` : 'broadcast';
  const { error } = await supabase.from('conversations').update({ status }).eq('id', conversationId);
  if (error) throw error;
}

export async function getConversationParticipants(conversationId: string): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await supabase
    .from('conversation_participants')
    .select('contact:contacts(id,name)')
    .eq('conversation_id', conversationId);
  if (error) throw error;
  return ((data as any[]) || []).map(r => ({ id: r.contact.id as string, name: r.contact.name as string }));
}

export async function setBroadcastParticipants(conversationId: string, desiredContactIds: string[]): Promise<void> {
  // Fetch existing
  const { data, error } = await supabase
    .from('conversation_participants')
    .select('contact_id')
    .eq('conversation_id', conversationId);
  if (error) throw error;
  const existing = new Set<string>(((data as any[]) || []).map(r => r.contact_id as string));
  const desired = new Set<string>(desiredContactIds);
  const toAdd = Array.from(desired).filter(id => !existing.has(id)).map(id => ({ conversation_id: conversationId, contact_id: id }));
  const toRemove = Array.from(existing).filter(id => !desired.has(id));
  if (toAdd.length > 0) {
    const ins = await supabase.from('conversation_participants').insert(toAdd, { defaultToNull: false });
    if (ins.error && (ins.error as any).code !== '23505' && (ins.error as any).code !== '409') throw ins.error;
  }
  if (toRemove.length > 0) {
    // Attempt removal; ignore if policy blocks
    try {
      await supabase.from('conversation_participants').delete().eq('conversation_id', conversationId).in('contact_id', toRemove);
    } catch {}
  }
}

export async function fetchConversationWithParticipantsById(id: string): Promise<ConversationWithParticipants | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*, location_hint, participants:conversation_participants(contact:contacts(id,slug,name,avatar_url,phone,rx_notify_phone,pharmacy_location)), patient:contacts!conversations_patient_contact_id_fkey(id,slug,name,avatar_url,phone,rx_notify_phone,pharmacy_location)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null as any;
  const row: any = data;
  return {
    id: row.id,
    patient_contact_id: row.patient_contact_id,
    unread_count: row.unread_count,
    status: row.status,
    created_at: row.created_at,
    participants: (row.participants ?? []).map((p: any) => p.contact),
    patient: row.patient ?? null,
    pharmacy_location: row.patient?.pharmacy_location || (row.participants?.[0]?.contact?.pharmacy_location ?? null),
    location_hint: row.location_hint ?? null,
    last_message_text: null,
    last_message_at: null,
  };
}

export async function fetchConversationWithPatientById(id: string): Promise<ConversationWithPatient | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*, patient:contacts!conversations_patient_contact_id_fkey(id,slug,name,avatar_url)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row: any = data;
  return {
    id: row.id,
    patient_contact_id: row.patient_contact_id,
    unread_count: row.unread_count,
    status: row.status,
    created_at: row.created_at,
    patient: row.patient,
  };
}

export type RealtimeUnsubscribe = () => void;

export function subscribeToMessages(conversationId: string, onInsert: (msg: MessageRow) => void): RealtimeUnsubscribe {
  console.log(`🔔 Subscribing to messages for conversation: ${conversationId}`);
  const channel = supabase
    .channel(`messages_${conversationId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
      const incoming = payload.new as MessageRow;
      console.log(`🔔 Received realtime message:`, incoming);
      if (incoming.type === 'attachment') {
        console.log(`📎 Realtime attachment message: ${incoming.text}`);
      }
      // Drop duplicate optimistic message if it exists
      onInsert(incoming);
    })
    .subscribe();
  return () => { 
    console.log(`🔔 Unsubscribing from messages for conversation: ${conversationId}`);
    supabase.removeChannel(channel); 
  };
}

export function subscribeToAllMessages(onInsert: (msg: MessageRow) => void): RealtimeUnsubscribe {
  const channel = supabase
    .channel('messages_all')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      onInsert(payload.new as MessageRow);
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

export function subscribeToConversations(onInsert: (row: ConversationRow) => void, onUpdate?: (row: ConversationRow) => void): RealtimeUnsubscribe {
  const channel = supabase
    .channel('conversations_all')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, (payload) => {
      onInsert(payload.new as ConversationRow);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, (payload) => {
      onUpdate?.(payload.new as ConversationRow);
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

export function subscribeToParticipants(onInsert: (payload: { conversation_id: string }) => void): RealtimeUnsubscribe {
  const channel = supabase
    .channel('participants_all')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_participants' }, (payload) => {
      onInsert({ conversation_id: (payload.new as any).conversation_id as string });
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

export async function resetUnread(conversationId: string): Promise<void> {
  // SPECIFIC DEBUG: Track resets for the problematic conversation
  const isProblematicConv = conversationId === 'd67bef5b-d3d8-4474-8e87-01a33860ffad';
  if (isProblematicConv) {
    console.log('🔥 PROBLEMATIC CONVERSATION RESET!!! d67bef5b');
    console.trace('🔥 WHO IS CALLING resetUnread for d67bef5b:');
  } else {
    console.log('🚨 resetUnread called for conversation:', conversationId?.slice(0, 8));
  }
  
  // Try RPC first (if present). If missing or fails, fall back to a direct UPDATE.
  try {
    const { error } = await supabase.rpc('reset_conversation_unread', { conv_id: conversationId });
    if (!error) {
      console.log(isProblematicConv ? '🔥 PROBLEMATIC CONV RESET VIA RPC' : '✅ resetUnread successful via RPC');
      return;
    }
  } catch {}
  // Fallback: directly zero unread_count on the conversation
  try {
    await supabase.from('conversations').update({ unread_count: 0 }).eq('id', conversationId);
    console.log(isProblematicConv ? '🔥 PROBLEMATIC CONV RESET VIA UPDATE' : '✅ resetUnread successful via direct UPDATE');
  } catch {}
}

export async function addMessage(
  conversationId: string,
  sender: MessageRow["sender"],
  text: string,
  type: MessageRow["type"] = "text"
): Promise<MessageRow> {
  // If this is a broadcast thread, fan out into each participant's 1:1 conversation
  try {
    const { data: conv } = await supabase
      .from('conversations')
      .select('status')
      .eq('id', conversationId)
      .maybeSingle();
    const status = (conv as any)?.status as string | undefined;
    if (status === 'broadcast') {
      const { data: parts } = await supabase
        .from('conversation_participants')
        .select('contact_id')
        .eq('conversation_id', conversationId);
      for (const row of ((parts as any[]) || [])) {
        const contactId = row.contact_id as string;
        try {
          const ensured = await ensureConversationForContactId(contactId);
          await supabase.from('messages').insert({ conversation_id: ensured.id, sender, text, type });
        } catch {}
      }
      // Also drop a small marker in the broadcast thread for history (optional)
      try { await supabase.from('messages').insert({ conversation_id: conversationId, sender: 'system', text: text, type: 'system' }); } catch {}
      return { id: `local-${Date.now()}`, conversation_id: conversationId, sender: 'system', text, created_at: new Date().toISOString(), type: 'system' } as MessageRow;
    }
  } catch {}
  try {
    const { error } = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, sender, text, type });
    if (error) throw error;
  } catch {
    // Fallback to RPC (will enforce can_access_conversation on server)
    try { await supabase.rpc('log_staff_message', { p_conversation_id: conversationId, p_text: text, p_type: type || 'text' }); } catch {}
  }
  // We intentionally don't select the row back to avoid SELECT RLS failures.
  // Realtime subscription will deliver the inserted row and update the UI.
  return { id: `local-${Date.now()}`, conversation_id: conversationId, sender, text, created_at: new Date().toISOString(), type } as MessageRow;
}

export async function listMessages(conversationId: string): Promise<MessageRow[]> {
  console.log(`📥 Fetching messages for conversation: ${conversationId}`);
  const { data, error } = await supabase
    .from("messages")
    .select("id,conversation_id,sender,text,created_at,type")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error(`❌ Error fetching messages:`, error);
    throw error;
  }
  // Client-side collapse of identical patient texts within 3s window (guards stale duplicates)
  const rows = (data ?? []) as MessageRow[];
  console.log(`📥 Fetched ${rows.length} messages for conversation ${conversationId}`);
  
  // Log attachment messages specifically
  const attachmentMessages = rows.filter(m => m.type === 'attachment');
  if (attachmentMessages.length > 0) {
    console.log(`📎 Found ${attachmentMessages.length} attachment messages:`, attachmentMessages.map(m => ({ id: m.id, text: m.text, created_at: m.created_at })));
  }
  
  const collapsed: MessageRow[] = [];
  for (const m of rows) {
    if (m.sender === 'patient') {
      const last = collapsed[collapsed.length - 1];
      if (last && last.sender === 'patient' && (last.text || '') === (m.text || '') && Math.abs(new Date(m.created_at).getTime() - new Date(last.created_at).getTime()) <= 3000) {
        continue;
      }
    }
    collapsed.push(m);
  }
  return collapsed;
}

// Fetch latest message per conversation id
export async function fetchLastMessages(
  conversationIds: string[]
): Promise<Record<string, { text: string | null; created_at: string }>> {
  if (conversationIds.length === 0) return {};
  const { data, error } = await supabase
    .from('messages')
    .select('conversation_id,text,created_at')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const latest: Record<string, { text: string | null; created_at: string }> = {};
  for (const row of (data as any[]) || []) {
    const cid = row.conversation_id as string;
    if (!(cid in latest)) {
      latest[cid] = { text: row.text ?? null, created_at: row.created_at };
    }
  }
  return latest;
}

// Twilio helper: send outbound to all participant phones for a conversation
export async function sendOutboundViaTwilio(conversationId: string, body?: string, mediaUrls?: string[]) {
  const phones = await collectPhonesForConversation(conversationId);
  if (!phones.length) return { results: [] as Array<{ sid: string; status: string; to: string }>, to: [] as string[] };
  // Determine sender based on current user's active location settings
  let fromNumber: string | undefined;
  try {
    const { data: loc } = await supabase
      .from('user_active_locations')
      .select('selected_location')
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id || '')
      .maybeSingle();
    const selected = (loc as any)?.selected_location as string | undefined;
    // Always derive from conversation for routing correctness
    const derivedLocation = await getConversationLocation(conversationId);
    const effectiveLocation = derivedLocation || (selected && selected !== 'Admin' ? selected : undefined);
    if (effectiveLocation) {
      const { data: ls } = await supabase
        .from('location_settings')
        .select('twilio_from_number')
        .eq('location', effectiveLocation)
        .maybeSingle();
      fromNumber = (ls as any)?.twilio_from_number || undefined;
    }
  } catch {}
  const data = await sendSmsMms({ to: phones, body, mediaUrls, conversationId, fromNumber });
  return { results: data.results, to: phones };
}

// Robustly assemble deliverable phone numbers for a conversation
async function collectPhonesForConversation(conversationId: string): Promise<string[]> {
  const acc = new Set<string>();

  // 1) Preferred: use expanded conversation with participants and patient
  try {
    const full = await fetchConversationWithParticipantsById(conversationId);
    if (full) {
      for (const p of (full.participants || []) as any[]) {
        const phone = p?.phone || p?.rx_notify_phone;
        if (typeof phone === 'string' && phone.trim()) acc.add(phone.trim());
      }
      const patientPhone = (full.patient as any)?.phone || (full.patient as any)?.rx_notify_phone;
      if (typeof patientPhone === 'string' && patientPhone.trim()) acc.add(patientPhone.trim());
    }
  } catch {}

  if (acc.size > 0) return Array.from(acc);

  // 2) Fallback: look up patient_contact_id -> contacts
  try {
    const conv = await supabase.from('conversations').select('patient_contact_id').eq('id', conversationId).maybeSingle();
    const patientId = (conv.data as any)?.patient_contact_id as string | undefined;
    if (patientId) {
      const { data } = await supabase.from('contacts').select('phone, rx_notify_phone').eq('id', patientId).maybeSingle();
      const a = (data as any)?.phone as string | null | undefined;
      const b = (data as any)?.rx_notify_phone as string | null | undefined;
      if (a && a.trim()) acc.add(a.trim());
      if (b && b.trim()) acc.add(b.trim());
    }
  } catch {}

  if (acc.size > 0) return Array.from(acc);

  // 3) Fallback: query participants table directly and join contacts
  try {
    const { data } = await supabase
      .from('conversation_participants')
      .select('contact:contacts(phone, rx_notify_phone)')
      .eq('conversation_id', conversationId);
    for (const row of (data as any[]) || []) {
      const a = row?.contact?.phone as string | null | undefined;
      const b = row?.contact?.rx_notify_phone as string | null | undefined;
      if (a && a.trim()) acc.add(a.trim());
      if (b && b.trim()) acc.add(b.trim());
    }
  } catch {}

  return Array.from(acc);
}

// Resolve the intended location for a conversation based on patient/participants
async function getConversationLocation(conversationId: string): Promise<'Mount Vernon' | 'New Rochelle' | null> {
  try {
    const { data } = await supabase
      .from('conversations')
      .select('patient:contacts!conversations_patient_contact_id_fkey(pharmacy_location)')
      .eq('id', conversationId)
      .maybeSingle();
    const loc = (data as any)?.patient?.pharmacy_location as string | undefined;
    if (loc === 'Mount Vernon' || loc === 'New Rochelle') return loc as any;
  } catch {}
  try {
    const { data } = await supabase
      .from('conversation_participants')
      .select('contact:contacts(pharmacy_location)')
      .eq('conversation_id', conversationId);
    for (const row of ((data as any[]) || [])) {
      const loc = row?.contact?.pharmacy_location as string | undefined;
      if (loc === 'Mount Vernon' || loc === 'New Rochelle') return loc as any;
    }
  } catch {}
  // Fallback: infer from placeholder slug suffix `tel-<last10>-to<last4>` by matching location_settings numbers
  try {
    // Pull patient and first participant slugs to inspect
    const { data } = await supabase
      .from('conversations')
      .select('patient:contacts!conversations_patient_contact_id_fkey(slug), participants:conversation_participants(contact:contacts(slug))')
      .eq('id', conversationId)
      .maybeSingle();
    const slugs: string[] = [];
    const pSlug = (data as any)?.patient?.slug as string | null | undefined;
    if (pSlug) slugs.push(pSlug);
    const partSlug = ((data as any)?.participants?.[0]?.contact?.slug) as string | null | undefined;
    if (partSlug) slugs.push(partSlug);
    const suffixMatch = slugs.map(s => (s || '').match(/-to(\d{4})$/)).find(Boolean) as RegExpMatchArray | undefined;
    const last4 = suffixMatch?.[1] || null;
    if (last4) {
      const { data: ls } = await supabase.from('location_settings').select('location, twilio_from_number');
      for (const row of ((ls as any[]) || [])) {
        const num = (row?.twilio_from_number || '') as string;
        const tail = num.replace(/\D/g, '').slice(-4);
        if (tail === last4) {
          const loc = row.location as 'Mount Vernon' | 'New Rochelle' | undefined;
          if (loc === 'Mount Vernon' || loc === 'New Rochelle') return loc;
        }
      }
    }
  } catch {}
  return null;
}


