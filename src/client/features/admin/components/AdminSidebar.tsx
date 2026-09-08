import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import useAuth from "../auth/useAuth";
import DashboardSearch from "./DashboardSearch";

interface NavItem {
  label: string;
  path: string;
  badge?: number;
}

interface NavCategory {
  key: string;
  label: string;
  icon: React.ReactNode;
  items: NavItem[];
}

interface AdminSidebarProps {
  open: boolean;
  onClose: () => void;
}

function useBadgeCounts(accessToken: string) {
  const [urgentMementos, setUrgentMementos] = useState(0);
  const [pendingModeration, setPendingModeration] = useState(0);
  const [pendingProposals, setPendingProposals] = useState(0);
  const [unseenErrors, setUnseenErrors] = useState(0);

  useEffect(() => {
    if (!accessToken) return;

    fetch("/api/admin/mementos")
      .then((r) => r.json())
      .then((d) => {
        const threshold = new Date(Date.now() + 48 * 60 * 60 * 1000);
        const urgent = (d.mementos ?? []).filter(
          (m: { completed: boolean; dueDate: string }) =>
            !m.completed && new Date(m.dueDate) <= threshold
        ).length;
        setUrgentMementos(urgent);
      })
      .catch(() => {});

    const authHeader = { Authorization: `Bearer ${accessToken}` };

    fetch("/api/moderare/pending-count", { headers: authHeader })
      .then((r) => r.json())
      .then((d: { pendingCount?: number }) => setPendingModeration(d.pendingCount ?? 0))
      .catch(() => {});

    fetch("/api/inspiration-proposals/admin/pending-count", { headers: authHeader })
      .then((r) => r.json())
      .then((d: { pendingCount?: number }) => setPendingProposals(d.pendingCount ?? 0))
      .catch(() => {});

    fetch("/api/admin/monitoring/errors/unseen-count", { headers: authHeader })
      .then((r) => r.json())
      .then((d: { count?: number }) => setUnseenErrors(d.count ?? 0))
      .catch(() => {});
  }, [accessToken]);

  return { urgentMementos, pendingModeration, pendingProposals, unseenErrors, setUnseenErrors };
}

