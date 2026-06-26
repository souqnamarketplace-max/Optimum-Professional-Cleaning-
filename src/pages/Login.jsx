import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { supabase } from "../api/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [branding, setBranding] = useState(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  // Reads from the public_branding VIEW, not site_settings directly —
  // the login page runs before anyone is authenticated, and site_settings
  // itself (which also holds email, address, bank/e-transfer details) is
  // locked to authenticated users only. The view exposes just the two
  // fields a login screen actually needs: company name and logo.
  useEffect(() => {
    supabase
      .from("public_branding")
      .select("company_name, logo_url")
      .maybeSingle()
      .then(({ data }) => {
        if (data) setBranding(data);
      });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Login failed. Check your email and password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "#0a0e1a" }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-8"
        style={{
          background: "#131d35",
          border: "1px solid rgba(45,206,137,0.15)",
        }}
      >
        {branding?.logo_url && (
          <div className="flex justify-center mb-5">
            <img
              src={branding.logo_url}
              alt={branding.company_name || "Company logo"}
              className="h-16 w-auto rounded-lg"
              style={{ background: "#fff", padding: 6 }}
            />
          </div>
        )}

        <h1 className="text-2xl font-bold text-white mb-1 text-center">
          Sign in
        </h1>
        <p className="text-slate-400 text-sm text-center mb-8">
          {branding?.company_name
            ? `Access the ${branding.company_name} billing dashboard`
            : "Access your billing dashboard"}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg px-4 py-3 text-white outline-none"
              style={{
                background: "#0f1729",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg px-4 py-3 pr-12 text-white outline-none"
                style={{
                  background: "#0f1729",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <path d="M1 1l22 22" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm" style={{ color: "#f5365c" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg py-3 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #2dce89, #11cdef)",
            }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
