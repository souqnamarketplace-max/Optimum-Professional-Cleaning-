import React, { useState } from "react";
import { useAuth } from "../lib/AuthContext";
import SettingsTab from "../components/admin/SettingsTab";
import BillingTab from "../components/admin/BillingTab";

export default function Dashboard() {
  const [tab, setTab] = useState("billing");
  const { logout, user } = useAuth();

  const tabs = [
    { key: "billing", label: "Billing" },
    { key: "settings", label: "Settings" },
  ];

  return (
    <div className="min-h-screen" style={{ background: "#0a0e1a" }}>
      <header
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <h1 className="text-lg font-bold text-white">Billing Dashboard</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">{user?.email}</span>
          <button
            onClick={logout}
            className="text-sm px-3 py-1.5 rounded-lg text-slate-300"
            style={{ background: "#131d35" }}
          >
            Log out
          </button>
        </div>
      </header>

      <div className="flex">
        <nav className="w-48 p-4 space-y-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium"
              style={{
                background: tab === t.key ? "rgba(45,206,137,0.12)" : "transparent",
                color: tab === t.key ? "#2dce89" : "#94a3b8",
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <main className="flex-1 p-6">
          {tab === "billing" && <BillingTab />}
          {tab === "settings" && <SettingsTab />}
        </main>
      </div>
    </div>
  );
}
