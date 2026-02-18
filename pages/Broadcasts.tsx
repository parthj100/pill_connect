import React, { useEffect, useMemo, useState } from 'react';
import { DefaultPageLayout } from '@/ui/layouts/DefaultPageLayout';
import PharmacySidebar from '@/components/PharmacySidebar';
import { Button } from '@/ui/components/Button';
import { TextField } from '@/ui/components/TextField';
import { Toast } from '@/ui/components/Toast';
import { LoadingSpinner } from '@/ui/components/LoadingSpinner';
import { DeleteConfirmationModal } from '@/components/DeleteConfirmationModal';
import { LocationPickerModal } from '@/components/LocationPickerModal';
import { Broadcast, listBroadcasts, createBroadcast, renameBroadcast, deleteBroadcast, getBroadcast, setBroadcastMembers, sendBroadcast, listBroadcastMessages } from '@/lib/broadcastsApi';
import { supabase } from '@/lib/supabaseClient';

export default function BroadcastsPage() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [toast, setToast] = useState<{ title: string; desc?: string } | null>(null);
  const [members, setMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [body, setBody] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [showManage, setShowManage] = useState(false);
  const [manageQuery, setManageQuery] = useState('');
  const [manageContacts, setManageContacts] = useState<Array<{ id: string; name: string }>>([]);
  const [manageSelected, setManageSelected] = useState<Record<string, boolean>>({});
  const [thread, setThread] = useState<Array<{ id: string; sender: 'staff'|'system'; text: string | null; type?: 'text'|'attachment'|'system'; created_at: string }>>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const selected = useMemo(() => broadcasts.find(b => b.id === selectedId) || broadcasts[0], [broadcasts, selectedId]);

  useEffect(() => {
    (async () => {
      try {
        // Check if user is admin
        const { data: user } = await supabase.auth.getUser();
        const uid = user?.user?.id;
        if (uid) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', uid)
            .maybeSingle();
          setIsAdmin((profile as any)?.role === 'admin');
        }
        
        // Load broadcasts
        const list = await listBroadcasts();
        setBroadcasts(list);
        if (list[0]) setSelectedId(list[0].id);
      } catch (error) {
        console.error('Failed to load broadcasts:', error);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!selected) return;
      try {
        const d = await getBroadcast(selected.id);
        setMembers(d.members);
        const msgs = await listBroadcastMessages(selected.id);
        setThread(msgs);
      } catch {}
    })();
  }, [selected?.id]);

  const handleCreateClick = () => {
    if (isAdmin) {
      // Admin users get location picker modal
      setShowLocationPicker(true);
    } else {
      // Regular users use simple creation
      setCreating(true);
    }
  };

  const handleLocationPickerConfirm = async (name: string, location: 'Mount Vernon' | 'New Rochelle') => {
    try {
      setCreateLoading(true);
      const created = await createBroadcast(name, location);
      setBroadcasts(prev => [created, ...prev]);
      setSelectedId(created.id);
      setShowLocationPicker(false);
      setToast({ title: `Broadcast "${name}" created for ${location}` });
    } catch (e: any) {
      console.error('Broadcast creation error:', e);
      setToast({ title: 'Create failed', desc: e?.message });
    } finally {
      setCreateLoading(false);
    }
  };

  const createNew = async () => {
    if (!newName.trim()) return;
    try {
      const user = await supabase.auth.getUser();
      const locRes = await supabase.from('user_active_locations').select('selected_location').eq('user_id', user.data.user?.id || '').maybeSingle();
      const selectedLocation = (locRes.data as any)?.selected_location;
      
      // Handle location validation for non-admin users
      let location: 'Mount Vernon' | 'New Rochelle';
      if (selectedLocation === 'Mount Vernon' || selectedLocation === 'New Rochelle') {
        location = selectedLocation;
      } else {
        // For invalid locations, default to New Rochelle
        location = 'New Rochelle';
      }
      
      const created = await createBroadcast(newName.trim(), location);
      setBroadcasts(prev => [created, ...prev]);
      setSelectedId(created.id);
      setNewName('');
      setCreating(false);
      setToast({ title: `Broadcast "${newName.trim()}" created for ${location}` });
    } catch (e: any) { 
      console.error('Broadcast creation error:', e);
      setToast({ title: 'Create failed', desc: e?.message }); 
    }
  };

  const doRename = async () => {
    const name = prompt('Rename broadcast', selected?.name || '') ?? '';
    if (!name.trim() || !selected) return;
    await renameBroadcast(selected.id, name.trim());
    setBroadcasts(prev => prev.map(b => b.id === selected.id ? { ...b, name: name.trim() } : b));
  };

  const handleDeleteClick = () => {
    if (!selected) return;
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selected) return;
    
    try {
      setDeleteLoading(true);
      await deleteBroadcast(selected.id);
      setBroadcasts(prev => prev.filter(b => b.id !== selected.id));
      
      // Select the first remaining broadcast or clear selection
      const remaining = broadcasts.filter(b => b.id !== selected.id);
      if (remaining.length > 0) {
        setSelectedId(remaining[0].id);
      } else {
        setSelectedId('');
      }
      
      setShowDeleteModal(false);
      setToast({ title: 'Broadcast deleted successfully' });
    } catch (error: any) {
      setToast({ title: 'Delete failed', desc: error?.message || 'Unknown error occurred' });
    } finally {
      setDeleteLoading(false);
    }
  };

  const doSend = async () => {
    if (!selected || !body.trim()) return;
    const res = await sendBroadcast(selected.id, body.trim());
    setToast({ title: `Queued to ${res.recipients} recipient${res.recipients === 1 ? '' : 's'}` });
    setBody('');
    // Append optimistically to thread
    setThread(prev => [...prev, { id: `local-${Date.now()}`, sender: 'staff', text: body.trim(), type: 'text', created_at: new Date().toISOString() }]);
  };

  const openManageMembers = async () => {
    if (!selected) return;
    setShowManage(true);
    try {
      setManageQuery('');
      const { data, error } = await supabase.from('contacts').select('id,name').order('name', { ascending: true }).limit(100);
      if (!error && data) {
        const items = (data as any[]).map(r => ({ id: r.id as string, name: r.name as string }));
        setManageContacts(items);
      }
      const selectedMap: Record<string, boolean> = {};
      for (const m of members) selectedMap[m.id] = true;
      setManageSelected(selectedMap);
    } catch {}
  };

  const saveManageMembers = async () => {
    if (!selected) return;
    const ids = Object.keys(manageSelected).filter(id => manageSelected[id]);
    await setBroadcastMembers(selected.id, ids);
    setMembers(manageContacts.filter(c => ids.includes(c.id)));
    setShowManage(false);
    setToast({ title: 'Members updated' });
  };

  // Server-side search (RLS-aware) for member manager
  useEffect(() => {
    if (!showManage) return;
    const q = manageQuery.trim();
    const t = setTimeout(async () => {
      try {
        if (!q) {
          const { data, error } = await supabase.from('contacts').select('id,name').order('name', { ascending: true }).limit(200);
          if (!error && data) setManageContacts((data as any[]).map(r => ({ id: r.id as string, name: r.name as string })));
          return;
        }
        const { data, error } = await supabase.rpc('search_contacts', { q, limit_count: 100 });
        if (!error && Array.isArray(data)) {
          setManageContacts((data as any[]).map(row => ({ id: row.id as string, name: row.name as string })));
        }
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [manageQuery, showManage]);

  if (isLoading) {
    return (
      <DefaultPageLayout>
        <div className="flex h-full w-full items-stretch">
          <PharmacySidebar active="broadcasts" />
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
        <PharmacySidebar active="broadcasts" />
        <div className="flex h-full w-full items-start">
          <div className="flex min-w-[28rem] w-[28rem] flex-none flex-col items-start self-stretch border-r border-solid border-neutral-border bg-neutral-50">
            <div className="grid w-full grid-cols-[auto,1fr,auto] items-center gap-3 border-b border-solid border-neutral-border px-6 py-4 sticky top-0 bg-neutral-50 z-10">
              <span className="text-heading-3">Broadcasts</span>
              <TextField className="h-auto w-full" variant="filled" label="" helpText="">
                <TextField.Input placeholder="Search broadcasts" value={search} onChange={(e: any) => setSearch(e.target.value)} />
              </TextField>
              <Button variant="brand-tertiary" onClick={handleCreateClick}>New</Button>
            </div>
            {creating ? (
              <div className="w-full p-4 border-b border-neutral-border flex items-center gap-2">
                <TextField className="h-auto w-full" variant="filled" label="" helpText="">
                  <TextField.Input placeholder="Broadcast name" value={newName} onChange={(e: any) => setNewName(e.target.value)} />
                </TextField>
                <Button onClick={createNew}>Create</Button>
                <Button variant="neutral-tertiary" onClick={() => { setCreating(false); setNewName(''); }}>Cancel</Button>
              </div>
            ) : null}
            <div className="flex w-full flex-col overflow-auto px-4 py-4 gap-2">
              {broadcasts.filter(b => b.name.toLowerCase().includes(search.toLowerCase())).map(b => (
                <div key={b.id} className={"flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer " + (b.id === selectedId ? 'bg-brand-50' : 'hover:bg-neutral-50')} onClick={() => setSelectedId(b.id)}>
                  <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold">B</div>
                  <div className="flex flex-col">
                    <span className="text-body-bold">{b.name}</span>
                  </div>
                  <div className="ml-auto text-caption text-subtext-color">{b.location}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex grow shrink-0 basis-0 flex-col items-start self-stretch">
            {selected ? (
              <>
                <div className="flex w-full items-center justify-between border-b border-neutral-border px-6 py-4 sticky top-0 bg-neutral-50 z-10">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold">B</div>
                    <div className="flex flex-col">
                      <span className="text-heading-3">{selected.name}</span>
                      <span className="text-caption text-subtext-color">{members.length} members • {selected.location}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="neutral-tertiary" onClick={doRename}>Rename</Button>
                    <Button variant="neutral-tertiary" onClick={openManageMembers}>Manage Members</Button>
                    <Button variant="destructive-secondary" onClick={handleDeleteClick}>Delete</Button>
                  </div>
                </div>
                <div className="w-full px-6 py-6 flex flex-col gap-3">
                  <div className="flex flex-col gap-3 max-h-[40vh] overflow-auto border border-neutral-border rounded p-3">
                    {thread.map(m => (
                      <div key={m.id} className={"flex w-full " + (m.sender === 'staff' ? 'justify-end' : 'justify-start')}>
                        <div className={"max-w-[70%] rounded-xl px-4 py-2 " + (m.sender === 'staff' ? 'bg-brand-100' : 'bg-neutral-50')}>
                          {m.type === 'attachment' ? (
                            (() => {
                              const url = m.text || '';
                              const isImage = /\.(png|jpe?g|gif|webp)$/i.test(url);
                              const isPdf = /\.pdf$/i.test(url);
                              const isVideo = /\.(mp4|webm|ogg)$/i.test(url);
                              if (isImage) return <img src={url} alt="attachment" className="max-w-[420px] max-h-[320px] rounded-md border border-neutral-border object-contain" />;
                              if (isVideo) return <video controls className="max-w-[420px] max-h-[320px] rounded-md border border-neutral-border"><source src={url} /></video>;
                              if (isPdf) return <a className="text-brand-600 underline" href={url} target="_blank" rel="noreferrer">View PDF</a>;
                              return <a className="text-brand-600 underline" href={url} target="_blank" rel="noreferrer">Download attachment</a>;
                            })()
                          ) : (
                            <div className="text-body">{m.text}</div>
                          )}
                          <div className="text-caption text-subtext-color text-right">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                      </div>
                    ))}
                    {thread.length === 0 ? <span className="text-caption text-subtext-color">No messages yet.</span> : null}
                  </div>
                  <TextField className="h-auto w-full" variant="filled" label="Compose" helpText="">
                    <TextField.Input placeholder="Type a broadcast message" value={body} onChange={(e: any) => setBody(e.target.value)} onKeyDown={async (e: any) => { if (e.key === 'Enter') await doSend(); }} />
                  </TextField>
                  <div className="flex items-center gap-2">
                    <Button onClick={doSend}>Send</Button>
                    <Button variant="neutral-tertiary" disabled={uploadBusy} onClick={async () => {
                      if (!selected) return;
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*,application/pdf,video/*';
                      input.onchange = async () => {
                        const file = input.files?.[0];
                        if (!file) return;
                        try {
                          setUploadBusy(true);
                          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                          const path = `broadcasts/${selected.id}/${Date.now()}_${safeName}`;
                          const up = await supabase.storage.from('message-attachments').upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' });
                          if (up.error) throw up.error;
                          const { data: urlData } = supabase.storage.from('message-attachments').getPublicUrl(up.data?.path || path);
                          const url = urlData?.publicUrl || '';
                          await sendBroadcast(selected.id, undefined, [url]);
                          setThread(prev => [...prev, { id: `local-${Date.now()}`, sender: 'staff', text: url, type: 'attachment', created_at: new Date().toISOString() }]);
                        } catch (e: any) {
                          setToast({ title: 'Upload failed', desc: e?.message });
                        } finally {
                          setUploadBusy(false);
                        }
                      };
                      input.click();
                    }}>Attach</Button>
                    <span className="text-caption text-subtext-color">This will send a direct message to each member. Replies go to their direct threads.</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-8 text-subtext-color">No broadcasts yet.</div>
            )}
          </div>
        </div>
      </div>
      {toast ? (
        <div className="fixed bottom-6 right-6 z-[80]">
          <Toast variant="neutral" title={toast.title} description={toast.desc} />
        </div>
      ) : null}

      {showManage ? (
        <div className="fixed inset-0 z-[90]">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowManage(false)} />
          <div className="absolute left-1/2 top-1/2 w-[640px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-neutral-border bg-default-background p-6 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-heading-3">Manage Members</span>
              <Button variant="neutral-tertiary" onClick={() => setShowManage(false)}>Close</Button>
            </div>
            <TextField className="h-auto w-full mb-3" variant="filled" label="" helpText="">
              <TextField.Input placeholder="Search contacts" value={manageQuery} onChange={(e: any) => setManageQuery(e.target.value)} />
            </TextField>
            <div className="flex flex-col gap-2 max-h-[60vh] overflow-auto border border-neutral-border rounded p-3">
              {Object.keys(manageSelected).filter(id => manageSelected[id]).map(id => {
                const c = manageContacts.find(x => x.id === id);
                if (!c) return null;
                return (
                  <label key={`sel-${id}`} className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={true} onChange={(e) => setManageSelected(prev => ({ ...prev, [id]: e.target.checked }))} />
                    <span className="text-body">{c.name}</span>
                  </label>
                );
              })}
              {manageContacts
                .filter(c => !manageSelected[c.id])
                .map(c => (
                  <label key={c.id} className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={!!manageSelected[c.id]} onChange={(e) => setManageSelected(prev => ({ ...prev, [c.id]: e.target.checked }))} />
                    <span className="text-body">{c.name}</span>
                  </label>
                ))}
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <Button variant="neutral-tertiary" onClick={() => setShowManage(false)}>Cancel</Button>
              <Button onClick={saveManageMembers}>Save</Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Broadcast Channel"
        description="Are you sure you want to permanently delete this broadcast channel?"
        itemName={selected?.name}
        deleteItems={[
          'All broadcast messages and history',
          'All member associations',
          'All send records and analytics',
          'All attachments and media files'
        ]}
        isLoading={deleteLoading}
      />

      {/* Location Picker Modal for Admin Users */}
      <LocationPickerModal
        isOpen={showLocationPicker}
        onClose={() => setShowLocationPicker(false)}
        onConfirm={handleLocationPickerConfirm}
        isLoading={createLoading}
      />
    </DefaultPageLayout>
  );
}


