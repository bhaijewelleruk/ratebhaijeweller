"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { BullionProduct, INITIAL_GOLD_ITEMS, INITIAL_SILVER_ITEMS } from "@/data/bullion-items";
import { SiteContent, INITIAL_SITE_CONTENT } from "@/data/site-content";
import { clearClientCatalogCache } from "@/lib/catalog-cache";

// Helper function to calculate real-time price & specs
export function getBullionCalculatedPrice(
  item: Partial<BullionProduct>,
  goldGram: number,
  silverGram: number
) {
  const isFixed = item.priceMode === "fixed" && !!item.customPriceOverride && item.customPriceOverride > 0;
  if (isFixed) {
    return {
      finalPrice: item.customPriceOverride as number,
      isAuto: false,
      rawMetal: 0,
      markupAmount: 0,
    };
  }

  const spotRate = item.metal === "silver" ? silverGram : goldGram;
  const purityFactor = (item.purity || "").includes("22K") ? 22 / 24 : 1.0;
  const weight = item.weightGrams || 0;
  const rawMetal = weight * spotRate * purityFactor;
  const markup = item.premiumPercentage || 0;
  const markupAmount = rawMetal * markup;
  const finalPrice = Math.round((rawMetal + markupAmount) * 100) / 100;

  return {
    finalPrice,
    isAuto: true,
    rawMetal,
    markupAmount,
  };
}

