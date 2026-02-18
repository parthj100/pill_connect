"use client";

import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { SidebarWithSections } from "@/ui/components/SidebarWithSections";
import { Avatar } from "@/ui/components/Avatar";
import { Button } from "@/ui/components/Button";
import { NotificationBell } from "@/components/NotificationBell";
import { signOut, getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";
import { useUnreadTotal } from "@/lib/unreadStore";
import { useEffect, useState } from "react";
import { IconWrapper, FeatherHome, FeatherMessageSquare, FeatherUsers, FeatherFileText, FeatherCalendar, FeatherSettings } from "@subframe/core";
import { IconWrapper as IW2 } from "@subframe/core";

export type SidebarItemKey =
  | "dashboard"
  | "messages"
  | "broadcasts"
  | "contacts"
  | "prescriptions"
  | "calendar"
  | "user-groups";

interface PharmacySidebarProps extends React.HTMLAttributes<HTMLElement> {
  active?: SidebarItemKey;
  onNavigate?: (key: SidebarItemKey) => void;
}

export default function PharmacySidebar({ active, onNavigate, className, ...rest }: PharmacySidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const unreadTotal = useUnreadTotal();
  const [activeLocation, setActiveLocation] = useState<string>(() => {
    try { return localStorage.getItem('pc_active_location') || ""; } catch { return ""; }
  });
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    try {
      const cached = localStorage.getItem('pc_is_admin');
      return cached === 'true';
    } catch {
      return false;
    }
  });
  
  // Load all user data simultaneously on mount
  useEffect(() => {
    (async () => {
      try {
        const user = await getCurrentUser();
        if (!user) return;
        
        setEmail(user.email ?? "");
        
        const { data: user_data } = await supabase.auth.getUser();
        const uid = user_data?.user?.id;
        if (!uid) return;
        
        // Fetch profile data and active location in parallel
        const [profileResult, locationResult] = await Promise.allSettled([
          supabase
            .from('profiles')
            .select('display_name, role, pharmacy_location')
            .eq('id', uid)
            .maybeSingle(),
          supabase
            .from('user_active_locations')
            .select('selected_location')
            .eq('user_id', uid)
            .maybeSingle()
        ]);
        
        // Handle profile data
        if (profileResult.status === 'fulfilled' && profileResult.value.data) {
          const profile = profileResult.value.data as any;
          setDisplayName(profile.display_name || '');
          const role = profile.role;
          const location = profile.pharmacy_location;
          const adminStatus = role === 'admin' || location === 'Admin';
          setIsAdmin(adminStatus);
          try { localStorage.setItem('pc_is_admin', String(adminStatus)); } catch (error) {
            console.warn('Failed to save admin status to localStorage:', error);
          }
        }
        
        // Handle active location
        if (locationResult.status === 'fulfilled' && locationResult.value.data) {
          const sel = (locationResult.value.data as any)?.selected_location as string || '';
          setActiveLocation(sel);
          try { if (sel) localStorage.setItem('pc_active_location', sel); } catch (error) {
            console.warn('Failed to save active location to localStorage:', error);
          }
        }
      } catch (error) {
        console.error('Failed to load user data for sidebar:', error);
      }
    })();
  }, []);
  // Keep location in sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'pc_active_location' && typeof e.newValue === 'string') {
        setActiveLocation(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  // Unread totals are fed by the global store; no local Supabase wiring here

  const inferredActive: SidebarItemKey = active ??
    (location.pathname.startsWith("/messages") ? "messages" :
    location.pathname.startsWith("/broadcasts") ? "broadcasts" :
    location.pathname.startsWith("/contacts") ? "contacts" :
    location.pathname.startsWith("/prescriptions") ? "prescriptions" :
    location.pathname.startsWith("/calendar") ? "calendar" :
    location.pathname.startsWith("/user-groups") ? "user-groups" :
    "dashboard");

  const nav = (key: SidebarItemKey) => (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    onNavigate?.(key);
    const path =
      key === "dashboard" ? "/" :
      key === "messages" ? "/messages" :
      key === "broadcasts" ? "/broadcasts" :
      key === "contacts" ? "/contacts" :
      key === "prescriptions" ? "/prescriptions" :
      key === "calendar" ? "/calendar" :
      key === "user-groups" ? "/user-groups" :
      "/";
    navigate(path);
  };

  return (
    <SidebarWithSections
      className={className}
      header={
        <div className="flex flex-col items-start gap-1">
          <div className="flex items-center gap-3">
            <IconWrapper className="text-brand-600">
              <FeatherMessageSquare />
            </IconWrapper>
            <span className="text-heading-3 font-heading-3 text-default-font">Narayan Pharmacy</span>
          </div>
          {activeLocation ? (
            <span className="rounded-full bg-brand-50 text-brand-700 border border-brand-200 px-2 py-0.5 text-caption font-caption">
              {activeLocation}
            </span>
          ) : null}
        </div>
      }
      footer={<div className="flex items-center justify-between gap-2 w-full pr-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar size="small">{(displayName || 'NP').split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase()}</Avatar>
          <span className="text-caption text-subtext-color max-w-[100px] truncate">{displayName || ''}</span>
        </div>
        
        <div className="flex items-center gap-1">
          <NotificationBell className="mr-1" />
          <Button
            variant="neutral-tertiary"
            size="small"
            onClick={async ()=>{
              try { await signOut(); } catch (error) {
                console.warn('Failed to sign out:', error);
              }
              try {
                // Preserve last selected conversation across account switches
                const lastConv = localStorage.getItem('pc_last_selected_conversation');
                // Remove only app-scoped session caches
                localStorage.removeItem('pc_active_location');
                localStorage.removeItem('pc_unread_total');
                localStorage.removeItem('pc_is_admin');
                // Restore last conversation key
                if (lastConv) localStorage.setItem('pc_last_selected_conversation', lastConv);
              } catch (error) {
                console.warn('Failed to clear localStorage on sign out:', error);
              }
              navigate('/login');
            }}
          >
            Sign out
          </Button>
        </div>
      </div>}
      {...rest}
    >
      <SidebarWithSections.NavSection>
        <SidebarWithSections.NavItem selected={inferredActive === "dashboard"} icon={<FeatherHome />} onClick={nav("dashboard")}>
          Dashboard
        </SidebarWithSections.NavItem>
        <SidebarWithSections.NavItem selected={inferredActive === "messages"} icon={<FeatherMessageSquare />} onClick={nav("messages")}>
          <div className="flex items-center gap-2">
            <span>Messages</span>
            {unreadTotal > 0 ? (
              <span className="min-w-[18px] rounded-full bg-error-600 px-1.5 text-caption font-caption text-white text-center">{unreadTotal}</span>
            ) : null}
          </div>
        </SidebarWithSections.NavItem>
        <SidebarWithSections.NavItem selected={inferredActive === "broadcasts"} icon={<FeatherMessageSquare />} onClick={nav("broadcasts")}>
          Broadcasts
        </SidebarWithSections.NavItem>
        <SidebarWithSections.NavItem selected={inferredActive === "contacts"} icon={<FeatherUsers />} onClick={nav("contacts")}>
          Contacts
        </SidebarWithSections.NavItem>
        <SidebarWithSections.NavItem selected={inferredActive === "prescriptions"} icon={<FeatherFileText />} onClick={nav("prescriptions")}>
          Prescriptions
        </SidebarWithSections.NavItem>
        <SidebarWithSections.NavItem selected={inferredActive === "calendar"} icon={<FeatherCalendar />} onClick={nav("calendar")}>
          Calendar
        </SidebarWithSections.NavItem>
        {isAdmin && (
          <SidebarWithSections.NavItem selected={inferredActive === "user-groups"} icon={<FeatherSettings />} onClick={nav("user-groups")}>
            User Groups
          </SidebarWithSections.NavItem>
        )}
      </SidebarWithSections.NavSection>
    </SidebarWithSections>
  );
}


