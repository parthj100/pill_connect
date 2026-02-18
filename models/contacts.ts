export interface Medication {
  name: string;
  instructions: string;
  status: "active" | "refill-due" | "refill-requested" | "refill-approved" | "refill-ready" | "picked-up" | "discontinued";
  prescribedBy?: string;
  endedOn?: string;
}

export interface MedicalInfo {
  primaryPhysician?: string;
  lastVisit?: string; // ISO or friendly
  nextAppointment?: string;
  pharmacyLocation?: string;
  medications?: Medication[];
}

export interface InsuranceInfo {
  provider?: string;
  memberId?: string;
  groupNumber?: string;
  planName?: string;
}

export interface Note {
  id: string;
  text: string;
  createdAt: string; // ISO
  author?: string;
  pinned?: boolean;
  updatedAt?: string;
}

export type TimelineEventType = "note" | "medication-status" | "message" | "attachment";

export interface TimelineEvent {
  id: string;
  createdAt: string; // ISO
  type: TimelineEventType;
  summary: string;
  data?: any;
}

export interface Attachment {
  id: string;
  name: string;
  url: string; // data URL for now
  kind: "image" | "file";
  addedAt: string; // ISO
}

export interface Contact {
  id: string; // slug, e.g. "sarah-johnson"
  name: string; // derived from first/last for backward-compat UI
  firstName?: string;
  middleName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  rxNotifyPhone?: string;
  address?: string;
  address1?: string;
  city?: string;
  state?: string;
  zip?: string;
  dateOfBirth?: string; // ISO
  emergencyContact?: string;
  gender?: string;
  language?: string;
  status?: string; // Active/Inactive/etc.
  avatarUrl?: string;
  medical?: MedicalInfo;
  insurance?: InsuranceInfo;
  archived?: boolean;
  notes?: Note[];
  attachments?: Attachment[];
  timeline?: TimelineEvent[];
}

const STORAGE_KEY = "pillconnect:contacts";

function seed(): Contact[] {
  const seedContacts: Contact[] = [
    {
      id: "sarah-johnson",
      name: "Sarah Johnson",
      email: "sarah.j@email.com",
      phone: "(914) 555–0123",
      address: "123 Main St, Mount Vernon",
      dateOfBirth: "1988-04-12",
      emergencyContact: "Mark Johnson — (914) 555–0100",
      avatarUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2",
      medical: {
        primaryPhysician: "Dr. Michael Chen",
        lastVisit: "March 15, 2024",
        nextAppointment: "April 2, 2024",
        pharmacyLocation: "Mount Vernon",
        medications: [
          { name: "Lisinopril 10mg", instructions: "Take once daily", status: "active", prescribedBy: "Dr. Chen" },
          { name: "Metformin 500mg", instructions: "Take twice daily with meals", status: "refill-due", prescribedBy: "Dr. Chen" },
          { name: "Amoxicillin 500mg", instructions: "Take three times daily", status: "discontinued", endedOn: "March 1, 2024" },
        ],
      },
      insurance: {
        provider: "Acme Health",
        memberId: "SJ-12345",
        groupNumber: "GRP-001",
        planName: "Gold PPO",
      },
      archived: false,
    },
    {
      id: "michael-chen",
      name: "Michael Chen",
      email: "michael.c@email.com",
      phone: "(914) 555–0124",
      address: "456 Park Ave, New Rochelle",
      avatarUrl: "https://images.unsplash.com/photo-1566492031773-4f4e44671857",
      medical: {
        primaryPhysician: "Dr. Roberts",
        lastVisit: "2 weeks ago",
        pharmacyLocation: "New Rochelle",
        medications: [],
      },
      insurance: { provider: "Acme Health", memberId: "MC-12346" },
      archived: false,
    },
    {
      id: "emily-rodriguez",
      name: "Emily Rodriguez",
      email: "emily.r@email.com",
      phone: "(914) 555–0125",
      address: "789 Oak Dr, Mount Vernon",
      avatarUrl: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04",
      medical: { primaryPhysician: "Dr. Chen", pharmacyLocation: "Mount Vernon" },
      insurance: { provider: "WellCare", memberId: "ER-12347" },
      archived: false,
    },
  ];
  return seedContacts;
}

