import { AuthoritativeRoomCoordinator } from '../../../server/roomCore';
import { BATTLE_CALC_VERSION } from '../../core/constants';
import type {
  ClientToServerMessage,
  ServerToClientMessage
} from '../../core/net/protocol';
import type {
  NetworkTransport,
  TransportDisconnectHandler,
  TransportMessageHandler
} from '../../core/net/transport';
import type { GameDataRegistry } from '../../core/types/dataSchemas';
import type { RpgDataRegistry } from '../../core/types/rpgSchemas';

/**
 * In-memory multi-client hub sharing the exact AuthoritativeRoomCoordinator as the WebSocket server.
 * Used for deterministic Vitest multi-client lockstep tests and instant local offline loopback lobbies.
 */
export class LoopbackNetworkHub {
  public readonly coordinator: AuthoritativeRoomCoordinator;
  private transports = new Map<string, LoopbackTransport>();

  constructor(
    gameRegistry: GameDataRegistry,
    rpgRegistry: RpgDataRegistry,
    serverVersion: string = BATTLE_CALC_VERSION
  ) {
    this.coordinator = new AuthoritativeRoomCoordinator(
      gameRegistry,
      rpgRegistry,
      (clientId, msg) => this.deliverToClient(clientId, msg),
      serverVersion
    );
  }

  public createClientTransport(clientId: string): LoopbackTransport {
    const t = new LoopbackTransport(clientId, this);
    this.transports.set(clientId, t);
    return t;
  }

  public routeToServer(clientId: string, msg: ClientToServerMessage): void {
    // Clone payload to guarantee zero shared reference mutation across simulated clients
    const cloned = JSON.parse(JSON.stringify(msg)) as ClientToServerMessage;
    this.coordinator.handleMessage(clientId, cloned);
  }

  public notifyClientDisconnect(clientId: string): void {
    this.coordinator.handleClientDisconnect(clientId);
  }

  private deliverToClient(clientId: string, msg: ServerToClientMessage): void {
    const t = this.transports.get(clientId);
    if (t && t.isConnected()) {
      const cloned = JSON.parse(JSON.stringify(msg)) as ServerToClientMessage;
      t.receiveFromServer(cloned);
    }
  }
}

export class LoopbackTransport implements NetworkTransport {
  private connected = false;
  private msgHandlers: TransportMessageHandler[] = [];
  private disconnectHandlers: TransportDisconnectHandler[] = [];
  private rttMs = 4;

  constructor(
    public readonly clientId: string,
    private readonly hub: LoopbackNetworkHub
  ) {}

  public async connect(): Promise<void> {
    this.connected = true;
  }

  public disconnect(): void {
    if (!this.connected) return;
    this.connected = false;
    this.hub.notifyClientDisconnect(this.clientId);
    for (const h of this.disconnectHandlers) {
      h('Loopback transport disconnected');
    }
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public send(msg: ClientToServerMessage): void {
    if (!this.connected) return;
    this.hub.routeToServer(this.clientId, msg);
  }

  public onMessage(handler: TransportMessageHandler): void {
    this.msgHandlers.push(handler);
  }

  public onDisconnect(handler: TransportDisconnectHandler): void {
    this.disconnectHandlers.push(handler);
  }

  public getRttMs(): number {
    return this.rttMs;
  }

  public receiveFromServer(msg: ServerToClientMessage): void {
    for (const h of this.msgHandlers) {
      h(msg);
    }
  }
}
