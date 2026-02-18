import { supabase } from "@/lib/supabaseClient";
import type { Contact, Medication, Note, Attachment } from "@/models/contacts";

type DbContact = {
  id?: string;
  slug?: string | null;
  name: string;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  rx_notify_phone?: string | null;
  address1?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  date_of_birth?: string | null; // ISO date
  emergency_contact?: string | null;
  gender?: string | null;
  language?: string | null;
  status?: string | null;
  avatar_url?: string | null;
  primary_physician?: string | null;
  pharmacy_location?: string | null;
  insurance_provider?: string | null;
  member_id?: string | null;
  group_number?: string | null;
  plan_name?: string | null;
  archived?: boolean | null;
  created_at?: string;
  updated_at?: string;
  contact_type?: 'patient' | 'provider' | 'social_worker' | null;
};

function normalizeDigits(input?: string | null): string | undefined {
  if (!input) return undefined;
  const d = String(input).replace(/\D/g, "");
  if (d.length === 0) return undefined;
  return d;
}

function normalizeE164US(input?: string | null): string | undefined {
  const d = normalizeDigits(input);
  if (!d) return undefined;
  if (d.startsWith("1") && d.length === 11) return "+" + d;
  if (d.length === 10) return "+1" + d;
  if (d.startsWith("+")) return d;
  return "+" + d;
}

function toDb(contact: Contact): DbContact {
  const nameFromParts = [contact.firstName, contact.middleName, contact.lastName].filter(Boolean).join(" ").trim();
  // Prefer explicit first/last over phone fallback. If none provided, use empty and let UI show blanks.
  const safeName = (nameFromParts || (contact.name && contact.name.trim().length > 0 ? contact.name : "")).toString() || "";
  const slugBase = (contact.id && contact.id.trim().length > 0) ? contact.id : (safeName || "contact").toString();
  const slug = slugBase
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-") || `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return {
    slug,
    name: safeName || "Unnamed",
    first_name: contact.firstName ?? null,
    middle_name: contact.middleName ?? null,
    last_name: contact.lastName ?? null,
    email: contact.email ?? null,
    phone: normalizeE164US(contact.phone) ?? null,
    rx_notify_phone: normalizeE164US(contact.rxNotifyPhone) ?? null,
    address1: contact.address1 ?? contact.address ?? null,
    city: contact.city ?? null,
    state: contact.state ?? null,
    zip: contact.zip ?? null,
    date_of_birth: contact.dateOfBirth ?? null,
    emergency_contact: contact.emergencyContact ?? null,
    gender: contact.gender ?? null,
    language: contact.language ?? null,
    status: contact.status ?? null,
    avatar_url: contact.avatarUrl ?? null,
    primary_physician: contact.medical?.primaryPhysician ?? null,
    pharmacy_location: contact.medical?.pharmacyLocation ?? null,
    insurance_provider: contact.insurance?.provider ?? null,
    member_id: contact.insurance?.memberId ?? null,
    group_number: contact.insurance?.groupNumber ?? null,
    plan_name: contact.insurance?.planName ?? null,
    archived: contact.archived ?? null,
    contact_type: (contact as any).contactType ?? null,
  };
}

function fromDb(row: DbContact & { id: string }): Contact {
  return {
    id: row.slug || row.id,
    name: row.name,
    firstName: row.first_name ?? undefined,
    middleName: row.middle_name ?? undefined,
    lastName: row.last_name ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    rxNotifyPhone: row.rx_notify_phone ?? undefined,
    address1: row.address1 ?? undefined,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    zip: row.zip ?? undefined,
    dateOfBirth: row.date_of_birth ?? undefined,
    emergencyContact: row.emergency_contact ?? undefined,
    gender: row.gender ?? undefined,
    language: row.language ?? undefined,
    status: row.status ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    archived: row.archived ?? false,
    medical: {
      primaryPhysician: row.primary_physician ?? undefined,
      pharmacyLocation: row.pharmacy_location ?? undefined,
    },
    insurance: {
      provider: row.insurance_provider ?? undefined,
      memberId: row.member_id ?? undefined,
      groupNumber: row.group_number ?? undefined,
      planName: row.plan_name ?? undefined,
    },
    ...(row.contact_type ? { contactType: row.contact_type } : {}),
  } as any;
}

