// Generated via Supabase types API
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      // ... trimmed for brevity in editor; run generator to refresh
    }
    Views: { [_ in never]: never }
    Functions: {}
    Enums: {}
    CompositeTypes: { [_ in never]: never }
  }
}


