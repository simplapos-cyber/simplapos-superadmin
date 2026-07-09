import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, Image as ImageIcon, Trash2, Copy, FileText } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  logo: "Logo",
  category: "Kategorie",
  product: "Produkt",
  advertisement: "Werbung",
  contract: "Vertrag",
  other: "Sonstiges",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MediaLibrary() {
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const { data: media, isLoading } = trpc.media.list.useQuery(
    filterCategory !== "all" ? { category: filterCategory } : undefined
  );

  const uploadMutation = trpc.media.upload.useMutation({
    onSuccess: () => {
      utils.media.list.invalidate();
      toast.success("Datei hochgeladen");
      setIsUploading(false);
    },
    onError: (e) => { toast.error(e.message); setIsUploading(false); },
  });

  const deleteMutation = trpc.media.delete.useMutation({
    onSuccess: () => { utils.media.list.invalidate(); toast.success("Datei gelöscht"); },
    onError: (e) => toast.error(e.message),
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadMutation.mutate({
        name: file.name,
        base64,
        mimeType: file.type,
        category: "other",
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("URL kopiert");
  };

  const isImage = (mime?: string | null) => mime?.startsWith("image/") ?? false;

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bildbibliothek</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{media?.length ?? 0} Dateien</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            <Upload className="h-4 w-4 mr-2" />
            {isUploading ? "Lädt hoch..." : "Datei hochladen"}
          </Button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Kategorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Kategorien</SelectItem>
            <SelectItem value="logo">Logo</SelectItem>
            <SelectItem value="category">Kategorie</SelectItem>
            <SelectItem value="product">Produkt</SelectItem>
            <SelectItem value="advertisement">Werbung</SelectItem>
            <SelectItem value="contract">Vertrag</SelectItem>
            <SelectItem value="other">Sonstiges</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Card key={i}><CardContent className="p-3"><Skeleton className="aspect-square w-full" /></CardContent></Card>
          ))}
        </div>
      ) : media?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ImageIcon className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">Keine Dateien vorhanden</p>
          <Button variant="outline" className="mt-4" onClick={() => fileInputRef.current?.click()}>
            Erste Datei hochladen
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
          {media?.map((item: any) => (
            <Card key={item.id} className="overflow-hidden group hover:shadow-md transition-shadow">
              <div className="aspect-square bg-muted relative overflow-hidden">
                {isImage(item.mimeType) ? (
                  <img
                    src={item.url}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <FileText className="h-10 w-10 text-muted-foreground/40" />
                  </div>
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleCopyUrl(item.url)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      if (confirm(`"${item.name}" wirklich löschen?`)) deleteMutation.mutate({ id: item.id });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <CardContent className="p-2">
                <p className="text-xs font-medium truncate">{item.name}</p>
                <div className="flex items-center justify-between mt-1">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {CATEGORY_LABELS[item.category] ?? item.category}
                  </Badge>
                  {item.fileSize && (
                    <span className="text-[10px] text-muted-foreground">{formatBytes(item.fileSize)}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
