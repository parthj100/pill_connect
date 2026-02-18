"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// 🔧 ULTRA-SIMPLE UNREAD STORE - COMPLETE REWRITE
// Core principle: Database is ONLY source of truth, frontend only displays

// Debug mode - set to false to silence console output and polling
const DEBUG_MODE = false;

// Global state
let globalTotal = 0;
let componentListeners = new Set<(total: number) => void>();
let storeInitialized = false;
let realtimeChannel: any = null;

// 🐛 Debug logging
function debug(message: string, data?: any) {
  if (DEBUG_MODE) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`🔵 [${timestamp}] UnreadStore: ${message}`, data || '');
  }
}

// 📊 Fetch total unread count from database
async function fetchUnreadTotal(): Promise<number> {
  try {
    debug("Fetching unread total from database...");
    
    const { data, error } = await supabase
      .from("conversations")
      .select("id, unread_count");
    
    if (error) {
      debug("❌ Database error", error);
      return 0;
    }
    
    if (!data || !Array.isArray(data)) {
      debug("❌ Invalid data format", data);
      return 0;
    }
    
    // Calculate total
    const rows = (data as Array<{ id?: string; unread_count?: number | null }>);
    const total = rows.reduce((sum, row) => {
      const count = Number(row.unread_count ?? 0) || 0;
      return sum + count;
    }, 0);
    
    debug(`✅ Calculated total: ${total} from ${data.length} conversations`);
    
    // Debug: Show unread conversations
    if (DEBUG_MODE) {
      const unreadConvs = rows.filter(row => (Number(row.unread_count) || 0) > 0);
      if (unreadConvs.length > 0) {
        debug(`📋 Unread conversations (${unreadConvs.length}):`, 
          unreadConvs.map(c => ({ id: c.id?.slice(0, 8), unread: c.unread_count }))
        );
      }
    }
    
    return total;
    
  } catch (err) {
    debug("❌ Fetch error", err);
    return 0;
  }
}

// 🔄 Update global total and notify components
async function updateGlobalTotal() {
  const newTotal = await fetchUnreadTotal();
  
  debug(`🔍 Checking total: current=${globalTotal}, fetched=${newTotal}, listeners=${componentListeners.size}`);
  
  if (newTotal !== globalTotal) {
    debug(`🔄 Total changed: ${globalTotal} → ${newTotal}`);
    globalTotal = newTotal;
    
    // Notify all listening components
    componentListeners.forEach(listener => {
      try {
        debug(`📢 Notifying component with new total: ${newTotal}`);
        listener(newTotal);
      } catch (err) {
        debug("❌ Component notification error", err);
      }
    });
  } else {
    debug(`➡️ Total unchanged: ${globalTotal}`);
  }
}

// 🚀 Initialize the store (only once)
function initializeStore() {
  if (storeInitialized) {
    debug("⚠️ Store already initialized");
    return;
  }
  
  debug("🚀 Initializing unread store...");
  storeInitialized = true;
  
  // Initial fetch
  updateGlobalTotal();
  
  // Re-enable unread store Realtime (Messages.tsx subscription is disabled)
  debug("🔄 UNREAD STORE REALTIME RE-ENABLED");
  
  // Listen to both conversations and messages table for comprehensive coverage
  realtimeChannel = supabase
    .channel("clean_unread_channel")
    .on("postgres_changes", { 
      event: "*", 
      schema: "public", 
      table: "conversations" 
    }, (payload) => {
      const p: any = payload as any;
      const newRow = (p?.new || {}) as { id?: string; unread_count?: number | null };
      const oldRow = (p?.old || {}) as { id?: string; unread_count?: number | null };
      debug(`📡 UnreadStore: CONVERSATIONS change detected: ${p?.eventType}`, {
        table: p?.table,
        id: (newRow.id || oldRow.id || '').slice(0, 8),
        unread_count: newRow.unread_count ?? oldRow.unread_count
      });
      
      // Update total when database changes
      updateGlobalTotal();
    })
    .on("postgres_changes", { 
      event: "INSERT", 
      schema: "public", 
      table: "messages" 
    }, (payload) => {
      const p: any = payload as any;
      const newMsg = (p?.new || {}) as { conversation_id?: string; sender?: string };
      debug(`📡 UnreadStore: NEW MESSAGE detected`, {
        conversation_id: (newMsg.conversation_id || '').slice(0, 8),
        sender: newMsg.sender
      });
      
      // When a new message arrives, refresh unread count
      // This ensures we catch unread_count updates that might not trigger the conversations subscription
      setTimeout(() => updateGlobalTotal(), 100); // Small delay to let DB transaction complete
    })
    .subscribe((status) => {
      debug(`🔌 UnreadStore: Realtime subscription status: ${status}`);
    });
  
  debug("✅ Store initialized successfully");
  
  // Force refresh every 5 seconds for debugging
  if (DEBUG_MODE) {
    setInterval(() => {
      debug("🔄 Debug: Force refresh every 5s");
      updateGlobalTotal();
    }, 5000);
  }
  
  // Make debug functions globally available for testing
  if (DEBUG_MODE && typeof window !== 'undefined') {
    (window as any).debugUnreadStore = debugUnreadStore;
    (window as any).forceRefreshUnread = forceRefreshUnread;
    (window as any).resetUnreadStore = resetUnreadStore;
  }
}

// 🎣 React hook for components
export function useUnreadTotal(): number {
  const [displayTotal, setDisplayTotal] = useState(globalTotal);
  
  useEffect(() => {
    debug("🔗 Component connecting to unread store", { currentGlobalTotal: globalTotal });
    
    // Initialize store if needed
    initializeStore();
    
    // Create listener for this component
    const componentListener = (newTotal: number) => {
      debug(`🔔 Updating component display: ${displayTotal} → ${newTotal}`);
      setDisplayTotal(newTotal);
    };
    
    // Register listener and sync current value
    componentListeners.add(componentListener);
    setDisplayTotal(globalTotal);
    debug(`🎯 Component synced to global total: ${globalTotal}`);
    
    // Cleanup when component unmounts
    return () => {
      debug("🔌 Component disconnecting from unread store");
      componentListeners.delete(componentListener);
    };
  }, []);
  
  debug(`🎨 Component rendering with displayTotal: ${displayTotal}`);
  return displayTotal;
}

// 🔧 Debug utilities (for testing)
export function debugUnreadStore() {
  debug("📊 Store Status:", {
    globalTotal,
    componentCount: componentListeners.size,
    initialized: storeInitialized,
    hasChannel: !!realtimeChannel
  });
  
  // Manual refresh for testing
  updateGlobalTotal();
}

// Force refresh unread count (for debugging)
export function forceRefreshUnread() {
  debug("🔄 Force refresh requested...");
  updateGlobalTotal();
}

export function resetUnreadStore() {
  debug("🔄 Resetting store...");
  
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  
  componentListeners.clear();
  globalTotal = 0;
  storeInitialized = false;
  
  debug("✅ Store reset complete");
}