import { useAuth } from "@/_core/hooks/useAuth";
import { useDeviceHeartbeat } from "@/hooks/useDeviceHeartbeat";
import { useSSE, type SSEConnectionStatus } from "@/hooks/useSSE";
import { SSEStatusBadge } from "@/components/SSEStatusBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/useMobile";
import { TrialPhaseBanner, TrialPhaseTopbarIcon, SubscriptionGate } from "@/components/SubscriptionGate";
import { useNav } from "@/hooks/useNav";
import {
  LayoutDashboard, Store, Users, MessageSquare, Megaphone, Star, FileText,
  Receipt, Image, LogOut, PanelLeft, ChevronDown, Gift, CreditCard, User,
  BarChart3, Package, Settings, Puzzle, UserPlus, PenTool, UtensilsCrossed,
  ClipboardList, Shield, Activity, Monitor, ScrollText, TrendingUp, Users2,
  DollarSign, Target, ChefHat, GlassWater, CalendarDays, Truck, ShoppingBag,
  Tag, BarChart2, Warehouse, Printer, Wallet, Calculator, FileSpreadsheet,
  Ban, Utensils, Clock, QrCode, ShoppingCart, Layers, Flame, Home, Menu, X,
  BookOpen, Leaf, Globe, Palmtree, Sparkles, ArrowLeftRight, Download,
} from "lucide-react";
import React, { CSSProperties, useEffect, useRef, useState, useCallback } from "react";
import { AIChatWidget } from "./AIChatWidget";
import { UserSwitcherOverlay } from "./UserSwitcherOverlay";
import { useWaiterPin } from "@/contexts/WaiterPinContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { LANGUAGES } from "@/lib/i18n";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { AdminSetupWizard } from "./AdminSetupWizard";
import { trpc } from "@/lib/trpc";
import type { NavItem } from "../../../shared/navConfig";

const LOGO_URL = "/manus-storage/simplapos-logo-original_997aecc9.png";

// Heartbeat-Hook: sendet alle 30s einen Ping an den Server
// Damit sieht der Admin unter "Geräte & Hardware" welche Geräte online sind
function HeartbeatProvider() {
  useDeviceHeartbeat();
  return null;
}

// SSEMonitorProvider: verbindet sich mit SSE und meldet den Status nach oben
function SSEMonitorProvider({
  restaurantId,
  onStatus,
}: {
  restaurantId: number | null | undefined;
  onStatus: (s: SSEConnectionStatus, r: number) => void;
}) {
  const { status, retryCount } = useSSE(restaurantId, { channels: ["all"] });
  const prevRef = useRef({ status: "disconnected" as SSEConnectionStatus, retryCount: 0 });
  useEffect(() => {
    if (prevRef.current.status !== status || prevRef.current.retryCount !== retryCount) {
      prevRef.current = { status, retryCount };
      onStatus(status, retryCount);
    }
  }, [status, retryCount, onStatus]);
  return null;
}

// ─── ICON REGISTRY ────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Store, Users, MessageSquare, Megaphone, Star, FileText,
  Receipt, Image, LogOut, Gift, CreditCard, User, BarChart3, Package,
  Settings, Puzzle, UserPlus, PenTool, UtensilsCrossed, ClipboardList, Shield,
  Activity, Monitor, ScrollText, TrendingUp, Users2, DollarSign, Target,
  ChefHat, GlassWater, CalendarDays, Truck, ShoppingBag, Tag, BarChart2,
  Warehouse, Printer, Wallet, Calculator, FileSpreadsheet, Ban, Utensils,
  Clock, QrCode, ShoppingCart, Layers, Flame, Home,
  BookOpen, Leaf, Globe, Palmtree, Sparkles, ArrowLeftRight,
};

function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? LayoutDashboard;
  return <Icon className={className} />;
}

