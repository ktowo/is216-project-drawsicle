-- Drawsicle in Supabase: one table per app model, made by server/scripts/supabase-sync.js
-- from the Mongoose schemas. Run it again (or paste it into the SQL editor) after models change:
-- it only adds what is missing. Row-level security is on with no policies, so only the
-- service role can read or write; the public anon key sees nothing.

-- Announcement
create table if not exists public.announcements (
  id text primary key
);
alter table public.announcements add column if not exists "event" text;
alter table public.announcements add column if not exists "author" text;
alter table public.announcements add column if not exists "message" text;
alter table public.announcements add column if not exists "created_at" timestamptz;
create index if not exists announcements_event_idx on public.announcements ("event");
create index if not exists announcements_author_idx on public.announcements ("author");
alter table public.announcements enable row level security;
comment on table public.announcements is 'Copied from the app''s Announcement records by supabase-sync.js';

-- Application
create table if not exists public.applications (
  id text primary key
);
alter table public.applications add column if not exists "event" text;
alter table public.applications add column if not exists "user" text;
alter table public.applications add column if not exists "status" text;
alter table public.applications add column if not exists "community_username" text;
alter table public.applications add column if not exists "can_create" text[];
alter table public.applications add column if not exists "wants_types" text[];
alter table public.applications add column if not exists "offered_characters" text[];
alter table public.applications add column if not exists "likes" text;
alter table public.applications add column if not exists "avoid" text;
alter table public.applications add column if not exists "cannot_draw" text[];
alter table public.applications add column if not exists "notes" text;
alter table public.applications add column if not exists "can_backup" boolean;
alter table public.applications add column if not exists "style_preference" text;
alter table public.applications add column if not exists "waitlisted_at" timestamptz;
alter table public.applications add column if not exists "reviewed_by" text;
alter table public.applications add column if not exists "reviewed_at" timestamptz;
alter table public.applications add column if not exists "created_at" timestamptz;
alter table public.applications add column if not exists "updated_at" timestamptz;
create index if not exists applications_event_idx on public.applications ("event");
create index if not exists applications_user_idx on public.applications ("user");
create index if not exists applications_offered_characters_idx on public.applications using gin ("offered_characters");
create index if not exists applications_reviewed_by_idx on public.applications ("reviewed_by");
alter table public.applications enable row level security;
comment on table public.applications is 'Copied from the app''s Application records by supabase-sync.js';

-- AuditLog
create table if not exists public.audit_logs (
  id text primary key
);
alter table public.audit_logs add column if not exists "actor" text;
alter table public.audit_logs add column if not exists "action" text;
alter table public.audit_logs add column if not exists "target_type" text;
alter table public.audit_logs add column if not exists "target_id" text;
alter table public.audit_logs add column if not exists "target_label" text;
alter table public.audit_logs add column if not exists "reason" text;
alter table public.audit_logs add column if not exists "created_at" timestamptz;
create index if not exists audit_logs_actor_idx on public.audit_logs ("actor");
alter table public.audit_logs enable row level security;
comment on table public.audit_logs is 'Copied from the app''s AuditLog records by supabase-sync.js';

-- CatStat
create table if not exists public.cat_stats (
  id text primary key
);
alter table public.cat_stats add column if not exists "key" text;
alter table public.cat_stats add column if not exists "pets" double precision;
alter table public.cat_stats add column if not exists "last_pet_at" timestamptz;
alter table public.cat_stats add column if not exists "last_pet_by" text;
create index if not exists cat_stats_last_pet_by_idx on public.cat_stats ("last_pet_by");
alter table public.cat_stats enable row level security;
comment on table public.cat_stats is 'Copied from the app''s CatStat records by supabase-sync.js';

