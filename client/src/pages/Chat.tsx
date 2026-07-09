import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MessageSquare, Send, Bot, User, Zap, Lightbulb, Filter } from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: "Offen", color: "bg-blue-100 text-blue-700" },
  ai_handled: { label: "KI beantwortet", color: "bg-purple-100 text-purple-700" },
  escalated: { label: "Eskaliert", color: "bg-red-100 text-red-700" },
  resolved: { label: "Gelöst", color: "bg-green-100 text-green-700" },
  closed: { label: "Geschlossen", color: "bg-gray-100 text-gray-600" },
};

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  low: { label: "Niedrig", color: "text-gray-500" },
  medium: { label: "Mittel", color: "text-yellow-600" },
  high: { label: "Hoch", color: "text-orange-600" },
  urgent: { label: "Dringend", color: "text-red-600" },
};

const MESSAGE_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode; bgClass: string; borderClass: string }> = {
  stoerung: {
    label: "Störung",
    icon: <Zap className="h-3 w-3 text-red-500" />,
    bgClass: "bg-red-50/60 dark:bg-red-950/15",
    borderClass: "border-l-2 border-l-red-500",
  },
  idee: {
    label: "Idee",
    icon: <Lightbulb className="h-3 w-3 text-yellow-500" />,
    bgClass: "bg-yellow-50/60 dark:bg-yellow-950/15",
    borderClass: "border-l-2 border-l-yellow-400",
  },
  normal: {
    label: "Normal",
    icon: <MessageSquare className="h-3 w-3 text-muted-foreground" />,
    bgClass: "",
    borderClass: "",
  },
};

