import { randomUUID } from 'node:crypto';
import { lessonCategories, parseVideoUrl, publishedLessons } from '../lessons.js';
import { db } from './db.js';
import { HttpError } from './http.js';

const defaults = new Map(publishedLessons.map(lesson => [lesson.id, lesson]));

export async function lessonCatalog() {
  const catalog = new Map(publishedLessons.map(lesson => [lesson.id, {
    ...lesson, published: true, revision: 0
  }]));
  if (!process.env.DATABASE_URL && !process.env.VERCEL) return [...catalog.values()];
  const rows = await db()`select id, lesson, published, revision
    from dediko.lesson_overrides order by created_at, id`;
  for (const { id, lesson, published, revision } of rows) {
    catalog.set(id, { ...lesson, id, published, revision });
  }
  return [...catalog.values()];
}

function field(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw new HttpError(400, 'შეამოწმე ვიდეოს სავალდებულო ველები და ტექსტის სიგრძე.');
  }
  return value.trim();
}

export function validateCatalogLesson(input) {
  if (!input || typeof input !== 'object' || !['pregnant', 'mother'].includes(input.stage) ||
      !lessonCategories(input.stage).some(category => category.id === input.category) ||
      !['ქართული', 'ინგლისური', 'სხვა'].includes(input.language) || typeof input.published !== 'boolean') {
    throw new HttpError(400, 'აირჩიე ვიდეოს ეტაპი, კატეგორია, ენა და სტატუსი.');
  }
  const video = parseVideoUrl(field(input.url, 500, true));
  if (!video) throw new HttpError(400, 'მიუთითე კონკრეტული YouTube ან Vimeo ვიდეოს ბმული.');
  const sourceUrl = field(input.sourceUrl ?? '', 500);
  if (sourceUrl) {
    let url;
    try { url = new URL(sourceUrl); } catch { /* Invalid links are handled below. */ }
    if (url?.protocol !== 'https:' || url.username || url.password) {
      throw new HttpError(400, 'წყაროს ბმული HTTPS მისამართი უნდა იყოს.');
    }
  }
  return {
    title: field(input.title, 100, true),
    description: field(input.description ?? '', 500),
    url: video.url,
    stage: input.stage,
    category: input.category,
    language: input.language,
    source: field(input.source, 120, true),
    sourceUrl
  };
}

export async function saveCatalogLesson(input) {
  const lesson = validateCatalogLesson(input);
  const { id, revision, published } = input;
  const sql = db();
  let saved;
  if (id == null || (defaults.has(id) && revision === 0)) {
    [saved] = await sql`insert into dediko.lesson_overrides (id, lesson, published)
      values (${id ?? randomUUID()}, ${JSON.stringify(lesson)}::jsonb, ${published})
      on conflict (id) do nothing returning id, published, revision`;
  } else {
    if (typeof id !== 'string' || id.length > 80 || !Number.isSafeInteger(revision) || revision < 1 || revision > 2147483646) {
      throw new HttpError(400, 'ვიდეოს ვერსია არასწორია.');
    }
    [saved] = await sql`update dediko.lesson_overrides
      set lesson = ${JSON.stringify(lesson)}::jsonb, published = ${published}, revision = revision + 1
      where id = ${id} and revision = ${revision} returning id, published, revision`;
  }
  if (!saved) throw new HttpError(409, 'ვიდეო შეიცვალა. განაახლე სია და სცადე ხელახლა.');
  return { ...lesson, ...saved };
}