export default function AdminDashboardPage() {
  // Authentication Password state (Verified via Supabase Database API)
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [authErrorMsg, setAuthErrorMsg] = useState("Access Denied. Incorrect password.");
  const [isVerifyingAuth, setIsVerifyingAuth] = useState(false);

  // Active Admin Tab
  const [activeTab, setActiveTab] = useState<"bullion" | "appointments" | "contact" | "findUs" | "privacy" | "security">("bullion");
  const [bullionSubTab, setBullionSubTab] = useState<"gold" | "silver">("gold");

  // VIP Showroom Appointments State
  const [appointments, setAppointments] = useState<any[]>([]);
  const [aptFilter, setAptFilter] = useState<"all" | "pending" | "confirmed" | "completed" | "cancelled">("all");

  // Database & Index Cache Metadata
  const [dbStats, setDbStats] = useState<{
    dbSource?: string;
    etag?: string;
    cachedAt?: string;
  }>({});

  // Password Change Form State
  const [currentPasswordForm, setCurrentPasswordForm] = useState("");
  const [newPasswordForm, setNewPasswordForm] = useState("");
  const [confirmPasswordForm, setConfirmPasswordForm] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // State for data
  const [goldItems, setGoldItems] = useState<BullionProduct[]>(INITIAL_GOLD_ITEMS);
  const [silverItems, setSilverItems] = useState<BullionProduct[]>(INITIAL_SILVER_ITEMS);
  const [siteContent, setSiteContent] = useState<SiteContent>(INITIAL_SITE_CONTENT);

  // Live spot rates
  const [goldGram, setGoldGram] = useState<number>(96.5);
  const [silverGram, setSilverGram] = useState<number>(1.12);

  // Search & filter
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "bar" | "coin">("all");

  // Edit / Add modal state for Bullion
  const [editingItem, setEditingItem] = useState<BullionProduct | null>(null);
  const [isNewItemModal, setIsNewItemModal] = useState(false);

  // Status message
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Check auth from sessionStorage
  useEffect(() => {
    const auth = sessionStorage.getItem("bhai_admin_auth");
    if (auth === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  // Fetch live market rates
  useEffect(() => {
    fetch("/api/rates")
      .then((r) => r.json())
      .then((d) => {
        if (d && d.goldGbpPerGram) setGoldGram(d.goldGbpPerGram);
        if (d && d.silverGbpPerGram) setSilverGram(d.silverGbpPerGram);
      })
      .catch((err) => console.error("Error loading live rates in admin:", err));
  }, []);

  // Fetch current stored data from Supabase Database
  useEffect(() => {
    fetch("/api/admin/content?fresh=true")
      .then((res) => res.json())
      .then((res) => {
        if (res.success && res.data) {
          if (Array.isArray(res.data.goldItems)) setGoldItems(res.data.goldItems);
          if (Array.isArray(res.data.silverItems)) setSilverItems(res.data.silverItems);
          if (res.data.siteContent) {
            setSiteContent({
              ...INITIAL_SITE_CONTENT,
              ...res.data.siteContent,
              slides: Array.isArray(res.data.siteContent.slides)
                ? res.data.siteContent.slides
                : INITIAL_SITE_CONTENT.slides,
            });
          }
          if (res.indexStats) {
            setDbStats({
              dbSource: res.indexStats.dbSource,
              etag: res.indexStats.etag,
              cachedAt: res.indexStats.cachedAt,
            });
          }
        }
      })
      .catch((err) => console.error("Error loading admin content:", err));

    // Fetch VIP Showroom Appointments from Supabase Database
    fetch("/api/appointments?fresh=true")
      .then((res) => res.json())
      .then((res) => {
        if (res.success && Array.isArray(res.appointments)) {
          setAppointments(res.appointments);
        }
      })
      .catch(() => {});
  }, []);

  const handleUpdateAppointmentStatus = async (
    id: string,
    status: "pending" | "confirmed" | "completed" | "cancelled"
  ) => {
    try {
      const res = await fetch("/api/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.appointments)) {
        setAppointments(json.appointments);
        showToast(`Appointment marked as ${status.toUpperCase()}`);
      }
    } catch {
      showToast("Failed to update appointment status");
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    if (!confirm("Delete this appointment record from Supabase?")) return;
    try {
      const res = await fetch(`/api/appointments?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.appointments)) {
        setAppointments(json.appointments);
        showToast("Appointment removed from database");
      }
    } catch {
      showToast("Failed to delete appointment");
    }
  };

  // Password validation handler (Verifies against Supabase Database)
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsVerifyingAuth(true);
      setAuthError(false);

      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
      });

      const json = await res.json();
      if (res.ok && json.authenticated) {
        setIsAuthenticated(true);
        sessionStorage.setItem("bhai_admin_auth", "true");
        if (json.token) {
          sessionStorage.setItem("bhai_admin_token", json.token);
        }
        setAuthError(false);
      } else {
        setAuthError(true);
        setAuthErrorMsg(json.error || "Access Denied. Incorrect database password.");
      }
    } catch {
      setAuthError(true);
      setAuthErrorMsg("Database verification failed. Please try again.");
    } finally {
      setIsVerifyingAuth(false);
    }
  };

  // Change Admin Password in Supabase Database
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPasswordForm.trim() !== confirmPasswordForm.trim()) {
      showToast("New password and confirm password do not match!");
      return;
    }
    if (newPasswordForm.trim().length < 4) {
      showToast("New password must be at least 4 characters.");
      return;
    }

    try {
      setIsUpdatingPassword(true);
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change-password",
          currentPassword: currentPasswordForm,
          newPassword: newPasswordForm,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast("Admin password updated in Supabase database!");
        setCurrentPasswordForm("");
        setNewPasswordForm("");
        setConfirmPasswordForm("");
        if (json.token) {
          sessionStorage.setItem("bhai_admin_token", json.token);
        }
      } else {
        showToast(json.error || "Failed to update password");
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  // Toast notification helper
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Save all changes to the Supabase Database API & refresh cache
  const handleSaveAll = async () => {
    try {
      setIsSaving(true);
      const res = await fetch("/api/admin/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goldItems,
          silverItems,
          siteContent,
        }),
      });

      const json = await res.json();
      if (json.success) {
        clearClientCatalogCache();
        showToast("All changes saved to Supabase Database & Cache updated!");
      } else {
        showToast(`Save failed: ${json.error || "Unknown error"}`);
      }
    } catch (err: any) {
      showToast(`Error saving: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Bullion editing helpers
  const currentList = bullionSubTab === "gold" ? goldItems : silverItems;
  const setCurrentList = (updater: (prev: BullionProduct[]) => BullionProduct[]) => {
    if (bullionSubTab === "gold") {
      setGoldItems(updater);
    } else {
      setSilverItems(updater);
    }
  };

  const handleUpdateBullionItem = (updated: BullionProduct) => {
    setCurrentList((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item))
    );
    setEditingItem(null);
    showToast(`Updated ${updated.name}`);
  };

  const handleAddBullionItem = (newItem: BullionProduct) => {
    setCurrentList((prev) => [newItem, ...prev]);
    setIsNewItemModal(false);
    showToast(`Added new item ${newItem.name}`);
  };

  const handleDeleteBullionItem = (id: string) => {
    if (confirm("Are you sure you want to remove this item?")) {
      setCurrentList((prev) => prev.filter((item) => item.id !== id));
      showToast("Item deleted");
    }
  };

  // Filtered bullion list
  const filteredBullion = currentList.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.company && item.company.toLowerCase().includes(searchQuery.toLowerCase())) ||
      item.refiner.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || item.type === typeFilter;
    return matchesSearch && matchesType;
  });

  // ----------------------------------------------------
  // EXECUTIVE LUXURY LOGIN SCREEN (WHITE, BLACK & ORANGE)
  // ----------------------------------------------------
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4 relative overflow-hidden font-sans">
        {/* Modern Vibrant Orange & Obsidian Atmosphere */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[radial-gradient(circle_at_center,_rgba(249,115,22,0.14)_0%,_transparent_70%)] blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(24,24,27,0.85)_0%,_#09090b_100%)] pointer-events-none" />

        <div className="relative w-full max-w-sm sm:max-w-md bg-[#121318]/95 backdrop-blur-2xl border border-zinc-800 rounded-3xl p-7 sm:p-9 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.9)] text-center text-white">
          {/* Top Signature Orange Accent Bar */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 rounded-t-3xl" />

          {/* Emblem Monogram */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-b from-zinc-900 to-black border border-orange-500/40 flex items-center justify-center text-orange-500 mx-auto mb-4 shadow-[0_0_25px_rgba(249,115,22,0.25)]">
            <span className="font-notche font-bold text-2xl tracking-tighter">B</span>
          </div>

          <h1 className="text-xl sm:text-2xl font-notche font-bold tracking-tight text-white">
            Bhai Jewellers
          </h1>
          <p className="text-[11px] text-zinc-400 mt-1 uppercase tracking-widest font-semibold flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
            Showroom Admin Studio
          </p>

          <form onSubmit={handlePasswordSubmit} className="mt-7 space-y-4">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  if (authError) setAuthError(false);
                }}
                className={`w-full px-4 py-3.5 pr-11 text-center text-sm font-numbers tracking-widest rounded-xl border ${
                  authError
                    ? "border-rose-500/80 bg-rose-950/20 text-rose-300 focus:ring-rose-500"
                    : "border-zinc-700 bg-zinc-900/90 text-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30"
                } focus:outline-none transition-all`}
                autoFocus
                placeholder="••••••••"
                required
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                aria-label="Toggle password visibility"
              >
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>

            {authError && (
              <div className="py-2 px-3 rounded-lg bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs font-medium animate-in fade-in">
                {authErrorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={isVerifyingAuth}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-orange-500 via-orange-600 to-amber-600 hover:from-orange-600 hover:to-orange-700 text-white font-notche font-bold tracking-wider text-xs sm:text-sm shadow-lg shadow-orange-500/25 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
            >
              {isVerifyingAuth ? "VERIFYING WITH DATABASE..." : "AUTHENTICATE ACCESS"}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
            <Link href="/" className="hover:text-white transition-colors">
              ← Return to Site
            </Link>
            <span className="font-numbers text-[11px] text-orange-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
              Supabase Auth DB
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // MAIN ADMIN CONTROL PANEL (WHITE, BLACK & ORANGE UI)
  // ----------------------------------------------------
  return (
    <div className="min-h-screen bg-[#f8fafc] text-zinc-900 pb-24 relative font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-zinc-950 text-white px-5 py-3 rounded-xl shadow-2xl border border-orange-500/50 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-ping" />
          <span className="text-xs sm:text-sm font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-zinc-200 px-4 sm:px-8 py-3.5 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-orange-500 font-notche font-bold text-lg shadow-sm">
              B
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-notche font-bold text-zinc-950 tracking-tight leading-none">
                  Bhai Jewellers
                </h1>
                <span className="text-[10px] font-notche font-bold bg-orange-50 text-orange-600 px-2.5 py-0.5 rounded-full border border-orange-200 uppercase tracking-wider">
                  Admin Studio
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 font-medium">
                Live Pricing, Bullion Catalog & Showroom Content Management
              </p>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center gap-2.5">
            <div className="hidden md:flex items-center gap-3 text-xs text-zinc-600 bg-zinc-100 px-3 py-1.5 rounded-xl border border-zinc-200">
              <span className="flex items-center gap-1 font-numbers font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Gold: <strong className="text-zinc-950 font-bold">£{goldGram.toFixed(2)}/g</strong>
              </span>
              <span className="text-zinc-300">|</span>
              <span className="flex items-center gap-1 font-numbers font-medium">
                Silver: <strong className="text-zinc-950 font-bold">£{silverGram.toFixed(2)}/g</strong>
              </span>
            </div>

            <Link
              href="/"
              target="_blank"
              className="text-xs font-semibold px-3.5 py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 transition-colors shadow-xs flex items-center gap-1.5"
            >
              <span>View Site</span>
              <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </Link>

            <button
              onClick={handleSaveAll}
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-orange-500 via-orange-600 to-amber-600 hover:from-orange-600 hover:to-orange-700 text-white font-notche font-bold text-xs tracking-wider shadow-md shadow-orange-500/20 transition-all active:scale-95 cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>SAVING...</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                    <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm2 16H5V5h11.17L19 7.83V19zm-7-7c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zM6 6h9v4H6z" />
                  </svg>
                  <span>SAVE ALL CHANGES</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                sessionStorage.removeItem("bhai_admin_auth");
                setIsAuthenticated(false);
              }}
              className="text-xs text-zinc-400 hover:text-rose-600 px-2 py-1 transition-colors font-medium cursor-pointer"
              title="Logout"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-6">
        <div className="flex items-center gap-2 border-b border-zinc-200 pb-3 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab("bullion")}
            className={`px-4 py-2.5 rounded-xl font-notche font-bold text-xs sm:text-sm tracking-wide transition-all cursor-pointer shrink-0 flex items-center gap-2 ${
              activeTab === "bullion"
                ? "bg-zinc-950 text-white shadow-md ring-1 ring-zinc-900"
                : "bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200"
            }`}
          >
            <span>🪙 Gold & Silver Bullion</span>
            <span className={`font-numbers text-xs px-2 py-0.5 rounded-full ${
              activeTab === "bullion" ? "bg-orange-500 text-white font-bold" : "bg-zinc-100 text-zinc-700 font-semibold"
            }`}>
              {goldItems.length + silverItems.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("appointments")}
            className={`px-4 py-2.5 rounded-xl font-notche font-bold text-xs sm:text-sm tracking-wide transition-all cursor-pointer shrink-0 flex items-center gap-2 ${
              activeTab === "appointments"
                ? "bg-zinc-950 text-white shadow-md ring-1 ring-zinc-900"
                : "bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200"
            }`}
          >
            <span>📅 VIP Appointments</span>
            <span className={`font-numbers text-xs px-2 py-0.5 rounded-full ${
              activeTab === "appointments" ? "bg-orange-500 text-white font-bold" : "bg-zinc-100 text-zinc-700 font-semibold"
            }`}>
              {appointments.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("contact")}
            className={`px-4 py-2.5 rounded-xl font-notche font-bold text-xs sm:text-sm tracking-wide transition-all cursor-pointer shrink-0 flex items-center gap-2 ${
              activeTab === "contact"
                ? "bg-zinc-950 text-white shadow-md ring-1 ring-zinc-900"
                : "bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200"
            }`}
          >
            <span>📞 Contact & Channels</span>
          </button>

          <button
            onClick={() => setActiveTab("findUs")}
            className={`px-4 py-2.5 rounded-xl font-notche font-bold text-xs sm:text-sm tracking-wide transition-all cursor-pointer shrink-0 flex items-center gap-2 ${
              activeTab === "findUs"
                ? "bg-zinc-950 text-white shadow-md ring-1 ring-zinc-900"
                : "bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200"
            }`}
          >
            <span>📍 Find Us & Hours</span>
          </button>

          <button
            onClick={() => setActiveTab("privacy")}
            className={`px-4 py-2.5 rounded-xl font-notche font-bold text-xs sm:text-sm tracking-wide transition-all cursor-pointer shrink-0 flex items-center gap-2 ${
              activeTab === "privacy"
                ? "bg-zinc-950 text-white shadow-md ring-1 ring-zinc-900"
                : "bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200"
            }`}
          >
            <span>📜 Privacy Policy</span>
          </button>

          <button
            onClick={() => setActiveTab("security")}
            className={`px-4 py-2.5 rounded-xl font-notche font-bold text-xs sm:text-sm tracking-wide transition-all cursor-pointer shrink-0 flex items-center gap-2 ${
              activeTab === "security"
                ? "bg-zinc-950 text-white shadow-md ring-1 ring-zinc-900"
                : "bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200"
            }`}
          >
            <span>🔐 Security & DB</span>
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 mt-6">
        {/* ======================================================== */}
        {/* TAB 1: BULLION CATALOG (GOLD & SILVER)                   */}
        {/* ======================================================== */}
        {activeTab === "bullion" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Top Subnav & Search Controls */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
              {/* Gold / Silver switch */}
              <div className="flex items-center gap-2 w-full md:w-auto">
                <button
                  onClick={() => setBullionSubTab("gold")}
                  className={`flex-1 md:flex-none px-4 py-2 rounded-xl font-notche font-bold text-xs tracking-wide transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    bullionSubTab === "gold"
                      ? "bg-zinc-950 text-white shadow-xs ring-1 ring-zinc-900"
                      : "bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50"
                  }`}
                >
                  <span className="text-orange-400">●</span>
                  <span>Gold Catalog</span>
                  <span className={`font-numbers text-[11px] px-1.5 py-0.2 rounded-full font-bold ${
                    bullionSubTab === "gold" ? "bg-orange-500 text-white" : "bg-zinc-100 text-zinc-700"
                  }`}>
                    {goldItems.length}
                  </span>
                </button>

                <button
                  onClick={() => setBullionSubTab("silver")}
                  className={`flex-1 md:flex-none px-4 py-2 rounded-xl font-notche font-bold text-xs tracking-wide transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    bullionSubTab === "silver"
                      ? "bg-zinc-800 text-white shadow-xs ring-1 ring-zinc-700"
                      : "bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50"
                  }`}
                >
                  <span className="text-zinc-300">●</span>
                  <span>Silver Catalog</span>
                  <span className={`font-numbers text-[11px] px-1.5 py-0.2 rounded-full font-bold ${
                    bullionSubTab === "silver" ? "bg-orange-500 text-white" : "bg-zinc-100 text-zinc-700"
                  }`}>
                    {silverItems.length}
                  </span>
                </button>
              </div>

              {/* Type Filter & Search Bar */}
              <div className="flex items-center gap-2.5 w-full md:w-auto">
                <div className="flex bg-zinc-100 p-1 rounded-xl border border-zinc-200">
                  {(["all", "bar", "coin"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t)}
                      className={`px-3 py-1 text-xs font-bold rounded-lg capitalize transition-all cursor-pointer ${
                        typeFilter === t
                          ? "bg-white text-zinc-950 shadow-xs font-notche"
                          : "text-zinc-500 hover:text-zinc-900"
                      }`}
                    >
                      {t === "all" ? "All" : `${t}s`}
                    </button>
                  ))}
                </div>

                <div className="relative flex-1 md:w-56">
                  <input
                    type="text"
                    placeholder="Search by company, item..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-zinc-900"
                  />
                  <svg className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>

                <button
                  onClick={() => setIsNewItemModal(true)}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-notche font-bold text-xs rounded-xl shadow-sm shadow-orange-500/25 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <span>+</span>
                  <span className="hidden sm:inline">Add Product</span>
                </button>
              </div>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredBullion.map((item) => {
                const priceInfo = getBullionCalculatedPrice(item, goldGram, silverGram);

                return (
                  <div
                    key={item.id}
                    className="bg-white border border-zinc-200 rounded-2xl p-4.5 shadow-xs hover:border-orange-300 hover:shadow-lg transition-all relative flex flex-col justify-between group"
                  >
                    <div>
                      {/* Top Header */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-[10px] font-mono font-bold bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded border border-zinc-200 uppercase">
                          {item.id}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {item.popular && (
                            <span className="text-[9px] font-bold bg-orange-500 text-white px-2 py-0.5 rounded-full uppercase shadow-xs">
                              Popular
                            </span>
                          )}
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                              item.inStock !== false
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-rose-50 text-rose-700 border-rose-200"
                            }`}
                          >
                            {item.inStock !== false ? "In Stock" : "Sold Out"}
                          </span>
                        </div>
                      </div>

                      {/* Product Name */}
                      <h3 className="font-notche font-bold text-zinc-900 group-hover:text-orange-600 transition-colors text-sm sm:text-base leading-snug">
                        {item.name}
                      </h3>

                      {/* Company / Brand Badge & Purity */}
                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-700 bg-orange-50 border border-orange-200/90 px-2 py-0.5 rounded-md">
                          <span className="text-[10px]">🏢</span>
                          <span>{item.company || item.refiner}</span>
                        </span>
                        <span className="text-[10px] font-semibold text-zinc-500">· {item.purity}</span>
                      </div>
                    </div>

                    {/* Specifications & Real-time Pricing Info */}
                    <div className="mt-4 pt-3 border-t border-zinc-100 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-zinc-400 block text-[10px] uppercase font-semibold">Weight:</span>
                        <span className="font-numbers font-bold text-zinc-900">
                          {item.weightGrams}g
                        </span>
                      </div>

                      <div>
                        <span className="text-zinc-400 block text-[10px] uppercase font-semibold">Markup:</span>
                        <span className="font-numbers font-semibold text-zinc-800">
                          +{(item.premiumPercentage * 100).toFixed(1)}%
                        </span>
                      </div>

                      <div className="col-span-2 mt-1 bg-zinc-50 p-2.5 rounded-xl border border-zinc-200 flex items-center justify-between">
                        <div>
                          <span className="text-zinc-400 block text-[9.5px] uppercase font-bold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                            {priceInfo.isAuto ? "Auto Spot Rate" : "Fixed Deal Price"}
                          </span>
                          <span className="font-numbers font-bold text-base text-zinc-950">
                            £{priceInfo.finalPrice.toFixed(2)}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {item.vatStatus || "0% VAT Exempt"}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between gap-2">
                      <button
                        onClick={() => setEditingItem(item)}
                        className="flex-1 py-2 px-3 rounded-xl bg-zinc-950 hover:bg-orange-600 text-white font-notche text-xs font-bold transition-all cursor-pointer text-center shadow-xs"
                      >
                        EDIT CARD & AUTO-PRICE
                      </button>

                      <button
                        onClick={() => handleDeleteBullionItem(item.id)}
                        className="p-2 rounded-xl text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer border border-transparent hover:border-rose-100"
                        title="Delete Item"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredBullion.length === 0 && (
              <div className="text-center py-16 bg-white rounded-2xl border border-zinc-200">
                <p className="text-sm text-zinc-500 font-medium">No bullion items found matching your filter.</p>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: VIP SHOWROOM APPOINTMENTS (SUPABASE DB)           */}
        {/* ======================================================== */}
        {activeTab === "appointments" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-notche font-bold text-zinc-950">
                  VIP Showroom Appointments Desk
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Manage client bookings for the Bullion Suite, 22K Bridal Chambers, and XRF Lab.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {(["all", "pending", "confirmed", "completed", "cancelled"] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setAptFilter(st)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize cursor-pointer transition-all ${
                      aptFilter === st
                        ? "bg-zinc-950 text-white shadow-xs ring-1 ring-zinc-900"
                        : "bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {appointments
                .filter((a) => aptFilter === "all" || a.status === aptFilter)
                .map((apt) => {
                  const cleanWa = String(apt.clientPhone || "").replace(/[^0-9]/g, "");
                  const waReply = encodeURIComponent(
                    `Hello ${apt.clientName}, this is Bhai Jewellers Bradford confirming your VIP Showroom Appointment (${apt.referenceCode}) for ${apt.preferredDate} at ${apt.preferredTime}. We look forward to welcoming you at 17 Duckworth Lane, BD9 5ER.`
                  );

                  return (
                    <div
                      key={apt.id}
                      className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-xs space-y-3 flex flex-col justify-between hover:border-orange-300 transition-all"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-numbers font-black text-xs bg-zinc-100 text-zinc-800 px-2.5 py-1 rounded-md border border-zinc-200">
                            {apt.referenceCode}
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border ${
                              apt.status === "confirmed"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : apt.status === "completed"
                                ? "bg-zinc-100 text-zinc-700 border-zinc-200"
                                : apt.status === "cancelled"
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : "bg-orange-50 text-orange-700 border-orange-200"
                            }`}
                          >
                            {apt.status}
                          </span>
                        </div>

                        <div>
                          <h3 className="text-base font-notche font-bold text-zinc-950">
                            {apt.clientName}
                          </h3>
                          <p className="text-xs font-numbers font-semibold text-zinc-600">
                            📞 {apt.clientPhone}
                          </p>
                        </div>

                        <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 text-xs space-y-1">
                          <div className="font-bold text-zinc-900">{apt.serviceType}</div>
                          <div className="font-numbers font-bold text-orange-600">
                            🗓️ {apt.preferredDate} · ⏰ {apt.preferredTime}
                          </div>
                          {apt.notes && (
                            <p className="text-zinc-600 italic pt-1 border-t border-zinc-200">
                              &ldquo;{apt.notes}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleUpdateAppointmentStatus(apt.id, "confirmed")}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer transition-colors shadow-xs"
                          >
                            ✓ Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateAppointmentStatus(apt.id, "completed")}
                            className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-950 text-white text-[11px] font-bold cursor-pointer transition-colors shadow-xs"
                          >
                            Complete
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateAppointmentStatus(apt.id, "cancelled")}
                            className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-rose-50 text-zinc-700 hover:text-rose-700 text-[11px] font-bold cursor-pointer transition-colors border border-zinc-200"
                          >
                            Cancel
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          {cleanWa && (
                            <a
                              href={`https://wa.me/${cleanWa}?text=${waReply}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 rounded-lg bg-[#25D366] hover:bg-[#20ba59] text-white text-[11px] font-bold shadow-xs transition-colors"
                            >
                              WhatsApp
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteAppointment(apt.id)}
                            className="text-zinc-400 hover:text-rose-600 p-1 cursor-pointer transition-colors"
                            title="Delete Appointment"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            {appointments.filter((a) => aptFilter === "all" || a.status === aptFilter).length === 0 && (
              <div className="text-center py-14 bg-white rounded-2xl border border-zinc-200">
                <p className="text-sm text-zinc-500 font-medium">
                  No VIP showroom appointments found for this filter.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 3: CONTACT & CHANNELS                                */}
        {/* ======================================================== */}
        {activeTab === "contact" && (
          <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
            <div className="bg-white border border-zinc-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
              <div className="border-b border-zinc-100 pb-4">
                <h2 className="text-lg sm:text-xl font-notche font-bold text-zinc-950">
                  Official Concierge & Contact Settings
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Update customer communication lines, phone numbers, and WhatsApp links across the site.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 uppercase mb-1">
                    Showroom Name
                  </label>
                  <input
                    type="text"
                    value={siteContent.contact.showroomName}
                    onChange={(e) =>
                      setSiteContent({
                        ...siteContent,
                        contact: { ...siteContent.contact, showroomName: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-zinc-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 uppercase mb-1">
                    Bradford Phone Number
                  </label>
                  <input
                    type="text"
                    value={siteContent.contact.phone}
                    onChange={(e) =>
                      setSiteContent({
                        ...siteContent,
                        contact: { ...siteContent.contact, phone: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 bg-white font-numbers font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-zinc-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 uppercase mb-1">
                    Official WhatsApp (+44 format)
                  </label>
                  <input
                    type="text"
                    value={siteContent.contact.whatsapp}
                    onChange={(e) =>
                      setSiteContent({
                        ...siteContent,
                        contact: { ...siteContent.contact, whatsapp: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 bg-white font-numbers font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-zinc-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 uppercase mb-1">
                    Customer Support Email
                  </label>
                  <input
                    type="email"
                    value={siteContent.contact.email}
                    onChange={(e) =>
                      setSiteContent({
                        ...siteContent,
                        contact: { ...siteContent.contact, email: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-zinc-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 uppercase mb-1">
                    Instagram Handle
                  </label>
                  <input
                    type="text"
                    value={siteContent.contact.instagramHandle}
                    onChange={(e) =>
                      setSiteContent({
                        ...siteContent,
                        contact: { ...siteContent.contact, instagramHandle: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-zinc-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 uppercase mb-1">
                    Instagram URL
                  </label>
                  <input
                    type="text"
                    value={siteContent.contact.instagramUrl}
                    onChange={(e) =>
                      setSiteContent({
                        ...siteContent,
                        contact: { ...siteContent.contact, instagramUrl: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-zinc-900"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-zinc-700 uppercase mb-1">
                    Showroom Hours Summary
                  </label>
                  <input
                    type="text"
                    value={siteContent.contact.openingHoursSummary}
                    onChange={(e) =>
                      setSiteContent({
                        ...siteContent,
                        contact: { ...siteContent.contact, openingHoursSummary: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-zinc-900"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-100 flex justify-end">
                <button
                  onClick={handleSaveAll}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-notche font-bold text-xs tracking-wider shadow-md shadow-orange-500/25 transition-all cursor-pointer"
                >
                  SAVE CONTACT DETAILS
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 4: FIND US & STORE HOURS                             */}
        {/* ======================================================== */}
        {activeTab === "findUs" && (
          <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
            <div className="bg-white border border-zinc-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
              <div className="border-b border-zinc-100 pb-4">
                <h2 className="text-lg sm:text-xl font-notche font-bold text-zinc-950">
                  Location, Schedule & Map
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Update the Bradford showroom address, weekly schedule, and Google Maps embed frame.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 uppercase mb-1">
                    Showroom Full Address
                  </label>
                  <input
                    type="text"
                    value={siteContent.findUs.addressFull}
                    onChange={(e) =>
                      setSiteContent({
                        ...siteContent,
                        findUs: { ...siteContent.findUs, addressFull: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-zinc-900"
                    placeholder="17 Duckworth Lane, Bradford, West Yorkshire, BD9 5ER"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 uppercase mb-1">
                    Google Maps Embed URL (iframe src)
                  </label>
                  <input
                    type="text"
                    value={siteContent.findUs.mapsEmbedUrl}
                    onChange={(e) =>
                      setSiteContent({
                        ...siteContent,
                        findUs: { ...siteContent.findUs, mapsEmbedUrl: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono text-xs text-zinc-900"
                  />
                </div>

                {/* Opening Hours Schedule */}
                <div className="pt-2">
                  <label className="block text-xs font-bold text-zinc-700 uppercase mb-2">
                    Showroom Schedule (Monday - Sunday)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {siteContent.findUs.openingHours.map((item, idx) => (
                      <div
                        key={item.day}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 text-xs"
                      >
                        <span className="font-bold text-zinc-800 w-28">{item.day}</span>
                        <input
                          type="text"
                          value={item.hours}
                          onChange={(e) => {
                            const newHours = [...siteContent.findUs.openingHours];
                            newHours[idx] = { ...newHours[idx], hours: e.target.value };
                            setSiteContent({
                              ...siteContent,
                              findUs: { ...siteContent.findUs, openingHours: newHours },
                            });
                          }}
                          className="px-2 py-1 bg-white rounded-lg border border-zinc-200 text-zinc-900 font-numbers text-right text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 flex-1 ml-2"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-100 flex justify-end">
                <button
                  onClick={handleSaveAll}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-notche font-bold text-xs tracking-wider shadow-md shadow-orange-500/25 transition-all cursor-pointer"
                >
                  SAVE LOCATION & HOURS
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 5: PRIVACY POLICY                                    */}
        {/* ======================================================== */}
        {activeTab === "privacy" && (
          <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
            <div className="bg-white border border-zinc-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
              <div className="border-b border-zinc-100 pb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg sm:text-xl font-notche font-bold text-zinc-950">
                    Showroom Privacy Policy
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Manage compliance disclosures, clauses, and policy text.
                  </p>
                </div>
                <button
                  onClick={() => {
                    const newSec = {
                      id: `sec-${Date.now()}`,
                      title: "New Policy Section",
                      content: "Enter your legal clause description here...",
                    };
                    setSiteContent({
                      ...siteContent,
                      privacyPolicy: {
                        ...siteContent.privacyPolicy,
                        sections: [...siteContent.privacyPolicy.sections, newSec],
                      },
                    });
                  }}
                  className="px-3.5 py-1.5 bg-zinc-950 hover:bg-orange-600 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-xs"
                >
                  + Add Section
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 uppercase mb-1">
                      Last Updated Date
                    </label>
                    <input
                      type="text"
                      value={siteContent.privacyPolicy.lastUpdated}
                      onChange={(e) =>
                        setSiteContent({
                          ...siteContent,
                          privacyPolicy: {
                            ...siteContent.privacyPolicy,
                            lastUpdated: e.target.value,
                          },
                        })
                      }
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 bg-white font-numbers focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 uppercase mb-1">
                      Page Subtitle
                    </label>
                    <input
                      type="text"
                      value={siteContent.privacyPolicy.subtitle}
                      onChange={(e) =>
                        setSiteContent({
                          ...siteContent,
                          privacyPolicy: {
                            ...siteContent.privacyPolicy,
                            subtitle: e.target.value,
                          },
                        })
                      }
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-zinc-900"
                    />
                  </div>
                </div>

                {/* Sections List */}
                <div className="space-y-4 pt-2">
                  {siteContent.privacyPolicy.sections.map((sec, idx) => (
                    <div
                      key={sec.id}
                      className="p-4 rounded-xl border border-zinc-200 bg-zinc-50 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="text"
                          value={sec.title}
                          onChange={(e) => {
                            const newSecs = [...siteContent.privacyPolicy.sections];
                            newSecs[idx] = { ...newSecs[idx], title: e.target.value };
                            setSiteContent({
                              ...siteContent,
                              privacyPolicy: {
                                ...siteContent.privacyPolicy,
                                sections: newSecs,
                              },
                            });
                          }}
                          className="flex-1 px-3 py-1.5 text-xs font-bold text-zinc-950 rounded-lg border border-zinc-300 bg-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                        />

                        <button
                          onClick={() => {
                            const newSecs = siteContent.privacyPolicy.sections.filter(
                              (_, i) => i !== idx
                            );
                            setSiteContent({
                              ...siteContent,
                              privacyPolicy: {
                                ...siteContent.privacyPolicy,
                                sections: newSecs,
                              },
                            });
                          }}
                          className="text-zinc-400 hover:text-rose-600 p-1 transition-colors"
                          title="Remove Section"
                        >
                          ✕
                        </button>
                      </div>

                      <textarea
                        rows={3}
                        value={sec.content}
                        onChange={(e) => {
                          const newSecs = [...siteContent.privacyPolicy.sections];
                          newSecs[idx] = { ...newSecs[idx], content: e.target.value };
                          setSiteContent({
                            ...siteContent,
                            privacyPolicy: {
                              ...siteContent.privacyPolicy,
                              sections: newSecs,
                            },
                          });
                        }}
                        className="w-full px-3 py-2 text-xs text-zinc-700 rounded-lg border border-zinc-300 bg-white focus:outline-none focus:ring-1 focus:ring-orange-500 leading-relaxed"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-100 flex justify-end">
                <button
                  onClick={handleSaveAll}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-notche font-bold text-xs tracking-wider shadow-md shadow-orange-500/25 transition-all cursor-pointer"
                >
                  SAVE PRIVACY POLICY
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 6: SECURITY, DATABASE & CACHE INDEXING               */}
        {/* ======================================================== */}
        {activeTab === "security" && (
          <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
            {/* Database & Index Status Card */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-4">
                <div>
                  <h2 className="text-lg sm:text-xl font-notche font-bold text-zinc-950">
                    Supabase Database, Cache & Indexing Status
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Connected to <span className="font-mono text-zinc-700">ydsjutiavwxycgezdjti.supabase.co</span>
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Connected & Indexed
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200">
                  <span className="text-[10px] font-bold uppercase text-zinc-400 block">Gold Indexed</span>
                  <span className="text-xl font-numbers font-bold text-orange-600">{goldItems.length}</span>
                  <span className="text-[10px] text-zinc-500 block">Bars & Coins</span>
                </div>
                <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200">
                  <span className="text-[10px] font-bold uppercase text-zinc-400 block">Silver Indexed</span>
                  <span className="text-xl font-numbers font-bold text-zinc-900">{silverItems.length}</span>
                  <span className="text-[10px] text-zinc-500 block">Bars & Coins</span>
                </div>
                <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200">
                  <span className="text-[10px] font-bold uppercase text-zinc-400 block">Active Cache</span>
                  <span className="text-xs font-mono font-bold text-emerald-700 truncate block mt-1">
                    {dbStats.etag || "O(1) Memory"}
                  </span>
                  <span className="text-[10px] text-zinc-500 block">ETag + SWR</span>
                </div>
                <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200">
                  <span className="text-[10px] font-bold uppercase text-zinc-400 block">DB Engine</span>
                  <span className="text-xs font-bold text-zinc-900 uppercase block mt-1">
                    {dbStats.dbSource || "Supabase Cloud"}
                  </span>
                  <span className="text-[10px] text-zinc-500 block">Auto-Synced</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <p className="text-xs text-zinc-500">
                  Click &quot;Sync &amp; Rebuild Index Cache&quot; to push all {goldItems.length + silverItems.length} Gold &amp; Silver products to Supabase and refresh server/client caches.
                </p>
                <button
                  type="button"
                  onClick={handleSaveAll}
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-notche font-bold text-xs tracking-wider shadow-md shadow-orange-500/25 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? "SYNCING..." : "SYNC & REBUILD INDEX CACHE"}
                </button>
              </div>
            </div>

            {/* Change Admin Password in Database Card */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-5">
              <div className="border-b border-zinc-100 pb-4">
                <h2 className="text-lg sm:text-xl font-notche font-bold text-zinc-950">
                  Update Admin Database Password
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Your admin password is encrypted with SHA-256 and verified directly from the Supabase database.
                </p>
              </div>

              <form onSubmit={handleUpdatePassword} className="space-y-4 max-w-md">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 uppercase mb-1">
                    Current Admin Password
                  </label>
                  <input
                    type="password"
                    required
                    value={currentPasswordForm}
                    onChange={(e) => setCurrentPasswordForm(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-zinc-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 uppercase mb-1">
                    New Admin Password
                  </label>
                  <input
                    type="password"
                    required
                    value={newPasswordForm}
                    onChange={(e) => setNewPasswordForm(e.target.value)}
                    placeholder="Enter new password (min 4 chars)"
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-zinc-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 uppercase mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPasswordForm}
                    onChange={(e) => setConfirmPasswordForm(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-zinc-900"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isUpdatingPassword}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-notche font-bold text-xs tracking-wider shadow-md shadow-orange-500/25 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isUpdatingPassword ? "UPDATING IN SUPABASE..." : "UPDATE PASSWORD IN DATABASE"}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* ======================================================== */}
      {/* RICH EDIT BULLION ITEM MODAL WITH IMAGE UPLOAD           */}
      {/* ======================================================== */}
      {editingItem && (
        <BullionProductEditorModal
          initialItem={editingItem}
          goldGram={goldGram}
          silverGram={silverGram}
          onClose={() => setEditingItem(null)}
          onSave={handleUpdateBullionItem}
        />
      )}

      {/* ======================================================== */}
      {/* ADD NEW BULLION ITEM MODAL WITH IMAGE UPLOAD             */}
      {/* ======================================================== */}
      {isNewItemModal && (
        <BullionProductEditorModal
          initialItem={{
            id: `${Date.now()}-${bullionSubTab}`,
            name: bullionSubTab === "gold" ? "New Minted Gold Bar" : "New Minted Silver Bar",
            company: bullionSubTab === "gold" ? "PAMP Suisse" : "The Royal Mint",
            metal: bullionSubTab,
            weightGrams: bullionSubTab === "gold" ? 10 : 100,
            purity: bullionSubTab === "gold" ? "999.9 (24K)" : "999 Fine Silver",
            type: "bar",
            premiumPercentage: 0.05,
            priceMode: "auto",
            refiner: bullionSubTab === "gold" ? "PAMP Suisse" : "The Royal Mint",
            badge: "LBMA Good Delivery",
            perk: bullionSubTab === "gold" ? "Free Vault Storage" : "Secure Delivery",
            vatStatus: bullionSubTab === "gold" ? "0% VAT Exempt" : "20% Standard VAT",
            buttonText: "Inquire / Lock Price",
            imageUrl: bullionSubTab === "gold" ? "/bullion/gold-bar-10g.webp" : "/bullion/silver-bar-100g.webp",
            inStock: true,
          }}
          goldGram={goldGram}
          silverGram={silverGram}
          isNew
          onClose={() => setIsNewItemModal(false)}
          onSave={handleAddBullionItem}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------
// DUAL-PANE PRODUCT EDITOR MODAL (WHITE, BLACK & ORANGE)
// ----------------------------------------------------
function BullionProductEditorModal({
  initialItem,
  goldGram,
  silverGram,
  isNew = false,
  onClose,
  onSave,
}: {
  initialItem: BullionProduct;
  goldGram: number;
  silverGram: number;
  isNew?: boolean;
  onClose: () => void;
  onSave: (item: BullionProduct) => void;
}) {
  const [formData, setFormData] = useState<BullionProduct>({
    ...initialItem,
    company: initialItem.company || initialItem.refiner || (initialItem.metal === "silver" ? "The Royal Mint" : "PAMP Suisse"),
    badge: initialItem.badge || (initialItem.type === "coin" ? "The Royal Mint" : "LBMA Good Delivery"),
    perk: initialItem.perk || (initialItem.metal === "silver" ? "Secure Delivery" : "Free Vault Storage"),
    vatStatus: initialItem.vatStatus || (initialItem.metal === "silver" ? "20% Standard VAT" : "0% VAT Exempt"),
    buttonText: initialItem.buttonText || "Inquire / Lock Price",
    priceMode: initialItem.priceMode || (initialItem.customPriceOverride ? "fixed" : "auto"),
  });

  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle direct file upload from computer
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);

      // Local preview immediately
      const localUrl = URL.createObjectURL(file);
      setFormData((prev) => ({ ...prev, imageUrl: localUrl }));

      const data = new FormData();
      data.append("file", file);

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: data,
      });

      const json = await res.json();
      if (json.success && json.url) {
        setFormData((prev) => ({ ...prev, imageUrl: json.url }));
      } else {
        // Fallback: convert to base64 Data URL
        const reader = new FileReader();
        reader.onloadend = () => {
          if (reader.result) {
            setFormData((prev) => ({ ...prev, imageUrl: reader.result as string }));
          }
        };
        reader.readAsDataURL(file);
      }
    } catch {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result) {
          setFormData((prev) => ({ ...prev, imageUrl: reader.result as string }));
        }
      };
      reader.readAsDataURL(file);
    } finally {
      setIsUploading(false);
    }
  };

  // Calculate live preview price automatically as user changes weight or markup
  const priceInfo = getBullionCalculatedPrice(formData, goldGram, silverGram);
  const currentSpot = formData.metal === "silver" ? silverGram : goldGram;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-6 animate-in fade-in overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-white rounded-3xl border border-zinc-200 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Vibrant Orange Accent Bar */}
        <div className="h-1.5 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 shrink-0" />

        {/* Modal Header */}
        <div className="px-5 sm:px-7 py-4 border-b border-zinc-200 flex items-center justify-between bg-white shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold font-notche uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200">
                {formData.metal.toUpperCase()} BULLION
              </span>
              <h3 className="font-notche font-bold text-zinc-950 text-base sm:text-lg">
                {isNew ? "Add New Bullion Product" : `Edit Product Card: ${formData.name || formData.id}`}
              </h3>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Edit company, name, weight, and pricing. Calculations automatically update with live spot rates.
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 flex items-center justify-center font-bold text-sm transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Modal Body: 2 Columns on Desktop */}
        <div className="p-5 sm:p-7 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-6 sm:gap-8 bg-zinc-50/50">
          
          {/* LEFT COLUMN: LIVE VISUAL CARD PREVIEW */}
          <div className="md:col-span-5 flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600 font-notche flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                Live Card Preview
              </span>
              <span className="text-[10px] text-zinc-400 font-medium">As shown to client</span>
            </div>

            {/* Bullion Card Preview in White, Black & Orange */}
            <div className="w-full max-w-[300px] bg-white border border-zinc-200 rounded-2xl p-4 shadow-md relative overflow-hidden flex flex-col justify-between">
              {/* Metallic Accent Strip */}
              <div
                className={`absolute top-0 left-0 right-0 h-1.5 ${
                  formData.metal === "silver"
                    ? "bg-gradient-to-r from-zinc-400 via-zinc-200 to-zinc-500"
                    : "bg-gradient-to-r from-orange-500 via-amber-400 to-orange-600"
                }`}
              />

              {/* Best Seller / Popular Badge */}
              {formData.popular && (
                <span className="absolute top-3 right-3 bg-orange-500 text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-xs z-10 flex items-center gap-1 font-notche">
                  ✦ Popular
                </span>
              )}

              <div>
                {/* Image Stage */}
                <div className="relative w-full h-40 rounded-xl bg-zinc-50 border border-zinc-200 p-3 flex items-center justify-center mb-3 overflow-hidden shadow-inner">
                  <img
                    src={formData.imageUrl || "/bullion/gold-bar-1g.webp"}
                    alt={formData.name}
                    className="relative z-10 h-full max-w-full object-contain filter drop-shadow-md"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/bullion/gold-bar-1g.webp";
                    }}
                  />

                  {/* Certification Badge over image */}
                  <span className="absolute bottom-2 left-2 z-10 bg-white/95 backdrop-blur-xs text-zinc-900 text-[9.5px] font-bold px-2 py-0.5 rounded border border-zinc-200 shadow-xs font-notche">
                    {formData.badge || "LBMA Good Delivery"}
                  </span>
                </div>

                {/* Company / Brand Badge & Purity */}
                <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                  <span className="text-[9.5px] font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded border border-orange-200 uppercase tracking-wider font-notche flex items-center gap-1">
                    <span>🏢</span>
                    <span>{formData.company || formData.refiner || "PAMP Suisse"}</span>
                  </span>
                  <span
                    className={`text-[9.5px] font-black text-white px-2 py-0.5 rounded shadow-xs uppercase tracking-wider font-notche ${
                      formData.metal === "silver" ? "bg-zinc-800" : "bg-zinc-950"
                    }`}
                  >
                    {formData.purity}
                  </span>
                </div>

                {/* Product Title */}
                <h3 className="text-sm font-notche font-bold text-zinc-950 leading-snug line-clamp-2 min-h-[2.4rem]">
                  {formData.name || "Untitled Product"}
                </h3>

                {/* Weight & Perk */}
                <div className="mt-1 flex items-center gap-1.5 text-zinc-600 text-xs font-medium">
                  <span>Weight: <strong className="text-zinc-950 font-numbers">{formData.weightGrams}g</strong></span>
                  <span>·</span>
                  <span className="text-emerald-700 font-bold">{formData.perk || "Free Vault Storage"}</span>
                </div>
              </div>

              {/* Price & Action Section */}
              <div className="mt-3 pt-3 border-t border-zinc-100">
                <div className="flex items-end justify-between gap-1 mb-2">
                  <div>
                    <span className="text-[9.5px] font-bold uppercase tracking-wider text-zinc-400 block font-notche">
                      {priceInfo.isAuto ? "LIVE SPOT PRICE" : "SHOWROOM DEAL PRICE"}
                    </span>
                    <span className="text-2xl font-numbers font-bold text-zinc-950 tracking-tight">
                      £{priceInfo.finalPrice.toFixed(2)}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[9px] text-zinc-400 font-semibold block">VAT Status</span>
                    <span className="text-[9.5px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      {formData.vatStatus || "0% VAT Exempt"}
                    </span>
                  </div>
                </div>

                {/* WhatsApp Button */}
                <div className="w-full py-2 rounded-xl bg-zinc-950 hover:bg-orange-600 text-white text-xs font-notche font-bold tracking-wider shadow-sm flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                  <svg className="w-3.5 h-3.5 fill-current shrink-0 text-orange-400" viewBox="0 0 24 24">
                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                  </svg>
                  <span>{formData.buttonText || "Inquire / Lock Price"}</span>
                </div>
              </div>
            </div>

            {/* Price Calculation Explainer Banner */}
            <div className="w-full mt-3 p-3 rounded-xl bg-white border border-zinc-200 text-[11px] text-zinc-600 space-y-1 shadow-xs">
              <div className="flex items-center justify-between font-bold text-zinc-900">
                <span className="flex items-center gap-1">
                  <span className="text-orange-500">⚡</span> Pricing Calculation:
                </span>
                <span className="font-numbers text-orange-600 font-bold">
                  {priceInfo.isAuto ? "Auto Live Sync" : "Manual Fixed"}
                </span>
              </div>
              <p className="text-[10.5px] leading-tight text-zinc-500">
                {priceInfo.isAuto
                  ? `Formula: ${formData.weightGrams}g × £${currentSpot.toFixed(2)}/g + ${(formData.premiumPercentage * 100).toFixed(1)}% Markup = £${priceInfo.finalPrice.toFixed(2)}`
                  : `Locked at custom showroom price £${formData.customPriceOverride}. Market rate changes won't affect this price.`}
              </p>
            </div>
          </div>

          {/* RIGHT COLUMN: EDIT PRODUCT FORM */}
          <div className="md:col-span-7 space-y-4 text-xs">
            
            {/* PRICING MODE SELECTOR */}
            <div className="p-3.5 rounded-2xl border border-zinc-200 bg-white space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-notche font-bold text-zinc-950 text-xs uppercase tracking-wide">
                  Pricing Mode & Auto Spot Sync
                </span>
                <span className="font-numbers text-[11px] text-orange-600 font-bold">
                  Live Spot: £{currentSpot.toFixed(2)}/g
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      priceMode: "auto",
                      customPriceOverride: undefined,
                    })
                  }
                  className={`py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    formData.priceMode !== "fixed"
                      ? "bg-zinc-950 text-white shadow-xs font-notche"
                      : "bg-zinc-100 text-zinc-700 border border-zinc-200 hover:bg-zinc-200"
                  }`}
                >
                  <span>⚡ Auto Spot Price</span>
                  <span className="text-[10px] bg-white/20 px-1 rounded font-normal">Auto</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      priceMode: "fixed",
                      customPriceOverride: formData.customPriceOverride || priceInfo.finalPrice,
                    })
                  }
                  className={`py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    formData.priceMode === "fixed"
                      ? "bg-orange-500 text-white shadow-xs font-notche"
                      : "bg-zinc-100 text-zinc-700 border border-zinc-200 hover:bg-zinc-200"
                  }`}
                >
                  <span>🔒 Fixed Deal Price</span>
                  <span className="text-[10px] bg-white/20 px-1 rounded font-normal">Fixed</span>
                </button>
              </div>

              {formData.priceMode === "fixed" ? (
                <div className="pt-1">
                  <label className="block font-bold text-zinc-700 mb-1">
                    Fixed Showroom Price (£ Override)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.customPriceOverride || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        customPriceOverride: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 text-sm rounded-xl border border-orange-500 bg-white font-numbers font-bold text-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    placeholder="e.g. 108.50"
                  />
                  <p className="text-[10px] text-zinc-400 mt-1">
                    To revert to auto dynamic price, click &quot;⚡ Auto Spot Price&quot; above.
                  </p>
                </div>
              ) : (
                <div className="pt-1 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-zinc-700 mb-1">
                      Markup / Premium % (e.g. 0.12 = 12%)
                    </label>
                    <input
                      type="number"
                      step="0.005"
                      value={formData.premiumPercentage}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          premiumPercentage: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-zinc-300 bg-white font-numbers font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-zinc-700 mb-1">Quick Markup Presets</label>
                    <div className="flex items-center gap-1">
                      {[0.03, 0.05, 0.07, 0.1, 0.12].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setFormData({ ...formData, premiumPercentage: pct })}
                          className={`flex-1 py-1 text-[10.5px] font-numbers font-bold rounded-lg border cursor-pointer transition-colors ${
                            formData.premiumPercentage === pct
                              ? "bg-zinc-950 text-white border-zinc-950"
                              : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100"
                          }`}
                        >
                          {(pct * 100).toFixed(0)}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* COMPANY / BRAND (MINT / MANUFACTURER) */}
            <div className="p-3.5 rounded-2xl border border-orange-200 bg-orange-50/50 space-y-2 shadow-xs">
              <div className="flex items-center justify-between">
                <label className="block font-bold text-zinc-900 uppercase text-[11px] flex items-center gap-1.5">
                  <span className="text-sm">🏢</span>
                  <span>Company / Brand / Mint</span>
                </label>
                <span className="text-[10px] text-orange-700 font-bold bg-white px-2 py-0.5 rounded-full border border-orange-200 uppercase">
                  Manufacturer
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <input
                    type="text"
                    value={formData.company || formData.refiner || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        company: e.target.value,
                        refiner: e.target.value,
                      })
                    }
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-300 bg-white font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    placeholder="e.g. PAMP Suisse, The Royal Mint"
                  />
                </div>

                <div>
                  <select
                    value={formData.company || formData.refiner || ""}
                    onChange={(e) => {
                      if (e.target.value) {
                        setFormData({
                          ...formData,
                          company: e.target.value,
                          refiner: e.target.value,
                        });
                      }
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 bg-white font-medium text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 cursor-pointer"
                  >
                    <option value="" disabled>Select Prestigious Mint / Company...</option>
                    <option value="PAMP Suisse">PAMP Suisse (Switzerland)</option>
                    <option value="The Royal Mint">The Royal Mint (United Kingdom)</option>
                    <option value="Valcambi">Valcambi (Switzerland)</option>
                    <option value="Metalor">Metalor (Switzerland)</option>
                    <option value="Bhai Jewellers">Bhai Jewellers (Bradford Showroom)</option>
                    <option value="Emirates Gold">Emirates Gold (Dubai)</option>
                    <option value="The Perth Mint">The Perth Mint (Australia)</option>
                    <option value="Umicore">Umicore (Belgium)</option>
                    <option value="Credit Suisse">Credit Suisse (Zurich)</option>
                    <option value="Heraeus">Heraeus (Germany)</option>
                  </select>
                </div>
              </div>
              <p className="text-[10.5px] text-zinc-500 leading-tight">
                Enter custom company/brand or choose from world LBMA-approved mints.
              </p>
            </div>

            {/* PRODUCT TITLE */}
            <div>
              <label className="block font-bold text-zinc-700 mb-1 uppercase text-[11px]">
                Product Title (Name)
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-medium text-zinc-900"
                placeholder="e.g. 1 Gram Minted Gold Bar"
              />
            </div>

            {/* WEIGHT & PURITY */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-zinc-700 mb-1 uppercase text-[11px]">
                  Weight (Grams) — Auto Updates Price
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={formData.weightGrams}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      weightGrams: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-zinc-300 bg-white font-numbers font-bold text-zinc-950 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-700 mb-1 uppercase text-[11px]">
                  Purity / Fineness
                </label>
                <input
                  type="text"
                  value={formData.purity}
                  onChange={(e) => setFormData({ ...formData, purity: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-zinc-900"
                  placeholder="e.g. 999.9 (24K) or 916.7 (22K)"
                />
              </div>
            </div>

            {/* IMAGE UPLOAD SECTION */}
            <div className="p-3.5 rounded-2xl border border-zinc-200 bg-white space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between">
                <label className="block font-bold text-zinc-800 uppercase text-[11px]">
                  Product Image (Upload from Computer or enter URL)
                </label>
                {isUploading && (
                  <span className="text-[10px] text-orange-600 font-bold animate-pulse flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-ping" />
                    Uploading...
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageFileChange}
                  accept="image/*"
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="px-4 py-2 rounded-xl bg-white border border-zinc-300 hover:bg-zinc-950 hover:text-white text-zinc-800 font-notche font-bold text-xs transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span>Choose Photo from Device</span>
                </button>

                <span className="text-[11px] text-zinc-400">or link:</span>

                <input
                  type="text"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  placeholder="/bullion/gold-bar-1g.webp"
                  className="flex-1 px-3 py-1.5 rounded-xl border border-zinc-300 bg-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
            </div>

            {/* REFINER / MINT & CERTIFICATION BADGE */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-zinc-700 mb-1 uppercase text-[11px]">
                  Refiner / Mint Text
                </label>
                <input
                  type="text"
                  value={formData.refiner}
                  onChange={(e) => setFormData({ ...formData, refiner: e.target.value, company: formData.company || e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-zinc-900"
                  placeholder="e.g. PAMP Suisse / Metalor"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-700 mb-1 uppercase text-[11px]">
                  Image Badge (on card)
                </label>
                <input
                  type="text"
                  value={formData.badge || ""}
                  onChange={(e) => setFormData({ ...formData, badge: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-zinc-900"
                  placeholder="e.g. LBMA Good Delivery"
                />
              </div>
            </div>

            {/* PERK / FEATURE TEXT & VAT STATUS */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-zinc-700 mb-1 uppercase text-[11px]">
                  Card Perk (Next to Weight)
                </label>
                <input
                  type="text"
                  value={formData.perk || ""}
                  onChange={(e) => setFormData({ ...formData, perk: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-zinc-900"
                  placeholder="e.g. Free Vault Storage"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-700 mb-1 uppercase text-[11px]">
                  VAT Exemption Status
                </label>
                <input
                  type="text"
                  value={formData.vatStatus || ""}
                  onChange={(e) => setFormData({ ...formData, vatStatus: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-zinc-900"
                  placeholder="e.g. 0% VAT Exempt"
                />
              </div>
            </div>

            {/* BUTTON TEXT & TYPE */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-zinc-700 mb-1 uppercase text-[11px]">
                  Action Button Label
                </label>
                <input
                  type="text"
                  value={formData.buttonText || ""}
                  onChange={(e) => setFormData({ ...formData, buttonText: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-zinc-900"
                  placeholder="Inquire / Lock Price"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-700 mb-1 uppercase text-[11px]">
                  Category Type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as "bar" | "coin" })}
                  className="w-full px-3.5 py-2 rounded-xl border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-zinc-900 cursor-pointer"
                >
                  <option value="bar">Bullion Bar</option>
                  <option value="coin">Bullion Coin</option>
                </select>
              </div>
            </div>

            {/* TOGGLES: IN STOCK & POPULAR */}
            <div className="flex items-center gap-6 pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.inStock !== false}
                  onChange={(e) => setFormData({ ...formData, inStock: e.target.checked })}
                  className="w-4 h-4 text-orange-500 rounded cursor-pointer accent-orange-500"
                />
                <span className="font-bold text-zinc-800">In Stock for Sale</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(formData.popular)}
                  onChange={(e) => setFormData({ ...formData, popular: e.target.checked })}
                  className="w-4 h-4 text-orange-500 rounded cursor-pointer accent-orange-500"
                />
                <span className="font-bold text-zinc-800">Best Seller / Popular Badge</span>
              </label>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 sm:px-7 py-3.5 border-t border-zinc-200 bg-white flex items-center justify-between shrink-0">
          <div className="text-xs text-zinc-600">
            <span>Price Result: </span>
            <strong className="font-numbers text-base text-zinc-950">
              £{priceInfo.finalPrice.toFixed(2)}
            </strong>
            <span className="ml-1 text-[11px] text-zinc-400">
              ({priceInfo.isAuto ? "Auto dynamic spot" : "Fixed showroom override"})
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-zinc-300 text-zinc-700 font-semibold text-xs hover:bg-zinc-50 cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSave(formData)}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-notche font-bold text-xs tracking-wider shadow-md shadow-orange-500/25 transition-all cursor-pointer"
            >
              {isNew ? "ADD PRODUCT" : "UPDATE PRODUCT CARD"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