export async function upsertContact(contact: Contact): Promise<Contact> {
  const payload = toDb(contact);
  // Default pharmacy_location to the current user's active location (except Admin)
  let selected: string | undefined;
  try {
    if (!payload.pharmacy_location) {
      const { data: user } = await supabase.auth.getUser();
      const uid = user?.user?.id;
      if (uid) {
        const { data: loc } = await supabase
          .from('user_active_locations')
          .select('selected_location')
          .eq('user_id', uid)
          .maybeSingle();
        selected = (loc as any)?.selected_location as string | undefined;
        if (selected && selected !== 'Admin') payload.pharmacy_location = selected;
      }
    }
  } catch {}
  // Ensure slug uniqueness per location to avoid upsert conflicts across locations
  try {
    const locForSlug = (payload.pharmacy_location || selected || '').toLowerCase().replace(/\s+/g, '-');
    const isTelPlaceholder = (payload.slug || '').startsWith('tel-');
    if (!isTelPlaceholder && payload.slug && locForSlug && !payload.slug.endsWith(`-${locForSlug}`)) {
      payload.slug = `${payload.slug}-${locForSlug}`;
    }
  } catch {}
  // Enforce per-location uniqueness for phone numbers: allow same phone in different locations
  try {
    const locSuffix = (payload.pharmacy_location || selected || '').toLowerCase().replace(/\s+/g, '-');
    if (payload.phone) payload.phone = normalizeE164US(payload.phone) as any;
    if (payload.rx_notify_phone) payload.rx_notify_phone = normalizeE164US(payload.rx_notify_phone) as any;
    // No DB constraint change here; rely on RLS and slug namespacing. This ensures slug collision is avoided.
  } catch {}
  // For tel- placeholders, prefer updating the existing row in-place to keep conversations linked
  const isTelPlaceholder = (payload.slug || '').startsWith('tel-');
  if (isTelPlaceholder) {
    const updated = await supabase
      .from('contacts')
      .update({
        name: payload.name,
        first_name: payload.first_name ?? null,
        middle_name: payload.middle_name ?? null,
        last_name: payload.last_name ?? null,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        rx_notify_phone: payload.rx_notify_phone ?? null,
        address1: payload.address1 ?? null,
        city: payload.city ?? null,
        state: payload.state ?? null,
        zip: payload.zip ?? null,
        date_of_birth: payload.date_of_birth ?? null,
        emergency_contact: payload.emergency_contact ?? null,
        gender: payload.gender ?? null,
        language: payload.language ?? null,
        status: payload.status ?? null,
        avatar_url: payload.avatar_url ?? null,
        primary_physician: payload.primary_physician ?? null,
        pharmacy_location: payload.pharmacy_location ?? null,
        insurance_provider: payload.insurance_provider ?? null,
        member_id: payload.member_id ?? null,
        group_number: payload.group_number ?? null,
        plan_name: payload.plan_name ?? null,
        archived: payload.archived ?? null,
        contact_type: payload.contact_type ?? 'patient',
      } as any)
      .eq('slug', payload.slug as string);
    if ((updated as any).error) throw (updated as any).error;
  } else {
    // Upsert by slug, but guard against duplicate slug collisions
    const { error } = await supabase
      .from("contacts")
      .upsert(payload as any, { onConflict: 'slug' });
    if (error && (error as any).code === '23505') {
      // Regenerate a unique slug and retry once
      const suffix = `-${Math.random().toString(36).slice(2,6)}`;
      (payload as any).slug = `${payload.slug}${suffix}`;
      const retry = await supabase.from('contacts').upsert(payload as any, { onConflict: 'slug' });
      if (retry.error) throw retry.error;
    } else if (error) {
      throw error;
    }
  }
  // Avoid immediate SELECT to bypass RLS 'USING' race conditions; return the input mapped
  return fromDb({ ...(payload as any), id: payload.slug || "" } as DbContact & { id: string });
}

