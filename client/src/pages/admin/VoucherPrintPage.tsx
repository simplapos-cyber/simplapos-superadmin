import { useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Printer, QrCode, Check } from "lucide-react";

// ─── Typen ────────────────────────────────────────────────────────────────────
interface CardData {
  code: string;
  qrDataUrl: string;
  type: "fixed" | "percent";
  value: string;
  remainingBalance: string;
  issuedTo?: string | null;
  validUntil?: string | null;
  restaurantName?: string;
  restaurantLogoUrl?: string | null;
  backgroundImageUrl?: string | null;
}

// ─── 10 Designs mit komplett verschiedenen Layouts ───────────────────────────
const DESIGNS = [
  {
    id: 1,
    name: "Midnight Blue",
    thumb: "linear-gradient(135deg,#1a1a2e,#0f3460)",
    render: (d: CardData) => <DesignMidnightBlue data={d} />,
  },
  {
    id: 2,
    name: "Rose Gold",
    thumb: "linear-gradient(135deg,#2d1b2e,#7b2d5e)",
    render: (d: CardData) => <DesignRoseGold data={d} />,
  },
  {
    id: 3,
    name: "Forest Green",
    thumb: "linear-gradient(135deg,#0d2818,#2d7a4f)",
    render: (d: CardData) => <DesignForestGreen data={d} />,
  },
  {
    id: 4,
    name: "Luxus Gold",
    thumb: "linear-gradient(135deg,#1a1200,#7a5c00)",
    render: (d: CardData) => <DesignLuxusGold data={d} />,
  },
  {
    id: 5,
    name: "Minimal White",
    thumb: "linear-gradient(135deg,#f8f8f8,#e0e0e0)",
    render: (d: CardData) => <DesignMinimalWhite data={d} />,
  },
  {
    id: 6,
    name: "Ocean Wave",
    thumb: "linear-gradient(135deg,#003366,#0099cc)",
    render: (d: CardData) => <DesignOceanWave data={d} />,
  },
  {
    id: 7,
    name: "Festlich Rot",
    thumb: "linear-gradient(135deg,#6b0000,#cc0000)",
    render: (d: CardData) => <DesignFestlichRot data={d} />,
  },
  {
    id: 8,
    name: "Natur Holz",
    thumb: "linear-gradient(135deg,#3d2b1f,#8b6347)",
    render: (d: CardData) => <DesignNaturHolz data={d} />,
  },
  {
    id: 9,
    name: "Neon City",
    thumb: "linear-gradient(135deg,#0a0a0a,#1a0033)",
    render: (d: CardData) => <DesignNeonCity data={d} />,
  },
  {
    id: 10,
    name: "Pastell Frühling",
    thumb: "linear-gradient(135deg,#ffecd2,#fcb69f)",
    render: (d: CardData) => <DesignPastelFruhling data={d} />,
  },
];