const AdminSidebar: React.FC<AdminSidebarProps> = ({ open, onClose }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { auth } = useAuth();
  const { urgentMementos, pendingModeration, pendingProposals, unseenErrors, setUnseenErrors } =
    useBadgeCounts(auth.accessToken);

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("admin-sidebar-expanded");
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set(["evenimente", "contracte"]);
    } catch {
      return new Set(["evenimente", "contracte"]);
    }
  });

  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("admin-sidebar-order");
      return saved ? JSON.parse(saved) as string[] : [];
    } catch {
      return [];
    }
  });

  const [customItems, setCustomItems] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem("admin-sidebar-items");
      return saved ? JSON.parse(saved) as Record<string, string[]> : {};
    } catch { return {}; }
  });

  // Category drag state
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // Item drag state
  const [draggedItem, setDraggedItem] = useState<{ path: string; fromCategory: string } | null>(null);
  const [itemDragOverPath, setItemDragOverPath] = useState<string | null>(null);
  const [itemDragOverCategory, setItemDragOverCategory] = useState<string | null>(null);

  const toggleCategory = (key: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem("admin-sidebar-expanded", JSON.stringify([...next]));
      return next;
    });
  };

  // ── Category drag ──────────────────────────────────────────────────────────
  const handleCategoryDragStart = (key: string) => { if (draggedItem) return; setDraggedKey(key); };
  const handleCategoryDragOver = (e: React.DragEvent, key: string) => {
    if (draggedItem) return;
    e.preventDefault();
    if (key !== draggedKey) setDragOverKey(key);
  };
  const handleCategoryDrop = (targetKey: string) => {
    if (draggedItem || !draggedKey || draggedKey === targetKey) { setDraggedKey(null); setDragOverKey(null); return; }
    setCategoryOrder((prev) => {
      const base = prev.length > 0 ? prev : allCategories.map((c) => c.key);
      const next = [...base];
      const fromIndex = next.indexOf(draggedKey);
      const toIndex = next.indexOf(targetKey);
      if (fromIndex === -1 || toIndex === -1) return prev;
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, draggedKey);
      localStorage.setItem("admin-sidebar-order", JSON.stringify(next));
      return next;
    });
    setDraggedKey(null);
    setDragOverKey(null);
  };
  const handleCategoryDragEnd = () => { setDraggedKey(null); setDragOverKey(null); };

  // ── Item drag ──────────────────────────────────────────────────────────────
  const handleItemDragStart = (e: React.DragEvent, path: string, fromCategory: string) => {
    e.stopPropagation();
    setDraggedItem({ path, fromCategory });
  };
  const handleItemDragOver = (e: React.DragEvent, targetPath: string, targetCategoryKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    setItemDragOverPath(targetPath);
    setItemDragOverCategory(targetCategoryKey);
  };
  const handleItemDropOnItem = (targetPath: string, targetCategoryKey: string, allCats: NavCategory[]) => {
    if (!draggedItem) return;
    setCustomItems((prev) => {
      const next = { ...prev };
      const getEffective = (catKey: string): string[] => {
        if (next[catKey]) return [...next[catKey]];
        return (allCats.find((c) => c.key === catKey)?.items ?? []).map((i) => i.path);
      };

      // Remove from source
      const srcItems = getEffective(draggedItem.fromCategory).filter((p) => p !== draggedItem.path);
      next[draggedItem.fromCategory] = srcItems;

      // Insert into target before targetPath
      const tgtItems = getEffective(targetCategoryKey).filter((p) => p !== draggedItem.path);
      const insertAt = tgtItems.indexOf(targetPath);
      tgtItems.splice(insertAt === -1 ? tgtItems.length : insertAt, 0, draggedItem.path);
      next[targetCategoryKey] = tgtItems;

      localStorage.setItem("admin-sidebar-items", JSON.stringify(next));
      return next;
    });
    setDraggedItem(null); setItemDragOverPath(null); setItemDragOverCategory(null);
  };
  const handleItemDropOnCategory = (targetCategoryKey: string, allCats: NavCategory[]) => {
    if (!draggedItem || draggedItem.fromCategory === targetCategoryKey) {
      setDraggedItem(null); setItemDragOverPath(null); setItemDragOverCategory(null);
      return;
    }
    setCustomItems((prev) => {
      const next = { ...prev };
      const getEffective = (catKey: string): string[] => {
        if (next[catKey]) return [...next[catKey]];
        return (allCats.find((c) => c.key === catKey)?.items ?? []).map((i) => i.path);
      };
      next[draggedItem.fromCategory] = getEffective(draggedItem.fromCategory).filter((p) => p !== draggedItem.path);
      const tgtItems = getEffective(targetCategoryKey).filter((p) => p !== draggedItem.path);
      tgtItems.push(draggedItem.path);
      next[targetCategoryKey] = tgtItems;
      localStorage.setItem("admin-sidebar-items", JSON.stringify(next));
      return next;
    });
    setDraggedItem(null); setItemDragOverPath(null); setItemDragOverCategory(null);
  };
  const handleItemDragEnd = () => { setDraggedItem(null); setItemDragOverPath(null); setItemDragOverCategory(null); };

  const isEstera = auth.role === "estera";

  const allCategories: NavCategory[] = [
    {
      key: "evenimente",
      label: "Evenimente",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
      items: [
        { label: "Calendar", path: "/admin/calendar" },
        { label: "Mementouri", path: "/admin/mementos", badge: urgentMementos },
        { label: "Moderare albume", path: "/admin/moderare", badge: pendingModeration },
      ],
    },
    {
      key: "contracte",
      label: "Oferte",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
      items: [
        { label: "Contracte", path: "/admin/contracts" },
        { label: "Procese Verbale", path: "/admin/handover" },
        { label: "Oferte", path: "/admin/oferte" },
        { label: "Template Oferte", path: "/admin/template-oferte" },
      ],
    },
    {
      key: "media",
      label: "Media",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
        </svg>
      ),
      items: [
        { label: "Propuneri Media", path: "/admin/instagram-proposals", badge: pendingProposals },
        { label: "Swipe Test", path: "/admin/swipe-proposals" },
        { label: "Media Assets", path: "/admin/media-assets" },
        { label: "QR Moments", path: "/admin/qr-moments" },
        { label: "Activitate album", path: "/admin/media-activity" },
        { label: "Optimizare poze", path: "/admin/image-optimizer" },
        { label: "Albume", path: "/admin/album-health" },
      ],
    },
    {
      key: "financiar",
      label: "Financiar",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
      items: [
        { label: "Rezumat financiar", path: "/admin/financial" },
        { label: "Extrase bancare", path: "/admin/bank-statements" },
        { label: "Detalii bancare", path: "/admin/bank-details" },
      ],
    },
    {
      key: "marketing",
      label: "Marketing & Web",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      ),
      items: [
        { label: "Campanii", path: "/admin/campanii" },
        { label: "Colecții poze", path: "/admin/colectii" },
        { label: "Generator SEO", path: "/admin/seo-generator" },
        { label: "SEO Radar", path: "/admin/seo-radar" },
        { label: "Pagini SEO", path: "/admin/seo-pages" },
        { label: "Blog", path: "/admin/blog" },
        { label: "Inspirație", path: "/admin/inspiration" },
        { label: "Zone Showcase", path: "/admin/showcase" },
        { label: "Analytics", path: "/admin/analytics" },
        { label: "Vizitatori live", path: "/admin/live" },
      ],
    },
    {
      key: "sistem",
      label: "Sistem",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
      items: [
        { label: "Conturi", path: "/admin/accounts" },
        { label: "Wedding Hub", path: "/admin/wedding-hub" },
        { label: "Erori server", path: "/admin/errors", badge: unseenErrors },
      ],
    },
  ];

  const getEffectiveItems = (categoryKey: string, defaultItems: NavItem[]): NavItem[] => {
    const customPaths = customItems[categoryKey];
    if (!customPaths) return defaultItems;
    const allItems = allCategories.flatMap((c) => c.items);
    return customPaths.map((path) => allItems.find((item) => item.path === path)).filter((item): item is NavItem => item !== undefined);
  };

  const ESTERA_PATHS = new Set(["/admin/instagram-proposals", "/admin/sanatate"]);

  const sortedCategories = categoryOrder.length > 0
    ? [...allCategories].sort((a, b) => {
        const ai = categoryOrder.indexOf(a.key);
        const bi = categoryOrder.indexOf(b.key);
        const aIdx = ai === -1 ? allCategories.findIndex((c) => c.key === a.key) : ai;
        const bIdx = bi === -1 ? allCategories.findIndex((c) => c.key === b.key) : bi;
        return aIdx - bIdx;
      })
    : allCategories;

  const categories: NavCategory[] = isEstera
    ? sortedCategories
        .map((cat) => ({ ...cat, items: cat.items.filter((item) => ESTERA_PATHS.has(item.path)) }))
        .filter((cat) => cat.items.length > 0)
    : sortedCategories;

  const handleNavItem = (path: string) => {
    navigate(path);
    onClose();
  };

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + "/");

  const totalBadge = (items: NavItem[]) =>
    items.reduce((sum, item) => sum + (item.badge ?? 0), 0);

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 flex h-screen w-60 flex-col bg-neutral-950 border-r border-neutral-800 transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-neutral-800">
          <button
            onClick={() => { navigate("/admin"); onClose(); }}
            className="flex items-center gap-2 text-white hover:text-neutral-300 transition-colors"
          >
            <span className="text-sm font-semibold tracking-wide">Anca Visuals</span>
          </button>
          <button
            onClick={onClose}
            className="lg:hidden text-neutral-500 hover:text-white transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Dashboard + Health Tracker links */}
        {!isEstera && (
          <div className="px-3 pt-3 space-y-0.5">
            <button
              onClick={() => handleNavItem("/admin")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                location.pathname === "/admin"
                  ? "bg-violet-500/15 text-violet-400"
                  : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <span>Dashboard</span>
            </button>
            <div className="px-1 pt-1.5">
              <DashboardSearch onNavigate={onClose} />
            </div>
          </div>
        )}

        {/* Separator */}
        <div className="mx-3 my-2 border-t border-neutral-800" />

        {/* Categories */}
        <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-0.5 scrollbar-none">
          {categories.map((category) => {
            const effectiveItems = getEffectiveItems(category.key, category.items);
            const isExpanded = expandedCategories.has(category.key);
            const categoryBadge = totalBadge(effectiveItems);
            const hasActiveChild = effectiveItems.some((item) => isActive(item.path));
            const isCategoryDragging = draggedKey === category.key;
            const isCategoryDragOver = dragOverKey === category.key && !draggedItem;
            const isItemDragOverCategory = itemDragOverCategory === category.key && draggedItem && !itemDragOverPath;

            return (
              <div
                key={category.key}
                draggable={!draggedItem}
                onDragStart={() => handleCategoryDragStart(category.key)}
                onDragOver={(e) => {
                  if (draggedItem) {
                    e.preventDefault();
                    e.stopPropagation();
                    setItemDragOverCategory(category.key);
                    setItemDragOverPath(null);
                  } else {
                    handleCategoryDragOver(e, category.key);
                  }
                }}
                onDrop={() => {
                  if (draggedItem) handleItemDropOnCategory(category.key, allCategories);
                  else handleCategoryDrop(category.key);
                }}
                onDragEnd={() => { handleCategoryDragEnd(); handleItemDragEnd(); }}
                className={`rounded-lg transition-all ${isCategoryDragging ? "opacity-30" : ""} ${isCategoryDragOver ? "ring-1 ring-neutral-600 bg-neutral-800/40" : ""} ${isItemDragOverCategory ? "ring-1 ring-violet-500/40 bg-violet-500/5" : ""}`}
              >
                <button
                  onClick={() => toggleCategory(category.key)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium uppercase tracking-wider transition-colors ${
                    hasActiveChild ? "text-white" : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-700 hover:text-neutral-500 cursor-grab active:cursor-grabbing shrink-0">
                      <svg width="10" height="10" viewBox="0 0 10 14" fill="currentColor">
                        <circle cx="2" cy="2" r="1.2"/><circle cx="8" cy="2" r="1.2"/>
                        <circle cx="2" cy="7" r="1.2"/><circle cx="8" cy="7" r="1.2"/>
                        <circle cx="2" cy="12" r="1.2"/><circle cx="8" cy="12" r="1.2"/>
                      </svg>
                    </span>
                    {category.icon}
                    <span>{category.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {categoryBadge > 0 && !isExpanded && (
                      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold">
                        {categoryBadge}
                      </span>
                    )}
                    <svg
                      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      className={`transition-transform duration-150 ${isExpanded ? "rotate-180" : ""}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </button>

                {isExpanded && (
                  <div className="mt-0.5 mb-1 ml-2 pl-3 border-l border-neutral-800 space-y-0.5">
                    {effectiveItems.map((item) => {
                      const active = isActive(item.path);
                      const isItemDragging = draggedItem?.path === item.path;
                      const isItemOver = itemDragOverPath === item.path && draggedItem?.path !== item.path;
                      return (
                        <div key={item.path} className="relative">
                          {isItemOver && (
                            <div className="absolute top-0 left-0 right-0 h-0.5 bg-violet-500 rounded-full -translate-y-px z-10" />
                          )}
                          <div
                            draggable
                            onDragStart={(e) => handleItemDragStart(e, item.path, category.key)}
                            onDragOver={(e) => handleItemDragOver(e, item.path, category.key)}
                            onDrop={(e) => { e.stopPropagation(); handleItemDropOnItem(item.path, category.key, allCategories); }}
                            onDragEnd={handleItemDragEnd}
                            className={`group flex items-center gap-1.5 transition-all ${isItemDragging ? "opacity-30" : ""}`}
                          >
                            <span className="text-neutral-700 group-hover:text-neutral-500 cursor-grab active:cursor-grabbing shrink-0 pl-0.5">
                              <svg width="8" height="10" viewBox="0 0 8 12" fill="currentColor">
                                <circle cx="1.5" cy="1.5" r="1"/><circle cx="6.5" cy="1.5" r="1"/>
                                <circle cx="1.5" cy="6" r="1"/><circle cx="6.5" cy="6" r="1"/>
                                <circle cx="1.5" cy="10.5" r="1"/><circle cx="6.5" cy="10.5" r="1"/>
                              </svg>
                            </span>
                            <button
                              onClick={() => handleNavItem(item.path)}
                              className={`flex-1 flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors ${
                                active
                                  ? "bg-violet-500/15 text-violet-400"
                                  : "text-neutral-400 hover:bg-neutral-800/80 hover:text-white"
                              }`}
                            >
                              <span>{item.label}</span>
                              {item.badge != null && item.badge > 0 && (
                                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold">
                                  {item.badge}
                                </span>
                              )}
                            </button>
                            {item.path === "/admin/errors" && (
                              <button
                                title="Șterge toate erorile"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  fetch("/api/admin/monitoring/errors", { method: "DELETE" })
                                    .then(() => setUnseenErrors(0))
                                    .catch(() => {});
                                }}
                                className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-neutral-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer — new event button */}
        {!isEstera && (
          <div className="px-3 pb-4 border-t border-neutral-800 pt-3">
            <button
              onClick={() => handleNavItem("/admin/create-event")}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/15 text-emerald-400 text-sm font-medium hover:bg-emerald-500/25 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Eveniment nou
            </button>
          </div>
        )}
      </aside>
    </>
  );
};

export default AdminSidebar;