// Bulk upsert many contacts efficiently. Fills pharmacy_location with the
// current user's active location when not provided and user is not Admin.
export async function upsertContactsBulk(contacts: Contact[], chunkSize: number = 500): Promise<{ inserted: number }>{
  if (contacts.length === 0) return { inserted: 0 };
  // Determine default location once
  let defaultLocation: string | undefined;
  try {
    const { data: user } = await supabase.auth.getUser();
    const uid = user?.user?.id;
    if (uid) {
      const [{ data: prof }, { data: loc }] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', uid).maybeSingle(),
        supabase.from('user_active_locations').select('selected_location').eq('user_id', uid).maybeSingle(),
      ]);
      const role = (prof as any)?.role as string | undefined;
      const selected = (loc as any)?.selected_location as string | undefined;
      // Always default to the user's active location; if it's "Admin", refuse and ask to pick a specific location
      if (selected && selected !== 'Admin') defaultLocation = selected;
    }
  } catch {}
  if (!defaultLocation) {
    throw new Error('Please set your active location to "Mount Vernon" or "New Rochelle" before importing.');
  }

  // Normalize to DB rows and enforce location
  const normalized: DbContact[] = contacts.map(c => {
    const db = toDb(c);
    db.pharmacy_location = defaultLocation;
    // Ensure slug is location-scoped to avoid cross-location conflicts
    const locSuffix = (defaultLocation || '').toLowerCase().replace(/\s+/g, '-');
    if (db.slug && locSuffix && !db.slug.endsWith(`-${locSuffix}`)) {
      db.slug = `${db.slug}-${locSuffix}`;
    }
    return db;
  });

  // Deduplicate within the batch by slug to avoid Postgres
  // "ON CONFLICT DO UPDATE command cannot affect row a second time" error
  const bySlug = new Map<string, DbContact>();
  const merge = (a: DbContact, b: DbContact): DbContact => {
    const pick = (x: any, y: any) => (x !== undefined && x !== null && x !== '' ? x : y);
    return {
      id: pick(a.id, b.id),
      slug: pick(a.slug, b.slug),
      name: pick(a.name, b.name),
      first_name: pick(a.first_name, b.first_name),
      middle_name: pick(a.middle_name, b.middle_name),
      last_name: pick(a.last_name, b.last_name),
      email: pick(a.email, b.email),
      phone: pick(a.phone, b.phone),
      rx_notify_phone: pick(a.rx_notify_phone, b.rx_notify_phone),
      address1: pick(a.address1, b.address1),
      city: pick(a.city, b.city),
      state: pick(a.state, b.state),
      zip: pick(a.zip, b.zip),
      date_of_birth: pick(a.date_of_birth, b.date_of_birth),
      emergency_contact: pick(a.emergency_contact, b.emergency_contact),
      gender: pick(a.gender, b.gender),
      language: pick(a.language, b.language),
      status: pick(a.status, b.status),
      avatar_url: pick(a.avatar_url, b.avatar_url),
      primary_physician: pick(a.primary_physician, b.primary_physician),
      pharmacy_location: pick(a.pharmacy_location, b.pharmacy_location),
      insurance_provider: pick(a.insurance_provider, b.insurance_provider),
      member_id: pick(a.member_id, b.member_id),
      group_number: pick(a.group_number, b.group_number),
      plan_name: pick(a.plan_name, b.plan_name),
      archived: pick(a.archived, b.archived),
      contact_type: pick(a.contact_type, b.contact_type),
    } as DbContact;
  };
  for (const row of normalized) {
    const key = (row.slug || row.name || '').toLowerCase();
    if (!key) continue;
    if (bySlug.has(key)) {
      bySlug.set(key, merge(bySlug.get(key) as DbContact, row));
    } else {
      bySlug.set(key, row);
    }
  }
  const rows = Array.from(bySlug.values());

  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map(r => {
      const { id, created_at, updated_at, ...rest } = r as any;
      // Ensure no nulls for NOT NULL columns; undefined fields are omitted
      if (rest.name == null || String(rest.name).trim().length === 0) {
        rest.name = 'Unnamed';
      }
      return rest;
    });
    const { error, data } = await supabase
      .from('contacts')
      .upsert(chunk as any, { onConflict: 'slug', ignoreDuplicates: true })
      .select('id');
    if (error) throw error;
    inserted += (data as any[])?.length ?? chunk.length;
  }
  return { inserted };
}

