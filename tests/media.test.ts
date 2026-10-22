import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { embedURL, safeURL, resolveScene, rankMedia, formatDuration, type MediaItem } from '../src/lib/media.ts';

const data = JSON.parse(readFileSync(new URL('../src/data/media-catalog.json', import.meta.url), 'utf8')) as { items: MediaItem[] };
test('automatic recommendations use Shanghai time at evening and weekend boundaries', () => {
  const scenarios = [
    ['2026-10-23T10:59:00Z', 'focus'], ['2026-10-23T11:00:00Z', 'evening'],
    ['2026-10-23T23:59:00Z', 'weekend'], ['2026-10-24T00:00:00Z', 'chores'],
    ['2026-10-24T03:59:00Z', 'chores'], ['2026-10-24T04:00:00Z', 'weekend'],
    ['2026-10-24T11:00:00Z', 'evening'], ['2026-10-24T22:00:00Z', 'weekend'],
    ['2026-10-25T00:00:00Z', 'chores'], ['2026-10-26T00:00:00Z', 'focus'],
  ];
  for (const [date, expected] of scenarios) assert.equal(resolveScene('auto', new Date(date)), expected, date);
  assert.equal(resolveScene('weekend', new Date('2026-10-26T00:00:00Z')), 'weekend');
});
test('chores prioritizes audio, excludes screen-dependent videos, and never repeats completed items', () => {
  const result = rankMedia(data.items, 'chores', [data.items[0].id], '2026-10-24');
  assert.ok(result.length > 5);
  assert.ok(result.every(item => item.listenOnly));
  assert.ok(result.every(item => item.id !== data.items[0].id));
  assert.ok(result[0].audioUrl);
  assert.deepEqual(result, rankMedia(data.items, 'chores', [data.items[0].id], '2026-10-24'));
  assert.equal(rankMedia(data.items, 'evening', data.items.map(item => item.id), '2026-10-24').length, 0);
});
test('only verified platform URL shapes can create embedded players', () => {
  assert.match(embedURL('https://www.bilibili.com/video/BV1wkbF61ERR/')!, /^https:\/\/player\.bilibili\.com\//);
  assert.equal(embedURL('https://youtu.be/1WX2hpu_-N8'), 'https://www.youtube-nocookie.com/embed/1WX2hpu_-N8?autoplay=0&rel=0');
  for (const value of ['javascript:alert(1)', 'http://youtube.com/watch?v=1WX2hpu_-N8', 'https://youtube.com.attacker.test/watch?v=1WX2hpu_-N8', 'https://bilibili.com/video/bad', 'https://youtu.be/abc', 'https://www.xiaoyuzhoufm.com/episode/test']) assert.equal(embedURL(value), undefined, value);
  assert.equal(safeURL('https://user:password@example.com'), undefined);
  assert.equal(safeURL('data:text/html,hello'), undefined);
});
test('weekend exploration favors humanities and long conversations', () => {
  const base = data.items[0];
  const shortTech = { ...base, id: 'tech', topics: ['科技'], scenes: ['weekend'] as const, durationMinutes: 5 };
  const longTravel = { ...base, id: 'travel', topics: ['人文与远方'], scenes: ['weekend'] as const, durationMinutes: 90 };
  const ranked = rankMedia([shortTech, longTravel] as MediaItem[], 'weekend', [], '2026-10-24');
  assert.equal(ranked[0].id, 'travel');
});
test('catalog contains both sources, no duplicate media, and a playable destination for every entry', () => {
  assert.ok(data.items.length >= 30);
  assert.equal(new Set(data.items.map(item => item.id)).size, data.items.length);
  assert.equal(new Set(data.items.map(item => item.url)).size, data.items.length);
  assert.ok(data.items.some(item => item.sources.length === 2));
  for (const item of data.items) {
    assert.ok(safeURL(item.url), item.title);
    assert.ok(item.audioUrl || embedURL(item.url), item.title);
    if (item.audioUrl) assert.ok(safeURL(item.audioUrl));
    assert.ok(!/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(item.description));
    assert.ok(item.sources.every(source => safeURL(source.url)));
    if (item.durationMinutes) assert.ok(item.durationMinutes > 0 && Number.isFinite(item.durationMinutes));
  }
});
test('duration display does not invent missing lengths', () => {
  assert.equal(formatDuration(), '时长未标注');
  assert.equal(formatDuration(60), '1 小时');
  assert.equal(formatDuration(263), '4 小时 23 分');
});
