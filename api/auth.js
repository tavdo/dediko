import { proxyAuth } from '../server/auth.js';
import { api } from '../server/http.js';
export const GET = api(proxyAuth);
export const POST = GET;
