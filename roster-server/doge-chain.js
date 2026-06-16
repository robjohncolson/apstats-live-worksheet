// doge-chain.js — watch-only on-chain balance reads for the DOGE Effort Wallet.
//
// NEVER holds a key, NEVER broadcasts — it only GETs PUBLIC address data from a
// block explorer so the Desk/dashboard can show real coins landing in each kid's
// paper wallet (DOGE_WALLET_SPEC §5 / §7 "Real chain"). The app stays watch-only.
//
//   mainnet (D…)      → BlockCypher  (clean balance endpoint, browser-CORS, has
//                                     confirmations). FREE tier: 3 req/s AND only
//                                     ~100 req/hr unauthenticated → set
//                                     BLOCKCYPHER_TOKEN at class scale (the Desk
//                                     polls per open wallet; see DOGE_WALLET_SPEC §5).
//   testnet (n…/m…/2…) → NO PROVIDER WIRED. Blockchair has no `dogecoin/testnet`
//                        chain and BlockCypher has no DOGE testnet, so a testnet
//                        balance read returns an explicit error. Registration is
//                        mainnet-D…-locked today anyway; wire a real DOGE-testnet
//                        API before widening the /wallet/address validator.
//
// Balances come back in koinu (1 DOGE = 1e8 koinu) → divide by 1e8. Every call
// has a timeout and falls back to the last good cached read.

const KOINU = 1e8;
const TIMEOUT_MS = 4000;
const CACHE_MS = 300000;                      // serve a cached read for ~5 min (matches the Desk poll)
const TOKEN = process.env.BLOCKCYPHER_TOKEN || '';

const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };

// address → { rec, ts } — last GOOD read, so an explorer outage degrades to stale.
const _cache = new Map();
export function __clearChainCache() { _cache.clear(); }   // tests only

// Dogecoin mainnet P2PKH = 'D' + 33 base58 chars = exactly 34 (version byte 0x1e
// never yields a leading-zero pad, so the length is fixed). Tightened from a loose
// 26–41 range so a mistyped-but-in-charset paste is rejected at registration
// instead of being silently watched as Ɖ 0 forever. SHARED with the /wallet/address
// validator (imported there) so the two can't drift.
export const DOGE_MAIN_RE = /^D[1-9A-HJ-NP-Za-km-z]{33}$/;

// Dogecoin address shapes: mainnet starts D; testnet starts n/m, P2SH-testnet 2.
export function detectNetwork(address) {
  const a = String(address || '').trim();
  if (DOGE_MAIN_RE.test(a)) return 'main';
  if (/^[nm2][1-9A-HJ-NP-Za-km-z]{25,40}$/.test(a)) return 'test';
  return null;
}

// A human "view this on the chain" link for the wallet/dashboard.
export function explorerUrl(address) {
  const net = detectNetwork(address);
  const path = net === 'test' ? 'dogecoin/testnet' : 'dogecoin';
  return 'https://blockchair.com/' + path + '/address/' + encodeURIComponent(address);
}

async function timedFetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!r || !r.ok) return null;                 // 429 / 5xx → null → fall back to cache
    return await r.json();
  } catch (_) {
    return null;                                  // timeout / network → same
  } finally {
    clearTimeout(t);
  }
}

async function fetchMain(address) {
  const tok = TOKEN ? ('?token=' + encodeURIComponent(TOKEN)) : '';
  const d = await timedFetchJson('https://api.blockcypher.com/v1/doge/main/addrs/' + encodeURIComponent(address) + '/balance' + tok);
  if (!d) return null;
  return {
    confirmedDoge: num(d.balance) / KOINU,
    unconfirmedDoge: num(d.unconfirmed_balance) / KOINU,
    txCount: num(d.n_tx),
    source: 'blockcypher',
  };
}

// Resolve one address to a watch-only balance record. Shape:
//   { address, network, confirmedDoge, unconfirmedDoge, txCount, source,
//     syncedAt, explorerUrl, stale?, cached?, error? }
// On explorer failure returns the last cached record with stale:true, or an
// {error} record if there is nothing cached. NEVER throws.
export async function fetchChainBalance(address) {
  const net = detectNetwork(address);
  if (!net) return { address, network: null, error: 'unrecognized address' };

  if (net === 'test') {
    // No DOGE-testnet balance API is wired (see header). Be explicit so a future
    // testnet rehearsal can't mistake a dead path for a transient outage.
    return { address, network: 'test', error: 'no DOGE testnet balance provider wired', stale: true };
  }

  const cached = _cache.get(address);
  if (cached && (Date.now() - cached.ts) < CACHE_MS) return { ...cached.rec, cached: true };

  const got = await fetchMain(address);
  if (!got) {
    if (cached) return { ...cached.rec, stale: true, cached: true };
    return { address, network: net, error: 'explorer unavailable', stale: true };
  }
  const rec = {
    address, network: net,
    ...got,
    syncedAt: new Date().toISOString(),
    explorerUrl: explorerUrl(address),
    stale: false,
  };
  _cache.set(address, { rec, ts: Date.now() });
  return rec;
}