// ─── Logo-Komponente (wird in jedem Design oben links angezeigt) ─────────────
function RestaurantLogo({ logoUrl, size = 32, bg = "rgba(255,255,255,0.15)", radius = 6 }: { logoUrl?: string | null; size?: number; bg?: string; radius?: number }) {
  if (!logoUrl) return null;
  return (
    <div style={{ width: size, height: size, borderRadius: radius, overflow: "hidden", background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <img src={logoUrl} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} crossOrigin="anonymous" />
    </div>
  );
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────
function fmtVal(d: CardData) {
  return d.type === "fixed"
    ? `CHF ${parseFloat(d.value).toFixed(2)}`
    : `${parseFloat(d.value).toFixed(0)}%`;
}
function fmtDate(s?: string | null) {
  if (!s) return null;
  return new Date(s).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── DESIGN 1: Midnight Blue – klassisches Kreditkartenformat ────────────────
function DesignMidnightBlue({ data }: { data: CardData }) {
  return (
    <div style={{
      width: 340, height: 216, borderRadius: 14, overflow: "hidden", position: "relative",
      background: "linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)",
      fontFamily: "'Helvetica Neue',Arial,sans-serif", color: "#fff",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    }}>
      <div style={{ position: "absolute", top: -40, right: -40, width: 140, height: 140, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
      <div style={{ position: "absolute", bottom: -30, left: -30, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
      <div style={{ position: "absolute", left: 20, top: 18, right: 130 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <RestaurantLogo logoUrl={data.restaurantLogoUrl} size={24} bg="rgba(255,255,255,0.15)" radius={4} />
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", letterSpacing: 2, textTransform: "uppercase" }}>{data.restaurantName || "Gutschein"}</div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, marginTop: 2 }}>GESCHENKGUTSCHEIN</div>
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>Wert</div>
          <div style={{ fontSize: 30, fontWeight: 900, color: "#f0c040", lineHeight: 1 }}>{fmtVal(data)}</div>
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>CODE</div>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 3, background: "rgba(255,255,255,0.12)", borderRadius: 6, padding: "3px 8px", display: "inline-block", marginTop: 3, fontFamily: "monospace" }}>{data.code}</div>
        </div>
        {data.issuedTo && <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", marginTop: 8 }}>Für: {data.issuedTo}</div>}
        {data.validUntil && <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)" }}>Gültig bis: {fmtDate(data.validUntil)}</div>}
      </div>
      <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "#fff", borderRadius: 10, padding: 6, width: 100, height: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <img src={data.qrDataUrl} alt="QR" style={{ width: 88, height: 88 }} />
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 4, background: "linear-gradient(90deg,#f0c040,#e8a020,#f0c040)" }} />
    </div>
  );
}

// ─── DESIGN 2: Rose Gold – zentriertes Layout mit grossem Wert oben ───────────
function DesignRoseGold({ data }: { data: CardData }) {
  return (
    <div style={{
      width: 340, height: 216, borderRadius: 14, overflow: "hidden", position: "relative",
      background: "linear-gradient(135deg,#2d1b2e 0%,#4a1942 50%,#7b2d5e 100%)",
      fontFamily: "'Helvetica Neue',Arial,sans-serif", color: "#fff",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    }}>
      {/* Diagonale Linie */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200, borderRadius: "50%", border: "40px solid rgba(244,160,192,0.1)" }} />
      </div>
      {/* Linke Spalte */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 200, padding: "18px 20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <RestaurantLogo logoUrl={data.restaurantLogoUrl} size={22} bg="rgba(244,160,192,0.2)" radius={4} />
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", letterSpacing: 2, textTransform: "uppercase" }}>{data.restaurantName || "Gift Card"}</div>
          </div>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#f4a0c0", marginTop: 2 }}>✦ GESCHENKGUTSCHEIN ✦</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: "#f4a0c0", lineHeight: 1 }}>{fmtVal(data)}</div>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>Geschenkgutschein</div>
        </div>
        <div>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>CODE</div>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 3, fontFamily: "monospace", color: "#fff", marginTop: 2 }}>{data.code}</div>
          {data.issuedTo && <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>Für: {data.issuedTo}</div>}
        </div>
      </div>
      {/* Rechte Spalte */}
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 140, background: "rgba(244,160,192,0.12)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <div style={{ background: "#fff0f5", borderRadius: 10, padding: 6 }}>
          <img src={data.qrDataUrl} alt="QR" style={{ width: 80, height: 80 }} />
        </div>
        {data.validUntil && <div style={{ fontSize: 7, color: "rgba(255,255,255,0.6)", textAlign: "center" }}>bis {fmtDate(data.validUntil)}</div>}
      </div>
    </div>
  );
}

// ─── DESIGN 3: Forest Green – horizontales Split-Layout ──────────────────────
function DesignForestGreen({ data }: { data: CardData }) {
  return (
    <div style={{
      width: 340, height: 216, borderRadius: 14, overflow: "hidden", position: "relative",
      background: "linear-gradient(135deg,#0d2818 0%,#1a4a2e 50%,#2d7a4f 100%)",
      fontFamily: "'Helvetica Neue',Arial,sans-serif", color: "#fff",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    }}>
      {/* Obere Hälfte */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 120, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <RestaurantLogo logoUrl={data.restaurantLogoUrl} size={22} bg="rgba(126,221,154,0.15)" radius={4} />
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", letterSpacing: 2, textTransform: "uppercase" }}>{data.restaurantName || "Restaurant"}</div>
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#7edd9a", marginTop: 4 }}>{fmtVal(data)}</div>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>Geschenkgutschein</div>
        </div>
        <div style={{ background: "#f0fff4", borderRadius: 10, padding: 5 }}>
          <img src={data.qrDataUrl} alt="QR" style={{ width: 72, height: 72 }} />
        </div>
      </div>
      {/* Trennlinie */}
      <div style={{ position: "absolute", top: 120, left: 20, right: 20, height: 1, background: "rgba(126,221,154,0.3)" }} />
      {/* Untere Hälfte */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 96, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>CODE</div>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 3, fontFamily: "monospace", color: "#7edd9a", marginTop: 2 }}>{data.code}</div>
          {data.issuedTo && <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>Für: {data.issuedTo}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          {data.validUntil && <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)" }}>Gültig bis</div>}
          {data.validUntil && <div style={{ fontSize: 9, color: "#7edd9a", fontWeight: 600 }}>{fmtDate(data.validUntil)}</div>}
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>SimplaPOS</div>
        </div>
      </div>
    </div>
  );
}

// ─── DESIGN 4: Luxus Gold – vertikales Layout mit Goldstreifen ────────────────
function DesignLuxusGold({ data }: { data: CardData }) {
  return (
    <div style={{
      width: 340, height: 216, borderRadius: 14, overflow: "hidden", position: "relative",
      background: "linear-gradient(135deg,#0a0800 0%,#1a1200 50%,#2a1e00 100%)",
      fontFamily: "Georgia,serif", color: "#d4af37",
      boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
    }}>
      {/* Goldener linker Streifen */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, background: "linear-gradient(180deg,#d4af37,#f5e17a,#d4af37)" }} />
      {/* Goldener rechter Streifen */}
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 6, background: "linear-gradient(180deg,#d4af37,#f5e17a,#d4af37)" }} />
      {/* Inhalt */}
      <div style={{ position: "absolute", left: 20, right: 20, top: 16, bottom: 16, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <RestaurantLogo logoUrl={data.restaurantLogoUrl} size={20} bg="rgba(212,175,55,0.15)" radius={4} />
            <div style={{ fontSize: 8, letterSpacing: 4, textTransform: "uppercase", color: "rgba(212,175,55,0.6)" }}>✦ {data.restaurantName || "Restaurant"} ✦</div>
          </div>
          <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "#d4af37", marginTop: 4 }}>Geschenkgutschein</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 32, fontWeight: 700, color: "#f5e17a", lineHeight: 1 }}>{fmtVal(data)}</div>
            <div style={{ fontSize: 8, color: "rgba(212,175,55,0.6)", marginTop: 4, letterSpacing: 2 }}>WERT DES GUTSCHEINS</div>
          </div>
          <div style={{ background: "#fffde7", borderRadius: 8, padding: 5 }}>
            <img src={data.qrDataUrl} alt="QR" style={{ width: 70, height: 70 }} />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 7, color: "rgba(212,175,55,0.5)", letterSpacing: 2 }}>CODE</div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 4, fontFamily: "monospace", color: "#d4af37" }}>{data.code}</div>
            {data.issuedTo && <div style={{ fontSize: 8, color: "rgba(212,175,55,0.6)", marginTop: 2 }}>Für: {data.issuedTo}</div>}
          </div>
          {data.validUntil && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 7, color: "rgba(212,175,55,0.5)" }}>GÜLTIG BIS</div>
              <div style={{ fontSize: 9, color: "#d4af37" }}>{fmtDate(data.validUntil)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── DESIGN 5: Minimal White – cleanes weisses Design mit Akzentlinie ─────────
function DesignMinimalWhite({ data }: { data: CardData }) {
  return (
    <div style={{
      width: 340, height: 216, borderRadius: 14, overflow: "hidden", position: "relative",
      background: "#ffffff", fontFamily: "'Helvetica Neue',Arial,sans-serif", color: "#1a1a1a",
      boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
    }}>
      {/* Farbiger Akzentbalken oben */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, background: "linear-gradient(90deg,#6366f1,#8b5cf6,#ec4899)" }} />
      {/* Linke Seite */}
      <div style={{ position: "absolute", left: 24, top: 20, bottom: 20, right: 140, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <RestaurantLogo logoUrl={data.restaurantLogoUrl} size={22} bg="#f3f4f6" radius={4} />
            <div style={{ fontSize: 9, color: "#6366f1", letterSpacing: 2, textTransform: "uppercase", fontWeight: 600 }}>{data.restaurantName || "Restaurant"}</div>
          </div>
          <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>Geschenkgutschein</div>
        </div>
        <div>
          <div style={{ fontSize: 34, fontWeight: 900, color: "#1a1a1a", lineHeight: 1 }}>{fmtVal(data)}</div>
        </div>
        <div>
          <div style={{ fontSize: 7, color: "#999", letterSpacing: 1, textTransform: "uppercase" }}>Code</div>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, fontFamily: "monospace", color: "#6366f1", marginTop: 2 }}>{data.code}</div>
          {data.issuedTo && <div style={{ fontSize: 8, color: "#999", marginTop: 4 }}>Für: {data.issuedTo}</div>}
          {data.validUntil && <div style={{ fontSize: 8, color: "#999" }}>bis {fmtDate(data.validUntil)}</div>}
        </div>
      </div>
      {/* Rechte Seite */}
      <div style={{ position: "absolute", right: 20, top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <div style={{ background: "#f3f4f6", borderRadius: 10, padding: 6 }}>
          <img src={data.qrDataUrl} alt="QR" style={{ width: 84, height: 84 }} />
        </div>
        <div style={{ fontSize: 7, color: "#999", textAlign: "center" }}>Scannen</div>
      </div>
    </div>
  );
}

// ─── DESIGN 6: Ocean Wave – Wellen-Effekt mit blauem Verlauf ─────────────────
function DesignOceanWave({ data }: { data: CardData }) {
  return (
    <div style={{
      width: 340, height: 216, borderRadius: 14, overflow: "hidden", position: "relative",
      background: "linear-gradient(160deg,#003366 0%,#005599 40%,#0099cc 100%)",
      fontFamily: "'Helvetica Neue',Arial,sans-serif", color: "#fff",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    }}>
      {/* Wellen-Dekor */}
      <svg style={{ position: "absolute", bottom: 0, left: 0, right: 0 }} viewBox="0 0 340 60" preserveAspectRatio="none" height="60">
        <path d="M0,30 C60,10 120,50 180,30 C240,10 300,50 340,30 L340,60 L0,60 Z" fill="rgba(255,255,255,0.07)" />
        <path d="M0,40 C80,20 160,60 240,40 C280,30 320,50 340,40 L340,60 L0,60 Z" fill="rgba(255,255,255,0.05)" />
      </svg>
      {/* Inhalt */}
      <div style={{ position: "absolute", left: 22, top: 18, right: 130 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <RestaurantLogo logoUrl={data.restaurantLogoUrl} size={22} bg="rgba(255,255,255,0.15)" radius={4} />
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", letterSpacing: 2, textTransform: "uppercase" }}>{data.restaurantName || "Restaurant"}</div>
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>🌊 Geschenkgutschein</div>
        <div style={{ fontSize: 32, fontWeight: 900, color: "#7dd3fc", marginTop: 12, lineHeight: 1 }}>{fmtVal(data)}</div>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>CODE</div>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 3, fontFamily: "monospace", color: "#fff", background: "rgba(255,255,255,0.15)", borderRadius: 6, padding: "3px 8px", display: "inline-block", marginTop: 2 }}>{data.code}</div>
        </div>
        {data.issuedTo && <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>Für: {data.issuedTo}</div>}
        {data.validUntil && <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)" }}>bis {fmtDate(data.validUntil)}</div>}
      </div>
      <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.95)", borderRadius: 10, padding: 6 }}>
        <img src={data.qrDataUrl} alt="QR" style={{ width: 88, height: 88 }} />
      </div>
    </div>
  );
}

// ─── DESIGN 7: Festlich Rot – Weihnachten/Geburtstag mit Sternen ──────────────
function DesignFestlichRot({ data }: { data: CardData }) {
  return (
    <div style={{
      width: 340, height: 216, borderRadius: 14, overflow: "hidden", position: "relative",
      background: "linear-gradient(135deg,#6b0000 0%,#9b0000 50%,#cc0000 100%)",
      fontFamily: "'Helvetica Neue',Arial,sans-serif", color: "#fff",
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    }}>
      {/* Sterne-Dekor */}
      {["12%,15%","85%,20%","20%,75%","75%,80%","50%,10%"].map((pos, i) => (
        <div key={i} style={{ position: "absolute", left: pos.split(",")[0], top: pos.split(",")[1], fontSize: 14, opacity: 0.3 }}>★</div>
      ))}
      {/* Goldener Rahmen */}
      <div style={{ position: "absolute", inset: 6, border: "1px solid rgba(255,215,0,0.3)", borderRadius: 10 }} />
      {/* Inhalt */}
      <div style={{ position: "absolute", left: 22, top: 20, right: 130 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <RestaurantLogo logoUrl={data.restaurantLogoUrl} size={22} bg="rgba(255,215,0,0.15)" radius={4} />
          <div style={{ fontSize: 9, color: "rgba(255,215,0,0.8)", letterSpacing: 2, textTransform: "uppercase" }}>★ {data.restaurantName || "Restaurant"} ★</div>
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>Geschenkgutschein</div>
        <div style={{ fontSize: 32, fontWeight: 900, color: "#ffd700", marginTop: 12, lineHeight: 1 }}>{fmtVal(data)}</div>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 8, color: "rgba(255,215,0,0.6)", letterSpacing: 1 }}>CODE</div>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 3, fontFamily: "monospace", color: "#ffd700", marginTop: 2 }}>{data.code}</div>
        </div>
        {data.issuedTo && <div style={{ fontSize: 8, color: "rgba(255,255,255,0.6)", marginTop: 6 }}>Für: {data.issuedTo}</div>}
        {data.validUntil && <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)" }}>bis {fmtDate(data.validUntil)}</div>}
      </div>
      <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "#fff", borderRadius: 10, padding: 6, border: "2px solid rgba(255,215,0,0.5)" }}>
        <img src={data.qrDataUrl} alt="QR" style={{ width: 84, height: 84 }} />
      </div>
    </div>
  );
}

