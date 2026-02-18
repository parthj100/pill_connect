import { supabase } from "@/lib/supabaseClient";
import { ConversationWithParticipants, listConversationsWithParticipants } from "@/lib/messagesApi";

export interface DashboardData {
  metrics: {
    totalPatients: number;
    newPatientsToday: number;
    newPatientsWeek: number;
    messagesTodayTotal: number;
    messagesTodayInbound: number;
    messagesTodayOutbound: number;
  };
  conversations: ConversationWithParticipants[];
  userInfo: {
    isAdmin: boolean;
    selectedLocation: string | null;
  };
}

export interface DashboardApiError {
  message: string;
  code?: string;
  details?: any;
}

export class DashboardApiService {
  private static instance: DashboardApiService;
  private cache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map();

  static getInstance(): DashboardApiService {
    if (!DashboardApiService.instance) {
      DashboardApiService.instance = new DashboardApiService();
    }
    return DashboardApiService.instance;
  }

  private getCacheKey(key: string, params?: any): string {
    return params ? `${key}_${JSON.stringify(params)}` : key;
  }

  private getFromCache<T>(key: string, params?: any): T | null {
    const cacheKey = this.getCacheKey(key, params);
    const cached = this.cache.get(cacheKey);
    
    if (!cached) return null;
    
    const now = Date.now();
    if (now - cached.timestamp > cached.ttl) {
      this.cache.delete(cacheKey);
      return null;
    }
    
    return cached.data as T;
  }

  private setCache<T>(key: string, data: T, ttlMs: number = 30000, params?: any): void {
    const cacheKey = this.getCacheKey(key, params);
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
  }

  private createDateRanges() {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    return {
      startOfDayIso: startOfDay.toISOString(),
      sevenDaysAgoIso: sevenDaysAgo.toISOString(),
    };
  }

  async fetchUserInfo(): Promise<DashboardData['userInfo']> {
    try {
      const cached = this.getFromCache<DashboardData['userInfo']>('userInfo');
      if (cached) return cached;

      const { data: user } = await supabase.auth.getUser();
      const uid = user?.user?.id;
      
      if (!uid) {
        throw new Error('User not authenticated');
      }

      const [profileResult, locationResult] = await Promise.allSettled([
        supabase
          .from('profiles')
          .select('role')
          .eq('id', uid)
          .maybeSingle(),
        supabase
          .from('user_active_locations')
          .select('selected_location')
          .eq('user_id', uid)
          .maybeSingle(),
      ]);

      let isAdmin = false;
      let selectedLocation: string | null = null;

      if (profileResult.status === 'fulfilled' && profileResult.value.data) {
        const profile = profileResult.value.data as any;
        isAdmin = profile.role === 'admin';
      }

      if (locationResult.status === 'fulfilled' && locationResult.value.data) {
        selectedLocation = (locationResult.value.data as any)?.selected_location || null;
      }

      const userInfo = { isAdmin, selectedLocation };
      this.setCache('userInfo', userInfo, 60000); // Cache for 1 minute
      return userInfo;

    } catch (error) {
      const dashboardError: DashboardApiError = {
        message: error instanceof Error ? error.message : 'Failed to fetch user info',
        code: 'USER_INFO_FETCH_ERROR',
        details: error,
      };
      throw dashboardError;
    }
  }

