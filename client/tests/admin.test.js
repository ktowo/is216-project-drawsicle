// The site admin tools in demo mode (same rules as server/routes/admin-router.js)
import { beforeEach, expect, it } from 'vitest';
import { DEMO_PASSWORD } from '@shared/demo-data.mjs';
import { mockRequest, resetMockData, setMockLatency } from '../src/mock/index.js';

const call = (path, method = 'GET', body) => mockRequest(path, { method, body });
async function ok(path, method, body) {
  const res = await call(path, method, body);
  if (res.status >= 400) throw new Error(`${method || 'GET'} ${path} answered ${res.status}: ${JSON.stringify(res.data)}`);
  return res.data;
}
const login = (key) => call('/auth/login', 'POST', { email: `${key}@demo.test`, password: DEMO_PASSWORD });
const logout = () => call('/auth/logout', 'POST');

beforeEach(() => {
  setMockLatency(0);
  resetMockData();
});

it('lets admins in, moderators part of the way, and nobody else', async () => {
  expect((await call('/admin/stats')).status).toBe(401);
  await login('mika');
  expect((await call('/admin/stats')).data.code).toBe('ACCESS_DENIED');

  await logout();
  await login('noor'); // moderator
  expect((await call('/admin/reports')).status).toBe(200);
  expect((await call('/admin/users')).status).toBe(200);
  expect((await call('/admin/events')).status).toBe(403);
  const sol = (await ok('/admin/users?q=sol')).users.find((u) => u.username === 'sol');
  expect((await call(`/admin/users/${sol.id}/ban`, 'POST', { reason: 'x' })).status).toBe(403);

  await logout();
  await login('ada');
  const stats = await ok('/admin/stats');
  expect(stats.users.total).toBeGreaterThan(200);
  expect(stats.openReports).toBeGreaterThan(0);
  expect(stats.recent.users).toHaveLength(5);
  // Nobody joined in the future
  expect(stats.recent.users.every((u) => new Date(u.createdAt) <= new Date())).toBe(true);
});

it('bans, unbans and changes roles, and writes it all down', async () => {
  await login('ada');
  const { users } = await ok('/admin/users?q=pip');
  const pip = users.find((u) => u.username === 'pip');
  expect((await call(`/admin/users/${pip.id}/ban`, 'POST', {})).data.code).toBe('VALIDATION');
  const banned = await ok(`/admin/users/${pip.id}/ban`, 'POST', { reason: 'Spamming the museum' });
  expect(banned.user.status).toBe('banned');
  expect((await call(`/admin/users/${pip.id}/ban`, 'POST', { reason: 'again' })).data.code).toBe('ALREADY_BANNED');

  await logout();
  const refused = await login('pip');
  expect(refused.status).toBe(403);
  expect(refused.data).toMatchObject({ code: 'ACCOUNT_BANNED' });
  expect(refused.data.error).toMatch(/Spamming the museum/);

  await login('ada');
  await ok(`/admin/users/${pip.id}/unban`, 'POST', {});
  const promoted = await ok(`/admin/users/${pip.id}`, 'PATCH', { role: 'moderator' });
  expect(promoted.user.role).toBe('moderator');
  const ada = (await ok('/admin/users?q=ada')).users.find((u) => u.username === 'ada');
  expect((await call(`/admin/users/${ada.id}`, 'PATCH', { role: 'user' })).data.code).toBe('SELF');

  const { entries } = await ok('/admin/audit?targetType=user');
  expect(entries.map((e) => e.action)).toEqual(['user.promote', 'user.unban', 'user.ban']);
  expect((await login('pip')).status).toBe(200);
});

it('disables, enables, cancels and restores events', async () => {
  await login('ada');
  const { events } = await ok('/admin/events?q=Moth%20%26%20Lantern');
  const moth = events.find((e) => e.name === 'Moth & Lantern Exchange');

  await ok(`/admin/events/${moth.id}/disable`, 'POST', { reason: 'Checking the rules' });
  await logout();
  expect((await ok('/events?limit=50')).events.map((e) => e.name)).not.toContain('Moth & Lantern Exchange');
  expect((await call(`/events/${moth.id}`)).status).toBe(404);
  // The organiser still sees it, with the reason, and was told
  await login('kit');
  const asKit = await ok(`/events/${moth.id}`);
  expect(asKit.event).toMatchObject({ disabled: true, disabledReason: 'Checking the rules' });
  expect((await ok('/notifications')).items[0].title).toMatch(/was disabled/);

  await logout();
  await login('ada');
  await ok(`/admin/events/${moth.id}/enable`, 'POST', {});
  const cancelled = await ok(`/admin/events/${moth.id}/cancel`, 'POST', { reason: 'Organiser asked us to' });
  expect(cancelled.event).toMatchObject({ status: 'cancelled', cancelReason: 'Organiser asked us to' });
  const restored = await ok(`/admin/events/${moth.id}/restore`, 'POST', {});
  expect(restored.event.status).toBe('open');
});

it('works through reports and museum chat', async () => {
  await login('ada');
  const queue = await ok('/admin/reports');
  expect(queue.counts.open).toBeGreaterThan(0);
  const report = queue.reports[0];
  expect(report.reporter.displayName).toBeTruthy();
  const done = await ok(`/admin/reports/${report.id}`, 'PATCH', { status: 'resolved', resolution: 'Asked them to stop.' });
  expect(done.report).toMatchObject({ status: 'resolved', resolution: 'Asked them to stop.' });
  expect((await ok('/admin/reports')).counts.open).toBe(queue.counts.open - 1);

  // Sol says something in a museum wing; a moderator hides it and pauses Sol's chat
  const spring = (await ok('/events?status=completed&limit=50')).events.find((e) => e.name === 'Spring Bloom Exchange');
  await logout();
  await login('sol');
  await ok(`/museum/rooms/wing/${spring.id}/0/chat`, 'POST', { text: 'buy my adopts!!' });
  await logout();
  await login('noor');
  const chat = await ok('/admin/chat?q=adopts');
  expect(chat.messages[0]).toMatchObject({ text: 'buy my adopts!!', hidden: false });
  await ok(`/admin/chat/${chat.messages[0].id}/hide`, 'POST', {});
  expect((await ok('/admin/chat?show=hidden')).messages[0].text).toBe('buy my adopts!!');
  const muted = await ok(`/admin/users/${chat.messages[0].user.id}/mute`, 'POST', { minutes: 60, reason: 'Selling in chat' });
  expect(muted.user.chatMutedUntil).toBeTruthy();
  await logout();
  await login('sol');
  expect((await call(`/museum/rooms/wing/${spring.id}/0/chat`, 'POST', { text: 'hello?' })).data.code).toBe('MUTED');
  await logout();
  await login('ada');
  const vision = await ok('/admin/vision');
  expect(vision.report.reachable).toBe(false);
});
