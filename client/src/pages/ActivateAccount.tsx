import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, CheckCircle, AlertCircle, Shield, Lock } from "lucide-react";

export default function ActivateAccount() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token") || "";
  const [, navigate] = useLocation();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [activated, setActivated] = useState(false);

  // Validate token
  const { data: tokenData, isLoading: validating, error: tokenError } = trpc.auth.validateActivationToken.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  // Activate mutation
  const activateMutation = trpc.auth.activateAccount.useMutation({
    onSuccess: () => {
      setActivated(true);
      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        navigate("/dashboard");
      }, 2000);
    },
    onError: (err) => {
      setError(err.message || "Aktivierung fehlgeschlagen");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Das Passwort muss mindestens 8 Zeichen lang sein");
      return;
    }
    if (password !== confirmPassword) {
      setError("Die Passwörter stimmen nicht überein");
      return;
    }

    activateMutation.mutate({ token, password, name: name || undefined });
  };

  // No token provided
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Ungültiger Link</h2>
            <p className="text-muted-foreground mb-4">
              Kein Aktivierungstoken gefunden. Bitte verwenden Sie den Link aus Ihrer Bestätigungs-E-Mail.
            </p>
            <Button variant="outline" onClick={() => navigate("/login")}>
              Zur Anmeldung
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading
  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-muted-foreground">Aktivierungslink wird überprüft...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Token invalid/expired
  if (tokenError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Link ungültig oder abgelaufen</h2>
            <p className="text-muted-foreground mb-4">
              {tokenError.message || "Dieser Aktivierungslink ist nicht mehr gültig. Bitte kontaktieren Sie den Support."}
            </p>
            <Button variant="outline" onClick={() => navigate("/login")}>
              Zur Anmeldung
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (activated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Konto aktiviert!</h2>
            <p className="text-muted-foreground mb-4">
              Ihr Konto wurde erfolgreich eingerichtet. Sie werden jetzt zum Dashboard weitergeleitet...
            </p>
            <div className="animate-pulse text-sm text-muted-foreground">Weiterleitung...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Password strength indicator
  const getPasswordStrength = (pw: string) => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
  };

  const strength = getPasswordStrength(password);
  const strengthLabel = ["", "Schwach", "Mittel", "Gut", "Stark", "Sehr stark"][strength] || "";
  const strengthColor = ["", "bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-green-500", "bg-green-600"][strength] || "";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Shield className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-2xl">Konto aktivieren</CardTitle>
          <CardDescription className="mt-2">
            Willkommen bei SimplaPOS! Bitte legen Sie Ihr Passwort fest, um Ihr Konto zu aktivieren.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tokenData && (
            <div className="mb-6 p-3 rounded-lg bg-muted/50 border text-sm">
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">E-Mail:</span> {tokenData.email}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name (optional)</Label>
              <Input
                id="name"
                type="text"
                placeholder="Ihr vollständiger Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Passwort</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Mindestens 8 Zeichen"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 pr-10"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {password && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          i <= strength ? strengthColor : "bg-muted"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{strengthLabel}</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  placeholder="Passwort wiederholen"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-9 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-500">Die Passwörter stimmen nicht überein</p>
              )}
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-500 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={activateMutation.isPending || !password || !confirmPassword || password !== confirmPassword}
            >
              {activateMutation.isPending ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                  Wird aktiviert...
                </>
              ) : (
                "Konto aktivieren & Anmelden"
              )}
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t text-center">
            <p className="text-xs text-muted-foreground">
              Mit der Aktivierung akzeptieren Sie unsere{" "}
              <a href="#" className="underline hover:text-foreground">AGB</a> und{" "}
              <a href="#" className="underline hover:text-foreground">Datenschutzerklärung</a>.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
