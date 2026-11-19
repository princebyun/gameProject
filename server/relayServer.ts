import { WebSocket, WebSocketServer } from 'ws';
import { BATTLE_CALC_VERSION } from '../src/core/constants';
import type {
  ClientToServerMessage,
  ServerToClientMessage
} from '../src/core/net/protocol';
import { defaultDataRegistry } from '../src/data/dataRegistry';
import { defaultRpgDataRegistry } from '../src/data/rpgDataRegistry';
import { AuthoritativeRoomCoordinator } from './roomCore';

export class MultiplayerRelayServer {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, WebSocket>();
  public readonly coordinator: AuthoritativeRoomCoordinator;

  constructor(
    public readonly port: number = 8787,
    serverVersion: string = BATTLE_CALC_VERSION
  ) {
    this.coordinator = new AuthoritativeRoomCoordinator(
      defaultDataRegistry,
      defaultRpgDataRegistry,
      (clientId, msg) => this.sendToClient(clientId, msg),
      serverVersion
    );
  }

  public async start(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const wss = new WebSocketServer({ port: this.port });
      this.wss = wss;

      wss.on('listening', () => {
        const addr = wss.address();
        const actualPort =
          typeof addr === 'object' && addr ? addr.port : this.port;
        resolve(actualPort);
      });

      wss.on('error', (err) => {
        reject(err);
      });

      let nextId = 1;
      wss.on('connection', (socket) => {
        let assignedClientId = `ws_peer_${nextId++}`;
        this.clients.set(assignedClientId, socket);

        socket.on('message', (raw) => {
          try {
            const msg = JSON.parse(raw.toString()) as ClientToServerMessage;
            if (
              (msg.type === 'CREATE_ROOM' || msg.type === 'JOIN_ROOM') &&
              msg.clientId
            ) {
              this.clients.delete(assignedClientId);
              assignedClientId = msg.clientId;
              this.clients.set(assignedClientId, socket);
            }
            this.coordinator.handleMessage(assignedClientId, msg);
          } catch {
            // Ignore malformed JSON frames
          }
        });

        socket.on('close', () => {
          this.clients.delete(assignedClientId);
          this.coordinator.handleClientDisconnect(assignedClientId);
        });
      });
    });
  }

  private sendToClient(clientId: string, msg: ServerToClientMessage): void {
    const sock = this.clients.get(clientId);
    if (sock && sock.readyState === WebSocket.OPEN) {
      sock.send(JSON.stringify(msg));
    }
  }

  public async stop(): Promise<void> {
    if (!this.wss) return;
    await new Promise<void>((resolve) => {
      for (const sock of this.clients.values()) {
        try {
          sock.terminate();
        } catch {
          // Ignore
        }
      }
      this.clients.clear();
      this.wss!.close(() => resolve());
      this.wss = null;
    });
  }
}
