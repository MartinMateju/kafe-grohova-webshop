import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localizedPaths } from '../src/i18n/paths';

test('language links follow resource IDs when handles are translated', async () => {
  const paths = await localizedPaths(async lang => [{ id: 'same-article', handle: lang === 'cs' ? 'kava-doma' : 'coffee-at-home' }], 'blog');
  assert.deepEqual(paths[0].props.alternatePaths, { cs: '/cs/blog/kava-doma', en: '/en/blog/coffee-at-home' });
  assert.equal(paths[1].params.handle, 'coffee-at-home');
});

test('missing translations link back to the translated listing', async () => {
  const paths = await localizedPaths(async lang => lang === 'cs' ? [{ id: 'course', handle: 'kurz' }] : [], 'courses');
  assert.equal(paths[0].props.alternatePaths.en, '/en/courses');
});
