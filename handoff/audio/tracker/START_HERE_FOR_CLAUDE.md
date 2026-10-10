Please implement the audio tracker engine from follow-alongs\handoff\audio\tracker\. Start by reading TRACKER_SPEC.md, then AUDIO_IDEAS_HANDOFF.md in handoff\audio\.

Goals:
1. Integrate tracker-engine.js and vibe.js into the APStat Park app, replacing the current park music. Load the six songs in tracker\songs\ (their mix blocks are my approved settings; keep them).
2. Music is available to students all the time; remove the "finish all work" easter-egg unlock gate. The in-class teacher toggle must still turn music (and SFX) off for the class, and class mode defaults to off.
3. Add a song picker for students (solo play). Switching songs re-voices the SFX through vibe.js and applies that song's color palette app-wide.
4. Route existing game SFX through the vibe shifter, keeping the pitch caps from spec section 4a.
5. Support lowPower mode (no reverb, fewer voices) for Chromebooks, auto-on for slow devices.
6. Keep demo.html working as my mixer/editor; don't run tools/build_songs.py (faithful.py builds the songs).

Don't change any live lesson pages, worksheets, or the apstats-live-worksheet pipeline. Show me a plan before writing code, then work on a branch and let me test before merging.
