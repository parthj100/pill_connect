"use client";

import React, { useMemo, useState } from "react";
import { DefaultPageLayout } from "@/ui/layouts/DefaultPageLayout";
import PharmacySidebar from "@/components/PharmacySidebar";
import { Button } from "@/ui/components/Button";
import { TextField } from "@/ui/components/TextField";
import { Toast } from "@/ui/components/Toast";
import Papa from "papaparse";
import { Contact, slugify } from "@/models/contacts";
import { upsertContactsBulk } from "@/lib/contactsApi";
import { useNavigate } from "react-router-dom";

type RawCsvRow = Record<string, string>;

function toNonEmpty(value?: string): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function deriveName(row: RawCsvRow): { firstName?: string; middleName?: string; lastName?: string; fullName?: string } {
  const first = toNonEmpty(row.firstName || row.FirstName || row.first_name || row["First Name"]);
  const middle = toNonEmpty(row.middleName || row.MiddleName || row.middle_name || row["Middle Name"]);
  const last = toNonEmpty(row.lastName || row.LastName || row.last_name || row["Last Name"]);
  const name = toNonEmpty(row.name || row.Name || [first, middle, last].filter(Boolean).join(" "));
  // If only a single name provided, try to split by last space
  if (!first && !last && name) {
    const parts = name.split(" ");
    if (parts.length > 1) {
      return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1], fullName: name };
    }
    return { firstName: name, fullName: name };
  }
  return { firstName: first, middleName: middle, lastName: last, fullName: name };
}

function rowToContact(row: RawCsvRow): Contact | null {
  const { firstName, middleName, lastName, fullName } = deriveName(row);
  const name = (fullName || [firstName, middleName, lastName].filter(Boolean).join(" ")).trim();
  const email = toNonEmpty(row.email || row.Email);
  const phone = toNonEmpty(row.phone || row.Phone);
  const rxNotifyPhone = toNonEmpty(row.rxNotifyPhone || row["Rx Notify Phone"]);
  const gender = toNonEmpty(row.gender || row.Gender);
  const language = toNonEmpty(row.language || row.Language);
  const address1 = toNonEmpty(row.address1 || row.Address || row.Address1);
  const city = toNonEmpty(row.city || row.City);
  const state = toNonEmpty(row.state || row.State);
  const zip = toNonEmpty(row.zip || row.Zip || row.ZIP);
  const dateOfBirth = toNonEmpty(row.dateOfBirth || row.DOB || row["Date of Birth"]);
  const emergencyContact = toNonEmpty(row.emergencyContact || row["Emergency Contact"]);
  const status = toNonEmpty(row.status || row.Status) || "Active";
  const pharmacyLocation = toNonEmpty(row.pharmacyLocation || row["Pharmacy Location"]);
  const primaryPhysician = toNonEmpty(row.primaryPhysician || row["Primary Physician"]);
  const insuranceProvider = toNonEmpty(row.insuranceProvider || row["Insurance Provider"]);
  const memberId = toNonEmpty(row.memberId || row["Member ID"]);
  const groupNumber = toNonEmpty(row.groupNumber || row["Group Number"]);
  const planName = toNonEmpty(row.planName || row["Plan Name"]);

  const fullNameFinal = name || (email || phone || "");
  if (!fullNameFinal) return null;

  const contact: Contact = {
    id: slugify(fullNameFinal),
    name: fullNameFinal,
    firstName,
    middleName,
    lastName,
    email,
    phone,
    rxNotifyPhone,
    gender,
    language,
    address1,
    city,
    state,
    zip,
    dateOfBirth,
    emergencyContact,
    status,
    medical: {
      pharmacyLocation,
      primaryPhysician,
    },
    insurance: {
      provider: insuranceProvider,
      memberId,
      groupNumber,
      planName,
    },
  };
  return contact;
}

