"use client";
import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { DefaultPageLayout } from "@/ui/layouts/DefaultPageLayout";
import { TextField } from "@/ui/components/TextField";
import { Button } from "@/ui/components/Button";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function signIn() {
    setError("");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    if (error) setError(error.message); else setMessage("Check your email for the magic link");
  }
  return (
    <DefaultPageLayout>
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex flex-col gap-4 w-96 p-6 rounded-md border border-neutral-border bg-default-background">
          <span className="text-heading-3 font-heading-3">Sign in</span>
          <TextField variant="filled" label="Email" helpText=""><TextField.Input value={email} onChange={(e:any)=>setEmail(e.target.value)} /></TextField>
          <Button onClick={signIn}>Send magic link</Button>
          {error ? <span className="text-error-600 text-caption">{error}</span> : null}
          {message ? <span className="text-success-600 text-caption">{message}</span> : null}
        </div>
      </div>
    </DefaultPageLayout>
  );
}







