import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Download, Search } from "lucide-react";

const LOGS = [
  { time: "11.06.2026 02:20", user: "superadmin@simplapos.com", role: "superadmin", activity: "Benutzer erstellt", details: "gast@simplapos.com", restaurant: "-" },
  { time: "11.06.2026 02:15", user: "admin@simplapos.com", role: "admin", activity: "Speisekarte aktualisiert", details: "Kategorie Vorspeisen", restaurant: "Ristorante Bella" },
  { time: "11.06.2026 02:08", user: "vertrag@simplapos.com", role: "partner", activity: "Vertrag erstellt", details: "Vertrag #42", restaurant: "-" },
  { time: "11.06.2026 01:55", user: "admin@simplapos.com", role: "admin", activity: "Mitarbeiter hinzugefügt", details: "Max Muster (Kellner)", restaurant: "Ristorante Bella" },
  { time: "11.06.2026 01:40", user: "superadmin@simplapos.com", role: "superadmin", activity: "Systemeinstellungen geändert", details: "Support-Email aktualisiert", restaurant: "-" },
];

const ROLE_COLORS: Record<string, string> = {
  superadmin: "bg-red-100 text-red-800",
  partner: "bg-purple-100 text-purple-800",
  admin: "bg-blue-100 text-blue-800",
  manager: "bg-cyan-100 text-cyan-800",
  kellner: "bg-green-100 text-green-800",
};

export default function ActivityLogs() {
  return (
    
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6" /> Aktivitätsprotokolle
            </h1>
            <p className="text-muted-foreground mt-1">Alle Benutzeraktionen im System</p>
          </div>
          <Button variant="outline"><Download className="h-4 w-4 mr-2" /> Exportieren</Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Benutzer oder Aktivität suchen..." className="pl-9" />
              </div>
              <Select>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Rolle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Rollen</SelectItem>
                  <SelectItem value="superadmin">Superadmin</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="kellner">Kellner</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-4">Zeit</th>
                    <th className="text-left py-2 pr-4">Benutzer</th>
                    <th className="text-left py-2 pr-4">Rolle</th>
                    <th className="text-left py-2 pr-4">Aktivität</th>
                    <th className="text-left py-2 pr-4">Details</th>
                    <th className="text-left py-2">Restaurant</th>
                  </tr>
                </thead>
                <tbody>
                  {LOGS.map((log, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2.5 pr-4 font-mono text-xs">{log.time}</td>
                      <td className="py-2.5 pr-4 text-xs">{log.user}</td>
                      <td className="py-2.5 pr-4">
                        <Badge className={`text-xs ${ROLE_COLORS[log.role] ?? "bg-gray-100 text-gray-800"}`}>{log.role}</Badge>
                      </td>
                      <td className="py-2.5 pr-4">{log.activity}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground text-xs">{log.details}</td>
                      <td className="py-2.5 text-xs">{log.restaurant}</td>
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
