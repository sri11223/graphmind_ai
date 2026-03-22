import { useState, useCallback, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { searchNodes } from "../services/api";
import { ENTITY_COLORS } from "../types";

interface SearchResult {
  id: string;
  type: string;
  label: string;
  color: string;
}

interface Props {
  onSelect: (nodeId: string) => void;
}

export default function SearchBar({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = useCallback(
    (value: string) => {
      setQuery(value);
      clearTimeout(debounceRef.current);
      if (value.trim().length < 2) {
        setResults([]);
        setOpen(false);
        return;
      }
      setLoading(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await searchNodes(value.trim());
          setResults(res);
          setOpen(res.length > 0);
        } catch {
          setResults([]);
        } finally {
          setLoading(false);
        }
      }, 250);
    },
    []
  );

  const handleSelect = (nodeId: string) => {
    setOpen(false);
    setQuery("");
    setResults([]);
    onSelect(nodeId);
  };

  return (
    <div ref={containerRef} className="absolute top-3 left-3 z-10 w-64">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          className="w-full pl-8 pr-8 py-2 text-sm bg-white/95 backdrop-blur rounded-lg border border-gray-200 shadow-sm outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition placeholder:text-gray-400"
          placeholder="Search nodes…"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setResults([]); setOpen(false); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && (
        <ul className="mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-60 overflow-y-auto">
          {results.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => handleSelect(r.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 transition"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: ENTITY_COLORS[r.type] ?? r.color }}
                />
                <span className="truncate text-gray-700">{r.label}</span>
                <span className="ml-auto text-[10px] text-gray-400 flex-shrink-0">{r.type}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
