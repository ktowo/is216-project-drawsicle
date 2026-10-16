// Copies Drawsicle's data into Supabase: a Postgres table for every model (worked out from the
// Mongoose schemas, so the tables always match the app), every record, and every stored picture
// into Supabase Storage.
//
//   node scripts/supabase-sync.js --sql             write the tables to ../supabase/schema.sql
//   node scripts/supabase-sync.js --apply-schema    create or update the tables (SUPABASE_DB_URL)
//   node scripts/supabase-sync.js                   copy every record and picture across
//   node scripts/supabase-sync.js --move-pictures   ...and point the app's own records at the
//                                                   copies in Supabase Storage too
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (and SUPABASE_DB_URL, the database's
// connection string, for --apply-schema; or paste schema.sql into Supabase's SQL editor).
// The database is the one the app uses (server/.env), or the local one while the API runs.
//
// Every table has row-level security switched on with no policies, so only the service role
// (this script, the server) can read it: the anon key is public and must see nothing.
// Password hashes and reset tokens are never copied.
const fs = require('node:fs');
const path = require('node:path');

const SECRET_FIELDS = new Set(['passwordHash', 'resetTokenHash', 'resetTokenExpires']);
const BATCH = 500;

// ---------- Names ----------

const snake = (name) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();

function plural(word) {
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|ch|sh)$/.test(word)) return `${word}es`;
  return `${word}s`;
}

// EventMember -> event_members, Match -> matches, GuestbookEntry -> guestbook_entries
const tableName = (modelName) => plural(snake(modelName));

// ---------- Columns from a Mongoose schema ----------

function elementOf(schemaType) {
  return schemaType.embeddedSchemaType || schemaType.$embeddedSchemaType || schemaType.caster || null;
}

function sqlType(schemaType) {
  switch (schemaType.instance) {
    case 'String':
    case 'ObjectId':
    case 'ObjectID':
      return 'text';
    case 'Number':
      return 'double precision';
    case 'Boolean':
      return 'boolean';
    case 'Date':
      return 'timestamptz';
    case 'Array': {
      const el = elementOf(schemaType)?.instance;
      return ['String', 'ObjectId', 'ObjectID'].includes(el) ? 'text[]' : 'jsonb';
    }
    default:
      return 'jsonb'; // embedded documents, maps and anything else
  }
}

// [{ key (top-level field), column, type, ref }] for a model; nested objects become one jsonb column.
// Column names are quoted in the SQL, since some (like "user") are reserved words in Postgres.
function columnsFor(model) {
  const columns = new Map();
  model.schema.eachPath((p, schemaType) => {
    if (p === '__v' || SECRET_FIELDS.has(p) || schemaType.options?.select === false) return;
    const [top] = p.split('.');
    if (SECRET_FIELDS.has(top)) return;
    const nested = p.includes('.');
    const column = top === '_id' ? 'id' : snake(top);
    if (nested) {
      if (!columns.has(top)) columns.set(top, { key: top, column, type: 'jsonb', ref: null });
      return;
    }
    const ref = schemaType.options?.ref || elementOf(schemaType)?.options?.ref || null;
    columns.set(top, { key: top, column, type: top === '_id' ? 'text' : sqlType(schemaType), ref });
  });
  return [...columns.values()];
}

function loadModels() {
  const mongoose = require('mongoose');
  const dir = path.join(__dirname, '..', 'models');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort()) require(path.join(dir, file));
  return Object.values(mongoose.models).sort((a, b) => a.modelName.localeCompare(b.modelName));
}

// ---------- The tables ----------

