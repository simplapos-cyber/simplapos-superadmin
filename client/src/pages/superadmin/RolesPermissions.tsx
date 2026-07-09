import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Edit } from "lucide-react";

const ROLES = [
  {
    role: "superadmin",
    label: "Superadmin",
    color: "bg-red-100 text-red-800",
    permissions: ["Alle Rechte", "System verwalten", "Benutzer verwalten", "Verträge", "Finanzen", "Audit Logs"],
  },
  {
    role: "partner",
    label: "Partner",
    color: "bg-purple-100 text-purple-800",
    permissions: ["Verträge erstellen", "Kunden verwalten", "Provisionen einsehen", "Leads verwalten"],
  },
  {
    role: "admin",
    label: "Restaurant Admin",
    color: "bg-blue-100 text-blue-800",
    permissions: ["Restaurant verwalten", "Mitarbeiter", "Speisekarte", "Bestellungen", "Statistiken", "Module"],
  },
  {
    role: "manager",
    label: "Manager",
    color: "bg-cyan-100 text-cyan-800",
    permissions: ["Bestellungen", "Tischplan", "Personal überwachen", "Statistiken lesen"],
  },
  {
    role: "kellner",
    label: "Kellner",
    color: "bg-green-100 text-green-800",
    permissions: ["Bestellungen aufnehmen", "Tischplan sehen", "Kassieren", "Eigene Umsätze"],
  },
  {
    role: "koch",
    label: "Küche",
    color: "bg-orange-100 text-orange-800",
    permissions: ["Küchenmonitor lesen", "Bestellstatus aktualisieren"],
  },
  {
    role: "bar",
    label: "Bar",
    color: "bg-yellow-100 text-yellow-800",
    permissions: ["Bar-Monitor lesen", "Bestellstatus aktualisieren"],
  },
  {
    role: "buchhalter",
    label: "Treuhand",
    color: "bg-indigo-100 text-indigo-800",
    permissions: ["Umsätze lesen", "Abschlüsse lesen", "MwSt lesen", "Rechnungen lesen", "Export"],
  },
  {
    role: "gast",
    label: "Gast",
    color: "bg-gray-100 text-gray-800",
    permissions: ["Treuepunkte", "Geschenkkarten", "Eigene Rechnungen", "QR Bestellungen"],
  },
];

export default function RolesPermissions() {
  return (
    
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6" /> Rollen & Rechte
            </h1>
            <p className="text-muted-foreground mt-1">Übersicht aller Systemrollen und deren Berechtigungen</p>
          </div>
        </div>

        <div className="grid gap-4">
          {ROLES.map((r) => (
            <Card key={r.role}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${r.color}`}>{r.label}</span>
                    <span className="text-muted-foreground font-normal text-sm">({r.role})</span>
                  </CardTitle>
                  <Button variant="outline" size="sm">
                    <Edit className="h-3.5 w-3.5 mr-1" /> Bearbeiten
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {r.permissions.map((p) => (
                    <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    
  );
}
