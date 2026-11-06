import test from 'node:test';
import assert from 'node:assert/strict';
import { publishedLessons, parseVideoUrl, lessonsForStage, migrateLessonState } from '../lessons.js';

test('YouTube watch, short, live and embed links normalize to the same privacy player', () => {
  const links = ['https://www.youtube.com/watch?v=abcdefghijk&list=anything', 'https://youtu.be/abcdefghijk?t=8', 'https://m.youtube.com/shorts/abcdefghijk', 'https://www.youtube.com/live/abcdefghijk', 'https://www.youtube-nocookie.com/embed/abcdefghijk'];
  for (const link of links) assert.equal(parseVideoUrl(link).embedUrl, 'https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0');
});
test('only known providers and valid video paths can create iframe URLs', () => {
  for (const link of ['javascript:alert(1)', 'https://youtube.com.evil.test/watch?v=abcdefghijk', 'https://youtube.com@evil.test/watch?v=abcdefghijk', 'https://evil.test/embed/abcdefghijk', 'https://www.youtube.com/watch?v=short', 'https://vimeo.com/channels/12345678', 'https://vimeo.com:8080/408389494', 'https://youtube.com/playlist?list=abcdefghijk']) {
    assert.equal(parseVideoUrl(link), null, link);
  }
});
test('Vimeo preserves private-video hashes in both link formats', () => {
  for (const link of ['https://vimeo.com/408389494/abc123def0', 'https://player.vimeo.com/video/408389494?h=abc123def0']) {
    assert.equal(parseVideoUrl(link).embedUrl, 'https://player.vimeo.com/video/408389494?dnt=1&h=abc123def0');
  }
});
test('each stage receives its own published and personal lessons', () => {
  const personal = [{ id: 'personal', stage: 'pregnant', title: 'My video', url: 'https://vimeo.com/408389494' }];
  assert.equal(lessonsForStage('pregnant', personal).length, 4);
  assert.equal(lessonsForStage('mother', personal).length, 3);
  assert.ok(publishedLessons.every(lesson => parseVideoUrl(lesson.url) && lesson.sourceUrl && lesson.language));
});
test('existing profiles migrate without losing reminders or completed lessons', () => {
  const old = { version: 1, profile: { stage: 'pregnant' }, reminders: [{ id: 'existing' }] };
  const migrated = migrateLessonState(old);
  assert.deepEqual(migrated.reminders, old.reminders);
  assert.deepEqual(migrated.lessons, []);
  assert.deepEqual(migrated.completedLessons, []);
  assert.deepEqual(migrateLessonState({ ...old, completedLessons: ['nhs-breathing', 5] }).completedLessons, ['nhs-breathing']);
});
