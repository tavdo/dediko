import { handleCallback } from '@vercel/queue';
import { processReminder } from '../server/push.js';
import { processOfferDigest } from '../server/offer-notifications.js';
export const POST = handleCallback(message => message.kind==='offer-digest' ? processOfferDigest(message) : processReminder(message), { retry: (_error, metadata) => ({ afterSeconds: Math.min(900, 30 * metadata.deliveryCount) }) });
