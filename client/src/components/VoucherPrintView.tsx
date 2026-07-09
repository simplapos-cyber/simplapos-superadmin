import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Printer, Download, X, QrCode } from "lucide-react";

interface VoucherPrintData {
  code: string;
  qrDataUrl: string;
  type: "fixed" | "percent";
  value: string;
  remainingBalance: string;
  issuedTo?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  note?: string | null;
  restaurantName?: string;
  restaurantAddress?: string;
}

interface Props {
  data: VoucherPrintData;
  onClose: () => void;
}

// ─── 10 Design-Definitionen ──────────────────────────────────────────────────
const DESIGNS = [
  {
    id: 1,
    name: "Midnight Blue",
    bg: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
    accent: "#f0c040",
    text: "#ffffff",
    subtext: "rgba(255,255,255,0.5)",
    codeBg: "rgba(255,255,255,0.12)",
    stripeBg: "linear-gradient(90deg, #f0c040, #e8a020, #f0c040)",
    deco1: "rgba(255,255,255,0.05)",
    deco2: "rgba(255,255,255,0.05)",
    qrBg: "#ffffff",
  },
  {
    id: 2,
    name: "Rose Gold",
    bg: "linear-gradient(135deg, #2d1b2e 0%, #4a1942 50%, #7b2d5e 100%)",
    accent: "#f4a0c0",
    text: "#ffffff",
    subtext: "rgba(255,255,255,0.55)",
    codeBg: "rgba(255,255,255,0.15)",
    stripeBg: "linear-gradient(90deg, #f4a0c0, #e87090, #f4a0c0)",
    deco1: "rgba(255,180,200,0.08)",
    deco2: "rgba(255,180,200,0.06)",
    qrBg: "#fff0f5",
  },
  {
    id: 3,
    name: "Forest Green",
    bg: "linear-gradient(135deg, #0d2818 0%, #1a4a2e 50%, #2d7a4f 100%)",
    accent: "#7edd9a",
    text: "#ffffff",
    subtext: "rgba(255,255,255,0.5)",
    codeBg: "rgba(255,255,255,0.12)",
    stripeBg: "linear-gradient(90deg, #7edd9a, #4ec87a, #7edd9a)",
    deco1: "rgba(126,221,154,0.08)",
    deco2: "rgba(126,221,154,0.06)",
    qrBg: "#f0fff4",
  },
  {
    id: 4,
    name: "Sunset Orange",
    bg: "linear-gradient(135deg, #3d1a00 0%, #7a3300 50%, #c45200 100%)",
    accent: "#ffb347",
    text: "#ffffff",
    subtext: "rgba(255,255,255,0.5)",
    codeBg: "rgba(255,255,255,0.12)",
    stripeBg: "linear-gradient(90deg, #ffb347, #ff8c00, #ffb347)",
    deco1: "rgba(255,179,71,0.08)",
    deco2: "rgba(255,179,71,0.06)",
    qrBg: "#fff8f0",
  },
  {
    id: 5,
    name: "Arctic White",
    bg: "linear-gradient(135deg, #e8edf5 0%, #d0daea 50%, #b8c8e0 100%)",
    accent: "#2563eb",
    text: "#1e293b",
    subtext: "rgba(30,41,59,0.5)",
    codeBg: "rgba(37,99,235,0.1)",
    stripeBg: "linear-gradient(90deg, #2563eb, #1d4ed8, #2563eb)",
    deco1: "rgba(37,99,235,0.06)",
    deco2: "rgba(37,99,235,0.04)",
    qrBg: "#ffffff",
  },
  {
    id: 6,
    name: "Champagne",
    bg: "linear-gradient(135deg, #3d2e1a 0%, #6b4f2a 50%, #9a7040 100%)",
    accent: "#f5e0a0",
    text: "#ffffff",
    subtext: "rgba(255,255,255,0.55)",
    codeBg: "rgba(245,224,160,0.15)",
    stripeBg: "linear-gradient(90deg, #f5e0a0, #d4b870, #f5e0a0)",
    deco1: "rgba(245,224,160,0.08)",
    deco2: "rgba(245,224,160,0.06)",
    qrBg: "#fffdf0",
  },
  {
    id: 7,
    name: "Ocean Teal",
    bg: "linear-gradient(135deg, #0a2a2e 0%, #0d4a52 50%, #0e7490 100%)",
    accent: "#67e8f9",
    text: "#ffffff",
    subtext: "rgba(255,255,255,0.5)",
    codeBg: "rgba(103,232,249,0.12)",
    stripeBg: "linear-gradient(90deg, #67e8f9, #22d3ee, #67e8f9)",
    deco1: "rgba(103,232,249,0.08)",
    deco2: "rgba(103,232,249,0.06)",
    qrBg: "#f0fdff",
  },
  {
    id: 8,
    name: "Crimson",
    bg: "linear-gradient(135deg, #2d0a0a 0%, #5a1010 50%, #8b1a1a 100%)",
    accent: "#fca5a5",
    text: "#ffffff",
    subtext: "rgba(255,255,255,0.5)",
    codeBg: "rgba(252,165,165,0.12)",
    stripeBg: "linear-gradient(90deg, #fca5a5, #f87171, #fca5a5)",
    deco1: "rgba(252,165,165,0.08)",
    deco2: "rgba(252,165,165,0.06)",
    qrBg: "#fff5f5",
  },
  {
    id: 9,
    name: "Lavender",
    bg: "linear-gradient(135deg, #1e1040 0%, #3730a3 50%, #4f46e5 100%)",
    accent: "#c4b5fd",
    text: "#ffffff",
    subtext: "rgba(255,255,255,0.5)",
    codeBg: "rgba(196,181,253,0.15)",
    stripeBg: "linear-gradient(90deg, #c4b5fd, #a78bfa, #c4b5fd)",
    deco1: "rgba(196,181,253,0.08)",
    deco2: "rgba(196,181,253,0.06)",
    qrBg: "#f5f3ff",
  },
  {
    id: 10,
    name: "Slate Minimal",
    bg: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)",
    accent: "#94a3b8",
    text: "#f1f5f9",
    subtext: "rgba(241,245,249,0.45)",
    codeBg: "rgba(148,163,184,0.15)",
    stripeBg: "linear-gradient(90deg, #94a3b8, #64748b, #94a3b8)",
    deco1: "rgba(148,163,184,0.06)",
    deco2: "rgba(148,163,184,0.04)",
    qrBg: "#f8fafc",
  },
];

