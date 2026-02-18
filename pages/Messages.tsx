"use client";

import React from "react";
import { DefaultPageLayout } from "@/ui/layouts/DefaultPageLayout";
import { TextField } from "@/ui/components/TextField";
import { Avatar } from "@/ui/components/Avatar";
import { Badge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
// Removed dropdown menu
import { IconButton } from "@/ui/components/IconButton";
import { TimelineDivider } from "@/ui/components/TimelineDivider";
import PharmacySidebar from "@/components/PharmacySidebar";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { Avatar as AvatarCmp } from "@/ui/components/Avatar";
import { Badge as BadgeCmp } from "@/ui/components/Badge";
import { formatDateLabel, formatTime } from "@/models/messaging";
import { listConversationsWithPatient, ConversationWithPatient, listMessages, addMessage, ensureConversationForSlug, ensureConversationForContactId, subscribeToMessages, MessageRow, resetUnread, subscribeToConversations, deleteConversation, fetchConversationWithPatientById, subscribeToAllMessages, createGroupConversation, fetchConversationWithParticipantsById, listConversationsWithParticipants, subscribeToParticipants, sendOutboundViaTwilio, fetchLastMessages, getBroadcastTitleFromStatus, setBroadcastTitle, getConversationParticipants, setBroadcastParticipants } from "@/lib/messagesApi";
import { getDbIdBySlug, addNote } from "@/lib/contactsApi";
import { supabase } from "@/lib/supabaseClient";
import { Toast } from "@/ui/components/Toast";
import { LoadingSpinner } from "@/ui/components/LoadingSpinner";

function Messages() {
  const [conversations, setConversations] = useState<ConversationWithPatient[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [draft, setDraft] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  
  const [showNewGroup, setShowNewGroup] = useState<boolean>(false);
  const [selectedForGroup, setSelectedForGroup] = useState<Record<string, boolean>>({});
  const [selectedLabels, setSelectedLabels] = useState<Record<string, string>>({});
  const [allContacts, setAllContacts] = useState<Array<{ id: string; name: string; avatarUrl?: string }>>([]);
  const [groupFilter, setGroupFilter] = useState<string>("");
  const [isCreatingGroup, setIsCreatingGroup] = useState<boolean>(false);
  const [broadcastIds, setBroadcastIds] = useState<string[] | null>(null);
  const [broadcastLabels, setBroadcastLabels] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [imageViewerUrl, setImageViewerUrl] = useState<string | null>(null);
  const [showAttachments, setShowAttachments] = useState<boolean>(false);
  const [showRxModal, setShowRxModal] = useState<boolean>(false);
  const [rxName, setRxName] = useState<string>("");
  const [rxInstructions, setRxInstructions] = useState<string>("");
  const [rxStatus, setRxStatus] = useState<string>("Ready");
  const [toast, setToast] = useState<{ title: string; desc?: string; actions?: React.ReactNode } | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  
  const subRef = useRef<null | (() => void)>(null);
  const convSubRef = useRef<null | (() => void)>(null);
  const allMsgSubRef = useRef<null | (() => void)>(null);
  const participantSubRef = useRef<null | (() => void)>(null);
  const contactsSubRef = useRef<null | (() => void)>(null);
  const ensuredKeyRef = useRef<Set<string>>(new Set());

  // Simple local cache to keep messages across route changes for non-admin accounts
  const cacheKeyFor = (convId: string) => `pc_msgs_${convId}`;
  const cacheSet = (convId: string, msgs: MessageRow[]) => {
    try { localStorage.setItem(cacheKeyFor(convId), JSON.stringify(msgs)); } catch {}
  };
  const cacheGet = (convId: string): MessageRow[] | null => {
    try {
      const raw = localStorage.getItem(cacheKeyFor(convId));
      return raw ? (JSON.parse(raw) as MessageRow[]) : null;
    } catch { return null; }
  };
  // Persist last message metadata to keep ordering stable across navigations
  const LAST_META_KEY = 'pc_last_message_meta';
  const loadLastMeta = (): Record<string, { text: string | null; created_at: string }> => {
    try { const raw = localStorage.getItem(LAST_META_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  };
  const saveLastMeta = (convId: string, text: string | null, createdAt: string) => {
    try {
      const meta = loadLastMeta();
      meta[convId] = { text, created_at: createdAt };
      localStorage.setItem(LAST_META_KEY, JSON.stringify(meta));
    } catch {}
  };
  // Wait for Supabase session to be available before wiring realtime/subscriptions
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) setAuthReady(true);
      else {
        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
          if (session) {
            setAuthReady(true);
            sub.subscription.unsubscribe();
          }
        });
      }
    })();
  }, []);

  // Removed global unread broadcast here; rely on global monitor in layout + sidebar subscription


  const selected = useMemo(() => conversations.find(c => c.id === selectedId) ?? conversations[0], [conversations, selectedId]);

  // Helper to compute a display name using participants first, then patient join, else fallback
  const formatPreview = (text: string | null | undefined): string => {
    if (!text) return "";
    const isUrl = /^https?:\/\//i.test(text);
    if (isUrl) {
      if (/\.(png|jpe?g|gif|webp)$/i.test(text)) return "Image";
      if (/\.pdf(\?|$)/i.test(text)) return "PDF";
      return "Attachment";
    }
    // Try JSON-based system/prescription updates
    if (text.trim().startsWith('{')) {
      try {
        const obj = JSON.parse(text);
        if (obj && typeof obj === 'object') {
          if (obj.title) return String(obj.title);
          if (obj.type === 'prescriptionUpdate') return 'Prescription Update';
          return 'Update';
        }
      } catch {}
    }
    return text;
  };
  const computeDisplayName = (
    participants: Array<{ id: string; slug: string | null; name: string | null | undefined; avatar_url: string | null }> | undefined,
    patient: { id: string; slug: string | null; name: string | null | undefined; avatar_url: string | null } | undefined
  ): { name: string; rep: { id: string; slug: string | null; name: string; avatar_url: string | null } } => {
    const partsRaw = Array.isArray(participants) ? participants : [];
    const parts = partsRaw.filter((p): p is { id: string; slug: string | null; name: string; avatar_url: string | null } => !!p && typeof p.name === "string" && p.name.length > 0);
    if (parts.length > 1) {
      return { name: parts.map(p => p.name).join(", "), rep: parts[0] };
    }
    if (parts.length === 1) {
      return { name: parts[0].name, rep: parts[0] };
    }
    if (patient) {
      const telSlug = (patient.slug || patient.id || '');
      if ((telSlug || '').startsWith('tel-')) {
        const phone = '+1 ' + telSlug.replace(/^tel-/, '').replace(/-to\d{4}$/, '');
        return { name: phone, rep: { id: patient.id, slug: patient.slug, name: phone, avatar_url: patient.avatar_url } };
      }
      if (typeof patient.name === "string" && patient.name.length > 0) {
        // If the name looks like a phone number (starts with +), use it directly
        if (patient.name.startsWith('+')) {
          return { name: patient.name, rep: { id: patient.id, slug: patient.slug, name: patient.name, avatar_url: patient.avatar_url } };
        }
        // If it's "Unknown", try to extract phone from slug or use the name
        if (patient.name === 'Unknown' && telSlug.startsWith('tel-')) {
          const phone = '+1 ' + telSlug.replace(/^tel-/, '').replace(/-to\d{4}$/, '');
          return { name: phone, rep: { id: patient.id, slug: patient.slug, name: phone, avatar_url: patient.avatar_url } };
        }
        return { name: patient.name, rep: { id: patient.id, slug: patient.slug, name: patient.name, avatar_url: patient.avatar_url } };
      }
    }
    const unknown = 'Unknown';
    return { name: unknown, rep: { id: patient?.id ?? "", slug: patient?.slug ?? null, name: unknown, avatar_url: patient?.avatar_url ?? null } };
  };

  const mapFromParticipantsRow = (row: any): ConversationWithPatient => {
    // Support both shapes:
    // - [{ contact: { id, name, avatar_url, ... } }] from raw SQL select
    // - [{ id, name, avatar_url, ... }] from API that already mapped to contacts
    const participants = ((row.participants ?? [])
      .map((p: any) => (p && (p.contact ?? p)))
      .filter(Boolean)) as Array<{ id: string; slug: string | null; name: string | null | undefined; avatar_url: string | null; contact_type?: 'patient'|'provider'|'social_worker' }>;
    const patient = (row.patient as any | undefined);
    const d = computeDisplayName(participants, patient);
    const mapped: ConversationWithPatient = {
      id: row.id,
      patient_contact_id: row.patient_contact_id,
      unread_count: row.unread_count,
      status: row.status,
      created_at: row.created_at,
      // Keep actual patient id/slug from row.patient so placeholder tel- slugs are preserved
      patient: { id: patient?.id ?? d.rep?.id ?? "", slug: patient?.slug ?? d.rep?.slug ?? null, name: d.name, avatar_url: (patient as any)?.avatar_url ?? d.rep?.avatar_url ?? null, contact_type: (patient as any)?.contact_type },
      last_message_text: row.last_message_text ?? row.messages?.[0]?.text ?? null,
      last_message_at: row.last_message_at ?? row.messages?.[0]?.created_at ?? null,
    } as ConversationWithPatient;
    (mapped as any).display_name = d.name;
    // Attach hints for previews and header display
    (mapped as any).pharmacy_location = (row.patient as any)?.pharmacy_location || (participants[0] as any)?.pharmacy_location || null;
    (mapped as any).location_hint = (row as any)?.location_hint ?? null;
    return mapped;
  };

  // Persist selected conversation across navigations
  useEffect(() => {
    if (selectedId) {
      try { localStorage.setItem("pc_last_selected_conversation", selectedId); } catch {}
    }
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Close image viewer on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImageViewerUrl(null);
    };
    window.addEventListener('keydown', onKey);
    const onSaved = (e: any) => {
      const d = (e as CustomEvent).detail as any;
      // If the currently selected conversation is tied to this slug, refresh its header info
      setConversations(prev => prev.map(c => {
        const matches = (c as any)?.patient?.slug === d?.slug;
        if (!matches) return c;
        return { ...c, patient: { ...(c as any).patient, name: d?.name }, pharmacy_location: d?.pharmacy_location ?? (c as any).pharmacy_location } as any;
      }));
    };
    window.addEventListener('pc_contact_saved', onSaved as any);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Persist selected conversation so returning from profile keeps context (and across role/location changes)
  useEffect(() => {
    if (!authReady) return;
    (async () => {
      // Load conversations (prefer participants if available)
      const convsWithParts = await listConversationsWithParticipants();
      
      // Clean up deleted conversations list - remove IDs that exist again
      try {
        const deleted = JSON.parse(localStorage.getItem('pc_deleted_conversations') || '[]');
        const existingIds = convsWithParts.map(c => c.id);
        const stillDeleted = deleted.filter((id: string) => !existingIds.includes(id));
        if (stillDeleted.length !== deleted.length) {
          localStorage.setItem('pc_deleted_conversations', JSON.stringify(stillDeleted));
          console.log('🧹 Cleaned up deleted conversations list');
        }
      } catch {}
      
      const convsRaw = convsWithParts.map(row => mapFromParticipantsRow(row as any)).map(c => {
        // If we have cached messages, set preview fields
        const cached = cacheGet(c.id);
        if (cached && cached.length) {
          (c as any).last_message_text = cached[cached.length - 1]?.text ?? null;
          (c as any).last_message_at = cached[cached.length - 1]?.created_at ?? null;
        }
        // Also hydrate from last-message metadata cache to stabilize ordering
        if (!(c as any).last_message_at) {
          const m = loadLastMeta()[c.id];
          if (m) {
            (c as any).last_message_text = (c as any).last_message_text ?? m.text ?? null;
            (c as any).last_message_at = m.created_at ?? null;
          }
        }
        return c;
      });
      // Dedupe: keep a single 1:1 conversation per patient_contact_id (but don't merge broadcast threads)
      const convs = (() => {
        const map = new Map<string, any>();
        for (const c of convsRaw) {
          const isBroadcast = String(((c as any).status || '')).startsWith('broadcast');
          const key = isBroadcast ? c.id : (c.patient_contact_id || c.id);
          const prev = map.get(key);
          if (!prev) { map.set(key, c); continue; }
          const a = new Date(((prev as any).last_message_at || prev.created_at) as string).getTime();
          const b = new Date(((c as any).last_message_at || c.created_at) as string).getTime();
          if (b >= a) map.set(key, c);
        }
        return Array.from(map.values());
      })();
      // Backfill previews if last_message_text was not selected
      try {
        const latest = await fetchLastMessages(convs.map(c => c.id));
        for (const c of convs) {
          const l = latest[c.id];
          if (l) {
            (c as any).last_message_text = l.text;
            (c as any).last_message_at = l.created_at;
            // Persist for future navigations
            saveLastMeta(c.id, l.text, l.created_at);
          }
        }
      } catch {}
      // Sort by latest message time (fallback to created_at)
      const sorted = [...convs].sort((a: any, b: any) => {
        const at = new Date((a.last_message_at || a.created_at) as string).getTime();
        const bt = new Date((b.last_message_at || b.created_at) as string).getTime();
        return bt - at;
      });
      setConversations(sorted);
      convSubRef.current?.();
      // CLEAN CONVERSATION SUBSCRIPTION - ONLY UPDATE DISPLAY, NO INTERFERENCE
      console.log("🔄 CLEAN CONVERSATION SUBSCRIPTION ENABLED");
      convSubRef.current = subscribeToConversations(async (row) => {
        // Fetch full row with patient and avoid duplicates
        const full = await fetchConversationWithParticipantsById(row.id);
        let shouldAutoSelect = false;
        
        setConversations(prev => {
          if (prev.some(c => c.id === row.id)) return prev;
          const mapped = full ? mapFromParticipantsRow(full) : ({ id: row.id, patient_contact_id: row.patient_contact_id, unread_count: row.unread_count, status: row.status, created_at: row.created_at, patient: { id: row.patient_contact_id, slug: null, name: "New Conversation", avatar_url: null } } as ConversationWithPatient);
          
          // If we already have a conversation for the same patient, keep the newer one (skip broadcast threads from merging)
          const mappedIsBroadcast = String(((mapped as any).status || '')).startsWith('broadcast');
          const idxSamePatient = mappedIsBroadcast ? -1 : prev.findIndex(c => c.patient_contact_id === mapped.patient_contact_id && !String(((c as any).status || '')).startsWith('broadcast'));
          if (idxSamePatient >= 0) {
            const existing = prev[idxSamePatient];
            const a = new Date(((existing as any).last_message_at || existing.created_at) as string).getTime();
            const b = new Date(((mapped as any).last_message_at || mapped.created_at) as string).getTime();
            const next = [...prev];
            if (b >= a) { 
              // If this is a newer conversation, auto-select it if no conversation is selected or if it's very recent (likely from a new message)
              const isVeryRecent = Date.now() - b < 5000; // Within last 5 seconds
              shouldAutoSelect = !selectedId || isVeryRecent;
              next.splice(idxSamePatient, 1); 
              return [mapped, ...next]; 
            }
            return prev;
          }
          
          // New conversation - auto-select if no conversation is selected or if this is very recent (likely from a new message)
          const createdTime = new Date(((mapped as any).last_message_at || mapped.created_at) as string).getTime();
          const isVeryRecent = Date.now() - createdTime < 5000; // Within last 5 seconds
          shouldAutoSelect = !selectedId || isVeryRecent;
          return [mapped, ...prev];
        });
        
        // Auto-select new conversation with proper message loading
        // This ensures that when someone texts for the first time, their conversation and message are immediately visible
        if (shouldAutoSelect) {
          console.log('🆕 Auto-selecting new conversation:', row.id?.slice(0, 8));
          setSelectedId(row.id);
          // Load messages with proper delay to avoid race condition with message insertion
          setTimeout(async () => {
            try {
              const msgs = await listMessages(row.id);
              if (msgs.length > 0) {
                setMessages(msgs);
                console.log('🆕 Loaded messages for new conversation:', msgs.length);
              } else {
                // If no messages yet, try again with longer delay
                setTimeout(async () => {
                  try {
                    const retryMsgs = await listMessages(row.id);
                    setMessages(retryMsgs);
                    console.log('🆕 Retry loaded messages for new conversation:', retryMsgs.length);
                  } catch (e) {
                    console.error('Failed to load messages on retry:', e);
                  }
                }, 1000);
              }
            } catch (e) {
              console.error('Failed to load messages for new conversation:', e);
            }
          }, 500); // Increased delay to allow message insertion to complete
        }
      }, (row) => {
        // SAFE UPDATE: Update conversation display with small delay to avoid race conditions
        console.log("🔄 Messages.tsx conversation update:", row.id?.slice(0, 8), "unread_count:", (row as any).unread_count);
        
        // Check if this conversation should be auto-selected (new message on unselected conversation)
        const shouldAutoSelectExisting = !selectedId && (row as any).unread_count > 0;
        if (shouldAutoSelectExisting) {
          console.log('🆕 Auto-selecting conversation with new message:', row.id?.slice(0, 8));
          setSelectedId(row.id);
          // Load messages with delay to ensure message insertion has completed
          setTimeout(async () => {
            try {
              const msgs = await listMessages(row.id);
              setMessages(msgs);
              console.log('🆕 Loaded messages for conversation with new message:', msgs.length);
            } catch (e) {
              console.error('Failed to load messages for conversation:', e);
            }
          }, 300);
        }
        
        // Small delay to let unread store process first
        setTimeout(() => {
          setConversations(prev => {
            return prev.map(c => {
              if (c.id !== row.id) return c;
              // Trust the database value for unread_count (no Math.max interference)
              return { 
                ...c, 
                unread_count: Number((row as any).unread_count ?? 0),
                status: row.status,
                last_message_text: (row as any).last_message_text || c.last_message_text,
                last_message_at: (row as any).last_message_at || c.last_message_at
              } as any;
            });
          });
        }, 100); // 100ms delay to avoid race conditions
      });
      // Live-update conversation display names when a contact is edited
      contactsSubRef.current?.();
      const channel = supabase
        .channel('contacts_updates')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contacts' }, (payload) => {
          const updated = payload.new as any;
          const newName = [updated.first_name, updated.middle_name, updated.last_name].filter(Boolean).join(' ') || updated.name || '';
          setConversations(prev => prev.map(c => {
            let changed = false;
            const next: any = { ...c };
            // Update patient
            if (next.patient && next.patient.id === updated.id) {
              next.patient = { ...next.patient, name: newName, contact_type: updated.contact_type };
              changed = true;
            }
            // Update participants if present
            if (Array.isArray((next as any).participants)) {
              const parts = (next as any).participants as any[];
              let partsChanged = false;
              const newParts = parts.map(p => {
                if (p && p.id === updated.id) { 
                  partsChanged = true; 
                  return { ...p, name: newName, contact_type: updated.contact_type }; 
                }
                return p;
              });
              if (partsChanged) {
                (next as any).participants = newParts;
                changed = true;
              }
            }
            if (changed) {
              const d = computeDisplayName((next as any).participants, next.patient);
              (next as any).display_name = d.name;
              next.patient = { 
                id: d.rep.id, 
                slug: d.rep.slug, 
                name: d.rep.name, 
                avatar_url: d.rep.avatar_url,
                contact_type: next.patient?.contact_type || updated.contact_type
              };
              return next as any;
            }
            return c;
          }));
        })
        .subscribe();
      contactsSubRef.current = () => { try { supabase.removeChannel(channel); } catch {} };
      // Trigger quick actions if requested via query param
      const quick = searchParams.get('action');
      if (quick === 'new') {
        setShowNewGroup(true);
      } else if (quick === 'new-group') {
        setShowNewGroup(true);
      }

      // If there is no deep link, try restoring last selected conversation; do not auto-select first
      try {
        const last = localStorage.getItem("pc_last_selected_conversation");
        const deleted = JSON.parse(localStorage.getItem('pc_deleted_conversations') || '[]');
        const wasDeleted = last && deleted.includes(last);
        const exists = last && convs.some(c => c.id === last);
        
        if (wasDeleted) {
          console.log('🚫 Preventing restoration of deleted conversation:', last?.slice(0, 8));
          localStorage.removeItem("pc_last_selected_conversation");
        } else if (exists) {
          console.log('🔄 Auto-restoring last selected conversation:', last?.slice(0, 8));
          setSelectedId(last!);
        } else if (last) {
          console.log('🗑️ Clearing stale conversation from localStorage:', last?.slice(0, 8));
          localStorage.removeItem("pc_last_selected_conversation");
        }
      } catch {
        // leave unselected until user clicks
      }
    })();
    return () => { convSubRef.current?.(); contactsSubRef.current?.(); };
  }, [authReady]);

  // If deep-linked with patientId, ensure/select the 1:1 conversation (no modal)
  useEffect(() => {
    (async () => {
      const slugOrId = searchParams.get("patientId");
      if (!slugOrId) return;
      const key = `ensure_${slugOrId}`;
      if (ensuredKeyRef.current.has(key)) return;
      ensuredKeyRef.current.add(key);
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slugOrId);
      let ensured: any = null;
      if (isUuid) {
        try { ensured = await ensureConversationForContactId(slugOrId); } catch {}
      } else {
        ensured = await ensureConversationForSlug(slugOrId).catch(() => null);
        // If just created and not yet visible, retry once after a short delay
        if (!ensured) {
          await new Promise(r => setTimeout(r, 400));
          ensured = await ensureConversationForSlug(slugOrId).catch(() => null);
        }
      }
      if (ensured) {
        const full = await fetchConversationWithParticipantsById(ensured.id);
        if (full) {
          setConversations(prev => {
            const exists = prev.some(c => c.id === full.id);
            const mapped = mapFromParticipantsRow(full);
            return exists ? prev.map(c => c.id === full.id ? mapped : c) : [mapped, ...prev];
          });
        }
        setSelectedId(ensured.id);
        return;
      }
      // If still not ensured due to RLS timing, try selecting conversation by patient id directly with a narrow select
      if (isUuid) {
        try {
          const { data } = await supabase
            .from('conversations')
            .select('id,patient_contact_id,unread_count,status,created_at')
            .eq('patient_contact_id', slugOrId)
            .maybeSingle();
          const conv = data as any;
          if (conv?.id) {
            setSelectedId(conv.id);
          }
        } catch {}
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load contacts when opening new group bar
  useEffect(() => {
    (async () => {
      if (!showNewGroup) return;
      // Load DB ids directly to ensure inserts succeed
      const { data, error } = await supabase.from("contacts").select("id,name,avatar_url").order("name", { ascending: true });
      if (!error && data) {
        setAllContacts((data as any[]).map(r => ({ id: r.id as string, name: r.name as string, avatarUrl: r.avatar_url as (string | undefined) })));
      }
    })();
  }, [showNewGroup]);

  // While the new group overlay is open, refresh the list on any contacts change
  useEffect(() => {
    if (!showNewGroup) return;
    const refresh = async () => {
      const { data, error } = await supabase.from('contacts').select('id,name,avatar_url').order('name', { ascending: true });
      if (!error && data) setAllContacts((data as any[]).map(r => ({ id: r.id as string, name: r.name as string, avatarUrl: r.avatar_url as (string | undefined) })));
    };
    // Listen to DB changes
    const channel = supabase
      .channel('contacts_new_group_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, () => { refresh(); })
      .subscribe();
    // Also respond to local save events
    const onSaved = () => { refresh(); };
    window.addEventListener('pc_contact_saved', onSaved as any);
    return () => {
      try { supabase.removeChannel(channel); } catch {}
      window.removeEventListener('pc_contact_saved', onSaved as any);
    };
  }, [showNewGroup]);

  // Debounced server-side search for the overlay (uses RPC if available)
  useEffect(() => {
    if (!showNewGroup) return;
    const q = groupFilter.trim();
    const t = setTimeout(async () => {
      try {
        if (!q) {
          const { data, error } = await supabase.from('contacts').select('id,name,avatar_url').order('name', { ascending: true });
          if (!error && data) setAllContacts((data as any[]).map(r => ({ id: r.id as string, name: r.name as string, avatarUrl: r.avatar_url as (string | undefined) })));
          return;
        }
        const { data, error } = await supabase.rpc('search_contacts', { q, limit_count: 50 });
        if (!error && Array.isArray(data)) {
          setAllContacts((data as any[]).map(row => ({ id: row.id as string, name: row.name as string })));
        }
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [groupFilter, showNewGroup]);
  useEffect(() => {
    if (!authReady) return;
    (async () => {
      if (!selectedId) return;
      // Load messages for selected conversation
      // Prime from cache to avoid empty UI on slow/blocked fetches
      const cached = cacheGet(selectedId);
      if (cached && cached.length >= 0) setMessages(cached);
      try {
        const list = await listMessages(selected.id);
        if (Array.isArray(list)) {
          // Build a de-duplicated set by (sender,text,rounded timestamp)
          const round = (iso: string) => {
            const t = new Date(iso).getTime();
            return Math.round(t / 1000); // second granularity to group retried writes
          };
          const sig = (m: any) => (m.id && !String(m.id).startsWith('local-'))
            ? m.id
            : `${m.sender}|${m.type || 'text'}|${m.text || ''}|${round(m.created_at)}|${m.conversation_id}`;
          const map = new Map<string, any>();
          // Keep the earliest occurrence for identical patient texts within a 3s window
          for (const m of list) {
            const k = sig(m);
            if (!map.has(k)) map.set(k, m);
          }
          // Drop optimistic local echoes on refresh; rely on server list instead
          const prev = (cacheGet(selected.id) || []).filter(p => !String(p.id).startsWith('local-'));
          for (const m of prev) map.set(sig(m), m);
          const merged = Array.from(map.values()).sort((a,b)=> new Date(a.created_at).getTime()-new Date(b.created_at).getTime());
          setMessages(merged);
          cacheSet(selected.id, merged);
        }
      } catch (e: any) {
        // Keep existing messages to avoid UI wipe on transient errors
        setToast({ title: 'Unable to load messages', desc: e?.message ?? 'Temporary network error' });
      }
      // Do NOT auto-reset unread count when conversation is programmatically selected
      // Only reset when user explicitly clicks on a conversation
      // Realtime
      subRef.current?.();
      subRef.current = subscribeToMessages(selectedId, async (m) => {
        setMessages(prev => {
          const round = (iso: string) => Math.round(new Date(iso).getTime() / 1000);
          // Consider both staff and patient messages to dedupe realtime echo vs optimistic local
          const same = (a: any, b: any) =>
            a.sender === b.sender &&
            a.conversation_id === b.conversation_id &&
            ((a.type || 'text') === (b.type || 'text')) &&
            ((a.text || '') === (b.text || '')) &&
            Math.abs(round(a.created_at) - round(b.created_at)) <= 3;
          if (m.id && prev.some(p => p.id === m.id)) return prev; // exact match exists
          // Drop realtime echo if an equivalent message already exists (including optimistic local)
          if (prev.some(p => same(p, m))) return prev;
          // Drop optimistic local echo within a short window
          const filtered = prev.filter(p => !(String(p.id).startsWith('local-') && same(p, m)));
          const next = [...filtered, m];
          cacheSet(selectedId, next);
          return next;
        });
        // Update preview for this conversation
        setConversations(prev => {
          const idx = prev.findIndex(c => c.id === selectedId);
          if (idx < 0) return prev;
          const updated: any = { ...prev[idx], last_message_text: m.text ?? "", last_message_at: m.created_at } as ConversationWithPatient;
          // Do NOT auto-reset unread count - let database trigger handle it
          // Only reset when user explicitly clicks/opens the conversation
          const next = [...prev];
          next.splice(idx, 1);
          const reordered = [updated, ...next];
          // Persist metadata so order survives navigation
          saveLastMeta(m.conversation_id, m.text ?? '', m.created_at);
          return reordered;
        });
      });
    })();
    return () => { subRef.current?.(); };
  }, [selectedId, authReady]);

  // Realtime: any message anywhere updates that conversation's preview
  useEffect(() => {
    if (!authReady) return;
    allMsgSubRef.current?.();
    allMsgSubRef.current = subscribeToAllMessages((m) => {
      // Only update last message preview and reorder.
      // Avoid double-counting; rely on DB UPDATE for unread_count, but reorder immediately for recency.
      setConversations(prev => {
        const idx = prev.findIndex(c => c.id === m.conversation_id);
        if (idx < 0) return prev;
        const updated: any = { ...prev[idx], last_message_text: m.text ?? "", last_message_at: m.created_at } as ConversationWithPatient;
        const next = [...prev];
        next.splice(idx, 1);
        return [updated, ...next];
      });
      // Rely on conversations UPDATE and client guard to adjust unread; avoid forcing server value here
      // Fallback toast if global subscriber hasn't attached yet and this is another thread
      if (m.sender === 'patient' && m.conversation_id !== selectedId) {
        try {
          window.dispatchEvent(new CustomEvent('pc_show_toast', { detail: { title: 'New message', desc: (m.text || '').slice(0, 80) } }));
        } catch {}
      }
    });
    return () => { allMsgSubRef.current?.(); };
  }, [authReady]);

  // Realtime: when a participant is added to a conversation, fetch full row to ensure name is populated
  useEffect(() => {
    if (!authReady) return;
    participantSubRef.current?.();
    participantSubRef.current = subscribeToParticipants(async ({ conversation_id }) => {
      const full = await fetchConversationWithParticipantsById(conversation_id);
      if (!full) return;
      setConversations(prev => {
        const exists = prev.some(c => c.id === conversation_id);
        const mapped = mapFromParticipantsRow(full);
        if (!exists) return [mapped, ...prev];
        return prev.map(c => c.id === conversation_id ? mapped : c);
      });
    });
    return () => { participantSubRef.current?.(); };
  }, [authReady]);


  if (!authReady) {
    return (
      <DefaultPageLayout>
        <div className="flex h-full w-full items-stretch">
          <PharmacySidebar active="messages" />
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
        <PharmacySidebar active="messages" />
        <div className="flex h-full w-full items-start">
          <div className="flex min-w-[28rem] w-[28rem] flex-none flex-col items-start self-stretch border-r border-solid border-neutral-border bg-neutral-50">
            <div className="grid w-full grid-cols-[auto,1fr,auto] items-center gap-3 border-b border-solid border-neutral-border px-6 py-4 sticky top-0 bg-neutral-50 z-10">
              <span className="text-heading-3 font-heading-3 text-default-font">Patients</span>
              <TextField className="h-auto w-full" variant="filled" label="" helpText="">
                <TextField.Input
                  placeholder="Search patients"
                  value={query}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
                />
              </TextField>
              {/* New button removed (broadcasts moved to separate tab) */}
            </div>
            {toast ? (
              <div className="fixed bottom-6 right-6 z-[80]">
                <Toast variant="neutral" title={toast.title} description={toast.desc} actions={toast.actions} />
              </div>
            ) : null}
          <div className="flex w-full grow shrink-0 basis-0 flex-col items-start overflow-auto">
              <div className="flex w-full flex-col items-start gap-3 border-b border-solid border-neutral-border px-4 py-4">
                {conversations
                  .filter(c => ((c as any).display_name ?? c.patient?.name ?? "").toLowerCase().includes(query.toLowerCase()))
                  .map(conv => (
                  <div
                    key={conv.id}
                    className={"flex w-full items-center gap-4 px-3 py-3 cursor-pointer rounded-xl transition-colors " + (conv.id === selectedId ? "bg-brand-50" : "hover:bg-neutral-50")}
                    onClick={async () => {
                      // Only reset unread count if this is a different conversation (manual user click)
                      const isManualClick = conv.id !== selectedId;
                      setSelectedId(conv.id);
                      
                      if (isManualClick && (conv.unread_count ?? 0) > 0) {
                        console.log('🎯 Manual click on unread conversation - resetting unread count');
                        await resetUnread(conv.id);
                        // Update local state to reflect the reset
                        setConversations(prev => {
                          return prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } as any : c);
                        });
                      } else {
                        console.log('🔄 Same conversation or no unread messages - no reset needed');
                      }
                     }}
                  >
                    <AvatarCmp>
                      {(() => {
                        const name = conv.patient?.name ?? "";
                        // For group chats (comma-separated names), show "G" for Group
                        if (name.includes(",")) {
                          return "G";
                        }
                        // For individual chats, show first letters of first and last name (max 2)
                        const initials = name.split(" ").map(s => s[0]).join("");
                        return initials.length > 2 ? initials.substring(0, 2) : initials;
                      })()}
                    </AvatarCmp>
                    <div className="flex grow shrink-0 basis-0 flex-col items-start">
                      <span className="text-body-bold font-body-bold text-default-font">
                        {conv.patient?.name ?? (conv.patient?.id?.startsWith("tel-") ? conv.patient?.id.replace(/^tel-/, "+1 ") : "New Conversation")}
                      </span>
                      <span className="line-clamp-1 text-caption font-caption text-subtext-color">
                        {formatPreview(conv.last_message_text)}
                      </span>
                    </div>
                    {/* Location indicator */}
                    {((conv as any).pharmacy_location ?? null) ? (
                      <BadgeCmp variant={(conv as any).pharmacy_location === 'Mount Vernon' ? 'brand' : 'neutral'}>
                        {(conv as any).pharmacy_location}
                      </BadgeCmp>
                    ) : (
                      <BadgeCmp variant="neutral">Unknown</BadgeCmp>
                    )}
                    {/* Contact type pill: Patient / Provider / Social Worker */}
                    {(() => {
                      const t = (conv as any)?.patient?.contact_type as ('patient'|'provider'|'social_worker'|undefined);
                      if (!t) return null;
                      const label = t === 'social_worker' ? 'Social Worker' : (t.charAt(0).toUpperCase() + t.slice(1));
                      const variant = t === 'patient' ? 'neutral' : (t === 'provider' ? 'brand' : 'warning');
                      return <BadgeCmp variant={variant as any}>{label}</BadgeCmp>;
                    })()}
                    {conv.status === "refill-due" ? <BadgeCmp variant="warning">Refill Due</BadgeCmp> : null}
                    {(Number((conv as any).unread_count ?? 0) > 0) ? <BadgeCmp>{Number((conv as any).unread_count ?? 0)}</BadgeCmp> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex grow shrink-0 basis-0 flex-col items-start self-stretch">
          {/* Legacy group UI removed per broadcast channels conversion */}
            <div className="flex w-full items-center justify-between border-b border-solid border-neutral-border px-6 py-4 sticky top-0 bg-neutral-50 z-10">
              <div className="flex items-center gap-4">
                <Avatar
                  size="large"
                  image={selected?.patient?.avatar_url ?? ""}
                >
                  {(() => {
                    const name = selected?.patient?.name ?? "";
                    // For group chats (comma-separated names), show "G" for Group
                    if (name.includes(",")) {
                      return "G";
                    }
                    // For individual chats, show first letters of first and last name (max 2)
                    const initials = name.split(" ").map(s => s[0]).join("");
                    return initials.length > 2 ? initials.substring(0, 2) : initials;
                  })()}
                </Avatar>
                <div className="flex flex-col items-start">
                  {broadcastIds ? (
                    <>
                      <span className="text-heading-3 font-heading-3 text-default-font">Broadcast to {broadcastLabels.join(", ")}</span>
                      <span className="text-caption font-caption text-subtext-color">Replies will arrive in each direct thread.</span>
                    </>
                  ) : (
                    <>
                      <span className="text-heading-3 font-heading-3 text-default-font">
                        {(() => {
                          const pat: any = selected?.patient || {};
                          // Always prefer the actual contact name if available
                          if (pat.name && pat.name !== 'Unknown') {
                            return pat.name;
                          }
                          // Fallback to phone number formatting for tel- placeholders
                          const telSlug = String(pat.slug || pat.id || '');
                          if (telSlug.startsWith('tel-')) {
                            return '+1 ' + telSlug.replace(/^tel-/, '').replace(/-to\d{4}$/, '');
                          }
                          return pat.name || 'New Conversation';
                        })()}
                      </span>
                      <span className="text-caption font-caption text-subtext-color">
                        To: {(() => {
                          const sel = conversations.find(c => c.id === selectedId) as any;
                          return sel?.location_hint || sel?.pharmacy_location || 'Unknown';
                        })()}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                  {selected ? (
                    <Button variant="neutral-secondary" onClick={async () => {
                      // Look up the patient contact to determine if it's a tel- placeholder
                      let contactSlug: string | null = null;
                      let isUnknown = false;
                      
                      try {
                        // Use the already imported supabase client
                        
                        // Try direct contact lookup first
                        const { data } = await supabase
                          .from('contacts')
                          .select('slug')
                          .eq('id', selected.patient_contact_id)
                          .maybeSingle();
                        
                        contactSlug = (data as any)?.slug || null;
                        isUnknown = contactSlug?.startsWith('tel-') ?? false;
                        
                        // If no contact found, try looking up via conversation join (bypass RLS)
                        if (!data) {
                          const { data: joinData } = await supabase
                            .from('conversations')
                            .select('patient:contacts!conversations_patient_contact_id_fkey(slug)')
                            .eq('id', selected.id)
                            .maybeSingle();
                          
                          const patient = (joinData as any)?.patient;
                          contactSlug = patient?.slug || null;
                          isUnknown = contactSlug?.startsWith('tel-') ?? false;
                        }
                      } catch (e) {
                        console.error('Error looking up contact for delete:', e);
                      }
                      
                      const ok = confirm(isUnknown ? 'Delete this unknown number and all its messages?' : 'Delete this conversation? This removes its messages.');
                      if (!ok) return;
                      
                      try {
                        if (isUnknown && contactSlug) {
                          // Purge unknown tel- placeholder contact and all related data
                          const api = await import('@/lib/contactsApi');
                          await api.deleteContactCompletelyBySlug(contactSlug);
                        } else {
                          // Just delete the conversation (keep the saved contact)
                          await deleteConversation(selected.id);
                        }
                        
                        // Always clear localStorage and mark conversation as deleted
                        try { 
                          localStorage.removeItem('pc_last_selected_conversation');
                          // Track deleted conversations to prevent auto-restoration
                          const deleted = JSON.parse(localStorage.getItem('pc_deleted_conversations') || '[]');
                          deleted.push(selected.id);
                          localStorage.setItem('pc_deleted_conversations', JSON.stringify(deleted));
                          console.log('🗑️ Cleared localStorage and marked conversation as deleted');
                        } catch {}
                        
                        setConversations(prev => prev.filter(c => c.id !== selected.id));
                        const remaining = conversations.filter(c => c.id !== selected.id);
                        setSelectedId(remaining[0]?.id ?? '');
                        
                      } catch (error) {
                        console.error('Error deleting:', error);
                        // Refresh on error
                        const convsWithParts = await listConversationsWithParticipants();
                        setConversations(convsWithParts.map(row => mapFromParticipantsRow(row as any)));
                        setSelectedId(conversations[0]?.id ?? '');
                      }
                    }}>Delete</Button>
                  ) : null}
                  <Button variant="neutral-tertiary" onClick={() => setShowAttachments(true)}>
                    Attachments
                  </Button>
                  {(selected && (conversations.find(c => c.id === selectedId)?.status === 'broadcast' || (conversations.find(c => c.id === selectedId)?.status || '').startsWith('broadcast:'))) ? (
                    <>
                      <Button variant="neutral-tertiary" onClick={async () => {
                        const current = conversations.find(c => c.id === selectedId) as any;
                        const currentTitle = getBroadcastTitleFromStatus(current?.status) || '';
                        const next = prompt('Rename broadcast', currentTitle) ?? '';
                        try { await setBroadcastTitle(selectedId, next); } catch (e: any) { alert(e?.message || 'Failed to rename'); }
                        // Reflect locally
                        setConversations(prev => prev.map(c => c.id === selectedId ? ({ ...c, status: next ? `broadcast:${next}` : 'broadcast' } as any) : c));
                      }}>Rename</Button>
                      <Button variant="neutral-tertiary" onClick={async () => {
                        try {
                          const existing = await getConversationParticipants(selectedId);
                          const names = existing.map(e => e.name).join(', ');
                          const next = prompt(`Manage recipients (comma-separated names). Current: ${names}\nEnter exact names to keep`, names) ?? names;
                          // Map names back to IDs from current contacts in overlay cache; best-effort using existing participants list
                          const desiredNames = next.split(',').map(s => s.trim()).filter(Boolean);
                          const desiredIds: string[] = existing.filter(e => desiredNames.includes(e.name)).map(e => e.id);
                          await setBroadcastParticipants(selectedId, desiredIds);
                          setToast({ title: 'Recipients updated' });
                        } catch (e: any) {
                          alert(e?.message || 'Failed to update recipients');
                        }
                      }}>Manage recipients</Button>
                    </>
                  ) : null}
                  {(() => {
                    const pat: any = (selected as any)?.patient || {};
                    const slugOrId = String(pat.slug || pat.id || '');
                    const hasName = typeof pat.name === 'string' && pat.name.trim().length > 0 && !/^\+?\d/.test(pat.name.trim());
                    const isPlaceholder = slugOrId.startsWith('tel-');
                    // Always offer create for tel- placeholders regardless of location_hint
                    const shouldOfferCreate = isPlaceholder && !hasName;
                    return shouldOfferCreate ? (
                      <Button variant="brand-tertiary" onClick={() => navigate(`/contacts/${slugOrId}/edit`)}>
                        Create New Contact
                      </Button>
                    ) : (
                      <Button onClick={() => {
                        const slug = pat.slug || (!String(pat.id).startsWith('tel-') ? pat.id : '') || (pat.name || '').toLowerCase().replace(/\s+/g, '-') || '';
                        if (slug) navigate(`/contacts/${slug}`);
                      }}>Profile</Button>
                    );
                  })()}
                {/* Removed '+' dropdown menu per request */}
              </div>
            </div>
            <div className="flex w-full grow shrink-0 basis-0 flex-col items-start gap-4 px-6 py-6 overflow-auto">
              {(() => {
                let lastLabel = "";
                return messages.map((m) => {
                   const label = formatDateLabel(m.created_at);
                  const showLabel = label !== lastLabel;
                  lastLabel = label;
                  return (
                    <React.Fragment key={m.id}>
                      {showLabel ? <TimelineDivider>{label}</TimelineDivider> : null}
                      <div className={"flex w-full items-start gap-4 " + (m.sender === "staff" ? "justify-end" : "") }>
                        {m.sender === "patient" ? (
                          <Avatar size="small">
                            {(() => {
                              const name = selected?.patient?.name ?? "";
                              // For group chats (comma-separated names), show "G" for Group
                              if (name.includes(",")) {
                                return "G";
                              }
                              // For individual chats, show first letters of first and last name (max 2)
                              const initials = name.split(" ").map(s => s[0]).join("");
                              return initials.length > 2 ? initials.substring(0, 2) : initials;
                            })()}
                          </Avatar>
                        ) : null}
                      <div className={"flex flex-col items-start gap-3 rounded-xl px-5 py-4 max-w-[70%] " + (m.sender === "staff" ? "bg-brand-100" : m.sender === "system" ? "bg-neutral-50" : "bg-neutral-100") }>
                          {m.type === "prescriptionUpdate" ? (
                            (() => {
                              let data: any = null;
                              try { data = JSON.parse(m.text ?? '{}'); } catch {}
                              const title = data?.title ?? 'Prescription Update';
                              const headline = data?.headline ?? (m.text ?? '');
                              const medName = data?.medication?.name ?? '';
                              const medInstr = data?.medication?.instructions ?? '';
                              const status = (data?.status ?? 'Ready') as string;
                              const variant = /ready/i.test(status) ? 'success' : (/due|request/i.test(status) ? 'warning' : 'neutral');
                              return (
                                <>
                                  <span className="text-body-bold font-body-bold text-default-font">💊 {title}</span>
                                  {headline ? (
                                    <span className="text-body font-body text-default-font">{headline}</span>
                                  ) : null}
                              <div className="flex w-full flex-col items-start gap-2 rounded-lg bg-brand-50 px-4 py-3">
                                    {medName ? (
                                      <span className="text-body-bold font-body-bold text-default-font">{medName}</span>
                                    ) : null}
                                    {medInstr ? (
                                      <span className="text-body font-body text-default-font">{medInstr}</span>
                                    ) : null}
                                    <Badge variant={variant as any}>{status}</Badge>
                              </div>
                            </>
                              );
                            })()
                          ) : m.type === "attachment" ? (
                            <>
                              {(() => {
                                const url = m.text ?? "";
                                const isImage = /\.(png|jpe?g|gif|webp)$/i.test(url);
                                const isPdf = /\.pdf$/i.test(url);
                                const isVideo = /\.(mp4|webm|ogg)$/i.test(url);
                                console.log(`🖼️ Rendering attachment: ${url}, isImage: ${isImage}, isPdf: ${isPdf}, isVideo: ${isVideo}`);
                                if (isImage) {
                                  return (
                                    <img
                                      src={url}
                                      alt="attachment"
                                      className="max-w-[420px] max-h-[320px] rounded-md border border-neutral-border cursor-zoom-in object-contain"
                                      onClick={() => setImageViewerUrl(url)}
                                      onError={(e) => {
                                        console.error(`❌ Image failed to load: ${url}`, e);
                                      }}
                                      onLoad={() => {
                                        console.log(`✅ Image loaded successfully: ${url}`);
                                      }}
                                    />
                                  );
                                }
                                if (isVideo) {
                                  return (
                                    <video controls className="max-w-[420px] max-h-[320px] rounded-md border border-neutral-border">
                                      <source src={url} />
                                    </video>
                                  );
                                }
                                if (isPdf) {
                                  return <a className="text-brand-600 underline" href={url} target="_blank" rel="noreferrer">View PDF</a>;
                                }
                                return <a className="text-brand-600 underline" href={url} target="_blank" rel="noreferrer">Download attachment</a>;
                              })()}
                            </>
                          ) : (
                            <span className="text-body font-body text-default-font">{m.text}</span>
                          )}
                          <span className="text-caption font-caption text-subtext-color self-end">{formatTime(m.created_at!)}</span>
                        </div>
                        {m.sender === "staff" ? (
                          <Avatar size="small">DR</Avatar>
                        ) : null}
                      </div>
                    </React.Fragment>
                  );
                })
              })()}
              <div ref={messagesEndRef} />
            </div>
            <div className="flex w-full flex-col items-start gap-4 border-t border-solid border-neutral-border px-6 py-4">
              <div className="flex w-full items-center gap-2">
                <Button
                  variant="neutral-tertiary"
                  size="small"
                  onClick={() => {
                    setRxName("");
                    setRxInstructions("");
                    setRxStatus("Ready");
                    setShowRxModal(true);
                  }}
                >
                  Medications
                </Button>
                
                {/* Removed Records button; attachment upload moved to + icon in composer */}
              </div>
              <div className="flex w-full items-center gap-3">
                 <TextField
                  className="h-auto grow shrink-0 basis-0"
                  variant="filled"
                  label=""
                  helpText=""
                >
                  <TextField.Input
                    placeholder="Type your message..."
                    value={draft}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)}
                    onKeyDown={async (e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === "Enter" && draft.trim()) {
                        if (!selected && !broadcastIds) return;
                        const textToSend = draft.trim();
                        if (broadcastIds) {
                          // Send individually to each recipient's 1:1 thread
                          const ids = [...broadcastIds];
                          let okCount = 0;
                          for (const cid of ids) {
                            try {
                              const ensured = await ensureConversationForContactId(cid);
                              await addMessage(ensured.id, 'staff', textToSend, 'text');
                              await sendOutboundViaTwilio(ensured.id, textToSend, []);
                              okCount += 1;
                            } catch {}
                          }
                          setToast({ title: `Sent to ${okCount} recipient${okCount === 1 ? '' : 's'}` });
                          setBroadcastIds(null);
                          setBroadcastLabels([]);
                        } else if (selected) {
                          // Normal 1:1 send
                          const optimistic = { id: `local-${Date.now()}`, conversation_id: selected.id, sender: 'staff' as const, text: textToSend, created_at: new Date().toISOString(), type: 'text' as const };
                          setMessages(prev => { const next = [...prev, optimistic]; cacheSet(selected.id, next); return next; });
                          setConversations(prev => {
                            const idx = prev.findIndex(c => c.id === selected.id);
                            if (idx < 0) return prev;
                          const updated: any = { ...prev[idx], last_message_text: textToSend, last_message_at: optimistic.created_at } as ConversationWithPatient;
                            const next = [...prev];
                            next.splice(idx, 1);
                          // Persist metadata
                          saveLastMeta(selected.id, textToSend, optimistic.created_at);
                          return [updated, ...next];
                          });
                          await addMessage(selected.id, "staff", textToSend, "text");
                          try {
                            const resp = await sendOutboundViaTwilio(selected.id, textToSend, []);
                            const phones = (resp as any)?.to || [];
                            if (!phones.length) {
                              const who = selected?.patient?.name || 'this conversation';
                              setToast({ title: 'No recipient phone', desc: `No deliverable phone on ${who}. Add a phone or rx-notify phone.` });
                            }
                            if (!(resp as any)?.results?.length && phones.length) {
                              setToast({ title: 'SMS not queued', desc: 'Twilio did not queue any messages for the provided phone(s).' });
                            }
                          } catch (err: any) {
                            setToast({ title: 'SMS send failed', desc: err?.message ?? 'Unknown error' });
                          }
                        }
                        setDraft("");
                        // Do not force refresh immediately; rely on realtime to avoid flicker
                      }
                    }}
                  />
                </TextField>
                <Button
                  variant="brand-tertiary"
                  onClick={async () => {
                    if (!draft.trim()) return;
                    const textToSend = draft.trim();
                    if (broadcastIds) {
                      const ids = [...broadcastIds];
                      let okCount = 0;
                      for (const cid of ids) {
                        try {
                          const ensured = await ensureConversationForContactId(cid);
                          await addMessage(ensured.id, 'staff', textToSend, 'text');
                          await sendOutboundViaTwilio(ensured.id, textToSend, []);
                          okCount += 1;
                        } catch {}
                      }
                      setToast({ title: `Sent to ${okCount} recipient${okCount === 1 ? '' : 's'}` });
                      setBroadcastIds(null);
                      setBroadcastLabels([]);
                    } else if (selected) {
                      const optimistic = { id: `local-${Date.now()}`, conversation_id: selected.id, sender: 'staff' as const, text: textToSend, created_at: new Date().toISOString(), type: 'text' as const };
                      setMessages(prev => { const next = [...prev, optimistic]; cacheSet(selected.id, next); return next; });
                      setConversations(prev => {
                        const idx = prev.findIndex(c => c.id === selected.id);
                        if (idx < 0) return prev;
                        const updated: any = { ...prev[idx], last_message_text: textToSend, last_message_at: optimistic.created_at } as ConversationWithPatient;
                        const next = [...prev];
                        next.splice(idx, 1);
                        // Persist metadata
                        saveLastMeta(selected.id, textToSend, optimistic.created_at);
                        return [updated, ...next];
                      });
                      await addMessage(selected.id, "staff", textToSend, "text");
                      try {
                        const resp = await sendOutboundViaTwilio(selected.id, textToSend, []);
                        const phones = (resp as any)?.to || [];
                        if (!phones.length) {
                          const who = selected?.patient?.name || 'this conversation';
                          setToast({ title: 'No recipient phone', desc: `No deliverable phone on ${who}. Add a phone or rx-notify phone.` });
                        }
                        if (!(resp as any)?.results?.length && phones.length) {
                          setToast({ title: 'SMS not queued', desc: 'Twilio did not queue any messages for the provided phone(s).' });
                        }
                      } catch (err: any) {
                        setToast({ title: 'SMS send failed', desc: err?.message ?? 'Unknown error' });
                      }
                    }
                    setDraft("");
                  }}
                >
                  Send
                </Button>
                <IconButton
                  variant="neutral-secondary"
                  onClick={async () => {
                    if (!selected) return;
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.accept = 'image/*,application/pdf,video/*';
                    fileInput.onchange = async () => {
                      const file = fileInput.files?.[0];
                      if (!file) return;
                      try {
                        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                        const path = `${selected.id}/${Date.now()}_${safeName}`;
                        const { data: uploadData, error: uploadError } = await supabase.storage
                          .from('message-attachments')
                          .upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' });
                        if (uploadError) throw uploadError;
                        const { data: urlData } = supabase.storage.from('message-attachments').getPublicUrl(uploadData?.path ?? path);
                        const url = urlData?.publicUrl ?? '';
                        // Optimistic append
                        const optimistic = { id: `local-${Date.now()}`, conversation_id: selected.id, sender: 'staff' as const, text: url, created_at: new Date().toISOString(), type: 'attachment' as const };
                        setMessages(prev => { const next = [...prev, optimistic]; cacheSet(selected.id, next); return next; });
                        await addMessage(selected.id, "staff", url, "attachment");
                        try {
                          const mmsAllowed = file.size <= 5 * 1024 * 1024; // conservative MMS limit
                          const resp = mmsAllowed
                            ? await sendOutboundViaTwilio(selected.id, undefined, [url])
                            : await sendOutboundViaTwilio(selected.id, url, undefined); // send link if too large
                          const phones = (resp as any)?.to || [];
                          if (!phones.length) {
                            const who = selected?.patient?.name || 'this conversation';
                            setToast({ title: 'No recipient phone', desc: `No deliverable phone on ${who}. Add a phone or rx-notify phone.` });
                          }
                          if (!(resp as any)?.results?.length && phones.length) {
                            setToast({ title: 'MMS not queued', desc: 'Twilio did not queue any messages for the provided phone(s).' });
                          }
                        } catch (err: any) {
                          setToast({ title: 'MMS send failed', desc: err?.message ?? 'Unknown error' });
                        }
                        // Do not refresh immediately to avoid clearing optimistic UI
                      } catch (e: any) {
                        console.error('Upload failed', e);
                        alert(`Upload failed: ${e?.message ?? 'Unknown error'}`);
                      }
                    };
                    fileInput.click();
                  }}
                />
                {/* Removed duplicate send button. Press Enter to send. */}
              </div>
            </div>
            {imageViewerUrl ? (
              <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80" onClick={() => setImageViewerUrl(null)}>
                <img src={imageViewerUrl} alt="preview" className="max-h-[90vh] max-w-[90vw] rounded-md shadow-2xl" />
              </div>
            ) : null}

            {showAttachments ? (
              <div className="fixed inset-0 z-[65]">
                <div className="absolute inset-0 bg-black/60" onClick={() => setShowAttachments(false)} />
                <div className="absolute left-1/2 top-1/2 w-[880px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-neutral-border bg-default-background p-6 shadow-xl">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-heading-3 font-heading-3">Conversation attachments</span>
                    <Button variant="neutral-tertiary" onClick={() => setShowAttachments(false)}>Close</Button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[70vh] overflow-auto">
                    {messages.filter(m => m.type === 'attachment').map(m => {
                      const url = m.text ?? '';
                      const isImage = /\.(png|jpe?g|gif|webp)$/i.test(url);
                      const isPdf = /\.pdf$/i.test(url);
                      return (
                        <div key={m.id} className="group rounded-md border border-neutral-border p-2 flex flex-col items-center gap-2 bg-neutral-50">
                          {isImage ? (
                            <img src={url} alt="attachment" className="h-32 w-full object-cover rounded cursor-zoom-in" onClick={() => setImageViewerUrl(url)} />
                          ) : isPdf ? (
                            <a className="text-brand-600 underline" href={url} target="_blank" rel="noreferrer">View PDF</a>
                          ) : (
                            <a className="text-brand-600 underline" href={url} target="_blank" rel="noreferrer">Download</a>
                          )}
                          <span className="text-caption font-caption text-subtext-color self-start">{new Date(m.created_at).toLocaleString()}</span>
                        </div>
                      );
                    })}
                    {messages.filter(m => m.type === 'attachment').length === 0 ? (
                      <span className="text-body text-subtext-color col-span-full">No attachments yet.</span>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {showRxModal ? (
              <div className="fixed inset-0 z-[75]">
                <div className="absolute inset-0 bg-black/60" onClick={() => setShowRxModal(false)} />
                <div className="absolute left-1/2 top-1/2 w-[560px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-neutral-border bg-default-background p-6 shadow-xl">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-heading-3 font-heading-3">Send prescription update</span>
                    <Button variant="neutral-tertiary" onClick={() => setShowRxModal(false)}>Close</Button>
                  </div>
                  <div className="flex flex-col gap-3">
                    <TextField className="h-auto w-full" variant="filled" label="Medication name" helpText="e.g., Metformin 500mg">
                      <TextField.Input value={rxName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRxName(e.target.value)} />
                    </TextField>
                    <TextField className="h-auto w-full" variant="filled" label="Instructions" helpText="e.g., Take twice daily with meals">
                      <TextField.Input value={rxInstructions} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRxInstructions(e.target.value)} />
                    </TextField>
                    <TextField className="h-auto w-full" variant="filled" label="Status" helpText="Ready, Refill Due, etc.">
                      <TextField.Input value={rxStatus} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRxStatus(e.target.value)} />
                    </TextField>
                  </div>
                  <div className="mt-5 flex justify-end gap-2">
                    <Button variant="neutral-tertiary" onClick={() => setShowRxModal(false)}>Cancel</Button>
                    <Button variant="brand-tertiary" onClick={async () => {
                      if (!selected || !rxName.trim()) return;
                      const name = rxName.trim();
                      const instr = rxInstructions.trim();
                      const status = rxStatus.trim() || 'Ready';
                      const payload = {
                        title: "Prescription Update",
                        headline: `Your ${name} prescription is ready for pickup!`,
                        medication: { name, instructions: instr },
                        status,
                      };
                      // Store rich JSON for in-app UI
                      await addMessage(selected.id, 'staff', JSON.stringify(payload), 'prescriptionUpdate');
                      // Send a readable SMS summary (no JSON) for recipients
                      const sms = [
                                   'Prescription Update',
                                   payload.headline,
                                   name ? `Medication: ${name}` : null,
                                   instr ? `Instructions: ${instr}` : null,
                                   `Status: ${status}`
                                  ]
                                  .filter(Boolean)
                                  .join('\n');
                      try {
                        const resp = await sendOutboundViaTwilio(selected.id, sms, undefined);
                        const phones = (resp as any)?.to || [];
                        if (!phones.length) {
                          const who = selected?.patient?.name || 'this conversation';
                          setToast({ title: 'No recipient phone', desc: `No deliverable phone on ${who}. Add a phone or rx-notify phone.` });
                        } else {
                          const ok = (resp as any).results?.every((r: any) => (r?.status || '').toLowerCase() !== 'failed');
                          if (!ok) setToast({ title: 'SMS delivery queued with warnings', desc: 'Some recipients may not receive the message.' });
                        }
                      } catch (e: any) {
                        setToast({ title: 'SMS send failed', desc: e?.message ?? 'Unknown error' });
                      }
                      setShowRxModal(false);
                    }}>Send</Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </DefaultPageLayout>
  );
}

export default Messages;
 
 