// ─── DESIGN 8: Natur Holz – warme Erdtöne mit Holzstruktur-Optik ─────────────
function DesignNaturHolz({ data }: { data: CardData }) {
  return (
    <div style={{
      width: 340, height: 216, borderRadius: 14, overflow: "hidden", position: "relative",
      background: "linear-gradient(135deg,#3d2b1f 0%,#5c3d2e 50%,#8b6347 100%)",
      fontFamily: "Georgia,serif", color: "#f5e6d3",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    }}>
      {/* Holzmaserung-Linien */}
      {[30,60,90,120,150,180].map((y, i) => (
        <div key={i} style={{ position: "absolute", left: 0, right: 0, top: y, height: 1, background: "rgba(255,255,255,0.04)", transform: `rotate(${i % 2 === 0 ? 1 : -1}deg)` }} />
      ))}
      {/* Linker Bereich */}
      <div style={{ position: "absolute", left: 20, top: 18, right: 130 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <RestaurantLogo logoUrl={data.restaurantLogoUrl} size={22} bg="rgba(245,230,211,0.15)" radius={4} />
          <div style={{ fontSize: 9, color: "rgba(245,230,211,0.6)", letterSpacing: 2, textTransform: "uppercase" }}>{data.restaurantName || "Restaurant"}</div>
        </div>
        <div style={{ fontSize: 10, color: "rgba(245,230,211,0.8)", marginTop: 2 }}>🌿 Geschenkgutschein</div>
        <div style={{ fontSize: 30, fontWeight: 700, color: "#f5c87a", marginTop: 14, lineHeight: 1 }}>{fmtVal(data)}</div>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 8, color: "rgba(245,230,211,0.5)", letterSpacing: 1 }}>CODE</div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, fontFamily: "monospace", color: "#f5c87a", marginTop: 2, background: "rgba(0,0,0,0.2)", borderRadius: 4, padding: "2px 6px", display: "inline-block" }}>{data.code}</div>
        </div>
        {data.issuedTo && <div style={{ fontSize: 8, color: "rgba(245,230,211,0.5)", marginTop: 6 }}>Für: {data.issuedTo}</div>}
        {data.validUntil && <div style={{ fontSize: 8, color: "rgba(245,230,211,0.5)" }}>bis {fmtDate(data.validUntil)}</div>}
      </div>
      <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "#fdf6ee", borderRadius: 10, padding: 6, border: "2px solid rgba(245,200,122,0.4)" }}>
        <img src={data.qrDataUrl} alt="QR" style={{ width: 84, height: 84 }} />
      </div>
    </div>
  );
}

