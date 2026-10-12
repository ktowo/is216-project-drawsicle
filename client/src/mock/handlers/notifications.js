// /notifications (server/routes/notification-router.js)
import { notify, notificationPublic } from '../model.js';
import { httpError } from '../util.js';

const notFound = () => httpError(404, 'Notification not found.', 'NOT_FOUND');

const mine = (ctx, user) => ctx.state.notifications.filter((n) => n.user === user.id);
const unread = (list) => list.filter((n) => !n.readAt).length;

// Newest first; ids break ties the way ObjectIds do (they start with the creation time)
const newestFirst = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id.localeCompare(a.id);

export function register(router) {
  router.get('/notifications', (ctx) => {
    const user = ctx.requireAuth();
    const limit = Math.min(Math.max(Number(ctx.query.limit) || 20, 1), 50);
    const list = mine(ctx, user);
    return {
      items: [...list].sort(newestFirst).slice(0, limit).map(notificationPublic),
      unreadCount: unread(list),
    };
  });

  router.get('/notifications/unread-count', (ctx) => {
    const user = ctx.requireAuth();
    return { unreadCount: unread(mine(ctx, user)) };
  });

  router.patch('/notifications/:id/read', (ctx) => {
    const user = ctx.requireAuth();
    // Someone else's notification looks exactly like a missing one
    const n = ctx.state.notifications.find((x) => x.id === ctx.params.id && x.user === user.id);
    if (!n) throw notFound();
    n.readAt = ctx.now.toISOString();
    return { notification: notificationPublic(n) };
  });

  router.post('/notifications/read-all', (ctx) => {
    const user = ctx.requireAuth();
    const at = ctx.now.toISOString();
    for (const n of mine(ctx, user)) if (!n.readAt) n.readAt = at;
    return { ok: true };
  });

  router.post('/notifications/test', (ctx) => {
    const user = ctx.requireAuth();
    const n = notify(ctx.state, user.id, {
      type: 'test',
      title: 'Test notification',
      message: 'If you can see this, notifications work.',
      link: '/profile',
    });
    ctx.status = 201;
    return { notification: notificationPublic(n) };
  });

  router.delete('/notifications/:id', (ctx) => {
    const user = ctx.requireAuth();
    const before = ctx.state.notifications.length;
    ctx.state.notifications = ctx.state.notifications.filter((n) => !(n.id === ctx.params.id && n.user === user.id));
    if (ctx.state.notifications.length === before) throw notFound();
    return { ok: true };
  });
}