-- Character
create table if not exists public.characters (
  id text primary key
);
alter table public.characters add column if not exists "owner" text;
alter table public.characters add column if not exists "name" text;
alter table public.characters add column if not exists "description" text;
alter table public.characters add column if not exists "species" text;
alter table public.characters add column if not exists "tags" text[];
alter table public.characters add column if not exists "reference_links" jsonb;
alter table public.characters add column if not exists "notes_for_artists" text;
alter table public.characters add column if not exists "content_warnings" text[];
alter table public.characters add column if not exists "archived_at" timestamptz;
alter table public.characters add column if not exists "created_at" timestamptz;
alter table public.characters add column if not exists "updated_at" timestamptz;
create index if not exists characters_owner_idx on public.characters ("owner");
alter table public.characters enable row level security;
comment on table public.characters is 'Copied from the app''s Character records by supabase-sync.js';

-- ChatMessage
create table if not exists public.chat_messages (
  id text primary key
);
alter table public.chat_messages add column if not exists "room" text;
alter table public.chat_messages add column if not exists "room_label" text;
alter table public.chat_messages add column if not exists "event" text;
alter table public.chat_messages add column if not exists "user" text;
alter table public.chat_messages add column if not exists "kind" text;
alter table public.chat_messages add column if not exists "emote" text;
alter table public.chat_messages add column if not exists "target" text;
alter table public.chat_messages add column if not exists "text" text;
alter table public.chat_messages add column if not exists "hidden_at" timestamptz;
alter table public.chat_messages add column if not exists "hidden_by" text;
alter table public.chat_messages add column if not exists "created_at" timestamptz;
create index if not exists chat_messages_event_idx on public.chat_messages ("event");
create index if not exists chat_messages_user_idx on public.chat_messages ("user");
create index if not exists chat_messages_hidden_by_idx on public.chat_messages ("hidden_by");
alter table public.chat_messages enable row level security;
comment on table public.chat_messages is 'Copied from the app''s ChatMessage records by supabase-sync.js';

-- Event
create table if not exists public.events (
  id text primary key
);
alter table public.events add column if not exists "name" text;
alter table public.events add column if not exists "description" text;
alter table public.events add column if not exists "theme" text;
alter table public.events add column if not exists "season" text;
alter table public.events add column if not exists "rules" text;
alter table public.events add column if not exists "tags" text[];
alter table public.events add column if not exists "platform" text;
alter table public.events add column if not exists "platform_name" text;
alter table public.events add column if not exists "platform_link" text;
alter table public.events add column if not exists "signup_deadline" timestamptz;
alter table public.events add column if not exists "submission_deadline" timestamptz;
alter table public.events add column if not exists "min_participants" double precision;
alter table public.events add column if not exists "max_participants" double precision;
alter table public.events add column if not exists "allowed_types" text[];
alter table public.events add column if not exists "status" text;
alter table public.events add column if not exists "publicity" text;
alter table public.events add column if not exists "invite_code" text;
alter table public.events add column if not exists "require_approval" boolean;
alter table public.events add column if not exists "adult_only" boolean;
alter table public.events add column if not exists "banner_url" text;
alter table public.events add column if not exists "time_zone" text;
alter table public.events add column if not exists "discord_webhook_url" text;
alter table public.events add column if not exists "matching_rules" jsonb;
alter table public.events add column if not exists "auto_match" jsonb;
alter table public.events add column if not exists "museum_theme" text;
alter table public.events add column if not exists "style_scan" jsonb;
alter table public.events add column if not exists "invited_from" text[];
alter table public.events add column if not exists "created_by" text;
alter table public.events add column if not exists "status_history" jsonb;
alter table public.events add column if not exists "published_at" timestamptz;
alter table public.events add column if not exists "completed_at" timestamptz;
alter table public.events add column if not exists "reminders_sent" text[];
alter table public.events add column if not exists "cancelled_at" timestamptz;
alter table public.events add column if not exists "cancel_reason" text;
alter table public.events add column if not exists "cancelled_by" text;
alter table public.events add column if not exists "status_before_cancel" text;
alter table public.events add column if not exists "disabled_at" timestamptz;
alter table public.events add column if not exists "disabled_reason" text;
alter table public.events add column if not exists "disabled_by" text;
alter table public.events add column if not exists "created_at" timestamptz;
alter table public.events add column if not exists "updated_at" timestamptz;
create index if not exists events_invited_from_idx on public.events using gin ("invited_from");
create index if not exists events_created_by_idx on public.events ("created_by");
create index if not exists events_cancelled_by_idx on public.events ("cancelled_by");
create index if not exists events_disabled_by_idx on public.events ("disabled_by");
alter table public.events enable row level security;
comment on table public.events is 'Copied from the app''s Event records by supabase-sync.js';