// ─── DESIGN 9: Neon City – dunkles Cyberpunk-Design mit Neon-Akzenten ─────────
function DesignNeonCity({ data }: { data: CardData }) {
  return (
    <div style={{
      width: 340, height: 216, borderRadius: 14, overflow: "hidden", position: "relative",
      background: "linear-gradient(135deg,#0a0a0a 0%,#0d0020 50%,#1a0033 100%)",
      fontFamily: "'Courier New',monospace", color: "#fff",
      boxShadow: "0 0 40px rgba(0,255,255,0.2), 0 8px 32px rgba(0,0,0,0.6)",
    }}>
      {/* Neon-Gitter */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(0,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,255,0.03) 1px,transparent 1px)", backgroundSize: "20px 20px" }} />
      {/* Neon-Rahmen */}
      <div style={{ position: "absolute", inset: 0, border: "1px solid rgba(0,255,255,0.2)", borderRadius: 14 }} />
      {/* Inhalt */}
      <div style={{ position: "absolute", left: 20, top: 16, right: 130 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <RestaurantLogo logoUrl={data.restaurantLogoUrl} size={22} bg="rgba(0,255,255,0.1)" radius={4} />
          <div style={{ fontSize: 8, color: "#00ffff", letterSpacing: 3, textTransform: "uppercase" }}>▶ {data.restaurantName || "RESTAURANT"}</div>
        </div>
        <div style={{ fontSize: 9, color: "rgba(0,255,255,0.6)", marginTop: 2 }}>GIFT CARD</div>
        <div style={{ fontSize: 30, fontWeight: 900, color: "#ff00ff", marginTop: 12, lineHeight: 1, textShadow: "0 0 10px rgba(255,0,255,0.5)" }}>{fmtVal(data)}</div>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 7, color: "rgba(0,255,255,0.5)", letterSpacing: 2 }}>▶ CODE</div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, color: "#00ffff", marginTop: 2, textShadow: "0 0 6px rgba(0,255,255,0.4)" }}>{data.code}</div>
        </div>
        {data.issuedTo && <div style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>FÜR: {data.issuedTo?.toUpperCase()}</div>}
        {data.validUntil && <div style={{ fontSize: 8, color: "rgba(0,255,255,0.4)" }}>BIS: {fmtDate(data.validUntil)}</div>}
      </div>
      <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "#fff", borderRadius: 8, padding: 5, boxShadow: "0 0 12px rgba(0,255,255,0.3)" }}>
        <img src={data.qrDataUrl} alt="QR" style={{ width: 86, height: 86 }} />
      </div>
    </div>
  );
}

