import { useState } from "react";
import { useLocation, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, UserPlus, Eye, EyeOff } from "lucide-react";

const LOGO_URL = "/manus-storage/simplaPOSLogo.zip-1_cc5313ec.png";

export default function Register() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signupMutation = trpc.auth.signup.useMutation({
    onSuccess: (data) => {
      // Redirect to verification page
      setLocation(`/verify?email=${encodeURIComponent(data.email || email.trim())}`);
    },
    onError: (err) => {
      setError(err.message || "Registrierung fehlgeschlagen");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Bitte geben Sie Ihren Namen ein");
      return;
    }
    if (!email.trim()) {
      setError("Bitte geben Sie Ihre E-Mail-Adresse ein");
      return;
    }
    if (password.length < 8) {
      setError("Das Passwort muss mindestens 8 Zeichen lang sein");
      return;
    }
    if (password !== confirmPassword) {
      setError("Die Passwörter stimmen nicht überein");
      return;
    }

    signupMutation.mutate({ email: email.trim(), password, name: name.trim() });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 text-center">
          <img src={LOGO_URL} alt="SimplaPOS" className="h-12 w-auto" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Konto erstellen</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Registrieren Sie sich kostenlos bei SimplaPOS
            </p>
          </div>
        </div>

        {/* Register Card */}
        <Card className="border shadow-md">
          <CardHeader className="pb-2 pt-5 px-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserPlus className="h-4 w-4 text-primary" />
              <span>Neues Konto</span>
            </div>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive" className="py-2">
                  <AlertDescription className="text-sm">{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Ihr vollständiger Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  autoFocus
                  disabled={signupMutation.isPending}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">E-Mail-Adresse</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="ihre@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  disabled={signupMutation.isPending}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Passwort</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Mindestens 8 Zeichen"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    disabled={signupMutation.isPending}
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

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="Passwort wiederholen"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={signupMutation.isPending}
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={signupMutation.isPending}
              >
                {signupMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Wird erstellt...
                  </>
                ) : (
                  "Registrieren"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          Bereits ein Konto?{" "}
          <Link href="/login" className="text-primary font-medium hover:underline">
            Anmelden
          </Link>
        </p>
      </div>
    </div>
  );
}
