import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Settings, Mail, CreditCard, Shield, Bell, Save } from "lucide-react";
import { toast } from "sonner";

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-4 w-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
        <div className="pt-2">
          <Button size="sm" onClick={() => toast.success("Einstellungen gespeichert")}>
            <Save className="h-3.5 w-3.5 mr-1.5" /> Speichern
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SystemSettings() {
  return (
    
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" /> Systemeinstellungen
          </h1>
          <p className="text-muted-foreground mt-1">Globale Konfiguration des SimplaPOS-Systems</p>
        </div>

        <Section icon={Settings} title="Allgemein">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Systemname</Label>
              <Input defaultValue="SimplaPOS" />
            </div>
            <div className="space-y-1.5">
              <Label>Support-E-Mail</Label>
              <Input defaultValue="support@simplapos.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Support-Telefon</Label>
              <Input defaultValue="+41 (0)44 000 00 00" />
            </div>
            <div className="space-y-1.5">
              <Label>Standardsprache</Label>
              <Input defaultValue="Deutsch (CH)" />
            </div>
          </div>
        </Section>

        <Section icon={Mail} title="E-Mail-Einstellungen (SMTP)">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>SMTP-Server</Label>
              <Input defaultValue="smtp.simplapos.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Port</Label>
              <Input defaultValue="587" />
            </div>
            <div className="space-y-1.5">
              <Label>Benutzername</Label>
              <Input defaultValue="noreply@simplapos.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Passwort</Label>
              <Input type="password" defaultValue="••••••••" />
            </div>
          </div>
        </Section>

        <Section icon={CreditCard} title="Zahlungseinstellungen (Stripe)">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Publishable Key</Label>
              <Input defaultValue="pk_test_..." />
            </div>
            <div className="space-y-1.5">
              <Label>Secret Key</Label>
              <Input type="password" defaultValue="sk_test_..." />
            </div>
            <div className="space-y-1.5">
              <Label>Webhook Secret</Label>
              <Input type="password" defaultValue="whsec_..." />
            </div>
          </div>
        </Section>

        <Section icon={Shield} title="Sicherheit">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Zwei-Faktor-Authentifizierung (2FA)</p>
                <p className="text-xs text-muted-foreground">Für alle Admin-Konten erzwingen</p>
              </div>
              <Switch />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Session-Timeout</p>
                <p className="text-xs text-muted-foreground">Automatische Abmeldung nach Inaktivität</p>
              </div>
              <Input className="w-28" defaultValue="60 Min." />
            </div>
          </div>
        </Section>

        <Section icon={Bell} title="Benachrichtigungen">
          <div className="space-y-4">
            {[
              { label: "Neue Vertragsanfragen", desc: "E-Mail bei neuen Verträgen" },
              { label: "Systemfehler", desc: "Sofortige Benachrichtigung bei kritischen Fehlern" },
              { label: "Zahlungseingänge", desc: "Bestätigung bei erfolgreichen Zahlungen" },
              { label: "Neue Benutzerregistrierungen", desc: "Tägliche Zusammenfassung" },
            ].map((n) => (
              <div key={n.label} className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{n.label}</p>
                  <p className="text-xs text-muted-foreground">{n.desc}</p>
                </div>
                <Switch defaultChecked />
              </div>
            ))}
          </div>
        </Section>
      </div>
    
  );
}