// ─── Einzelne Karte rendern ───────────────────────────────────────────────────
function GiftCard({
  data,
  design,
  cardRef,
}: {
  data: VoucherPrintData;
  design: typeof DESIGNS[0];
  cardRef?: React.RefObject<HTMLDivElement>;
}) {
  const valueLabel =
    data.type === "fixed"
      ? `CHF ${parseFloat(data.value).toFixed(2)}`
      : `${parseFloat(data.value).toFixed(0)}%`;

  const balanceLabel =
    data.type === "fixed"
      ? `CHF ${parseFloat(data.remainingBalance).toFixed(2)}`
      : valueLabel;

  const formatDate = (d: string | null | undefined) => {
    if (!d) return null;
    return new Date(d).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  return (
    <div
      ref={cardRef}
      style={{
        width: "340px",
        height: "216px",
        borderRadius: "12px",
        overflow: "hidden",
        position: "relative",
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
        background: design.bg,
        color: design.text,
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        flexShrink: 0,
      }}
    >
      {/* Dekorative Kreise */}
      <div style={{ position: "absolute", top: "-30px", right: "-30px", width: "120px", height: "120px", borderRadius: "50%", background: design.deco1 }} />
      <div style={{ position: "absolute", bottom: "-20px", left: "-20px", width: "80px", height: "80px", borderRadius: "50%", background: design.deco2 }} />

      {/* Linke Seite: Info */}
      <div style={{ position: "absolute", left: "20px", top: "16px", bottom: "16px", right: "130px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        {/* Restaurant-Name */}
        <div>
          <div style={{ fontSize: "10px", color: design.subtext, letterSpacing: "2px", textTransform: "uppercase", marginBottom: "2px" }}>
            {data.restaurantName || "Gutschein"}
          </div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: design.text, letterSpacing: "0.5px", opacity: 0.85 }}>
            GESCHENKGUTSCHEIN
          </div>
        </div>

        {/* Wert */}
        <div>
          <div style={{ fontSize: "9px", color: design.subtext, marginBottom: "2px" }}>
            {data.type === "fixed" ? "Wert" : "Rabatt"}
          </div>
          <div style={{ fontSize: "28px", fontWeight: 900, color: design.accent, lineHeight: 1 }}>
            {valueLabel}
          </div>
          {data.type === "fixed" && parseFloat(data.remainingBalance) < parseFloat(data.value) && (
            <div style={{ fontSize: "9px", color: design.subtext, marginTop: "2px" }}>
              Restguthaben: {balanceLabel}
            </div>
          )}
        </div>

        {/* Code */}
        <div>
          <div style={{ fontSize: "8px", color: design.subtext, marginBottom: "3px", letterSpacing: "1px" }}>CODE</div>
          <div style={{
            fontSize: "13px", fontWeight: 800, letterSpacing: "3px",
            background: design.codeBg, borderRadius: "6px",
            padding: "4px 8px", display: "inline-block", fontFamily: "monospace",
            color: design.text,
          }}>
            {data.code}
          </div>
        </div>

        {/* Gültigkeit */}
        {(data.validUntil || data.issuedTo) && (
          <div style={{ fontSize: "8px", color: design.subtext }}>
            {data.issuedTo && <div>Für: {data.issuedTo}</div>}
            {data.validUntil && <div>Gültig bis: {formatDate(data.validUntil)}</div>}
          </div>
        )}
      </div>

      {/* Rechte Seite: QR-Code */}
      <div style={{
        position: "absolute", right: "16px", top: "50%", transform: "translateY(-50%)",
        background: design.qrBg, borderRadius: "10px", padding: "6px",
        width: "100px", height: "100px", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <img src={data.qrDataUrl} alt="QR" style={{ width: "88px", height: "88px" }} />
      </div>

      {/* Unterer Streifen */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: "3px",
        background: design.stripeBg,
      }} />
    </div>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────
export function VoucherPrintView({ data, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const [selectedDesign, setSelectedDesign] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const design = DESIGNS[selectedDesign];

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    const win = window.open("", "_blank", "width=520,height=400");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Gutschein ${data.code}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #fff; display:flex; align-items:center; justify-content:center; min-height:100vh; }
          @page { size: 90mm 60mm; margin: 0; }
          @media print { body { width: 90mm; height: 60mm; } }
        </style>
      </head>
      <body>${printContent.outerHTML}</body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  const handleDownloadPng = async () => {
    const { default: html2canvas } = await import("html2canvas");
    const el = printRef.current;
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 3, backgroundColor: null });
    const link = document.createElement("a");
    link.download = `gutschein-${data.code}-${design.name.toLowerCase().replace(/\s/g, "-")}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const handleDownloadQrOnly = () => {
    const link = document.createElement("a");
    link.download = `qrcode-${data.code}.png`;
    link.href = data.qrDataUrl;
    link.click();
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60"
      style={{ zIndex: 9999, overflowX: "hidden", overflowY: "auto", WebkitOverflowScrolling: "touch" }}
    >
      <div className="flex min-h-full items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
          <span className="font-semibold text-sm text-gray-700">Gutschein-Vorschau</span>
          <div className="flex gap-2 flex-wrap justify-end">
            <Button size="sm" variant="outline" onClick={handleDownloadQrOnly} className="h-8 gap-1.5 text-xs">
              <QrCode className="h-3.5 w-3.5" /> QR-Code
            </Button>
            <Button size="sm" variant="outline" onClick={handleDownloadPng} className="h-8 gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" /> PNG
            </Button>
            <Button size="sm" onClick={handlePrint} className="h-8 gap-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white">
              <Printer className="h-3.5 w-3.5" /> Drucken
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Karten-Vorschau */}
        <div
          className="p-5 flex justify-center bg-gray-100 cursor-zoom-in relative group"
          onClick={() => setFullscreen(true)}
          title="Antippen für Vollbild"
        >
          <GiftCard data={data} design={design} cardRef={printRef as React.RefObject<HTMLDivElement>} />
          <div className="absolute bottom-2 right-2 bg-black/40 text-white text-xs px-2 py-1 rounded-full opacity-70 group-hover:opacity-100 transition-opacity pointer-events-none">
            Vollbild
          </div>
        </div>

        {/* Vollbild-Overlay */}
        {fullscreen && (
          <div
            className="fixed inset-0 z-[60] bg-black flex items-center justify-center"
            onClick={() => setFullscreen(false)}
          >
            <button
              className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition-colors"
              onClick={(e) => { e.stopPropagation(); setFullscreen(false); }}
            >
              <X className="h-5 w-5" />
            </button>
            <div className="text-white/50 text-xs absolute bottom-4 left-1/2 -translate-x-1/2">Antippen zum Schliessen</div>
            <div style={{ transform: "scale(1.8)", transformOrigin: "center" }}>
              <GiftCard data={data} design={design} />
            </div>
          </div>
        )}

        {/* Design-Auswahl */}
        <div className="px-5 py-4 border-t bg-white">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Design wählen</span>
            <span className="text-xs text-gray-400">{selectedDesign + 1} / {DESIGNS.length}</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
            {DESIGNS.map((d, i) => (
              <button
                key={d.id}
                onClick={() => setSelectedDesign(i)}
                title={d.name}
                style={{
                  width: "44px",
                  height: "28px",
                  borderRadius: "6px",
                  background: d.bg,
                  border: i === selectedDesign ? `2px solid ${d.accent}` : "2px solid transparent",
                  cursor: "pointer",
                  flexShrink: 0,
                  boxShadow: i === selectedDesign ? `0 0 0 2px rgba(0,0,0,0.15)` : "none",
                  transition: "all 0.15s ease",
                  outline: "none",
                }}
              />
            ))}
          </div>
          <div className="mt-2 text-xs text-gray-500 font-medium">{design.name}</div>
        </div>

        {/* Hinweise */}
        <div className="px-5 py-3 bg-gray-50 border-t text-xs text-gray-500 space-y-1">
          <p>• QR-Code scannen → Guthaben-Seite öffnet sich automatisch</p>
          <p>• Alternativ Code manuell eingeben: <span className="font-mono font-bold text-gray-700">{data.code}</span></p>
          {data.note && <p>• Notiz: {data.note}</p>}
        </div>
      </div>
      </div>
    </div>,
    document.body
  );
}
