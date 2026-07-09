import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Search, Store, MapPin, Phone, Mail, ExternalLink, Trash2 } from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Aktiv", variant: "default" },
  trial: { label: "Trial", variant: "secondary" },
  inactive: { label: "Inaktiv", variant: "outline" },
  suspended: { label: "Gesperrt", variant: "destructive" },
};

export default function Restaurants() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newStatus, setNewStatus] = useState<"active" | "inactive" | "suspended" | "trial">("trial");

  const utils = trpc.useUtils();
  const { data: restaurants, isLoading } = trpc.restaurants.list.useQuery(
    search ? { search } : undefined
  );

  const createMutation = trpc.restaurants.create.useMutation({
    onSuccess: () => {
      utils.restaurants.list.invalidate();
      setShowCreate(false);
      setNewName(""); setNewCity(""); setNewEmail("");
      toast.success("Restaurant erstellt");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.restaurants.delete.useMutation({
    onSuccess: () => { utils.restaurants.list.invalidate(); toast.success("Restaurant gelöscht"); },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!newName.trim()) { toast.error("Name ist erforderlich"); return; }
    createMutation.mutate({ name: newName, city: newCity, email: newEmail, status: newStatus });
  };

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Restaurants</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {restaurants?.length ?? 0} Restaurant{restaurants?.length !== 1 ? "s" : ""} verwaltet
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Restaurant hinzufügen
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Suchen..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : restaurants?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Store className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">Noch keine Restaurants vorhanden</p>
          <Button variant="outline" className="mt-4" onClick={() => setShowCreate(true)}>
            Erstes Restaurant erstellen
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {restaurants?.map((r: any) => {
            const status = STATUS_LABELS[r.status] ?? STATUS_LABELS.trial;
            return (
              <Card
                key={r.id}
                className="hover:shadow-md transition-all cursor-pointer group"
                onClick={() => setLocation(`/restaurants/${r.id}`)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        {r.logoUrl ? (
                          <img src={r.logoUrl} alt={r.name} className="h-8 w-8 object-contain rounded" />
                        ) : (
                          <Store className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{r.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{r.slug ?? "—"}</p>
                      </div>
                    </div>
                    <Badge variant={status.variant} className="shrink-0">{status.label}</Badge>
                  </div>

                  <div className="space-y-1.5 text-sm text-muted-foreground">
                    {r.city && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{r.city}, {r.country ?? "CH"}</span>
                      </div>
                    )}
                    {r.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{r.phone}</span>
                      </div>
                    )}
                    {r.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{r.email}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-3 border-t">
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>{r.totalOrders ?? 0} Bestellungen</span>
                      <span>CHF {Number(r.totalRevenue ?? 0).toFixed(0)}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); setLocation(`/restaurants/${r.id}`); }}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`"${r.name}" wirklich löschen?`)) deleteMutation.mutate({ id: r.id });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neues Restaurant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input placeholder="Restaurant Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Stadt</Label>
              <Input placeholder="Zürich" value={newCity} onChange={(e) => setNewCity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>E-Mail</Label>
              <Input type="email" placeholder="info@restaurant.ch" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="active">Aktiv</SelectItem>
                  <SelectItem value="inactive">Inaktiv</SelectItem>
                  <SelectItem value="suspended">Gesperrt</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Abbrechen</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Erstelle..." : "Erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
