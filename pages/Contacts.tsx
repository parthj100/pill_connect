"use client";

import React from "react";
import { DefaultPageLayout } from "@/ui/layouts/DefaultPageLayout";
import PharmacySidebar from "@/components/PharmacySidebar";
import { TextField } from "@/ui/components/TextField";
import { Avatar } from "@/ui/components/Avatar";
import { Badge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { IconWithBackground } from "@/ui/components/IconWithBackground";
import { Select } from "@/ui/components/Select";
import { Toast } from "@/ui/components/Toast";
import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { Contact, hasRefillDue, medicationBadgeFor } from "@/models/contacts";
import { fetchContacts as fetchContactsApi, bulkSetArchived as bulkSetArchivedApi, bulkSetStatus as bulkSetStatusApi, bulkSetPharmacyLocation as bulkSetPharmacyLocationApi, bulkAssignPrimaryPhysician as bulkAssignPrimaryPhysicianApi, deleteContacts as deleteContactsApi, deleteContactsBySlug as deleteContactsBySlugApi, fetchContactsPage, deleteContactCompletelyBySlug as deleteContactCompletelyBySlugApi } from "@/lib/contactsApi";
import { supabase } from "@/lib/supabaseClient";
import * as SubframeCore from "@subframe/core";
import { DropdownMenu } from "@/ui/components/DropdownMenu";
import { LoadingSpinner } from "@/ui/components/LoadingSpinner";

export default function Contacts() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");
  const [filterPharmacy, setFilterPharmacy] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [undoId, setUndoId] = useState<string | null>(null);
  // Bulk selection deferred for later

  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(24);
  const [total, setTotal] = useState<number>(0);
  // Gate the first fetch until role/active location is known to avoid double loads
  const [loadedRole, setLoadedRole] = useState<boolean>(false);
  const [filterType, setFilterType] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  async function refresh(p: number = page) {
    // Server-side pagination with search; RLS already scopes by location
    setIsSearching(true);
    try {
      const pharmacy = isAdmin ? (filterPharmacy || undefined) : (filterPharmacy || undefined);
      const type = filterType || undefined;
      const search = debouncedQuery.trim() || undefined;
      const { rows, total, usedPage } = await fetchContactsPage(p, pageSize, pharmacy, type as any, search);
      setContacts(rows);
      setTotal(total);
      setPage(usedPage);
    } catch {
      // fallback to full fetch if needed
      const list = await fetchContactsApi();
      // Apply client-side filtering as fallback
      const filtered = list.filter(c => {
        if (c.archived) return false;
        
        // Search filter
        if (debouncedQuery.trim()) {
          const query = debouncedQuery.toLowerCase();
          const searchText = `${c.name} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase();
          if (!searchText.includes(query)) return false;
        }
        
        // Pharmacy filter
        if (filterPharmacy && (c.medical?.pharmacyLocation ?? "") !== filterPharmacy) return false;
        
        // Type filter
        if (filterType && (c as any).contactType !== filterType) return false;
        
        return true;
      });
      
      setContacts(filtered);
      setTotal(filtered.length);
      setPage(1);
    } finally {
      setIsSearching(false);
    }
  }

  // Remove eager fetch; we'll fetch after role/active location is loaded

  // Realtime: update list when contacts change (insert/update/delete)
  useEffect(() => {
    const sub = supabase
      .channel('contacts_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, () => {
        // Debounce refresh to avoid rapid consecutive reloads
        if ((window as any)._contacts_refresh_timer) {
          clearTimeout((window as any)._contacts_refresh_timer);
        }
        (window as any)._contacts_refresh_timer = setTimeout(() => {
          refresh(page);
          (window as any)._contacts_refresh_timer = null;
        }, 300);
      })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [page, filterPharmacy, filterType]);

  // Determine role and active location; if not admin, lock filter to active location and hide control
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
        if (!admin && selected) setFilterPharmacy(selected);
        setLoadedRole(true);
        setIsLoading(false);
      } catch {}
    })();
  }, []);

  // Fetch after role/active location is determined
  useEffect(() => {
    if (!loadedRole) return;
    refresh(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedRole, filterPharmacy, filterType]);

  // Refresh when window/tab regains focus (ensures latest DB fields appear)
  useEffect(() => {
    const onFocus = () => { refresh(page); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [page]);

  // Server search via RPC
  useEffect(() => {
    const t = setTimeout(async () => {
      const q = debouncedQuery.trim();
      if (!q) { await refresh(1); return; }
      const { data, error } = await supabase.rpc('search_contacts', { q, limit_count: 50 });
      if (!error && Array.isArray(data)) {
        const mapped = (data as any[]).map((row) => ({
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
          medical: { primaryPhysician: row.primary_physician ?? undefined, pharmacyLocation: row.pharmacy_location ?? undefined },
          insurance: { provider: row.insurance_provider ?? undefined, memberId: row.member_id ?? undefined, groupNumber: row.group_number ?? undefined, planName: row.plan_name ?? undefined },
        } as Contact));
        setContacts(mapped);
        setTotal(mapped.length);
        setPage(1);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [debouncedQuery]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Simple client-side pagination/infinite scroll
  const [visibleCount, setVisibleCount] = useState<number>(12);

  useEffect(() => { setVisibleCount(12); }, [debouncedQuery, filterPharmacy, filterType]);
  useEffect(() => { refresh(1); }, [debouncedQuery, filterPharmacy, filterType]);

  const filtered = useMemo(() => {
    // Server already handles filtering and sorting, just filter out archived locally
    return contacts.filter(c => !c.archived);
  }, [contacts]);

  function highlight(text: string | undefined) {
    if (!text) return "—";
    if (!debouncedQuery || debouncedQuery.trim().length === 0) return text;
    
    try {
      const query = debouncedQuery.trim();
      const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(${escapedQuery})`, "gi");
      const parts = text.split(regex);
      
      return (
        <>
          {parts.map((part, i) =>
            part.toLowerCase() === query.toLowerCase() ? (
              <mark key={i} className="bg-yellow-200 rounded-sm px-0.5">{part}</mark>
            ) : (
              <React.Fragment key={i}>{part}</React.Fragment>
            )
          )}
        </>
      );
    } catch (error) {
      // If regex fails, just return the original text
      return text;
    }
  }

  function DropdownBulk({ selected, clear, refresh }: { selected: Set<string>; clear: () => void; refresh: () => Promise<void> }) {
    const ids = Array.from(selected);
    if (ids.length === 0) return null;
    return (
      <SubframeCore.DropdownMenu.Root>
        <SubframeCore.DropdownMenu.Trigger asChild={true}>
          <Button variant="neutral-secondary">Bulk Actions ({ids.length})</Button>
        </SubframeCore.DropdownMenu.Trigger>
        <SubframeCore.DropdownMenu.Portal>
          <SubframeCore.DropdownMenu.Content side="bottom" align="end" sideOffset={4} asChild={true}>
            <DropdownMenu>
              <DropdownMenu.DropdownItem onClick={async () => { await bulkSetArchivedApi(ids, true); clear(); await refresh(); }}>Archive</DropdownMenu.DropdownItem>
              <DropdownMenu.DropdownItem onClick={async () => { await bulkSetArchivedApi(ids, false); clear(); await refresh(); }}>Unarchive</DropdownMenu.DropdownItem>
              <DropdownMenu.DropdownDivider />
              <DropdownMenu.DropdownItem onClick={async () => { await bulkSetStatusApi(ids, "Active"); clear(); await refresh(); }}>Set Status: Active</DropdownMenu.DropdownItem>
              <DropdownMenu.DropdownItem onClick={async () => { await bulkSetStatusApi(ids, "Inactive"); clear(); await refresh(); }}>Set Status: Inactive</DropdownMenu.DropdownItem>
              <DropdownMenu.DropdownDivider />
              <DropdownMenu.DropdownItem onClick={async () => { await bulkSetPharmacyLocationApi(ids, "Mount Vernon"); clear(); await refresh(); }}>Pharmacy: Mount Vernon</DropdownMenu.DropdownItem>
              <DropdownMenu.DropdownItem onClick={async () => { await bulkSetPharmacyLocationApi(ids, "New Rochelle"); clear(); await refresh(); }}>Pharmacy: New Rochelle</DropdownMenu.DropdownItem>
              
              <DropdownMenu.DropdownDivider />
              <DropdownMenu.DropdownItem onClick={async () => { await bulkAssignPrimaryPhysicianApi(ids, "Dr. Michael Chen"); clear(); await refresh(); }}>Assign: Dr. Michael Chen</DropdownMenu.DropdownItem>
              <DropdownMenu.DropdownItem onClick={async () => { await bulkAssignPrimaryPhysicianApi(ids, "Dr. Roberts"); clear(); await refresh(); }}>Assign: Dr. Roberts</DropdownMenu.DropdownItem>
              <DropdownMenu.DropdownItem onClick={async () => { await bulkAssignPrimaryPhysicianApi(ids, "Dr. Smith"); clear(); await refresh(); }}>Assign: Dr. Smith</DropdownMenu.DropdownItem>
            </DropdownMenu>
          </SubframeCore.DropdownMenu.Content>
        </SubframeCore.DropdownMenu.Portal>
      </SubframeCore.DropdownMenu.Root>
    );
  }
  
  if (isLoading) {
    return (
      <DefaultPageLayout>
        <div className="flex h-full w-full items-stretch">
          <PharmacySidebar active="contacts" />
          <div className="flex w-full flex-col items-center justify-center">
            <LoadingSpinner />
          </div>
        </div>
      </DefaultPageLayout>
    );
  }

  return (
    <DefaultPageLayout>
      <div className="flex h-full w-full items-stretch">
        <PharmacySidebar active="contacts" />
        <div className="flex h-full w-full flex-col items-start">
          <div className="flex w-full items-center justify-between border-b border-solid border-neutral-border px-6 py-4">
            <span className="text-heading-2 font-heading-2 text-default-font">Contacts</span>
            <div className="flex items-center gap-3">
              <TextField className="h-auto w-64 flex-none" variant="filled" label="" helpText="">
                <TextField.Input
                  placeholder="Search (name, email, phone)"
                  value={query}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
                />
              </TextField>
              {isAdmin ? (
                <Select className="w-44" variant="filled" placeholder="Pharmacy" value={filterPharmacy || undefined} onValueChange={(v)=> setFilterPharmacy(v === "__ALL__" ? "" : v)}>
                  <Select.Item value="__ALL__">All Pharmacies</Select.Item>
                  <Select.Item value="Mount Vernon">Mount Vernon</Select.Item>
                  <Select.Item value="New Rochelle">New Rochelle</Select.Item>
                </Select>
              ) : null}
              <Select className="w-40" variant="filled" placeholder="Contact Type" value={filterType || undefined} onValueChange={(v)=> setFilterType(v === "__ALL__" ? "" : v)}>
                <Select.Item value="__ALL__">All Types</Select.Item>
                <Select.Item value="patient">Patient</Select.Item>
                <Select.Item value="provider">Provider</Select.Item>
                <Select.Item value="social_worker">Social Worker</Select.Item>
              </Select>
              
              
              <Button variant="neutral-secondary" onClick={() => navigate("/contacts-import")}>Import CSV</Button>
              <Button variant="brand-primary" onClick={() => navigate("/contacts/new")}>Add New Contact</Button>
            </div>
          </div>
          <div className="flex w-full grow shrink-0 basis-0 flex-col items-start gap-4 px-6 py-6 overflow-auto" onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
              setVisibleCount(v => Math.min(v + 12, filtered.length));
            }
          }}>
            {/* Search Status */}
            {(debouncedQuery || filterPharmacy || filterType) && (
              <div className="flex items-center gap-3 w-full text-sm text-subtext-color">
                {isSearching ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-brand-600 border-t-transparent rounded-full animate-spin"></div>
                    <span>Searching...</span>
                  </div>
                ) : (
                  <span>
                    {filtered.length} {filtered.length === 1 ? 'contact' : 'contacts'} found
                    {debouncedQuery && <span> for "{debouncedQuery}"</span>}
                  </span>
                )}
              </div>
            )}
            
            {filtered.length === 0 && !isSearching && (debouncedQuery || filterPharmacy || filterType) && (
              <div className="flex w-full items-center justify-center py-12">
                <div className="text-center">
                  <div className="text-heading-3 font-heading-3 text-subtext-color mb-2">No contacts found</div>
                  <div className="text-body text-subtext-color">
                    Try adjusting your search terms or filters
                  </div>
                </div>
              </div>
            )}
            
            <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.slice(0, visibleCount).map((c) => (
              <div key={c.id} className="flex grow shrink-0 basis-0 flex-col items-start gap-6 rounded-md border border-solid border-neutral-border bg-default-background px-6 py-6 shadow-sm">
                <div className="flex w-full flex-col items-start gap-4">
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-heading-3 font-heading-3 text-default-font">{highlight(c.name)}</span>
                    {(() => { const info = medicationBadgeFor(c); return info ? <Badge variant={info.variant}>{info.label}</Badge> : null; })()}
                  </div>
                  {/* Removed Patient ID display per request */}
                </div>
                {/* Tabs (Overview only) */}
                <div className="flex items-center w-full">
                  <span className="text-body-bold font-body-bold text-default-font border-b-2 border-brand-600 pb-1">Overview</span>
                </div>
                {/* Details */}
                <div className="flex w-full flex-col items-start gap-4">
                  <div className="flex w-full items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <IconWithBackground variant="neutral" size="small" />
                      <span className="text-body font-body text-default-font">Pharmacy Location</span>
                    </div>
                    <Badge variant="neutral">{c.medical?.pharmacyLocation ?? "—"}</Badge>
                  </div>
                  <div className="flex w-full items-center gap-2">
                    <IconWithBackground variant="neutral" size="small" />
                    <span className="text-body font-body text-default-font">Email</span>
                    <span className="text-body font-body text-subtext-color ml-auto">{highlight(c.email)}</span>
                  </div>
                  <div className="flex w-full items-center gap-2">
                    <IconWithBackground variant="neutral" size="small" />
                    <span className="text-body font-body text-default-font">Phone</span>
                    <span className="text-body font-body text-subtext-color ml-auto">{highlight(c.phone)}</span>
                  </div>
                  <div className="flex w-full items-center gap-2">
                    <IconWithBackground variant="neutral" size="small" />
                    <span className="text-body font-body text-default-font">Address</span>
                    <span className="text-body font-body text-subtext-color ml-auto">{c.address1 ?? c.address ?? "—"}</span>
                  </div>
                </div>
                <div className="flex w-full items-center justify-end gap-2">
                  <Button
                    variant="neutral-secondary"
                    onClick={() => {
                      // Pass slug; messages page will ensure/migrate and reuse existing conversation
                      navigate(`/messages?patientId=${c.id}`);
                    }}
                  >
                    Message
                  </Button>
                  <Button onClick={() => navigate(`/contacts/${c.id}`) }>
                    View Profile
                  </Button>
                  <Button variant="neutral-tertiary" onClick={async () => {
                    const ok = confirm(`Delete contact \"${c.name}\"? This cannot be undone.`);
                    if (!ok) return;
                    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(c.id);
                    if (isUuid) await deleteContactsApi([c.id]);
                    else await deleteContactCompletelyBySlugApi(c.id);
                    await refresh();
                  }}>Delete</Button>
                </div>
              </div>
              ))}
            </div>
            {undoId ? (
              <div className="fixed bottom-6 right-6">
                <Toast
                  variant="neutral"
                  title="Contact archived"
                  actions={<Button variant="brand-tertiary" onClick={async () => { if (!undoId) return; await bulkSetArchivedApi([undoId], false); await refresh(); setUndoId(null); }}>Undo</Button>}
                />
              </div>
            ) : null}
            {/* Pagination controls */}
            <div className="w-full flex items-center justify-between mt-4">
              <span className="text-caption text-subtext-color">{total} total</span>
              <div className="flex items-center gap-2">
                <Button variant="neutral-tertiary" onClick={() => page > 1 && refresh(page - 1)} disabled={page <= 1}>Prev</Button>
                <span className="text-body">Page {page} / {Math.max(1, Math.ceil(total / pageSize))}</span>
                <Button variant="neutral-tertiary" onClick={() => page < Math.ceil(total / pageSize) && refresh(page + 1)} disabled={page >= Math.ceil(total / pageSize)}>Next</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DefaultPageLayout>
  );
}