/** Sprach-Umschalter als DropdownMenu-Einträge */
function LanguageSwitcherItems() {
  const { lang, setLang } = useLanguage();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={(e) => { e.preventDefault(); setOpen(o => !o); }}
        className="cursor-pointer justify-between"
      >
        <span className="flex items-center gap-2">
          <Globe className="h-4 w-4" />
          <span>Sprache / Language</span>
        </span>
        <span className="text-xs text-muted-foreground">
          {LANGUAGES.find(l => l.code === lang)?.flag} {LANGUAGES.find(l => l.code === lang)?.nativeName}
        </span>
      </DropdownMenuItem>
      {open && LANGUAGES.map(l => (
        <DropdownMenuItem
          key={l.code}
          onSelect={(e) => { e.preventDefault(); setLang(l.code); setOpen(false); }}
          className={`cursor-pointer pl-8 ${lang === l.code ? "font-semibold text-primary" : ""}`}
        >
          <span className="mr-2">{l.flag}</span>
          <span>{l.nativeName}</span>
          {lang === l.code && <span className="ml-auto text-xs text-primary">✓</span>}
        </DropdownMenuItem>
      ))}
    </>
  );
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const SIDEBAR_WIDTH_KEY = "sidebar-width";
const COLLAPSED_GROUPS_KEY = "sidebar-collapsed-groups";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;
const ICON_ONLY_WIDTH = 56;

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Superadmin",
  partner: "Partner",
  admin: "Admin",
  manager: "Manager",
  kellner: "Kellner",
  koch: "Küche",
  bar: "Bar",
  barkeeper: "Bar",
  buchhalter: "Treuhand",
  gast: "Gast",
  user: "Benutzer",
};

// ─── SIDEBAR NAV (stabile externe Komponente – kein Re-Mount bei State-Updates) ──
type SidebarNavProps = {
  onNavigate: (path: string) => void;
  onClose: () => void;
  onToggleCollapse: () => void;
  isMobile: boolean;
  isKellnerRole: boolean;
  isCollapsed: boolean;
  navGroups: ReturnType<typeof useNav>["navGroups"];
  collapsedGroups: Set<string>;
  toggleGroup: (group: string) => void;
  location: string;
  activeNavRef: React.RefObject<HTMLButtonElement | null>;
  navScrollRef: React.RefObject<HTMLDivElement | null>;
  sseStatus: SSEConnectionStatus;
  sseRetryCount: number;
  user: any;
  activeWaiter: any;
  logout: () => void;
  waiterLogout: () => void;
  setUserSwitcherOpen: (v: boolean) => void;
  displayName: string;
  roleLabel: string;
  initials: string;
};