-- EventMember
create table if not exists public.event_members (
  id text primary key
);
alter table public.event_members add column if not exists "user" text;
alter table public.event_members add column if not exists "event" text;
alter table public.event_members add column if not exists "roles" text[];
alter table public.event_members add column if not exists "created_at" timestamptz;
alter table public.event_members add column if not exists "updated_at" timestamptz;
create index if not exists event_members_user_idx on public.event_members ("user");
create index if not exists event_members_event_idx on public.event_members ("event");
alter table public.event_members enable row level security;
comment on table public.event_members is 'Copied from the app''s EventMember records by supabase-sync.js';

-- Favourite
create table if not exists public.favourites (
  id text primary key
);
alter table public.favourites add column if not exists "user" text;
alter table public.favourites add column if not exists "submission" text;
alter table public.favourites add column if not exists "created_at" timestamptz;
create index if not exists favourites_user_idx on public.favourites ("user");
create index if not exists favourites_submission_idx on public.favourites ("submission");
alter table public.favourites enable row level security;
comment on table public.favourites is 'Copied from the app''s Favourite records by supabase-sync.js';

-- Follow
create table if not exists public.follows (
  id text primary key
);
alter table public.follows add column if not exists "follower" text;
alter table public.follows add column if not exists "following" text;
alter table public.follows add column if not exists "created_at" timestamptz;
create index if not exists follows_follower_idx on public.follows ("follower");
create index if not exists follows_following_idx on public.follows ("following");
alter table public.follows enable row level security;
comment on table public.follows is 'Copied from the app''s Follow records by supabase-sync.js';

-- GuestbookEntry
create table if not exists public.guestbook_entries (
  id text primary key
);
alter table public.guestbook_entries add column if not exists "event" text;
alter table public.guestbook_entries add column if not exists "user" text;
alter table public.guestbook_entries add column if not exists "text" text;
alter table public.guestbook_entries add column if not exists "hidden_at" timestamptz;
alter table public.guestbook_entries add column if not exists "hidden_by" text;
alter table public.guestbook_entries add column if not exists "created_at" timestamptz;
create index if not exists guestbook_entries_event_idx on public.guestbook_entries ("event");
create index if not exists guestbook_entries_user_idx on public.guestbook_entries ("user");
create index if not exists guestbook_entries_hidden_by_idx on public.guestbook_entries ("hidden_by");
alter table public.guestbook_entries enable row level security;
comment on table public.guestbook_entries is 'Copied from the app''s GuestbookEntry records by supabase-sync.js';

-- JobRun
create table if not exists public.job_runs (
  id text primary key
);
alter table public.job_runs add column if not exists "last_run_at" timestamptz;
alter table public.job_runs enable row level security;
comment on table public.job_runs is 'Copied from the app''s JobRun records by supabase-sync.js';

-- Match
create table if not exists public.matches (
  id text primary key
);
alter table public.matches add column if not exists "event" text;
alter table public.matches add column if not exists "giver" text;
alter table public.matches add column if not exists "recipient" text;
alter table public.matches add column if not exists "giver_application" text;
alter table public.matches add column if not exists "recipient_application" text;
alter table public.matches add column if not exists "score" double precision;
alter table public.matches add column if not exists "reasons" text[];
alter table public.matches add column if not exists "published" boolean;
alter table public.matches add column if not exists "status" text;
alter table public.matches add column if not exists "reminders_sent" text[];
alter table public.matches add column if not exists "backup_giver" text;
alter table public.matches add column if not exists "backup_assigned_at" timestamptz;
alter table public.matches add column if not exists "progress" jsonb;
alter table public.matches add column if not exists "questions" jsonb;
alter table public.matches add column if not exists "created_at" timestamptz;
alter table public.matches add column if not exists "updated_at" timestamptz;
create index if not exists matches_event_idx on public.matches ("event");
create index if not exists matches_giver_idx on public.matches ("giver");
create index if not exists matches_recipient_idx on public.matches ("recipient");
create index if not exists matches_giver_application_idx on public.matches ("giver_application");
create index if not exists matches_recipient_application_idx on public.matches ("recipient_application");
create index if not exists matches_backup_giver_idx on public.matches ("backup_giver");
alter table public.matches enable row level security;
comment on table public.matches is 'Copied from the app''s Match records by supabase-sync.js';

