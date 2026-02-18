"use client";

import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DefaultPageLayout } from "@/ui/layouts/DefaultPageLayout";
import { Button } from "@/ui/components/Button";
import { Badge } from "@/ui/components/Badge";
import { IconWithBackground } from "@/ui/components/IconWithBackground";
import { TextField } from "@/ui/components/TextField";
import { Select } from "@/ui/components/Select";
import { addAttachment as dbAddAttachment, listAttachments as dbListAttachments, removeAttachment as dbRemoveAttachment, fetchContactBySlug, getDbIdBySlug, listNotes as dbListNotes, addNote as dbAddNote, updateNote as dbUpdateNote, deleteNote as dbDeleteNote, listMessageAttachmentsForContact as dbListMsgAttachments, addMedication as dbAddMedication, listMedications as dbListMedications, updateMedication as dbUpdateMedication, stopMedication as dbStopMedication } from "@/lib/contactsApi";
import { uploadToAttachmentsBucket } from "@/lib/storage";
import PharmacySidebar from "@/components/PharmacySidebar";

export default function ContactProfileView() {
  const { patientId } = useParams();
  const [contact, setContact] = React.useState<any | undefined>(undefined);
  const [dbContactId, setDbContactId] = React.useState<string | null>(null);
  const navigate = useNavigate();
  const [adding, setAdding] = React.useState(false);
  const [newMed, setNewMed] = React.useState({ name: "", instructions: "" });
  const [meds, setMeds] = React.useState<Array<{ id: string; name: string; instructions: string; status: string }>>([]);
  const [noteText, setNoteText] = React.useState("");
  const [notes, setNotes] = React.useState<Array<{ id: string; text: string; author: string | null; pinned: boolean | null; created_at: string }>>([]);
  React.useEffect(() => {
    (async () => {
      if (!patientId) return;
      // Resolve by slug with a retry to avoid immediate post-insert lag
      let c = await fetchContactBySlug(patientId);
      if (!c) {
        await new Promise(r => setTimeout(r, 200));
        c = await fetchContactBySlug(patientId);
      }
      setContact(c);
      const id = await getDbIdBySlug(patientId);
      setDbContactId(id);
      // Load medications and notes from DB
      if (id) {
        const medsList = await dbListMedications(id);
        setMeds(medsList as any);
        const ns = await dbListNotes(id);
        setNotes(ns);
      }
    })();
  }, [patientId]);
  const valueOr = (v?: string, placeholder?: string) => (v && v.trim().length ? v : (placeholder ?? "—"));
  const [tab, setTab] = React.useState<"overview" | "attachments">("overview");
  const [files, setFiles] = React.useState<Array<{ id: string; name: string; url: string; kind: "image" | "file"; added_at: string }>>([]);
  React.useEffect(() => {
    (async () => {
      if (!patientId) return;
      const realId = await getDbIdBySlug(patientId);
      setDbContactId(realId);
      if (!realId) return;
      const [contactFiles, chatFiles] = await Promise.all([
        dbListAttachments(realId),
        dbListMsgAttachments(realId)
      ]);
      // De-duplicate by URL
      const byUrl = new Map<string, any>();
      [...contactFiles, ...chatFiles].forEach(f => byUrl.set(f.url, f));
      setFiles(Array.from(byUrl.values()));
    })();
  }, [patientId]);
  return (
    <DefaultPageLayout>
      <div className="flex h-full w-full items-stretch">
        <PharmacySidebar active="contacts" />
        <div className="flex h-full w-full min-h-0 items-start justify-center bg-default-background overflow-auto">
          <div className="flex max-w-[1280px] grow shrink-0 basis-0 flex-col items-start gap-8 px-12 py-12 mobile:px-4 mobile:py-4">
            <div className="flex w-full flex-col items-start gap-6">
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-heading-1 font-heading-1 text-default-font">
                      {([contact?.firstName, contact?.middleName, contact?.lastName].filter(Boolean).join(" ") || contact?.name || patientId?.split("-").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" ") || "Sarah Johnson")}
                    </span>
                    <span className="text-body-bold font-body-bold text-subtext-color">
                    {contact?.dateOfBirth ? `DOB: ${contact.dateOfBirth}` : ""}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="neutral-secondary" onClick={() => navigate("/contacts")}>Back</Button>
                  <Button variant="brand-tertiary" onClick={() => navigate(`/contacts/${patientId}/edit`)}>Edit</Button>
                  <Button variant="neutral-secondary" onClick={async () => {
                    // Match Contacts card behavior: navigate by slug so the messages page performs slug-based ensure/migrate
                    const slug = patientId || (contact?.id ?? "");
                    navigate(`/messages?patientId=${slug}`);
                  }}>
                    Message
                  </Button>
                  <Button variant="neutral-tertiary" onClick={async () => {
                    const ok = confirm('Delete this contact? This will also remove related conversations/messages.');
                    if (!ok) return;
                    try {
                      // Try by DB id first, then fallback to slug
                      const targetId = contact?.id ?? null;
                      const isUuid = targetId ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId) : false;
                      if (targetId && isUuid) {
                        await (await import('@/lib/contactsApi')).deleteContacts([targetId]);
                      } else if (patientId) {
                        await (await import('@/lib/contactsApi')).deleteContactsBySlug([patientId]);
                      }
                      navigate('/contacts');
                    } catch (e: any) {
                      alert(e?.message ?? 'Failed to delete');
                    }
                  }}>Delete</Button>
                  
                </div>
              </div>
              <div className="flex items-center gap-2">
                {contact?.medical?.primaryPhysician ? <Badge variant="neutral">Primary Care</Badge> : null}
              </div>
            </div>
            <div className="flex w-full items-center gap-4">
              <Button variant={tab === "overview" ? "brand-tertiary" : "neutral-tertiary"} onClick={()=> setTab("overview")}>Overview</Button>
              <Button variant={tab === "attachments" ? "brand-tertiary" : "neutral-tertiary"} onClick={()=> setTab("attachments")}>Attachments</Button>
            </div>

            {tab === "overview" ? (
            <div className="flex w-full flex-col items-start gap-6">
              <span className="text-heading-2 font-heading-2 text-default-font">Contact Information</span>
              <div className="flex w-full flex-col items-start gap-4 rounded-md border border-solid border-neutral-border bg-default-background px-6 py-6">
                <div className="grid w-full grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center gap-2"><IconWithBackground variant="neutral" size="small" /><span className="text-subtext-color">First Name</span><span className="ml-auto text-default-font">{valueOr(contact?.firstName)}</span></div>
                  <div className="flex items-center gap-2"><IconWithBackground variant="neutral" size="small" /><span className="text-subtext-color">Last Name</span><span className="ml-auto text-default-font">{valueOr(contact?.lastName)}</span></div>
                  <div className="flex items-center gap-2"><IconWithBackground variant="neutral" size="small" /><span className="text-subtext-color">DOB</span><span className="ml-auto text-default-font">{valueOr(contact?.dateOfBirth)}</span></div>
                  <div className="flex items-center gap-2"><IconWithBackground variant="neutral" size="small" /><span className="text-subtext-color">Gender</span><span className="ml-auto text-default-font">{valueOr(contact?.gender)}</span></div>
                  <div className="flex items-center gap-2"><IconWithBackground variant="neutral" size="small" /><span className="text-subtext-color">Phone</span><span className="ml-auto text-default-font">{valueOr(contact?.phone)}</span></div>
                  <div className="flex items-center gap-2"><IconWithBackground variant="neutral" size="small" /><span className="text-subtext-color">Rx Notify Phone</span><span className="ml-auto text-default-font">{valueOr(contact?.rxNotifyPhone, contact?.phone)}</span></div>
                  <div className="flex items-center gap-2 md:col-span-2"><IconWithBackground variant="neutral" size="small" /><span className="text-subtext-color">Email Address</span><span className="ml-auto text-default-font">{valueOr(contact?.email)}</span></div>
                  <div className="flex items-center gap-2 md:col-span-2"><IconWithBackground variant="neutral" size="small" /><span className="text-subtext-color">Address</span><span className="ml-auto text-default-font">{valueOr(contact?.address1)}</span></div>
                  <div className="flex items-center gap-2"><IconWithBackground variant="neutral" size="small" /><span className="text-subtext-color">City</span><span className="ml-auto text-default-font">{valueOr(contact?.city)}</span></div>
                  <div className="flex items-center gap-2"><IconWithBackground variant="neutral" size="small" /><span className="text-subtext-color">State</span><span className="ml-auto text-default-font">{valueOr(contact?.state)}</span></div>
                  <div className="flex items-center gap-2"><IconWithBackground variant="neutral" size="small" /><span className="text-subtext-color">Zip</span><span className="ml-auto text-default-font">{valueOr(contact?.zip)}</span></div>
                  <div className="flex items-center gap-2"><IconWithBackground variant="neutral" size="small" /><span className="text-subtext-color">Language</span><span className="ml-auto text-default-font">{valueOr(contact?.language, "English")}</span></div>
                  <div className="flex items-center gap-2"><IconWithBackground variant="neutral" size="small" /><span className="text-subtext-color">Status</span><span className="ml-auto text-default-font">{valueOr(contact?.status, "Active")}</span></div>
                  <div className="flex items-center gap-2 md:col-span-2"><IconWithBackground variant="neutral" size="small" /><span className="text-subtext-color">Emergency Contact</span><span className="ml-auto text-default-font">{valueOr(contact?.emergencyContact)}</span></div>
                </div>
              </div>
            </div>
            ) : null}
            {tab === "overview" ? (
            <div className="flex w-full flex-col items-start gap-6">
              <span className="text-heading-2 font-heading-2 text-default-font">Medical Information</span>
              <div className="flex w-full flex-col items-start gap-4 rounded-md border border-solid border-neutral-border bg-default-background px-6 py-6">
                <div className="grid w-full grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center gap-2"><IconWithBackground variant="neutral" size="small" /><span className="text-subtext-color">Pharmacy Location</span><span className="ml-auto text-default-font">{valueOr(contact?.medical?.pharmacyLocation)}</span></div>
                </div>
              </div>
            </div>
            ) : null}
            {tab === "overview" ? (
            <div className="flex w-full flex-col items-start gap-6">
              <span className="text-heading-2 font-heading-2 text-default-font">Medications</span>
              <div className="flex w-full flex-col items-start gap-4 rounded-md border border-solid border-neutral-border bg-default-background px-6 py-6">
                <div className="flex w-full items-end gap-3">
                  <Button variant="brand-tertiary" onClick={() => setAdding(v => !v)}>{adding ? "Cancel" : "Add Medication"}</Button>
                  {adding ? (
                    <div className="flex items-end gap-3 ml-auto">
                      <TextField className="h-auto w-56 flex-none" variant="filled" label="Name" helpText="">
                        <TextField.Input value={newMed.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewMed({ ...newMed, name: e.target.value })} />
                      </TextField>
                      <TextField className="h-auto w-64 flex-none" variant="filled" label="Instructions" helpText="">
                        <TextField.Input value={newMed.instructions} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewMed({ ...newMed, instructions: e.target.value })} />
                      </TextField>
                      <Button className="self-end" onClick={async () => { if (!dbContactId || !newMed.name.trim()) return; await dbAddMedication(dbContactId, { name: newMed.name.trim(), instructions: newMed.instructions.trim(), status: "active" }); const medsList = await dbListMedications(dbContactId); setMeds(medsList as any); setNewMed({ name: "", instructions: "" }); setAdding(false); }}>Save</Button>
                    </div>
                  ) : null}
                </div>
                <div className="flex w-full flex-col items-start gap-4">
                  {meds.map((m, idx) => (
                    <React.Fragment key={m.name + idx}>
                      {idx > 0 ? <div className="flex h-px w-full flex-none bg-neutral-border" /> : null}
                      <div className="flex w-full items-center justify-between">
                        <div className="flex items-center gap-4">
                          <IconWithBackground variant={m.status === "active" ? "success" : (m.status === "refill-due" || m.status === "refill-requested" || m.status === "refill-approved" || m.status === "refill-ready") ? "warning" : "neutral"} size="small" />
                          <div className="flex flex-col items-start">
                            <span className="text-body-bold font-body-bold text-default-font">{m.name}</span>
                            <span className="text-caption font-caption text-subtext-color">{m.instructions}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {m.status === "active" ? <Badge variant="success">Active</Badge> : m.status === "refill-due" ? <Badge variant="warning">Refill Due</Badge> : m.status === "refill-requested" ? <Badge variant="warning">Refill Requested</Badge> : m.status === "refill-approved" ? <Badge variant="warning">Refill Approved</Badge> : m.status === "refill-ready" ? <Badge variant="success">Ready</Badge> : m.status === "picked-up" ? <Badge variant="neutral">Picked Up</Badge> : <Badge variant="neutral">Discontinued</Badge>}
                          <Select variant="filled" placeholder="Set Status" value={m.status} onValueChange={async (v) => { if (!dbContactId) return; await dbUpdateMedication(dbContactId, meds[idx].id as any, { status: v as any }); const medsList = await dbListMedications(dbContactId); setMeds(medsList as any); }}>
                            <Select.Item value="active">Active</Select.Item>
                            <Select.Item value="refill-due">Refill Due</Select.Item>
                            <Select.Item value="refill-requested">Refill Requested</Select.Item>
                            <Select.Item value="refill-approved">Refill Approved</Select.Item>
                            <Select.Item value="refill-ready">Refill Ready</Select.Item>
                            <Select.Item value="picked-up">Picked Up</Select.Item>
                            <Select.Item value="discontinued">Discontinued</Select.Item>
                          </Select>
                          <Button variant="neutral-secondary" size="small" onClick={async () => { const name = prompt("Edit name", m.name) ?? m.name; const instructions = prompt("Edit instructions", m.instructions) ?? m.instructions; if (!dbContactId) return; await dbUpdateMedication(dbContactId, meds[idx].id as any, { name, instructions }); const medsList = await dbListMedications(dbContactId); setMeds(medsList as any); }}>Edit</Button>
                          {m.status !== "discontinued" ? (
                            <Button variant="neutral-tertiary" size="small" onClick={async () => { if (!dbContactId) return; await dbStopMedication(dbContactId, meds[idx].id as any); const medsList = await dbListMedications(dbContactId); setMeds(medsList as any); }}>Stop</Button>
                          ) : null}
                        </div>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
            ) : null}

            

            {tab === "attachments" ? (
              <div className="flex w-full flex-col items-start gap-6">
                <span className="text-heading-2 font-heading-2 text-default-font">Attachments</span>
                <div className="flex w-full flex-col items-start gap-4 rounded-md border border-solid border-neutral-border bg-default-background px-6 py-6">
                  <input type="file" accept="image/*,.pdf" onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f || !patientId) return;
                    const targetId = dbContactId ?? (patientId ? await getDbIdBySlug(patientId) : null);
                    if (!targetId) return;
                    const prefix = `contacts/${targetId}`;
                    const { url } = await uploadToAttachmentsBucket(f, prefix);
                    await dbAddAttachment(targetId, { name: f.name, url, kind: f.type.includes("image") ? "image" : "file" });
                    const [contactFiles2, chatFiles2] = await Promise.all([
                      dbListAttachments(targetId),
                      dbListMsgAttachments(targetId)
                    ]);
                    const byUrl2 = new Map<string, any>();
                    [...contactFiles2, ...chatFiles2].forEach(f => byUrl2.set(f.url, f));
                    setFiles(Array.from(byUrl2.values()));
                  }} />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
                    {files.map((a) => (
                      <div key={a.id} className="flex flex-col items-start gap-2 rounded border border-neutral-border p-3">
                        {a.kind === "image" ? (
                          <img src={a.url} alt={a.name} className="h-32 w-full object-cover rounded" />
                        ) : (
                          <a href={a.url} target="_blank" rel="noreferrer" className="text-body font-body text-brand-700 underline">{a.name}</a>
                        )}
                        <div className="flex w-full items-center justify-between">
                          <span className="text-caption text-subtext-color">{new Date(a.added_at).toLocaleDateString()}</span>
                          <Button variant="neutral-tertiary" size="small" onClick={async () => { const targetId = dbContactId ?? (patientId ? await getDbIdBySlug(patientId) : null); if (!targetId) return; await dbRemoveAttachment(targetId, a.id); const [contactFiles3, chatFiles3] = await Promise.all([dbListAttachments(targetId), dbListMsgAttachments(targetId)]); const byUrl3 = new Map<string, any>(); [...contactFiles3, ...chatFiles3].forEach(f => byUrl3.set(f.url, f)); setFiles(Array.from(byUrl3.values())); }}>Delete</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="flex w-full flex-col items-start gap-6">
              <span className="text-heading-2 font-heading-2 text-default-font">Recent Notes</span>
              <div className="flex w-full flex-col items-start gap-4 rounded-md border border-solid border-neutral-border bg-default-background px-6 py-6">
                <div className="flex w-full flex-col gap-2">
                  <span className="text-body-bold font-body-bold text-default-font">Add note</span>
                  <div className="flex w-full items-center gap-2">
                    <TextField className="h-auto grow shrink-0 basis-0" variant="filled" label="" helpText="">
                      <TextField.Input
                        placeholder="Type your note here..."
                        value={noteText}
                        onChange={(event: React.ChangeEvent<HTMLInputElement>) => setNoteText(event.target.value)}
                         onKeyDown={async (e: React.KeyboardEvent<HTMLInputElement>) => {
                          if (e.key === "Enter" && noteText.trim() && dbContactId) {
                            await dbAddNote(dbContactId, { text: noteText.trim(), author: "Staff" });
                            setNoteText("");
                            const ns = await dbListNotes(dbContactId);
                            setNotes(ns);
                          }
                        }}
                      />
                    </TextField>
                    <Button onClick={async () => { if (!dbContactId || !noteText.trim()) return; await dbAddNote(dbContactId, { text: noteText.trim(), author: "Staff" }); setNoteText(""); const ns = await dbListNotes(dbContactId); setNotes(ns); }}>Add</Button>
                  </div>
                </div>
                <div className="flex w-full flex-col items-start gap-4">
                  {notes.length === 0 ? (
                    <span className="text-subtext-color">No notes yet.</span>
                  ) : (
                    notes.map((n) => (
                      <div key={n.id} className="flex w-full flex-col items-start gap-1">
                        <div className="flex w-full items-center gap-2">
                          <span className="text-body-bold font-body-bold text-default-font">
                            {n.pinned ? "📌 " : ""}{new Date(n.created_at).toLocaleString()} {n.author ? `— ${n.author}` : ""}
                          </span>
                          <div className="ml-auto flex items-center gap-2">
                            <Button variant="neutral-tertiary" size="small" onClick={async () => { if (!dbContactId) return; const text = prompt("Edit note", n.text) ?? n.text; await dbUpdateNote(dbContactId, n.id, { text }); const ns = await dbListNotes(dbContactId); setNotes(ns); }}>Edit</Button>
                            <Button variant="neutral-secondary" size="small" onClick={async () => { if (!dbContactId) return; await dbDeleteNote(dbContactId, n.id); const ns = await dbListNotes(dbContactId); setNotes(ns); }}>Delete</Button>
                          </div>
                        </div>
                        <span className="text-body font-body text-default-font">{n.text}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DefaultPageLayout>
  );
}


