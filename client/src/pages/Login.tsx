import { useState, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Shield, Eye, EyeOff } from "lucide-react";
import { getOrCreateDeviceId } from "@/lib/deviceId";

const LOGO_URL = "/manus-storage/simplaPOSLogo.zip-1_cc5313ec.png";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // SSE: Session-Konflikt-Meldung anzeigen wenn von anderem Gerät ausgeloggt
  const sessionConflictMessage = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("reason") === "session_conflict"
      ? "Du bist bereits auf einem anderen Gerät angemeldet. Bitte zuerst dort abmelden oder melde dich erneut an."
      : null;
  }, []);

  const utils = trpc.useUtils();
  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      // Wait for auth.me to refetch BEFORE navigating
      await utils.auth.me.invalidate();
      await utils.auth.me.refetch();
      setLocation("/dashboard");
    },
    onError: (err) => {
      setError(err.message || "Anmeldung fehlgeschlagen");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError("Bitte E-Mail und Passwort eingeben");
      return;
    }
    const deviceId = getOrCreateDeviceId();
    loginMutation.mutate({ email: email.trim(), password, deviceId });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 text-center">
          <img src={LOGO_URL} alt="Simplapos" className="h-12 w-auto" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Willkommen bei SimplaPOS</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Melden Sie sich an, um zum Kassensystem zu gelangen
            </p>
          </div>
        </div>

        {/* Login Card */}
        <Card className="border shadow-md">
          <CardHeader className="pb-2 pt-5 px-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="h-4 w-4 text-primary" />
              <span>Gesicherter Zugang</span>
            </div>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {sessionConflictMessage && (
                <Alert variant="destructive" className="py-2 border-orange-400 bg-orange-50 text-orange-800">
                  <AlertDescription className="text-sm">{sessionConflictMessage}</AlertDescription>
                </Alert>
              )}
              {error && (
                <Alert variant="destructive" className="py-2">
                  <AlertDescription className="text-sm">{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email">E-Mail-Adresse</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@simplapos.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                  disabled={loginMutation.isPending}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Passwort</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={loginMutation.isPending}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Anmelden...
                  </>
                ) : (
                  "Anmelden"
                )}
              </Button>

              <div className="text-center">
                <Link href="/forgot-password" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Passwort vergessen?
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          Noch kein Konto?{" "}
          <Link href="/onboarding" className="text-primary font-medium hover:underline">
            Jetzt 7 Tage kostenlos testen
          </Link>
        </p>
        <p className="text-center text-xs text-muted-foreground">
          <Link href="/landing" className="hover:text-primary transition-colors">
            ← Zur Produktseite
          </Link>
        </p>
      </div>
    </div>
  );
}
