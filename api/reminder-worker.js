import { handleCallback } from '@vercel/queue';
import { processReminder } from '../server/push.js';
export const POST = handleCallback(message => processReminder(message), { retry: (_error, metadata) => ({ afterSeconds: Math.min(900, 30 * metadata.deliveryCount) }) });