export function getContacts(): Contact[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = seed();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(raw) as Contact[];
  } catch {
    return seed();
  }
}

export function saveContacts(contacts: Contact[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
}

export function addContact(contact: Contact): void {
  const list = getContacts();
  saveContacts([contact, ...list]);
}

export function findContactById(id: string): Contact | undefined {
  return getContacts().find(c => c.id === id);
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function updateContact(updated: Contact): void {
  const list = getContacts().map(c => (c.id === updated.id ? { ...c, ...updated } : c));
  saveContacts(list);
}

export function setArchived(id: string, archived: boolean): void {
  const list = getContacts().map(c => (c.id === id ? { ...c, archived } : c));
  saveContacts(list);
}

export function bulkSetArchived(ids: string[], archived: boolean): void {
  const idSet = new Set(ids);
  const list = getContacts().map(c => (idSet.has(c.id) ? { ...c, archived } : c));
  saveContacts(list);
}

// Medication management helpers
export function addMedication(contactId: string, medication: Medication): void {
  const list = getContacts();
  const idx = list.findIndex(c => c.id === contactId);
  if (idx === -1) return;
  const existingMeds = list[idx].medical?.medications ?? [];
  const updated: Contact = {
    ...list[idx],
    medical: {
      ...list[idx].medical,
      medications: [medication, ...existingMeds],
    },
  };
  list[idx] = updated;
  saveContacts(list);
}

export function updateMedicationAt(contactId: string, medIndex: number, patch: Partial<Medication>): void {
  const list = getContacts();
  const cIdx = list.findIndex(c => c.id === contactId);
  if (cIdx === -1) return;
  const meds = list[cIdx].medical?.medications ?? [];
  if (medIndex < 0 || medIndex >= meds.length) return;
  const updatedMed: Medication = { ...meds[medIndex], ...patch };
  const newMeds = [...meds];
  newMeds[medIndex] = updatedMed;
  const updated: Contact = {
    ...list[cIdx],
    medical: { ...list[cIdx].medical, medications: newMeds },
  };
  list[cIdx] = updated;
  saveContacts(list);
}

export function stopMedicationAt(contactId: string, medIndex: number, endedOn?: string): void {
  const endDate = endedOn ?? new Date().toLocaleDateString();
  updateMedicationAt(contactId, medIndex, { status: "discontinued", endedOn: endDate });
}

export function hasRefillDue(contact: Contact): boolean {
  const dueStates = new Set(["refill-due", "refill-requested", "refill-approved", "refill-ready"]);
  return (contact.medical?.medications ?? []).some(m => dueStates.has(m.status));
}

export function addNote(contactId: string, text: string, author?: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const list = getContacts();
  const idx = list.findIndex(c => c.id === contactId);
  if (idx === -1) return;
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const note: Note = { id, text: trimmed, createdAt: new Date().toISOString(), author, pinned: false };
  const existing = list[idx].notes ?? [];
  const timelineEvent: TimelineEvent = { id: `t_${id}`, createdAt: note.createdAt, type: "note", summary: `Note added${author ? ` by ${author}` : ""}`, data: { noteId: id } };
  const updated: Contact = { ...list[idx], notes: [note, ...existing], timeline: [timelineEvent, ...(list[idx].timeline ?? [])] };
  list[idx] = updated;
  saveContacts(list);
}

export function updateNote(contactId: string, noteId: string, patch: Partial<Note>): void {
  const list = getContacts();
  const cIdx = list.findIndex(c => c.id === contactId);
  if (cIdx === -1) return;
  const notes = list[cIdx].notes ?? [];
  const nIdx = notes.findIndex(n => n.id === noteId);
  if (nIdx === -1) return;
  const updatedNote: Note = { ...notes[nIdx], ...patch, updatedAt: new Date().toISOString() };
  const newNotes = [...notes];
  newNotes[nIdx] = updatedNote;
  list[cIdx] = { ...list[cIdx], notes: newNotes };
  saveContacts(list);
}

export function deleteNote(contactId: string, noteId: string): void {
  const list = getContacts();
  const cIdx = list.findIndex(c => c.id === contactId);
  if (cIdx === -1) return;
  const notes = list[cIdx].notes ?? [];
  list[cIdx] = { ...list[cIdx], notes: notes.filter(n => n.id !== noteId) };
  saveContacts(list);
}

export function togglePinNote(contactId: string, noteId: string): void {
  const list = getContacts();
  const cIdx = list.findIndex(c => c.id === contactId);
  if (cIdx === -1) return;
  const notes = list[cIdx].notes ?? [];
  const nIdx = notes.findIndex(n => n.id === noteId);
  if (nIdx === -1) return;
  const newNotes = [...notes];
  newNotes[nIdx] = { ...newNotes[nIdx], pinned: !newNotes[nIdx].pinned };
  // Keep pinned notes at top
  newNotes.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  list[cIdx] = { ...list[cIdx], notes: newNotes };
  saveContacts(list);
}

export function setMedicationStatus(contactId: string, medIndex: number, status: Medication["status"]): void {
  const list = getContacts();
  const cIdx = list.findIndex(c => c.id === contactId);
  if (cIdx === -1) return;
  const meds = list[cIdx].medical?.medications ?? [];
  if (medIndex < 0 || medIndex >= meds.length) return;
  meds[medIndex] = { ...meds[medIndex], status };
  const event: TimelineEvent = {
    id: `t_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
    type: "medication-status",
    summary: `${meds[medIndex].name}: ${status.replace(/-/g, " ")}`,
    data: { index: medIndex, status },
  };
  const updated: Contact = {
    ...list[cIdx],
    medical: { ...list[cIdx].medical, medications: meds },
    timeline: [event, ...(list[cIdx].timeline ?? [])],
  };
  list[cIdx] = updated;
  saveContacts(list);
}

export function latestMedicationStatus(contact: Contact): Medication["status"] | undefined {
  const meds = contact.medical?.medications ?? [];
  if (meds.length === 0) return undefined;
  // Assume first in list is most recent (we prepend on add)
  return meds[0].status;
}

export function medicationBadgeFor(contact: Contact): { label: string; variant: "warning" | "success" | "neutral" } | null {
  const status = latestMedicationStatus(contact);
  if (!status) return null;
  switch (status) {
    case "refill-requested":
      return { label: "Refill Requested", variant: "warning" };
    case "refill-approved":
      return { label: "Refill Approved", variant: "warning" };
    case "refill-ready":
      return { label: "Ready", variant: "success" };
    case "refill-due":
      return { label: "Refill Due", variant: "warning" };
    case "picked-up":
      return { label: "Picked Up", variant: "neutral" };
    default:
      return null;
  }
}

export function findDuplicateContact(email?: string, phone?: string, excludeId?: string): Contact | undefined {
  const lower = (s?: string) => (s ? s.trim().toLowerCase() : "");
  const normalizedPhone = (s?: string) => (s ? s.replace(/\D/g, "") : "");
  return getContacts().find(c => {
    if (excludeId && c.id === excludeId) return false;
    const emailMatch = email && lower(c.email) === lower(email);
    const phoneMatch = phone && normalizedPhone(c.phone) === normalizedPhone(phone);
    return Boolean(emailMatch || phoneMatch);
  });
}

export function mergeContacts(targetId: string, sourceId: string): Contact | undefined {
  const list = getContacts();
  const tIdx = list.findIndex(c => c.id === targetId);
  const sIdx = list.findIndex(c => c.id === sourceId);
  if (tIdx === -1 || sIdx === -1) return undefined;
  const target = list[tIdx];
  const source = list[sIdx];
  const merged: Contact = {
    ...target,
    firstName: target.firstName || source.firstName,
    middleName: target.middleName || source.middleName,
    lastName: target.lastName || source.lastName,
    name: target.name || source.name,
    gender: target.gender || source.gender,
    email: target.email || source.email,
    phone: target.phone || source.phone,
    rxNotifyPhone: target.rxNotifyPhone || source.rxNotifyPhone,
    address1: target.address1 || source.address1,
    city: target.city || source.city,
    state: target.state || source.state,
    zip: target.zip || source.zip,
    language: target.language || source.language,
    status: target.status || source.status,
    dateOfBirth: target.dateOfBirth || source.dateOfBirth,
    emergencyContact: target.emergencyContact || source.emergencyContact,
    medical: {
      ...(target.medical ?? {}),
      ...(source.medical ?? {}),
      medications: [ ...(target.medical?.medications ?? []), ...(source.medical?.medications ?? []) ],
    },
    insurance: { ...(target.insurance ?? {}), ...(source.insurance ?? {}) },
    notes: [ ...(target.notes ?? []), ...(source.notes ?? []) ],
    attachments: [ ...(target.attachments ?? []), ...(source.attachments ?? []) ],
    timeline: [ ...(target.timeline ?? []), ...(source.timeline ?? []) ],
  };
  const newList = list.filter(c => c.id !== sourceId);
  const idx = newList.findIndex(c => c.id === targetId);
  newList[idx] = merged;
  saveContacts(newList);
  return merged;
}

export function setStatus(id: string, status: string): void {
  const list = getContacts().map(c => (c.id === id ? { ...c, status } : c));
  saveContacts(list);
}

export function bulkSetStatus(ids: string[], status: string): void {
  const set = new Set(ids);
  const list = getContacts().map(c => (set.has(c.id) ? { ...c, status } : c));
  saveContacts(list);
}

export function setPharmacyLocation(id: string, location: string): void {
  const list = getContacts().map(c => (c.id === id ? { ...c, medical: { ...c.medical, pharmacyLocation: location } } : c));
  saveContacts(list);
}

export function bulkSetPharmacyLocation(ids: string[], location: string): void {
  const set = new Set(ids);
  const list = getContacts().map(c => (set.has(c.id) ? { ...c, medical: { ...c.medical, pharmacyLocation: location } } : c));
  saveContacts(list);
}

export function setPrimaryPhysician(id: string, physician: string): void {
  const list = getContacts().map(c => (c.id === id ? { ...c, medical: { ...c.medical, primaryPhysician: physician } } : c));
  saveContacts(list);
}

export function bulkAssignPrimaryPhysician(ids: string[], physician: string): void {
  const set = new Set(ids);
  const list = getContacts().map(c => (set.has(c.id) ? { ...c, medical: { ...c.medical, primaryPhysician: physician } } : c));
  saveContacts(list);
}

export function addAttachment(contactId: string, att: Omit<Attachment, "id" | "addedAt">): Attachment | undefined {
  const list = getContacts();
  const idx = list.findIndex(c => c.id === contactId);
  if (idx === -1) return undefined;
  const id = `a_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const attachment: Attachment = { id, name: att.name, url: att.url, kind: att.kind, addedAt: new Date().toISOString() };
  const contact = list[idx];
  const updated: Contact = { ...contact, attachments: [attachment, ...(contact.attachments ?? [])], timeline: [{ id: `t_${id}`, createdAt: attachment.addedAt, type: "attachment", summary: `Attachment added: ${att.name}`, data: { attachmentId: id } }, ...(contact.timeline ?? [])] };
  list[idx] = updated;
  saveContacts(list);
  return attachment;
}

export function removeAttachment(contactId: string, attachmentId: string): void {
  const list = getContacts();
  const idx = list.findIndex(c => c.id === contactId);
  if (idx === -1) return;
  const c = list[idx];
  const updated: Contact = { ...c, attachments: (c.attachments ?? []).filter(a => a.id !== attachmentId) };
  list[idx] = updated;
  saveContacts(list);
}

export function getTimeline(contactId: string): TimelineEvent[] {
  const c = findContactById(contactId);
  return (c?.timeline ?? []).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}