-- Notification
create table if not exists public.notifications (
  id text primary key
);
alter table public.notifications add column if not exists "user" text;
alter table public.notifications add column if not exists "type" text;
alter table public.notifications add column if not exists "title" text;
alter table public.notifications add column if not exists "message" text;
alter table public.notifications add column if not exists "link" text;
alter table public.notifications add column if not exists "read_at" timestamptz;
alter table public.notifications add column if not exists "created_at" timestamptz;
alter table public.notifications add column if not exists "updated_at" timestamptz;
create index if not exists notifications_user_idx on public.notifications ("user");
alter table public.notifications enable row level security;
comment on table public.notifications is 'Copied from the app''s Notification records by supabase-sync.js';

-- Presence
create table if not exists public.presences (
  id text primary key
);
alter table public.presences add column if not exists "user" text;
alter table public.presences add column if not exists "room" text;
alter table public.presences add column if not exists "label" text;
alter table public.presences add column if not exists "link" text;
alter table public.presences add column if not exists "x" double precision;
alter table public.presences add column if not exists "y" double precision;
alter table public.presences add column if not exists "facing" text;
alter table public.presences add column if not exists "sitting" boolean;
alter table public.presences add column if not exists "dancing" boolean;
alter table public.presences add column if not exists "updated_at" timestamptz;
create index if not exists presences_user_idx on public.presences ("user");
alter table public.presences enable row level security;
comment on table public.presences is 'Copied from the app''s Presence records by supabase-sync.js';

-- Report
create table if not exists public.reports (
  id text primary key
);
alter table public.reports add column if not exists "reporter" text;
alter table public.reports add column if not exists "target_type" text;
alter table public.reports add column if not exists "target_id" text;
alter table public.reports add column if not exists "target_label" text;
alter table public.reports add column if not exists "target_owner" text;
alter table public.reports add column if not exists "event" text;
alter table public.reports add column if not exists "reason" text;
alter table public.reports add column if not exists "details" text;
alter table public.reports add column if not exists "status" text;
alter table public.reports add column if not exists "handled_by" text;
alter table public.reports add column if not exists "handled_at" timestamptz;
alter table public.reports add column if not exists "resolution" text;
alter table public.reports add column if not exists "created_at" timestamptz;
alter table public.reports add column if not exists "updated_at" timestamptz;
create index if not exists reports_reporter_idx on public.reports ("reporter");
create index if not exists reports_target_owner_idx on public.reports ("target_owner");
create index if not exists reports_event_idx on public.reports ("event");
create index if not exists reports_handled_by_idx on public.reports ("handled_by");
alter table public.reports enable row level security;
comment on table public.reports is 'Copied from the app''s Report records by supabase-sync.js';

-- StyleProfile
create table if not exists public.style_profiles (
  id text primary key
);
alter table public.style_profiles add column if not exists "user" text;
alter table public.style_profiles add column if not exists "features" jsonb;
alter table public.style_profiles add column if not exists "palette" text[];
alter table public.style_profiles add column if not exists "tags" text[];
alter table public.style_profiles add column if not exists "summary" text;
alter table public.style_profiles add column if not exists "vector" jsonb;
alter table public.style_profiles add column if not exists "vision_model" text;
alter table public.style_profiles add column if not exists "image_count" double precision;
alter table public.style_profiles add column if not exists "analysed_at" timestamptz;
alter table public.style_profiles add column if not exists "created_at" timestamptz;
alter table public.style_profiles add column if not exists "updated_at" timestamptz;
create index if not exists style_profiles_user_idx on public.style_profiles ("user");
alter table public.style_profiles enable row level security;
comment on table public.style_profiles is 'Copied from the app''s StyleProfile records by supabase-sync.js';

