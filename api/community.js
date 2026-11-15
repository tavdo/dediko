import { sessionFor, withCookies } from '../server/auth.js';
import { api, bodyJSON, json, sameOrigin } from '../server/http.js';
import { createCommunityService } from '../server/community-service.js';

export function createCommunityHandler(service = createCommunityService(), authenticate = sessionFor) {
  return api(async request => {
    if (request.method === 'POST') sameOrigin(request);
    const { user, cookies } = await authenticate(request);
    const params = new URL(request.url).searchParams;
    const result = request.method === 'POST'
      ? await service.mutate(user.id, await bodyJSON(request, 24000))
      : params.has('id') ? await service.detail(user.id, params.get('id')) : await service.list(user.id, params);
    return withCookies(json(result), cookies);
  });
}
const handler = createCommunityHandler();
export const GET = handler;
export const POST = handler;
