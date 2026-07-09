import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Megaphone, Trash2, Eye, MousePointerClick } from "lucide-react";

export default function Advertisements() {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", imageUrl: "", linkUrl: "" });
  const utils = trpc.useUtils();

  const { data: ads, isLoading } = trpc.advertisements.list.useQuery();

  const createMutation = trpc.advertisements.create.useMutation({
    onSuccess: () => {
      utils.advertisements.list.invalidate();
      setShowCreate(false);
      setForm({ title: "", imageUrl: "", linkUrl: "" });
      toast.success("Werbung erstellt");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.advertisements.update.useMutation({
    onSuccess: () => { utils.advertisements.list.invalidate(); toast.success("Gespeichert"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.advertisements.delete.useMutation({
    onSuccess: () => { utils.advertisements.list.invalidate(); toast.success("Werbung gelöscht"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Werbeverwaltung</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{ads?.length ?? 0} Werbeanzeigen</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Werbung erstellen
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-32 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : ads?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Megaphone className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">Noch keine Werbeanzeigen vorhanden</p>
          <Button variant="outline" className="mt-4" onClick={() => setShowCreate(true)}>
            Erste Werbung erstellen
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {ads?.map((ad: any) => (
            <Card key={ad.id} className="overflow-hidden hover:shadow-md transition-shadow">
              {ad.imageUrl && (
                <div className="h-40 bg-muted overflow-hidden">
                  <img src={ad.imageUrl} alt={ad.title} className="w-full h-full object-cover" />
                </div>
              )}
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="font-semibold">{ad.title}</h3>
                  <Switch
                    checked={ad.isActive ?? false}
                    onCheckedChange={(v) => updateMutation.mutate({ id: ad.id, isActive: v })}
                  />
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                  <span className="flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" />
                    {ad.impressions ?? 0} Impressionen
                  </span>
                  <span className="flex items-center gap-1">
                    <MousePointerClick className="h-3.5 w-3.5" />
                    {ad.clicks ?? 0} Klicks
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <Badge variant={ad.isActive ? "default" : "secondary"}>
                    {ad.isActive ? "Aktiv" : "Inaktiv"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`"${ad.title}" wirklich löschen?`)) deleteMutation.mutate({ id: ad.id });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neue Werbeanzeige</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Titel *</Label>
              <Input placeholder="Werbetitel" value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Bild-URL</Label>
              <Input placeholder="https://..." value={form.imageUrl} onChange={(e) => setForm(p => ({ ...p, imageUrl: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Link-URL</Label>
              <Input placeholder="https://..." value={form.linkUrl} onChange={(e) => setForm(p => ({ ...p, linkUrl: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Abbrechen</Button>
            <Button
              onClick={() => {
                if (!form.title.trim()) { toast.error("Titel erforderlich"); return; }
                createMutation.mutate({ title: form.title, imageUrl: form.imageUrl || undefined, linkUrl: form.linkUrl || undefined });
              }}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Erstelle..." : "Erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
