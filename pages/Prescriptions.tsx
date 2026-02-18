import React from "react";
import { useNavigate } from "react-router-dom";
import { DefaultPageLayout } from "@/ui/layouts/DefaultPageLayout";
import PharmacySidebar from "@/components/PharmacySidebar";
import { Badge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { Select } from "@/ui/components/Select";
import { TextField } from "@/ui/components/TextField";
import { listAllMedications, updateMedication, type MedicationWithContact } from "@/lib/contactsApi";

const STATUSES: Array<{ value: string; label: string; badgeVariant: "success" | "warning" | "neutral" }> = [
  { value: "active", label: "Active", badgeVariant: "success" },
  { value: "refill-due", label: "Refill Due", badgeVariant: "warning" },
  { value: "refill-requested", label: "Refill Requested", badgeVariant: "warning" },
  { value: "refill-approved", label: "Refill Approved", badgeVariant: "warning" },
  { value: "refill-ready", label: "Refill Ready", badgeVariant: "success" },
  { value: "picked-up", label: "Picked Up", badgeVariant: "neutral" },
  { value: "discontinued", label: "Discontinued", badgeVariant: "neutral" },
];

function badgeFor(status?: string | null): { label: string; variant: "success" | "warning" | "neutral" } {
  const s = (status ?? "").toLowerCase();
  const found = STATUSES.find(x => x.value === s);
  if (found) return { label: found.label, variant: found.badgeVariant };
  return { label: status || "—", variant: "neutral" };
}

function createDemoMedications(): MedicationWithContact[] {
  const people = [
    { name: "Sarah Johnson", location: "Mount Vernon" },
    { name: "Michael Chen", location: "New Rochelle" },
    { name: "Emily Rodriguez", location: "Mount Vernon" },
    { name: "James Williams", location: "New Rochelle" },
    { name: "Olivia Brown", location: "Mount Vernon" },
    { name: "Sophia Garcia", location: "New Rochelle" },
    { name: "Daniel Martinez", location: "Mount Vernon" },
    { name: "Ava Davis", location: "New Rochelle" },
    { name: "Ethan Wilson", location: "Mount Vernon" },
    { name: "Mia Anderson", location: "New Rochelle" },
  ];
  const meds = [
    { name: "Metformin 500mg", instructions: "Take 1 tablet twice daily with meals." },
    { name: "Lisinopril 10mg", instructions: "Take 1 tablet once daily." },
    { name: "Atorvastatin 20mg", instructions: "Take 1 tablet nightly." },
    { name: "Amlodipine 5mg", instructions: "Take 1 tablet once daily." },
    { name: "Levothyroxine 75mcg", instructions: "Take 1 tablet every morning on an empty stomach." },
    { name: "Omeprazole 20mg", instructions: "Take 1 capsule once daily before breakfast." },
    { name: "Sertraline 50mg", instructions: "Take 1 tablet once daily." },
    { name: "Albuterol HFA Inhaler", instructions: "Inhale 2 puffs every 4–6 hours as needed for wheezing." },
    { name: "Gabapentin 300mg", instructions: "Take 1 capsule three times daily." },
    { name: "Amoxicillin 500mg", instructions: "Take 1 capsule three times daily for 7 days." },
  ];
  const statuses = ["active", "refill-due", "refill-requested", "refill-approved", "refill-ready", "picked-up", "discontinued"] as const;

  const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  const randDateISOWithinDays = (daysBackMin: number, daysBackMax: number) => {
    const days = randInt(daysBackMin, daysBackMax);
    const ms = days * 24 * 60 * 60 * 1000;
    const jitter = randInt(0, 24 * 60 * 60 * 1000 - 1);
    return new Date(Date.now() - ms + jitter).toISOString();
  };

  const rows: MedicationWithContact[] = [];
  for (let i = 0; i < people.length; i++) {
    const p = people[i];
    const m1 = meds[i % meds.length];
    const m2 = meds[(i + 3) % meds.length];
    const s1 = statuses[(i * 2) % statuses.length];
    const s2 = statuses[(i * 2 + 3) % statuses.length];
    const createdA = randDateISOWithinDays(0, 30);
    const createdB = randDateISOWithinDays(0, 30);
    rows.push(
      {
        id: `demo_${i}_a`,
        contact_id: `demo_contact_${i}`,
        name: m1.name,
        instructions: m1.instructions,
        status: s1,
        prescribed_by: "Dr. Chen",
        ended_on: s1 === "discontinued" ? randDateISOWithinDays(10, 120) : null,
        created_at: createdA,
        contact: {
          id: `demo_contact_${i}`,
          slug: null,
          name: p.name,
          pharmacy_location: p.location,
          phone: null,
          rx_notify_phone: null,
        },
      },
      {
        id: `demo_${i}_b`,
        contact_id: `demo_contact_${i}`,
        name: m2.name,
        instructions: m2.instructions,
        status: s2,
        prescribed_by: "Dr. Patel",
        ended_on: s2 === "discontinued" ? randDateISOWithinDays(10, 120) : null,
        created_at: createdB,
        contact: {
          id: `demo_contact_${i}`,
          slug: null,
          name: p.name,
          pharmacy_location: p.location,
          phone: null,
          rx_notify_phone: null,
        },
      },
    );
  }
  return rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export default function Prescriptions() {
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [all, setAll] = React.useState<MedicationWithContact[]>([]);
  const [demoAll, setDemoAll] = React.useState<MedicationWithContact[]>(() => createDemoMedications());
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAllMedications();
      setAll(data);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load prescriptions");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const source = all.length > 0 ? all : demoAll;
  const usingDemo = all.length === 0;

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return source.filter((m) => {
      if (statusFilter !== "all" && (m.status ?? "") !== statusFilter) return false;
      if (!q) return true;
      const patientName = (m.contact?.name ?? "").toLowerCase();
      const medName = (m.name ?? "").toLowerCase();
      const instr = (m.instructions ?? "").toLowerCase();
      const loc = (m.contact?.pharmacy_location ?? "").toLowerCase();
      const phone = (m.contact?.phone ?? "").toLowerCase();
      const rxPhone = (m.contact?.rx_notify_phone ?? "").toLowerCase();
      return (
        patientName.includes(q) ||
        medName.includes(q) ||
        instr.includes(q) ||
        loc.includes(q) ||
        phone.includes(q) ||
        rxPhone.includes(q)
      );
    });
  }, [source, search, statusFilter]);

  return (
    <DefaultPageLayout>
      <div className="flex h-full w-full items-stretch">
        <PharmacySidebar active="prescriptions" />
        <div className="flex w-full min-h-0 flex-col items-start overflow-auto">
          <div className="border-b border-neutral-border w-full px-8 py-4 text-heading-2 font-heading-2">Prescriptions</div>
          <div className="w-full px-8 py-6">
            <div className="flex w-full flex-col gap-4">
              <div className="flex flex-wrap items-end gap-3">
                <TextField className="h-auto w-[360px] max-w-full" variant="filled" label="Search" helpText="Patient, medication, instructions, location, phone…">
                  <TextField.Input value={search} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)} />
                </TextField>
                <Select variant="filled" value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
                  <Select.Item value="all">All statuses</Select.Item>
                  {STATUSES.map(s => (
                    <Select.Item key={s.value} value={s.value}>{s.label}</Select.Item>
                  ))}
                </Select>
                <div className="ml-auto flex items-center gap-2">
                  <Button variant="neutral-secondary" onClick={() => load()} disabled={loading}>
                    {loading ? "Refreshing…" : "Refresh"}
                  </Button>
                </div>
              </div>

              {error ? (
                <div className="rounded-md border border-error-200 bg-error-50 px-4 py-3 text-body text-error-700">
                  {error}
                </div>
              ) : null}

              <div className="rounded-md border border-neutral-border bg-default-background">
                <div className="flex items-center justify-between border-b border-neutral-border px-4 py-3">
                  <span className="text-body-bold font-body-bold">All medications</span>
                  <span className="text-caption text-subtext-color">
                    {filtered.length} item(s){usingDemo ? " (example data)" : ""}
                  </span>
                </div>

                <div className="flex w-full flex-col">
                  {filtered.length === 0 ? (
                    <div className="px-4 py-6 text-body text-subtext-color">
                      {loading ? "Loading…" : "No prescriptions found."}
                    </div>
                  ) : null}

                  {filtered.map((m) => {
                    const b = badgeFor(m.status);
                    const slug = m.contact?.slug;
                    const who = m.contact?.name || "Unknown patient";
                    const location = m.contact?.pharmacy_location || "—";
                    return (
                      <div key={m.id} className="flex flex-col gap-2 border-b border-neutral-border px-4 py-4 last:border-b-0">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-body-bold font-body-bold text-default-font">{m.name}</span>
                              <Badge variant={b.variant}>{b.label}</Badge>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-subtext-color">
                              <span>Patient: <span className="text-default-font">{who}</span></span>
                              <span>Location: <span className="text-default-font">{location}</span></span>
                              <span>Added: <span className="text-default-font">{m.created_at ? new Date(m.created_at).toLocaleString() : "—"}</span></span>
                            </div>
                            {m.instructions ? (
                              <div className="mt-2 text-body text-subtext-color">
                                {m.instructions}
                              </div>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Select
                              variant="filled"
                              value={m.status ?? "active"}
                              onValueChange={async (v) => {
                                if (String(m.id).startsWith("demo_")) {
                                  setDemoAll(prev => prev.map(x => (x.id === m.id ? { ...x, status: v } : x)));
                                  return;
                                }
                                try {
                                  if (!m.contact_id) return;
                                  await updateMedication(m.contact_id, m.id, { status: v as any });
                                  await load();
                                } catch (e: any) {
                                  setError(e?.message ?? "Failed to update status");
                                }
                              }}
                            >
                              {STATUSES.map(s => (
                                <Select.Item key={s.value} value={s.value}>{s.label}</Select.Item>
                              ))}
                            </Select>
                            <Button
                              variant="neutral-secondary"
                              onClick={() => {
                                if (slug) navigate(`/contacts/${slug}`);
                              }}
                              disabled={!slug}
                            >
                              View contact
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DefaultPageLayout>
  );
}


