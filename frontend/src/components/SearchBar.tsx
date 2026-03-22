import { useState, useCallback, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { searchNodes } from "../services/api";
import { ENTITY_COLORS } from "../types";
import { useDebounce, useClickOutside } from "../hooks";

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
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(query.trim(), 250);

  useClickOutside(containerRef, () => setOpen(false));

  // Fetch results when debounced query changes
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    searchNodes(debouncedQuery)
      .then((res) => {
        if (cancelled) return;
        setResults(res);
        setOpen(res.length > 0);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      });
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  const handleSelect = useCallback(
    (nodeId: string) => {
      setOpen(false);
      setQuery("");
      setResults([]);
      onSelect(nodeId);
    },
    [onSelect]
  );

  return (
    <div ref={containerRef} className="absolute top-3 left-3 z-10 w-64">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
        <input
          type="text"
          className="w-full pl-8 pr-8 py-2 text-sm text-gray-800 dark:text-gray-100 bg-white/95 dark:bg-gray-900/95 backdrop-blur rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition placeholder:text-gray-400 dark:placeholder:text-gray-500"
          placeholder="Search nodes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setResults([]); setOpen(false); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && (
        <ul className="mt-1 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg max-h-60 overflow-y-auto">
          {results.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => handleSelect(r.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: ENTITY_COLORS[r.type] ?? r.color }}
                />
                <span className="truncate text-gray-700 dark:text-gray-200">{r.label}</span>
                <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">{r.type}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
