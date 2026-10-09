# NET_PROBE_SPEC — passive classroom network probe (teacher 2026-10-09)

**Goal.** Before building any low-latency transport (P2P WebRTC between students, or a LAN relay on the
teacher's laptop), measure what this school's network actually permits, from every student device, every
time they open the course site. Data gathering only. Nothing in the Desk changes behaviour for students.

**Teacher's words:** "real p2p in class, direct links between kids' computers to cut down as much as possible
on latency… a network topology aware transport selector… put the probe into the desk so that I'll gather that
data from all the students whenever they access the course website."

## What is measured (one record per run)

| Field | How | Notes |
|---|---|---|
| `rttRoster` ms | 5 timed `GET /health` to roster-server, median | the identity/grades service |
| `rttRelay` ms | 5 timed `GET /health` to the cr relay, median | the park/quiz relay |
| `p2p` | one WebRTC data channel to ONE classmate who is online in the same section | see pairing below |
| `p2p.connected` | true/false within 8 s | |
| `p2p.rtt` ms | median of 10 ping/pong over the data channel | only if connected |
| `p2p.localPair` | the selected ICE candidate pair's TYPES (`host`↔`host`, `srflx`, `relay`, `prflx`) | **types only, never addresses** |
| `p2p.candidates` | counts of gathered local candidate types + whether any mDNS (`.local`) host candidate appeared | mDNS blocked ⇒ LAN discovery blocked |
| `p2p.error` | gathering timeout / no peer available / ICE failed / RTCPeerConnection unavailable (policy) | |
| `conn` | `navigator.connection` effectiveType / rtt / downlink when present | hints only |
| `ua` | user-agent brand/platform (Chromebook detection) | |
| `section`, `studentId`, `ts` | from the signed-in session | **teacher and preview-as-student runs are NOT recorded** |
| `inSchoolHours` | server-side: America/New_York weekday 07:30–15:30 | separates in-room from at-home runs |

No IP addresses, no hostnames, no candidate strings are stored — only types, counts and timings.

## When it runs
- On Desk load, after the Desk is idle (≥ 5 s after `rCal`), at most **once per device per calendar day** (localStorage
  stamp `apstats-net-probe-day`), and never while a park/Tetris/Live Classroom session is active.
- Hard time budget 15 s total; every step has its own timeout; a failed step records its error and the rest continues.
- Kill-switch: `NET_PROBE_ENABLED` on roster-server (default on); the Desk asks `GET /net/probe/config` first and
  skips entirely when off. Teacher can also disable per device via `localStorage apstats-net-probe='off'`.

## Pairing for the P2P test (no new persistent connection)
Signaling over roster-server HTTP (student session auth):
- `POST /net/probe/offer` {sdp, section} → stored for 60 s, returns `{offerId}`; the poster then polls
  `GET /net/probe/answer/:offerId` every second for ≤ 8 s.
- A second student's probe calls `GET /net/probe/pending?section=` → gets one open offer from a classmate (not self),
  creates the answer, `POST /net/probe/answer/:offerId` {sdp}. ICE candidates are included in the SDP (gather-complete
  before posting; `iceCandidatePoolSize` 0; trickle off) to keep it to two round trips.
- STUN: Google's public STUN (`stun:stun.l.google.com:19302`) so srflx candidates are gathered; **no TURN** — a relay
  candidate would only prove what the cloud relay already proves.
- If no peer is available within the window the record says `noPeer` (still useful: it counts).

## Storage and teacher view
- roster-server migration `0040_net_probes.sql`: table `net_probes` (id, student_id, section, ts, in_school_hours,
  rtt_roster, rtt_relay, p2p jsonb, conn jsonb, ua text). RLS like the other tables; service role only.
- `POST /net/probe` (student session) stores one record; `GET /class/net-probes?section=&days=` (teacher) returns raw rows
  and a summary: per section, in-school vs at-home — median RTTs, p2p connected rate, host↔host rate, mDNS-seen rate,
  srflx-only rate, policy-blocked rate, sample count, distinct students.
- Teacher dashboard: a small "Network" panel with that summary (one table), no charts needed.

## Deferred (needs infrastructure first)
- **LAN relay on Athena.** The Desk is served over https (GH Pages), so a `http://<lan-ip>` fetch is blocked as mixed
  content. A LAN relay needs an https endpoint with a public certificate (a public DNS name resolving to the LAN IP,
  DNS-01 Let's Encrypt). The probe gets a `lanRelay` field once such a URL exists (`GET /net/probe/config` → `lanRelayUrl`,
  null today). WebRTC itself is not subject to mixed-content rules.

## What the data decides
- host↔host connected in school hours ⇒ direct P2P input fast-path is viable.
- srflx-only or `relay`-only ⇒ client isolation; P2P across the LAN is dead, consider the LAN relay instead.
- mDNS never seen ⇒ multicast blocked; same conclusion.
- `RTCPeerConnection unavailable` ⇒ device policy; nothing to build.
