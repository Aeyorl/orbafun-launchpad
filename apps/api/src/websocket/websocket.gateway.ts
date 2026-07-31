import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { OnModuleInit, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { RedisService } from '../redis/redis.service';

/**
 * WebsocketGateway — relays Redis pub/sub events to connected WebSocket clients.
 *
 * Clients subscribe by joining rooms:
 *  - `tokens:global` — global feed (all token events, for the landing page)
 *  - `token:{address}` — per-token events (for the coin page)
 *
 * Event types relayed:
 *  - NEW_TOKEN       { token }
 *  - NEW_BUY         { tokenAddress, trade }
 *  - NEW_SELL        { tokenAddress, trade }
 *  TOKEN_GRADUATED   { tokenAddress }
 *
 * The indexer publishes to Redis channels; this gateway subscribes and
 * relays to the appropriate rooms.
 *
 * Connection limiting: each IP is capped at MAX_CONN_PER_IP concurrent
 * connections to prevent resource exhaustion via connection flooding.
 */
// A single Orba page can legitimately open several feature subscriptions
// (chart, stats, chat, ticker). Leave room for a few tabs behind one NAT while
// still bounding abusive connection floods.
const MAX_CONN_PER_IP = 25;
const CORS_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

@WebSocketGateway({
  cors: {
    origin: CORS_ORIGINS,
    credentials: true,
  },
  namespace: '/',
  // Heartbeat — detect dead connections within ~25s and clean them up.
  // The client retries automatically (see useWebSocket.ts).
  pingInterval: 15_000,
  pingTimeout: 10_000,
})
export class WebsocketGateway implements OnModuleInit {
  private readonly logger = new Logger(WebsocketGateway.name);
  /** Map of IP → Set of client IDs (for per-IP connection limiting). */
  private readonly ipConnections = new Map<string, Set<string>>();

  @WebSocketServer()
  server: Server;

  constructor(private redis: RedisService) {}

  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() room: unknown,
  ) {
    if (typeof room !== 'string' || !this.isAllowedRoom(room)) return;
    void client.join(room.toLowerCase());
  }

  @SubscribeMessage('leave')
  handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() room: unknown,
  ) {
    if (typeof room !== 'string' || !this.isAllowedRoom(room)) return;
    void client.leave(room.toLowerCase());
  }

  private isAllowedRoom(room: string): boolean {
    return room === 'tokens:global' || /^token:0x[0-9a-f]{40}$/i.test(room);
  }

  async onModuleInit() {
    // Subscribe to the global token events channel
    await this.redis.subscribe('token:events', (message: string) => {
      try {
        const event = JSON.parse(message);
        // Relay to the global room
        this.server.to('tokens:global').emit('token:event', event);
        // Also relay to the per-token room if tokenAddress is present
        if (event.tokenAddress) {
          this.server
            .to(`token:${event.tokenAddress.toLowerCase()}`)
            .emit('token:event', event);
        }
      } catch (err) {
        this.logger.error(`Failed to relay event: ${err.message}`);
      }
    });

    this.logger.log('WebSocket gateway subscribed to Redis pub/sub');
  }

  /**
   * Handle client connection — enforce per-IP connection limit.
   */
  handleConnection(client: Socket) {
    const ip =
      (client.handshake.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      client.handshake.address ||
      'unknown';

    let conns = this.ipConnections.get(ip);
    if (!conns) {
      conns = new Set();
      this.ipConnections.set(ip, conns);
    }

    if (conns.size >= MAX_CONN_PER_IP) {
      this.logger.warn(`Connection rejected — IP ${ip} has ${conns.size} connections (limit ${MAX_CONN_PER_IP})`);
      client.disconnect(true);
      return;
    }

    conns.add(client.id);
    this.logger.log(`Client connected: ${client.id} (IP ${ip}, ${conns.size}/${MAX_CONN_PER_IP})`);
  }

  /**
   * Handle client disconnection — remove from IP tracking.
   */
  handleDisconnect(client: Socket) {
    const ip =
      (client.handshake.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      client.handshake.address ||
      'unknown';

    const conns = this.ipConnections.get(ip);
    if (conns) {
      conns.delete(client.id);
      if (conns.size === 0) {
        this.ipConnections.delete(ip);
      }
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }
}