const SidebarNav = React.memo(function SidebarNav({
  onNavigate, onClose, onToggleCollapse,
  isMobile, isKellnerRole, isCollapsed,
  navGroups, collapsedGroups, toggleGroup,
  location, activeNavRef, navScrollRef,
  sseStatus, sseRetryCount,
  user, activeWaiter, logout, waiterLogout,
  setUserSwitcherOpen, displayName, roleLabel, initials,
}: SidebarNavProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--sidebar)",
        color: "var(--sidebar-foreground)",
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 64,
          borderBottom: "1px solid var(--sidebar-border)",
          padding: "0 12px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
        }}
      >
        {isMobile || isKellnerRole ? (
          <>
            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, display: "flex", alignItems: "center",
                justifyContent: "center", borderRadius: 8, border: "none",
                background: "transparent", cursor: "pointer", flexShrink: 0,
                color: "var(--sidebar-foreground)",
              }}
              aria-label="Menü schliessen"
            >
              <X style={{ width: 18, height: 18 }} />
            </button>
            <img src={LOGO_URL} alt="Simplapos" style={{ height: 28, width: "auto", objectFit: "contain", filter: "brightness(0) invert(1)" }} />
          </>
        ) : (
          <>
            <button
              onClick={onToggleCollapse}
              style={{
                width: 32, height: 32, display: "flex", alignItems: "center",
                justifyContent: "center", borderRadius: 8, border: "none",
                background: "transparent", cursor: "pointer", flexShrink: 0,
                color: "var(--sidebar-foreground)",
              }}
              aria-label="Navigation umschalten"
            >
              <PanelLeft style={{ width: 16, height: 16, opacity: 0.6 }} />
            </button>
            {!isCollapsed && (
              <img src={LOGO_URL} alt="Simplapos" style={{ height: 28, width: "auto", objectFit: "contain", filter: "brightness(0) invert(1)" }} />
            )}
          </>
        )}
      </div>

      {/* Scrollable nav */}
      <div
        ref={navScrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "8px 0",
          scrollbarWidth: "thin",
          scrollbarColor: "var(--sidebar-border) transparent",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          touchAction: "pan-y",
          boxSizing: "border-box",
        }}
      >
        {!isMobile && !isKellnerRole && !isCollapsed && (
          <div style={{ padding: "4px 10px 8px 10px" }}>
            <TrialPhaseTopbarIcon sidebarMode />
          </div>
        )}
        {navGroups.map((group) => {
          const isGroupCollapsed = collapsedGroups.has(group.group);
          return (
            <div key={group.group} style={{ display: "block" }}>
              {!isCollapsed && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.group)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "14px 16px 5px 16px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    boxSizing: "border-box",
                  }}
                  aria-expanded={!isGroupCollapsed}
                >
                  <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--sidebar-foreground)",
                    opacity: 0.45,
                    lineHeight: 1,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}>
                    {group.group}
                  </span>
                  <ChevronDown
                    style={{
                      width: 12,
                      height: 12,
                      color: "var(--sidebar-foreground)",
                      opacity: 0.4,
                      transform: isGroupCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                      transition: "transform 0.2s",
                      flexShrink: 0,
                    }}
                  />
                </button>
              )}
              {!isGroupCollapsed && (
                <div style={{ display: "block", padding: "0 6px 2px 6px" }}>
                  {group.items.map((item: NavItem) => {
                    const isActive = location === item.path || location.startsWith(item.path + "/");
                    return (
                      <button
                        key={item.id}
                        ref={isActive ? activeNavRef : undefined}
                        type="button"
                        onClick={() => onNavigate(item.path)}
                        title={isCollapsed ? item.label : undefined}
                        aria-current={isActive ? "page" : undefined}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          width: "100%",
                          minHeight: isMobile ? 50 : 40,
                          padding: isCollapsed ? "0" : "0 10px",
                          paddingLeft: isCollapsed ? 0 : 10,
                          paddingRight: isCollapsed ? 0 : 10,
                          justifyContent: isCollapsed ? "center" : "flex-start",
                          borderRadius: 8,
                          border: "none",
                          cursor: "pointer",
                          background: isActive ? "var(--sidebar-primary)" : "transparent",
                          color: isActive ? "var(--sidebar-primary-foreground)" : "var(--sidebar-foreground)",
                          fontWeight: isActive ? 500 : 400,
                          fontSize: 14,
                          textAlign: "left",
                          transition: "background 0.12s, color 0.12s",
                          boxSizing: "border-box",
                          overflow: "hidden",
                          marginBottom: 1,
                        }}
                      >
                        <span style={{ flexShrink: 0, minWidth: 16, display: "flex", alignItems: "center" }}><NavIcon name={item.icon} className="h-4 w-4" /></span>
                        {!isCollapsed && (
                          <span style={{
                            fontSize: 14,
                            lineHeight: "1.2",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            flex: 1,
                            minWidth: 0,
                          }}>
                            {item.label}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer with user */}
      <div
        style={{
          borderTop: "1px solid var(--sidebar-border)",
          padding: "8px 6px",
          flexShrink: 0,
        }}
      >
        {sseStatus !== "connected" && (
          <div style={{ marginBottom: 4 }}>
            <SSEStatusBadge status={sseStatus} retryCount={sseRetryCount} />
          </div>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                minHeight: 48,
                padding: isCollapsed ? "0" : "6px 8px",
                justifyContent: isCollapsed ? "center" : "flex-start",
                borderRadius: 8,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                boxSizing: "border-box",
                overflow: "hidden",
                color: "var(--sidebar-foreground)",
              }}
            >
              <Avatar style={{ width: 32, height: 32, flexShrink: 0 }}>
                <AvatarImage src={(user as any)?.avatarUrl} />
                <AvatarFallback style={{ fontSize: 11, fontWeight: 600, background: "var(--sidebar-primary)", color: "var(--sidebar-primary-foreground)" }}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1, marginBottom: 3, color: "var(--sidebar-foreground)" }}>
                      {displayName}
                    </p>
                    <p style={{ fontSize: 11, opacity: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1, color: "var(--sidebar-foreground)" }}>
                      {roleLabel}
                    </p>
                  </div>
                  <ChevronDown style={{ width: 14, height: 14, opacity: 0.4, flexShrink: 0, color: "var(--sidebar-foreground)" }} />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-52">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{displayName}</p>
              {!activeWaiter && <p className="text-xs text-muted-foreground">{user?.email}</p>}
              <p className="text-xs text-muted-foreground mt-0.5">{roleLabel}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onNavigate("/profile")}
              className="cursor-pointer"
            >
              <User className="mr-2 h-4 w-4" />
              <span>Mein Profil</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onNavigate("/install")}
              className="cursor-pointer"
            >
              <Download className="mr-2 h-4 w-4" />
              <span>App installieren</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {!isKellnerRole && !activeWaiter && (
              <DropdownMenuItem
                onClick={() => setUserSwitcherOpen(true)}
                className="cursor-pointer"
              >
                <ArrowLeftRight className="mr-2 h-4 w-4" />
                <span>Als Kellner einloggen</span>
              </DropdownMenuItem>
            )}
            {activeWaiter && (
              <DropdownMenuItem
                onClick={waiterLogout}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Kellner abmelden</span>
              </DropdownMenuItem>
            )}
            <LanguageSwitcherItems />
            <DropdownMenuSeparator />
            {!activeWaiter && (
              <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Abmelden</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
});

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      // Redirect unauthenticated visitors to the landing page
      const timer = setTimeout(() => setLocation("/landing"), 100);
      return () => clearTimeout(timer);
    }
  }, [loading, user, setLocation]);

  if (loading || (!loading && !user)) return <DashboardLayoutSkeleton />;
  return <DashboardLayoutWithWizard>{children}</DashboardLayoutWithWizard>;
}

