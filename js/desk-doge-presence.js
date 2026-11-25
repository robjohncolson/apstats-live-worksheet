/* ═══ DOGE PRESENCE SYSTEM ═══ */
const DogePresence = {
    ws: null,
    connected: false,
    players: [],
    locations: {},           // username -> { surface, lesson, onDesk } : where each online peer is
    expandedRow: null,       // username whose action submenu is open (only one at a time)
    username: null,
    dropdownOpen: false,
    challengePending: null,  // outgoing challenge target
    incomingChallenge: null, // { from, timer, countdown }
    flashTimer: null,
    _autoPresence: false,    // when true (auto-connected at Desk boot), reconnect on drop so the Desk stays visible
    _reconnectTimer: null,

    getUsername() {
        if (!this.username) {
            // Guests are retired (2026-06-25): presence is the signed-in roster
            // identity ONLY. The getGuestIdentity()/Guest_Anon fallback is removed,
            // so a signed-out visitor gets NO identity and connect() refuses to join
            // without one — no one ever appears as Guest_ in "Online Now".
            var roster = null;
            try { roster = (window.rosterClient && rosterClient.current && rosterClient.current()) || null; } catch (e) {}
            var raw = (roster && roster.username)
                || localStorage.getItem('student-name')
                || localStorage.getItem('username')
                || null;
            this.username = raw ? String(raw).trim() : null;
        }
        return this.username;
    },
    // Identity-aware peer list: ONE row per person. The feed can carry the same
    // student under differently-cased names (a worksheet announcing a typed legacy
    // name vs the Desk announcing the roster id); fold them case-insensitively,
    // keep the first-seen spelling for display, never list yourself.
    _peers() {
        const meKey = String(this.getUsername() || '').trim().toLowerCase();
        const seen = new Set();
        const out = [];
        (this.players || []).forEach(p => {
            const key = String(p || '').trim().toLowerCase();
            if (!key || key === meKey || seen.has(key)) return;
            seen.add(key);
            out.push(p);
        });
        return out;
    },
    _locationFor(p) {
        if (p == null) return null;
        if (this.locations[p]) return this.locations[p];
        const key = String(p).trim().toLowerCase();
        for (const k in this.locations) { if (String(k).trim().toLowerCase() === key) return this.locations[k]; }
        return null;
    },

    toggle() {
        // If there's an incoming challenge and doge is wiggling, show challenge panel
        if (this.incomingChallenge) {
            this.showChallengePanel();
            return;
        }
        if (this.dropdownOpen) {
            this.closeDropdown();
        } else {
            this.openDropdown();
        }
    },

    openDropdown() {
        if (!this.connected) {
            this.connect();
        }
        this.dropdownOpen = true;
        const el = document.getElementById('doge-presence');
        el.classList.add('doge-active');
        this.renderDropdown();
        document.getElementById('doge-dropdown').classList.add('show');
        // Resolve real names in the background, then re-render so the list shows identities.
        DeskRoster.load().then(() => { if (this.dropdownOpen) this.renderDropdown(); });
    },

    closeDropdown() {
        this.dropdownOpen = false;
        const el = document.getElementById('doge-presence');
        el.classList.remove('doge-active');
        document.getElementById('doge-dropdown').classList.remove('show');
    },

    renderDropdown() {
        const dd = document.getElementById('doge-dropdown');
        const teacher = (typeof _deskIsTeacher === 'function') && _deskIsTeacher();
        let html = '';
        if (!this.connected) {
            html = '<div class="doge-dd-empty">Connecting...</div>';
        } else {
            // Show EVERYONE online INCLUDING yourself (labeled "you"), so the Desk's
            // "Online Now" is the complete, authoritative view — a superset of any one
            // app that hides its own identity (cr / worksheets self-filter). this.players
            // stays self-filtered: it drives the candy/challenge actions + the Study Break
            // lobby. The self row here is display-only + non-interactive.
            const me = this.getUsername();
            const myReal = DeskRoster.realName(me);
            const myLabel = myReal
                ? `<strong>${_deskEsc(myReal)}</strong> <span style="opacity:.55;font-size:.85em">${_deskEsc(me)}</span>`
                : _deskEsc(me);
            const peers = this._peers();
            html = `<div class="doge-dd-header">Online Now (${peers.length + 1})</div>`;
            html += `<div class="doge-dd-self">`
                  + `<span class="doge-dd-name">${myLabel} <span style="opacity:.6;font-style:italic">(you)</span></span>`
                  + this._locationChip(this._locationFor(me) || { surface: 'desk', lesson: null, onDesk: true }, teacher)
                  + `</div>`;
            peers.forEach(p => {
                const real = DeskRoster.realName(p);
                let label;
                if (real) {
                    label = `<strong>${_deskEsc(real)}</strong> <span style="opacity:.55;font-size:.85em">${_deskEsc(p)}</span>`;
                } else if (DeskRoster.isGuest(p)) {
                    label = `${_deskEsc(p)} <span style="color:var(--bad)" title="Not signed in to the roster">&#10067;</span>`;
                } else {
                    label = _deskEsc(p);
                }
                const loc = this._locationFor(p);
                const expanded = (this.expandedRow === p);
                // XSS-safe username for an onclick="" attribute: usernames come from the
                // UNAUTHENTICATED presence WS (server only .trim()s them), so they are untrusted.
                // _deskEsc(JSON.stringify(p)) double-encodes — entity-escaping means a `"`/`<`
                // can't break out of the attribute, and JSON keeps the JS string literal valid.
                const pArg = _deskEsc(JSON.stringify(p));
                // stopPropagation: the dropdown is nested INSIDE #doge-presence whose onclick
                // is toggle() — without this a row click bubbles up and closes the whole menu.
                html += `<div class="doge-dd-item${expanded ? ' doge-dd-open' : ''}" onclick="event.stopPropagation();DogePresence.toggleRow(${pArg})">`
                      + `<span class="doge-dd-name">${label}</span>`
                      + this._locationChip(loc, teacher)
                      + `<span class="doge-dd-caret">${expanded ? '&#9662;' : '&#9656;'}</span>`
                      + `</div>`;
                // Click a name -> open an inline submenu (NOT an instant challenge). The
                // submenu lives in the dropdown markup so a presence re-render keeps it open.
                if (expanded) html += this._submenuHtml(p, loc, pArg);
            });
            if (peers.length === 0) html += '<div class="doge-dd-empty">No classmates online yet</div>';
        }
        html += '<div class="doge-dd-sep"></div>';
        // Guest mode is retired (2026-06-25): "My Guest Pass" and "Guest Reconcile" left this menu
        // 2026-10-08 and their overlays/functions were removed 2026-11-25.
        html += '<div class="doge-dd-footer" onclick="DogePresence.closeDropdown();openGame()">&#127918; Study Break</div>';
        dd.innerHTML = html;
    },

    // Coarse for students (Desk / Worksheet / Quiz / Study guide / Online); the
    // exact lesson is shown only to the teacher (DOGE_PRESENCE_SUBMENU_SPEC D1).
    _coarseLabel(surface) {
        const COARSE = { desk: 'Desk', worksheet: 'Worksheet', quiz: 'Quiz', 'study-guide': 'Study guide', edgar: 'Worksheet', mit: 'Worksheet', other: 'Online' };
        return COARSE[surface] || 'Online';
    },
    // Presence announces a worksheet by its FILE name ("U3 L3", "U3 L6-7" — railway_client.js
    // _presenceSurface). That is the old storage key (CED2026_SINGLE_SOURCE_SPEC §2): print the
    // CED label ("1.11 · Sampling Methods") and keep the raw key out of the dropdown.
    _lessonText(lesson) {
        const raw = String(lesson || '');
        const m = /^U(\d+) L([\d.\-]+)$/.exec(raw);
        if (!m || typeof cedLabel !== 'function') return raw;
        const key = m[1] + '.' + m[2];
        const label = cedLabel(key);
        if (!label.mapped) return raw;
        // A combined worksheet (4.1-2-3) spans several topics — the chip gets the topic range.
        if (label.text.indexOf(' / ') !== -1 && typeof cedTopicCoverage === 'function') return cedTopicCoverage([key]);
        return label.text;
    },
    _locationChip(loc, teacher) {
        if (!loc || !loc.surface) return '<span class="doge-loc doge-loc-unknown">&middot;</span>';
        const coarse = this._coarseLabel(loc.surface);
        const txt = (teacher && loc.lesson) ? this._lessonText(loc.lesson) : coarse;
        const cls = loc.onDesk ? 'doge-loc doge-loc-desk' : 'doge-loc';
        return `<span class="${cls}" title="${_deskEsc(txt)}">${_deskEsc(txt)}</span>`;
    },
    _whereSentence(loc, teacher) {
        if (!loc || !loc.surface) return 'Whereabouts unknown';
        const MAP = { desk: 'On the Desk', worksheet: 'On a live worksheet', quiz: 'In the quiz', 'study-guide': 'In the study guide', edgar: 'On a worksheet', mit: 'On a worksheet', other: 'Online' };
        let s = MAP[loc.surface] || 'Online';
        if (teacher && loc.lesson) s += ' — ' + this._lessonText(loc.lesson);
        return _deskEsc(s);
    },
    // pArg is already _deskEsc(JSON.stringify(username)) — XSS-safe for an onclick="" attribute.
    _submenuHtml(username, loc, pArg) {
        const teacher = (typeof _deskIsTeacher === 'function') && _deskIsTeacher();
        const onDesk = !!(loc && loc.onDesk);
        // stopPropagation so a click on the submenu (incl. the where-line) doesn't bubble to
        // #doge-presence's toggle() and close the dropdown.
        let h = '<div class="doge-submenu" onclick="event.stopPropagation()">';
        h += `<div class="doge-sub-where">&#128205; ${this._whereSentence(loc, teacher)}</div>`;
        // Challenge to Study Break only works when they're on the Desk (the game + the
        // challenge-receiver live there). Elsewhere it's disabled, not a doomed challenge.
        if (onDesk) {
            h += `<button class="doge-sub-act" onclick="event.stopPropagation();DogePresence.challengeFromMenu(${pArg})">&#9876;&#65039; Challenge to Study Break</button>`;
        } else {
            h += `<button class="doge-sub-act" disabled title="Only works when they're on the Desk">&#9876;&#65039; Challenge (Desk only)</button>`;
        }
        if (teacher) {
            h += `<button class="doge-sub-act" onclick="event.stopPropagation();DogePresence.messageFromMenu(${pArg})">&#128172; Message</button>`;
        }
        // Send candy works wherever they are (server resolves + guards the gift).
        h += `<button class="doge-sub-act" onclick="event.stopPropagation();DogePresence.candyFromMenu(${pArg})">&#127852; Send candy</button>`;
        h += '</div>';
        return h;
    },

    // The Study Break lobby reuses THIS socket (studyBreak no longer opens its own — see
    // connectMultiplayerWS), so presence changes route through here, not handleMpMessage.
    // Mirror the live player list into the lobby so it stays current while open.
    _syncStudyBreakLobby() {
        if (typeof studyBreak === 'undefined' || studyBreak.mpOnlinePlayers === undefined) return;
        studyBreak.mpOnlinePlayers = this.players.slice();
        if (studyBreak.isOpen && studyBreak.isOpen()) studyBreak.updateLobby();
    },

    toggleRow(username) {
        this.expandedRow = (this.expandedRow === username) ? null : username;
        this.renderDropdown();
    },
    challengeFromMenu(username) {
        this.expandedRow = null;
        this.sendChallenge(username); // existing: closes dropdown, sends game_challenge, 30s timeout
    },
    candyFromMenu(username) {
        this.expandedRow = null;
        this.closeDropdown();
        // Reuse the candy-poke pipeline (self/guest/cooldown/balance guards + optimistic Undo toast).
        if (typeof _candyPoke === 'function') _candyPoke(username);
    },
    messageFromMenu(username) {
        this.expandedRow = null;
        this.closeDropdown();
        if (typeof _openTeacherNudgeModal === 'function') _openTeacherNudgeModal(username);
    },

    connect() {
        if (this.ws && this.ws.readyState <= 1) return;
        // Guests are retired (2026-06-25): never join presence without a real roster
        // identity, so a signed-out / stale-guest Desk can't surface as Guest_ to the
        // class. _deskPresenceResync() re-invokes connect() right after a real sign-in.
        if (!this.getUsername()) { this.connected = false; try { this.updateIcon(); } catch (_) {} return; }
        const serverUrl = (typeof RAILWAY_SERVER_URL !== 'undefined' && RAILWAY_SERVER_URL)
            ? RAILWAY_SERVER_URL.replace(/^http/, 'ws')
            : 'wss://curriculumrender-production.up.railway.app';
        this.ws = new WebSocket(serverUrl);

        this.ws.onopen = () => {
            this.connected = true;
            // location:'desk' — this socket IS the Desk, the only surface that can play Tetris.
            this.ws.send(JSON.stringify({ type: 'identify', username: this.getUsername(), location: { surface: 'desk', lesson: null } }));
            // Periodic presence heartbeat. The server's doge presence TTL is ~45s, so a
            // live-but-idle/backgrounded Desk tab would otherwise age out of the global
            // "Online Now" list while its Live-Classroom avatar (a SEPARATELY heartbeated
            // socket) stays — the avatar-vs-list disagreement. Refreshing presence.lastSeen
            // every 20s keeps both feeds in sync. The server 'heartbeat' handler only bumps
            // lastSeen (no re-broadcast), so this is cheap and silent.
            clearInterval(this._hbTimer);
            this._hbTimer = setInterval(() => {
                try {
                    if (this.ws && this.ws.readyState === 1) {
                        this.ws.send(JSON.stringify({ type: 'heartbeat', username: this.getUsername(), location: { surface: 'desk', lesson: null } }));
                    }
                } catch (_) {}
            }, 20000);
            this.updateIcon();
            if (this.dropdownOpen) this.renderDropdown();
        };

        this.ws.onmessage = (event) => {
            let data;
            try { data = JSON.parse(event.data); } catch (_) { return; }   // never trust the wire
            if (!data || typeof data !== 'object') return;
            this.handleMessage(data);
        };

        this.ws.onclose = () => {
            this.connected = false;
            clearInterval(this._hbTimer);
            this.players = [];
            this.locations = {};
            this.expandedRow = null;
            this.updateIcon();
            if (this.dropdownOpen) this.renderDropdown();
            // Auto-connected at Desk boot -> reconnect so the Desk stays visible + challengeable (D5).
            if (this._autoPresence) {
                clearTimeout(this._reconnectTimer);
                this._reconnectTimer = setTimeout(() => { try { this.connect(); } catch (_) {} }, 5000);
            }
        };

        this.ws.onerror = () => {
            this.connected = false;
            clearInterval(this._hbTimer);
            this.updateIcon();
        };
    },

    handleMessage(data) {
        switch (data.type) {
            case 'presence_snapshot':
                this.players = (data.users || []).filter(u => u !== this.getUsername());
                this.locations = data.locations || {};
                if (this.expandedRow && !this.players.includes(this.expandedRow)) this.expandedRow = null;
                this.updateIcon();
                if (this.dropdownOpen) this.renderDropdown();
                this._syncStudyBreakLobby();
                break;

            case 'user_online':
                if (data.username !== this.getUsername()) {
                    // user_online doubles as a location update (the server re-announces when a
                    // peer's surface changes), so refresh the chip even if already in the list.
                    if (data.location) this.locations[data.username] = data.location;
                    else if (data.location === null) delete this.locations[data.username];
                    if (!this.players.includes(data.username)) this.players.push(data.username);
                    this.updateIcon();
                    if (this.dropdownOpen) this.renderDropdown();
                    this._syncStudyBreakLobby();
                }
                break;

            case 'user_offline':
                this.players = this.players.filter(u => u !== data.username);
                delete this.locations[data.username];
                if (this.expandedRow === data.username) this.expandedRow = null;
                this.updateIcon();
                if (this.dropdownOpen) this.renderDropdown();
                this._syncStudyBreakLobby();
                break;

            case 'challenge_received':
                // Single shared socket now: if the Study Break game is open show its in-game modal,
                // otherwise wiggle the doge icon (mirrors the old studyBreak.handleMpMessage routing).
                if (typeof studyBreak !== 'undefined' && studyBreak.isOpen && studyBreak.isOpen()) {
                    studyBreak.showChallengeDialog(data.from);
                } else {
                    this.onChallengeReceived(data.from);
                }
                break;

            case 'challenge_declined':
                this.challengePending = null;
                if (typeof studyBreak !== 'undefined' && studyBreak._onChallengeOutcome) studyBreak._onChallengeOutcome('declined', data);
                this.flash(data.by + ' declined' + (data.reason === 'timeout' ? ' (timed out)' : ''));
                break;

            case 'challenge_error':
                this.challengePending = null;
                if (typeof studyBreak !== 'undefined' && studyBreak._onChallengeOutcome) studyBreak._onChallengeOutcome('error', data);
                this.flash(data.error || 'Challenge failed');
                break;

            case 'match_start':
                if (studyBreak._abandonedChallenges && studyBreak._abandonedChallenges[data.opponent] > Date.now()) {
                    if (this.ws && this.ws.readyState === 1) { try { this.ws.send(JSON.stringify({ type: 'game_leave', roomId: data.roomId })); } catch (_) {} }
                    return;
                }
                if (this.challengePending === data.opponent) this.challengePending = null;
                this.closeDropdown();
                this.clearIncomingChallenge();
                // Auto-launch tetris in 1v1 mode
                this.launchMatch(data);
                break;

            case 'opponent_state':
                if (studyBreak.mpState) studyBreak.updateOpponentState(data);
                break;

            case 'garbage_incoming':
                if (studyBreak.mpState) studyBreak.receiveGarbage(data.lines, data.roomId);
                break;

            case 'opponent_ko':
                if (studyBreak.mpState) studyBreak.opponentKO(data.finalScore, data.roomId);
                break;

            case 'opponent_left':
                if (studyBreak.mpState) studyBreak.opponentLeft(data.reason);
                break;

            case 'nudge_notify':
                if (typeof _onNudgeNotify === 'function') _onNudgeNotify(data);
                break;

            case 'rtc_offer':
            case 'rtc_answer':
            case 'rtc_ice':
                if (studyBreak.peerConnection) studyBreak.handleMpMessage(data);
                break;

        }
    },

    sendChallenge(target) {
        if (this.challengePending) {
            this.flash('Already challenging...');
            return;
        }
        if (!this.ws || this.ws.readyState !== 1) {
            this.flash('Not connected');
            return;
        }
        this.challengePending = target;
        // A fresh challenge supersedes an earlier abandoned one to the same classmate (see studyBreak.sendChallenge).
        if (typeof studyBreak !== 'undefined' && studyBreak._abandonedChallenges) delete studyBreak._abandonedChallenges[target];
        this.closeDropdown();
        this.flash('Challenging ' + target + '...');
        this.ws.send(JSON.stringify({ type: 'game_challenge', target: target }));

        // Timeout after 30s
        setTimeout(() => {
            if (this.challengePending === target) {
                this.challengePending = null;
                this.flash('Challenge timed out');
            }
        }, 30000);
    },

    // STUDY_BREAK_CHALLENGE_ALERT_SPEC §1-2: the alert used to be a sound + an icon wiggle that
    // the student had to CLICK to see Accept, and it expired silently — every classroom attempt
    // "timed out". Now the dialog opens by itself, the desk breathes gold, the tab title flips,
    // and expiry sends a real decline (25s beats the relay's 30s sweep).
    CHALLENGE_SECONDS: 25,
    _challengeTitleBefore: null,

    onChallengeReceived(from) {
        MacSFX.play('sosumi', 0.5, { priority: true });   // the challenge alert ducks the rest (SFX_SPEC §2)
        const el = document.getElementById('doge-presence');
        el.classList.add('doge-wiggle');
        el.classList.remove('doge-dim');

        if (this.incomingChallenge && this.incomingChallenge.timer) clearInterval(this.incomingChallenge.timer);
        this.incomingChallenge = {
            from: from,
            countdown: this.CHALLENGE_SECONDS,
            timer: setInterval(() => {
                if (!this.incomingChallenge) return;
                this.incomingChallenge.countdown--;
                const timerEl = document.getElementById('challenge-countdown');
                if (timerEl) timerEl.textContent = this.incomingChallenge.countdown + 's';
                if (this.incomingChallenge.countdown <= 0) {
                    this.declineChallenge(true);
                }
            }, 1000)
        };
        document.body.classList.add('challenge-waiting');
        if (this._challengeTitleBefore == null) this._challengeTitleBefore = document.title;
        document.title = '\ud83d\udc15 Challenge! \u2014 ' + this._challengeTitleBefore;
        this.showChallengePanel();
        // ICON_MOTION -- light up the desktop game icon's challenge throb
        // (clearIncomingChallenge() already calls updateIcon() to remove it).
        this.updateIcon();
    },

    showChallengePanel() {
        this.closeDropdown();
        if (!this.incomingChallenge) return;
        const panel = document.getElementById('doge-challenge-panel');
        panel.innerHTML =
            `<div class="challenge-title">Challenge!</div>` +
            `<img class="challenge-doge" src="Doge-Asset.png" alt="">` +
            `<div class="challenge-who">${_deskEsc(this.incomingChallenge.from)} wants to play<br>Study Break!</div>` +
            `<div class="challenge-stake">one game \u00b7 1 candy at stake, winner takes 2 \ud83c\udf6c</div>` +
            `<div class="challenge-timer" id="challenge-countdown">${this.incomingChallenge.countdown}s</div>` +
            `<div class="challenge-btns">` +
            `<button type="button" class="btn-decline" onclick="DogePresence.declineChallenge()">NO</button>` +
            `<button type="button" class="btn-accept" onclick="DogePresence.acceptChallenge()">YES, PLAY &#9656;</button>` +
            `</div>` +
            `<div class="challenge-stake">Enter = yes \u00b7 Esc = no</div>`;
        // The panel lives inside #doge-presence (onclick=toggle): stop clicks from re-toggling the menu.
        panel.onclick = (e) => { e.stopPropagation(); };
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-label', this.incomingChallenge.from + ' wants to play Study Break');
        panel.style.display = 'block';
        try { const yes = panel.querySelector('.btn-accept'); if (yes) yes.focus(); } catch (_) {}
    },

    acceptChallenge() {
        if (!this.incomingChallenge || !this.ws) return;
        this.ws.send(JSON.stringify({ type: 'challenge_accept', from: this.incomingChallenge.from }));
        this.clearIncomingChallenge();
    },

    // Always tells the challenger. `timeout` is kept for callers; expiry now declines out loud
    // so the other side sees "declined (timed out)" instead of a dead half-minute.
    declineChallenge(timeout) {
        if (!this.incomingChallenge) return;
        if (this.ws && this.ws.readyState === 1) {
            try { this.ws.send(JSON.stringify({ type: 'challenge_decline', from: this.incomingChallenge.from })); } catch (_) {}
        }
        this.clearIncomingChallenge();
    },

    clearIncomingChallenge() {
        if (this.incomingChallenge && this.incomingChallenge.timer) {
            clearInterval(this.incomingChallenge.timer);
        }
        this.incomingChallenge = null;
        const el = document.getElementById('doge-presence');
        if (el) el.classList.remove('doge-wiggle');
        const panel = document.getElementById('doge-challenge-panel');
        if (panel) panel.style.display = 'none';
        document.body.classList.remove('challenge-waiting');
        if (this._challengeTitleBefore != null) { document.title = this._challengeTitleBefore; this._challengeTitleBefore = null; }
        this.updateIcon();
    },

    launchMatch(data) {
        // SB-3(integration): close the avatar popover (z400) so it doesn't render over the
        // game overlay (z250) when an incoming challenge auto-launches a match.
        try { if (typeof _avatarMenu !== 'undefined' && _avatarMenu && _avatarMenu.close) _avatarMenu.close(); } catch (_) {}
        // Share the WS connection with studyBreak
        studyBreak.mpWs = this.ws;
        studyBreak.mpUsername = this.getUsername();
        studyBreak.mpOnlinePlayers = this.players.slice();

        // Open the game overlay
        studyBreak.init();
        SFX.init();
        if (!studyBreak.isOpen()) {
            studyBreak._prevFocus = document.activeElement;
            studyBreak.openedAt = Date.now();
            studyBreak._lessonDone = studyBreak._todayLessonDone();
        }
        studyBreak._renderMute();
        studyBreak.overlay.style.display = 'block';
        if (typeof _appTopZ !== 'undefined') studyBreak.overlay.style.zIndex = ++_appTopZ;
        studyBreak._bindTouchControls();
        if (typeof _lastClassroomSummary !== 'undefined') studyBreak.onClassroomSignal(_lastClassroomSummary);
        studyBreak.startLoop();

        // Go directly to match
        studyBreak.mode = '1v1';
        studyBreak.startMatch(data);
    },

    flash(msg) {
        if (this.flashTimer) clearTimeout(this.flashTimer);
        const el = document.getElementById('doge-presence');
        // Create or reuse flash element
        let flash = el.querySelector('.doge-flash');
        if (!flash) {
            flash = document.createElement('div');
            flash.className = 'doge-flash';
            el.appendChild(flash);
        }
        flash.textContent = msg;
        flash.style.display = 'block';
        this.flashTimer = setTimeout(() => {
            flash.style.display = 'none';
            this.flashTimer = null;
        }, 3000);
    },

    updateIcon() {
        const el = document.getElementById('doge-presence');
        const badge = document.getElementById('doge-badge');
        const peersOn = this.players.length > 0 && this.connected;
        if (peersOn) {
            el.classList.remove('doge-dim');
            badge.textContent = this.players.length;
            badge.style.display = '';
        } else {
            if (!this.incomingChallenge) el.classList.add('doge-dim');
            badge.style.display = 'none';
        }
        // ICON_MOTION -- mirror presence onto the desktop game icon: a gentle
        // hop when friends are online, an urgent throb on an incoming challenge.
        try {
            const g = document.querySelector('.app-icon[data-app="game"]');
            if (g) {
                g.classList.toggle('game-challenge', !!this.incomingChallenge);
                g.classList.toggle('game-peers', peersOn && !this.incomingChallenge);
            }
        } catch (_) {}
    }
};

