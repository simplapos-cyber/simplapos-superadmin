import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CreditCard, AlertTriangle, CheckCircle, Clock, Ban, RefreshCw } from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  pending: { label: "Ausstehend", variant: "outline", icon: Clock },
  active: { label: "Aktiv", variant: "default", icon: CheckCircle },
  past_due: { label: "Überfällig", variant: "secondary", icon: AlertTriangle },
  blocked: { label: "Gesperrt", variant: "destructive", icon: Ban },
  cancelled: { label: "Gekündigt", variant: "outline", icon: Ban },
};

export default function Subscriptions() {
  const [activateDialog, setActivateDialog] = useState<{ id: number; restaurantId: number } | null>(null);
  const [months, setMonths] = useState("1");

  const { data: subscriptions, isLoading, refetch } = trpc.subscriptions.list.useQuery();
  const { data: payments } = trpc.subscriptions.allPayments.useQuery();

  const activateMutation = trpc.subscriptions.activate.useMutation({
    onSuccess: () => {
      toast.success("Abonnement aktiviert");
      refetch();
      setActivateDialog(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const blockMutation = trpc.subscriptions.block.useMutation({
    onSuccess: () => {
      toast.success("Abonnement gesperrt");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  const stats = {
    total: subscriptions?.length || 0,
    active: subscriptions?.filter((s: any) => s.status === "active").length || 0,
    pending: subscriptions?.filter((s: any) => s.status === "pending").length || 0,
    pastDue: subscriptions?.filter((s: any) => s.status === "past_due").length || 0,
    blocked: subscriptions?.filter((s: any) => s.status === "blocked").length || 0,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Abonnements</h1>
          <p className="text-muted-foreground">Übersicht aller Restaurant-Abonnements und Zahlungen</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Aktualisieren
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Gesamt</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.active}</p>
            <p className="text-xs text-muted-foreground">Aktiv</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
            <p className="text-xs text-muted-foreground">Ausstehend</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-600">{stats.pastDue}</p>
            <p className="text-xs text-muted-foreground">Überfällig</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{stats.blocked}</p>
            <p className="text-xs text-muted-foreground">Gesperrt</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="subscriptions">
        <TabsList>
          <TabsTrigger value="subscriptions">Abonnements</TabsTrigger>
          <TabsTrigger value="payments">Zahlungen</TabsTrigger>
        </TabsList>

        <TabsContent value="subscriptions" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Restaurant</TableHead>
                    <TableHead>Zyklus</TableHead>
                    <TableHead>Betrag/Mt.</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Periode bis</TableHead>
                    <TableHead>Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscriptions?.map((sub: any) => {
                    const config = STATUS_CONFIG[sub.status] || STATUS_CONFIG.pending;
                    const Icon = config.icon;
                    return (
                      <TableRow key={sub.id}>
                        <TableCell className="font-mono text-sm">#{sub.id}</TableCell>
                        <TableCell>Restaurant #{sub.restaurantId}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {sub.billingCycle === "yearly" ? "Jährlich" : "Monatlich"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">CHF {sub.monthlyAmount}</TableCell>
                        <TableCell>
                          <Badge variant={config.variant} className="gap-1">
                            <Icon className="h-3 w-3" />
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {sub.currentPeriodEnd
                            ? new Date(sub.currentPeriodEnd).toLocaleDateString("de-CH")
                            : "–"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {(sub.status === "pending" || sub.status === "blocked" || sub.status === "past_due") && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setActivateDialog({ id: sub.id, restaurantId: sub.restaurantId })}
                              >
                                Aktivieren
                              </Button>
                            )}
                            {sub.status === "active" && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  if (confirm("Abonnement wirklich sperren?")) {
                                    blockMutation.mutate({ subscriptionId: sub.id });
                                  }
                                }}
                              >
                                Sperren
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {(!subscriptions || subscriptions.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Keine Abonnements vorhanden
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Restaurant</TableHead>
                    <TableHead>Betrag</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Beschreibung</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments?.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">
                        {new Date(p.createdAt).toLocaleDateString("de-CH")}
                      </TableCell>
                      <TableCell>Restaurant #{p.restaurantId}</TableCell>
                      <TableCell className="font-medium">
                        {p.currency} {p.amount}
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.status === "succeeded" ? "default" : "destructive"}>
                          {p.status === "succeeded" ? "Bezahlt" : p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.description || "–"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!payments || payments.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Keine Zahlungen vorhanden
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Activate Dialog */}
      <Dialog open={!!activateDialog} onOpenChange={() => setActivateDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abonnement manuell aktivieren</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Hiermit wird das Abonnement für Restaurant #{activateDialog?.restaurantId} manuell aktiviert (z.B. bei Barzahlung oder Banküberweisung).
            </p>
            <div className="space-y-2">
              <Label>Laufzeit (Monate)</Label>
              <Input
                type="number"
                min={1}
                max={12}
                value={months}
                onChange={(e) => setMonths(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivateDialog(null)}>Abbrechen</Button>
            <Button
              onClick={() => {
                if (activateDialog) {
                  activateMutation.mutate({
                    subscriptionId: activateDialog.id,
                    months: parseInt(months) || 1,
                  });
                }
              }}
              disabled={activateMutation.isPending}
            >
              {activateMutation.isPending ? "Wird aktiviert..." : "Aktivieren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