// ─── DESIGN 10: Pastell Frühling – helles, freundliches Design ────────────────
function DesignPastelFruhling({ data }: { data: CardData }) {
  return (
    <div style={{
      width: 340, height: 216, borderRadius: 14, overflow: "hidden", position: "relative",
      background: "linear-gradient(135deg,#ffecd2 0%,#ffd6c4 50%,#ffb8a0 100%)",
      fontFamily: "'Helvetica Neue',Arial,sans-serif", color: "#3d1a00",
      boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
    }}>
      {/* Blüten-Dekor */}
      {["10%,10%","80%,15%","15%,80%","85%,75%"].map((pos, i) => (
        <div key={i} style={{ position: "absolute", left: pos.split(",")[0], top: pos.split(",")[1], fontSize: 20, opacity: 0.15 }}>🌸</div>
      ))}
      {/* Inhalt */}
      <div style={{ position: "absolute", left: 22, top: 18, right: 130 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <RestaurantLogo logoUrl={data.restaurantLogoUrl} size={22} bg="rgba(255,255,255,0.5)" radius={4} />
          <div style={{ fontSize: 9, color: "rgba(61,26,0,0.6)", letterSpacing: 2, textTransform: "uppercase" }}>{data.restaurantName || "Restaurant"}</div>
        </div>
        <div style={{ fontSize: 10, color: "rgba(61,26,0,0.7)", marginTop: 2 }}>🎁 Geschenkgutschein</div>
        <div style={{ fontSize: 32, fontWeight: 900, color: "#c0392b", marginTop: 12, lineHeight: 1 }}>{fmtVal(data)}</div>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 8, color: "rgba(61,26,0,0.5)", letterSpacing: 1 }}>CODE</div>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 3, fontFamily: "monospace", color: "#c0392b", background: "rgba(255,255,255,0.5)", borderRadius: 6, padding: "3px 8px", display: "inline-block", marginTop: 2 }}>{data.code}</div>
        </div>
        {data.issuedTo && <div style={{ fontSize: 8, color: "rgba(61,26,0,0.5)", marginTop: 6 }}>Für: {data.issuedTo}</div>}
        {data.validUntil && <div style={{ fontSize: 8, color: "rgba(61,26,0,0.5)" }}>bis {fmtDate(data.validUntil)}</div>}
      </div>
      <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.8)", borderRadius: 10, padding: 6, border: "2px solid rgba(192,57,43,0.2)" }}>
        <img src={data.qrDataUrl} alt="QR" style={{ width: 84, height: 84 }} />
      </div>
    </div>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────
