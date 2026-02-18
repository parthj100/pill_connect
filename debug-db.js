// Debug script to check database state
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tsldleazameesflhiqxd.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzbGRsZWF6YW1lZXNmbGhpcXhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0NDA2NjQsImV4cCI6MjA3MDAxNjY2NH0.Wg2ZLQ3SHrwC4dmTU1aw4-VNvVLBh5KrQhmGyuBI-uo';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function debugDatabase() {
  console.log('🔍 Checking database state...');
  
  // Check auth status
  const { data: session } = await supabase.auth.getSession();
  console.log('🔐 Auth session:', !!session.session);
  
  if (!session.session) {
    console.log('❌ Not authenticated - cannot query database with RLS');
    return;
  }
  
  // Get all conversations
  const { data: conversations, error: convError } = await supabase
    .from('conversations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (convError) {
    console.error('❌ Error fetching conversations:', convError);
    return;
  }
  
  console.log(`📊 Found ${conversations.length} recent conversations:`);
  
  for (const conv of conversations) {
    console.log(`\n💬 Conversation ${conv.id.slice(0, 8)}:`);
    console.log(`   Patient: ${conv.patient_contact_id}`);
    console.log(`   Status: ${conv.status}`);
    console.log(`   Created: ${conv.created_at}`);
    console.log(`   Last message: ${conv.last_message_at}`);
    console.log(`   Unread: ${conv.unread_count}`);
    
    // Get messages for this conversation
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true });
    
    if (msgError) {
      console.error(`❌ Error fetching messages for ${conv.id}:`, msgError);
      continue;
    }
    
    console.log(`   📝 Messages (${messages.length}):`);
    for (const msg of messages) {
      console.log(`      ${msg.created_at} [${msg.sender}]: ${msg.text?.slice(0, 50)}...`);
    }
    
    // Get contact info
    const { data: contact } = await supabase
      .from('contacts')
      .select('name, slug, phone, rx_notify_phone')
      .eq('id', conv.patient_contact_id)
      .single();
    
    if (contact) {
      console.log(`   👤 Contact: ${contact.name} (${contact.phone || contact.rx_notify_phone})`);
    }
  }
  
  console.log('\n🔍 Checking for recent unknown contacts (tel-* slugs):');
  const { data: unknownContacts } = await supabase
    .from('contacts')
    .select('*')
    .like('slug', 'tel-%')
    .order('created_at', { ascending: false })
    .limit(3);
  
  for (const contact of unknownContacts || []) {
    console.log(`📞 ${contact.slug}: ${contact.name} (${contact.phone})`);
  }
}

debugDatabase().catch(console.error);