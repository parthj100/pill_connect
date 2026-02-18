import { supabase } from "@/lib/supabaseClient";

// Simple, clean types
export interface SimpleMessage {
  id: string;
  conversation_id: string;
  sender: "patient" | "staff" | "system";
  text: string | null;
  created_at: string;
  type: "text" | "prescriptionUpdate" | "attachment" | "system" | null;
}

export interface SimpleConversation {
  id: string;
  patient_contact_id: string;
  unread_count: number;
  status: string | null;
  created_at: string;
  last_message_at: string | null;
  // Patient info
  patient: {
    id: string;
    slug: string | null;
    name: string;
    avatar_url: string | null;
    contact_type?: string;
  };
  // Last message preview
  last_message_text: string | null;
}

// 1. Load all conversations with latest message preview
export async function loadConversations(): Promise<SimpleConversation[]> {
  console.log('📥 Loading conversations...');
  
  // Debug: Check authentication
  const { data: session } = await supabase.auth.getSession();
  console.log('🔐 Auth session:', !!session.session);
  
  const { data, error } = await supabase
    .from("conversations")
    .select(`
      id,
      patient_contact_id,
      unread_count,
      status,
      created_at,
      last_message_at,
      patient:contacts!conversations_patient_contact_id_fkey(
        id,
        slug,
        name,
        avatar_url,
        contact_type
      )
    `)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error('❌ Error loading conversations:', error);
    throw error;
  }

  console.log(`📥 Raw database result:`, data);
  console.log(`📥 Loaded ${data.length} conversations`);

  // Get last message text for each conversation
  const conversationIds = data.map(conv => conv.id);
  const lastMessages = await fetchLastMessageTexts(conversationIds);

  return data.map(conv => ({
    id: conv.id,
    patient_contact_id: conv.patient_contact_id,
    unread_count: conv.unread_count || 0,
    status: conv.status,
    created_at: conv.created_at,
    last_message_at: conv.last_message_at,
    patient: conv.patient as any,
    last_message_text: lastMessages[conv.id] || null,
  }));
}

// 2. Load messages for a specific conversation
export async function loadMessages(conversationId: string): Promise<SimpleMessage[]> {
  console.log(`📥 Loading messages for conversation: ${conversationId.slice(0, 8)}`);
  
  const { data, error } = await supabase
    .from("messages")
    .select("id, conversation_id, sender, text, created_at, type")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`❌ Error loading messages:`, error);
    throw error;
  }

  console.log(`📥 Loaded ${data.length} messages`);
  return data as SimpleMessage[];
}

// 3. Send a message
export async function sendMessage(conversationId: string, text: string): Promise<void> {
  console.log(`📤 Sending message to conversation: ${conversationId.slice(0, 8)}`);
  
  const { error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender: "staff",
      text: text,
      type: "text"
    });

  if (error) {
    console.error('❌ Error sending message:', error);
    throw error;
  }

  console.log('✅ Message sent successfully');
}

// 4. Create new conversation for a contact
export async function createConversation(contactId: string): Promise<SimpleConversation> {
  console.log(`💬 Creating conversation for contact: ${contactId.slice(0, 8)}`);

  // Check if conversation already exists
  const existing = await supabase
    .from("conversations")
    .select(`
      id,
      patient_contact_id,
      unread_count,
      status,
      created_at,
      last_message_at,
      patient:contacts!conversations_patient_contact_id_fkey(
        id,
        slug,
        name,
        avatar_url,
        contact_type
      )
    `)
    .eq("patient_contact_id", contactId)
    .maybeSingle();

  if (existing.data) {
    console.log('✅ Using existing conversation');
    return {
      ...existing.data,
      unread_count: existing.data.unread_count || 0,
      patient: existing.data.patient as any,
      last_message_text: null,
    };
  }

  // Create new conversation
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      patient_contact_id: contactId,
      status: "new"
    })
    .select(`
      id,
      patient_contact_id,
      unread_count,
      status,
      created_at,
      last_message_at,
      patient:contacts!conversations_patient_contact_id_fkey(
        id,
        slug,
        name,
        avatar_url,
        contact_type
      )
    `)
    .single();

  if (error) {
    console.error('❌ Error creating conversation:', error);
    throw error;
  }

  // Add to participants
  await supabase
    .from("conversation_participants")
    .insert({
      conversation_id: data.id,
      contact_id: contactId
    })
    .then(() => {}, () => {}); // Ignore errors (might already exist)

  console.log('✅ Conversation created successfully');
  return {
    ...data,
    unread_count: data.unread_count || 0,
    patient: data.patient as any,
    last_message_text: null,
  };
}

// 5. Delete a conversation
export async function deleteConversation(conversationId: string): Promise<void> {
  console.log(`🗑️ Deleting conversation: ${conversationId.slice(0, 8)}`);

  try {
    // Delete messages first
    const { error: msgError } = await supabase.from("messages").delete().eq("conversation_id", conversationId);
    if (msgError) console.warn('Messages delete error:', msgError);
    
    // Delete participants
    const { error: partError } = await supabase.from("conversation_participants").delete().eq("conversation_id", conversationId);
    if (partError) console.warn('Participants delete error:', partError);
    
    // Delete conversation
    const { error } = await supabase.from("conversations").delete().eq("id", conversationId);

    if (error) {
      console.error('❌ Error deleting conversation:', error);
      throw error;
    }

    console.log('✅ Conversation deleted successfully');
  } catch (error) {
    console.error('❌ Delete conversation failed:', error);
    throw error;
  }
}

