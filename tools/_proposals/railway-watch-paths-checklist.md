# Railway watch path for roster-server: teacher checklist

Goal: only pushes that change `roster-server/` restart the grade server. Docs, posters and worksheets stop redeploying it.
Do this between classes. Push the status.html + deploy-scope test change first (it is a roster-server push, so it redeploys once).

## Set it (Railway dashboard)
1. railway.com -> project -> service `apstats-roster` -> Settings.
2. Source section: check Root Directory reads `/roster-server`. If it says anything else, stop and ask.
3. Source section -> Watch Paths -> add one line, exactly: `/roster-server/**` (leading slash, two stars). Save.
4. Config-as-code section: note whether a config file path such as `/roster-server/railway.json` is listed. Write it down.
   Do NOT put a `watchPatterns` line in `roster-server/railway.json` instead: Railway reads config from the repo root
   unless that path is listed, so the line can be silently ignored and nobody would notice.
5. Optional, separate decision: Deploy section -> Healthcheck Path = `/health` (Railway then keeps the old server up
   until the new one answers). Algebra 2's server already has this.

## Check it (two pushes)
Before: note the deployed commit:
`curl -s https://roster-production-12c1.up.railway.app/health` and read `"commit"`.
1. Docs-only push (a `.md` or poster file, nothing in roster-server/). Wait 5 minutes.
   /health `commit` must still be the OLD commit. status.html roster tile stays green, with a note that the later
   commits touch no roster-server/ file.
2. Next push that changes roster-server/. Within about 5 minutes /health `commit` must change to the new commit.
   If it does not: undo right away (below). A missed deploy is worse than an extra one.

## Undo
Settings -> Source -> Watch Paths -> delete the `/roster-server/**` line -> Save. Then push anything, or press
Redeploy on the latest deployment, so the server catches up. Every push redeploys again, as before.

## After both checks pass
Tell Claude/Grok to update the "no pushes during class" rule: only pushes touching roster-server/ wait for a gap.
