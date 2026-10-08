// Buy campaign keys with candy (teacher 2026-10-08, PICO_DESK_SPEC.md "Candy economy", items 7-10).
// Candy lives on roster-server: GET /wallet gives the live price of the NEXT key (keyPrice: 5, 8, 13,
// ... resetting each school day), the spendable candy and whether buying is on; POST /wallet/buy-key
// buys one. The key itself is granted by the relay, so the gold count updates from the relay's
// campaign_progress, never from here. This module only tracks candy and the button's state.

// win: the page window (reads rosterClient.token() and ROSTER_SERVICE_URL, as the Desk wallet does).
export function createKeyShop({ win, fetchImpl = null, refreshMs = 60000, now = () => performance.now() } = {}) {
  const state = { wallet: null, loading: false, busy: false, message: '', error: false };
  let lastRefresh = -Infinity;
  // Every buy bumps the version; a GET /wallet reply that started before the latest buy is stale
  // (it would show the old price / balance) and is dropped.
  let version = 0;
  const doFetch = (...args) => (fetchImpl || win?.fetch?.bind(win))(...args);

  function auth() {
    try {
      const token = win?.rosterClient?.token?.();
      const base = win?.ROSTER_SERVICE_URL;
      if (!token || !base) return null;
      return { token, base: String(base).replace(/\/+$/, '') };
    } catch {
      return null;
    }
  }

  async function refresh() {
    lastRefresh = now();
    const who = auth();
    if (!who) { state.wallet = null; return; }
    const asked = version;
    state.loading = true;
    try {
      const response = await doFetch(who.base + '/wallet', { headers: { Authorization: 'Bearer ' + who.token } });
      if (asked !== version) return;
      if (response.status === 503) {
        state.wallet = { keyPurchaseEnabled: false, keyPrice: null, keyPurchaseOffReason: 'candy rewards are not turned on yet' };
        return;
      }
      if (!response.ok) return;
      const body = await response.json();
      if (asked === version && body && body.ok) state.wallet = body;
    } catch {
      // Keep the last wallet; the next refresh tries again.
    } finally {
      if (asked === version) state.loading = false;
    }
  }

  // Refresh at most once per refreshMs (the price only changes when a key is bought or the day turns).
  function tick() {
    if (state.loading || state.busy || now() - lastRefresh < refreshMs) return;
    refresh();
  }

  // Buy one key. Resolves true when roster-server took the candy and the key was granted, or is
  // pending (202: the park's answer was lost; the candy is held and roster-server retries).
  async function buy() {
    const who = auth();
    if (!who || state.busy) return false;
    version++;
    state.loading = false;
    state.busy = true; state.message = ''; state.error = false;
    try {
      const response = await doFetch(who.base + '/wallet/buy-key', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + who.token, 'Content-Type': 'application/json' },
        body: '{}',
      });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ok) {
        state.wallet = { ...(state.wallet || {}), ...body };
        state.message = body.pending ? 'KEY ON ITS WAY. YOUR ' + body.price + ' CANDY IS HELD UNTIL THE PARK CONFIRMS.'
          : 'KEY BOUGHT FOR ' + body.price + ' CANDY';
        return true;
      }
      state.error = true;
      state.message = String(body?.error || 'Could not buy a key. Try again.');
      if (body && typeof body.candyBalance === 'number') state.wallet = { ...(state.wallet || {}), ...body, ok: true };
      return false;
    } catch {
      state.error = true;
      state.message = 'Could not reach your candy wallet. Try again.';
      return false;
    } finally {
      state.busy = false;
      refresh();
    }
  }

  return { state, refresh, tick, buy };
}
