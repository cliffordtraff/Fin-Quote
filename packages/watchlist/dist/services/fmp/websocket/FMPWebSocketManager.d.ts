import { EventEmitter } from 'events';
export declare class FMPWebSocketManager extends EventEmitter {
    private ws;
    private apiKey;
    private wsUrl;
    private reconnectTimeout;
    private pingInterval;
    private subscribedSymbols;
    private isConnected;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectDelay;
    constructor(apiKey: string, wsUrl?: string);
    connect(): void;
    private handleOpen;
    private handleMessage;
    private handleClose;
    private handleError;
    private scheduleReconnect;
    private startPingInterval;
    private stopPingInterval;
    subscribe(symbols: string | string[]): void;
    unsubscribe(symbols: string | string[]): void;
    private send;
    disconnect(): void;
    getSubscribedSymbols(): string[];
    isSymbolSubscribed(symbol: string): boolean;
    getConnectionStatus(): boolean;
}
