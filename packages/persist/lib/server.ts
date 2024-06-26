import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { validateRequest } from 'zod-express';
import { z } from 'zod';
import { getLogger } from '@nangohq/utils';
import persistController from './controllers/persist.controller.js';
import { logLevelValues } from '@nangohq/shared';

const logger = getLogger('Persist');

export const server = express();
server.use(express.json({ limit: '100mb' }));

server.use((req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    res.send = function (body: any) {
        if (res.statusCode >= 400) {
            logger.info(`[Error] ${req.method} ${req.path} ${res.statusCode} '${JSON.stringify(body)}'`);
        }
        originalSend.call(this, body) as any;
        return this;
    };
    next();
    if (res.statusCode < 400) {
        logger.info(`${req.method} ${req.path} ${res.statusCode}`);
    }
});

server.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
});

server.post(
    '/environment/:environmentId/log',
    validateRequest({
        params: z.object({
            environmentId: z.string().transform(Number).pipe(z.number().int().positive()) as unknown as z.ZodNumber
        }),
        body: z.object({
            activityLogId: z.number(),
            level: z.enum(logLevelValues),
            msg: z.string()
        })
    }),
    persistController.saveActivityLog.bind(persistController)
);

const validateRecordsRequest = validateRequest({
    params: z.object({
        environmentId: z.string().transform(Number).pipe(z.number().int().positive()) as unknown as z.ZodNumber,
        nangoConnectionId: z.string().transform(Number).pipe(z.number().int().positive()) as unknown as z.ZodNumber,
        syncId: z.string(),
        syncJobId: z.string().transform(Number).pipe(z.number().int().positive()) as unknown as z.ZodNumber
    }),
    body: z.object({
        model: z.string(),
        records: z.any().array().nonempty(),
        providerConfigKey: z.string(),
        connectionId: z.string(),
        activityLogId: z.number()
    })
});
const recordPath = '/environment/:environmentId/connection/:nangoConnectionId/sync/:syncId/job/:syncJobId/records';
server.post(recordPath, validateRecordsRequest, persistController.saveRecords.bind(persistController));
server.delete(recordPath, validateRecordsRequest, persistController.deleteRecords.bind(persistController));
server.put(recordPath, validateRecordsRequest, persistController.updateRecords.bind(persistController));

server.use((_req: Request, res: Response, next: NextFunction) => {
    res.status(404);
    next();
});

server.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
    if (err) {
        res.status(500).json({ error: err.message });
    } else {
        next();
    }
});
