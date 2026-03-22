import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { Send, Bot, User, ChevronDown, ChevronRight, Loader2, Wifi, WifiOff } from "lucide-react";
import { sendChatMessage } from "../services/api";
import { useWebSocket, type WsMessage } from "../hooks";
import { useToast } from "./providers/ToastProvider";
import type { ChatMessage } from "../types";

const WS_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/chat/stream`;

const WELCOME: ChatMessage = {
  role: "assistant",
  content:
    "Hi! I'm **GraphMind AI**, your Order-to-Cash analytics assistant.\n\n" +
    "I can help you explore and analyse the O2C dataset — ask me about sales orders, deliveries, billing documents, " +
    "payments, customers, products, and their relationships.\n\n" +
    "**Try asking:**\n" +
    "- Which products have the most billing documents?\n" +
    "- Trace the full flow for sales order 740506\n" +
    "- Find orders that are delivered but not yet billed",
};

interface Props {
  onHighlightNodes: (nodeIds: string[]) => void;
}

export default function ChatPanel({ onHighlightNodes }: Props) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingStatus, setStreamingStatus] = useState("");
  const streamingSqlRef = useRef<string | null>(null);
  const [expandedSql, setExpandedSql] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleWsMessage = useCallback(
    (data: WsMessage) => {
      switch (data.type) {
        case "status":
          setStreamingStatus(data.status as string);
          break;
        case "sql":
          streamingSqlRef.current = data.sql as string;
          break;
        case "chunk":
          setStreamingContent((prev) => prev + (data.content as string));
          break;
        case "done": {
          const sql = streamingSqlRef.current;
          setStreamingContent((prev) => {
            const finalContent = prev || (data.answer as string) || "";
            if (finalContent) {
              const msg: ChatMessage = {
                role: "assistant",
                content: finalContent,
                sql: sql ?? undefined,
                referencedNodes: (data.referencedNodes as string[]) ?? [],
              };
              setMessages((msgs) => [...msgs, msg]);
            }
            return "";
          });
          const refs = (data.referencedNodes as string[]) ?? [];
          if (refs.length) onHighlightNodes(refs);
          streamingSqlRef.current = null;
          setStreamingStatus("");
          setLoading(false);
          break;
        }
        case "error":
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `Error: ${data.message}` },
          ]);
          toast("error", `Query failed: ${data.message}`);
          setStreamingContent("");
          streamingSqlRef.current = null;
          setStreamingStatus("");
          setLoading(false);
          break;
      }
    },
    [onHighlightNodes, toast]
  );

  const { send: wsSend, isConnected, connect } = useWebSocket({
    url: WS_URL,
    onMessage: handleWsMessage,
    autoConnect: true,
    reconnect: true,
  });

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, streamingContent]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const history = messages
      .filter((m) => m !== WELCOME)
      .map((m) => ({ role: m.role, content: m.content }));

    if (isConnected) {
      wsSend({ message: text, history });
    } else {
      // REST fallback
      try {
        const res = await sendChatMessage(text, history);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: res.answer,
            sql: res.sql,
            data: res.data,
            referencedNodes: res.referencedNodes,
          },
        ]);
        if (res.referencedNodes?.length) onHighlightNodes(res.referencedNodes);
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${err.message}. Make sure the backend is running.` },
        ]);
        toast("error", "Failed to reach backend");
      } finally {
        setLoading(false);
      }
    }
  }, [input, loading, messages, onHighlightNodes, isConnected, wsSend, toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="w-[400px] flex-shrink-0 flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700/60 z-10">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">Chat with Graph</h2>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">Order to Cash · Powered by Grok</p>
        </div>
        <span title={isConnected ? "Streaming connected" : "Using REST fallback"}>
          {isConnected ? (
            <Wifi size={14} className="text-emerald-500" />
          ) : (
            <WifiOff size={14} className="text-gray-400 cursor-pointer" onClick={connect} />
          )}
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            msg={msg}
            index={i}
            expandedSql={expandedSql}
            onToggleSql={(idx) => setExpandedSql(expandedSql === idx ? null : idx)}
          />
        ))}

        {/* Streaming bubble */}
        {loading && (streamingContent || streamingStatus) && (
          <div className="flex gap-2 items-start">
            <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Bot size={14} className="text-white" />
            </div>
            <div className="max-w-[88%] rounded-xl rounded-bl-sm px-3 py-2 text-sm leading-relaxed bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-100 dark:border-gray-700">
              {streamingStatus && !streamingContent && (
                <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                  <Loader2 size={12} className="animate-spin" />
                  {streamingStatus}
                </div>
              )}
              {streamingContent && (
                <div className="chat-md">
                  <ReactMarkdown>{streamingContent}</ReactMarkdown>
                </div>
              )}
              <span className="inline-block w-1.5 h-4 bg-brand-500 animate-pulse rounded-sm ml-0.5" />
            </div>
          </div>
        )}

        {/* Simple loading when no streaming content yet */}
        {loading && !streamingContent && !streamingStatus && (
          <div className="flex gap-2 items-start">
            <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center flex-shrink-0">
              <Bot size={14} className="text-white" />
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl rounded-bl-sm px-3 py-2.5 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-brand-500" />
              <span className="text-xs text-gray-400 dark:text-gray-500">Analysing…</span>
            </div>
          </div>
        )}
      </div>

      {/* Input — FIXED: explicit text color for both themes */}
      <div className="px-3 py-2.5 border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-end gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500/30 transition">
          <textarea
            className="flex-1 bg-transparent resize-none outline-none text-sm text-gray-800 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 max-h-28 leading-relaxed"
            rows={1}
            placeholder="Ask about O2C data…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="p-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition flex-shrink-0"
          >
            <Send size={14} />
          </button>
        </div>
        <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-1.5 text-center">
          GraphMind AI · Queries are restricted to the O2C dataset
        </p>
      </div>
    </div>
  );
}

/* ── Extracted Message Bubble ─────────────────────── */

function MessageBubble({
  msg,
  index,
  expandedSql,
  onToggleSql,
}: {
  msg: ChatMessage;
  index: number;
  expandedSql: number | null;
  onToggleSql: (i: number) => void;
}) {
  return (
    <div className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
      {msg.role === "assistant" && (
        <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bot size={14} className="text-white" />
        </div>
      )}
      <div
        className={`max-w-[88%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
          msg.role === "user"
            ? "bg-brand-500 text-white rounded-br-sm"
            : "bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-bl-sm border border-gray-100 dark:border-gray-700"
        }`}
      >
        {msg.role === "assistant" ? (
          <div className="chat-md">
            <ReactMarkdown>{msg.content}</ReactMarkdown>
          </div>
        ) : (
          <p>{msg.content}</p>
        )}

        {/* Expandable SQL */}
        {msg.sql && (
          <div className="mt-2 border-t border-gray-200 dark:border-gray-600 pt-1.5">
            <button
              onClick={() => onToggleSql(index)}
              className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
            >
              {expandedSql === index ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              SQL Query
            </button>
            {expandedSql === index && (
              <pre className="mt-1 bg-gray-900 dark:bg-gray-950 text-gray-200 text-[11px] rounded-md px-2.5 py-2 overflow-x-auto">
                <code>{msg.sql}</code>
              </pre>
            )}
          </div>
        )}
      </div>
      {msg.role === "user" && (
        <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 mt-0.5">
          <User size={14} className="text-gray-600 dark:text-gray-300" />
        </div>
      )}
    </div>
  );
}
