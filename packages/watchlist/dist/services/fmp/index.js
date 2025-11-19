import { FMPService } from './FMPService';
let fmpServiceInstance = null;
export function getFMPService() {
    if (!fmpServiceInstance) {
        const apiKey = process.env.FMP_API_KEY;
        if (!apiKey) {
            throw new Error('FMP_API_KEY environment variable is not set');
        }
        fmpServiceInstance = new FMPService({
            apiKey,
            wsUrl: process.env.FMP_WS_URL || 'wss://websockets.financialmodelingprep.com',
            enableWebSocket: true
        });
        // Connect to WebSocket on initialization
        fmpServiceInstance.connect().catch(error => {
            console.error('Failed to connect to FMP WebSocket:', error);
        });
    }
    return fmpServiceInstance;
}
export { FMPService };
