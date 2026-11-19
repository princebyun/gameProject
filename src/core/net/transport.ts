import type {
  ClientToServerMessage,
  ServerToClientMessage
} from './protocol';

export type TransportMessageHandler = (msg: ServerToClientMessage) => void;
export type TransportDisconnectHandler = (reason: string) => void;

export interface NetworkTransport {
  readonly clientId: string;
  connect(): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;
  send(msg: ClientToServerMessage): void;
  onMessage(handler: TransportMessageHandler): void;
  onDisconnect(handler: TransportDisconnectHandler): void;
  getRttMs(): number;
}
