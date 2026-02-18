"use client";

import React, { useEffect, useState } from "react";
import { DefaultPageLayout } from "@/ui/layouts/DefaultPageLayout";
import PharmacySidebar from "@/components/PharmacySidebar";
import { TextField } from "@/ui/components/TextField";
import { Select } from "@/ui/components/Select";
import { Button } from "@/ui/components/Button";
import { Toast } from "@/ui/components/Toast";
import { Contact } from "@/models/contacts";
import { fetchContactBySlug, upsertContact } from "@/lib/contactsApi";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

export default function EditContact() {
  const navigate = useNavigate();
  const { patientId } = useParams();
  const [contact, setContact] = useState<Contact | undefined>();
  const [form, setForm] = useState<any>({});
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string>("");
  const [toast, setToast] = useState<string>("");

  useEffect(() => {
    (async () => {
      const c = patientId ? await fetchContactBySlug(patientId) : undefined;
      setContact(c);
      if (c) {
         setForm({
        firstName: c.firstName ?? "",
        middleName: c.middleName ?? "",
        lastName: c.lastName ?? "",
        dateOfBirth: c.dateOfBirth ?? "",
        gender: c.gender ?? "",
        phone: c.phone ?? "",
        rxNotifyPhone: c.rxNotifyPhone ?? "",
        email: c.email ?? "",
        address1: c.address1 ?? c.address ?? "",
        city: c.city ?? "",
        state: c.state ?? "",
        zip: c.zip ?? "",
        language: c.language ?? "",
        status: c.status ?? "Active",
        emergencyContact: c.emergencyContact ?? "",
        pharmacyLocation: c.medical?.pharmacyLocation ?? "",
         // primaryPhysician removed
        insuranceProvider: c.insurance?.provider ?? "",
        memberId: c.insurance?.memberId ?? "",
        groupNumber: c.insurance?.groupNumber ?? "",
        planName: c.insurance?.planName ?? "",
        contactType: (c as any)?.contactType || 'patient',
        });
      }
    })();
  }, [patientId]);

  const onChange = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setDirty(true);
    setForm((prev: any) => ({ ...prev, [key]: e.target.value }));
  };

  async function save() {
    // Ensure session is valid before attempting DB writes
    try {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        setError('Your session expired. Please sign in again.');
        try { await supabase.auth.signOut(); } catch {}
        setTimeout(() => navigate('/login'), 600);
        return;
      }
    } catch {}
    setError("");
    // Dev: allow partial saves
    const name = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(" ");
    const base: any = contact || { id: patientId || '', name: '' };
    const updated: Contact = {
      ...base,
      name,
      firstName: form.firstName || undefined,
      middleName: form.middleName || undefined,
      lastName: form.lastName || undefined,
      gender: form.gender || undefined,
      email: form.email || undefined,
      phone: form.phone || undefined,
      rxNotifyPhone: form.rxNotifyPhone || undefined,
      address1: form.address1 || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      zip: form.zip || undefined,
      language: form.language || undefined,
      status: form.status || undefined,
      dateOfBirth: form.dateOfBirth || undefined,
      emergencyContact: form.emergencyContact || undefined,
      medical: {
        ...((contact && contact.medical) ? contact.medical : {} as any),
        pharmacyLocation: form.pharmacyLocation || undefined,
      },
      insurance: {
        ...((contact && contact.insurance) ? contact.insurance : {} as any),
        provider: form.insuranceProvider || undefined,
        memberId: form.memberId || undefined,
        groupNumber: form.groupNumber || undefined,
        planName: form.planName || undefined,
      },
      ...(form.contactType ? { contactType: form.contactType as any } : {}),
    };
    // If editing a placeholder tel- slug, call server RPC to convert in place to avoid RLS/update mismatches
    let saved: Contact;
    const placeholderSlug = (contact?.id || patientId || '').toString();
    if (placeholderSlug.startsWith('tel-')) {
      const { error } = await supabase.rpc('convert_placeholder_contact', {
        p_slug: placeholderSlug,
        p_first_name: form.firstName || '',
        p_middle_name: form.middleName || '',
        p_last_name: form.lastName || '',
        p_email: form.email || '',
        p_phone: form.phone || '',
        p_rx_notify_phone: form.rxNotifyPhone || '',
        p_address1: form.address1 || '',
        p_city: form.city || '',
        p_state: form.state || '',
        p_zip: form.zip || '',
        p_status: form.status || '',
        p_pharmacy_location: form.pharmacyLocation || ''
      });
      if (error) throw error as any;
      saved = { ...updated, id: placeholderSlug };
    } else {
      saved = await upsertContact(updated);
    }
    setToast("Contact updated");
    setDirty(false);
    try {
      // Broadcast a lightweight event so Messages page can refresh the header/display
      window.dispatchEvent(new CustomEvent('pc_contact_saved', { detail: { slug: saved.id, name: saved.name, pharmacy_location: saved.medical?.pharmacyLocation } }));
    } catch {}
    setTimeout(() => navigate(`/contacts/${saved.id}`), 600);
  }

  return (
    <DefaultPageLayout>
      <div className="flex h-full w-full items-stretch">
        <PharmacySidebar active="contacts" />
        <div className="flex h-full w-full flex-col items-start">
          <div className="flex w-full items-center justify-between border-b border-solid border-neutral-border px-6 py-4">
            <span className="text-heading-2 font-heading-2 text-default-font">Edit Contact</span>
            <div className="flex items-center gap-2">
              <Button variant="neutral-secondary" onClick={() => dirty ? setError("You have unsaved changes") : navigate(-1)}>Cancel</Button>
              <Button onClick={save} disabled={!dirty}>Save Changes</Button>
            </div>
          </div>
          {contact ? (
            <div className="flex w-full grow shrink-0 basis-0 flex-col gap-8 px-6 py-6 overflow-auto">
              {/* Basic Info (aligned to image fields) */}
              <div className="flex w-full flex-col gap-4 rounded-md border border-solid border-neutral-border bg-default-background px-6 py-6">
                <span className="text-heading-3 font-heading-3 text-default-font">Basic Information</span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <TextField variant="filled" label="First Name" helpText=""><TextField.Input value={form.firstName} onChange={onChange("firstName")} /></TextField>
                  <TextField variant="filled" label="Middle Name" helpText=""><TextField.Input value={form.middleName} onChange={onChange("middleName")} /></TextField>
                  <TextField variant="filled" label="Last Name" helpText=""><TextField.Input value={form.lastName} onChange={onChange("lastName")} /></TextField>
                  <TextField variant="filled" label="DOB" helpText=""><TextField.Input value={form.dateOfBirth} onChange={onChange("dateOfBirth")} /></TextField>
                  <TextField variant="filled" label="Gender" helpText=""><TextField.Input value={form.gender} onChange={onChange("gender")} /></TextField>
                  <TextField variant="filled" label="Phone" helpText=""><TextField.Input value={form.phone} onChange={onChange("phone")} /></TextField>
                  <TextField variant="filled" label="Rx Notify Phone" helpText=""><TextField.Input value={form.rxNotifyPhone} onChange={onChange("rxNotifyPhone")} /></TextField>
                  <TextField variant="filled" label="Email Address" helpText=""><TextField.Input value={form.email} onChange={onChange("email")} /></TextField>
                  <TextField className="md:col-span-3" variant="filled" label="Address" helpText=""><TextField.Input value={form.address1} onChange={onChange("address1")} /></TextField>
                  <TextField variant="filled" label="City" helpText=""><TextField.Input value={form.city} onChange={onChange("city")} /></TextField>
                  <TextField variant="filled" label="State" helpText=""><TextField.Input value={form.state} onChange={onChange("state")} /></TextField>
                  <TextField variant="filled" label="Zip" helpText=""><TextField.Input value={form.zip} onChange={onChange("zip")} /></TextField>
                  <TextField variant="filled" label="Language" helpText=""><TextField.Input value={form.language} onChange={onChange("language")} /></TextField>
                  <TextField variant="filled" label="Status" helpText=""><TextField.Input value={form.status} onChange={onChange("status")} /></TextField>
                  <TextField className="md:col-span-3" variant="filled" label="Emergency Contact" helpText=""><TextField.Input value={form.emergencyContact} onChange={onChange("emergencyContact")} /></TextField>
                </div>
              </div>
              {/* Medical Info */}
              <div className="flex w-full flex-col gap-4 rounded-md border border-solid border-neutral-border bg-default-background px-6 py-6">
                <span className="text-heading-3 font-heading-3 text-default-font">Medical Information</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Select className="md:col-span-1" variant="filled" label="Pharmacy Location" placeholder="Choose pharmacy" value={form.pharmacyLocation} onValueChange={(v) => { setDirty(true); setForm((p:any)=>({ ...p, pharmacyLocation: v })); }}>
                    <Select.Item value="Mount Vernon">Mount Vernon</Select.Item>
                    <Select.Item value="New Rochelle">New Rochelle</Select.Item>
                    
                  </Select>
                  <Select className="md:col-span-1" variant="filled" label="Contact Type" placeholder="Type" value={form.contactType} onValueChange={(v) => { setDirty(true); setForm((p:any)=>({ ...p, contactType: v })); }}>
                    <Select.Item value="patient">Patient</Select.Item>
                    <Select.Item value="provider">Provider</Select.Item>
                    <Select.Item value="social_worker">Social Worker</Select.Item>
                  </Select>
                </div>
              </div>
              {/* Insurance Info */}
              <div className="flex w-full flex-col gap-4 rounded-md border border-solid border-neutral-border bg-default-background px-6 py-6">
                <span className="text-heading-3 font-heading-3 text-default-font">Insurance Information</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TextField variant="filled" label="Provider" helpText="">
                    <TextField.Input value={form.insuranceProvider} onChange={onChange("insuranceProvider")} />
                  </TextField>
                  <TextField variant="filled" label="Plan Name" helpText="">
                    <TextField.Input value={form.planName} onChange={onChange("planName")} />
                  </TextField>
                  <TextField variant="filled" label="Member ID" helpText="">
                    <TextField.Input value={form.memberId} onChange={onChange("memberId")} />
                  </TextField>
                  <TextField variant="filled" label="Group Number" helpText="">
                    <TextField.Input value={form.groupNumber} onChange={onChange("groupNumber")} />
                  </TextField>
                </div>
              </div>
            </div>
          ) : null}
          {error ? (
            <div className="fixed bottom-6 right-6"><Toast variant="error" title="Unable to save" description={error} /></div>
          ) : null}
          {toast ? (
            <div className="fixed bottom-6 right-6"><Toast variant="success" title={toast} /></div>
          ) : null}
        </div>
      </div>
    </DefaultPageLayout>
  );
}


