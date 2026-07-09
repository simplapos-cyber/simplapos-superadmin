import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Clock, Users, AlertTriangle, Play, Square } from "lucide-react";
import { toast } from "sonner";

const SHIFTS = [
  { name: "Max Müller", role: "Kellner", start: "10:00", end: "18:00", hours: "8.0", status: "Beendet", overtime: false },
  { name: "Anna Bauer", role: "Kellner", start: "14:00", end: "-", hours: "5.5", status: "Aktiv", overtime: false },
  { name: "Peter Schmid", role: "Koch", start: "09:00", end: "-", hours: "10.5", status: "Aktiv", overtime: true },
  { name: "Lisa Weber", role: "Barkeeper", start: "16:00", end: "00:00", hours: "8.0", status: "Geplant", overtime: false },
];

const STATUS_COLORS: Record<string, string> = {
  Aktiv: "bg-green-100 text-green-800",
  Beendet: "bg-gray-100 text-gray-700",
  Geplant: "bg-blue-100 text-blue-800",
};

export default function ManagerShifts() {
  return (
    
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Clock className="h-6 w-6" /> Schichten
            </h1>
            <p className="text-muted-foreground mt-1">Schichtplanung und Zeiterfassung</p>
          </div>
          <Button onClick={() => toast.info("Schicht starten kommt bald")}>
            <Play className="h-4 w-4 mr-2" /> Schicht starten
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: Users, label: "Im Dienst", value: "2", color: "text-green-600" },
            { icon: Clock, label: "Stunden heute", value: "24.0", color: "text-blue-600" },
            { icon: AlertTriangle, label: "Überstunden", value: "1", color: "text-red-600" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-4">
                <s.icon className={`h-5 w-5 ${s.color} mb-1`} />
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <p className="text-sm font-medium">Heute · 11. Juni 2026</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-4">Name</th>
                    <th className="text-left py-2 pr-4">Rolle</th>
                    <th className="text-left py-2 pr-4">Start</th>
                    <th className="text-left py-2 pr-4">Ende</th>
                    <th className="text-left py-2 pr-4">Stunden</th>
                    <th className="text-left py-2 pr-4">Status</th>
                    <th className="text-left py-2">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {SHIFTS.map((s, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2.5 pr-4 font-medium">{s.name}</td>
                      <td className="py-2.5 pr-4 text-xs">{s.role}</td>
                      <td className="py-2.5 pr-4">{s.start}</td>
                      <td className="py-2.5 pr-4">{s.end}</td>
                      <td className="py-2.5 pr-4">
                        <span className={s.overtime ? "text-red-600 font-bold" : ""}>{s.hours} Std.{s.overtime ? " ⚠️" : ""}</span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge className={STATUS_COLORS[s.status]}>{s.status}</Badge>
                      </td>
                      <td className="py-2.5">
                        {s.status === "Aktiv" && (
                          <Button size="sm" variant="outline" onClick={() => toast.success(`Schicht von ${s.name} beendet`)}>
                            <Square className="h-3 w-3 mr-1" /> Beenden
                          </Button>
                        )}
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
