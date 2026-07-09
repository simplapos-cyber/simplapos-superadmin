/**
 * Marketing.tsx – Admin-Marketing-Dashboard
 *
 * Tabs:
 * 1. Übersicht (Stats + Quick-Actions)
 * 2. Posts (Freigabe-Queue + alle Posts)
 * 3. Plattformen (Instagram, Facebook, Google, TikTok verbinden)
 * 4. Bewertungs-Booster
 * 5. Einstellungen (Polling, Kellner-Kamera, Auto-Approve)
 */

import { useState, useRef, useEffect } from "react";
import { PlatformConnectModal } from "@/components/PlatformConnectModal";
import {
  Camera, Instagram, Facebook, Globe, Music2, Star, Settings,
  CheckCircle, XCircle, Clock, Send, Loader2, Plus, Zap,
  TrendingUp, MessageSquare, Image, BarChart3, RefreshCw,
  Eye, Edit3, Calendar, AlertCircle, Wifi, WifiOff, Video, Play
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ModuleGate } from "@/components/ModuleGate";
import { toast } from "sonner";

// ─── Typen ────────────────────────────────────────────────────────────────────

type Post = {
  id: number;
  imageUrl: string | null;
  videoUrl?: string | null;
  mediaType?: "image" | "video" | null;
  status: string;
  productName: string | null;
  aiAnalysis: string | null;
  captionInstagram: string | null;
  captionFacebook: string | null;
  captionGoogle: string | null;
  captionTiktok: string | null;
  hashtags: string[];
  platforms: string[];
  scheduledAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  sourceType: string | null;
  postType: "post" | "story" | "reel" | "post_and_story" | "post_and_reel" | "story_and_reel" | "all" | null;
  publishResults: Record<string, { success?: boolean; error?: string; postId?: string }> | null;
};

// Format-Optionen (Reel entfernt – verursacht API-Fehler)
const FORMAT_OPTIONS = [
  { value: "post", label: "Beitrag", icon: "📷" },
  { value: "story", label: "Story", icon: "⚡" },
] as const;

type FormatKey = "post" | "story";

// Hilfsfunktion: Set von Formaten → postType-Enum-String
function formatsToPostType(formats: Set<FormatKey>): "post" | "story" | "post_and_story" {
  const hasPost = formats.has("post");
  const hasStory = formats.has("story");
  if (hasPost && hasStory) return "post_and_story";
  if (hasStory) return "story";
  return "post"; // Default
}

// Hilfsfunktion: postType-Enum-String → Set von Formaten
function postTypeToFormats(postType: string | null | undefined): Set<FormatKey> {
  const s = new Set<FormatKey>();
  if (!postType || postType === "post") { s.add("post"); return s; }
  if (postType === "story") { s.add("story"); return s; }
  // Reel-Typen auf post mappen
  if (postType === "reel" || postType === "post_and_reel") { s.add("post"); return s; }
  if (postType === "story_and_reel") { s.add("story"); return s; }
  if (postType === "post_and_story" || postType === "all") { s.add("post"); s.add("story"); return s; }
  s.add("post"); return s;
}

const PLATFORM_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  instagram: { label: "Instagram", color: "bg-gradient-to-r from-purple-500 to-pink-500", icon: <Instagram className="h-4 w-4" /> },
  facebook: { label: "Facebook", color: "bg-blue-600", icon: <Facebook className="h-4 w-4" /> },
  google: { label: "Google", color: "bg-red-500", icon: <Globe className="h-4 w-4" /> },
  tiktok: { label: "TikTok", color: "bg-black", icon: <Music2 className="h-4 w-4" /> },
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending_approval: { label: "Warten auf Freigabe", color: "bg-yellow-100 text-yellow-800" },
  approved: { label: "Freigegeben", color: "bg-green-100 text-green-800" },
  scheduled: { label: "Geplant", color: "bg-blue-100 text-blue-800" },
  published: { label: "Veröffentlicht", color: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "Abgelehnt", color: "bg-red-100 text-red-800" },
  draft: { label: "Entwurf", color: "bg-gray-100 text-gray-800" },
};

// ─── Hilfsfunktionen ────────────────────────────────────────────────────────

function resolveImageUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return `${window.location.origin}${url}`;
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────