export default function VoucherPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const voucherId = parseInt(id || "0");
  const [selectedDesign, setSelectedDesign] = useState(0);
  const [downloaded, setDownloaded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const { data: qrData, isLoading } = trpc.voucher.getQrCode.useQuery(
    { id: voucherId },
    { enabled: !!voucherId }
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-gray-500">Lade Gutschein...</p>
        </div>
      </div>
    );
  }

  if (!qrData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-500 mb-4">Gutschein nicht gefunden</p>
          <Button onClick={() => navigate("/admin/vouchers")}>Zurück</Button>
        </div>
      </div>
    );
  }

  const cardData: CardData = {
    code: qrData.voucher.code,
    qrDataUrl: qrData.qrDataUrl,
    type: qrData.voucher.type as "fixed" | "percent",
    value: qrData.voucher.value,
    remainingBalance: qrData.voucher.remainingBalance,
    issuedTo: qrData.voucher.issuedTo,
    validUntil: qrData.voucher.validUntil ? String(qrData.voucher.validUntil) : null,
    restaurantName: (qrData as any).restaurantName,
    restaurantLogoUrl: (qrData as any).restaurantLogoUrl ?? null,
    backgroundImageUrl: (qrData as any).giftCardBackgroundUrl ?? null,
  };

  const design = DESIGNS[selectedDesign];

  const handleDownloadQr = () => {
    const a = document.createElement("a");
    a.download = `qrcode-${cardData.code}.png`;
    a.href = cardData.qrDataUrl;
    a.click();
  };

  const handleDownloadPng = async () => {
    const { default: html2canvas } = await import("html2canvas");
    if (!cardRef.current) return;
    const canvas = await html2canvas(cardRef.current, { scale: 3, backgroundColor: null, useCORS: true });
    const a = document.createElement("a");
    a.download = `gutschein-${cardData.code}-${design.name.toLowerCase().replace(/\s/g, "-")}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2000);
  };

  const handlePrint = () => {
    if (!cardRef.current) return;
    const html = cardRef.current.outerHTML;
    const win = window.open("", "_blank", "width=600,height=500");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Gutschein ${cardData.code}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff}@page{size:90mm 60mm;margin:0}@media print{body{width:90mm;height:60mm}}</style></head><body>${html}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button
          onClick={() => navigate("/admin/vouchers")}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </button>
        <span className="font-semibold text-sm">Gutschein drucken</span>
        <div className="w-16" />
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Kartenvorschau */}
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h2 className="font-semibold text-sm text-gray-700">Vorschau – {design.name}</h2>
          </div>
          <div className="p-6 flex justify-center bg-gray-100">
            <div ref={cardRef} style={{ display: "inline-block" }}>
              {design.render(cardData)}
            </div>
          </div>
        </div>

        {/* Aktions-Buttons */}
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={handleDownloadQr}
            className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border shadow-sm hover:bg-gray-50 active:scale-95 transition-all"
          >
            <QrCode className="h-6 w-6 text-gray-600" />
            <span className="text-xs font-medium text-gray-700">QR-Code</span>
          </button>
          <button
            onClick={handleDownloadPng}
            className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border shadow-sm hover:bg-gray-50 active:scale-95 transition-all"
          >
            {downloaded ? <Check className="h-6 w-6 text-green-500" /> : <Download className="h-6 w-6 text-gray-600" />}
            <span className="text-xs font-medium text-gray-700">{downloaded ? "Gespeichert!" : "PNG"}</span>
          </button>
          <button
            onClick={handlePrint}
            className="flex flex-col items-center gap-2 p-4 bg-purple-600 rounded-xl shadow-sm hover:bg-purple-700 active:scale-95 transition-all"
          >
            <Printer className="h-6 w-6 text-white" />
            <span className="text-xs font-medium text-white">Drucken</span>
          </button>
        </div>

        {/* Design-Auswahl */}
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h2 className="font-semibold text-sm text-gray-700">Design wählen</h2>
          </div>
          <div className="p-4 grid grid-cols-5 gap-3">
            {DESIGNS.map((d, i) => (
              <button
                key={d.id}
                onClick={() => setSelectedDesign(i)}
                className="flex flex-col items-center gap-1.5 group"
              >
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "1.6",
                    borderRadius: 8,
                    background: d.thumb,
                    border: i === selectedDesign ? "3px solid #7c3aed" : "3px solid transparent",
                    boxShadow: i === selectedDesign ? "0 0 0 2px rgba(124,58,237,0.3)" : "0 1px 4px rgba(0,0,0,0.15)",
                    transition: "all 0.15s ease",
                  }}
                />
                <span className={`text-xs text-center leading-tight ${i === selectedDesign ? "text-purple-700 font-semibold" : "text-gray-500"}`}>
                  {d.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Hintergrundbild-Hinweis */}
        {cardData.backgroundImageUrl && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700">
            <p className="font-medium">✓ Eigenes Hintergrundbild aktiv</p>
            <p className="text-xs mt-1 text-green-600">Wähle Design 10+ um es zu verwenden. Ändern: Admin → Einstellungen → Geschenkkarten</p>
          </div>
        )}

        {/* Info */}
        <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700 space-y-1">
          <p className="font-medium">Code: <span className="font-mono">{cardData.code}</span></p>
          <p className="text-xs text-blue-600">QR-Code scannen → Guthaben-Seite öffnet sich automatisch</p>
          <p className="text-xs text-blue-500">Eigenes Hintergrundbild: Admin → Einstellungen → Geschenkkarten</p>
        </div>
      </div>
    </div>
  );
}
