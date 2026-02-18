import { supabase } from '@/lib/supabaseClient';
import { sendOutboundViaTwilio } from '@/lib/messagesApi';

export type Broadcast = {
  id: string;
  name: string;
  location: 'Mount Vernon' | 'New Rochelle';
  created_at: string;
  archived_at: string | null;
  member_count?: number;
  last_sent_at?: string | null;
};

export async function createBroadcast(name: string, location: 'Mount Vernon' | 'New Rochelle'): Promise<Broadcast> {
  const { data, error } = await supabase
    .from('broadcasts')
    .insert({ name, location, created_by: (await supabase.auth.getUser()).data.user?.id })
    .select()
    .single();
  if (error) throw error;
  return data as Broadcast;
}

export async function renameBroadcast(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('broadcasts').update({ name }).eq('id', id);
  if (error) throw error;
}

export async function deleteBroadcast(id: string): Promise<void> {
  // Delete in proper order to handle foreign key constraints
  
  // 1. Delete broadcast send recipients
  try {
    const { data: sends } = await supabase
      .from('broadcast_sends')
      .select('id')
      .eq('broadcast_id', id);
    
    if (sends && sends.length > 0) {
      const sendIds = sends.map(s => s.id);
      await supabase
        .from('broadcast_send_recipients')
        .delete()
        .in('send_id', sendIds);
    }
  } catch (error) {
    console.warn('Failed to delete broadcast send recipients:', error);
  }

  // 2. Delete broadcast sends
  try {
    await supabase
      .from('broadcast_sends')
      .delete()
      .eq('broadcast_id', id);
  } catch (error) {
    console.warn('Failed to delete broadcast sends:', error);
  }

  // 3. Delete broadcast messages
  try {
    await supabase
      .from('broadcast_messages')
      .delete()
      .eq('broadcast_id', id);
  } catch (error) {
    console.warn('Failed to delete broadcast messages:', error);
  }

  // 4. Delete broadcast members
  try {
    await supabase
      .from('broadcast_members')
      .delete()
      .eq('broadcast_id', id);
  } catch (error) {
    console.warn('Failed to delete broadcast members:', error);
  }

  // 5. Finally delete the broadcast itself
  const { error } = await supabase
    .from('broadcasts')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
}

// Keep the archive function for backwards compatibility, but mark as deprecated
/** @deprecated Use deleteBroadcast instead */
export async function archiveBroadcast(id: string): Promise<void> {
  const { error } = await supabase.from('broadcasts').update({ archived_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function listBroadcasts(): Promise<Broadcast[]> {
  // member_count and last_sent_at via subqueries
  const { data, error } = await supabase
    .from('broadcasts')
    .select(`
      id, name, location, created_at, archived_at,
      member_count:broadcast_members(count),
      last_sent_at:broadcast_sends(sent_at)
    `);
  if (error) throw error;
  const rows = (data as any[]) || [];
  const lastSentById: Record<string, string | null> = {};
  for (const row of rows) {
    const id = row.id as string;
    lastSentById[id] = Array.isArray(row.last_sent_at) && row.last_sent_at.length ? row.last_sent_at.sort().slice(-1)[0] : null;
  }
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    location: r.location,
    created_at: r.created_at,
    archived_at: r.archived_at,
    member_count: Array.isArray(r.member_count) ? (r.member_count[0]?.count ?? 0) : 0,
    last_sent_at: lastSentById[r.id] ?? null,
  }));
}

export async function getBroadcast(id: string): Promise<{ broadcast: Broadcast; members: Array<{ id: string; name: string }> }> {
  const [broad, members] = await Promise.all([
    supabase.from('broadcasts').select('id,name,location,created_at,archived_at').eq('id', id).single(),
    supabase.from('broadcast_members').select('contact:contacts(id,name)').eq('broadcast_id', id),
  ]);
  if (broad.error) throw broad.error;
  if (members.error) throw members.error;
  return {
    broadcast: broad.data as Broadcast,
    members: ((members.data as any[]) || []).map(r => ({ id: r.contact.id as string, name: r.contact.name as string })),
  };
}

