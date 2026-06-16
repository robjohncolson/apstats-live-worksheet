-- 0020_doge_chain_cache: watch-only on-chain balance cache for doge_account
-- (DOGE_WALLET_SPEC §8 chain_doge / chain_synced_at). USER-RUN, OPTIONAL.
--
-- The watch-only endpoints (/wallet/chain, /class/wallets/chain) work with ONLY
-- migration 0019 + a registered D… address — each call fetches the LIVE explorer
-- balance. These nullable columns just CACHE the last good read so a cold start
-- or a transient explorer outage still shows a balance. Until this runs the cache
-- write-back silently no-ops (the columns are absent; the UPDATE returns an error
-- the route ignores) — nothing dies, the live read is still returned.
--
-- Additive: nullable columns on an existing table, nothing else touched.

alter table doge_account add column if not exists chain_doge        numeric;     -- last confirmed on-chain balance (DOGE)
alter table doge_account add column if not exists chain_unconfirmed numeric;     -- last unconfirmed/mempool balance (DOGE)
alter table doge_account add column if not exists chain_tx_count    integer;     -- tx count at last sync
alter table doge_account add column if not exists chain_synced_at   timestamptz; -- when the watch-only read last succeeded
