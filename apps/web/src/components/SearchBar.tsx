'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, Token } from '@/lib/api';
import { formatUsdDirect, shortenAddress, ipfsToGateway } from '@/lib/utils';

/**
 * SearchBar — debounced fuzzy search over tokens by name/symbol.
 *
 * Uses the existing `/tokens?search=` API endpoint (backed by PostgreSQL
 * trigram indexes). Shows a dropdown of matching tokens; clicking a result
 * navigates to the token page.
 *
 * Keyboard:
 *  - ↑/↓ to move highlight
 *  - Enter to navigate to highlighted result (or first result if none)
 *  - Esc to close
 */
export function SearchBar({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Token[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.listTokens({
          search: query.trim(),
          limit: 8,
          status: 'all',
        });
        setResults(res.tokens);
        setHighlight(0);
      } catch (err) {
        console.error('[search] failed:', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const go = useCallback(
    (token: Token) => {
      setOpen(false);
      setQuery('');
      setResults([]);
      router.push(`/trade/${token.contract_address}`);
    },
    [router],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[highlight]) go(results[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => query && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search by name, symbol, or CA (0x…)"
          className={`input-field ${compact ? 'h-9 text-sm' : ''}`}
          aria-label="Search tokens by name, symbol, or contract address"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted text-xs">
            …
          </span>
        )}
      </div>

      {open && (query.trim().length > 0) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-bg-border rounded-lg shadow-xl overflow-hidden z-50 max-h-96 overflow-y-auto">
          {results.length === 0 && !loading ? (
            <div className="px-4 py-6 text-center text-sm text-text-muted">
              No tokens found for &quot;{query}&quot;
            </div>
          ) : (
            <ul className="py-1">
              {results.map((token, i) => (
                <li key={token.contract_address}>
                  <button
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => go(token)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                      i === highlight ? 'bg-bg-hover' : 'hover:bg-bg-hover'
                    }`}
                  >
                    <TokenThumb token={token} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">
                          {token.name}
                        </span>
                        <span className="text-xs text-text-muted">
                          ${token.symbol}
                        </span>
                      </div>
                      <div className="text-xs text-text-muted">
                        {shortenAddress(token.contract_address)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums">
                        {formatUsdDirect(token.market_cap)}
                      </div>
                      <div className="text-xs text-text-muted">MC</div>
                    </div>
                    {token.status === 'graduated' && (
                      <span className="badge-purple text-[10px] px-1.5 py-0.5">
                        DEX
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Small token thumbnail — image or emoji fallback. */
function TokenThumb({ token }: { token: Token }) {
  const [imgError, setImgError] = useState(false);
  const emoji = deriveEmoji(token.symbol);

  if (token.image && !imgError) {
    const src = ipfsToGateway(token.image);
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={`${token.name} (${token.symbol}) token logo`}
        className="w-8 h-8 rounded-full object-cover bg-bg-input flex-shrink-0"
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-bg-input flex items-center justify-center text-sm flex-shrink-0">
      {emoji}
    </div>
  );
}

/** Derive a simple emoji from the symbol — matches TokenCard fallback logic. */
function deriveEmoji(symbol: string): string {
  const s = symbol.toLowerCase();
  const map: Record<string, string> = {
    dog: '🐶', cat: '🐱', pepe: '🐸', frog: '🐸', moon: '🌙',
    rocket: '🚀', fire: '🔥', king: '👑', trump: '🦅', biden: '🦅',
    elon: '🚀', doge: '🐕', shib: '🐕', wif: '🐕', bonk: '🐕',
    ai: '🤖', bot: '🤖', chad: '🗿', wojak: '🗿', gigachad: '🗿',
  };
  for (const key of Object.keys(map)) {
    if (s.includes(key)) return map[key];
  }
  // Hash the symbol to a stable emoji from a small set.
  const set = ['💎', '🚀', '🌙', '🔥', '⭐', '🌟', '✨', '🎯', '🎲', '🎰'];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return set[Math.abs(h) % set.length];
}
