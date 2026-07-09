import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Receipt, Download, Search } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";

export default function AdminInvoices() {
  const [search, setSearch] = useState("");
  const { data: closings } = trpc.closings.getClosings.useQuery({ limit: 50 });

  const filtered = (closings ?? []).filter((c: any) =>
    !search || String(c.id).includes(search) || (c.closingDate ?? "").includes(search)
  );

  const fmt = (v: number) => `CHF ${(v ?? 0).toLocaleString("de-CH", { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Rechnungen</h1>
          <p className="text-muted-foreground text-sm">Tagesabschlüsse und Rechnungsübersicht</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Suche nach Datum oder ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4" /> Abschlüsse
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">Keine Abschlüsse gefunden</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium text-sm">Abschluss #{c.id}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.closingDate ? new Date(c.closingDate).toLocaleDateString("de-CH") : "–"} ·{" "}
                      <Badge variant={c.mode === "auto" ? "default" : "secondary"} className="text-xs">
                        {c.mode === "auto" ? "Automatisch" : "Manuell"}
                      </Badge>
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-bold text-sm">{fmt(c.totalRevenue ?? 0)}</p>
                      <p className="text-xs text-muted-foreground">{c.orderCount ?? 0} Bestellungen</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => alert("PDF-Export kommt bald")}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
