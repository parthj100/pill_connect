"use client";

import React, { useEffect, useMemo, useState } from "react";
import { DefaultPageLayout } from "@/ui/layouts/DefaultPageLayout";
import PharmacySidebar from "@/components/PharmacySidebar";
import { Avatar } from "@/ui/components/Avatar";
import { LoadingSpinner } from "@/ui/components/LoadingSpinner";
import { ConversationWithParticipants } from "@/lib/messagesApi";
import { useUnreadTotal } from "@/lib/unreadStore";
import { supabase } from "@/lib/supabaseClient";

// Import new components
import { QuickActions } from "@/components/dashboard/QuickActions";
import { MetricsCards, DashboardMetrics } from "@/components/dashboard/MetricsCards";
import { RecentConversations } from "@/components/dashboard/RecentConversations";
import { UnreadConversations } from "@/components/dashboard/UnreadConversations";
import { DashboardErrorBoundary } from "@/components/ErrorBoundary";
import { dashboardApi, DashboardApiError } from "@/lib/dashboardApi";

function HomeOverviewDashboard() {
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalPatients: 0,
    newPatientsToday: 0,
    newPatientsWeek: 0,
    messagesTodayTotal: 0,
    messagesTodayInbound: 0,
    messagesTodayOutbound: 0,
  });
  const [conversations, setConversations] = useState<ConversationWithParticipants[]>([]);
  const unreadCount = useUnreadTotal();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Memoized derived data
  const recentConversations = useMemo(() => {
    return [...conversations]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }, [conversations]);

  const unreadConversations = useMemo(() => {
    const unread = conversations.filter(c => (c.unread_count ?? 0) > 0);
    console.log('🏠 Dashboard: Computing unread conversations:', unread.length, 'found from', conversations.length, 'total');
    if (unread.length > 0) {
      console.log('🏠 Dashboard: Unread conversations:', unread.map(c => ({ 
        id: c.id?.slice(0, 8), 
        name: c.patient?.name || c.participants?.[0]?.name, 
        unread: c.unread_count 
      })));
    }
    return unread
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }, [conversations]);

  // Load all dashboard data using the optimized API
  useEffect(() => {
    let isMounted = true;

    const loadDashboardData = async () => {
      try {
        setError(null);
        setIsLoading(true);

        const dashboardData = await dashboardApi.fetchAllDashboardData();
        
        if (!isMounted) return;

        setMetrics(dashboardData.metrics);
        setConversations(dashboardData.conversations);
        setIsAdmin(dashboardData.userInfo.isAdmin);
        setSelectedLocation(dashboardData.userInfo.selectedLocation);
        
      } catch (err) {
        if (!isMounted) return;
        
        const errorMessage = err instanceof Error ? err.message : 'Failed to load dashboard data';
        console.error('Dashboard loading error:', err);
        setError(errorMessage);
        
        // Provide graceful degradation with empty data
        setMetrics({
          totalPatients: 0,
          newPatientsToday: 0,
          newPatientsWeek: 0,
          messagesTodayTotal: 0,
          messagesTodayInbound: 0,
          messagesTodayOutbound: 0,
        });
        setConversations([]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadDashboardData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Real-time subscription for conversation updates with proper cleanup
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const refreshConversations = async () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        try {
          console.log('🏠 Dashboard: Refreshing conversations...');
          const convs = await dashboardApi.fetchConversations();
          console.log('🏠 Dashboard: Got conversations:', convs.length, 'total,', convs.filter(c => (c.unread_count ?? 0) > 0).length, 'unread');
          setConversations(convs);
        } catch (err) {
          console.error('🏠 Dashboard: Error refreshing conversations:', err);
        }
      }, 100);
    };
    
    const channel = supabase
      .channel('dashboard_conversations_unread')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'conversations' 
      }, () => {
        refreshConversations();
      })
      .subscribe();
    
    return () => {
      clearTimeout(timeoutId);
      try { 
        supabase.removeChannel(channel); 
      } catch (err) {
        console.error('Error removing subscription:', err);
      }
    };
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <DefaultPageLayout>
        <div className="flex h-full w-full items-stretch">
          <PharmacySidebar className="flex-none" />
          <div className="flex w-full flex-col items-center justify-center">
            <LoadingSpinner />
            <p className="mt-4 text-subtext-color" role="status" aria-live="polite">
              Loading dashboard...
            </p>
          </div>
        </div>
      </DefaultPageLayout>
    );
  }

  // Error state
  if (error) {
    return (
      <DefaultPageLayout>
        <div className="flex h-full w-full items-stretch">
          <PharmacySidebar className="flex-none" />
          <div className="flex w-full flex-col items-center justify-center p-8">
            <div className="text-center">
              <h2 className="text-heading-2 font-heading-2 text-error-700 mb-2">
                Failed to Load Dashboard
              </h2>
              <p className="text-body text-error-600 mb-4 max-w-md">
                {error}
              </p>
              <button 
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-brand-600 text-white rounded-md hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      </DefaultPageLayout>
    );
  }

  return (
    <DefaultPageLayout>
      <div className="flex h-full w-full items-stretch">
        <PharmacySidebar className="flex-none" />
        <main className="flex w-full flex-col items-start" role="main">
          <div className="container max-w-none flex w-full grow shrink-0 basis-0 flex-col items-start gap-6 bg-default-background py-12 overflow-auto">
            
            {/* Dashboard Header */}
            <header className="flex w-full items-center gap-4">
              <Avatar size="large" aria-hidden="true">
                {(isAdmin ? 'Admin' : (selectedLocation || 'PC')).split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase()}
              </Avatar>
              <div className="flex flex-col items-start gap-1">
                <h1 className="text-heading-1 font-heading-1 text-default-font">Dashboard</h1>
                <p className="text-body font-body text-subtext-color">
                  {isAdmin ? 'Admin — All Locations' : selectedLocation ? selectedLocation : ''}
                </p>
              </div>
            </header>

            {/* Quick Actions */}
            <DashboardErrorBoundary>
              <QuickActions />
            </DashboardErrorBoundary>

            {/* Recent Conversations */}
            <DashboardErrorBoundary>
              <RecentConversations 
                conversations={recentConversations}
                isLoading={false}
              />
            </DashboardErrorBoundary>

            {/* Unread Conversations */}
            <DashboardErrorBoundary>
              <UnreadConversations 
                conversations={unreadConversations}
                unreadCount={unreadCount}
                isLoading={false}
              />
            </DashboardErrorBoundary>

            {/* Metrics Cards */}
            <DashboardErrorBoundary>
              <MetricsCards 
                metrics={metrics}
                isLoading={false}
              />
            </DashboardErrorBoundary>

          </div>
        </main>
      </div>
    </DefaultPageLayout>
  );
}

export default HomeOverviewDashboard;