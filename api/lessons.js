import { api, json } from '../server/http.js';
import { lessonCatalog } from '../server/lesson-catalog.js';

export const GET = api(async () => {
  const catalog = await lessonCatalog();
  const lessons = catalog.filter(item => item.published).map(({ published, revision, ...lesson }) => lesson);
  return json({ lessons });
});
