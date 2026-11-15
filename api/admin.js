import { withCookies } from '../server/auth.js';
import { consoleSession, consoleLoginRoute } from '../server/console-auth.js';
import { db } from '../server/db.js';
import { api, bodyJSON, HttpError, json, sameOrigin } from '../server/http.js';
import { adminIdeas, moderateIdea } from '../server/ideas-service.js';
import { ideaUpdates } from '../server/idea-statuses.js';
import { blobIdeasStore } from '../server/ideas-store.js';
import { lessonCatalog, saveCatalogLesson } from '../server/lesson-catalog.js';
import { createCommunityService } from '../server/community-service.js';
import { createOffersService } from '../server/offers-service.js';

export function createAdminHandler(store = blobIdeasStore, authenticate = consoleSession) {
  return api(async request => {
    if (request.method === 'POST') sameOrigin(request);
    const authAction = new URL(request.url).searchParams.get('auth');
    if (authAction) return consoleLoginRoute(request, authAction);
    const { user, cookies } = await authenticate(request);
    const section = new URL(request.url).searchParams.get('section') ?? 'overview';
    const respond = value => withCookies(json(value), cookies);

    if (request.method === 'POST') {
      const input = await bodyJSON(request, section === 'offers' ? 18000 : 10000);
      if (section === 'ideas') return respond({ idea: await moderateIdea(store, input, ideaUpdates) });
      if (section === 'lessons') return respond({ lesson: await saveCatalogLesson(input) });
      if (section === 'community') return respond(await createCommunityService().moderate(input));
      if (section === 'offers') return respond(await createOffersService().adminWrite(user.id,input));
    } else if (request.method === 'GET') {
      if (section === 'ideas') return respond({ ideas: adminIdeas((await store.read()).board, ideaUpdates) });
      if (section === 'lessons') return respond({ lessons: await lessonCatalog() });
      if (section === 'community') return respond({ community: await createCommunityService().moderationList() });
      if (section === 'offers') return respond(await createOffersService().adminData());
      if (section === 'overview') {
        const [[{ profiles }], { board }, lessons] = await Promise.all([
          db()`select count(*)::integer as profiles from dediko.accounts where document is not null`,
          store.read(),
          lessonCatalog()
        ]);
        const ideas = adminIdeas(board, ideaUpdates);
        return respond({
          user: { id: user.id },
          counts: {
            profiles,
            ideas: ideas.filter(idea => !idea.hidden).length,
            reviewing: ideas.filter(idea => !idea.hidden && idea.status === 'reviewing').length,
            lessons: lessons.filter(lesson => lesson.published).length
          }
        });
      }
    }
    throw new HttpError(404, 'მართვის განყოფილება ვერ მოიძებნა.');
  });
}

const handler = createAdminHandler();
export const GET = handler;
export const POST = handler;
