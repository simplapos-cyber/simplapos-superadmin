import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Star, CheckCircle2, XCircle, EyeOff } from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Ausstehend", variant: "secondary" },
  approved: { label: "Genehmigt", variant: "default" },
  rejected: { label: "Abgelehnt", variant: "destructive" },
  hidden: { label: "Verborgen", variant: "outline" },
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i < rating ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}`} />
      ))}
    </div>
  );
}

export default function Reviews() {
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [responseText, setResponseText] = useState<Record<number, string>>({});
  const utils = trpc.useUtils();

  const { data: reviews, isLoading } = trpc.reviews.list.useQuery({
    type: filterType !== "all" ? filterType : undefined,
    status: filterStatus !== "all" ? filterStatus : undefined,
  });

  const updateMutation = trpc.reviews.update.useMutation({
    onSuccess: () => { utils.reviews.list.invalidate(); toast.success("Bewertung aktualisiert"); },
    onError: (e) => toast.error(e.message),
  });

  const handleStatusChange = (id: number, status: string) => {
    updateMutation.mutate({ id, status: status as any });
  };

  const handleResponse = (id: number) => {
    const text = responseText[id];
    if (!text?.trim()) { toast.error("Antwort darf nicht leer sein"); return; }
    updateMutation.mutate({ id, response: text, status: "approved" });
    setResponseText(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bewertungsverwaltung</h1>
        <p className="text-muted-foreground text-sm mt-0.5">{reviews?.length ?? 0} Bewertungen</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            <SelectItem value="pending">Ausstehend</SelectItem>
            <SelectItem value="approved">Genehmigt</SelectItem>
            <SelectItem value="rejected">Abgelehnt</SelectItem>
            <SelectItem value="hidden">Verborgen</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Typ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Typen</SelectItem>
            <SelectItem value="platform">Plattform</SelectItem>
            <SelectItem value="restaurant">Restaurant</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : reviews?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Star className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">Keine Bewertungen gefunden</p>
            </div>
          ) : (
            <div className="divide-y">
              {reviews?.map((r: any) => {
                const status = STATUS_LABELS[r.status] ?? STATUS_LABELS.pending;
                return (
                  <div key={r.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <StarRating rating={r.rating} />
                          <Badge variant={status.variant} className="text-xs">{status.label}</Badge>
                          <Badge variant="outline" className="text-xs">{r.type === "platform" ? "Plattform" : "Restaurant"}</Badge>
                        </div>
                        <p className="font-medium text-sm">{r.guestName ?? "Anonym"}</p>
                        {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
                        {r.response && (
                          <div className="mt-2 pl-3 border-l-2 border-primary/30">
                            <p className="text-xs text-muted-foreground font-medium">Antwort:</p>
                            <p className="text-sm">{r.response}</p>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {r.createdAt ? new Date(r.createdAt).toLocaleDateString("de-CH") : "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                          title="Genehmigen"
                          onClick={() => handleStatusChange(r.id, "approved")}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                          title="Ablehnen"
                          onClick={() => handleStatusChange(r.id, "rejected")}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-gray-500 hover:text-gray-700"
                          title="Verbergen"
                          onClick={() => handleStatusChange(r.id, "hidden")}
                        >
                          <EyeOff className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {/* Response input */}
                    {r.status === "pending" && (
                      <div className="flex gap-2">
                        <Textarea
                          placeholder="Antwort verfassen..."
                          rows={2}
                          className="text-sm"
                          value={responseText[r.id] ?? ""}
                          onChange={(e) => setResponseText(prev => ({ ...prev, [r.id]: e.target.value }))}
                        />
                        <Button size="sm" variant="outline" onClick={() => handleResponse(r.id)}>
                          Antworten
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