// 6. Mark conversation as read
export async function markAsRead(conversationId: string): Promise<void> {
  console.log(`👁️ Marking conversation as read: ${conversationId.slice(0, 8)}`);

  const { error } = await supabase
    .from("conversations")
    .update({ unread_count: 0 })
    .eq("id", conversationId);

  if (error) {
    console.error('❌ Error marking as read:', error);
    throw error;
  }

  console.log('✅ Conversation marked as read');
}

// 7. Subscribe to new messages across all conversations
export function subscribeToNewMessages(onMessage: (message: SimpleMessage) => void): () => void {
  console.log('🔔 Subscribing to new messages');

  const channel = supabase
    .channel('new_messages')
    .on('postgres_changes', { 
      event: 'INSERT', 
      schema: 'public', 
      table: 'messages' 
    }, (payload) => {
      console.log('🔔 REALTIME MESSAGE EVENT:', {
        id: payload.new.id,
        conversation_id: payload.new.conversation_id,
        sender: payload.new.sender,
        text: payload.new.text?.slice(0, 50),
        created_at: payload.new.created_at
      });
      onMessage(payload.new as SimpleMessage);
    })
    .on('postgres_changes', { 
      event: 'UPDATE', 
      schema: 'public', 
      table: 'messages' 
    }, (payload) => {
      console.log('🔔 REALTIME MESSAGE UPDATE EVENT:', payload.new);
    })
    .subscribe((status) => {
      console.log('🔔 Message subscription status:', status);
    });

  return () => {
    console.log('🔔 Unsubscribing from messages');
    supabase.removeChannel(channel);
  };
}

// 8. Subscribe to conversation changes
export function subscribeToConversationChanges(
  onNew: (conversation: SimpleConversation) => void,
  onUpdate: (conversation: SimpleConversation) => void
): () => void {
  console.log('🔔 Subscribing to conversation changes');

  const channel = supabase
    .channel('conversation_changes')
    .on('postgres_changes', { 
      event: 'INSERT', 
      schema: 'public', 
      table: 'conversations' 
    }, async (payload) => {
      console.log('🔔 REALTIME CONVERSATION INSERT EVENT:', {
        id: payload.new.id,
        patient_contact_id: payload.new.patient_contact_id,
        status: payload.new.status,
        created_at: payload.new.created_at
      });
      // Fetch full conversation data with patient info
      const full = await fetchFullConversation(payload.new.id);
      if (full) {
        console.log('🔔 Fetched full conversation data:', full);
        onNew(full);
      } else {
        console.log('❌ Failed to fetch full conversation data');
      }
    })
    .on('postgres_changes', { 
      event: 'UPDATE', 
      schema: 'public', 
      table: 'conversations' 
    }, async (payload) => {
      console.log('🔔 REALTIME CONVERSATION UPDATE EVENT:', {
        id: payload.new.id,
        last_message_at: payload.new.last_message_at,
        unread_count: payload.new.unread_count
      });
      const full = await fetchFullConversation(payload.new.id);
      if (full) onUpdate(full);
    })
    .subscribe((status) => {
      console.log('🔔 Conversation subscription status:', status);
    });

  return () => {
    console.log('🔔 Unsubscribing from conversations');
    supabase.removeChannel(channel);
  };
}

// Helper: Fetch full conversation data
async function fetchFullConversation(conversationId: string): Promise<SimpleConversation | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select(`
      id,
      patient_contact_id,
      unread_count,
      status,
      created_at,
      last_message_at,
      patient:contacts!conversations_patient_contact_id_fkey(
        id,
        slug,
        name,
        avatar_url,
        contact_type
      )
    `)
    .eq("id", conversationId)
    .maybeSingle();

  if (error || !data) return null;

  // Get last message text
  const lastMessages = await fetchLastMessageTexts([conversationId]);

  return {
    ...data,
    unread_count: data.unread_count || 0,
    patient: data.patient as any,
    last_message_text: lastMessages[conversationId] || null,
  };
}

// Helper: Get last message text for conversations
async function fetchLastMessageTexts(conversationIds: string[]): Promise<Record<string, string>> {
  if (conversationIds.length === 0) return {};

  const { data } = await supabase
    .from('messages')
    .select('conversation_id, text, created_at')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: false });

  const latest: Record<string, string> = {};
  for (const row of data || []) {
    const cid = row.conversation_id;
    if (!(cid in latest) && row.text) {
      latest[cid] = row.text;
    }
  }

  return latest;
}

// Twilio integration (simplified)
export async function sendSmsMessage(conversationId: string, body: string): Promise<void> {
  try {
    // Get conversation location and patient phone
    const conversation = await fetchFullConversation(conversationId);
    if (!conversation) throw new Error('Conversation not found');

    // Get patient phone number
    const { data: contact } = await supabase
      .from('contacts')
      .select('phone, rx_notify_phone, pharmacy_location')
      .eq('id', conversation.patient_contact_id)
      .maybeSingle();

    const phone = contact?.phone || contact?.rx_notify_phone;
    if (!phone) throw new Error('No phone number found');

    // Get location Twilio number
    const location = contact?.pharmacy_location;
    let fromNumber: string | undefined;
    
    if (location) {
      const { data: settings } = await supabase
        .from('location_settings')
        .select('twilio_from_number')
        .eq('location', location)
        .maybeSingle();
      fromNumber = settings?.twilio_from_number;
    }

    // Send via Twilio function
    const { error } = await supabase.functions.invoke('twilio-outbound', {
      body: {
        to: [phone],
        body,
        conversationId,
        fromNumber
      }
    });

    if (error) throw error;
    console.log('✅ SMS sent successfully');
  } catch (error) {
    console.error('❌ Error sending SMS:', error);
    throw error;
  }
}