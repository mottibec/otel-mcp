// Simple logger implementation
const logger = {
    info: (message: string, data?: object) => {
        console.log(`[${new Date().toISOString()}] INFO: ${message}`, data ? data : '');
    },
    error: (message: string, data?: object) => {
        console.error(`[${new Date().toISOString()}] ERROR: ${message}`, data ? data : '');
    },
    warn: (message: string, data?: object) => {
        console.warn(`[${new Date().toISOString()}] WARN: ${message}`, data ? data : '');
    },
    debug: (message: string, data?: object) => {
        console.debug(`[${new Date().toISOString()}] DEBUG: ${message}`, data ? data : '');
    }
};

export default logger;
