import { supabase } from "@/lib/supabaseClient";

export async function uploadToAttachmentsBucket(file: File, pathPrefix: string): Promise<{ path: string; url: string }> {
  const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${pathPrefix}/${Date.now()}_${sanitized}`;
  // Use existing 'message-attachments' bucket for consistency; the 'attachments' bucket may not be created.
  const bucket = 'message-attachments';
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { path, url: data.publicUrl };
}


