import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, MessageSquare, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ModuleGate } from "@/components/ModuleGate";

function BewertungenInner() {
  const { user } = useAuth();
  const restaurantId = user?.restaurantId ?? 0;
  const [platform, setPlatform] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [form, setForm] = useState({
    platform: "google" as "google" | "tripadvisor" | "yelp" | "other",
    reviewerName: "",
    rating: "5",
    reviewText: "",
    reviewDate: new Date().toISOString().slice(0, 10),
    externalId: "",
  });

  const { data: reviews, refetch } = trpc.bewertungen.list.useQuery(
    {
      restaurantId,
      platform: platform !== "all" ? platform as any : undefined,
      status: status !== "all" ? status as any : undefined,
    },
    { enabled: !!restaurantId }
  );

  const addReview = trpc.bewertungen.create.useMutation({
    onSuccess: () => { refetch(); setOpen(false); toast.success("Bewertung hinzugefügt"); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateStatus = trpc.bewertungen.updateStatus.useMutation({
    onSuccess: () => refetch(),
    onError: (e: any) => toast.error(e.message),
  });

  const addReply = trpc.bewertungen.respond.useMutation({
    onSuccess: () => { refetch(); setReplyOpen(null); setReplyText(""); toast.success("Antwort gespeichert"); },
    onError: (e: any) => toast.error(e.message),
  });

  const platformColor: Record<string, string> = {
    google: "bg-blue-100 text-blue-800",
    tripadvisor: "bg-green-100 text-green-800",
    yelp: "bg-red-100 text-red-800",
    other: "bg-gray-100 text-gray-800",
  };

  const statusColor: Record<string, string> = {
    neu: "bg-yellow-100 text-yellow-800",
    gelesen: "bg-blue-100 text-blue-800",
    beantwortet: "bg-green-100 text-green-800",
    archiviert: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bewertungsmanagement</h1>
          <p className="text-muted-foreground text-sm">Google, TripAdvisor & Yelp Bewertungen im Überblick</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2"><Plus className="w-4 h-4" />Bewertung erfassen</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Neue Bewertung erfassen</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Plattform</Label>
                <Select value={form.platform} onValueChange={v => setForm(f => ({ ...f, platform: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google">Google</SelectItem>
                    <SelectItem value="tripadvisor">TripAdvisor</SelectItem>
                    <SelectItem value="yelp">Yelp</SelectItem>
                    <SelectItem value="other">Andere</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Name des Bewerters</Label>
                <Input value={form.reviewerName} onChange={e => setForm(f => ({ ...f, reviewerName: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Bewertung (1–5)</Label>
                  <Select value={form.rating} onValueChange={v => setForm(f => ({ ...f, rating: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1,2,3,4,5].map(n => <SelectItem key={n} value={n.toString()}>{n} Sterne</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Datum</Label>
                  <Input type="date" value={form.reviewDate} onChange={e => setForm(f => ({ ...f, reviewDate: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Bewertungstext</Label>
                <Textarea value={form.reviewText} onChange={e => setForm(f => ({ ...f, reviewText: e.target.value }))} rows={3} />
              </div>
              <Button
                className="w-full"
                onClick={() => addReview.mutate({ restaurantId, platform: form.platform, authorName: form.reviewerName, rating: form.rating, reviewText: form.reviewText, reviewDate: form.reviewDate, externalId: form.externalId || undefined })}
                disabled={addReview.isPending}
              >
                {addReview.isPending ? "Speichern..." : "Bewertung speichern"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filter */}
      <div className="flex gap-3 flex-wrap">
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Plattform" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Plattformen</SelectItem>
            <SelectItem value="google">Google</SelectItem>
            <SelectItem value="tripadvisor">TripAdvisor</SelectItem>
            <SelectItem value="yelp">Yelp</SelectItem>
            <SelectItem value="other">Andere</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            <SelectItem value="neu">Neu</SelectItem>
            <SelectItem value="gelesen">Gelesen</SelectItem>
            <SelectItem value="beantwortet">Beantwortet</SelectItem>
            <SelectItem value="archiviert">Archiviert</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bewertungsliste */}
      <div className="space-y-3">
        {!(reviews as any[])?.length ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Noch keine Bewertungen erfasst.</CardContent></Card>
        ) : (
          (reviews as any[]).map((r: any) => (
            <Card key={r.id}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={platformColor[r.platform] ?? ""}>{r.platform}</Badge>
                    <Badge className={statusColor[r.status] ?? ""}>{r.status}</Badge>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`w-4 h-4 ${i < r.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
                      ))}
                    </div>
                    <span className="text-sm font-medium">{r.authorName}</span>
                    <span className="text-xs text-muted-foreground">{new Date(r.reviewDate).toLocaleDateString("de-CH")}</span>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {r.status === "neu" && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: r.id, restaurantId, status: "gelesen" })}>
                        Gelesen
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => { setReplyOpen(r.id); setReplyText(r.replyText ?? ""); }}>
                      <MessageSquare className="w-3 h-3 mr-1" />Antworten
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => updateStatus.mutate({ id: r.id, restaurantId, status: "archiviert" })}>
                      Archivieren
                    </Button>
                  </div>
                </div>
                {r.reviewText && <p className="text-sm text-muted-foreground">{r.reviewText}</p>}
                {r.responseText && (
                  <div className="bg-muted/50 rounded p-3 text-sm">
                    <p className="font-medium text-xs mb-1">Ihre Antwort:</p>
                    <p>{r.responseText}</p>
                  </div>
                )}
                {replyOpen === r.id && (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Ihre Antwort auf diese Bewertung..."
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button size="sm"                     onClick={() => addReply.mutate({ id: r.id, restaurantId, responseText: replyText })} disabled={addReply.isPending}>
                        Antwort speichern
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setReplyOpen(null)}>Abbrechen</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

export default function Bewertungen() {
  return (
    <ModuleGate moduleId="bewertungsmanagement">
      <BewertungenInner />
    </ModuleGate>
  );
}