export async function fetchContactsPage(
  page: number,
  limit: number,
  pharmacyLocation?: string,
  contactType?: 'patient' | 'provider' | 'social_worker' | '',
  searchQuery?: string
): Promise<{ rows: Contact[]; total: number; usedPage: number }> {
  // First get total count (HEAD request)
  // Use 'exact' to keep types compatible with PostgrestFilterBuilder
  let countQuery = supabase.from('contacts').select('id', { count: 'exact', head: true });
  if (pharmacyLocation) countQuery = countQuery.eq('pharmacy_location', pharmacyLocation);
  if (contactType) countQuery = countQuery.eq('contact_type', contactType);
  if (searchQuery) {
    const searchTerm = searchQuery.toLowerCase().trim();
    // Escape special characters for SQL ILIKE
    const escapedTerm = searchTerm.replace(/[%_\\]/g, '\\$&');
    
    // For phrase search, we want the complete term as entered
    const searchPattern = `%${escapedTerm}%`;
    
    // Search as complete phrase - only match if the entire search term appears in name, email, or phone
    countQuery = countQuery.or(`name.ilike.${searchPattern},email.ilike.${searchPattern},phone.ilike.${searchPattern}`);
  }
  const { error: countErr, count } = await countQuery;
  if (countErr) throw countErr;
  const total = count ?? 0;
  if (total === 0) {
    return { rows: [], total: 0, usedPage: 1 };
  }
  const maxPage = Math.max(1, Math.ceil(total / limit));
  const usedPage = Math.min(Math.max(1, page), maxPage);
  const offset = (usedPage - 1) * limit;

  let dataQuery = supabase
    .from('contacts')
    .select('id,slug,name,email,phone,rx_notify_phone,address1,city,state,zip,date_of_birth,emergency_contact,gender,language,status,avatar_url,primary_physician,pharmacy_location,insurance_provider,member_id,group_number,plan_name,archived,contact_type')
    .range(offset, offset + limit - 1);
    
  if (pharmacyLocation) dataQuery = dataQuery.eq('pharmacy_location', pharmacyLocation);
  if (contactType) dataQuery = dataQuery.eq('contact_type', contactType);
  if (searchQuery) {
    const searchTerm = searchQuery.toLowerCase().trim();
    // Escape special characters for SQL ILIKE
    const escapedTerm = searchTerm.replace(/[%_\\]/g, '\\$&');
    
    // For phrase search, we want the complete term as entered
    const searchPattern = `%${escapedTerm}%`;
    
    // Search as complete phrase - only match if the entire search term appears in name, email, or phone
    dataQuery = dataQuery.or(`name.ilike.${searchPattern},email.ilike.${searchPattern},phone.ilike.${searchPattern}`);
    
    // Order by relevance: exact name matches first, then starts with, then contains
    dataQuery = dataQuery.order('name', { ascending: true });
  } else {
    dataQuery = dataQuery.order('name', { ascending: true });
  }
  // Keep a single select to avoid type narrowing issues on Postgrest builders
  const { data, error } = await dataQuery;
  if (error) throw error;
  return { rows: (data as Array<DbContact & { id: string }>).map(fromDb), total, usedPage };
}

export async function fetchContacts(): Promise<Contact[]> {
  const { data, error } = await supabase
    .from("contacts")
    .select("id,slug,name,email,phone,rx_notify_phone,address1,city,state,zip,date_of_birth,emergency_contact,gender,language,status,avatar_url,primary_physician,pharmacy_location,insurance_provider,member_id,group_number,plan_name,archived,contact_type")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as Array<DbContact & { id: string }>).map(fromDb);
}