-- Submission
create table if not exists public.submissions (
  id text primary key
);
alter table public.submissions add column if not exists "event" text;
alter table public.submissions add column if not exists "match" text;
alter table public.submissions add column if not exists "giver" text;
alter table public.submissions add column if not exists "recipient" text;
alter table public.submissions add column if not exists "title" text;
alter table public.submissions add column if not exists "message" text;
alter table public.submissions add column if not exists "type" text;
alter table public.submissions add column if not exists "images" text[];
alter table public.submissions add column if not exists "thumbnails" jsonb;
alter table public.submissions add column if not exists "image_descriptions" text[];
alter table public.submissions add column if not exists "content_warnings" text[];
alter table public.submissions add column if not exists "links" jsonb;
alter table public.submissions add column if not exists "submitted_at" timestamptz;
alter table public.submissions add column if not exists "late" boolean;
alter table public.submissions add column if not exists "verified" boolean;
alter table public.submissions add column if not exists "verified_at" timestamptz;
alter table public.submissions add column if not exists "verified_by" text;
alter table public.submissions add column if not exists "thanks" jsonb;
alter table public.submissions add column if not exists "created_at" timestamptz;
alter table public.submissions add column if not exists "updated_at" timestamptz;
create index if not exists submissions_event_idx on public.submissions ("event");
create index if not exists submissions_match_idx on public.submissions ("match");
create index if not exists submissions_giver_idx on public.submissions ("giver");
create index if not exists submissions_recipient_idx on public.submissions ("recipient");
create index if not exists submissions_verified_by_idx on public.submissions ("verified_by");
alter table public.submissions enable row level security;
comment on table public.submissions is 'Copied from the app''s Submission records by supabase-sync.js';

-- User
create table if not exists public.users (
  id text primary key
);
alter table public.users add column if not exists "email" text;
alter table public.users add column if not exists "google_id" text;
alter table public.users add column if not exists "discord_id" text;
alter table public.users add column if not exists "username" text;
alter table public.users add column if not exists "role" text;
alter table public.users add column if not exists "session_version" double precision;
alter table public.users add column if not exists "status" text;
alter table public.users add column if not exists "deactivated_at" timestamptz;
alter table public.users add column if not exists "banned_at" timestamptz;
alter table public.users add column if not exists "ban_reason" text;
alter table public.users add column if not exists "banned_by" text;
alter table public.users add column if not exists "display_name" text;
alter table public.users add column if not exists "avatar_url" text;
alter table public.users add column if not exists "bio" text;
alter table public.users add column if not exists "socials" jsonb;
alter table public.users add column if not exists "default_form" jsonb;
alter table public.users add column if not exists "artist_tags" jsonb;
alter table public.users add column if not exists "profile_privacy" jsonb;
alter table public.users add column if not exists "blocked_users" text[];
alter table public.users add column if not exists "style_samples" text[];
alter table public.users add column if not exists "museum_look" jsonb;
alter table public.users add column if not exists "chat_muted_until" timestamptz;
alter table public.users add column if not exists "chat_mute_reason" text;
alter table public.users add column if not exists "notification_prefs" jsonb;
alter table public.users add column if not exists "created_at" timestamptz;
alter table public.users add column if not exists "updated_at" timestamptz;
create index if not exists users_banned_by_idx on public.users ("banned_by");
create index if not exists users_blocked_users_idx on public.users using gin ("blocked_users");
alter table public.users enable row level security;
comment on table public.users is 'Copied from the app''s User records by supabase-sync.js';

-- Let the API see the new tables straight away
notify pgrst, 'reload schema';
