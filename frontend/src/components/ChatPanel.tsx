import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { Send, Bot, User, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { sendChatMessage } from "../services/api";
import type { ChatMessage } from "../types";

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
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedSql, setExpandedSql] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = messages
        .filter((m) => m !== WELCOME)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await sendChatMessage(text, history);

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: res.answer,
        sql: res.sql,
        data: res.data,
        referencedNodes: res.referencedNodes,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (res.referencedNodes?.length) {
        onHighlightNodes(res.referencedNodes);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err.message}. Make sure the backend is running.` },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, onHighlightNodes]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="w-[380px] flex-shrink-0 flex flex-col bg-white border-l border-gray-200 z-10">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-800">Chat with Graph</h2>
        <p className="text-[11px] text-gray-400">Order to Cash</p>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot size={14} className="text-white" />
              </div>
            )}
            <div
              className={`max-w-[88%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-brand-500 text-white rounded-br-sm"
                  : "bg-gray-50 text-gray-800 rounded-bl-sm border border-gray-100"
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
                <div className="mt-2 border-t border-gray-200 pt-1.5">
                  <button
                    onClick={() => setExpandedSql(expandedSql === i ? null : i)}
                    className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition"
                  >
                    {expandedSql === i ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    SQL Query
                  </button>
                  {expandedSql === i && (
                    <pre className="mt-1 bg-gray-900 text-gray-200 text-[11px] rounded-md px-2.5 py-2 overflow-x-auto">
                      <code>{msg.sql}</code>
                    </pre>
                  )}
                </div>
              )}
            </div>
            {msg.role === "user" && (
              <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User size={14} className="text-gray-600" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2 items-start">
            <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center flex-shrink-0">
              <Bot size={14} className="text-white" />
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-xl rounded-bl-sm px-3 py-2.5 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-brand-500" />
              <span className="text-xs text-gray-400">Analysing…</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-2.5 border-t border-gray-100">
        <div className="flex items-end gap-2 bg-gray-50 rounded-xl border border-gray-200 px-3 py-2 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500/30 transition">
          <textarea
            className="flex-1 bg-transparent resize-none outline-none text-sm text-gray-800 placeholder:text-gray-400 max-h-28"
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
        <p className="text-[10px] text-gray-300 mt-1.5 text-center">
          GraphMind AI · Queries are restricted to the O2C dataset
        </p>
      </div>
    </div>
  );
}
