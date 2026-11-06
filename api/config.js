import { json } from '../server/http.js';
export const GET = () => json({ accounts: !!(process.env.NEON_AUTH_BASE_URL && process.env.AUTH_COOKIE_SECRET && process.env.DATABASE_URL), pushPublicKey: process.env.VAPID_PUBLIC_KEY || null });