export default function Chat() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reply, setReply] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const utils = trpc.useUtils();

  const { data: conversations, isLoading } = trpc.chat.conversations.useQuery();
  const { data: messages, isLoading: messagesLoading } = trpc.chat.messages.useQuery(
    { conversationId: selectedId! },
    { enabled: selectedId !== null }
  );

  const sendMutation = trpc.chat.sendMessage.useMutation({
    onSuccess: () => {
      utils.chat.messages.invalidate({ conversationId: selectedId! });
      setReply("");
      toast.success("Nachricht gesendet");
    },
    onError: (e) => toast.error(e.message),
  });

  const statusMutation = trpc.chat.updateStatus.useMutation({
    onSuccess: () => { utils.chat.conversations.invalidate(); toast.success("Status aktualisiert"); },
    onError: (e) => toast.error(e.message),
  });

  const aiReplyMutation = trpc.chat.aiReply.useMutation({
    onSuccess: () => {
      utils.chat.messages.invalidate({ conversationId: selectedId! });
      toast.success("KI-Antwort gesendet");
    },
    onError: (e) => toast.error(e.message),
  });

  const selectedConv = conversations?.find((c: any) => c.id === selectedId);

  const filteredConversations = conversations?.filter((c: any) => {
    if (filterType === "all") return true;
    return c.messageType === filterType;
  });

  const stoerungCount = conversations?.filter((c: any) => c.messageType === "stoerung" && c.status !== "resolved" && c.status !== "closed").length ?? 0;
  const ideeCount = conversations?.filter((c: any) => c.messageType === "idee" && c.status !== "resolved" && c.status !== "closed").length ?? 0;

  const handleSend = () => {
    if (!reply.trim() || !selectedId) return;
    sendMutation.mutate({ conversationId: selectedId, content: reply, senderType: "superadmin" });
  };

  const handleAiReply = () => {
    if (!selectedId || !messages?.length) return;
    const lastUserMsg = [...(messages ?? [])].reverse().find((m: any) => m.senderType === "user");
    if (!lastUserMsg) { toast.error("Keine Benutzernachricht gefunden"); return; }
    aiReplyMutation.mutate({ conversationId: selectedId, userMessage: lastUserMsg.content });
  };

  return (
    <div className="space-y-4 max-w-[1400px]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chat & Support</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Support-Anfragen und KI-gestützte Antworten</p>
        </div>
        {/* Alert badges */}
        <div className="flex items-center gap-2">
          {stoerungCount > 0 && (
            <div className="flex items-center gap-1.5 bg-red-100 text-red-700 px-3 py-1.5 rounded-full text-xs font-medium">
              <Zap className="h-3.5 w-3.5" />
              {stoerungCount} Störung{stoerungCount > 1 ? "en" : ""} offen
            </div>
          )}
          {ideeCount > 0 && (
            <div className="flex items-center gap-1.5 bg-yellow-100 text-yellow-700 px-3 py-1.5 rounded-full text-xs font-medium">
              <Lightbulb className="h-3.5 w-3.5" />
              {ideeCount} Idee{ideeCount > 1 ? "n" : ""} neu
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-240px)] min-h-[500px]">
        {/* Conversation List */}
        <Card className="lg:col-span-1 overflow-hidden flex flex-col">
          <CardHeader className="pb-2 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold">Konversationen</CardTitle>
              <div className="flex items-center gap-1">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <select
                  value={filterType}
                  onChange={e => setFilterType(e.target.value)}
                  className="text-xs border rounded px-1.5 py-0.5 bg-background text-foreground"
                >
                  <option value="all">Alle</option>
                  <option value="stoerung">Störungen</option>
                  <option value="idee">Ideen</option>
                  <option value="normal">Normal</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : filteredConversations?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Keine Konversationen</p>
              </div>
            ) : (
              filteredConversations?.map((c: any) => {
                const status = STATUS_LABELS[c.status] ?? STATUS_LABELS.open;
                const priority = PRIORITY_LABELS[c.priority] ?? PRIORITY_LABELS.medium;
                const msgType = MESSAGE_TYPE_LABELS[c.messageType ?? "normal"] ?? MESSAGE_TYPE_LABELS.normal;
                const isSelected = selectedId === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left px-4 py-3 border-b hover:bg-muted/50 transition-colors ${
                      isSelected ? "bg-primary/5 border-l-[3px] border-l-primary" : msgType.borderClass
                    } ${msgType.bgClass}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {msgType.icon}
                        <span className="text-sm font-medium truncate">{c.subject ?? `Konversation #${c.id}`}</span>
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${status.color} shrink-0`}>{status.label}</span>
                    </div>
                    {c.restaurantName && (
                      <div className="text-xs text-muted-foreground font-medium truncate mb-0.5">🏪 {c.restaurantName}</div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className={priority.color}>{priority.label}</span>
                      <span>·</span>
                      <span>{c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleDateString("de-CH") : "—"}</span>
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Message View */}
        <Card className="lg:col-span-2 flex flex-col overflow-hidden">
          {!selectedConv ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <MessageSquare className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">Wählen Sie eine Konversation aus</p>
            </div>
          ) : (
            <>
              <CardHeader className="pb-3 shrink-0 border-b">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {selectedConv.messageType === "stoerung" && (
                        <span className="flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                          <Zap className="h-3 w-3" /> Störung
                        </span>
                      )}
                      {selectedConv.messageType === "idee" && (
                        <span className="flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
                          <Lightbulb className="h-3 w-3" /> Idee
                        </span>
                      )}
                      {selectedConv.restaurantName && (
                        <span className="text-xs text-muted-foreground">🏪 {selectedConv.restaurantName}</span>
                      )}
                    </div>
                    <CardTitle className="text-sm font-semibold truncate">
                      {selectedConv.subject ?? `Konversation #${selectedConv.id}`}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={selectedConv.status}
                      onValueChange={(v) => statusMutation.mutate({ id: selectedConv.id, status: v as any })}
                    >
                      <SelectTrigger className="h-7 text-xs w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Offen</SelectItem>
                        <SelectItem value="ai_handled">KI beantwortet</SelectItem>
                        <SelectItem value="escalated">Eskaliert</SelectItem>
                        <SelectItem value="resolved">Gelöst</SelectItem>
                        <SelectItem value="closed">Geschlossen</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messagesLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-3/4" />)}
                  </div>
                ) : messages?.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">Noch keine Nachrichten</p>
                ) : (
                  messages?.map((m: any) => {
                    const isAdmin = m.senderType === "superadmin";
                    const isAI = m.senderType === "ai";
                    return (
                      <div key={m.id} className={`flex gap-2 ${isAdmin || isAI ? "flex-row-reverse" : ""}`}>
                        <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                          isAI ? "bg-purple-100 text-purple-600" :
                          isAdmin ? "bg-primary/10 text-primary" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {isAI ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                        </div>
                        <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                          isAI ? "bg-purple-50 dark:bg-purple-950/30 text-purple-900 dark:text-purple-100" :
                          isAdmin ? "bg-primary text-primary-foreground" :
                          "bg-muted"
                        }`}>
                          {isAI && <p className="text-xs font-medium mb-1 opacity-70">KI-Assistent</p>}
                          {isAdmin && <p className="text-xs font-medium mb-1 opacity-70">Support</p>}
                          <p className="whitespace-pre-wrap">{m.content}</p>
                          <p className="text-xs mt-1 opacity-60">
                            {m.createdAt ? new Date(m.createdAt).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }) : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Reply Box */}
              <div className="p-4 border-t shrink-0 space-y-2">
                <Textarea
                  placeholder="Antwort eingeben... (Shift+Enter = neue Zeile)"
                  rows={2}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                />
                <div className="flex items-center gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAiReply}
                    disabled={aiReplyMutation.isPending}
                    className="text-purple-600 border-purple-200 hover:bg-purple-50"
                  >
                    <Bot className="h-3.5 w-3.5 mr-1.5" />
                    {aiReplyMutation.isPending ? "KI antwortet..." : "KI-Antwort"}
                  </Button>
                  <Button size="sm" onClick={handleSend} disabled={!reply.trim() || sendMutation.isPending}>
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                    Senden
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
