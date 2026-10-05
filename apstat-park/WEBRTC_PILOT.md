# Calculator movement connections

WebRTC movement is enabled on the ordinary desk URL:

https://robjohncolson.github.io/apstats-live-worksheet/ap_stats_roadmap_square_mode.html?year=SY26-27

The server selects one browser to forward visual positions, preferring a teacher when present. Each other browser makes one connection to that relay. Thirty students plus one teacher use 30 connections instead of a 465-connection full mesh. If the relay leaves or its game presence expires, the server selects a replacement and browsers reconnect. The transport accepts up to 64 distinct active users, leaving space beyond a 30-student class.

B and E share a room with the Period X teacher under the existing park rules. Other classes remain separate. Add `&parkRtc=0` and reload to use WebSocket only. Older four-player pilot clients also fall back to WebSocket until reloaded; the two direct protocols do not mix.

Scope:

- Calculator approach and calculator-area cat drawing only. The Pico Park campaign inside the door still uses its existing transport.
- Positions run at 20 Hz with unordered, non-retransmitted data. The relay batches recent positions into one packet per recipient per tick. Frames carry a round ID and sequence number; old, malformed, and out-of-bounds positions are discarded. Repeated stale positions cannot keep an inactive cat visible indefinitely.
- Server snapshots still establish membership. Direct data cannot submit answers, push the team block, start timers, move authoritative game objects, or clear a level.
- WebSocket messages continue at their existing rate. This improves the visual update path where peer connections work; it does not yet reduce Railway traffic.
- A missing peer position falls back to the latest server position after 350 ms. Unsupported browsers and failed setup continue over WebSocket. Failed student connections retry independently after 15 seconds, backing off to at most one retry every two minutes. Returning after a presence timeout uses a fresh connection ID; relay replacement reconnects the group.
- Connections use no external STUN/TURN servers. School network isolation, browser policy, or different networks may prevent peer connections. Fallback remains available; do not assume same Wi-Fi guarantees connectivity.
- Hiding a desk tab still follows the existing game-presence rules. WebRTC does not keep inactive students in the game.

## Verify on school devices

Keep the normal desk tab visible on the participating devices. Move in the calculator approach. Check the browser console with:

```js
_classroomBoardHandle.getParkScene().getNetworkStats()
```

`hub` identifies the relay, `members` is the server-authorized peer count, `connected` counts open channels, and `fresh` counts classmates with recent peer positions. A student normally has one connection but can receive positions for the entire class. `rttMs` measures each connection's round trip, not the total delay across two student-to-relay hops. Diagnostics contain no student names. Compare against `parkRtc=0` on the same devices. Local automated results are not measurements of the school network.

## Automated checks

`npm run test:park` includes frame validation and fallback tests. The relay's park suite covers signaling limits, class isolation, identity changes, opt-out, and disconnects.

The real-browser smoke uses the existing local server harness:

```powershell
$env:PARK_RTC_SMOKE = '1'
$env:PARK_RELAY_ROOT = 'C:/path/to/curriculum_render'
$env:PARK_PLAYWRIGHT_MODULE = 'C:/path/to/playwright-core/index.mjs'
$env:PARK_BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node apstat-park/shared-presence-browser-smoke.mjs
```

Set `PARK_LATENCY_MS=100` and `PARK_JITTER_MS=25` to delay each WebSocket direction during the same test. The test establishes real data channels, forces a peer disconnect, checks continued server motion and membership, and joins an unsupported browser.

Run `node apstat-park/rtc-class-browser-smoke.mjs` with the same tool paths for 31 real browser pages (30 students and one teacher), peer failure, and teacher departure. This uses the actual transport and server with lightweight pages; the shared-presence smoke separately exercises the complete game renderer on the normal URL.
