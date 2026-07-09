import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollText, Download, Search } from "lucide-react";

const SAMPLE_LOGS = [
  { time: "11.06.2026 02:15", user: "superadmin@simplapos.com", action: "LOGIN", resource: "Auth", ip: "185.12.34.56", status: "Erfolg" },
  { time: "11.06.2026 02:10", user: "admin@simplapos.com", action: "UPDATE", resource: "Restaurant #1", ip: "91.200.12.3", status: "Erfolg" },
  { time: "11.06.2026 01:58", user: "vertrag@simplapos.com", action: "CREATE", resource: "Vertrag #42", ip: "77.56.78.9", status: "Erfolg" },
  { time: "11.06.2026 01:45", user: "unknown@test.com", action: "LOGIN", resource: "Auth", ip: "103.45.67.8", status: "Fehler" },
  { time: "11.06.2026 01:30", user: "superadmin@simplapos.com", action: "DELETE", resource: "Benutzer #7", ip: "185.12.34.56", status: "Erfolg" },
];

export default function AuditLogs() {
  return (
    
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ScrollText className="h-6 w-6" /> Audit Logs
            </h1>
            <p className="text-muted-foreground mt-1">Sicherheitsrelevante Systemaktionen</p>
          </div>
          <Button variant="outline"><Download className="h-4 w-4 mr-2" /> Exportieren</Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Benutzer oder Ressource suchen..." className="pl-9" />
              </div>
              <Select>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Aktion" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Aktionen</SelectItem>
                  <SelectItem value="login">LOGIN</SelectItem>
                  <SelectItem value="create">CREATE</SelectItem>
                  <SelectItem value="update">UPDATE</SelectItem>
                  <SelectItem value="delete">DELETE</SelectItem>
                </SelectContent>
              </Select>
              <Select>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="success">Erfolg</SelectItem>
                  <SelectItem value="error">Fehler</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-4">Zeitstempel</th>
                    <th className="text-left py-2 pr-4">Benutzer</th>
                    <th className="text-left py-2 pr-4">Aktion</th>
                    <th className="text-left py-2 pr-4">Ressource</th>
                    <th className="text-left py-2 pr-4">IP-Adresse</th>
                    <th className="text-left py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {SAMPLE_LOGS.map((log, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2.5 pr-4 font-mono text-xs">{log.time}</td>
                      <td className="py-2.5 pr-4">{log.user}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant="outline" className="text-xs">{log.action}</Badge>
                      </td>
                      <td className="py-2.5 pr-4">{log.resource}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs">{log.ip}</td>
                      <td className="py-2.5">
                        <Badge className={log.status === "Erfolg" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                          {log.status}
                        </Badge>
                      </td>
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
