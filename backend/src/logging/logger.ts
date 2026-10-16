import pino, { type DestinationStream, type Logger } from 'pino';
import { getContext } from './context';

export function createLogger(destination?: DestinationStream): Logger {
    return pino(
        {
            level: process.env.LOG_LEVEL ?? 'info',
            base: { service: process.env.SERVICE_NAME ?? 'backend' },
            messageKey: 'msg',
            timestamp: () => `,"ts":"${new Date().toISOString()}"`,
            formatters: {
                level: (label) => ({ level: label }),
            },
            mixin() {
                const context = getContext();
                return context ? { trace_id: context.traceId } : {};
            },
        },
        destination,
    );
}

export const logger = createLogger();
