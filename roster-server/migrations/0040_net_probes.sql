-- 0040_net_probes.sql -- passive classroom network probe (NET_PROBE_SPEC.md "Storage and teacher view").
-- USER-RUN on the shared Supabase. Additive and idempotent. Not grade-affecting: nothing reads this
-- table except GET /class/net-probes (the teacher dashboard "Network" panel).
--
-- One row per Desk probe run by a signed-in STUDENT (teacher and preview-as-student runs are refused
-- by the server). Only types, counts and timings are stored -- never an IP address, hostname or ICE
-- candidate string. roster-server rebuilds p2p / conn / errors from a whitelist before inserting.
--
-- Until this runs, POST /net/probe and GET /class/net-probes answer 503; the Desk probe ignores it.

create table if not exists net_probes (
  id              uuid        primary key default gen_random_uuid(),
  student_id      uuid        not null references roster(student_id) on delete cascade,
  section         text        not null,
  ts              timestamptz not null default now(),
  in_school_hours boolean     not null,             -- America/New_York weekday 07:30-15:30 (server-side)
  rtt_roster      numeric,                          -- ms, median of 5 GET /health (null = step failed)
  rtt_relay       numeric,                          -- ms, median of 5 GET /health on the cr relay
  p2p             jsonb       not null default '{}'::jsonb,  -- {connected, rtt, localPair, candidates, error, role}
  conn            jsonb       not null default '{}'::jsonb,  -- navigator.connection hints
  ua              text,                             -- "Chrome 141; Chrome OS" (brand/platform only)
  errors          jsonb       not null default '{}'::jsonb   -- per-step error codes (rttRoster, rttRelay, ...)
);
create index if not exists net_probes_ts_idx on net_probes (ts desc);
create index if not exists net_probes_section_ts_idx on net_probes (section, ts desc);

alter table net_probes enable row level security;
-- Intentionally NO policies. Service-role only (mirrors 0009 / 0038).
