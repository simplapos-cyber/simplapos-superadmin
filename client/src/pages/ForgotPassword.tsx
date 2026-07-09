import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, ArrowLeft, KeyRound, CheckCircle } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

const LOGO_URL = "/manus-storage/simplaPOSLogo_zip-1_a9c1f2e8.png";

type Step = "email" | "code" | "success";

export default function ForgotPassword() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const requestReset = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => setStep("code"),
    onError: (err) => setError(err.message),
  });

  const resetPassword = trpc.auth.resetPassword.useMutation({
    onSuccess: () => setStep("success"),
    onError: (err) => setError(err.message),
  });

  const handleRequestReset = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    requestReset.mutate({ email });
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Passwörter stimmen nicht überein");
      return;
    }
    if (newPassword.length < 8) {
      setError("Passwort muss mindestens 8 Zeichen lang sein");
      return;
    }
    resetPassword.mutate({ email, code, newPassword });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <img src={LOGO_URL} alt="SimplaPOS" className="h-8 mb-6" />

      {step === "email" && (
        <>
          <h1 className="text-2xl font-bold mb-2">Passwort vergessen?</h1>
          <p className="text-muted-foreground mb-6 text-center max-w-sm">
            Geben Sie Ihre E-Mail-Adresse ein. Sie erhalten einen 6-stelligen Code zum Zurücksetzen.
          </p>
          <Card className="w-full max-w-sm">
            <CardContent className="pt-6">
              <form onSubmit={handleRequestReset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-Mail-Adresse</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="ihre@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={requestReset.isPending}>
                  {requestReset.isPending ? "Wird gesendet..." : "Code anfordern"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}

      {step === "code" && (
        <>
          <h1 className="text-2xl font-bold mb-2">Neues Passwort setzen</h1>
          <p className="text-muted-foreground mb-6 text-center max-w-sm">
            Geben Sie den 6-stelligen Code ein, den Sie per E-Mail erhalten haben, und wählen Sie ein neues Passwort.
          </p>
          <Card className="w-full max-w-sm">
            <CardContent className="pt-6">
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label>Verifizierungscode</Label>
                  <div className="flex justify-center">
                    <InputOTP maxLength={6} value={code} onChange={setCode}>
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">Neues Passwort</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="newPassword"
                      type="password"
                      placeholder="Mindestens 8 Zeichen"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Passwort wiederholen"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={resetPassword.isPending}>
                  {resetPassword.isPending ? "Wird gespeichert..." : "Passwort zurücksetzen"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}

      {step === "success" && (
        <>
          <div className="flex flex-col items-center text-center">
            <CheckCircle className="h-12 w-12 text-emerald-500 mb-4" />
            <h1 className="text-2xl font-bold mb-2">Passwort geändert!</h1>
            <p className="text-muted-foreground mb-6">
              Ihr Passwort wurde erfolgreich zurückgesetzt. Sie können sich jetzt anmelden.
            </p>
            <Link href="/login">
              <Button>Zum Login</Button>
            </Link>
          </div>
        </>
      )}

      <div className="mt-6">
        <Link href="/login" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Zurück zum Login
        </Link>
      </div>
    </div>
  );
}