// Close doge dropdown when clicking elsewhere
document.addEventListener('mousedown', (e) => {
    const dogeEl = document.getElementById('doge-presence');
    if (dogeEl && !dogeEl.contains(e.target) && DogePresence.dropdownOpen) {
        DogePresence.closeDropdown();
    }
});

// MODAL_ESCAPE_AUDIT.md: a safety net so every "content" modal is keyboard-
// dismissable. These overlays previously had NO Escape handler (the day-material
// resource panel, the Do-Now speed-bump, generic showDialog alerts, the Blooket
// flashcard deck, the teacher view-as override-gate). Each maps to its OWN
// cleanup-aware close fn so listeners/timers are torn down (a blanket display:none
// would leak, e.g. the Blooket nav keydown). Closes only the TOPMOST visible one
// (highest z-index) so a dialog stacked over another closes first.
// DELIBERATELY EXCLUDED: the sign-in WALL (signin/signup/pwchange — must stay until
// the student completes it; closeSignInModal already refuses while the wall holds)
// and modals that self-handle Escape (day-grade / grade-help / student-dm /
// Study Break) — to avoid double-firing their handlers.
function _escVisible(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    var disp = el.style.display;
    // Open = any non-none inline display. Modals here open as block OR flex
    // (the QR/guest overlays use flex), so don't hard-code 'block'.
    if (!disp || disp === 'none') return null;
    return el;
}
function _escHide(id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; }
function _escCloseTopModal() {
    // DEFER if a modal that handles its OWN Escape is visible — its handler owns
    // this keypress. Without this, a gap modal stacked UNDER a self-handled one
    // (e.g. dblclick a calendar cell → resource panel opens, then the day-grade
    // modal opens on top) would also get closed by the net on the same Escape.
    var selfHandled = ['day-grade-overlay', 'grade-help-overlay',
                       'student-dm-modal', 'teacher-nudge-modal',
                       'game-overlay'];
    for (var s = 0; s < selfHandled.length; s++) {
        var surface = _escVisible(selfHandled[s]);
        if (!surface) continue;
        if (selfHandled[s] !== 'game-overlay') return false;
        var gameZ = parseInt(window.getComputedStyle(surface).zIndex, 10) || 0;
        var covered = Array.from(document.querySelectorAll('[id$="-overlay"], [id$="-modal"]')).some(function(el) {
            if (el === surface || surface.contains(el)) return false;
            var style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && (parseInt(style.zIndex, 10) || 0) > gameZ;
        });
        if (!covered) return false;
    }
    // Gap modals (no own Escape handler). Named close fns run cleanup; the QR/guest
    // overlays have no cleanup (no listeners/timers) so a direct hide is correct.
    var closers = {
        'resource-overlay':     function () { if (typeof closeResourcePanel === 'function')     closeResourcePanel(); },
        'calc-progress-overlay': function () { if (typeof closeCalcProgress === 'function')     closeCalcProgress(); },
        'donow-bump-overlay':   function () { if (typeof closeDoNowBump === 'function')          closeDoNowBump(); },
        'dialog-overlay':       function () { if (typeof closeDialog === 'function')             closeDialog(); },
        'bf-overlay':           function () { if (typeof closeBlooketFlashcards === 'function')  closeBlooketFlashcards(); },
        'verify-qr-overlay':    function () { _escHide('verify-qr-overlay'); },
        'big-qr-overlay':       function () { _escHide('big-qr-overlay'); },
    };
    var topId = null, topZ = -Infinity;
    for (var id in closers) {
        var el = _escVisible(id);
        if (!el) continue;
        var z = 0;
        try { z = parseInt(window.getComputedStyle(el).zIndex, 10); } catch (_) {}
        if (isNaN(z)) z = 0;
        if (z >= topZ) { topZ = z; topId = id; }
    }
    if (topId) { try { closers[topId](); } catch (_) {} return true; }
    return false;
}
try { window._escCloseTopModal = _escCloseTopModal; } catch (_) {}