export default function ContactsImport(): JSX.Element {
  const navigate = useNavigate();
  const [rawRows, setRawRows] = useState<RawCsvRow[]>([]);
  const [error, setError] = useState<string>("");
  const [toast, setToast] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");

  const contactsPreview = useMemo(() => {
    return rawRows
      .map(rowToContact)
      .filter((c): c is Contact => Boolean(c))
      .slice(0, 10);
  }, [rawRows]);

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    setError("");
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    // Note: no generic type param here to satisfy stricter TS in Vercel build
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
      complete: (results: { data: RawCsvRow[]; errors: Array<{ message: string }> }) => {
        if (results.errors && results.errors.length > 0) {
          setError(`Failed to parse CSV: ${results.errors[0].message}`);
          setRawRows([]);
          return;
        }
        setRawRows(results.data || []);
      },
      error: (err: any) => {
        setError(`Failed to read file: ${err?.message || 'Unknown error'}`);
        setRawRows([]);
      },
    });
  }

  async function importAll() {
    setError("");
    const contacts = rawRows
      .map(rowToContact)
      .filter((c): c is Contact => Boolean(c))
      .map(c => ({
        ...c,
        // Guarantees a non-empty name before persistence
        name: (c.name && c.name.trim().length > 0) ? c.name : ([c.firstName, c.middleName, c.lastName].filter(Boolean).join(' ') || c.email || c.phone || 'Unnamed'),
      }));
    if (contacts.length === 0) {
      setError("No valid contacts found in the CSV file");
      return;
    }
    const { inserted } = await upsertContactsBulk(contacts, 500);
    setToast(`Imported ${inserted} contact${inserted === 1 ? "" : "s"}`);
    // Navigate back to contacts after a moment
    setTimeout(() => navigate("/contacts"), 700);
  }

  function downloadTemplate() {
    const headers = [
      "First Name",
      "Middle Name",
      "Last Name",
      "Email",
      "Phone",
      // Pharmacy Location intentionally omitted; importer assigns current user's active location automatically
      "Primary Physician",
      "Status",
      "Address",
      "City",
      "State",
      "Zip",
      "Date of Birth",
      "Language",
      "Rx Notify Phone",
      "Emergency Contact",
      "Insurance Provider",
      "Member ID",
      "Group Number",
      "Plan Name",
    ];
    const csv = `${headers.join(",")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contacts_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <DefaultPageLayout>
      <div className="flex h-full w-full items-stretch">
        <PharmacySidebar active="contacts" />
        <div className="flex h-full w-full flex-col items-start">
          <div className="flex w-full items-center justify-between border-b border-solid border-neutral-border px-6 py-4">
            <span className="text-heading-2 font-heading-2 text-default-font">Import Contacts (CSV)</span>
            <div className="flex items-center gap-2">
              <Button variant="neutral-secondary" onClick={() => navigate(-1)}>Cancel</Button>
              <Button onClick={importAll} disabled={rawRows.length === 0}>Import</Button>
            </div>
          </div>
          <div className="flex w-full grow shrink-0 basis-0 flex-col gap-6 px-6 py-6 overflow-auto">
            <div className="flex flex-col gap-4 rounded-md border border-solid border-neutral-border bg-default-background px-6 py-6">
              <span className="text-heading-3 font-heading-3 text-default-font">Upload a CSV file</span>
              <div className="flex items-center gap-4">
                <input type="file" accept=".csv,text/csv" onChange={onFileSelected} />
                <Button variant="neutral-secondary" onClick={downloadTemplate}>Download Template</Button>
              </div>
              {fileName ? (
                <span className="text-body font-body text-subtext-color">Selected: {fileName}</span>
              ) : null}
              <span className="text-caption font-caption text-subtext-color">Columns supported: First Name, Middle Name, Last Name, Email, Phone, Rx Notify Phone, Gender, Language, Address, City, State, Zip, Date of Birth, Emergency Contact, Status, Pharmacy Location, Primary Physician, Insurance Provider, Member ID, Group Number, Plan Name</span>
            </div>

            <div className="flex flex-col gap-3 rounded-md border border-solid border-neutral-border bg-default-background px-6 py-6">
              <span className="text-heading-3 font-heading-3 text-default-font">Preview (first 10)</span>
              {contactsPreview.length === 0 ? (
                <span className="text-body font-body text-subtext-color">No rows parsed yet.</span>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {contactsPreview.map((c) => (
                    <div key={c.id} className="flex flex-col gap-1 rounded border border-neutral-border p-3">
                      <span className="text-body-bold font-body-bold text-default-font">{c.name}</span>
                      <span className="text-caption font-caption text-subtext-color">{[c.email, c.phone].filter(Boolean).join(" · ")}</span>
                      <span className="text-caption font-caption text-subtext-color">{c.medical?.pharmacyLocation || ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error ? (
              <div className="fixed bottom-6 right-6">
                <Toast variant="error" title="Import failed" description={error} />
              </div>
            ) : null}
            {toast ? (
              <div className="fixed bottom-6 right-6">
                <Toast variant="success" title={toast} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </DefaultPageLayout>
  );
}


