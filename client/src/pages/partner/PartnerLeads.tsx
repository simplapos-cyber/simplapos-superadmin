import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Target, Plus, Search } from "lucide-react";
import { toast } from "sonner";

const LEADS = [
  { name: "Anna Bauer", company: "Café Central", email: "anna@cafe-central.ch", phone: "+41 79 123 45 67", status: "Qualifiziert", created: "08.06.2026" },
  { name: "Peter Schmid", company: "Pizzeria Roma", email: "p.schmid@roma.ch", phone: "+41 76 987 65 43", status: "Kontaktiert", created: "05.06.2026" },
  { name: "Lisa Weber", company: "Thai Garden", email: "lisa@thai-garden.ch", phone: "+41 78 555 12 34", status: "Neu", created: "01.06.2026" },
  { name: "Hans Keller", company: "Steakhouse Zürich", email: "h.keller@steakhouse.ch", phone: "+41 79 444 55 66", status: "Abgeschlossen", created: "20.05.2026" },
];

const STATUS_COLORS: Record<string, string> = {
  Neu: "bg-blue-100 text-blue-800",
  Kontaktiert: "bg-yellow-100 text-yellow-800",
  Qualifiziert: "bg-purple-100 text-purple-800",
  Abgeschlossen: "bg-green-100 text-green-800",
  Verloren: "bg-red-100 text-red-800",
};

export default function PartnerLeads() {
  return (
    
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Target className="h-6 w-6" /> Leads
            </h1>
            <p className="text-muted-foreground mt-1">Potenzielle Neukunden verwalten</p>
          </div>
          <Button onClick={() => toast.info("Lead-Formular wird in Kürze verfügbar sein")}>
            <Plus className="h-4 w-4 mr-2" /> Neuer Lead
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Lead suchen..." className="pl-9" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-4">Name</th>
                    <th className="text-left py-2 pr-4">Unternehmen</th>
                    <th className="text-left py-2 pr-4">E-Mail</th>
                    <th className="text-left py-2 pr-4">Telefon</th>
                    <th className="text-left py-2 pr-4">Status</th>
                    <th className="text-left py-2">Erstellt</th>
                  </tr>
                </thead>
                <tbody>
                  {LEADS.map((l, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2.5 pr-4 font-medium">{l.name}</td>
                      <td className="py-2.5 pr-4">{l.company}</td>
                      <td className="py-2.5 pr-4 text-xs">{l.email}</td>
                      <td className="py-2.5 pr-4 text-xs">{l.phone}</td>
                      <td className="py-2.5 pr-4">
                        <Badge className={STATUS_COLORS[l.status] ?? "bg-gray-100 text-gray-800"}>{l.status}</Badge>
                      </td>
                      <td className="py-2.5 text-xs">{l.created}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    
  );
}
