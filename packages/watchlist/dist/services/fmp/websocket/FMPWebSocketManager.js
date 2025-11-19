import { EventEmitter } from 'events';
import WebSocket from 'ws';
export class FMPWebSocketManager extends EventEmitter {
    constructor(apiKey, wsUrl = 'wss://websockets.financialmodelingprep.com') {
        super();
        this.ws = null;
        this.reconnectTimeout = null;
        this.pingInterval = null;
        this.subscribedSymbols = new Set();
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000;
        this.apiKey = apiKey;
        this.wsUrl = wsUrl;
    }
    connect() {
        if (this.ws && this.isConnected) {
            console.log('WebSocket already connected');
            return;
        }
        try {
            console.log('Connecting to FMP WebSocket...');
            this.ws = new WebSocket(this.wsUrl);
            this.ws.onopen = this.handleOpen.bind(this);
            this.ws.onmessage = this.handleMessage.bind(this);
            this.ws.onclose = this.handleClose.bind(this);
            this.ws.onerror = this.handleError.bind(this);
        }
        catch (error) {
            console.error('Failed to create WebSocket connection:', error);
            this.scheduleReconnect();
        }
    }
    handleOpen() {
        console.log('FMP WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        // Authenticate
        this.send({
            event: 'login',
            data: {
                apiKey: this.apiKey
            }
        });
        // Start ping interval to keep connection alive
        this.startPingInterval();
        // Re-subscribe to previous symbols if any
        if (this.subscribedSymbols.size > 0) {
            const symbols = Array.from(this.subscribedSymbols);
            this.subscribedSymbols.clear();
            this.subscribe(symbols);
        }
        this.emit('connected');
    }
    handleMessage(event) {
        try {
            const data = JSON.parse(event.data);
            // Handle different message types
            if (data.event === 'login') {
                if (data.status === 200 || data.status === 'success') {
                    console.log('FMP authentication successful');
                    this.emit('authenticated');
                }
                else {
                    console.error('FMP authentication failed:', data.message);
                    this.emit('error', new Error('Authentication failed'));
                }
            }
            else if (data.s) {
                // Stock update message
                const stockUpdate = data;
                this.emit('stockUpdate', {
                    symbol: stockUpdate.s.toUpperCase(),
                    price: stockUpdate.p,
                    bid: stockUpdate.b,
                    ask: stockUpdate.a,
                    bidSize: stockUpdate.bs,
                    askSize: stockUpdate.as,
                    volume: stockUpdate.v,
                    timestamp: stockUpdate.t
                });
            }
        }
        catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    }
    handleClose() {
        console.log('FMP WebSocket disconnected');
        this.isConnected = false;
        this.stopPingInterval();
        this.emit('disconnected');
        this.scheduleReconnect();
    }
    handleError(error) {
        console.error('FMP WebSocket error:', error);
        this.emit('error', error);
    }
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            this.emit('maxReconnectAttemptsReached');
            return;
        }
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts), 30000);
        console.log(`Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);
        this.reconnectTimeout = setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();
        }, delay);
    }
    startPingInterval() {
        this.pingInterval = setInterval(() => {
            if (this.isConnected && this.ws) {
                this.send({ event: 'ping' });
            }
        }, 30000); // Ping every 30 seconds
    }
    stopPingInterval() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }
    subscribe(symbols) {
        const symbolArray = Array.isArray(symbols) ? symbols : [symbols];
        const lowercaseSymbols = symbolArray.map(s => s.toLowerCase());
        // Add to subscribed set
        lowercaseSymbols.forEach(s => this.subscribedSymbols.add(s));
        if (!this.isConnected) {
            console.log('WebSocket not connected, symbols will be subscribed on connect');
            return;
        }
        this.send({
            event: 'subscribe',
            data: {
                ticker: lowercaseSymbols
            }
        });
        console.log(`Subscribed to: ${lowercaseSymbols.join(', ')}`);
    }
    unsubscribe(symbols) {
        const symbolArray = Array.isArray(symbols) ? symbols : [symbols];
        const lowercaseSymbols = symbolArray.map(s => s.toLowerCase());
        // Remove from subscribed set
        lowercaseSymbols.forEach(s => this.subscribedSymbols.delete(s));
        if (!this.isConnected) {
            return;
        }
        this.send({
            event: 'unsubscribe',
            data: {
                ticker: lowercaseSymbols
            }
        });
        console.log(`Unsubscribed from: ${lowercaseSymbols.join(', ')}`);
    }
    send(data) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.error('WebSocket not ready, cannot send:', data);
            return;
        }
        this.ws.send(JSON.stringify(data));
    }
    disconnect() {
        console.log('Disconnecting FMP WebSocket...');
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        this.stopPingInterval();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.subscribedSymbols.clear();
    }
    getSubscribedSymbols() {
        return Array.from(this.subscribedSymbols);
    }
    isSymbolSubscribed(symbol) {
        return this.subscribedSymbols.has(symbol.toLowerCase());
    }
    getConnectionStatus() {
        return this.isConnected;
    }
}
