import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

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
        <h1 className="text-2xl font-bold text-white mb-1 text-center">
          Sign in
        </h1>
        <p className="text-slate-400 text-sm text-center mb-8">
          Access your billing dashboard
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Email</label>
            <input
              type="email"
              required
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
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg px-4 py-3 text-white outline-none"
              style={{
                background: "#0f1729",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
              placeholder="••••••••"
            />
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
