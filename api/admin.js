import { requireAdmin } from '../server/admin-access.js';
import { sessionFor, withCookies } from '../server/auth.js';
import { db } from '../server/db.js';
import { api, bodyJSON, HttpError, json, sameOrigin } from '../server/http.js';
import { adminIdeas, moderateIdea } from '../server/ideas-service.js';
import { ideaUpdates } from '../server/idea-statuses.js';
import { blobIdeasStore } from '../server/ideas-store.js';
import { lessonCatalog, saveCatalogLesson } from '../server/lesson-catalog.js';

export function createAdminHandler(store = blobIdeasStore) {
  return api(async request => {
    if (request.method === 'POST') sameOrigin(request);
    const { user, cookies } = await sessionFor(request);
    await requireAdmin(user);
    const section = new URL(request.url).searchParams.get('section') ?? 'overview';
    const respond = value => withCookies(json(value), cookies);

    if (request.method === 'POST') {
      const input = await bodyJSON(request, 10000);
      if (section === 'ideas') return respond({ idea: await moderateIdea(store, input, ideaUpdates) });
      if (section === 'lessons') return respond({ lesson: await saveCatalogLesson(input) });
    } else if (request.method === 'GET') {
      if (section === 'ideas') return respond({ ideas: adminIdeas((await store.read()).board, ideaUpdates) });
      if (section === 'lessons') return respond({ lessons: await lessonCatalog() });
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