function MarketingInner() {
  const [activeTab, setActiveTab] = useState("overview");
  const [editPost, setEditPost] = useState<Post | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadImage, setUploadImage] = useState<string | null>(null);
  const [uploadMime, setUploadMime] = useState("image/jpeg");
  const [uploadProductName, setUploadProductName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMediaType, setUploadMediaType] = useState<"image" | "video">("image");
  const [uploadVideoBase64, setUploadVideoBase64] = useState<string | null>(null); // nur für Vorschau
  const [uploadVideoMime, setUploadVideoMime] = useState("video/mp4");
  const [uploadVideoKey, setUploadVideoKey] = useState<string | null>(null);   // Storage-Key nach Upload
  const [uploadVideoUrl, setUploadVideoUrl] = useState<string | null>(null);   // Storage-URL nach Upload
  const [uploadVideoThumbnails, setUploadVideoThumbnails] = useState<string[]>([]); // Frames vom Server
  const [uploadVideoSignedUrl, setUploadVideoSignedUrl] = useState<string | null>(null); // Signierte URL als Fallback
  const [isUploadingVideo, setIsUploadingVideo] = useState(false); // Video wird hochgeladen
  const [isImageReading, setIsImageReading] = useState(false); // Bild wird gelesen/komprimiert
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const { user } = useAuth();

  // Daten laden
  const { data: stats } = trpc.marketing.getStats.useQuery();
  const { data: pendingPosts } = trpc.marketing.listPosts.useQuery({ status: "pending_approval", limit: 50 });
  const { data: allPosts } = trpc.marketing.listPosts.useQuery({ status: "all", limit: 50 });
  const { data: platforms } = trpc.marketing.getPlatforms.useQuery();
  const { data: reviewStats } = trpc.marketing.getReviewStats.useQuery();
  const { data: settings } = trpc.marketing.getSettings.useQuery();

  // Mutationen
  const approvePost = trpc.marketing.approvePost.useMutation({
    onSuccess: () => { utils.marketing.listPosts.invalidate(); toast.success("Post freigegeben!"); },
    onError: (e) => toast.error(e.message),
  });
  const rejectPost = trpc.marketing.rejectPost.useMutation({
    onSuccess: () => { utils.marketing.listPosts.invalidate(); toast.success("Post abgelehnt"); },
    onError: (e) => toast.error(e.message),
  });
  const updatePost = trpc.marketing.updatePost.useMutation({
    onSuccess: () => { utils.marketing.listPosts.invalidate(); setEditPost(null); toast.success("Post aktualisiert"); },
    onError: (e) => toast.error(e.message),
  });
  const analyzePost = trpc.marketing.analyzeAndGeneratePost.useMutation({
    onSuccess: () => {
      utils.marketing.listPosts.invalidate();
      setUploadDialogOpen(false);
      setUploadImage(null);
      setUploadProductName("");
      setIsUploading(false);
      toast.success("Post erstellt und wartet auf Freigabe!");
    },
    onError: (e) => { setIsUploading(false); toast.error(e.message); },
  });
  const saveSettings = trpc.marketing.saveSettings.useMutation({
    onSuccess: () => { utils.marketing.getSettings.invalidate(); toast.success("Einstellungen gespeichert"); },
    onError: (e) => toast.error(e.message),
  });

  // Hilfsfunktion: Extrahiert 3 Frames aus einem Video-File via Browser Canvas API
  const extractFramesFromVideo = (file: File): Promise<string[]> => {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      const url = URL.createObjectURL(file);
      video.src = url;
      video.muted = true;
      video.playsInline = true;
      const frames: string[] = [];

      const captureFrame = (time: number): Promise<string> => {
        return new Promise((res) => {
          video.currentTime = time;
          const onSeeked = () => {
            video.removeEventListener("seeked", onSeeked);
            const canvas = document.createElement("canvas");
            canvas.width = Math.min(video.videoWidth, 640);
            canvas.height = Math.round(canvas.width * video.videoHeight / Math.max(video.videoWidth, 1));
            const ctx = canvas.getContext("2d");
            if (ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
            res(dataUrl.split(",")[1] || ""); // nur Base64-Teil
          };
          video.addEventListener("seeked", onSeeked);
        });
      };

      video.addEventListener("loadedmetadata", async () => {
        const duration = video.duration || 10;
        const times = [
          duration * 0.1,
          duration * 0.5,
          duration * 0.85,
        ];
        for (const t of times) {
          try {
            const frame = await captureFrame(t);
            if (frame && frame.length > 100) frames.push(frame);
          } catch { /* ignorieren */ }
        }
        URL.revokeObjectURL(url);
        video.remove();
        resolve(frames);
      });

      video.addEventListener("error", () => {
        URL.revokeObjectURL(url);
        resolve([]);
      });

      // Timeout nach 15 Sekunden
      setTimeout(() => { URL.revokeObjectURL(url); resolve(frames); }, 15000);
    });
  };

  // Video hochladen: Browser extrahiert Frames via Canvas, dann Multipart-Upload
  const handleVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Max 200MB
    if (file.size > 200 * 1024 * 1024) {
      toast.error("Video zu gross. Maximale Grösse: 200 MB");
      return;
    }

    // Vorschau-URL erstellen (nur für Anzeige im Dialog)
    const previewUrl = URL.createObjectURL(file);
    setUploadVideoBase64(previewUrl); // missbrauchen für Vorschau-URL
    setUploadVideoMime(file.type || "video/mp4");
    setUploadVideoKey(null);
    setUploadVideoUrl(null);
    setUploadVideoThumbnails([]);
    setUploadVideoSignedUrl(null);
    setUploadImage(null);
    setUploadMediaType("video");
    setIsUploadingVideo(true);
    setUploadDialogOpen(true);

    try {
      // SCHRITT 1: Browser extrahiert 3 Frames via Canvas API (zuverlässig, kein ffmpeg nötig)
      const browserFrames = await extractFramesFromVideo(file);
      console.log(`[Marketing] Browser-Frames extrahiert: ${browserFrames.length}`);

      // SCHRITT 2: Video per Multipart hochladen (kein Base64 - kein JSON-Limit)
      const formData = new FormData();
      formData.append("video", file);

      const resp = await fetch("/api/marketing/upload-video", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Upload fehlgeschlagen" }));
        throw new Error(err.error || "Upload fehlgeschlagen");
      }

      const result = await resp.json() as {
        videoKey: string;
        videoUrl: string;
        thumbnailsBase64: string[];
        videoSignedUrl?: string;
        mimeType: string;
      };

      setUploadVideoKey(result.videoKey);
      setUploadVideoUrl(result.videoUrl);
      setUploadVideoMime(result.mimeType || file.type || "video/mp4");
      setUploadVideoSignedUrl(result.videoSignedUrl || null);

      // Browser-Frames bevorzugen (zuverlässiger als Server-Frames)
      const finalFrames = browserFrames.length > 0 ? browserFrames : (result.thumbnailsBase64 || []);
      setUploadVideoThumbnails(finalFrames);

      if (finalFrames.length > 0) {
        toast.success(`Video hochgeladen! ${finalFrames.length} Screenshots für KI-Analyse bereit.`);
      } else {
        toast.success("Video hochgeladen! KI analysiert das Video.");
      }
    } catch (err: any) {
      toast.error(err.message || "Video-Upload fehlgeschlagen");
      setUploadDialogOpen(false);
    } finally {
      setIsUploadingVideo(false);
    }
  };

  // Bild hochladen
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImageReading(true);
    setUploadDialogOpen(true);
    setUploadImage(null);
    setUploadMediaType("image");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const originalDataUrl = ev.target?.result as string;
      // Bild komprimieren: max 1920px, JPEG Qualität 0.8
      const img = new window.Image();
      img.onload = () => {
        const MAX_SIZE = 1920;
        let { width, height } = img;
        if (width > MAX_SIZE || height > MAX_SIZE) {
          if (width > height) { height = Math.round(height * MAX_SIZE / width); width = MAX_SIZE; }
          else { width = Math.round(width * MAX_SIZE / height); height = MAX_SIZE; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { setUploadImage(originalDataUrl); setUploadMime("image/jpeg"); setUploadDialogOpen(true); return; }
        ctx.drawImage(img, 0, 0, width, height);
        // Qualität schrittweise reduzieren bis < 2MB
        let quality = 0.85;
        let compressed = canvas.toDataURL("image/jpeg", quality);
        while (compressed.length > 2_000_000 && quality > 0.3) {
          quality -= 0.1;
          compressed = canvas.toDataURL("image/jpeg", quality);
        }
        setUploadImage(compressed);
        setUploadMime("image/jpeg");
        setIsImageReading(false);
      };
      img.src = originalDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = () => {
    if (uploadMediaType === "video") {
      if (!uploadVideoKey && !uploadVideoBase64) return;
      if (!uploadProductName.trim()) {
        toast.error("Bitte beschreibe kurz was das Video zeigt.");
        return;
      }
      setIsUploading(true);
      analyzePost.mutate({
        videoKey: uploadVideoKey || undefined,
        videoUrl: uploadVideoUrl || undefined,
        videoThumbnailsBase64: uploadVideoThumbnails.length > 0 ? uploadVideoThumbnails : undefined,
        videoSignedUrl: uploadVideoSignedUrl || undefined,
        mimeType: uploadVideoMime,
        productName: uploadProductName || undefined,
        mediaType: "video",
      });
    } else {
      if (!uploadImage) return;
      setIsUploading(true);
      const base64 = uploadImage.split(",")[1];
      analyzePost.mutate({ imageBase64: base64, mimeType: uploadMime, productName: uploadProductName || undefined, mediaType: "image" });
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Marketing-Autopilot</h1>
          <p className="text-sm text-gray-500 mt-0.5">KI erstellt und veröffentlicht automatisch auf allen Plattformen</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera className="h-4 w-4" />
            Foto hochladen
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => videoInputRef.current?.click()}
          >
            <Video className="h-4 w-4" />
            Video hochladen
          </Button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
          <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoSelect} />
          {(pendingPosts?.length ?? 0) > 0 && (
            <Badge className="bg-yellow-500 text-white px-3 py-1.5 text-sm">
              {pendingPosts?.length} warten auf Freigabe
            </Badge>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview" className="gap-2">
            <BarChart3 className="h-4 w-4" /> Übersicht
          </TabsTrigger>
          <TabsTrigger value="posts" className="gap-2">
            <Image className="h-4 w-4" /> Posts
            {(pendingPosts?.length ?? 0) > 0 && (
              <span className="ml-1 rounded-full bg-yellow-500 text-white text-xs px-1.5 py-0.5">{pendingPosts?.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="platforms" className="gap-2">
            <Globe className="h-4 w-4" /> Plattformen
          </TabsTrigger>
          <TabsTrigger value="reviews" className="gap-2">
            <Star className="h-4 w-4" /> Bewertungen
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" /> Einstellungen
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Übersicht ─────────────────────────────────────────────────── */}
        <TabsContent value="overview">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard icon={<Image className="h-5 w-5 text-purple-600" />} label="Posts gesamt" value={stats?.totalPosts ?? 0} bg="bg-purple-50" />
            <StatCard icon={<CheckCircle className="h-5 w-5 text-green-600" />} label="Veröffentlicht" value={stats?.publishedThisWeek ?? 0} bg="bg-green-50" />
            <StatCard icon={<Clock className="h-5 w-5 text-yellow-600" />} label="Ausstehend" value={stats?.pendingApproval ?? 0} bg="bg-yellow-50" />
            <StatCard icon={<Star className="h-5 w-5 text-orange-600" />} label="Bewertungs-SMS" value={reviewStats?.sentThisWeek ?? 0} sub="diese Woche" bg="bg-orange-50" />
          </div>

          {/* Verbundene Plattformen */}
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Verbundene Plattformen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {Object.entries(PLATFORM_META).map(([key, meta]) => {
                  const connected = stats?.connectedPlatforms?.includes(key);
                  return (
                    <div
                      key={key}
                      className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white ${connected ? meta.color : "bg-gray-200 text-gray-500"}`}
                    >
                      {meta.icon}
                      {meta.label}
                      {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                    </div>
                  );
                })}
              </div>
              {(stats?.connectedPlatforms?.length ?? 0) === 0 && (
                <p className="text-sm text-gray-500 mt-2">
                  Noch keine Plattformen verbunden.{" "}
                  <button className="text-blue-600 underline" onClick={() => setActiveTab("platforms")}>Jetzt verbinden →</button>
                </p>
              )}
            </CardContent>
          </Card>

          {/* Letzte Posts */}
          {(allPosts?.length ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Letzte Posts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {allPosts?.slice(0, 8).map((post: Post) => (
                  <PostThumb key={post.id} post={post} onClick={() => setEditPost(post)} />
                ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Tab: Posts ─────────────────────────────────────────────────────── */}
        <TabsContent value="posts">
          {/* Freigabe-Queue */}
          {(pendingPosts?.length ?? 0) > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-500" />
                Warten auf deine Freigabe ({pendingPosts?.length})
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
              {pendingPosts?.map((post: Post) => (
                <PostApprovalCard
                    key={post.id}
                    post={post}
                    onApprove={(id, pt, plats) => approvePost.mutate({ postId: id, postType: pt as "post" | "story" | "post_and_story", platforms: plats })}
                    onReject={(id) => rejectPost.mutate({ postId: id })}
                    onEdit={(p) => setEditPost(p)}
                    isApproving={approvePost.isPending}
                    isRejecting={rejectPost.isPending}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Alle Posts */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Alle Posts</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {allPosts?.map((post: Post) => (
                <PostThumb key={post.id} post={post} onClick={() => setEditPost(post)} />
              ))}
            </div>
            {(allPosts?.length ?? 0) === 0 && (
              <div className="text-center py-16 text-gray-400">
                <Image className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Noch keine Posts</p>
                <p className="text-sm">Lade ein Foto hoch um zu starten</p>
                <Button className="mt-4 gap-2" onClick={() => fileInputRef.current?.click()}>
                  <Camera className="h-4 w-4" /> Erstes Foto hochladen
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Tab: Plattformen ───────────────────────────────────────────────── */}
        <TabsContent value="platforms">
          <PlatformsTab platforms={platforms ?? []} restaurantId={user?.restaurantId ?? 0} />
        </TabsContent>

        {/* ── Tab: Bewertungen ───────────────────────────────────────────────── */}
        <TabsContent value="reviews">
          <ReviewsTab stats={reviewStats} settings={settings} onSave={(s) => saveSettings.mutate(s)} />
        </TabsContent>

        {/* ── Tab: Einstellungen ─────────────────────────────────────────────── */}
        <TabsContent value="settings">
          <SettingsTab settings={settings} onSave={(s) => saveSettings.mutate(s)} isSaving={saveSettings.isPending} />
        </TabsContent>
      </Tabs>

      {/* ── Dialog: Bild-Upload & KI-Analyse ──────────────────────────────────── */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              KI-Post erstellen
            </DialogTitle>
          </DialogHeader>
          {uploadMediaType === "video" && uploadVideoBase64
            ? <div className="w-full aspect-video bg-gray-900 rounded-xl overflow-hidden flex items-center justify-center relative">
                {isUploadingVideo
                  ? <div className="flex flex-col items-center gap-2 text-white">
                      <Loader2 className="h-8 w-8 animate-spin" />
                      <span className="text-sm">Video wird hochgeladen &amp; analysiert...</span>
                    </div>
                  : <video src={uploadVideoBase64} className="w-full h-full object-contain" controls />
                }
              </div>
            : isImageReading
              ? <div className="w-full aspect-square bg-gray-100 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-500">
                  <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
                  <span className="text-sm">Bild wird geladen...</span>
                </div>
              : uploadImage && <img src={uploadImage} alt="Vorschau" className="w-full aspect-square object-cover rounded-xl" />
          }
          {uploadMediaType === "video" && !isUploadingVideo && uploadVideoThumbnails.length > 0 && (
            <div className="flex gap-1">
              {uploadVideoThumbnails.map((thumb, i) => (
                <img key={i} src={`data:image/jpeg;base64,${thumb}`} alt={`Frame ${i+1}`}
                  className="w-1/3 aspect-video object-cover rounded" />
              ))}
            </div>
          )}
          <div className="space-y-3">
            <div>
              <Label htmlFor="productName">
                {uploadMediaType === "video" ? "Was zeigt das Video? *" : "Gerichtsname (optional)"}
              </Label>
              <Input
                id="productName"
                placeholder={uploadMediaType === "video" ? "z.B. Spaghetti Carbonara, Terrasse, Abendstimmung..." : "z.B. Spaghetti Carbonara"}
                value={uploadProductName}
                onChange={e => setUploadProductName(e.target.value)}
                className="mt-1"
              />
              {uploadMediaType === "video" && (
                <p className="text-xs text-red-500 mt-1 font-medium">
                  Pflichtfeld – Beschreibung wird für die KI-Analyse benötigt
                </p>
              )}
              {uploadMediaType === "image" && (
                <p className="text-xs text-gray-500 mt-1">Die KI erkennt das Gericht automatisch aus dem Bild</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleAnalyze} disabled={isUploading || isUploadingVideo || isImageReading} className="gap-2">
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {isUploadingVideo ? "Video wird verarbeitet..." : isImageReading ? "Bild wird geladen..." : "KI analysieren lassen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Post bearbeiten ────────────────────────────────────────────── */}
      {editPost && (
        <PostEditDialog
          post={editPost}
          onClose={() => setEditPost(null)}
          onSave={(data) => updatePost.mutate({ postId: editPost.id, ...data })}
          onApprove={(pt, plats) => approvePost.mutate({ postId: editPost.id, postType: pt as "post" | "story" | "post_and_story", platforms: plats })}
          onReject={() => rejectPost.mutate({ postId: editPost.id })}
          isSaving={updatePost.isPending}
        />
      )}
    </div>
  );
}

// ─── Hilfs-Komponenten ────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, bg }: { icon: React.ReactNode; label: string; value: number; sub?: string; bg: string }) {
  return (
    <div className={`rounded-xl p-4 ${bg}`}>
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs text-gray-600">{label}</span></div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function PostThumb({ post, onClick }: { post: Post; onClick: () => void }) {
  const status = STATUS_META[post.status] ?? { label: post.status, color: "bg-gray-100 text-gray-700" };
  return (
    <button
      onClick={onClick}
      className="relative rounded-xl overflow-hidden aspect-square bg-gray-100 group hover:ring-2 hover:ring-gray-900 transition-all"
    >
      {post.mediaType === "video" && post.videoUrl
        ? <video src={resolveImageUrl(post.videoUrl)} className="w-full h-full object-cover" muted playsInline />
        : post.imageUrl
          ? <img src={resolveImageUrl(post.imageUrl)} alt={post.productName ?? "Post"} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          : <div className="w-full h-full flex items-center justify-center bg-gray-200"><Image className="h-8 w-8 text-gray-400" /></div>
      }
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
      <div className="absolute bottom-0 left-0 right-0 p-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.color}`}>{status.label}</span>
      </div>
    </button>
  );
}

function PostApprovalCard({
  post, onApprove, onReject, onEdit, isApproving, isRejecting
}: {
  post: Post;
  onApprove: (id: number, postType: string, platforms: string[]) => void;
  onReject: (id: number) => void;
  onEdit: (p: Post) => void;
  isApproving: boolean;
  isRejecting: boolean;
}) {
  // Immer beide Formate vorauswählen (Beitrag + Story)
  const [formats, setFormats] = useState<Set<FormatKey>>(() => {
    const f = new Set<FormatKey>(["post", "story"]);
    return f;
  });
  const [platforms, setPlatforms] = useState<Set<string>>(() => new Set(post.platforms.length > 0 ? post.platforms : ["instagram", "facebook"]));

  const toggleFormat = (f: FormatKey) => {
    setFormats(prev => {
      const next = new Set(prev);
      if (next.has(f)) { if (next.size > 1) next.delete(f); } else next.add(f);
      return next;
    });
  };
  const togglePlatform = (p: string) => {
    setPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(p)) { if (next.size > 1) next.delete(p); } else next.add(p);
      return next;
    });
  };

  return (
    <div className="rounded-xl border border-yellow-200 bg-yellow-50 overflow-hidden">
      <div className="flex gap-3 p-3">
        {post.mediaType === "video" && post.videoUrl
          ? <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-gray-900 flex items-center justify-center relative">
              <video src={resolveImageUrl(post.videoUrl)} className="w-full h-full object-cover" muted playsInline />
              <div className="absolute inset-0 flex items-center justify-center"><Play className="h-6 w-6 text-white opacity-80" /></div>
            </div>
          : post.imageUrl
            ? <img src={resolveImageUrl(post.imageUrl)} alt="" className="w-20 h-20 rounded-lg object-cover flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            : <div className="w-20 h-20 rounded-lg flex-shrink-0 bg-gray-200 flex items-center justify-center"><Image className="h-6 w-6 text-gray-400" /></div>
        }
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{post.productName ?? "Unbekanntes Gericht"}</p>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{post.captionInstagram}</p>
          {/* Plattformen */}
          <div className="mt-2">
            <p className="text-xs text-gray-400 mb-1">Plattformen</p>
            <div className="flex flex-wrap gap-1">
              {Object.entries(PLATFORM_META).map(([key, meta]) => (
                <button key={key} type="button" onClick={() => togglePlatform(key)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all ${
                    platforms.has(key) ? `${meta.color} text-white border-transparent` : "border-gray-200 bg-white text-gray-400 hover:border-gray-300"
                  }`}>
                  {meta.label}
                </button>
              ))}
            </div>
          </div>
          {/* Format */}
          <div className="mt-2">
            <p className="text-xs text-gray-400 mb-1">Format</p>
            <div className="flex gap-1">
              {FORMAT_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => toggleFormat(opt.value)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all ${
                    formats.has(opt.value) ? "border-green-500 bg-green-100 text-green-700" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                  }`}>
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="flex gap-2 px-3 pb-3">
        <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => onEdit(post)}>
          <Edit3 className="h-3 w-3" /> Bearbeiten
        </Button>
        <Button size="sm" variant="outline" className="gap-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => onReject(post.id)} disabled={isRejecting}>
          <XCircle className="h-3 w-3" />
        </Button>
        <Button size="sm" className="flex-1 gap-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => onApprove(post.id, formatsToPostType(formats), Array.from(platforms))} disabled={isApproving}>
          {isApproving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />} {isApproving ? "Wird freigegeben..." : "Freigeben"}
        </Button>
      </div>
    </div>
  );
}

function PostEditDialog({
  post, onClose, onSave, onApprove, onReject, isSaving
}: {
  post: Post;
  onClose: () => void;
  onSave: (data: { captionInstagram?: string; captionFacebook?: string; captionGoogle?: string; captionTiktok?: string; postType?: "post" | "story" | "post_and_story"; platforms?: string[] }) => void;
  onApprove: (postType: string, platforms: string[]) => void;
  onReject: () => void;
  isSaving: boolean;
}) {
  const [ig, setIg] = useState(post.captionInstagram ?? "");
  const [fb, setFb] = useState(post.captionFacebook ?? "");
  const [gg, setGg] = useState(post.captionGoogle ?? "");
  const [tt, setTt] = useState(post.captionTiktok ?? "");
  // Immer beide Formate vorauswählen (Beitrag + Story)
  const [formats, setFormats] = useState<Set<FormatKey>>(() => new Set<FormatKey>(["post", "story"]));
  const [platforms, setPlatforms] = useState<Set<string>>(() => new Set(post.platforms.length > 0 ? post.platforms : ["instagram", "facebook"]));

  const toggleFormat = (f: FormatKey) => {
    setFormats(prev => {
      const next = new Set(prev);
      if (next.has(f)) { if (next.size > 1) next.delete(f); } else next.add(f);
      return next;
    });
  };
  const togglePlatform = (p: string) => {
    setPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(p)) { if (next.size > 1) next.delete(p); } else next.add(p);
      return next;
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Post bearbeiten</DialogTitle>
        </DialogHeader>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            {post.mediaType === "video" && post.videoUrl
              ? <video src={resolveImageUrl(post.videoUrl)} className="w-full aspect-square object-cover rounded-xl" controls />
              : <img src={resolveImageUrl(post.imageUrl ?? "")} alt="" className="w-full aspect-square object-cover rounded-xl" />
            }
            {post.aiAnalysis && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs font-medium text-gray-500 mb-1">KI-Analyse</p>
                <p className="text-sm text-gray-700">{post.aiAnalysis}</p>
              </div>
            )}
            {post.publishResults && (
              <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
                <p className="text-xs font-medium text-red-600 mb-2">Publish-Ergebnis</p>
                {Object.entries(post.publishResults).map(([platform, result]) => (
                  <div key={platform} className="text-xs mb-1">
                    <span className="font-medium capitalize">{platform}:</span>{" "}
                    {result.success
                      ? <span className="text-green-600">✓ Veröffentlicht (ID: {result.postId})</span>
                      : <span className="text-red-600">✗ {result.error}</span>
                    }
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-3">
            {/* Plattformen */}
            <div>
              <Label className="text-xs font-medium text-gray-700 mb-2 block">Plattformen</Label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(PLATFORM_META).map(([key, meta]) => (
                  <button key={key} type="button" onClick={() => togglePlatform(key)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border-2 transition-all ${
                      platforms.has(key) ? `${meta.color} text-white border-transparent` : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                    }`}>
                    {meta.icon} {meta.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Format */}
            <div>
              <Label className="text-xs font-medium text-gray-700 mb-2 block">Format</Label>
              <div className="flex gap-2">
                {FORMAT_OPTIONS.map(opt => (
                  <button key={opt.value} type="button" onClick={() => toggleFormat(opt.value)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border-2 transition-all ${
                      formats.has(opt.value) ? "border-green-500 bg-green-100 text-green-700" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                    }`}>
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <CaptionField icon={<Instagram className="h-4 w-4 text-pink-500" />} label="Instagram" value={ig} onChange={setIg} />
            <CaptionField icon={<Facebook className="h-4 w-4 text-blue-600" />} label="Facebook" value={fb} onChange={setFb} />
            <CaptionField icon={<Globe className="h-4 w-4 text-red-500" />} label="Google" value={gg} onChange={setGg} />
            <CaptionField icon={<Music2 className="h-4 w-4" />} label="TikTok" value={tt} onChange={setTt} />
          </div>
        </div>
        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={onReject} className="text-red-600 border-red-200 hover:bg-red-50 gap-1">
            <XCircle className="h-4 w-4" /> Ablehnen
          </Button>
          <Button variant="outline" onClick={() => onSave({ captionInstagram: ig, captionFacebook: fb, captionGoogle: gg, captionTiktok: tt, postType: formatsToPostType(formats), platforms: Array.from(platforms) })} disabled={isSaving} className="gap-1">
            <Edit3 className="h-4 w-4" /> Speichern
          </Button>
          <Button onClick={() => onApprove(formatsToPostType(formats), Array.from(platforms))} className="bg-green-600 hover:bg-green-700 text-white gap-1">
            <Send className="h-4 w-4" /> Freigeben
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CaptionField({ icon, label, value, onChange }: { icon: React.ReactNode; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="flex items-center gap-1.5 mb-1 text-xs">{icon}{label}</Label>
      <Textarea value={value} onChange={e => onChange(e.target.value)} rows={3} className="text-sm resize-none" />
    </div>
  );
}

function PlatformsTab({ platforms, restaurantId }: { platforms: Array<{ platform: string; isActive: boolean; accountName: string | null }>; restaurantId: number }) {
  const platformMap = Object.fromEntries(platforms.map(p => [p.platform, p]));
  const [modalPlatform, setModalPlatform] = useState<"instagram" | "facebook" | "google" | "tiktok" | null>(null);
  const utils = trpc.useUtils();

  // OAuth-Callback-Ergebnis aus URL-Parametern lesen
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("oauth_success");
    const error = params.get("oauth_error");
    if (success) {
      const platforms = success.split(",");
      platforms.forEach(p => toast.success(`${p.charAt(0).toUpperCase() + p.slice(1)} erfolgreich verbunden!`));
      utils.marketing.getPlatforms.invalidate();
      // URL-Parameter entfernen
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (error) {
      const messages: Record<string, string> = {
        cancelled: "Anmeldung abgebrochen",
        invalid_state: "Sicherheitsfehler – bitte erneut versuchen",
        token_exchange_failed: "Token-Austausch fehlgeschlagen",
      };
      toast.error(messages[error] ?? `Verbindung fehlgeschlagen: ${error}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [utils]);

  const PLATFORM_COLORS: Record<string, string> = {
    instagram: "bg-gradient-to-br from-purple-500 to-pink-500",
    facebook: "bg-blue-600",
    google: "bg-red-500",
    tiktok: "bg-black",
  };

  return (
    <>
      <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
        <p className="text-sm text-blue-700">
          <strong>Tipp:</strong> Klicke auf "Verbinden" und melde dich mit deinen Social-Media-Zugangsdaten an.
          Kein technisches Wissen nötig – das System holt sich automatisch alle nötigen Berechtigungen.
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {Object.entries(PLATFORM_META).map(([key, meta]) => {
          const connected = platformMap[key as keyof typeof platformMap];
          const isActive = !!connected?.isActive;
          return (
            <div key={key} className="rounded-xl border p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-3 mb-4">
                <div className={`h-10 w-10 rounded-full ${PLATFORM_COLORS[key] ?? "bg-gray-400"} flex items-center justify-center text-white`}>
                  {meta.icon}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{meta.label}</p>
                  {isActive ? (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <Wifi className="h-3 w-3" /> Verbunden{connected?.accountName ? ` als ${connected.accountName}` : ""}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <WifiOff className="h-3 w-3" /> Nicht verbunden
                    </p>
                  )}
                </div>
                {isActive && (
                  <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                )}
              </div>
              <Button
                size="sm"
                className="w-full"
                variant={isActive ? "outline" : "default"}
                onClick={() => setModalPlatform(key as "instagram" | "facebook" | "google" | "tiktok")}
              >
                {isActive ? "Verbindung verwalten" : "Verbinden"}
              </Button>
            </div>
          );
        })}
      </div>

      {/* Verbindungs-Modal */}
      {modalPlatform && (
        <PlatformConnectModal
          platform={modalPlatform}
          restaurantId={restaurantId}
          isConnected={!!platformMap[modalPlatform]?.isActive}
          accountName={platformMap[modalPlatform]?.accountName}
          open={!!modalPlatform}
          onClose={() => setModalPlatform(null)}
          onConnected={() => utils.marketing.getPlatforms.invalidate()}
        />
      )}
    </>
  );
}

function ReviewsTab({
  stats,
  settings,
  onSave,
}: {
  stats: { totalSent: number; totalClicked: number; clickRate: number; sentThisWeek: number } | undefined;
  settings: Record<string, unknown> | undefined;
  onSave: (s: Record<string, unknown>) => void;
}) {
  const [googleUrl, setGoogleUrl] = useState((settings?.googleReviewUrl as string) ?? "");
  const [minRating, setMinRating] = useState(String(settings?.reviewBoosterMinRating ?? "4"));
  const [delay, setDelay] = useState(String(settings?.reviewBoosterDelayMinutes ?? "5"));

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Stats */}
      <Card>
        <CardHeader><CardTitle className="text-base">Bewertungs-Booster Statistik</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <StatRow label="SMS gesendet gesamt" value={stats?.totalSent ?? 0} />
          <StatRow label="Links angeklickt" value={stats?.totalClicked ?? 0} />
          <StatRow label="Klick-Rate" value={`${stats?.clickRate ?? 0}%`} />
          <StatRow label="Diese Woche gesendet" value={stats?.sentThisWeek ?? 0} />
        </CardContent>
      </Card>

      {/* Konfiguration */}
      <Card>
        <CardHeader><CardTitle className="text-base">Konfiguration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Google Bewertungs-Link</Label>
            <Input
              placeholder="https://g.page/r/..."
              value={googleUrl}
              onChange={e => setGoogleUrl(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Erst ab Bewertung</Label>
            <Select value={minRating} onValueChange={setMinRating}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3+ Sterne</SelectItem>
                <SelectItem value="4">4+ Sterne</SelectItem>
                <SelectItem value="5">Nur 5 Sterne</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Verzögerung nach Zahlung (Minuten)</Label>
            <Input type="number" min="0" max="60" value={delay} onChange={e => setDelay(e.target.value)} className="mt-1" />
          </div>
          <Button
            className="w-full"
            onClick={() => onSave({
              googleReviewUrl: googleUrl,
              reviewBoosterMinRating: Number(minRating),
              reviewBoosterDelayMinutes: Number(delay),
            })}
          >
            Speichern
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="font-semibold text-gray-900">{value}</span>
    </div>
  );
}

function SettingsTab({
  settings,
  onSave,
  isSaving,
}: {
  settings: Record<string, unknown> | undefined;
  onSave: (s: Record<string, unknown>) => void;
  isSaving: boolean;
}) {
  const [autoApprove, setAutoApprove] = useState(!!(settings?.autoApprove));
  const [waiterCamera, setWaiterCamera] = useState(!!(settings?.waiterCameraEnabled));
  const [waiterForced, setWaiterForced] = useState(!!(settings?.waiterCameraForced));
  const [weeklyTarget, setWeeklyTarget] = useState(String(settings?.weeklyPostTarget ?? "5"));
  const [reviewBooster, setReviewBooster] = useState(!!(settings?.reviewBoosterEnabled));

  return (
    <div className="max-w-xl space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Post-Einstellungen</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            label="Auto-Freigabe"
            description="Posts werden ohne manuelle Freigabe sofort veröffentlicht"
            checked={autoApprove}
            onCheckedChange={setAutoApprove}
          />
          <div>
            <Label>Ziel-Posts pro Woche</Label>
            <Select value={weeklyTarget} onValueChange={setWeeklyTarget}>
              <SelectTrigger className="mt-1 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[3, 5, 7, 10, 14].map(n => (
                  <SelectItem key={n} value={String(n)}>{n} Posts/Woche</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Kellner-Kamera</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            label="Kellner-Kamera aktivieren"
            description="KI empfiehlt dem Kellner, ein Foto zu machen wenn ein Gericht relevant ist"
            checked={waiterCamera}
            onCheckedChange={setWaiterCamera}
          />
          <ToggleRow
            label="Foto erzwingen"
            description="Kellner kann die Foto-Anfrage nicht überspringen (Kamera blockiert)"
            checked={waiterForced}
            onCheckedChange={setWaiterForced}
            disabled={!waiterCamera}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Bewertungs-Booster</CardTitle></CardHeader>
        <CardContent>
          <ToggleRow
            label="Bewertungs-Booster aktivieren"
            description="Nach jeder Zahlung wird automatisch eine SMS mit dem Google-Bewertungslink gesendet"
            checked={reviewBooster}
            onCheckedChange={setReviewBooster}
          />
        </CardContent>
      </Card>

      <Button
        className="w-full gap-2"
        onClick={() => onSave({
          autoApprove,
          waiterCameraEnabled: waiterCamera,
          waiterCameraForced: waiterForced,
          weeklyPostTarget: Number(weeklyTarget),
          reviewBoosterEnabled: reviewBooster,
        })}
        disabled={isSaving}
      >
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
        Einstellungen speichern
      </Button>
    </div>
  );
}

export default function Marketing() {
  return (
    <ModuleGate moduleId="ai_marketing">
      <MarketingInner />
    </ModuleGate>
  );
}

function ToggleRow({
  label, description, checked, onCheckedChange, disabled
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 ${disabled ? "opacity-50" : ""}`}>
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}