export async function setBroadcastMembers(id: string, memberIds: string[]): Promise<void> {
  // Fetch current
  const { data, error } = await supabase.from('broadcast_members').select('contact_id').eq('broadcast_id', id);
  if (error) throw error;
  const existing = new Set<string>(((data as any[]) || []).map(r => r.contact_id as string));
  const desired = new Set<string>(memberIds);
  const toAdd = Array.from(desired).filter(x => !existing.has(x)).map(contact_id => ({ broadcast_id: id, contact_id }));
  const toRemove = Array.from(existing).filter(x => !desired.has(x));
  if (toAdd.length) {
    const ins = await supabase.from('broadcast_members').insert(toAdd, { defaultToNull: false });
    if (ins.error && (ins.error as any).code !== '23505' && (ins.error as any).code !== '409') throw ins.error;
  }
  if (toRemove.length) {
    try { await supabase.from('broadcast_members').delete().eq('broadcast_id', id).in('contact_id', toRemove); } catch {}
  }
}

export async function sendBroadcast(id: string, body?: string, mediaUrls?: string[]): Promise<{ recipients: number }> {
  // For now, run per-recipient client-side to leverage existing logic
  const { data: members, error } = await supabase.from('broadcast_members').select('contact_id').eq('broadcast_id', id);
  if (error) throw error;
  const ids = ((members as any[]) || []).map(r => r.contact_id as string);
  let ok = 0;
  // Log the broadcast send
  const user = await supabase.auth.getUser();
  const sendRow = await supabase
    .from('broadcast_sends')
    .insert({ broadcast_id: id, body: body || null, media: (mediaUrls || []) as any, sent_by: user.data.user?.id || null })
    .select('id')
    .single();
  const sendId = (sendRow.data as any)?.id as string | undefined;
  const recipientLogs: Array<{ send_id: string; contact_id: string; conversation_id: string | null; message_id: string | null; twilio_sid?: string | null; status?: string | null }> = [];
  for (const contactId of ids) {
    try {
      // Ensure conversation exists by contact id
      const { data: conv } = await supabase
        .from('conversations')
        .select('id')
        .eq('patient_contact_id', contactId)
        .maybeSingle();
      let convId = (conv as any)?.id as string | undefined;
      if (!convId) {
        const newId = crypto.randomUUID();
        const ins = await supabase.from('conversations').insert({ id: newId, patient_contact_id: contactId, status: 'new' });
        if (!ins.error) convId = newId;
      }
      if (!convId) continue;
      // Insert messages in the 1:1 timeline
      if (body && body.trim().length) {
        await supabase.from('messages').insert({ conversation_id: convId, sender: 'staff', text: body, type: 'text' });
      }
      if (mediaUrls && mediaUrls.length) {
        for (const url of mediaUrls) {
          await supabase.from('messages').insert({ conversation_id: convId, sender: 'staff', text: url, type: 'attachment' });
        }
      }
      // Send via Twilio using the same routing logic as 1:1
      const resp = await sendOutboundViaTwilio(convId, body, mediaUrls && mediaUrls.length ? mediaUrls : undefined);
      const results = (resp as any)?.results || [];
      if (results.length > 0) ok += 1;
      if (sendId) recipientLogs.push({ send_id: sendId, contact_id: contactId, conversation_id: convId, message_id: null, twilio_sid: results[0]?.sid || null, status: results[0]?.status || null });
    } catch {}
  }
  if (sendId && recipientLogs.length) {
    try { await supabase.from('broadcast_send_recipients').insert(recipientLogs as any, { defaultToNull: false }); } catch {}
  }
  // Append to broadcast thread history
  try {
    if (body && body.trim().length) {
      await supabase.from('broadcast_messages').insert({ broadcast_id: id, sender: 'staff', text: body, type: 'text' });
    }
    if (mediaUrls && mediaUrls.length) {
      for (const url of mediaUrls) {
        await supabase.from('broadcast_messages').insert({ broadcast_id: id, sender: 'staff', text: url, type: 'attachment' });
      }
    }
  } catch {}
  return { recipients: ok };
}

export async function listBroadcastMessages(broadcastId: string): Promise<Array<{ id: string; sender: 'staff'|'system'; text: string | null; type: 'text'|'attachment'|'system'; created_at: string }>> {
  const { data, error } = await supabase
    .from('broadcast_messages')
    .select('id,sender,text,type,created_at')
    .eq('broadcast_id', broadcastId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as any[]) || [];
}


