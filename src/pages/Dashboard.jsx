import React, { useState } from "react";
import { useAuth } from "../lib/AuthContext";
import SettingsTab from "../components/admin/SettingsTab";
import BillingTab from "../components/admin/BillingTab";
import ClientsTab from "../components/admin/ClientsTab";
import OverviewTab from "../components/admin/OverviewTab";

// Small inline icons so the bottom tab bar reads clearly on mobile even
// without text labels taking up much room. Kept tiny and dependency-free.
const ICONS = {
  overview: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  billing: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4h16v16H4z" />
      <path d="M8 9h8M8 13h8M8 17h4" />
    </svg>
  ),
  clients: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17.5" cy="9" r="2.4" />
      <path d="M15.5 14.2c2.3.4 4 2.5 4 5.3" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a7.97 7.97 0 0 0 0-2l2-1.5-2-3.4-2.3 1a8 8 0 0 0-1.7-1L15 3.5h-6L8.6 6.1a8 8 0 0 0-1.7 1l-2.3-1-2 3.4L4.6 11a7.97 7.97 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a8 8 0 0 0 1.7 1L9 20.5h6l.4-2.6a8 8 0 0 0 1.7-1l2.3 1 2-3.4z" />
    </svg>
  ),
};

export default function Dashboard() {
  const [tab, setTab] = useState("overview");
  const [billingClientFilter, setBillingClientFilter] = useState(null);
  const { logout, user } = useAuth();

  // Lets ClientsTab jump straight to Billing pre-filtered to one client,
  // instead of just showing a total with no way to see which documents
  // make it up.
  const goToClientBilling = (client) => {
    setBillingClientFilter(client);
    setTab("billing");
  };

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "billing", label: "Billing" },
    { key: "clients", label: "Clients" },
    { key: "settings", label: "Settings" },
  ];

  return (
    <div className="min-h-screen" style={{ background: "#0a0e1a" }}>
      <header
        className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <h1 className="text-base sm:text-lg font-bold text-white">Billing Dashboard</h1>
        <div className="flex items-center gap-2 sm:gap-4">
          <span className="hidden sm:inline text-sm text-slate-400">{user?.email}</span>
          <button
            onClick={logout}
            className="text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg text-slate-300 whitespace-nowrap"
            style={{ background: "#131d35" }}
          >
            Log out
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar — desktop/tablet only */}
        <nav className="hidden md:block w-48 p-4 space-y-1 shrink-0">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                if (t.key !== "billing") setBillingClientFilter(null);
                setTab(t.key);
              }}
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

        <main className="flex-1 p-4 sm:p-6 pb-24 md:pb-6 min-w-0">
          {tab === "overview" && <OverviewTab onNavigate={setTab} />}
          {tab === "billing" && (
            <BillingTab
              initialClientFilter={billingClientFilter}
              onClientFilterConsumed={() => setBillingClientFilter(null)}
            />
          )}
          {tab === "clients" && <ClientsTab onViewBilling={goToClientBilling} />}
          {tab === "settings" && <SettingsTab />}
        </main>
      </div>

      {/* Bottom tab bar — mobile only, fixed so it's always reachable */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 flex items-stretch z-50"
        style={{
          background: "#0f1729",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              if (t.key !== "billing") setBillingClientFilter(null);
              setTab(t.key);
            }}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2"
            style={{ color: tab === t.key ? "#2dce89" : "#64748a" }}
          >
            {ICONS[t.key]}
            <span className="text-[11px] font-medium">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
