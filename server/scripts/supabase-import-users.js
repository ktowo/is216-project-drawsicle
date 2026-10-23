// Brings every existing account into Supabase Auth, so people keep signing in as before once the
// app switches to AUTH_PROVIDER=supabase (docs/specs/supabase-auth-email.md, ticket 06).
//
//   pnpm supabase:import-users        (in server/, with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
//
// For each account not linked yet it creates a Supabase user with the same email (marked
// confirmed: people have been using it), the existing password (Supabase stores bcrypt too, so the
// hash moves as is) and the display name, then saves the new id as the account's supabaseId.
// Google / Discord can't be created as identities here; the first time an imported person uses one
// with the same email, Supabase links it to the imported user by itself.
// Safe to run again: linked accounts are skipped. Never prints hashes. Deleted accounts are left out.
const path = require('node:path');

const DELETED_EMAIL = /@deleted\.invalid$/i;

// Supabase's admin API, with the service role key (a secret: server and this script only)
function supabaseAdmin(env = process.env) {
  const base = (env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!base || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env first.');
  return {
    // -> { id } or { error: { code, message } }
    async createUser(params) {
      const res = await fetch(`${base}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(15000),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) return { id: body.id };
      return { error: { code: body.error_code || body.code || `http_${res.status}`, message: body.msg || body.message || res.statusText } };
    },
  };
}

// -> { created, skipped, alreadyInSupabase, failed }
async function importUsers({ admin, out = console }) {
  const User = require('../models/User.js');
  const counts = { created: 0, skipped: 0, alreadyInSupabase: 0, failed: 0 };

  const users = await User.find({}).select('+passwordHash').sort({ createdAt: 1, _id: 1 });
  for (const user of users) {
    if (DELETED_EMAIL.test(user.email || '')) continue;
    if (user.supabaseId) {
      counts.skipped++;
      continue;
    }
    const params = {
      email: user.email,
      email_confirm: true,
      user_metadata: { full_name: user.displayName || '', imported_from: 'drawsicle' },
    };
    if (user.passwordHash) params.password_hash = user.passwordHash;

    const result = await admin.createUser(params);
    if (result?.id) {
      await User.updateOne({ _id: user._id }, { $set: { supabaseId: result.id } });
      counts.created++;
    } else if (result?.error?.code === 'email_exists' || /already (been )?registered/i.test(result?.error?.message || '')) {
      // Someone already signed up in Supabase with this email: their next sign-in links it (verified email)
      counts.alreadyInSupabase++;
      out.log(`  already in Supabase: ${user.email}`);
    } else {
      counts.failed++;
      out.log(`  couldn't import ${user.email}: ${result?.error?.message || 'unknown error'}`);
    }
  }

  out.log(
    `Imported ${counts.created}, already linked ${counts.skipped}, already in Supabase ${counts.alreadyInSupabase}, failed ${counts.failed}.`
  );
  return counts;
}

async function main() {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
  const admin = supabaseAdmin();
  const mongoose = require('mongoose');
  const { connectionString } = require('../db.js');
  // The app's database, or the local one the API keeps running (server/.data/db)
  const uri = connectionString() || `mongodb://127.0.0.1:${Number(process.env.LOCAL_DB_PORT) || 27018}/drawsicle`;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  try {
    const counts = await importUsers({ admin });
    if (counts.failed) process.exitCode = 1;
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

module.exports = { importUsers, supabaseAdmin };
