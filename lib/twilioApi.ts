import { supabase } from "@/lib/supabaseClient";

export async function sendSmsMms(params: { to: string[]; body?: string; mediaUrls?: string[]; conversationId?: string; fromNumber?: string }) {
  const { data, error } = await supabase.functions.invoke("twilio-outbound", { body: params });
  if (error) throw error;
  return data as { results: Array<{ sid: string; status: string; to: string }> };
}


