# Study Break challenge alert — impossible to miss (spec, 2026-09-28)

Status: SPEC for teacher review. Not built. Desk (`ap_stats_roadmap_square_mode.html`) + one constant on the
cr relay (`curriculum_render/railway-server/server.js`). Display/UX only; no money or match semantics change.

## 0. Why (proven live 2026-09-28)

The relay works: probe↔probe and probe↔teacher's Desk both reached `match_start` (the teacher accepted in 15 s on the
second try). Every classroom attempt "timed out" because the incoming alert is a sound plus a wiggling doge icon
that the student must CLICK to even see Accept, and the 30 s countdown expires silently. Teacher: "notification is
so subtle! the background color should shift in and out when a challenge is waiting, with a big obvious button
to click for saying yes or no."

Second cause: `PRESENCE_TTL_MS` = 45 s vs a 20 s Desk heartbeat that Chrome throttles to ≥60 s in a background tab,
so students flap out of the online list every other resync ("Challenge failed").

## 1. What the challenged student sees (Desk, game closed)

While a challenge is pending (`DogePresence.incomingChallenge` set):

1. **The whole desk breathes.** `<body class="challenge-waiting">` animates `background-color` between the
   normal `--desk-bg` and a warm doge gold (`#C9A227`-ish, tuned so tiles stay readable) on a ~1.4 s ease-in-out
   loop. `prefers-reduced-motion: reduce` → no animation, a steady gold tint instead (same pattern as the wallet /
   review / inbox badges).
2. **A big centered dialog**, System 7 style (Chicago title bar, platinum body, beveled buttons), fixed and
   centered over everything (z above app windows):
   - Title: `🐕 Challenge!`
   - Body: `<name> wants to play Study Break!` and the existing stake line `best of 3 · 1 candy at stake,
     winner takes 2 🍬`.
   - A large countdown (`24s` …) in the dialog, not the corner.
   - Two large buttons, full width of the dialog, ~44 px tall: **YES, PLAY ▸** (default, black) and **NO**.
   - Enter = yes, Escape = no (Escape already reaches this path via the global handler; it must now DECLINE, not
     just hide).
3. The sound and the doge-icon wiggle stay. The old tiny corner panel (`#doge-challenge-panel`) is replaced by
   the dialog; `DogePresence.toggle()` while pending opens/refocuses the dialog.
4. **Tab title flips** to `🐕 Challenge! — AP Stats Desk` while pending (free attention in a background tab).

Wiring: `onChallengeReceived` opens the dialog + sets the body class; `acceptChallenge` / `declineChallenge` /
`clearIncomingChallenge` remove both. The existing socket messages (`challenge_accept`, `challenge_decline`,
`from`) are unchanged — the relay strips unknown fields, never change message shapes.

## 2. Timeout is explicit

The client countdown drops to **25 s** (beats the relay's 30 s sweep, matching `studyBreak.showChallengeDialog`).
At 0 the Desk sends `challenge_decline` (today `declineChallenge(true)` sends nothing) so the challenger gets
"`<name>` declined (timed out)" at once instead of a dead half-minute.

## 3. Game already open

`studyBreak.showChallengeDialog` (Study Break window open, solo play) keeps its in-game modal but ALSO sets the
body class so the pulse is consistent. Auto-decline over a live match is unchanged.

## 4. Relay (cr): stop the flapping

`PRESENCE_TTL_MS` default 45000 → **90000** (env override stays). One constant, no message change. A background-tab
Desk heartbeating every 60 s stays listed. Test: `curriculum_render/tests/presence-resync.test.js` pins the new
default.

## 5. Out of scope

- Browser Notifications API (permission prompt in class = noise). Title flip covers the background-tab case.
- Changing the 1-candy stake, the best-of-3, or any settlement path.
- Challenges from a worksheet/quiz tab (only the Desk can receive one; the submenu already gates on `onDesk`).

## 6. Tests (Desk, jsdom, extend `tests/doge-presence-submenu.test.js` or new `tests/challenge-alert.test.js`)

- receipt sets `body.challenge-waiting`, renders the dialog with the name + countdown, flips the title;
- accept/decline/expiry clear the class, the dialog and the title; expiry SENDS `challenge_decline`;
- Enter accepts, Escape declines (sends the message);
- CSS source pins: the keyframes exist and are disabled under `prefers-reduced-motion`;
- message shapes unchanged (`{type:'challenge_accept', from}` / `{type:'challenge_decline', from}`).
