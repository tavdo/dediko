import { betterAuth } from 'better-auth';
import { username } from 'better-auth/plugins/username';
import { PostgresDialect } from 'kysely';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { createHmac } from 'node:crypto';
import { bodyJSON, HttpError, json, sameOrigin } from './http.js';

export const consoleAdminId = 'dediko-console-admin';
let instance;
export function createConsoleAuth({ pool, schema = 'dediko', origin, secret }) {
  return betterAuth({
    appName: 'Dediko Admin', baseURL: origin, basePath: '/api/admin-auth',
    secret, trustedOrigins: [origin],
    database: { dialect: new PostgresDialect({ pool }), type: 'postgres', schemaName: schema },
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 8, maxPasswordLength: 128 },
    user: { modelName: 'console_users' },
    session: { modelName: 'console_sessions', expiresIn: 8 * 3600, updateAge: 0, disableSessionRefresh: true, cookieCache: { enabled: false } },
    account: { modelName: 'console_accounts' },
    verification: { modelName: 'console_verifications' },
    rateLimit: {
      enabled: true, storage: 'database', modelName: 'console_rate_limits', window: 60, max: 100,
      customRules: { '/sign-in/username': { window: 900, max: 10 } }
    },
    advanced: {
      cookiePrefix: 'dediko-console',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'strict', path: '/api/admin', secure: origin.startsWith('https:') },
      // One known administrator: use a persistent shared login bucket instead of
      // trusting a client-supplied forwarding header to bypass attempt limits.
      ipAddress: { ipAddressHeaders: ['x-dediko-console-client'] }
    },
    plugins: [username()]
  });
}
export function consoleAuth() {
  if (!process.env.DATABASE_URL || !process.env.AUTH_COOKIE_SECRET || !process.env.APP_ORIGIN) throw new HttpError(503, 'ადმინის შესვლის სერვისი ჯერ მზად არ არის.');
  if (!instance) {
    neonConfig.webSocketConstructor = WebSocket;
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 });
    instance = createConsoleAuth({ pool, origin: process.env.APP_ORIGIN,
      secret: createHmac('sha256', process.env.AUTH_COOKIE_SECRET).update('dediko-console-auth-v1').digest('hex') });
  }
  return instance;
}
export async function consoleSession(request, auth = consoleAuth()) {
  const session = await auth.api.getSession({ headers: request.headers, query: { disableCookieCache: true } });
  if (session?.user?.id !== consoleAdminId || session.user.username !== 'admin') throw new HttpError(401, 'შედი ადმინის ანგარიშით.');
  const expected = request.headers.get('x-dediko-account');
  if ((expected && expected !== consoleAdminId) || (request.method !== 'GET' && expected !== consoleAdminId)) throw new HttpError(401, 'ადმინის სესია შეიცვალა. ხელახლა შედი.');
  return { user: { id: consoleAdminId, name: 'admin' }, cookies: [] };
}
// Only the two console operations are proxied; there is no sign-up, password
// reset, account editing, impersonation, or arbitrary Better Auth route here.
export async function consoleLoginRoute(request, action, auth = consoleAuth()) {
  if (!['login', 'logout'].includes(action) || request.method !== 'POST') throw new HttpError(404, 'მისამართი ვერ მოიძებნა.');
  sameOrigin(request);
  const input = await bodyJSON(request, 2000);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'მონაცემები არასწორია.');
  let body = {};
  if (action === 'login') {
    if (typeof input.username !== 'string' || input.username.length > 80 || typeof input.password !== 'string' || input.password.length > 128) throw new HttpError(400, 'მომხმარებელი ან პაროლი არასწორია.');
    body = { username: input.username.trim(), password: input.password, rememberMe: false };
  } else await consoleSession(request, auth);
  const headers = new Headers({ 'Content-Type': 'application/json', Origin: new URL(request.url).origin, 'X-Dediko-Console-Client': '127.0.0.1' });
  const cookies = request.headers.get('cookie'); if (cookies) headers.set('cookie', cookies);
  const result = await auth.handler(new Request(new URL(`/api/admin-auth/${action === 'login' ? 'sign-in/username' : 'sign-out'}`, request.url), {
    method: 'POST', headers, body: JSON.stringify(body)
  }));
  // Do not expose the framework's session token or internal account email to JS.
  const response = json(result.ok ? { ok: true } : { error: result.status === 429 ? 'შესვლის მცდელობები ამოიწურა. სცადე 15 წუთში.' : result.status >= 500 ? 'შესვლის სერვისი დროებით მიუწვდომელია. სცადე ხელახლა.' : 'მომხმარებელი ან პაროლი არასწორია.' }, result.status);
  for (const cookie of result.headers.getSetCookie()) response.headers.append('Set-Cookie', cookie);
  if (result.headers.has('retry-after')) response.headers.set('Retry-After', result.headers.get('retry-after'));
  return response;
}