export async function fetchContactBySlug(slug: string): Promise<Contact | undefined> {
  const { data, error } = await supabase
    .from("contacts")
    .select("id,slug,name,first_name,middle_name,last_name,email,phone,rx_notify_phone,address1,city,state,zip,date_of_birth,emergency_contact,gender,language,status,avatar_url,primary_physician,pharmacy_location,insurance_provider,member_id,group_number,plan_name,archived,created_at,updated_at,contact_type")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data ? fromDb(data as unknown as DbContact & { id: string }) : undefined;
}

export async function getDbIdBySlug(slug: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("contacts")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as any)?.id ?? null;
}

export async function bulkSetArchived(ids: string[], archived: boolean): Promise<void> {
  const { error } = await supabase
    .from("contacts")
    .update({ archived })
    .in("id", ids);
  if (error) throw error;
}

export async function deleteContacts(ids: string[]): Promise<void> {
  // Cascade deletes are not assumed; delete dependent rows carefully if FKs require.
  const { error } = await supabase
    .from("contacts")
    .delete()
    .in("id", ids);
  if (error) throw error;
}

export async function deleteContactsBySlug(slugs: string[]): Promise<void> {
  const { error } = await supabase
    .from("contacts")
    .delete()
    .in("slug", slugs);
  if (error) throw error;
}

// Hard-delete a contact and all related conversation data by slug (used for unknown tel- placeholders)
export async function deleteContactCompletelyBySlug(slug: string): Promise<void> {
  // Use server-side RPC to purge atomically and avoid RLS issues
  const { error } = await supabase.rpc('purge_contact_by_slug', { p_slug: slug });
  if (error) throw error as any;
}

export async function setStatus(id: string, status: string): Promise<void> {
  const { error } = await supabase
    .from("contacts")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}

export async function bulkSetStatus(ids: string[], status: string): Promise<void> {
  const { error } = await supabase
    .from("contacts")
    .update({ status })
    .in("id", ids);
  if (error) throw error;
}

export async function bulkSetPharmacyLocation(ids: string[], location: string): Promise<void> {
  const { error } = await supabase
    .from("contacts")
    .update({ pharmacy_location: location })
    .in("id", ids);
  if (error) throw error;
}

export async function bulkAssignPrimaryPhysician(ids: string[], physician: string): Promise<void> {
  const { error } = await supabase
    .from("contacts")
    .update({ primary_physician: physician })
    .in("id", ids);
  if (error) throw error;
}

export async function addMedication(contactId: string, med: Medication): Promise<void> {
  const { error } = await supabase.from("medications").insert({
    contact_id: contactId,
    name: med.name,
    instructions: med.instructions,
    status: med.status,
    prescribed_by: med.prescribedBy ?? null,
    ended_on: med.endedOn ?? null,
  });
  if (error) throw error;
}

export async function listMedications(contactId: string): Promise<Array<{ id: string; name: string; instructions: string; status: string; prescribed_by: string | null; ended_on: string | null }>> {
  const { data, error } = await supabase
    .from('medications')
    .select('id,name,instructions,status,prescribed_by,ended_on')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as any;
}

export type MedicationWithContact = {
  id: string;
  contact_id: string;
  name: string;
  instructions: string;
  status: string;
  prescribed_by: string | null;
  ended_on: string | null;
  created_at: string;
  contact: {
    id: string;
    slug: string | null;
    name: string;
    pharmacy_location: string | null;
    phone: string | null;
    rx_notify_phone: string | null;
  } | null;
};

export async function listAllMedications(): Promise<MedicationWithContact[]> {
  const { data, error } = await supabase
    .from("medications")
    .select(`
      id,
      contact_id,
      name,
      instructions,
      status,
      prescribed_by,
      ended_on,
      created_at,
      contact:contacts(
        id,
        slug,
        name,
        pharmacy_location,
        phone,
        rx_notify_phone
      )
    `)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as any;
}

export async function updateMedication(contactId: string, medId: string, patch: Partial<{ name: string; instructions: string; status: string; ended_on: string | null }>): Promise<void> {
  const { error } = await supabase
    .from('medications')
    .update({
      ...('name' in patch ? { name: patch.name } : {}),
      ...('instructions' in patch ? { instructions: patch.instructions } : {}),
      ...('status' in patch ? { status: patch.status } : {}),
      ...('ended_on' in patch ? { ended_on: patch.ended_on } : {}),
    })
    .eq('id', medId)
    .eq('contact_id', contactId);
  if (error) throw error;
}

