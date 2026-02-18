"use client";

import React, { useEffect, useState } from "react";
import { DefaultPageLayout } from "@/ui/layouts/DefaultPageLayout";
import PharmacySidebar from "@/components/PharmacySidebar";
import { TextField } from "@/ui/components/TextField";
import { Select } from "@/ui/components/Select";
import { Toast } from "@/ui/components/Toast";
import { Button } from "@/ui/components/Button";
import { slugify, Contact } from "@/models/contacts";
import { upsertContact } from "@/lib/contactsApi";
import { supabase } from "@/lib/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function NewContact() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "",
    phone: "",
    rxNotifyPhone: "",
    email: "",
    address1: "",
    city: "",
    state: "",
    zip: "",
    language: "",
    status: "Active",
    emergencyContact: "",
    pharmacyLocation: "",
    insuranceProvider: "",
    memberId: "",
    groupNumber: "",
    planName: "",
    contactType: "patient",
  });

  const [error, setError] = useState<string>("");
  const [toast, setToast] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [locationOptions, setLocationOptions] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const { data: user } = await supabase.auth.getUser();
        const uid = user?.user?.id;
        if (!uid) return;
        const [{ data: prof }, { data: loc }] = await Promise.all([
          supabase.from('profiles').select('role').eq('id', uid).maybeSingle(),
          supabase.from('user_active_locations').select('selected_location').eq('user_id', uid).maybeSingle(),
        ]);
        const role = (prof as any)?.role as string | undefined;
        const selected = (loc as any)?.selected_location as string | undefined;
        const admin = role === 'admin';
        setIsAdmin(!!admin);
        if (admin) {
          setLocationOptions(["Mount Vernon", "New Rochelle"]);
        } else if (selected) {
          setLocationOptions([selected]);
          setForm(prev => ({ ...prev, pharmacyLocation: prev.pharmacyLocation || selected }));
        }
      } catch {}
    })();
  }, []);

  async function saveAndGo(destination: "profile" | "messages") {
    setError("");
    try {
      const fullName = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(" ") || `contact-${Date.now()}`;
      const normalizedDob = (form.dateOfBirth || "").trim() || undefined;
      const id = slugify(fullName);
      const contact: Contact = {
        id,
        name: fullName,
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
        dateOfBirth: normalizedDob,
        emergencyContact: form.emergencyContact || undefined,
        medical: {
          pharmacyLocation: form.pharmacyLocation || undefined,
        },
        // Extend payload to include contactType (handled by contactsApi.toDb)
        ...(form.contactType ? { contactType: form.contactType as any } : {}),
        insurance: {
          provider: form.insuranceProvider || undefined,
          memberId: form.memberId || undefined,
          groupNumber: form.groupNumber || undefined,
          planName: form.planName || undefined,
        },
      };
      // Save contact first and use the final slug returned from server (location suffix may be added)
      const saved = await upsertContact(contact);
      const finalSlug = saved?.id || id;
      try {
        window.dispatchEvent(new CustomEvent('pc_contact_saved', { detail: { slug: finalSlug, name: fullName, pharmacy_location: form.pharmacyLocation || undefined } }));
      } catch {}
      setToast("Contact created successfully");
      // Then route exactly like the contact card: pass the final slug
      setTimeout(() => {
        if (destination === "profile") navigate(`/contacts/${finalSlug}`);
        else navigate(`/messages?patientId=${finalSlug}`);
      }, 250);
    } catch (e: any) {
      const msg = e?.message ?? "Unable to save contact. Please try again.";
      console.error("Failed to save contact:", e);
      setError(msg);
      try { alert(msg); } catch {}
    }
  }

  const onChange = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  return (
    <DefaultPageLayout>
      <div className="flex h-full w-full items-stretch">
        <PharmacySidebar active="contacts" />
        <div className="flex h-full w-full flex-col items-start">
          <div className="flex w-full items-center justify-between border-b border-solid border-neutral-border px-6 py-4">
            <span className="text-heading-2 font-heading-2 text-default-font">Add New Contact</span>
            <div className="flex items-center gap-2">
              <Button variant="neutral-secondary" onClick={() => navigate(-1)}>Cancel</Button>
              <Button onClick={() => saveAndGo("profile")}>Save Contact</Button>
            </div>
          </div>
          <div className="flex w-full grow shrink-0 basis-0 flex-col gap-8 px-6 py-6 overflow-auto">
            {/* Basic Info (aligned to image fields) */}
            <div className="flex w-full flex-col gap-4 rounded-md border border-solid border-neutral-border bg-default-background px-6 py-6">
              <span className="text-heading-3 font-heading-3 text-default-font">Basic Information</span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <TextField variant="filled" label="First Name" helpText=""><TextField.Input value={form.firstName} onChange={onChange("firstName")} /></TextField>
                <TextField variant="filled" label="Middle Name" helpText=""><TextField.Input value={form.middleName} onChange={onChange("middleName")} /></TextField>
                <TextField variant="filled" label="Last Name" helpText=""><TextField.Input value={form.lastName} onChange={onChange("lastName")} /></TextField>
                <TextField variant="filled" label="DOB" helpText=""><TextField.Input value={form.dateOfBirth} onChange={onChange("dateOfBirth")} placeholder="YYYY-MM-DD" /></TextField>
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
                <Select className="md:col-span-1" variant="filled" label="Pharmacy Location" placeholder={isAdmin ? "Choose pharmacy" : "Location"} value={form.pharmacyLocation} onValueChange={(v) => setForm(p => ({ ...p, pharmacyLocation: v }))} disabled={!isAdmin}>
                  {locationOptions.map(loc => (
                    <Select.Item key={loc} value={loc}>{loc}</Select.Item>
                  ))}
                </Select>
                <Select className="md:col-span-1" variant="filled" label="Contact Type" placeholder="Type" value={form.contactType} onValueChange={(v) => setForm(p => ({ ...p, contactType: v }))}>
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
                  <TextField.Input value={form.insuranceProvider} onChange={onChange("insuranceProvider")} placeholder="Provider" />
                </TextField>
                <TextField variant="filled" label="Plan Name" helpText="">
                  <TextField.Input value={form.planName} onChange={onChange("planName")} placeholder="Plan" />
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
          {error ? (
            <div className="fixed bottom-6 right-6">
              <Toast variant="error" title="Unable to save" description={error} />
            </div>
          ) : null}
          {toast ? (
            <div className="fixed bottom-6 right-6">
              <Toast variant="success" title={toast} />
            </div>
          ) : null}
        </div>
      </div>
    </DefaultPageLayout>
  );
}