// STUDY_BREAK_CHALLENGE_ALERT_SPEC §1: Enter = YES while a challenge dialog is up (and no field has focus).
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !DogePresence.incomingChallenge) return;
    var t = e.target;
    var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (typing) return;
    e.preventDefault();
    DogePresence.acceptChallenge();
});

// Close doge dropdown & app overlays on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        var signinRoster = document.getElementById('signin-roster-dropdown');
        if (signinRoster && signinRoster.style.display !== 'none') {
            if (typeof _closeRosterDropdown === 'function') _closeRosterDropdown();
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if (DogePresence.dropdownOpen) DogePresence.closeDropdown();
        if (DogePresence.incomingChallenge) {
            // STUDY_BREAK_CHALLENGE_ALERT_SPEC §1: Escape = NO (a real decline, not just hiding the dialog).
            DogePresence.declineChallenge();
            e.preventDefault();
            return;
        }
        // Study Break owns Escape while it is open (it closes itself); don't also tear down an app
        // window (TI-84 / quiz / wallet) sitting under the game.
        var gameOpen = !!(typeof studyBreak !== 'undefined' && studyBreak.isOpen && studyBreak.isOpen());
        document.querySelectorAll('.app-overlay').forEach(function(el) {
            if (gameOpen) return;
            if (el.style.display === 'block') {
                var id = el.id.replace('app-', '').replace('-overlay', '');
                destroyApp(id);
            }
        });
        // Content modals that have no dedicated Escape handler (see above).
        if (_escCloseTopModal()) e.preventDefault();
    }
});

window.DogePresence = DogePresence;

