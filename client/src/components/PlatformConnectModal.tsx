/**
 * PlatformConnectModal
 * Zeigt zwei Optionen zur Verbindung einer Social-Media-Plattform:
 *  1. OAuth-Login (empfohlen): Gastronom meldet sich mit seinen Zugangsdaten an
 *  2. Manueller Token (Fallback): API-Token direkt eingeben
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Instagram,
  Facebook,
  Youtube,
  Globe,
  ExternalLink,
  Key,
  LogIn,
  CheckCircle,
  AlertCircle,
  Info,
} from "lucide-react";

// ─── Typen ───────────────────────────────────────────────────────────────────

type Platform = "instagram" | "facebook" | "google" | "tiktok";

interface PlatformConfig {
  name: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  oauthAvailable: boolean;
  oauthNote?: string;
  tokenHint: string;
  tokenPlaceholder: string;
  docsUrl: string;
}

const PLATFORM_CONFIG: Record<Platform, PlatformConfig> = {
  instagram: {
    name: "Instagram",
    icon: <Instagram className="h-5 w-5" />,
    color: "text-pink-600",
    bgColor: "bg-gradient-to-br from-purple-500 to-pink-500",
    oauthAvailable: true,
    oauthNote: "Verbindet gleichzeitig Instagram und Facebook",
    tokenHint: "Instagram Graph API Access Token (Long-Lived, 60 Tage gültig)",
    tokenPlaceholder: "EAABwzLixnjYBO...",
    docsUrl: "https://developers.facebook.com/docs/instagram-platform",
  },
  facebook: {
    name: "Facebook",
    icon: <Facebook className="h-5 w-5" />,
    color: "text-blue-600",
    bgColor: "bg-blue-600",
    oauthAvailable: true,
    oauthNote: "Verbindet gleichzeitig Facebook und Instagram",
    tokenHint: "Facebook Page Access Token (Long-Lived)",
    tokenPlaceholder: "EAABwzLixnjYBO...",
    docsUrl: "https://developers.facebook.com/docs/pages",
  },
  google: {
    name: "Google Business",
    icon: <Globe className="h-5 w-5" />,
    color: "text-red-500",
    bgColor: "bg-red-500",
    oauthAvailable: true,
    tokenHint: "Google OAuth2 Access Token (Google Business Profile API)",
    tokenPlaceholder: "ya29.a0AfH6SMB...",
    docsUrl: "https://developers.google.com/my-business",
  },
  tiktok: {
    name: "TikTok",
    icon: <Youtube className="h-5 w-5" />,
    color: "text-black dark:text-white",
    bgColor: "bg-black",
    oauthAvailable: true,
    tokenHint: "TikTok Content Posting API Access Token",
    tokenPlaceholder: "act.example...",
    docsUrl: "https://developers.tiktok.com/doc/content-posting-api-get-started",
  },
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface PlatformConnectModalProps {
  platform: Platform;
  restaurantId: number;
  isConnected: boolean;
  accountName?: string | null;
  open: boolean;
  onClose: () => void;
  onConnected: () => void;
}

// ─── Komponente ───────────────────────────────────────────────────────────────

export function PlatformConnectModal({
  platform,
  restaurantId,
  isConnected,
  accountName,
  open,
  onClose,
  onConnected,
}: PlatformConnectModalProps) {
  const config = PLATFORM_CONFIG[platform];
  const [manualToken, setManualToken] = useState("");
  const [manualPageId, setManualPageId] = useState("");
  const [manualAccountName, setManualAccountName] = useState("");
  const [isOAuthLoading, setIsOAuthLoading] = useState(false);

  const connectMutation = trpc.marketing.connectPlatform.useMutation({
    onSuccess: () => {
      toast.success(`${config.name} erfolgreich verbunden!`);
      setManualToken("");
      setManualPageId("");
      setManualAccountName("");
      onConnected();
      onClose();
    },
    onError: (err) => {
      toast.error(`Verbindung fehlgeschlagen: ${err.message}`);
    },
  });

  const disconnectMutation = trpc.marketing.disconnectPlatform.useMutation({
    onSuccess: () => {
      toast.success(`${config.name} getrennt`);
      onConnected();
      onClose();
    },
    onError: (err) => {
      toast.error(`Trennen fehlgeschlagen: ${err.message}`);
    },
  });

  // OAuth-Login starten: Browser öffnet Plattform-Login-Seite
  function handleOAuthLogin() {
    setIsOAuthLoading(true);
    const origin = window.location.origin;
    const url = `/api/marketing/oauth/start?platform=${platform}&restaurantId=${restaurantId}&origin=${encodeURIComponent(origin)}`;
    // Öffnet den OAuth-Flow in einem Popup-Fenster
    const popup = window.open(url, `${platform}_oauth`, "width=600,height=700,scrollbars=yes");

    // Auf Popup-Schliessen warten (nach erfolgreichem Callback)
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        setIsOAuthLoading(false);
        // Kurz warten dann Daten neu laden
        setTimeout(() => {
          onConnected();
          onClose();
        }, 500);
      }
    }, 500);

    // Timeout nach 5 Minuten
    setTimeout(() => {
      clearInterval(checkClosed);
      setIsOAuthLoading(false);
    }, 5 * 60 * 1000);
  }

  // Manuellen Token speichern
  function handleManualSave() {
    if (!manualToken.trim()) {
      toast.error("Bitte einen Access Token eingeben");
      return;
    }
    connectMutation.mutate({
      platform,
      accessToken: manualToken.trim(),
      pageId: manualPageId.trim() || undefined,
      accountName: manualAccountName.trim() || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${config.bgColor} text-white`}>
              {config.icon}
            </div>
            {config.name} verbinden
            {isConnected && (
              <Badge variant="secondary" className="ml-auto text-green-600 bg-green-50">
                <CheckCircle className="h-3 w-3 mr-1" />
                Verbunden
              </Badge>
            )}
          </DialogTitle>
          {isConnected && accountName && (
            <DialogDescription>
              Aktuell verbunden als: <strong>{accountName}</strong>
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Bereits verbunden: Trennen-Option */}
        {isConnected && (
          <div className="p-3 rounded-lg bg-green-50 border border-green-200 flex items-center justify-between">
            <div className="flex items-center gap-2 text-green-700 text-sm">
              <CheckCircle className="h-4 w-4" />
              {accountName ? `Verbunden als ${accountName}` : "Verbunden"}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => disconnectMutation.mutate({ platform })}
              disabled={disconnectMutation.isPending}
            >
              Trennen
            </Button>
          </div>
        )}

        <Tabs defaultValue="oauth">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="oauth" className="flex items-center gap-1">
              <LogIn className="h-3.5 w-3.5" />
              Anmelden (empfohlen)
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-1">
              <Key className="h-3.5 w-3.5" />
              Manuell (Fallback)
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: OAuth-Login */}
          <TabsContent value="oauth" className="space-y-4 pt-2">
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <div className="text-sm text-blue-700">
                  <p className="font-medium">Einfachste Methode</p>
                  <p className="mt-0.5 text-blue-600">
                    Klicke auf den Button und melde dich mit deinen {config.name}-Zugangsdaten an.
                    Kein technisches Wissen nötig.
                  </p>
                  {config.oauthNote && (
                    <p className="mt-1 text-blue-500 text-xs">ℹ️ {config.oauthNote}</p>
                  )}
                </div>
              </div>
            </div>

            <Button
              className={`w-full text-white ${config.bgColor} hover:opacity-90`}
              onClick={handleOAuthLogin}
              disabled={isOAuthLoading}
            >
              {isOAuthLoading ? (
                <>
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Warte auf Anmeldung...
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4 mr-2" />
                  Mit {config.name} anmelden
                  <ExternalLink className="h-3.5 w-3.5 ml-2 opacity-70" />
                </>
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Ein Popup-Fenster öffnet sich. Melde dich dort mit deinen {config.name}-Daten an
              und bestätige die Berechtigungen.
            </p>
          </TabsContent>

          {/* Tab 2: Manueller Token */}
          <TabsContent value="manual" className="space-y-4 pt-2">
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-700">
                  <p className="font-medium">Nur als Fallback verwenden</p>
                  <p className="mt-0.5 text-amber-600">
                    Verwende diese Option nur, wenn die automatische Anmeldung nicht funktioniert.
                    Du benötigst einen API-Token aus dem Developer-Portal.
                  </p>
                  <a
                    href={config.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-amber-700 underline text-xs"
                  >
                    Anleitung: Token holen
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="token">Access Token *</Label>
                <Input
                  id="token"
                  type="password"
                  placeholder={config.tokenPlaceholder}
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{config.tokenHint}</p>
              </div>

              {(platform === "instagram" || platform === "facebook") && (
                <div className="space-y-1.5">
                  <Label htmlFor="pageId">Page ID (optional)</Label>
                  <Input
                    id="pageId"
                    placeholder="123456789012345"
                    value={manualPageId}
                    onChange={(e) => setManualPageId(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Facebook-Seiten-ID (zu finden in den Seiten-Einstellungen)
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="accountName">Kontoname (optional)</Label>
                <Input
                  id="accountName"
                  placeholder="@mein_restaurant"
                  value={manualAccountName}
                  onChange={(e) => setManualAccountName(e.target.value)}
                />
              </div>

              <Button
                className="w-full"
                onClick={handleManualSave}
                disabled={connectMutation.isPending || !manualToken.trim()}
              >
                {connectMutation.isPending ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Speichern...
                  </>
                ) : (
                  <>
                    <Key className="h-4 w-4 mr-2" />
                    Token speichern
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
