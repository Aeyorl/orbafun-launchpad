'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import toast from 'react-hot-toast';
import { api, Message } from '@/lib/api';
import { useTokenEvents } from '@/lib/useWebSocket';
import { useAuth } from '@/lib/use-auth';
import { shortenAddress, timeAgo } from '@/lib/utils';

const MAX_LEN = 500;

/**
 * TokenChat — live per-token chat.
 *
 * - Fetches recent messages from /tokens/:address/messages
 * - Posts new messages via POST /tokens/:address/messages (x-wallet header)
 * - Receives new messages in real time via WebSocket (NEW_MESSAGE event)
 * - Auto-scrolls to bottom on new messages
 * - "Load older" button paginates backwards via the `before` cursor
 */
export function TokenChat({ tokenAddress }: { tokenAddress: string }) {
  const { address } = useAccount();
  const { getAuthToken, authenticate, authenticating, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  // Fetch recent messages (newest first from API, reversed for display).
  const { data, isLoading } = useQuery({
    queryKey: ['messages', tokenAddress],
    queryFn: () => api.getMessages(tokenAddress, 50),
    refetchInterval: 60_000, // fallback polling
  });

  // WebSocket: invalidate on new message.
  const handleEvent = useCallback(
    (event: any) => {
      if (event.type === 'NEW_MESSAGE') {
        queryClient.invalidateQueries({ queryKey: ['messages', tokenAddress] });
      }
    },
    [tokenAddress, queryClient],
  );
  useTokenEvents(tokenAddress, handleEvent);

  const messages = (data?.messages || []).slice().reverse(); // oldest first for display

  // Auto-scroll to bottom when new messages arrive (if user is at bottom).
  useEffect(() => {
    if (atBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, atBottom]);

  const onScroll = () => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 50);
  };

  const handlePost = async () => {
    if (!address) {
      setError('Connect your wallet to chat');
      return;
    }
    const content = input.trim();
    if (!content) return;
    if (content.length > MAX_LEN) {
      setError(`Message too long (max ${MAX_LEN} chars)`);
      return;
    }
    // Ensure user is authenticated (has signed a message)
    let token = getAuthToken();
    if (!token) {
      try {
        await authenticate();
        token = getAuthToken();
      } catch {
        setError('Authentication required to post messages');
        return;
      }
    }
    setPosting(true);
    setError(null);
    try {
      await api.postMessage(tokenAddress, address, content, undefined, token);
      setInput('');
      queryClient.invalidateQueries({ queryKey: ['messages', tokenAddress] });
      setAtBottom(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to post';
      setError(msg);
      toast.error('Message failed to post');
    } finally {
      setPosting(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handlePost();
    }
  };

  return (
    <div className="card flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Chat</h3>
        <span className="text-xs text-text-muted">
          {messages.length} messages
        </span>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto space-y-2 max-h-80 min-h-[200px] pr-1"
      >
        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-bg-input rounded" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 text-text-muted text-sm">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((msg) => <ChatMessage key={msg.id} msg={msg} />)
        )}
      </div>

      {/* Input */}
      <div className="mt-3 pt-3 border-t border-bg-border">
        {address ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Say something…"
              maxLength={MAX_LEN}
              disabled={posting}
              className="input-field flex-1 text-sm"
              aria-label="Type a chat message"
            />
            <button
              onClick={handlePost}
              disabled={posting || !input.trim()}
              aria-disabled={posting || !input.trim()}
              aria-label="Send chat message"
              className="btn-primary text-sm px-4"
            >
              {posting ? '…' : 'Send'}
            </button>
          </div>
        ) : (
          <p className="text-xs text-text-muted text-center py-2">
            Connect your wallet to chat
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-accent-red mt-2">{error}</p>
        )}
        <p className="text-[10px] text-text-muted mt-1">
          {input.length}/{MAX_LEN}
        </p>
      </div>
    </div>
  );
}

function ChatMessage({ msg }: { msg: Message }) {
  return (
    <div className="text-sm">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="font-mono text-xs text-accent-blue">
          {shortenAddress(msg.wallet)}
        </span>
        <span className="text-[10px] text-text-muted">
          {timeAgo(msg.created_at)}
        </span>
      </div>
      <p className="text-text-secondary break-words pl-1">{msg.content}</p>
    </div>
  );
}
