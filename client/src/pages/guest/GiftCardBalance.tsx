import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Gift, CreditCard, Clock, CheckCircle2, XCircle, AlertTriangle,
  ArrowUpCircle, ArrowDownCircle, Loader2, RefreshCw, ChevronDown, ChevronUp,
  MapPin, Phone, Globe, Mail, Navigation, Star, Calendar, UtensilsCrossed,
  ExternalLink, Share2,
} from "lucide-react";

function formatCHF(amount: number) {
  return `CHF ${amount.toFixed(2)}`;
}

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-CH", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDateShort(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-CH", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

// ─── Öffnungszeiten ───────────────────────────────────────────────────────────
const DAYS_DE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function OpeningHoursSection({ hours }: { hours: any }) {
  const [open, setOpen] = useState(false);
  if (!hours) return null;
  const today = new Date().getDay();
  const todayKey = DAY_KEYS[today === 0 ? 6 : today - 1];
  const todayHours = hours[todayKey];
  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full text-sm font-medium text-gray-700 hover:text-gray-900"
      >
        <span className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-400" />
          Öffnungszeiten
          {todayHours && (
            <span className="text-xs font-normal text-gray-500">
              · Heute: {todayHours.closed ? "Geschlossen" : `${todayHours.open}–${todayHours.close}`}
            </span>
          )}
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5 pl-6">
          {DAY_KEYS.map((key, i) => {
            const h = hours[key];
            const isToday = key === todayKey;
            return (
              <div key={key} className={`flex justify-between text-sm ${isToday ? "font-semibold text-purple-700" : "text-gray-600"}`}>
                <span>{DAYS_DE[i]}{isToday ? " (heute)" : ""}</span>
                <span>{!h || h.closed ? "Geschlossen" : `${h.open} – ${h.close}`}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Restaurant-Sektion ───────────────────────────────────────────────────────
function RestaurantSection({ data }: { data: any }) {
  const hasAddress = data.fullAddress || data.restaurantAddress || data.restaurantCity;
  const hasContact = data.restaurantPhone || data.restaurantEmail || data.restaurantWebsite;
  return (
    <Card className="shadow-md border-0 overflow-hidden">
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-5 py-4 flex items-center gap-3">
        {data.restaurantLogoUrl ? (
          <img src={data.restaurantLogoUrl} alt="Logo" className="w-12 h-12 rounded-xl object-cover bg-white" />
        ) : (
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
            <UtensilsCrossed className="h-6 w-6 text-white/60" />
          </div>
        )}
        <div>
          <h2 className="text-white font-bold text-base leading-tight">{data.restaurantName}</h2>
          {data.restaurantCity && (
            <p className="text-white/60 text-xs mt-0.5">{data.restaurantZip} {data.restaurantCity}</p>
          )}
        </div>
      </div>
      <CardContent className="p-4 space-y-3">
        {hasAddress && (
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-gray-700 min-w-0">
                {data.restaurantAddress && <div>{data.restaurantAddress}</div>}
                {(data.restaurantZip || data.restaurantCity) && (
                  <div>{data.restaurantZip} {data.restaurantCity}</div>
                )}
              </div>
            </div>
            <div className="flex gap-1.5 flex-shrink-0 flex-col">
              {data.googleMapsUrl && (
                <a href={data.googleMapsUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                  <Navigation className="h-3 w-3" /> Google Maps
                </a>
              )}
              {data.appleMapsUrl && (
                <a href={data.appleMapsUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200 transition-colors">
                  <MapPin className="h-3 w-3" /> Apple Maps
                </a>
              )}
            </div>
          </div>
        )}
        {hasContact && (
          <div className="space-y-1.5 border-t pt-3">
            {data.restaurantPhone && (
              <a href={`tel:${data.restaurantPhone}`} className="flex items-center gap-2 text-sm text-gray-700 hover:text-purple-700 transition-colors">
                <Phone className="h-3.5 w-3.5 text-gray-400" />{data.restaurantPhone}
              </a>
            )}
            {data.restaurantEmail && (
              <a href={`mailto:${data.restaurantEmail}`} className="flex items-center gap-2 text-sm text-gray-700 hover:text-purple-700 transition-colors">
                <Mail className="h-3.5 w-3.5 text-gray-400" />{data.restaurantEmail}
              </a>
            )}
            {data.restaurantWebsite && (
              <a href={data.restaurantWebsite.startsWith("http") ? data.restaurantWebsite : `https://${data.restaurantWebsite}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-gray-700 hover:text-purple-700 transition-colors">
                <Globe className="h-3.5 w-3.5 text-gray-400" />
                {data.restaurantWebsite.replace(/^https?:\/\//, "")}
                <ExternalLink className="h-3 w-3 text-gray-300" />
              </a>
            )}
          </div>
        )}
        {data.restaurantOpeningHours && (
          <div className="border-t pt-3">
            <OpeningHoursSection hours={data.restaurantOpeningHours} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Marketing-Bereich ────────────────────────────────────────────────────────
function MarketingSection({ data }: { data: any }) {
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Geschenkkarte – ${data.restaurantName}`,
          text: `Ich habe eine Geschenkkarte für ${data.restaurantName} im Wert von ${formatCHF(data.remainingBalance)}!`,
          url: window.location.href,
        });
      } catch {}
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  };
  return (
    <Card className="shadow-md border-0">
      <CardContent className="p-4 space-y-3">
        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
          <Star className="h-4 w-4 text-yellow-500" />
          Entdecke {data.restaurantName}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {data.restaurantWebsite && (
            <a href={data.restaurantWebsite.startsWith("http") ? data.restaurantWebsite : `https://${data.restaurantWebsite}`}
              target="_blank" rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5 p-3 bg-purple-50 rounded-xl border border-purple-100 hover:bg-purple-100 transition-colors text-center">
              <Calendar className="h-5 w-5 text-purple-600" />
              <span className="text-xs font-semibold text-purple-700">Tisch reservieren</span>
            </a>
          )}
          {data.restaurantPhone && (
            <a href={`tel:${data.restaurantPhone}`}
              className="flex flex-col items-center gap-1.5 p-3 bg-green-50 rounded-xl border border-green-100 hover:bg-green-100 transition-colors text-center">
              <Phone className="h-5 w-5 text-green-600" />
              <span className="text-xs font-semibold text-green-700">Direkt anrufen</span>
            </a>
          )}
          {data.googleMapsUrl && (
            <a href={data.googleMapsUrl} target="_blank" rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5 p-3 bg-blue-50 rounded-xl border border-blue-100 hover:bg-blue-100 transition-colors text-center">
              <Navigation className="h-5 w-5 text-blue-600" />
              <span className="text-xs font-semibold text-blue-700">Route planen</span>
            </a>
          )}
          <button onClick={handleShare}
            className="flex flex-col items-center gap-1.5 p-3 bg-orange-50 rounded-xl border border-orange-100 hover:bg-orange-100 transition-colors text-center">
            <Share2 className="h-5 w-5 text-orange-600" />
            <span className="text-xs font-semibold text-orange-700">Karte teilen</span>
          </button>
        </div>
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl p-3 text-white text-center">
          <p className="text-xs opacity-80 mb-0.5">Dein Guthaben bei {data.restaurantName}</p>
          <p className="text-xl font-black">{formatCHF(data.remainingBalance)}</p>
          <p className="text-xs opacity-70 mt-0.5">Gültig bis: {data.validUntil ? formatDateShort(data.validUntil) : "Unbegrenzt"}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-start gap-2">
          <Gift className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">So einlösen:</span> Zeige deinen Code <span className="font-mono font-bold">{data.code}</span> beim Personal oder scanne diesen QR-Code direkt an der Kasse.
          </div>
        </div>

        {/* Social-Media-Links */}
        {data.socialMedia && Object.values(data.socialMedia).some(Boolean) && (
          <div className="border-t pt-3">
            <p className="text-xs text-gray-500 mb-2 font-medium">Folge uns</p>
            <div className="flex flex-wrap gap-2">
              {data.socialMedia.instagram && (
                <a href={data.socialMedia.instagram.startsWith("http") ? data.socialMedia.instagram : `https://instagram.com/${data.socialMedia.instagram.replace(/^@/, "")}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)" }}>
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                  Instagram
                </a>
              )}
              {data.socialMedia.tiktok && (
                <a href={data.socialMedia.tiktok.startsWith("http") ? data.socialMedia.tiktok : `https://tiktok.com/@${data.socialMedia.tiktok.replace(/^@/, "")}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-black hover:bg-gray-900 transition-colors">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.79 1.53V6.77a4.85 4.85 0 01-1.02-.08z"/></svg>
                  TikTok
                </a>
              )}
              {data.socialMedia.facebook && (
                <a href={data.socialMedia.facebook.startsWith("http") ? data.socialMedia.facebook : `https://facebook.com/${data.socialMedia.facebook}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#1877F2] hover:bg-[#166fe5] transition-colors">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  Facebook
                </a>
              )}
              {data.socialMedia.googleMaps && (
                <a href={data.socialMedia.googleMaps}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#4285F4] hover:bg-[#3367d6] transition-colors">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                  Google Maps
                </a>
              )}
              {data.socialMedia.tripadvisor && (
                <a href={data.socialMedia.tripadvisor.startsWith("http") ? data.socialMedia.tripadvisor : `https://tripadvisor.com/${data.socialMedia.tripadvisor}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#34E0A1] hover:bg-[#2bc98e] transition-colors">
                  <Star className="h-3.5 w-3.5" />
                  TripAdvisor
                </a>
              )}
              {data.socialMedia.youtube && (
                <a href={data.socialMedia.youtube.startsWith("http") ? data.socialMedia.youtube : `https://youtube.com/@${data.socialMedia.youtube.replace(/^@/, "")}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#FF0000] hover:bg-[#cc0000] transition-colors">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                  YouTube
                </a>
              )}
              {data.socialMedia.website && (
                <a href={data.socialMedia.website.startsWith("http") ? data.socialMedia.website : `https://${data.socialMedia.website}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors">
                  <Globe className="h-3.5 w-3.5" />
                  Website
                </a>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Guthaben-Balken ─────────────────────────────────────────────────────────
function BalanceBar({ remaining, initial }: { remaining: number; initial: number }) {
  const pct = initial > 0 ? Math.min(100, (remaining / initial) * 100) : 0;
  const color = pct > 50 ? "#22c55e" : pct > 20 ? "#f59e0b" : "#ef4444";
  return (
    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
      <div
        style={{ width: `${pct}%`, background: color, transition: "width 0.6s ease" }}
        className="h-full rounded-full"
      />
    </div>
  );
}

// ─── Auflade-Dialog ───────────────────────────────────────────────────────────
function TopupSection({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("50");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const createSession = trpc.voucher.createGiftCardTopupSession.useMutation();

  const QUICK = [20, 50, 100, 200];

  const handleTopup = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 5 || amt > 500) {
      setError("Betrag muss zwischen CHF 5 und CHF 500 liegen.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { checkoutUrl } = await createSession.mutateAsync({
        code,
        amount: amt,
        origin: window.location.origin,
        buyerEmail: buyerEmail || undefined,
        buyerName: buyerName || undefined,
      });
      window.location.href = checkoutUrl;
    } catch (e: any) {
      setError(e.message || "Fehler beim Erstellen der Zahlung.");
      setLoading(false);
    }
  };

  return (
    <div className="mt-4">
      <Button
        variant="outline"
        className="w-full gap-2 border-green-300 text-green-700 hover:bg-green-50"
        onClick={() => setOpen(v => !v)}
      >
        <ArrowUpCircle className="h-4 w-4" />
        Geschenkkarte online aufladen
        {open ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
      </Button>

      {open && (
        <div className="mt-3 p-4 bg-green-50 rounded-xl border border-green-200 space-y-4">
          <div>
            <Label className="text-sm font-medium text-gray-700 mb-2 block">Betrag (CHF)</Label>
            <div className="flex gap-2 mb-2 flex-wrap">
              {QUICK.map(q => (
                <button
                  key={q}
                  onClick={() => setAmount(q.toString())}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
                    amount === q.toString()
                      ? "bg-green-600 text-white border-green-600"
                      : "bg-white text-gray-700 border-gray-200 hover:border-green-400"
                  }`}
                >
                  CHF {q}
                </button>
              ))}
            </div>
            <Input
              type="number"
              min={5}
              max={500}
              step={5}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="bg-white"
              placeholder="Betrag eingeben..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Ihr Name (optional)</Label>
              <Input
                value={buyerName}
                onChange={e => setBuyerName(e.target.value)}
                placeholder="Max Mustermann"
                className="bg-white text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">E-Mail für Bestätigung (optional)</Label>
              <Input
                type="email"
                value={buyerEmail}
                onChange={e => setBuyerEmail(e.target.value)}
                placeholder="max@beispiel.ch"
                className="bg-white text-sm"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <Button
            className="w-full bg-green-600 hover:bg-green-700 text-white gap-2"
            onClick={handleTopup}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            {loading ? "Weiterleitung..." : `CHF ${parseFloat(amount || "0").toFixed(2)} jetzt aufladen`}
          </Button>

          <p className="text-xs text-gray-400 text-center">
            Sichere Zahlung via Stripe. Guthaben wird sofort nach Zahlung gutgeschrieben.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────
export default function GiftCardBalance() {
  const [, params] = useRoute("/gift/:code");
  const [, setLocation] = useLocation();
  const code = params?.code ?? "";

  // Topup-Erfolg aus URL lesen
  const [topupSuccess, setTopupSuccess] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("topup") === "success") {
      setTopupSuccess(true);
      // URL bereinigen
      url.searchParams.delete("topup");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const { data, isLoading, error, refetch } = trpc.voucher.getGiftCardPublic.useQuery(
    { code },
    { enabled: !!code, retry: false }
  );

  if (!code) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="max-w-sm w-full text-center p-8">
          <Gift className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Kein Geschenkkarten-Code angegeben.</p>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="max-w-sm w-full text-center p-8">
          <XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-800 mb-2">Geschenkkarte nicht gefunden</h2>
          <p className="text-gray-500 text-sm">Der Code <span className="font-mono font-bold">{code}</span> ist ungültig oder existiert nicht.</p>
        </Card>
      </div>
    );
  }

  const statusColor = data.valid ? "bg-green-100 text-green-700 border-green-200"
    : data.isExpired ? "bg-orange-100 text-orange-700 border-orange-200"
    : "bg-red-100 text-red-700 border-red-200";

  const statusLabel = data.valid ? "Aktiv"
    : data.isExpired ? "Abgelaufen"
    : data.status === "redeemed" ? "Vollständig eingelöst"
    : data.status === "cancelled" ? "Storniert"
    : "Inaktiv";

  const allEvents = [
    ...data.history.map((h: any) => ({ ...h, eventType: "redemption" as const })),
    ...data.topups.map((t: any) => ({ ...t, eventType: "topup" as const })),
  ].sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50 py-8 px-4">
      <div className="max-w-md mx-auto space-y-4">

        {/* Topup-Erfolg Banner */}
        {topupSuccess && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-700 text-sm font-medium">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            Aufladung erfolgreich! Das Guthaben wurde gutgeschrieben.
          </div>
        )}

        {/* Header-Karte */}
        <Card className="overflow-hidden shadow-lg border-0">
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-5 text-white">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Gift className="h-5 w-5 opacity-80" />
                  <span className="text-sm font-medium opacity-80">Geschenkkarte</span>
                </div>
                <h1 className="text-2xl font-black tracking-widest font-mono">{data.code}</h1>
                <p className="text-sm opacity-70 mt-1">{data.restaurantName}</p>
              </div>
              <Badge className={`${statusColor} border text-xs font-semibold px-2.5 py-1`}>
                {statusLabel}
              </Badge>
            </div>
          </div>

          <CardContent className="p-5 space-y-4">
            {/* Guthaben */}
            <div>
              <div className="flex items-end justify-between mb-2">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Aktuelles Guthaben</p>
                  <p className="text-3xl font-black text-gray-900">{formatCHF(data.remainingBalance)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Ursprünglich</p>
                  <p className="text-sm font-semibold text-gray-500">{formatCHF(data.initialBalance)}</p>
                </div>
              </div>
              <BalanceBar remaining={data.remainingBalance} initial={data.initialBalance} />
            </div>

            {/* Meta-Infos */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-0.5">Ausgestellt am</p>
                <p className="font-medium text-gray-700 text-xs">{formatDate(data.createdAt)}</p>
              </div>
              {data.validUntil && (
                <div className={`rounded-lg p-3 ${data.isExpired ? "bg-orange-50" : "bg-gray-50"}`}>
                  <p className="text-xs text-gray-400 mb-0.5">Gültig bis</p>
                  <p className={`font-medium text-xs ${data.isExpired ? "text-orange-600" : "text-gray-700"}`}>
                    {formatDate(data.validUntil)}
                  </p>
                </div>
              )}
              {data.issuedTo && (
                <div className="bg-gray-50 rounded-lg p-3 col-span-2">
                  <p className="text-xs text-gray-400 mb-0.5">Ausgestellt für</p>
                  <p className="font-medium text-gray-700 text-xs">{data.issuedTo}</p>
                </div>
              )}
            </div>

            {/* Auflade-Button */}
            {data.status !== "cancelled" && !data.isExpired && (
              <TopupSection code={data.code} />
            )}

            {/* Aktualisieren */}
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-gray-400 hover:text-gray-600 gap-1.5 text-xs"
              onClick={() => refetch()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Guthaben aktualisieren
            </Button>
          </CardContent>
        </Card>

        {/* QR-Code-Sektion */}
        {data.qrDataUrl && (
          <Card className="shadow-md border-0 overflow-hidden">
            <CardContent className="p-5">
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <CreditCard className="h-4 w-4 text-purple-500" />
                  Dein QR-Code zum Einlösen
                </div>
                <div className="bg-gradient-to-br from-slate-900 to-slate-700 rounded-2xl p-4 shadow-lg">
                  <div className="bg-white rounded-xl p-3 shadow-inner">
                    <img src={data.qrDataUrl} alt="QR-Code" className="w-44 h-44 mx-auto" />
                  </div>
                  <p className="font-mono text-white font-bold tracking-widest text-sm text-center mt-3">{data.code}</p>
                </div>
                <p className="text-xs text-gray-500 text-center max-w-xs">
                  Zeige diesen QR-Code dem Personal oder scanne ihn direkt an der Kasse — er funktioniert sowohl für den Admin als auch für den Kellner.
                </p>
                <a
                  href={data.qrDataUrl}
                  download={`geschenkkarte-${data.code}.png`}
                  className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white text-xs font-semibold rounded-lg hover:bg-purple-700 transition-colors"
                >
                  QR-Code herunterladen
                </a>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Restaurant-Sektion */}
        <RestaurantSection data={data} />

        {/* Multi-Restaurant-Anzeige */}
        {data.allowedRestaurants && data.allowedRestaurants.length > 1 && (
          <Card className="shadow-md border-0">
            <CardContent className="p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-purple-500" />
                Einlösbar in {data.allowedRestaurants.length} Restaurants
              </h3>
              <div className="space-y-2">
                {data.allowedRestaurants.map((r: any) => {
                  const q = encodeURIComponent([r.address, r.zip && r.city ? `${r.zip} ${r.city}` : r.city].filter(Boolean).join(", ") || r.name);
                  const mapsUrl = q ? `https://www.google.com/maps/search/?api=1&query=${q}` : null;
                  return (
                    <div key={r.id} className="flex items-center justify-between gap-3 p-2.5 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {r.logoUrl ? (
                          <img src={r.logoUrl} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                            <UtensilsCrossed className="h-4 w-4 text-purple-500" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{r.name}</p>
                          {(r.zip || r.city) && (
                            <p className="text-xs text-gray-500 truncate">{r.zip} {r.city}</p>
                          )}
                        </div>
                      </div>
                      {mapsUrl && (
                        <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                          className="flex-shrink-0 flex items-center gap-1 px-2 py-1 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                          <Navigation className="h-3 w-3" /> Route
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Marketing-Bereich */}
        <MarketingSection data={data} />

        {/* Transaktionshistorie */}
        {allEvents.length > 0 && (
          <Card className="shadow-md border-0">
            <CardHeader className="pb-3 pt-4 px-5">
              <CardTitle className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400" />
                Transaktionshistorie
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4 space-y-2">
              {allEvents.map((ev, i) => (
                <div key={i} className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
                  <div className={`mt-0.5 rounded-full p-1.5 flex-shrink-0 ${
                    ev.eventType === "topup"
                      ? "bg-green-100 text-green-600"
                      : "bg-red-50 text-red-500"
                  }`}>
                    {ev.eventType === "topup"
                      ? <ArrowUpCircle className="h-3.5 w-3.5" />
                      : <ArrowDownCircle className="h-3.5 w-3.5" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-800">
                        {ev.eventType === "topup" ? "Aufladung" : "Einlösung"}
                      </span>
                      <span className={`text-sm font-bold flex-shrink-0 ${
                        ev.eventType === "topup" ? "text-green-600" : "text-red-500"
                      }`}>
                        {ev.eventType === "topup" ? "+" : "-"}{formatCHF(ev.amount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-xs text-gray-400 truncate">
                        {ev.eventType === "topup" && (ev as any).buyerName
                          ? `Von: ${(ev as any).buyerName}`
                          : (ev as any).note || "—"
                        }
                      </span>
                      <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                        {formatDate(ev.date)}
                      </span>
                    </div>
                    {ev.eventType === "redemption" && (
                      <div className="text-xs text-gray-400 mt-0.5">
                        Restguthaben danach: {formatCHF((ev as any).balanceAfter)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {allEvents.length === 0 && (
          <Card className="shadow-md border-0">
            <CardContent className="py-8 text-center text-gray-400">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Noch keine Transaktionen</p>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 pb-4">
          {data.restaurantName} · Powered by SimplaPOS
        </p>
      </div>
    </div>
  );
}