// ─── WIZARD WRAPPER ───────────────────────────────────────────────────────────
function DashboardLayoutWithWizard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  return (
    <>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
      {isAdmin && <AdminSetupWizard />}
    </>
  );
}

// ─── LAYOUT CONTENT ───────────────────────────────────────────────────────────
function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { activeWaiter, logout: waiterLogout } = useWaiterPin();
  const [sseStatus, setSseStatus] = useState<SSEConnectionStatus>("disconnected");
  const [sseRetryCount, setSseRetryCount] = useState(0);
  const handleSseStatus = useCallback((s: SSEConnectionStatus, r: number) => {
    setSseStatus(s);
    setSseRetryCount(r);
  }, []);
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();

  // Sidebar state
  // Kellner-Rolle: Sidebar immer als Drawer (kein festes Desktop-Panel)
  // WICHTIG: Auch PIN-Kellner (activeWaiter gesetzt) bekommen das Kellner-Layout
  const isKellnerRole = user?.role === "kellner" || !!activeWaiter;
  const [userSwitcherOpen, setUserSwitcherOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false); // Kellner-Drawer (Desktop + Mobile)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });

  // Collapsible groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(COLLAPSED_GROUPS_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  // Save sidebar width
  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  // Close mobile sidebar on navigation
  const navigate = useCallback((path: string) => {
    setLocation(path);
    setMobileOpen(false);
    setDrawerOpen(false);
  }, [setLocation]);

  // Kein Body-Lock noetig: Drawer ist position:fixed, scrollt unabhaengig vom Body

  // Swipe-to-close state
  const swipeTouchStartX = useRef<number | null>(null);
  const swipeTouchStartY = useRef<number | null>(null);
  const swipeTranslateX = useRef(0);
  const [swipeDelta, setSwipeDelta] = useState(0);

  const handleSwipeTouchStart = useCallback((e: React.TouchEvent) => {
    swipeTouchStartX.current = e.touches[0].clientX;
    swipeTouchStartY.current = e.touches[0].clientY;
    swipeTranslateX.current = 0;
    setSwipeDelta(0);
  }, []);

  const handleSwipeTouchMove = useCallback((e: React.TouchEvent) => {
    if (swipeTouchStartX.current === null || swipeTouchStartY.current === null) return;
    const dx = e.touches[0].clientX - swipeTouchStartX.current;
    const dy = e.touches[0].clientY - swipeTouchStartY.current;
    // Nur horizontale Swipes verarbeiten (nicht vertikales Scrollen stören)
    if (Math.abs(dy) > Math.abs(dx) * 1.5) return;
    if (dx < 0) {
      swipeTranslateX.current = dx;
      setSwipeDelta(dx);
    }
  }, []);

  const handleSwipeTouchEnd = useCallback(() => {
    const drawerWidth = Math.min(DEFAULT_WIDTH, window.innerWidth * 0.85);
    if (swipeTranslateX.current < -drawerWidth * 0.35) {
      setMobileOpen(false);
      setDrawerOpen(false);
    }
    swipeTouchStartX.current = null;
    swipeTouchStartY.current = null;
    swipeTranslateX.current = 0;
    setSwipeDelta(0);
  }, []);

  // ScrollIntoView ref for active nav item
  const activeNavRef = useRef<HTMLButtonElement | null>(null);
  const navScrollRef = useRef<HTMLDivElement | null>(null);
  // Scroll active item into view when drawer opens
  useEffect(() => {
    const isOpen = mobileOpen || drawerOpen;
    if (!isOpen) return;
    const timer = setTimeout(() => {
      if (activeNavRef.current && navScrollRef.current) {
        activeNavRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }, 120); // kurze Verzögerung damit der Drawer fertig animiert
    return () => clearTimeout(timer);
  }, [mobileOpen, drawerOpen]);

  // Resize logic
  const isResizing = useRef(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const startResize = useCallback(() => {
    if (isCollapsed) return;
    isResizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const { navGroups, mobileBottomTabs } = useNav();
  const showBottomTabs = isMobile && mobileBottomTabs.length > 0;

  // Bei aktivem PIN-Kellner: Kellner-Name und -Rolle anzeigen statt Admin-Daten
  const displayName = activeWaiter ? activeWaiter.name : (user?.name ?? "Benutzer");
  const displayRole = activeWaiter ? "kellner" : (user?.role ?? "user");
  const initials = displayName
    ? displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "SA";
  const roleLabel = ROLE_LABELS[displayRole] ?? "Benutzer";

  const activeLabel = navGroups
    .flatMap((g) => g.items)
    .find((item) => location === item.path || location.startsWith(item.path + "/"))?.label ?? "Menü";

  const currentWidth = isCollapsed ? ICON_ONLY_WIDTH : sidebarWidth;

  // ── Gemeinsame Props für die externe SidebarNav-Komponente ──
  const sidebarNavProps: SidebarNavProps = {
    onNavigate: navigate,
    onClose: () => { setMobileOpen(false); setDrawerOpen(false); },
    onToggleCollapse: () => setIsCollapsed((c) => !c),
    isMobile,
    isKellnerRole,
    isCollapsed,
    navGroups,
    collapsedGroups,
    toggleGroup,
    location,
    activeNavRef,
    navScrollRef,
    sseStatus,
    sseRetryCount,
    user,
    activeWaiter,
    logout,
    waiterLogout,
    setUserSwitcherOpen,
    displayName,
    roleLabel,
    initials,
  };


  return (
    <div style={{ display: "flex", height: "100dvh", overflow: "hidden", background: "var(--background)" }}>

      {/* ── KELLNER DRAWER OVERLAY (Desktop + Mobile) ── */}
      {isKellnerRole && drawerOpen && (
        <>
          {/* Backdrop rechts vom Drawer */}
          <div
            onClick={() => setDrawerOpen(false)}
            style={{
              position: "fixed", top: 0, bottom: 0,
              left: Math.min(DEFAULT_WIDTH, (typeof window !== "undefined" ? window.innerWidth : 320) * 0.85),
              right: 0,
              background: "rgba(0,0,0,0.5)",
              zIndex: 49,
            }}
          />
          {/* Drawer – Kellner */}
          <div
            onTouchStart={handleSwipeTouchStart}
            onTouchMove={handleSwipeTouchMove}
            onTouchEnd={handleSwipeTouchEnd}
            style={{
              position: "fixed", top: 0, left: 0,
              width: Math.min(DEFAULT_WIDTH, (typeof window !== "undefined" ? window.innerWidth : 320) * 0.85),
              height: "100dvh",
              zIndex: 50,
              boxShadow: "4px 0 24px rgba(0,0,0,0.15)",
              background: "var(--sidebar)",
              display: "flex", flexDirection: "column",
              overflow: "visible",
              transform: swipeDelta < 0 ? `translateX(${swipeDelta}px)` : undefined,
              transition: swipeDelta === 0 ? "transform 0.25s ease" : "none",
            }}
          >
            <SidebarNav {...sidebarNavProps} />
          </div>
        </>
      )}

      {/* ── DESKTOP SIDEBAR ── */}
      {!isMobile && !isKellnerRole && (
        <div
          ref={sidebarRef}
          style={{
            width: currentWidth,
            minWidth: currentWidth,
            maxWidth: currentWidth,
            height: "100%",
            position: "relative",
            flexShrink: 0,
            overflow: "hidden",
            transition: isCollapsed ? "width 0.2s ease" : undefined,
          }}
        >
          <SidebarNav {...sidebarNavProps} />
          {/* Resize handle */}
          {!isCollapsed && (
            <div
              onMouseDown={startResize}
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: 4,
                height: "100%",
                cursor: "col-resize",
                zIndex: 10,
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "var(--primary)"; (e.target as HTMLElement).style.opacity = "0.3"; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "transparent"; }}
            />
          )}
        </div>
      )}

      {/* ── MOBILE DRAWER OVERLAY ── */}
      {isMobile && !isKellnerRole && mobileOpen && (
        <>
          {/* Backdrop rechts vom Drawer */}
          <div
            onClick={() => setMobileOpen(false)}
            style={{
              position: "fixed", top: 0, bottom: 0,
              left: Math.min(DEFAULT_WIDTH, window.innerWidth * 0.85),
              right: 0,
              background: "rgba(0,0,0,0.5)",
              zIndex: 49,
            }}
          />
          {/* Drawer – Mobile Admin */}
          <div
            onTouchStart={handleSwipeTouchStart}
            onTouchMove={handleSwipeTouchMove}
            onTouchEnd={handleSwipeTouchEnd}
            style={{
              position: "fixed", top: 0, left: 0,
              width: Math.min(DEFAULT_WIDTH, window.innerWidth * 0.85),
              height: "100dvh",
              zIndex: 50,
              boxShadow: "4px 0 24px rgba(0,0,0,0.15)",
              background: "var(--sidebar)",
              display: "flex", flexDirection: "column",
              overflow: "visible",
              transform: swipeDelta < 0 ? `translateX(${swipeDelta}px)` : undefined,
              transition: swipeDelta === 0 ? "transform 0.25s ease" : "none",
            }}
          >
            <SidebarNav {...sidebarNavProps} />
          </div>
        </>
      )}

      {/* ── MAIN CONTENT ── */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "hidden",
        }}
      >
        {/* Mobile top bar (alle Rollen) */}
        {isMobile && (
          <div
            style={{
              height: 56,
              borderBottom: "1px solid var(--border)",
              padding: "0 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "var(--background)",
              flexShrink: 0,
              position: "sticky",
              top: 0,
              zIndex: 30,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                onClick={() => isKellnerRole ? setDrawerOpen(true) : setMobileOpen(true)}
                style={{
                  width: 36, height: 36, display: "flex", alignItems: "center",
                  justifyContent: "center", borderRadius: 8, border: "none",
                  background: "transparent", cursor: "pointer",
                  color: "var(--foreground)",
                }}
                aria-label="Menü öffnen"
              >
                <Menu style={{ width: 20, height: 20 }} />
              </button>
              <span style={{ fontSize: 14, fontWeight: 500, color: "var(--foreground)" }}>{activeLabel}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {activeWaiter && (
                <button
                  onClick={waiterLogout}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 12px", borderRadius: 8,
                    border: "none", background: "#ef4444", color: "#fff",
                    cursor: "pointer", fontSize: 13, fontWeight: 600,
                  }}
                  aria-label="Kellner abmelden"
                >
                  <LogOut style={{ width: 15, height: 15 }} />
                  Abmelden
                </button>
              )}
              {!activeWaiter && <TrialPhaseTopbarIcon />}
              {sseStatus !== "connected" && (
                <SSEStatusBadge status={sseStatus} retryCount={sseRetryCount} />
              )}
              {!activeWaiter && <img src={LOGO_URL} alt="Simplapos" style={{ height: 24, width: "auto" }} />}
            </div>
          </div>
        )}

        {/* Desktop top bar für Kellner-Rolle (kein festes Sidebar-Panel) */}
        {!isMobile && isKellnerRole && (
          <div
            style={{
              height: 56,
              borderBottom: "1px solid var(--border)",
              padding: "0 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "var(--background)",
              flexShrink: 0,
              position: "sticky",
              top: 0,
              zIndex: 30,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                onClick={() => setDrawerOpen(true)}
                style={{
                  width: 36, height: 36, display: "flex", alignItems: "center",
                  justifyContent: "center", borderRadius: 8, border: "none",
                  background: "transparent", cursor: "pointer",
                  color: "var(--foreground)",
                }}
                aria-label="Navigation öffnen"
              >
                <Menu style={{ width: 20, height: 20 }} />
              </button>
              <span style={{ fontSize: 15, fontWeight: 500, color: "var(--foreground)" }}>{activeLabel}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {activeWaiter && (
                <button
                  onClick={waiterLogout}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 14px", borderRadius: 8,
                    border: "none", background: "#ef4444", color: "#fff",
                    cursor: "pointer", fontSize: 13, fontWeight: 600,
                  }}
                  aria-label="Kellner abmelden"
                >
                  <LogOut style={{ width: 15, height: 15 }} />
                  Abmelden
                </button>
              )}
              {!activeWaiter && <TrialPhaseTopbarIcon />}
              {sseStatus !== "connected" && (
                <SSEStatusBadge status={sseStatus} retryCount={sseRetryCount} />
              )}
              {!activeWaiter && <img src={LOGO_URL} alt="Simplapos" style={{ height: 28, width: "auto" }} />}
            </div>
          </div>
        )}

        {/* Scrollable content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            paddingBottom: showBottomTabs ? 80 : 0,
          }}
        >
          <div style={{ padding: isMobile ? 16 : 24 }}>
            <HeartbeatProvider />
            {user?.restaurantId && (
              <SSEMonitorProvider restaurantId={user.restaurantId} onStatus={handleSseStatus} />
            )}
            <TrialPhaseBanner />
            <SubscriptionGate>{children}</SubscriptionGate>
          </div>
        </div>

        {/* Mobile Bottom Tab Bar */}
        {showBottomTabs && (
          <nav
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 40,
              background: "var(--background)",
              borderTop: "1px solid var(--border)",
              display: "flex",
              alignItems: "stretch",
              height: 64,
              // Safe area for iPhone home indicator
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
            }}
          >
            {mobileBottomTabs.map((item: NavItem) => {
              const isActive = location === item.path || location.startsWith(item.path + "/");
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.path)}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                    minHeight: 48,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    color: isActive ? "var(--primary)" : "var(--muted-foreground)",
                    transition: "color 0.12s",
                    position: "relative",
                  }}
                  aria-label={item.label}
                >
                  <NavIcon name={item.icon} className="h-5 w-5" />
                  <span style={{
                    fontSize: 10,
                    fontWeight: 500,
                    lineHeight: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 56,
                  }}>
                    {item.label}
                  </span>
                  {isActive && (
                    <span style={{
                      position: "absolute",
                      top: 0,
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: 32,
                      height: 2,
                      background: "var(--primary)",
                      borderRadius: "0 0 2px 2px",
                    }} />
                  )}
                </button>
              );
            })}
          </nav>
        )}
      </div>

      {/* KI-Chatbot Widget – überall als Side-Tab rechts */}
      {user?.restaurantId && (
        <AIChatWidget
          role={isKellnerRole ? "waiter" : "admin"}
          sideTab={true}
        />
      )}

      {/* UserSwitcher-Overlay – Als Kellner einloggen */}
      <UserSwitcherOverlay
        open={userSwitcherOpen}
        onClose={() => setUserSwitcherOpen(false)}
        showAdmin={false}
      />
    </div>
  );
}
