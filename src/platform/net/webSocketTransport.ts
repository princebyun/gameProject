import type { Disposable } from '../../core/types/disposable';
import type {
  ClientToServerMessage,
  ServerToClientMessage
} from '../../core/net/protocol';
import type {
  NetworkTransport,
  TransportDisconnectHandler,
  TransportMessageHandler
} from '../../core/net/transport';

export class WebSocketTransport implements NetworkTransport, Disposable {
  private ws: WebSocket | null = null;
  private connected = false;
  private msgHandlers: TransportMessageHandler[] = [];
  private disconnectHandlers: TransportDisconnectHandler[] = [];
  private pingIntervalId: ReturnType<typeof setInterval> | null = null;
  private connectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private rttMs = 18;

  constructor(
    public readonly clientId: string,
    private readonly serverUrl: string = (
      (import.meta as unknown as { env?: Record<string, string> }).env
        ?.VITE_MULTIPLAYER_URL || 'ws://localhost:8787'
    )
  ) { }

  private clearConnectTimeout(): void {
    if (this.connectTimeoutId !== null) {
      clearTimeout(this.connectTimeoutId);
      this.connectTimeoutId = null;
    }
  }

  public async connect(): Promise<void> {
    if (this.connected && this.ws) return;
    if (typeof WebSocket === 'undefined') {
      throw new Error('WebSocket API를 사용할 수 없는 환경입니다.');
    }

    await new Promise<void>((resolve, reject) => {
      const sock = new WebSocket(this.serverUrl);
      this.ws = sock;

      this.clearConnectTimeout();
      this.connectTimeoutId = setTimeout(() => {
        this.connectTimeoutId = null;
        sock.close();
        reject(
          new Error(
            `통신 대전 서버(${this.serverUrl}) 연결 시간 초과 — 서버 실행 여부를 확인해 주세요.`
          )
        );
      }, 3500);

      sock.onopen = () => {
        this.clearConnectTimeout();
        this.connected = true;
        this.startPingLoop();
        resolve();
      };

      sock.onerror = () => {
        this.clearConnectTimeout();
        this.connected = false;
        reject(
          new Error(
            `통신 대전 서버(${this.serverUrl})에 연결할 수 없습니다.`
          )
        );
      };

      sock.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as ServerToClientMessage;
          if (msg.type === 'PONG') {
            this.rttMs = Math.max(1, Date.now() - msg.clientTimestampMs);
            return;
          }
          for (const h of this.msgHandlers) {
            h(msg);
          }
        } catch {
          // Ignore malformed packet
        }
      };

      sock.onclose = () => {
        this.clearConnectTimeout();
        const wasConnected = this.connected;
        this.connected = false;
        this.stopPingLoop();
        if (wasConnected) {
          for (const h of this.disconnectHandlers) {
            h('서버와의 연결이 종료되었습니다.');
          }
        }
      };
    });
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    this.pingIntervalId = setInterval(() => {
      if (this.connected) {
        this.send({ type: 'PING', clientTimestampMs: Date.now() });
      }
    }, 1000);
  }

  private stopPingLoop(): void {
    if (this.pingIntervalId !== null) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }

  public disconnect(): void {
    this.clearConnectTimeout();
    this.stopPingLoop();
    this.connected = false;
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      try {
        this.ws.close();
      } catch {
        // Ignore
      }
      this.ws = null;
    }
    this.msgHandlers.length = 0;
    this.disconnectHandlers.length = 0;
  }

  public dispose(): void {
    this.disconnect();
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public send(msg: ClientToServerMessage): void {
    if (!this.ws || !this.connected || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify(msg));
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
}