  async fetchDashboardMetrics(): Promise<DashboardData['metrics']> {
    try {
      const cached = this.getFromCache<DashboardData['metrics']>('metrics');
      if (cached) return cached;

      const { startOfDayIso, sevenDaysAgoIso } = this.createDateRanges();

      // Optimized: Run all queries in parallel
      const [
        totalPatientsResult,
        newPatientsTodayResult,
        newPatientsWeekResult,
        messagesTotalResult,
        messagesInboundResult,
        messagesOutboundResult,
      ] = await Promise.allSettled([
        supabase.from('contacts').select('id', { count: 'exact', head: true }),
        supabase.from('contacts').select('id', { count: 'exact', head: true }).gte('created_at', startOfDayIso),
        supabase.from('contacts').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgoIso),
        supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', startOfDayIso),
        supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', startOfDayIso).eq('sender', 'patient'),
        supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', startOfDayIso).in('sender', ['staff', 'system']),
      ]);

      const metrics = {
        totalPatients: totalPatientsResult.status === 'fulfilled' ? (totalPatientsResult.value.count ?? 0) : 0,
        newPatientsToday: newPatientsTodayResult.status === 'fulfilled' ? (newPatientsTodayResult.value.count ?? 0) : 0,
        newPatientsWeek: newPatientsWeekResult.status === 'fulfilled' ? (newPatientsWeekResult.value.count ?? 0) : 0,
        messagesTodayTotal: messagesTotalResult.status === 'fulfilled' ? (messagesTotalResult.value.count ?? 0) : 0,
        messagesTodayInbound: messagesInboundResult.status === 'fulfilled' ? (messagesInboundResult.value.count ?? 0) : 0,
        messagesTodayOutbound: messagesOutboundResult.status === 'fulfilled' ? (messagesOutboundResult.value.count ?? 0) : 0,
      };

      // Log any failed queries for debugging
      const failedQueries = [
        totalPatientsResult,
        newPatientsTodayResult,
        newPatientsWeekResult,
        messagesTotalResult,
        messagesInboundResult,
        messagesOutboundResult,
      ].filter(result => result.status === 'rejected');

      if (failedQueries.length > 0) {
        console.warn('Some dashboard metric queries failed:', failedQueries.map(r => r.status === 'rejected' ? r.reason : null));
      }

      this.setCache('metrics', metrics, 30000); // Cache for 30 seconds
      return metrics;

    } catch (error) {
      const dashboardError: DashboardApiError = {
        message: error instanceof Error ? error.message : 'Failed to fetch dashboard metrics',
        code: 'METRICS_FETCH_ERROR',
        details: error,
      };
      throw dashboardError;
    }
  }

  async fetchConversations(): Promise<ConversationWithParticipants[]> {
    try {
      const cached = this.getFromCache<ConversationWithParticipants[]>('conversations');
      if (cached) return cached;

      const conversations = await listConversationsWithParticipants();
      
      this.setCache('conversations', conversations, 15000); // Cache for 15 seconds
      return conversations;

    } catch (error) {
      const dashboardError: DashboardApiError = {
        message: error instanceof Error ? error.message : 'Failed to fetch conversations',
        code: 'CONVERSATIONS_FETCH_ERROR',
        details: error,
      };
      throw dashboardError;
    }
  }

  async fetchAllDashboardData(): Promise<DashboardData> {
    try {
      // Fetch all data in parallel for optimal performance
      const [metricsResult, conversationsResult, userInfoResult] = await Promise.allSettled([
        this.fetchDashboardMetrics(),
        this.fetchConversations(),
        this.fetchUserInfo(),
      ]);

      // Handle results, providing defaults for failed requests
      const metrics = metricsResult.status === 'fulfilled' 
        ? metricsResult.value 
        : {
            totalPatients: 0,
            newPatientsToday: 0,
            newPatientsWeek: 0,
            messagesTodayTotal: 0,
            messagesTodayInbound: 0,
            messagesTodayOutbound: 0,
          };

      const conversations = conversationsResult.status === 'fulfilled' 
        ? conversationsResult.value 
        : [];

      const userInfo = userInfoResult.status === 'fulfilled'
        ? userInfoResult.value
        : { isAdmin: false, selectedLocation: null };

      // Log any failures for debugging
      const failures = [metricsResult, conversationsResult, userInfoResult]
        .filter(result => result.status === 'rejected');

      if (failures.length > 0) {
        console.warn('Some dashboard data requests failed:', failures.map(r => r.status === 'rejected' ? r.reason : null));
      }

      return {
        metrics,
        conversations,
        userInfo,
      };

    } catch (error) {
      const dashboardError: DashboardApiError = {
        message: error instanceof Error ? error.message : 'Failed to fetch dashboard data',
        code: 'DASHBOARD_FETCH_ERROR',
        details: error,
      };
      throw dashboardError;
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  // Invalidate specific cache entries
  invalidateCache(keys: string[]): void {
    keys.forEach(key => {
      const keysToDelete = Array.from(this.cache.keys()).filter(cacheKey => cacheKey.startsWith(key));
      keysToDelete.forEach(cacheKey => this.cache.delete(cacheKey));
    });
  }
}

// Export singleton instance
export const dashboardApi = DashboardApiService.getInstance();