export async function stopMedication(contactId: string, medId: string, endedOn?: string): Promise<void> {
  await updateMedication(contactId, medId, { status: 'discontinued', ended_on: endedOn ?? new Date().toISOString() });
}

export async function addNote(contactId: string, note: Pick<Note, "text" | "author">): Promise<void> {
  const { error } = await supabase.from("notes").insert({
    contact_id: contactId,
    text: note.text,
    author: note.author ?? null,
    pinned: false,
  });
  if (error) throw error;
}

export async function listNotes(contactId: string): Promise<Array<{ id: string; text: string; author: string | null; pinned: boolean | null; created_at: string; updated_at: string | null }>> {
  const { data, error } = await supabase
    .from("notes")
    .select("id,text,author,pinned,created_at,updated_at")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as any;
}

export async function updateNote(contactId: string, noteId: string, patch: Partial<Pick<Note, "text"> & { pinned: boolean }>): Promise<void> {
  const { error } = await supabase
    .from("notes")
    .update({ ...("text" in patch ? { text: patch.text } : {}), ...("pinned" in patch ? { pinned: (patch as any).pinned } : {}), updated_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("contact_id", contactId);
  if (error) throw error;
}

export async function deleteNote(contactId: string, noteId: string): Promise<void> {
  const { error } = await supabase
    .from("notes")
    .delete()
    .eq("id", noteId)
    .eq("contact_id", contactId);
  if (error) throw error;
}

export async function addAttachment(contactId: string, att: Pick<Attachment, "name" | "url" | "kind">): Promise<void> {
  const { error } = await supabase.from("attachments").insert({
    contact_id: contactId,
    name: att.name,
    url: att.url,
    kind: att.kind,
  });
  if (error) throw error;
}

export async function listAttachments(contactId: string): Promise<Array<{ id: string; name: string; url: string; kind: Attachment["kind"]; added_at: string }>> {
  const { data, error } = await supabase
    .from("attachments")
    .select("id,name,url,kind,added_at")
    .eq("contact_id", contactId)
    .order("added_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as any;
}

export async function removeAttachment(contactId: string, attachmentId: string): Promise<void> {
  const { error } = await supabase
    .from("attachments")
    .delete()
    .eq("id", attachmentId)
    .eq("contact_id", contactId);
  if (error) throw error;
}


// Pull attachments that were sent in chat messages for any conversation that includes this contact
export async function listMessageAttachmentsForContact(contactDbId: string): Promise<Array<{ id: string; name: string; url: string; kind: "image" | "file"; added_at: string }>> {
  // Find conversations where this contact is the patient
  const convsA = await supabase
    .from('conversations')
    .select('id')
    .eq('patient_contact_id', contactDbId);
  if (convsA.error) throw convsA.error;
  const idsA = (convsA.data || []).map((r: any) => r.id as string);
  // Find conversations where this contact is a participant (groups)
  const convsB = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('contact_id', contactDbId);
  if (convsB.error) throw convsB.error;
  const idsB = (convsB.data || []).map((r: any) => r.conversation_id as string);
  const convIds = Array.from(new Set([...idsA, ...idsB]));
  if (convIds.length === 0) return [];
  // Fetch messages of type attachment across these conversations
  const { data, error } = await supabase
    .from('messages')
    .select('id, text, created_at')
    .in('conversation_id', convIds)
    .eq('type', 'attachment')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data || []) as Array<{ id: string; text: string | null; created_at: string }>;
  return rows
    .filter(r => typeof r.text === 'string' && (r.text as string).length > 0)
    .map(r => {
      const url = r.text as string;
      const isImage = /\.(png|jpe?g|gif|webp)$/i.test(url);
      const name = url.split('/').pop() || 'attachment';
      return { id: r.id, name, url, kind: isImage ? 'image' as const : 'file' as const, added_at: r.created_at };
    });
}


