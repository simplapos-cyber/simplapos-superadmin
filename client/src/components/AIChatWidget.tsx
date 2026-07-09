import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface AIChatWidgetProps {
  role?: "admin" | "waiter";
  /** When true, renders as a collapsible side-tab on the left edge instead of a bottom-right FAB */
  sideTab?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AIChatWidget({ role = "admin", sideTab = false }: AIChatWidgetProps) {
  const { user } = useAuth();
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<number | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const chatMutation = trpc.chatbot.chat.useMutation();
  const { data: suggestionsData } = trpc.chatbot.getSuggestions.useQuery({ role, currentPage: location });

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: text.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const history = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const result = await chatMutation.mutateAsync({
        message: text.trim(),
        history,
        role,
        currentPage: location,
        conversationId,
      });
      if (result.conversationId && !conversationId) {
        setConversationId(result.conversationId);
      }

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: result.message || "Entschuldigung, ich konnte keine Antwort generieren.",
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      let displayMsg: string;
      if (errorMsg.includes("exhausted") || errorMsg.includes("412") || errorMsg.includes("credit")) {
        displayMsg = "KI-Guthaben erschöpft. Bitte Anthropic-Konto unter console.anthropic.com aufladen.";
      } else if (errorMsg.includes("not_found") || errorMsg.includes("404")) {
        displayMsg = "KI-Modell nicht gefunden. Bitte den Administrator informieren.";
      } else if (errorMsg.includes("authentication") || errorMsg.includes("401") || errorMsg.includes("api_key")) {
        displayMsg = "KI-API-Key ungültig. Bitte den Administrator informieren.";
      } else if (errorMsg.includes("rate_limit") || errorMsg.includes("429")) {
        displayMsg = "Zu viele Anfragen. Bitte kurz warten und erneut versuchen.";
      } else if (errorMsg.includes("restaurantId") || errorMsg.includes("Restaurant")) {
        displayMsg = "Kein Restaurant zugewiesen. Bitte beim Administrator melden.";
      } else {
        displayMsg = `Die KI ist momentan nicht verfügbar. (${errorMsg.slice(0, 120)})`;
      }
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: `Fehler: ${displayMsg}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages, chatMutation, role]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => { setMessages([]); setConversationId(undefined); };

  const suggestions = suggestionsData?.suggestions ?? [];

  // ─── Chat Panel (shared between FAB and SideTab modes) ────────────────────

  const chatPanel = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{
        padding: "14px 16px",
        borderBottom: "1px solid var(--border, #e5e7eb)",
        background: "var(--sidebar-primary, #6366f1)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexShrink: 0,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: "rgba(255,255,255,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="3"/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>KI-Assistent</div>
          <div style={{ fontSize: 10, opacity: 0.8 }}>
            {role === "waiter" ? "Kellner" : "Admin"} · {user?.name ?? ""}
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            title="Chat leeren"
            style={{
              background: "rgba(255,255,255,0.15)",
              border: "none",
              color: "#fff",
              borderRadius: 6,
              padding: "3px 7px",
              cursor: "pointer",
              fontSize: 11,
              flexShrink: 0,
            }}
          >
            Leeren
          </button>
        )}
        {sideTab && (
          <button
            onClick={() => setIsOpen(false)}
            title="Schliessen"
            style={{
              background: "rgba(255,255,255,0.15)",
              border: "none",
              color: "#fff",
              borderRadius: 6,
              padding: "4px 6px",
              cursor: "pointer",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        scrollbarWidth: "thin",
      }}>
        {messages.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{
              textAlign: "center",
              color: "var(--muted-foreground, #6b7280)",
              fontSize: 12,
              padding: "16px 0 6px",
            }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>🤖</div>
              <div style={{ fontWeight: 500, marginBottom: 3 }}>Hallo{user?.name ? `, ${user.name.split(" ")[0]}` : ""}!</div>
              <div style={{ fontSize: 11 }}>Ich kenne deine Speisekarte, Bestellungen und Tische.</div>
              {suggestionsData?.pageContext && (
                <div style={{ fontSize: 10, marginTop: 4, color: "var(--sidebar-primary, #6366f1)", fontWeight: 500 }}>📍 {suggestionsData.pageContext}</div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 2 }}>
              {suggestions.slice(0, 4).map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s)}
                  style={{
                    background: "var(--muted, #f3f4f6)",
                    border: "1px solid var(--border, #e5e7eb)",
                    borderRadius: 7,
                    padding: "7px 10px",
                    textAlign: "left",
                    cursor: "pointer",
                    fontSize: 11,
                    color: "var(--foreground, #111)",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--accent, #e5e7eb)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--muted, #f3f4f6)"; }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                gap: 6,
                alignItems: "flex-end",
              }}
            >
              {msg.role === "assistant" && (
                <div style={{
                  width: 24, height: 24, borderRadius: "50%",
                  background: "var(--sidebar-primary, #6366f1)",
                  color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, fontSize: 10,
                }}>
                  AI
                </div>
              )}
              <div style={{
                maxWidth: "82%",
                padding: "8px 11px",
                borderRadius: msg.role === "user"
                  ? "12px 12px 3px 12px"
                  : "12px 12px 12px 3px",
                background: msg.role === "user"
                  ? "var(--sidebar-primary, #6366f1)"
                  : "var(--muted, #f3f4f6)",
                color: msg.role === "user"
                  ? "#fff"
                  : "var(--foreground, #111)",
                fontSize: 12,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}>
                {msg.content}
              </div>
            </div>
          ))
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%",
              background: "var(--sidebar-primary, #6366f1)",
              color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, fontSize: 10,
            }}>
              AI
            </div>
            <div style={{
              padding: "9px 12px",
              borderRadius: "12px 12px 12px 3px",
              background: "var(--muted, #f3f4f6)",
              display: "flex", gap: 4, alignItems: "center",
            }}>
              {[0, 1, 2].map(j => (
                <div key={j} style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "var(--muted-foreground, #9ca3af)",
                  animation: `bounce 1.2s ease-in-out ${j * 0.2}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: "8px 10px",
        borderTop: "1px solid var(--border, #e5e7eb)",
        display: "flex",
        gap: 6,
        alignItems: "flex-end",
        flexShrink: 0,
        background: "var(--card, #fff)",
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Frage stellen… (Enter = Senden)"
          rows={1}
          disabled={isLoading}
          style={{
            flex: 1,
            resize: "none",
            border: "1px solid var(--border, #e5e7eb)",
            borderRadius: 9,
            padding: "8px 10px",
            fontSize: 12,
            fontFamily: "inherit",
            background: "var(--background, #fff)",
            color: "var(--foreground, #111)",
            outline: "none",
            lineHeight: 1.5,
            maxHeight: 80,
            overflow: "auto",
            transition: "border-color 0.15s",
          }}
          onFocus={e => { e.currentTarget.style.borderColor = "var(--sidebar-primary, #6366f1)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "var(--border, #e5e7eb)"; }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || isLoading}
          style={{
            width: 34, height: 34,
            borderRadius: 9,
            background: input.trim() && !isLoading
              ? "var(--sidebar-primary, #6366f1)"
              : "var(--muted, #e5e7eb)",
            color: input.trim() && !isLoading ? "#fff" : "var(--muted-foreground, #9ca3af)",
            border: "none",
            cursor: input.trim() && !isLoading ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            transition: "background 0.15s",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  if (sideTab) {
    // Side-tab mode: small arrow tab on the right edge, panel slides in from right
    return (
      <>
        {/* Arrow tab on right edge */}
        {!isOpen && (
          <button
            onClick={() => setIsOpen(true)}
            aria-label="KI-Assistent öffnen"
            style={{
              position: "fixed",
              right: 0,
              top: "50%",
              transform: "translateY(-50%)",
              zIndex: 9999,
              width: 24,
              height: 64,
              background: "var(--sidebar-primary, #6366f1)",
              color: "#fff",
              border: "none",
              borderRadius: "8px 0 0 8px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "-2px 0 8px rgba(0,0,0,0.15)",
              transition: "width 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.width = "30px"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.width = "24px"; }}
          >
            {/* Left-pointing chevron */}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        )}

        {/* Slide-in panel from right */}
        {isOpen && (
          <div
            style={{
              position: "fixed",
              right: 0,
              top: 0,
              bottom: 0,
              zIndex: 9999,
              width: 300,
              maxWidth: "85vw",
              background: "var(--card, #fff)",
              borderLeft: "1px solid var(--border, #e5e7eb)",
              boxShadow: "-4px 0 24px rgba(0,0,0,0.18)",
              display: "flex",
              flexDirection: "column",
              animation: "sideSlideIn 0.22s cubic-bezier(0.23,1,0.32,1)",
            }}
          >
            {chatPanel}
          </div>
        )}

        {/* Backdrop when open on mobile */}
        {isOpen && (
          <div
            onClick={() => setIsOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9998,
              background: "rgba(0,0,0,0.25)",
            }}
          />
        )}

        <style>{`
          @keyframes sideSlideIn {
            from { opacity: 0; transform: translateX(20px); }
            to   { opacity: 1; transform: translateX(0); }
          }
          @keyframes bounce {
            0%, 60%, 100% { transform: translateY(0); }
            30% { transform: translateY(-5px); }
          }
        `}</style>
      </>
    );
  }

  // ─── FAB mode (default) ───────────────────────────────────────────────────

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        aria-label="KI-Assistent öffnen"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 9999,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: isOpen
            ? "var(--destructive, #ef4444)"
            : "var(--sidebar-primary, #6366f1)",
          color: "#fff",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
          transition: "background 0.2s, transform 0.15s",
          transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = isOpen ? "rotate(45deg) scale(1.08)" : "scale(1.08)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = isOpen ? "rotate(45deg)" : "rotate(0deg)"; }}
      >
        {isOpen ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            <path d="M9 9h.01M12 9h.01M15 9h.01" strokeWidth="2.5"/>
          </svg>
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            bottom: 92,
            right: 24,
            zIndex: 9998,
            width: 380,
            maxWidth: "calc(100vw - 48px)",
            height: 520,
            maxHeight: "calc(100vh - 120px)",
            background: "var(--card, #fff)",
            border: "1px solid var(--border, #e5e7eb)",
            borderRadius: 16,
            boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            animation: "chatSlideIn 0.2s cubic-bezier(0.23,1,0.32,1)",
          }}
        >
          {chatPanel}
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes chatSlideIn {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
      `}</style>
    </>
  );
}
