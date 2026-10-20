// The Supabase copy (scripts/supabase-sync.js): tables worked out from the models, rows from
// records, and pictures pointed at Supabase Storage. Nothing here talks to Supabase.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { tableName, columnsFor, schemaSql, rowFor, picturesIn, swapPictures, loadModels } = require('../scripts/supabase-sync.js');

const models = loadModels();
const model = (name) => models.find((m) => m.modelName === name);
const column = (name, col) => columnsFor(model(name)).find((c) => c.column === col);

test('every model gets a table with a sensible name', () => {
  assert.equal(tableName('User'), 'users');
  assert.equal(tableName('EventMember'), 'event_members');
  assert.equal(tableName('Match'), 'matches');
  assert.equal(tableName('GuestbookEntry'), 'guestbook_entries');
  assert.equal(tableName('StyleProfile'), 'style_profiles');
  const sql = schemaSql(models);
  for (const m of models) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${tableName(m.modelName)} `));
    assert.match(sql, new RegExp(`alter table public\\.${tableName(m.modelName)} enable row level security;`));
  }
});

test('columns follow the schema, secrets are never copied, and reserved words are quoted', () => {
  assert.equal(column('User', 'email').type, 'text');
  assert.equal(column('User', 'created_at').type, 'timestamptz');
  assert.equal(column('User', 'profile_privacy').type, 'jsonb'); // a nested object
  assert.equal(column('User', 'blocked_users').type, 'text[]');
  assert.equal(column('User', 'blocked_users').ref, 'User');
  assert.equal(column('Event', 'min_participants').type, 'double precision');
  for (const secret of ['password_hash', 'reset_token_hash', 'reset_token_expires']) {
    assert.equal(column('User', secret), undefined, `${secret} must not be a column`);
  }
  assert.doesNotMatch(schemaSql(models), /password|reset_token/);
  assert.match(schemaSql(models), /add column if not exists "user" text;/);
});

test('records become rows, with ids as text and pictures moved to Supabase', () => {
  const id = new mongoose.Types.ObjectId();
  const friend = new mongoose.Types.ObjectId();
  const doc = {
    _id: id,
    email: 'mika@example.com',
    passwordHash: 'secret',
    avatarUrl: '/uploads/avatars/mika.png',
    blockedUsers: [friend],
    profilePrivacy: { showGifts: true },
    createdAt: new Date('2026-10-01T10:00:00Z'),
  };
  const addresses = picturesIn(doc);
  assert.deepEqual([...addresses], ['/uploads/avatars/mika.png']);

  const moved = new Map([['/uploads/avatars/mika.png', 'https://x.supabase.co/storage/v1/object/public/drawsicle/avatars/mika.png']]);
  const row = rowFor(swapPictures(doc, moved), columnsFor(model('User')));
  assert.equal(row.id, id.toString());
  assert.equal(row.avatar_url, moved.get('/uploads/avatars/mika.png'));
  assert.deepEqual(row.blocked_users, [friend.toString()]);
  assert.deepEqual(row.profile_privacy, { showGifts: true });
  assert.equal(row.created_at, '2026-10-01T10:00:00.000Z');
  assert.equal(row.password_hash, undefined);
  // Only our own storage counts as a picture to move
  assert.equal(picturesIn({ a: 'https://example.com/x.png', b: '/api/files/0123456789abcdef01234567.png' }).size, 1);
});