function schemaSql(models) {
  const lines = [
    '-- Drawsicle in Supabase: one table per app model, made by server/scripts/supabase-sync.js',
    '-- from the Mongoose schemas. Run it again (or paste it into the SQL editor) after models change:',
    '-- it only adds what is missing. Row-level security is on with no policies, so only the',
    "-- service role can read or write; the public anon key sees nothing.",
    '',
  ];
  for (const model of models) {
    const table = tableName(model.modelName);
    const columns = columnsFor(model);
    lines.push(`-- ${model.modelName}`);
    lines.push(`create table if not exists public.${table} (\n  id text primary key\n);`);
    for (const c of columns) {
      if (c.column === 'id') continue;
      lines.push(`alter table public.${table} add column if not exists "${c.column}" ${c.type};`);
    }
    for (const c of columns.filter((x) => x.ref)) {
      const index = `${table}_${c.column}_idx`.slice(0, 63);
      lines.push(`create index if not exists ${index} on public.${table} ${c.type === 'text[]' ? 'using gin ' : ''}("${c.column}");`);
    }
    lines.push(`alter table public.${table} enable row level security;`);
    lines.push(`comment on table public.${table} is 'Copied from the app''s ${model.modelName} records by supabase-sync.js';`);
    lines.push('');
  }
  lines.push("-- Let the API see the new tables straight away");
  lines.push("notify pgrst, 'reload schema';");
  return `${lines.join('\n')}\n`;
}

async function applySchema(sql) {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    throw new Error(
      'Set SUPABASE_DB_URL to the database connection string (Supabase: Project Settings > Database), ' +
        'or paste supabase/schema.sql into the SQL editor instead.'
    );
  }
  const { Client } = require('pg');
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

// ---------- Rows ----------

const plain = (value) => JSON.parse(JSON.stringify(value)); // ObjectIds become hex strings, dates ISO

function rowFor(doc, columns) {
  const row = {};
  for (const c of columns) {
    const value = doc[c.key];
    if (value === undefined) continue;
    if (value === null) row[c.column] = null;
    else if (c.type === 'text') row[c.column] = String(value);
    else if (c.type === 'text[]') row[c.column] = (value || []).map(String);
    else if (c.type === 'timestamptz') row[c.column] = new Date(value).toISOString();
    else if (c.type === 'double precision' || c.type === 'boolean') row[c.column] = value;
    else row[c.column] = plain(value);
  }
  return row;
}

// ---------- Supabase REST ----------

function rest() {
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!base || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env.');
  return async (route, { method = 'GET', body, headers = {} } = {}) => {
    const res = await fetch(`${base}/rest/v1/${route}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 404 && /relation|schema cache|Could not find the table/i.test(text)) {
        throw new Error(`Supabase has no "${route.split('?')[0]}" table yet. Create the tables first (--apply-schema, or schema.sql in the SQL editor).`);
      }
      throw new Error(`Supabase answered ${res.status} for ${method} ${route.split('?')[0]}: ${text.slice(0, 300)}`);
    }
    return method === 'GET' ? res.json() : null;
  };
}

// Every id already in a table, a thousand at a time
async function idsIn(call, table) {
  const ids = [];
  for (let from = 0; ; from += 1000) {
    const page = await call(`${table}?select=id&order=id`, { headers: { Range: `${from}-${from + 999}` } });
    ids.push(...page.map((r) => r.id));
    if (page.length < 1000) return ids;
  }
}

// ---------- Pictures ----------

const STORED = /^\/uploads\/[\w./-]+$|^\/api\/files\/[a-f0-9]{24}\.[a-z0-9]+$/i;

// Every picture address in a document (or anything inside it) that points at our own storage
function picturesIn(value, found = new Set()) {
  if (typeof value === 'string') {
    if (STORED.test(value)) found.add(value);
  } else if (Array.isArray(value)) {
    for (const v of value) picturesIn(v, found);
  } else if (value && typeof value === 'object' && !(value instanceof Date) && !value._bsontype) {
    for (const v of Object.values(value)) picturesIn(v, found);
  }
  return found;
}

function swapPictures(value, moved) {
  if (typeof value === 'string') return moved.get(value) || value;
  if (Array.isArray(value)) return value.map((v) => swapPictures(v, moved));
  if (value && typeof value === 'object' && !(value instanceof Date) && !value._bsontype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, swapPictures(v, moved)]));
  }
  return value;
}

const CONTENT_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };

// Copies each picture into Supabase Storage under the same path; returns old address -> new
async function copyPictures(addresses) {
  const storage = require('../services/storage.js');
  const moved = new Map();
  let failed = 0;
  for (const address of addresses) {
    try {
      const bytes = await storage.readImage(address);
      if (!bytes) throw new Error('not found');
      const ext = address.split('.').pop().toLowerCase();
      const name = address.startsWith('/uploads/') ? address.slice('/uploads/'.length) : `files/${address.split('/').pop()}`;
      moved.set(address, await storage.saveFile(name.split('/')[0], bytes, CONTENT_TYPES[ext], name));
    } catch (err) {
      failed += 1;
      console.warn(`  couldn't copy ${address}: ${err.message}`);
    }
  }
  return { moved, failed };
}

