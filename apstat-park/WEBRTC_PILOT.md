# Calculator movement pilot

Open the desk with `&parkRtc=1` appended to its existing query string on each participating device:

https://robjohncolson.github.io/apstats-live-worksheet/ap_stats_roadmap_square_mode.html?year=SY26-27&parkRtc=1

The first four opted-in, distinct players in the same calculator room can exchange visual positions directly. B and E share a room with the Period X teacher under the existing park rules. Other classes remain separate. Ordinary desk URLs continue using WebSocket. Remove the query parameter and reload to leave the pilot.

Scope:

- Calculator approach and calculator-area cat drawing only. The Pico Park campaign inside the door still uses its existing transport.
- Direct positions run at 20 Hz with unordered, non-retransmitted data. Frames carry a round ID and sequence number; old, malformed, and out-of-bounds positions are discarded.
- Server snapshots still establish membership. Direct data cannot submit answers, push the team block, start timers, move authoritative game objects, or clear a level.
- WebSocket messages continue at their existing rate. This pilot measures responsiveness; it does not yet reduce Railway traffic.
- A missing direct position falls back to the latest server position after 350 ms. Unsupported browsers, failed setup, and players beyond the four-person cap continue over WebSocket. A failed connection can be retried by reloading the pilot page.
- This is a local-network trial with no external STUN/TURN servers. School network isolation, browser policy, or different networks may prevent direct connections. Fallback remains available; do not assume same Wi-Fi guarantees connectivity.
- Hiding a desk tab still follows the existing game-presence rules. WebRTC does not keep inactive students in the game.

## Verify on school devices

Use two or three student devices and optionally the teacher, each with the pilot URL and the desk tab visible. Move in the calculator approach. Check the browser console with:

```js
_classroomBoardHandle.getParkScene().getNetworkStats()
```

`connected` counts open direct channels, `fresh` counts peers with a recent direct position, `rttMs` contains measured peer round trips, and `sent`/`received` count motion packets. These diagnostics contain no student names. Compare against the ordinary URL on the same devices. Round-trip figures from the local automated browser test are not measurements of the school network.

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
