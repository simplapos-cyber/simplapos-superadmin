import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { User, KeyRound, Mail, Shield } from "lucide-react";

export default function Profile() {
  const { user, refresh } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Name erfolgreich geändert");
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Passwort erfolgreich geändert");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleUpdateName = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    updateProfile.mutate({ name: name.trim() });
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwörter stimmen nicht überein");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Neues Passwort muss mindestens 8 Zeichen lang sein");
      return;
    }
    changePassword.mutate({ currentPassword, newPassword });
  };

  const roleLabels: Record<string, string> = {
    superadmin: "Superadmin",
    admin: "Administrator",
    kellner: "Kellner",
    koch: "Koch",
    buchhalter: "Buchhalter",
    gast: "Gast",
    partner: "Partner",
    user: "Benutzer",
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Mein Profil</h1>
        <p className="text-muted-foreground mt-1">
          Verwalten Sie Ihre persönlichen Daten und Ihr Passwort
        </p>
      </div>

      {/* Account Info (read-only) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Kontoinformationen
          </CardTitle>
          <CardDescription>Diese Informationen können nicht geändert werden</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3" /> E-Mail-Adresse
              </Label>
              <p className="text-sm font-medium">{user?.email}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Rolle</Label>
              <p className="text-sm font-medium">{roleLabels[user?.role || ""] || user?.role}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Name ändern */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Name ändern
          </CardTitle>
          <CardDescription>Ihr Anzeigename im System</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateName} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ihr Name"
              />
            </div>
            <Button type="submit" disabled={updateProfile.isPending || name === user?.name}>
              {updateProfile.isPending ? "Wird gespeichert..." : "Name speichern"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Separator />

      {/* Passwort ändern */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Passwort ändern
          </CardTitle>
          <CardDescription>Wählen Sie ein sicheres Passwort mit mindestens 8 Zeichen</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="currentPassword">Aktuelles Passwort</Label>
                <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-primary transition-colors">
                  Passwort vergessen?
                </Link>
              </div>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Ihr aktuelles Passwort"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">Neues Passwort</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mindestens 8 Zeichen"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Neues Passwort bestätigen</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Passwort wiederholen"
                required
              />
            </div>
            <Button type="submit" disabled={changePassword.isPending}>
              {changePassword.isPending ? "Wird geändert..." : "Passwort ändern"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
