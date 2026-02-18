"use client";

import React, { useState } from "react";
import { DefaultPageLayout } from "@/ui/layouts/DefaultPageLayout";
import { IconWrapper, FeatherHeart } from "@subframe/core";
// Replacing ToggleGroup with custom cards for clearer selection
import { TextField } from "@/ui/components/TextField";
import { Button } from "@/ui/components/Button";
import { signInWithLocation } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import PillLoginLogo from "@/assets/pill-login-logo.png";

type LocationValue = "Mount Vernon" | "New Rochelle" | "Admin";

function Login() {
  const navigate = useNavigate();
  const [location, setLocation] = useState<LocationValue | "">("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const doSignIn = async () => {
    setError("");
    if (!location) { setError("Please select a location"); return; }
    if (!username || !password) { setError("Enter username and password"); return; }
    try {
      setLoading(true);
      await signInWithLocation({ location: location as LocationValue, username, password });
      navigate("/messages");
    } catch (e: any) {
      setError(e?.message ?? "Login failed");
    } finally { setLoading(false); }
  };

  return (
    <DefaultPageLayout>
      <div
        className="relative flex h-full w-full items-center justify-center overflow-hidden px-6 py-16 mobile:px-4 mobile:py-8"
        style={{
          background: "linear-gradient(160deg, #fdf2f8 0%, #fce7f3 20%, #fff1f2 40%, #fef2f2 60%, #fce7f3 80%, #fdf2f8 100%)",
        }}
      >
        {/* Ethereal gradient blobs — large, soft, layered */}
        <div
          className="pointer-events-none absolute -top-48 -left-48 h-[700px] w-[700px] rounded-full opacity-40 blur-[120px]"
          style={{ background: "radial-gradient(circle, rgba(244,63,94,0.15) 0%, rgba(253,164,175,0.08) 50%, transparent 80%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-56 -right-56 h-[800px] w-[800px] rounded-full opacity-35 blur-[140px]"
          style={{ background: "radial-gradient(circle, rgba(251,113,133,0.18) 0%, rgba(254,205,211,0.1) 50%, transparent 80%)" }}
        />
        <div
          className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 h-[500px] w-[500px] rounded-full opacity-25 blur-[100px]"
          style={{ background: "radial-gradient(circle, rgba(253,164,175,0.2) 0%, transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute bottom-1/4 left-1/6 h-[400px] w-[400px] rounded-full opacity-20 blur-[100px]"
          style={{ background: "radial-gradient(circle, rgba(255,228,230,0.35) 0%, transparent 70%)" }}
        />

        <div className="relative z-10 flex w-full max-w-[480px] flex-col items-center gap-10">
          {/* Logo + heading */}
          <div className="flex flex-col items-center gap-5">
            <img
              src={PillLoginLogo}
              alt="Narayan Pharmacy"
              className="h-20 w-20 drop-shadow-md"
              draggable={false}
            />
            <span className="text-[38px] font-bold leading-none tracking-tight text-default-font mobile:text-[28px]">
              Narayan Pharmacy
            </span>
          </div>

          {/* Location picker */}
          <div className="flex w-full flex-col items-center gap-4">
            <span className="text-body-bold font-body-bold text-subtext-color uppercase tracking-wider text-[11px]">
              Select your location
            </span>
            <div className="grid grid-cols-3 gap-3 w-full mobile:grid-cols-1">
              {(["Mount Vernon","New Rochelle","Admin"] as LocationValue[]).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setLocation(opt)}
                  className={[
                    "group flex flex-col items-center gap-2.5 rounded-2xl border px-4 py-5 text-center transition-all duration-200",
                    location === opt
                      ? "border-brand-400 bg-white/90 shadow-md backdrop-blur-md ring-1 ring-brand-200"
                      : "border-white/50 bg-white/50 backdrop-blur-sm hover:bg-white/70 hover:shadow-sm hover:border-white/70",
                  ].join(" ")}
                >
                  <div className={[
                    "h-11 w-11 rounded-xl flex items-center justify-center text-sm font-semibold transition-colors duration-200",
                    location === opt
                      ? "bg-brand-100 text-brand-700"
                      : "bg-neutral-100/80 text-neutral-500 group-hover:bg-neutral-100 group-hover:text-neutral-700",
                  ].join(" ")}>
                    {opt === 'Admin' ? 'A' : (opt.startsWith('Mount') ? 'MV' : 'NR')}
                  </div>
                  <span className={[
                    "text-[13px] font-medium transition-colors duration-200",
                    location === opt ? "text-default-font" : "text-subtext-color group-hover:text-default-font",
                  ].join(" ")}>
                    {opt === 'Admin' ? 'Admin' : opt}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Credentials card */}
          <div className="flex w-full flex-col items-start gap-5 rounded-2xl border border-white/50 bg-white/70 backdrop-blur-md px-7 py-7 shadow-lg">
            <div className="flex w-full flex-col items-start gap-4">
              <TextField className="h-auto w-full flex-none" label="Username" helpText="">
                <TextField.Input
                  placeholder="Enter your username"
                  value={username}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => setUsername(event.target.value)}
                />
              </TextField>
              <TextField className="h-auto w-full flex-none" label="Password" helpText="">
                <TextField.Input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)}
                  onKeyDown={async (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') await doSignIn(); }}
                />
              </TextField>
            </div>
            <Button className="h-11 w-full flex-none rounded-xl" size="large" onClick={doSignIn} loading={loading}>
              Sign in
            </Button>
            {error ? <span className="text-error-600 text-caption text-center w-full">{error}</span> : null}
          </div>
        </div>
      </div>
    </DefaultPageLayout>
  );
}

export default Login;


