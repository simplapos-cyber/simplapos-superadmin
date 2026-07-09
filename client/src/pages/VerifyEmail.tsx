import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, MailCheck, RotateCcw } from "lucide-react";

const LOGO_URL = "/manus-storage/simplaPOSLogo.zip-1_cc5313ec.png";

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const emailFromQuery = params.get("email") || "";

  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const utils = trpc.useUtils();

  const verifyMutation = trpc.auth.verifyEmail.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      setLocation("/dashboard");
    },
    onError: (err) => {
      setError(err.message || "Verifizierung fehlgeschlagen");
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    },
  });

  const resendMutation = trpc.auth.resendCode.useMutation({
    onSuccess: () => {
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 5000);
    },
    onError: (err) => {
      setError(err.message || "Code konnte nicht erneut gesendet werden");
    },
  });

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);
    setError(null);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (newCode.every(d => d !== "") && value) {
      verifyMutation.mutate({
        email: emailFromQuery,
        code: newCode.join(""),
      });
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      const newCode = pasted.split("");
      setCode(newCode);
      inputRefs.current[5]?.focus();
      verifyMutation.mutate({ email: emailFromQuery, code: pasted });
    }
  };

  const handleResend = () => {
    setError(null);
    resendMutation.mutate({ email: emailFromQuery });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 text-center">
          <img src={LOGO_URL} alt="SimplaPOS" className="h-12 w-auto" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">E-Mail verifizieren</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Wir haben einen 6-stelligen Code an{" "}
              <span className="font-medium text-foreground">{emailFromQuery}</span>{" "}
              gesendet
            </p>
          </div>
        </div>

        {/* Verify Card */}
        <Card className="border shadow-md">
          <CardHeader className="pb-2 pt-5 px-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MailCheck className="h-4 w-4 text-primary" />
              <span>Verifizierungscode eingeben</span>
            </div>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <div className="space-y-4">
              {error && (
                <Alert variant="destructive" className="py-2">
                  <AlertDescription className="text-sm">{error}</AlertDescription>
                </Alert>
              )}

              {resendSuccess && (
                <Alert className="py-2 border-green-200 bg-green-50 text-green-800">
                  <AlertDescription className="text-sm">
                    Neuer Code wurde gesendet!
                  </AlertDescription>
                </Alert>
              )}

              {/* 6-digit code input */}
              <div className="flex gap-2 justify-center" onPaste={handlePaste}>
                {code.map((digit, i) => (
                  <Input
                    key={i}
                    ref={el => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleChange(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(i, e)}
                    className="w-11 h-12 text-center text-lg font-semibold"
                    disabled={verifyMutation.isPending}
                  />
                ))}
              </div>

              {verifyMutation.isPending && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Wird verifiziert...
                </div>
              )}

              <div className="flex flex-col items-center gap-2 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResend}
                  disabled={resendMutation.isPending}
                  className="text-muted-foreground"
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  {resendMutation.isPending ? "Wird gesendet..." : "Code erneut senden"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Der Code ist 15 Minuten gültig
        </p>
      </div>
    </div>
  );
}