// ---------- The copy ----------

async function sync({ movePictures = false } = {}) {
  const models = loadModels();
  const call = rest();
  const docsByModel = new Map();
  for (const model of models) docsByModel.set(model, await model.find().lean());

  // Pictures first, so the copied records point at Supabase Storage
  const addresses = new Set();
  for (const docs of docsByModel.values()) for (const doc of docs) picturesIn(doc, addresses);
  const storage = require('../services/storage.js');
  const canCopy = storage.storageMode() === 'supabase';
  const { moved, failed } = canCopy && addresses.size ? await copyPictures(addresses) : { moved: new Map(), failed: 0 };
  console.log(`Pictures: ${moved.size} copied to Supabase Storage${failed ? `, ${failed} couldn't be` : ''}${canCopy ? '' : ' (skipped: uploads are not set to Supabase)'}`);

  const summary = {};
  for (const [model, docs] of docsByModel) {
    const table = tableName(model.modelName);
    const columns = columnsFor(model);
    const rows = docs.map((doc) => rowFor(swapPictures(doc, moved), columns));
    for (let i = 0; i < rows.length; i += BATCH) {
      await call(`${table}?on_conflict=id`, {
        method: 'POST',
        body: rows.slice(i, i + BATCH),
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      });
    }
    // Records deleted in the app go from Supabase too
    const keep = new Set(rows.map((r) => r.id));
    const gone = (await idsIn(call, table)).filter((id) => !keep.has(id));
    for (let i = 0; i < gone.length; i += 100) {
      await call(`${table}?id=in.(${gone.slice(i, i + 100).map((id) => `"${id}"`).join(',')})`, { method: 'DELETE' });
    }
    summary[table] = { copied: rows.length, removed: gone.length };

    // Optionally the app's own records use the Supabase copies from now on
    if (movePictures && moved.size) {
      let changed = 0;
      for (const doc of docs) {
        const swapped = swapPictures(doc, moved);
        const set = {};
        for (const key of Object.keys(doc)) if (JSON.stringify(doc[key]) !== JSON.stringify(swapped[key])) set[key] = swapped[key];
        if (Object.keys(set).length) {
          await model.collection.updateOne({ _id: doc._id }, { $set: set });
          changed += 1;
        }
      }
      if (changed) summary[table].picturesMoved = changed;
    }
  }
  return summary;
}

async function main() {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
  const args = new Set(process.argv.slice(2));
  const models = loadModels();
  const sql = schemaSql(models);

  if (args.has('--sql')) {
    const out = path.join(__dirname, '..', '..', 'supabase', 'schema.sql');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, sql);
    console.log(`Wrote ${models.length} tables to supabase/schema.sql`);
    return;
  }
  if (args.has('--apply-schema')) {
    await applySchema(sql);
    console.log(`Supabase has all ${models.length} tables.`);
    return;
  }

  const mongoose = require('mongoose');
  const { connectionString } = require('../db.js');
  // The app's database, or the local one the API keeps running (server/.data/db)
  const uri = connectionString() || `mongodb://127.0.0.1:${Number(process.env.LOCAL_DB_PORT) || 27018}/drawsicle`;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  try {
    const summary = await sync({ movePictures: args.has('--move-pictures') });
    for (const [table, s] of Object.entries(summary)) {
      console.log(`  ${table.padEnd(20)} ${String(s.copied).padStart(5)} copied${s.removed ? `, ${s.removed} removed` : ''}${s.picturesMoved ? `, ${s.picturesMoved} now use Supabase pictures` : ''}`);
    }
    console.log('Supabase is up to date.');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    if (/ECONNREFUSED|Server selection/i.test(err.message)) console.error('Start the API first (it runs the local database), or set DB_MONGODB_URI.');
    process.exit(1);
  });
}

module.exports = { tableName, columnsFor, schemaSql, rowFor, picturesIn, swapPictures, loadModels };
