/* ═══ STUDY BREAK: NEW TETRIS-STYLE ═══ */
const studyBreak = {
    initialized: false,
    overlay: null,
    canvas: null,
    ctx: null,
    scoreEl: null,
    helpEl: null,
    raf: null,
    lastTime: 0,

    COLS: 10,
    VISIBLE_ROWS: 20,
    HIDDEN_ROWS: 4,
    SPAWN_Y: 3,           // Spawn straddling the top edge (rows 3-4) so a piece is visible on its first
                          // frame. It used to spawn at y=0 — three hidden rows above the well — so every
                          // piece fell blind for ~3 gravity ticks (~2.8s at level 1) before it appeared.
    TOTAL_ROWS: 24,
    CELL: 12,
    BOARD_X: 155,
    BOARD_Y: 24,
    CANVAS_W: 430,
    CANVAS_H: 302,
    LOCK_DELAY: 500,
    LOCK_RESET_CAP: 15,   // SB-1(core): max move/rotate lock-delay resets per piece (anti-infinite-stall)
    HEARTBEAT_MS: 2500,         // MP-5: periodic state send so an idle-but-present peer stays "alive"
    OPPONENT_TIMEOUT_MS: 18000, // MP-5: no opponent traffic this long while running → forfeit (refunds)
    ENTRY_DELAY: 150,
    DAS_DELAY: 135,
    DAS_REPEAT: 48,
    SOFT_DROP_INTERVAL: 80,
    MAX_GARBAGE: 6,       // most rows one lock may send (tetris 4 + squares); the receive side clamps the same
    LINES_PER_LEVEL: 6,   // level every 6 lines (was 10): a 20-40 line break now reaches real speed
    BREAK_SOFT_MIN: 10,   // after this many minutes the cards gently point back at the Do Now (never a gate)
    soloConfig: { canvas: null, ctx: null, CELL: 12, BOARD_X: 155, BOARD_Y: 24, CANVAS_W: 430, CANVAS_H: 302 },
    splitConfig: { canvas: null, ctx: null, CELL: 10, BOARD_X: 58, BOARD_Y: 24, CANVAS_W: 215, CANVAS_H: 302 },
    opponentConfig: { canvas: null, ctx: null, CELL: 10, BOARD_X: 58, BOARD_Y: 24, CANVAS_W: 215, CANVAS_H: 302 },
    mode: 'solo',  // 'solo' or '1v1'
    mpState: null,  // multiplayer state: { roomId, opponent, side, opponentBoard, opponentScore, opponentLines, opponentLevel, pendingGarbage }
    mpWs: null,
    mpUsername: null,
    mpOnlinePlayers: [],
    mpChallengeTimer: null,
    pendingChallenger: null,   // incoming dialog up → close() declines on the student's behalf
    _outgoing: null,           // { target, sentAt, status, text } — one outgoing challenge at a time
    _buffered: null,           // rotate/hold pressed during the entry delay, applied at spawn
    pieceCounts: {},           // per-type spawn counts (solo game-over histogram)
    clearFx: null,             // { board, rows, squareRows, timer } — 120ms line-clear flash
    fuseFx: null,              // { squareIds, timer } — 250ms flash over a just-fused slab (TETRIS_SQUARES_SPEC)
    _boardVersion: 0,          // bumps on every board mutation (ghost-square cache key)
    openedAt: 0,               // break clock
    _classroomNote: '',        // Arm Gate / Green Light mirrored from Live Classroom

    types: ['I', 'O', 'T', 'S', 'Z', 'J', 'L'],
    // Guideline-ish hues (O yellow, T purple, L orange). O used to be gray — indistinguishable from a
    // silver square, so the square transformation was invisible. Gray now means made/imposed only.
    colors: {
        I: '#66ccff',
        O: '#f5e04b',
        T: '#b57edc',
        S: '#57c95f',
        Z: '#ff6b6b',
        J: '#4f7cff',
        L: '#f0973a',
        gold: '#F2C14E',     // TETRIS_SQUARES_SPEC: warm gold slab
        silver: '#C9D1D9',   // cool silver slab
        ghost: '#7f7f7f'
    },
    pieces: {
        I: [
            [[0,1],[1,1],[2,1],[3,1]],
            [[2,0],[2,1],[2,2],[2,3]],
            [[0,2],[1,2],[2,2],[3,2]],
            [[1,0],[1,1],[1,2],[1,3]]
        ],
        O: [
            [[1,0],[2,0],[1,1],[2,1]],
            [[1,0],[2,0],[1,1],[2,1]],
            [[1,0],[2,0],[1,1],[2,1]],
            [[1,0],[2,0],[1,1],[2,1]]
        ],
        T: [
            [[1,0],[0,1],[1,1],[2,1]],
            [[1,0],[1,1],[2,1],[1,2]],
            [[0,1],[1,1],[2,1],[1,2]],
            [[1,0],[0,1],[1,1],[1,2]]
        ],
        S: [
            [[1,0],[2,0],[0,1],[1,1]],
            [[1,0],[1,1],[2,1],[2,2]],
            [[1,1],[2,1],[0,2],[1,2]],
            [[0,0],[0,1],[1,1],[1,2]]
        ],
        Z: [
            [[0,0],[1,0],[1,1],[2,1]],
            [[2,0],[1,1],[2,1],[1,2]],
            [[0,1],[1,1],[1,2],[2,2]],
            [[1,0],[0,1],[1,1],[0,2]]
        ],
        J: [
            [[0,0],[0,1],[1,1],[2,1]],
            [[1,0],[2,0],[1,1],[1,2]],
            [[0,1],[1,1],[2,1],[2,2]],
            [[1,0],[1,1],[0,2],[1,2]]
        ],
        L: [
            [[2,0],[0,1],[1,1],[2,1]],
            [[1,0],[1,1],[1,2],[2,2]],
            [[0,1],[1,1],[2,1],[0,2]],
            [[0,0],[1,0],[1,1],[1,2]]
        ]
    },

    board: [],
    queue: [],
    bag: [],
    hold: null,
    holdLocked: false,
    active: null,
    nextPieceId: 1,
    nextSquareId: 1,
    spawnTimer: 0,
    fallTimer: 0,
    lockTimer: 0,
    score: 0,
    lines: 0,
    level: 1,
    goldCount: 0,
    silverCount: 0,
    flashText: '',
    flashTimer: 0,
    state: 'idle',
    _soloBtn: null,
    _vsBtn: null,
    keys: {
        left: { down: false, next: 0 },
        right: { down: false, next: 0 },
        down: { down: false }
    },

    init() {
        if (this.initialized) return;
        this.overlay = document.getElementById('game-overlay');
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;
        this.soloConfig.canvas = this.canvas;
        this.soloConfig.ctx = this.ctx;
        const splitCanvas = document.getElementById('gameCanvas1');
        const opponentCanvas = document.getElementById('gameCanvas2');
        if (splitCanvas) {
            this.splitConfig.canvas = splitCanvas;
            this.splitConfig.ctx = splitCanvas.getContext('2d');
            this.splitConfig.ctx.imageSmoothingEnabled = false;
        }
        if (opponentCanvas) {
            this.opponentConfig.canvas = opponentCanvas;
            this.opponentConfig.ctx = opponentCanvas.getContext('2d');
            this.opponentConfig.ctx.imageSmoothingEnabled = false;
        }
        this.scoreEl = document.getElementById('game-score');
        this.helpEl = document.getElementById('game-help');
        this.canvas.width = this.CANVAS_W;
        this.canvas.height = this.CANVAS_H;

        this.canvas.addEventListener('mousedown', (e) => {
            e.preventDefault();
            if (this.state === 'idle') {
                const rect = this.canvas.getBoundingClientRect();
                const mx = (e.clientX - rect.left) * (this.canvas.width / rect.width);
                const my = (e.clientY - rect.top) * (this.canvas.height / rect.height);
                if (this._soloBtn && mx >= this._soloBtn.x && mx <= this._soloBtn.x + this._soloBtn.w && my >= this._soloBtn.y && my <= this._soloBtn.y + this._soloBtn.h) {
                    this.mode = 'solo';
                    this.startNewGame();
                } else if (this._vsBtn && mx >= this._vsBtn.x && mx <= this._vsBtn.x + this._vsBtn.w && my >= this._vsBtn.y && my <= this._vsBtn.y + this._vsBtn.h) {
                    this.mode = '1v1';
                    this.startMultiplayer();
                }
            } else if (this.state === 'gameover') {
                this.startNewGame();
            } else if (this.state === 'paused') {
                this.togglePause();
            }
            this.canvas.focus();
        });

        // Split view (1v1): the solo canvas is hidden, so the game-over card needs its own pointer path.
        const splitEl = document.getElementById('game-split');
        if (splitEl) splitEl.addEventListener('mousedown', () => {
            if (this.state !== 'gameover' || !this._inLiveMatch()) return;
            if (this.mpState.seriesOver) this.requestRematch(); else this.startNewGame();
        });

        document.addEventListener('keydown', (e) => {
            const target = e.target;
            if (target && target.closest && !this.overlay.contains(target)
                && (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') || target.isContentEditable)) return;
            if (!this.isOpen()) return;
            if (e.key === 'Escape') {
                if (e.defaultPrevented) return;
                const gameZ = parseInt(window.getComputedStyle(this.overlay).zIndex, 10) || 0;
                const covered = Array.from(document.querySelectorAll('[id$="-overlay"], [id$="-modal"]')).some(el => {
                    if (el === this.overlay || this.overlay.contains(el)) return false;
                    const style = window.getComputedStyle(el);
                    return style.display !== 'none' && style.visibility !== 'hidden' && (parseInt(style.zIndex, 10) || 0) > gameZ;
                });
                if (covered) return;
            }
            const focused = document.activeElement;
            if ((e.key === 'Enter' || e.key === ' ') && target === focused
                && focused.matches('button, a[href]') && this.overlay.contains(focused)) return;
            // Browser shortcuts stay browser shortcuts (Ctrl+R reload, Ctrl+P print, Ctrl+C copy):
            // the game only ever eats an unmodified key.
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const key = e.key;
            // Key repeat must not re-fire one-shot actions (a held R/P/Enter flickered restart/pause).
            if (e.repeat && ['Enter', 'r', 'R', 'p', 'P', '1', '2', 'Escape', 'm', 'M'].includes(key)) return;
            const handled = [
                'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ',
                'z', 'Z', 'x', 'X', 'c', 'C', 'Shift', 'p', 'P', 'Enter', 'r', 'R', 'Escape', '1', '2', 'm', 'M'
            ].includes(key);

            // An incoming challenge dialog owns Enter (accept) and Escape (decline) while it is up;
            // every other key still reaches a solo game running underneath it. A focused dialog
            // button activates itself on Enter (keyboard users can Tab to Decline).
            const challengeDlg = document.getElementById('challenge-dialog');
            if (challengeDlg && challengeDlg.style.display === 'block' && (key === 'Enter' || key === 'Escape')) {
                const focused = document.activeElement;
                if (key === 'Enter' && focused && focused.tagName === 'BUTTON' && challengeDlg.contains(focused)) return;
                e.preventDefault();
                const btn = document.getElementById(key === 'Enter' ? 'challenge-accept-btn' : 'challenge-decline-btn');
                if (btn && typeof btn.onclick === 'function') btn.onclick();
                return;
            }

            // The lobby is a DOM panel over a hidden canvas: Enter/1/2/R must not start an invisible
            // solo game under it. Escape steps back to the mode card (same as the Back button); a
            // focused lobby button keeps its native Enter/Space activation.
            const lobbyEl = document.getElementById('game-lobby');
            if (lobbyEl && lobbyEl.style.display === 'block') {
                if (key === 'Escape') { e.preventDefault(); this.leaveLobby(); }
                return;
            }
            if (handled) e.preventDefault();
            if (key === 'm' || key === 'M') { this.toggleMute(); return; }
            if (key === 'Escape') {
                if (this._escapeNeedsConfirm()) return;
                closeGame();
                return;
            }
            // Series decided: R/Enter on the card asks the same classmate for a rematch.
            if ((key === 'Enter' || key === 'r' || key === 'R') && this._inLiveMatch() && this.mpState.seriesOver) {
                this.requestRematch();
                return;
            }
            if (key === 'Enter') {
                if (this.state === 'idle') {
                    this.mode = 'solo';
                    this.startNewGame();
                } else if (this.state === 'gameover') {
                    this.startNewGame();
                } else if (this.state === 'paused') {
                    this.togglePause();   // Enter on a paused solo game resumes it (it used to wipe the board)
                }
                return;
            }
            if ((key === '1' || key === '2') && this.state === 'idle') {
                if (key === '1') { this.mode = 'solo'; this.startNewGame(); }
                else { this.mode = '1v1'; this.startMultiplayer(); }
                return;
            }
            if (key === 'r' || key === 'R') {
                // R restarts only a FINISHED game (or a paused solo one). Mid-game R used to wipe the
                // board instantly: a stray press lost a solo run, and in 1v1 it was a free board reset.
                if (this.state === 'gameover' || (this.state === 'paused' && this.mode !== '1v1')) this.startNewGame();
                return;
            }
            if (key === 'p' || key === 'P') {
                this.togglePause();
                return;
            }
            if (this.state !== 'running') return;

            const now = performance.now();
            if (key === 'ArrowLeft') {
                if (!this.keys.left.down) {
                    this.keys.left.down = true;
                    this.keys.left.next = now + this.DAS_DELAY;
                    this.keys.lastDir = 'left';
                    this.tryMove(-1, 0);
                }
            } else if (key === 'ArrowRight') {
                if (!this.keys.right.down) {
                    this.keys.right.down = true;
                    this.keys.right.next = now + this.DAS_DELAY;
                    this.keys.lastDir = 'right';
                    this.tryMove(1, 0);
                }
            } else if (key === 'ArrowDown') {
                if (!this.keys.down.down) {
                    this.keys.down.down = true;
                    // Banked gravity time (up to ~900ms at level 1) used to drain at soft-drop speed in
                    // ONE frame, so every Down tap lurched the piece up to 11 cells. Start the soft drop clean.
                    this.fallTimer = 0;
                    this.tryMove(0, 1);
                }
            } else if (key === 'ArrowUp') {
                if (!e.repeat) this.firmDrop();
            } else if (key === ' ') {
                if (!e.repeat) this.hardDrop();
            } else if (key === 'z' || key === 'Z') {
                if (!e.repeat) this._rotateOrBuffer(-1);
            } else if (key === 'x' || key === 'X') {
                if (!e.repeat) this._rotateOrBuffer(1);
            } else if (key === 'c' || key === 'C' || key === 'Shift') {
                if (!e.repeat) this._holdOrBuffer();
            }
        });

        document.addEventListener('keyup', (e) => {
            if (!this.isOpen()) return;
            if (e.key === 'ArrowLeft') this.keys.left.down = false;
            if (e.key === 'ArrowRight') this.keys.right.down = false;
            if (e.key === 'ArrowDown') this.keys.down.down = false;
        });

        window.addEventListener('blur', () => {
            if (!this.isOpen()) return;
            this.clearKeys();
            // Solo pauses on blur; a 1v1 game keeps running (see togglePause — no stalling the opponent).
            if (this.state === 'running' && !this._inLiveMatch()) {
                this.state = 'paused';
                this.updateHud();
            }
        });

        this._bindTouchControls();

        this.resetBoardState();
        this.initialized = true;
        this.updateHud();
        this.draw();
    },

    isOpen() {
        return this.overlay && this.overlay.style.display === 'block';
    },

    _inLiveMatch() {
        return this.mode === '1v1' && !!this.mpState;
    },

    // A live 1v1 game (a candy bet rides on it) asks for a second Escape within 3s before it
    // forfeits — one stray Esc used to hand the opponent the series instantly. Solo closes at once.
    _escapeNeedsConfirm() {
        const live = this._inLiveMatch() && !this.mpState.seriesOver
            && (this.state === 'running' || this.state === 'countdown' || this.state === 'gameover');
        if (!live) { this._escArmedUntil = 0; return false; }
        const now = performance.now();
        if (this._escArmedUntil && now < this._escArmedUntil) { this._escArmedUntil = 0; return false; }
        this._escArmedUntil = now + 3000;
        this.flash('Esc again to forfeit the match');
        this._announce('Press Escape again within 3 seconds to forfeit the match. The bet is refunded.');
        return true;
    },

    // One mute that actually mutes: the game button / M key silence BOTH sound systems (the Desk's
    // Mac sounds and the game's oscillators) and the menu icon follows. SFX.play also honours the
    // Desk's mute, so muting from the Apple menu silences the game too.
    toggleMute() {
        SFX.init();
        // Flip from the COMBINED state (either system muted = muted), else a Desk-muted student
        // needed two presses to hear anything.
        const muted = !(SFX.muted || (typeof MacSFX !== 'undefined' && MacSFX.muted));
        SFX.muted = muted;
        try { localStorage.setItem('studybreak-muted', muted); } catch (_) {}
        try {
            if (typeof MacSFX !== 'undefined') { MacSFX.init(); MacSFX.muted = muted; localStorage.setItem('macsound-muted', muted); }
            if (typeof _renderSoundIcon === 'function') _renderSoundIcon();
            if (typeof _renderMenuChecks === 'function') _renderMenuChecks();
        } catch (_) {}
        this._renderMute();
        this._announce(muted ? 'Sounds off' : 'Sounds on');
    },
    _renderMute() {
        const btn = document.getElementById('mute-btn');
        if (!btn) return;
        const muted = !!(SFX.muted || (typeof MacSFX !== 'undefined' && MacSFX.muted));
        btn.textContent = muted ? '\ud83d\udd07' : '\ud83d\udd0a';
        btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
        btn.title = muted ? 'Sound off \u2014 M or click to turn on' : 'Sound on \u2014 M or click to mute';
    },

    // Live Classroom signals (Arm Gate / Green Light) mirrored into the game so a student inside
    // Study Break sees the teacher's whole-class call. Information only — the game never auto-closes.
    onClassroomSignal(summary) {
        const armed = !!(summary && summary.gate && summary.gate.armed);
        const green = !!(summary && summary.greenlight);
        const note = green ? 'GREEN LIGHT from your teacher \u2014 Esc to return'
            : (armed ? 'Teacher armed the gate \u2014 Esc to return' : '');
        if (note === (this._classroomNote || '')) return;
        this._classroomNote = note;
        if (note && (this.state === 'running' || this.state === 'paused')) this.flash(note);
        this.updateHud();
    },

    _inDanger() {
        if (this.state !== 'running') return false;
        for (let y = this.HIDDEN_ROWS; y < this.HIDDEN_ROWS + 4; y++) {
            for (let x = 0; x < this.COLS; x++) if (this.board[y][x]) return true;
        }
        return false;
    },

    // Break clock (solo): information, not a gate. After BREAK_SOFT_MIN the cards point at the Do Now.
    _drawBreakClock(ctx) {
        if (!this.openedAt) return;
        const s = Math.floor((Date.now() - this.openedAt) / 1000);
        const m = Math.floor(s / 60), ss = String(s % 60).padStart(2, '0');
        ctx.font = '9px Geneva, Arial, sans-serif';
        ctx.fillStyle = m >= this.BREAK_SOFT_MIN ? '#b00000' : '#666666';
        ctx.textAlign = 'right';
        ctx.fillText(`Break ${m}:${ss}`, this.BOARD_X + this.COLS * this.CELL, 14);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#000000';
    },
    _breakNote() {
        if (!this.openedAt) return '';
        const m = Math.floor((Date.now() - this.openedAt) / 60000);
        if (m < this.BREAK_SOFT_MIN) return '';
        return `Break ${m} min \u00b7 ` + (this._lessonDone === false ? 'Do Now is waiting (Esc)' : 'Esc heads back');
    },
    // Soft Do-Now awareness: the completion oracle fails OPEN (null = unknown → neutral copy).
    _todayLessonDone() {
        try {
            if (typeof _isLessonComplete !== 'function' || typeof getStudentMarks !== 'function') return null;
            const t = (typeof _todayLessonInf !== 'undefined' && _todayLessonInf) ? _todayLessonInf.t : null;
            if (!t) return null;
            return !!_isLessonComplete(t, getStudentMarks());
        } catch (_) { return null; }
    },

    // Grounded piece darkens as its lock delay runs out, so "it froze" reads as "about to lock".
    _drawLockCue() {
        if (!this.active || this.lockTimer <= 0 || !this.isGrounded(this.active)) return;
        const t = Math.min(1, this.lockTimer / this.LOCK_DELAY);
        const ctx = this.ctx;
        ctx.fillStyle = `rgba(0,0,0,${(0.4 * t).toFixed(2)})`;
        for (const cell of this.getCells(this.active)) {
            if (cell.y < this.HIDDEN_ROWS) continue;
            const pos = this.boardToPixel(cell.x, cell.y);
            ctx.fillRect(pos.x + 1, pos.y + 1, this.CELL - 2, this.CELL - 2);
        }
    },

    // Split view: mini HOLD (left gutter) + next three (right gutter) on a 215px canvas.
    _drawSplitGutters(ctx, cfg, hold, queue, holdLocked) {
        const right = cfg.BOARD_X + this.COLS * cfg.CELL + 4;
        ctx.save();
        ctx.fillStyle = '#000000';
        ctx.font = '8px Chicago, Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('HOLD', 6, 34);
        if (hold) {
            if (holdLocked) ctx.globalAlpha = 0.4;
            this.drawMiniPiece(hold, 4, 38, 50, 28, ctx);
            ctx.globalAlpha = 1;
        }
        ctx.fillStyle = '#000000';
        ctx.fillText('NEXT', right + 2, 34);
        (queue || []).slice(0, 3).forEach((t, i) => this.drawMiniPiece(t, right, 38 + i * 32, 50, 28, ctx));
        ctx.restore();
    },

    // Rotate/hold pressed during the 150ms entry delay (no active piece yet) used to vanish; buffer
    // the last one and apply it the moment the next piece spawns.
    _rotateOrBuffer(dir) {
        if (this.active) { this.tryRotate(dir); return; }
        this._buffered = Object.assign(this._buffered || {}, { rotate: dir });
    },
    _holdOrBuffer() {
        if (this.active) { this.holdSwap(); return; }
        this._buffered = Object.assign(this._buffered || {}, { hold: true });
    },

    // Wire palette for the 1v1 board snapshot: ONE source (colors + the garbage grey) for encode and
    // decode, append-only so indices stay stable. Two hand-copied arrays used to drift, and received
    // garbage rendered as I-piece cyan on the rival's screen.
    _palette() {
        if (!this._PALETTE) this._PALETTE = Object.values(this.colors).concat(['#888888']);
        return this._PALETTE;
    },

    // Ghost turns gold/silver when dropping HERE completes a whole-piece square (cached per
    // piece pose + board version; ≤16 regions checked).
    _ghostMaterial(ghostY) {
        const a = this.active;
        if (!a) return null;
        const key = `${a.type}${a.rot}${a.x}${ghostY}|${this._boardVersion}`;
        if (this._ghostKey === key) return this._ghostMat;
        const cells = this.getCells(a, a.rot, a.x, ghostY);
        const virt = new Map(cells.map((c) => [c.x + ',' + c.y, { kind: 'piece', pieceId: a.id, pieceType: a.type }]));
        const xs = cells.map((c) => c.x), ys = cells.map((c) => c.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        let mat = null;
        for (let y = Math.max(0, maxY - 3); y <= Math.min(this.TOTAL_ROWS - 4, minY) && !mat; y++) {
            for (let x = Math.max(0, maxX - 3); x <= Math.min(this.COLS - 4, minX); x++) {
                mat = this._regionMaterial(x, y, virt);
                if (mat) break;
            }
        }
        this._ghostKey = key; this._ghostMat = mat;
        return mat;
    },
    _regionMaterial(x, y, virt) {
        const counts = new Map();
        const types = new Set();
        for (let dy = 0; dy < 4; dy++) {
            for (let dx = 0; dx < 4; dx++) {
                const cell = virt.get((x + dx) + ',' + (y + dy)) || this.board[y + dy][x + dx];
                if (!cell || cell.kind !== 'piece' || cell.pieceId == null) return null;
                counts.set(cell.pieceId, (counts.get(cell.pieceId) || 0) + 1);
                types.add(cell.pieceType);
            }
        }
        if (counts.size !== 4) return null;
        for (const n of counts.values()) if (n !== 4) return null;
        return types.size === 1 ? 'gold' : 'silver';
    },

    // ── Touch controls (coarse-pointer devices only) ──────────────────────────────────────
    // The strip under the canvas is hidden on keyboard devices. Holding ◀ ▶ auto-repeats through
    // the same DAS path as the keyboard; ▼ soft-drops while held; the rest are taps.
    _bindTouchControls() {
        if (this._touchAbort) this._touchAbort.abort();
        this._touchAbort = new AbortController();
        const options = { signal: this._touchAbort.signal };
        this.overlay.addEventListener('focusout', (e) => {
            if (!this.overlay.contains(e.relatedTarget)) this.clearKeys();
        }, options);
        const strip = document.getElementById('game-touch');
        if (!strip) return;
        if (window.matchMedia && window.matchMedia('(any-pointer: coarse)').matches) strip.classList.add('on');
        this.overlay.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'touch') strip.classList.add('on');
        }, options);
        this._touchPointers = { left: new Set(), right: new Set(), down: new Set() };
        const press = (act, pointerId) => {
            if (this.state !== 'running') return;
            const pointers = this._touchPointers[act];
            if (pointers) {
                pointers.add(pointerId);
                if (this.keys[act].down) return;
            }
            const now = performance.now();
            if (act === 'left') { this.keys.left.down = true; this.keys.left.next = now + this.DAS_DELAY; this.keys.lastDir = 'left'; this.tryMove(-1, 0); }
            else if (act === 'right') { this.keys.right.down = true; this.keys.right.next = now + this.DAS_DELAY; this.keys.lastDir = 'right'; this.tryMove(1, 0); }
            else if (act === 'down') { this.keys.down.down = true; this.fallTimer = 0; this.tryMove(0, 1); }
            else if (act === 'ccw') this._rotateOrBuffer(-1);
            else if (act === 'cw') this._rotateOrBuffer(1);
            else if (act === 'hold') this._holdOrBuffer();
            else if (act === 'drop' && this.active) this.hardDrop();
        };
        const release = (act, pointerId) => {
            const pointers = this._touchPointers[act];
            if (!pointers || !pointers.delete(pointerId)) return;
            if (pointers.size === 0) this.keys[act].down = false;
        };
        strip.querySelectorAll('.game-touch-btn').forEach((btn) => {
            const act = btn.dataset.act;
            btn.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                try { btn.setPointerCapture(e.pointerId); } catch (_) {}
                press(act, e.pointerId);
            }, options);
            btn.addEventListener('pointerup', (e) => { e.preventDefault(); release(act, e.pointerId); }, options);
            btn.addEventListener('pointercancel', (e) => release(act, e.pointerId), options);
            btn.addEventListener('lostpointercapture', (e) => release(act, e.pointerId), options);
            btn.addEventListener('contextmenu', (e) => e.preventDefault(), options);
        });
    },

    enterSplitMode() {
        // Swap to split-screen rendering context
        this.ctx = this.splitConfig.ctx;
        this.CELL = this.splitConfig.CELL;          // 10
        this.BOARD_X = this.splitConfig.BOARD_X;    // 58
        this.CANVAS_W = this.splitConfig.CANVAS_W;  // 215
        this.CANVAS_H = this.splitConfig.CANVAS_H;  // 302
    },

    exitSplitMode() {
        // Restore solo rendering context
        this.ctx = this.soloConfig.ctx;
        this.CELL = this.soloConfig.CELL;           // 12
        this.BOARD_X = this.soloConfig.BOARD_X;     // 155
        this.CANVAS_W = this.soloConfig.CANVAS_W;   // 430
        this.CANVAS_H = this.soloConfig.CANVAS_H;   // 302
    },

    open() {
        this.init();
        if (typeof _appTopZ !== 'undefined') this.overlay.style.zIndex = ++_appTopZ;
        if (this.isOpen()) {
            this.canvas.focus();
            if (typeof _lastClassroomSummary !== 'undefined') this.onClassroomSignal(_lastClassroomSummary);
            return;
        }
        this._bindTouchControls();
        SFX.init();
        this._renderMute();
        this._prevFocus = document.activeElement;   // restored on close (keyboard users land back where they were)
        this.openedAt = Date.now();
        this._lessonDone = this._todayLessonDone();
        // A solo game interrupted by Esc comes back PAUSED with its board intact (close() keeps it);
        // anything else returns to the mode card.
        const resumable = this.mode === 'solo' && this.state === 'paused';
        if (!resumable) {
            this.mode = 'solo';
            this.state = 'idle';
            this.resetBoardState();
        }
        this.overlay.style.display = 'block';
        if (typeof _lastClassroomSummary !== 'undefined') this.onClassroomSignal(_lastClassroomSummary);
        this.canvas.style.display = 'block';
        document.getElementById('game-split').style.display = 'none';
        document.getElementById('game-lobby').style.display = 'none';
        this.canvas.focus();
        this.startLoop();
        this.updateHud();
        this.draw();
    },

    close() {
        this._clearOutgoingChallenge(true);
        if (!this.initialized) return;
        if (this._touchAbort) { this._touchAbort.abort(); this._touchAbort = null; }
        const players = document.getElementById('lobby-players');
        if (players) players.replaceChildren();
        clearTimeout(this._levelUpTimer);
        this._levelUpTimer = null;
        this._stopHeartbeat();   // MP-5: stop the keep-alive/watchdog on teardown
        // Clear per-match timers before nulling mpState, including best-of-3 auto-advance.
        if (this.mpState) {
            clearTimeout(this.mpState._advanceTimer);
            clearTimeout(this.mpState._stakeTimer);
            // MP-4: send game_leave over the LIVE socket (a stale cached mpWs would silently
            // skip it and the opponent would wait out the server sweep). SB-5: ALWAYS clear
            // mpState on teardown (was only cleared when the socket happened to be open).
            if (this.mode === '1v1') {
                const ws = this._liveWs();
                if (ws) { try { ws.send(JSON.stringify({ type: 'game_leave', roomId: this.mpState.roomId })); } catch (_) {} }
            }
            this.mpState = null;
        }
        // SB-2 (state): the best-of-3 countdown interval was a local var — clear it on teardown.
        if (this.countdownTimer) { clearInterval(this.countdownTimer); this.countdownTimer = null; }
        if (this.mpChallengeTimer) {
            clearInterval(this.mpChallengeTimer);
            this.mpChallengeTimer = null;
        }
        // Clean up WebRTC
        if (this.peerConnection) { this.peerConnection.close(); this.peerConnection = null; }
        if (this.dataChannel) { this.dataChannel = null; }
        this.useP2P = false;
        this._pendingIce = [];   // MP-3: drop any buffered ICE from the closed match
        if (this.rtcTimeout) { clearTimeout(this.rtcTimeout); this.rtcTimeout = null; }
        this.exitSplitMode();
        this._declinePendingChallenge();   // an open incoming dialog: decline now, don't strand the challenger 30s
        document.getElementById('game-split').style.display = 'none';
        document.getElementById('game-lobby').style.display = 'none';
        document.getElementById('challenge-dialog').style.display = 'none';
        document.getElementById('game-score').style.display = '';
        this.canvas.style.display = 'block';
        const was1v1 = this.mode === '1v1';
        this.mode = 'solo';
        this.overlay.style.display = 'none';
        this.clearKeys();
        this.clearFx = null; this.fuseFx = null;
        this.openedAt = 0;
        this._classroomNote = '';
        if (was1v1) { this.state = 'idle'; this.resetBoardState(); }   // a 1v1 board never resumes as solo
        else if (this.state === 'running') this.state = 'paused';       // solo: keep the board, resume on reopen
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = null;
        this.lastTime = 0;
        try { if (this._prevFocus && typeof this._prevFocus.focus === 'function') this._prevFocus.focus(); } catch (_) {}
        this._prevFocus = null;
    },

    startLoop() {
        if (this.raf) cancelAnimationFrame(this.raf);
        this.lastTime = 0;
        this._acc = 0;
        this.raf = requestAnimationFrame((ts) => this.loop(ts));
    },

    loop(ts) {
        if (!this.isOpen()) {
            this.raf = null;
            return;
        }
        const delta = this.lastTime ? ts - this.lastTime : 16.67;
        this.lastTime = ts;
        if (this.state === 'running') {
            const STEP = 16.67;
            this._acc = (this._acc || 0) + delta;
            let steps = 0;
            while (this._acc >= STEP && this.state === 'running' && steps++ < 15) {
                this.update(STEP, ts);
                this._acc -= STEP;
            }
            this._acc = Math.min(this._acc, 250);
        }
        if (this.clearFx) { this.clearFx.timer -= delta; if (this.clearFx.timer <= 0) this.clearFx = null; }
        if (this.fuseFx) { this.fuseFx.timer -= delta; if (this.fuseFx.timer <= 0) this.fuseFx = null; }
        // Light opponent updates at ~10Hz (active piece / hold / next, no board): the rival's screen
        // used to be a 2.5s slideshow between locks. Full-board sends still happen at lock + heartbeat.
        if (this._mpDirty && this._inLiveMatch() && this.state === 'running' && ts - (this._mpLastSend || 0) >= 100) {
            this._mpDirty = false;
            this._mpLastSend = ts;
            this.sendGameMessage({ type: 'game_state', score: this.score, lines: this.lines, level: this.level,
                active: this.active ? { type: this.active.type, rot: this.active.rot, x: this.active.x, y: this.active.y } : null,
                hold: this.hold, queue: this.queue.slice(0, 3), state: this.state });
        }
        if (this.flashTimer > 0) {
            this.flashTimer = Math.max(0, this.flashTimer - delta);
            if (this.flashTimer === 0 && this.flashText && this.state !== 'gameover') {
                this.flashText = '';
                this.updateHud();
            }
        }
        // Idle states (mode card, paused, game over) repaint at ~10fps: a paused game left open on a
        // shared Chromebook shouldn't burn a full-rate canvas loop next to the Desk's other canvases.
        if (this.state === 'running' || !this._lastIdleDraw || ts - this._lastIdleDraw >= 100) {
            this.draw();
            this._lastIdleDraw = ts;
        }
        this.raf = requestAnimationFrame((next) => this.loop(next));
    },

    resetBoardState() {
        clearTimeout(this._levelUpTimer);
        this._levelUpTimer = null;
        this.board = Array.from({ length: this.TOTAL_ROWS }, () => Array(this.COLS).fill(null));
        this.queue = [];
        this.bag = [];
        this.hold = null;
        this.holdLocked = false;
        this.active = null;
        this.nextPieceId = 1;
        this.nextSquareId = 1;
        this.tick = 0;            // fixed-step game tick (update()): drives the slab highlight phase
        this._slabBornAt = {};    // squareId → tick it fused at
        this.spawnTimer = 0;
        this.fallTimer = 0;
        this.lockTimer = 0;
        this.lockResets = 0;   // SB-1(core): per-piece lock-reset budget
        this.score = 0;
        this.lines = 0;
        this.level = 1;
        this.goldCount = 0;
        this.silverCount = 0;
        this.flashText = '';
        this.flashTimer = 0;
        this._hints = [];
        this._lastResult = null;
        this._escArmedUntil = 0;
        this._since = null;
        this._buffered = null;
        this.clearFx = null; this.fuseFx = null;
        this.pieceCounts = {};
        this.keys.lastDir = null;
        this._boardVersion++;
        this.clearKeys();
    },

    clearKeys() {
        if (this._touchPointers) Object.values(this._touchPointers).forEach(pointers => pointers.clear());
        this.keys.left.down = false;
        this.keys.right.down = false;
        this.keys.down.down = false;
    },

    startNewGame() {
        // Best-of-3: advancing to the next game of an unfinished 1v1 series (one shared escrow
        // spans the series). Solo (no mpState) + the first game (via startMatch) are unaffected.
        const ms = this.mpState;
        // After the series is decided, R/Enter/click must NOT start a phantom game on the dead
        // match (a new match needs a fresh challenge → new roomId). Card says "Esc to exit".
        if (this.mode === '1v1' && ms && ms.seriesOver) return;
        if (this.mode === '1v1' && ms && !ms.seriesOver) {
            // Skipping ahead (R / Enter / click) while this game is still uncounted — e.g. inside the
            // 1500ms cross-KO window — must count it FIRST, or my loss is never tallied and the two
            // clients disagree (bet refunded, honest winner unpaid).
            if (!ms.gameScored && this.state === 'gameover') {
                ms.gameOverAt = 0;
                this._studyBreakScoreGameOnce();
                if (ms.seriesOver) return;   // that was the decider — stay on the series card
            }
            clearTimeout(ms._advanceTimer);
            ms.gameNumber = (ms.gameNumber || 1) + 1;
            ms.gameScored = false;
            ms._wonThisGame = false;
            ms.pendingGarbage = 0;   // garbage queued during the last game must not land in this one
            ms.roundStartedAt = Date.now();
            ms.oppSeenThisRound = false;
            ms._oppWitness = null;  // the opponent's score restarts: the gold witness starts over
            this._seedRng(ms.roomId + ':' + ms.gameNumber);   // shared piece sequence for this game
        } else {
            this._rand = null;   // solo: plain Math.random
        }
        this.init();
        this.resetBoardState();
        this._acc = 0;
        this.state = 'running';
        this.hold = this.nextFromBag();   // from the bag, not a side draw (honest 9-of-each counts)
        this.fillQueueTo(6);
        this.spawnNext();
        if (this._inLiveMatch()) this.sendGameState();   // full (empty) board: the light 10Hz updates carry none
        this.startLoop();
        this.updateHud();
        this.draw();
    },

    startMultiplayer() {
        this.mode = '1v1';
        this.state = 'idle';
        // Hide main canvas, show lobby
        this.canvas.style.display = 'none';
        document.getElementById('game-split').style.display = 'none';
        document.getElementById('game-lobby').style.display = 'block';
        document.getElementById('game-score').style.display = 'none';
        this.updateHud();
        this._studyBreakCasinoLine();   // Casino Stats: your W-L / net / EV-per-game (the probability lab)

        // Connect to Railway WebSocket
        this.connectMultiplayerWS();
    },

    connectMultiplayerWS() {
        const serverUrl = (window.RAILWAY_SERVER_URL || 'https://curriculumrender-production.up.railway.app').replace(/^http/, 'ws');
        // Identity = the signed-in roster username (NOT a random Player###). DogePresence.getUsername()
        // checks rosterClient first; the old localStorage 'student-name'/'username' keys are never written
        // by the Desk, which is why a ghost Player#### used to appear in classmates' Online lists.
        this.mpUsername = (typeof DogePresence !== 'undefined' && DogePresence.getUsername)
            ? DogePresence.getUsername()
            : (localStorage.getItem('student-name') || localStorage.getItem('username') || ('Player' + Math.floor(Math.random() * 1000)));

        // Prefer the Desk's ALWAYS-ON presence socket (DogePresence auto-connects at boot). Reusing it
        // means ONE connection under the real identity — no ghost, no double-prompt. DogePresence.handleMessage
        // already routes every game message (challenge/match/opponent/rtc) to studyBreak, so we don't wire
        // our own onmessage onto the shared socket.
        if (typeof DogePresence !== 'undefined') {
            if (!DogePresence.ws || DogePresence.ws.readyState > 1) { try { DogePresence.connect(); } catch (_) {} }
            if (DogePresence.ws) {
                this.mpWs = DogePresence.ws;
                this._setLobbyStatus('Connected as ' + this.mpUsername + ' \u2014 pick a classmate');
                this.updateLobby();
                return;
            }
        }

        // Fallback (DogePresence somehow unavailable): open our own socket under the real identity.
        if (this.mpWs && this.mpWs.readyState <= 1) {
            this.updateLobby();
            return;
        }

        const statusEl = document.getElementById('lobby-status');
        if (statusEl) statusEl.textContent = 'Connecting...';
        this.mpWs = new WebSocket(serverUrl);

        this.mpWs.onopen = () => {
            if (statusEl) statusEl.textContent = 'Connected as ' + this.mpUsername;
            this.mpWs.send(JSON.stringify({ type: 'identify', username: this.mpUsername, location: { surface: 'desk', lesson: null } }));
        };

        this.mpWs.onmessage = (event) => {
            let data;
            try { data = JSON.parse(event.data); } catch (_) { return; }
            if (!data || typeof data !== 'object') return;
            this.handleMpMessage(data);
        };

        this.mpWs.onclose = () => {
            if (statusEl) statusEl.textContent = 'Disconnected. Reconnecting...';
            setTimeout(() => {
                if (this.mode === '1v1' && this.isOpen()) this.connectMultiplayerWS();
            }, 3000);
        };

        this.mpWs.onerror = () => {
            if (statusEl) statusEl.textContent = 'Connection error';
        };
    },

    handleMpMessage(data) {
        switch (data.type) {
            case 'presence_snapshot':
                this.mpOnlinePlayers = (data.users || []).filter((u) => u !== this.mpUsername);
                this.updateLobby();
                break;

            case 'user_online':
                if (data.username !== this.mpUsername && !this.mpOnlinePlayers.includes(data.username)) {
                    this.mpOnlinePlayers.push(data.username);
                    this.updateLobby();
                }
                break;

            case 'user_offline':
                this.mpOnlinePlayers = this.mpOnlinePlayers.filter((u) => u !== data.username);
                this.updateLobby();
                break;

            case 'challenge_received':
                // Route to doge presence if game is not open
                if (!this.isOpen()) {
                    DogePresence.onChallengeReceived(data.from);
                } else {
                    this.showChallengeDialog(data.from);
                }
                break;

            case 'challenge_declined':
                this._onChallengeOutcome('declined', data);
                this.flash(data.by + ' declined' + (data.reason === 'timeout' ? ' (timed out)' : ''));
                this.updateLobby();
                break;

            case 'challenge_error':
                this._onChallengeOutcome('error', data);
                this.flash(data.error || 'Challenge failed');
                break;

            case 'match_start':
                if (this._abandonedChallenges && this._abandonedChallenges[data.opponent] > Date.now()) {
                    const ws = this._liveWs();
                    if (ws) { try { ws.send(JSON.stringify({ type: 'game_leave', roomId: data.roomId })); } catch (_) {} }
                    return;
                }
                // If game isn't open, launch from doge
                if (!this.isOpen()) {
                    DogePresence.launchMatch(data);
                } else {
                    this.startMatch(data);
                }
                break;

            case 'opponent_state':
                this.updateOpponentState(data);
                break;

            case 'garbage_incoming':
                this.receiveGarbage(data.lines, data.roomId);
                break;

            case 'opponent_ko':
                this.opponentKO(data.finalScore, data.roomId);
                break;

            case 'opponent_left':
                this.opponentLeft(data.reason, data.roomId);
                break;

            case 'rtc_offer':
                if (this.peerConnection) {
                    this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp))
                        .then(() => this.peerConnection.createAnswer())
                        .then(answer => this.peerConnection.setLocalDescription(answer))
                        .then(() => {
                            const ws = this._liveWs();
                            if (ws && this.peerConnection) ws.send(JSON.stringify({ type: 'rtc_answer', sdp: this.peerConnection.localDescription }));
                            this._flushIce();   // MP-3: remote desc is set — drain buffered candidates
                        }).catch(() => {});
                }
                break;

            case 'rtc_answer':
                if (this.peerConnection) {
                    this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp))
                        .then(() => this._flushIce())
                        .catch(() => {});
                }
                break;

            case 'rtc_ice':
                if (data.candidate) this._addIce(data.candidate);   // MP-3: buffers if no remote desc yet
                break;
        }
    },

    updateLobby() {
        const el = document.getElementById('lobby-players');
        if (!el) return;
        if (this.mpOnlinePlayers.length === 0) {
            el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--plat-lo);font-size:10px">No other players online</div>';
            return;
        }
        // Location gating mirrors the doge dropdown (DOGE_PRESENCE_SUBMENU_SPEC D3): only a peer
        // who is on the Desk can receive a challenge, so don't offer a doomed one. Locations come
        // from the auto-connected DogePresence socket (single source of truth, always populated).
        const locs = (typeof DogePresence !== 'undefined' && DogePresence.locations) ? DogePresence.locations : {};
        const pending = this._outgoing ? this._outgoing.target : null;
        el.replaceChildren();
        this.mpOnlinePlayers.forEach((name) => {
            const onDesk = !!(locs[name] && locs[name].onDesk);
            const button = document.createElement('button');
            button.type = 'button';
            button.disabled = !!pending || !onDesk || name === this.mpUsername;
            button.style.cssText = 'display:flex;width:100%;justify-content:space-between;align-items:center;padding:4px 8px;border-bottom:1px solid var(--platinum);font-size:11px';
            const label = document.createElement('span');
            label.textContent = name;
            const status = document.createElement('span');
            status.style.fontSize = '9px';
            status.textContent = pending ? (name === pending ? 'waiting\u2026' : '') : name === this.mpUsername ? 'You' : onDesk ? 'Challenge \u2192' : 'elsewhere';
            button.append(label, status);
            button.onclick = () => this.sendChallenge(name);
            el.appendChild(button);
        });
    },

    sendChallenge(target) {
        // MP-1 pattern: resolve the live presence socket (a cached mpWs goes stale on reconnect).
        const ws = this._liveWs();
        if (!ws) {
            const text = 'Not connected \u2014 try again in a moment';
            this._setLobbyStatus(text);
            return text;
        }
        // One outgoing challenge at a time. Every extra click used to be a separate server challenge,
        // and a second accept could rebind the live room mid-match.
        const pending = (this._outgoing && this._outgoing.target) || (typeof DogePresence !== 'undefined' && DogePresence.challengePending);
        if (pending) {
            const text = 'Still waiting on ' + pending + '\u2026';
            this._setLobbyStatus(text);
            return text;
        }
        // A fresh challenge supersedes an earlier abandoned one to the same classmate (else our own
        // 30s abandonment marker would reject the match_start this challenge produces).
        if (this._abandonedChallenges) delete this._abandonedChallenges[target];
        ws.send(JSON.stringify({ type: 'game_challenge', target }));
        this._outgoing = { target, sentAt: Date.now(), status: 'sent', text: '' };
        if (typeof DogePresence !== 'undefined') DogePresence.challengePending = target;   // shared single-pending guard
        this.updateLobby();
        this._tickOutgoing();
        clearInterval(this._outgoingTimer);
        this._outgoingTimer = setInterval(() => this._tickOutgoing(), 1000);
    },

    _setLobbyStatus(text) {
        const el = document.getElementById('lobby-status');
        if (el) el.textContent = text;
    },
    // Outgoing-challenge lifecycle: a countdown in the lobby (and on the series card for a rematch),
    // 'no answer' at the server's 30s expiry. Cleared by declined / error / match_start / close.
    _tickOutgoing() {
        const o = this._outgoing;
        if (!o) return;
        const left = 30 - Math.floor((Date.now() - o.sentAt) / 1000);
        if (left <= 0) { this._onChallengeOutcome('timeout', { by: o.target }); return; }
        this._setLobbyStatus('Challenging ' + o.target + '\u2026 ' + left + 's');
        o.text = 'Rematch sent to ' + o.target + '\u2026 ' + left + 's';
    },
    _onChallengeOutcome(kind, data) {
        const o = this._outgoing;
        if (!o) return;
        if (kind === 'match') { this._clearOutgoingChallenge(false); return; }
        const who = (data && data.by) || o.target;
        const err = data && data.error;
        const text = kind === 'declined' ? who + ' declined' + (data && data.reason === 'timeout' ? ' (no answer)' : '')
            : kind === 'timeout' ? 'No answer from ' + who
            : (err === 'User not found' ? who + ' is offline' : (err || 'Challenge failed'));
        this._clearOutgoingChallenge(false);
        this._setLobbyStatus(text + ' \u2014 pick a classmate');
        this._rematchNote = text;   // shown on the series-over card
        this.updateLobby();
    },
    _clearOutgoingChallenge(abandon = true) {
        clearInterval(this._outgoingTimer); this._outgoingTimer = null;
        const target = (this._outgoing && this._outgoing.target) || (abandon && typeof DogePresence !== 'undefined' && DogePresence.challengePending);
        if (abandon && target) {
            if (!this._abandonedChallenges) this._abandonedChallenges = Object.create(null);
            this._abandonedChallenges[target] = Date.now() + 30000;
        }
        if (target && typeof DogePresence !== 'undefined' && DogePresence.challengePending === target) DogePresence.challengePending = null;
        this._outgoing = null;
    },
    // Series decided → R/Enter/click asks the same classmate again (a fresh roomId + escrow via the
    // normal accept path). No game_leave: the old room is simply rebound when they accept.
    requestRematch() {
        const ms = this.mpState;
        if (!ms || !ms.seriesOver || !ms.opponent || this._outgoing) return;
        ms._rematchNote = this._rematchNote = '';
        const error = this.sendChallenge(ms.opponent);
        if (typeof error === 'string') {
            ms._rematchNote = this._rematchNote = error;
            this._announce(error);
        }
        this.draw();
    },

    leaveLobby() {
        this._clearOutgoingChallenge(true);
        document.getElementById('game-lobby').style.display = 'none';
        this.canvas.style.display = 'block';
        document.getElementById('game-score').style.display = '';
        this.mode = 'solo';
        this.state = 'idle';
        this.updateHud();
        this.draw();
    },

    showChallengeDialog(fromUser) {
        // MP-1/SB-1(integration): accept/decline used this.mpWs directly, which is null when
        // Study Break is open in SOLO (the socket is only cached on lobby-connect) → a throw.
        // Resolve the live socket once and reuse it for all three replies.
        const reply = (type) => { const ws = this._liveWs(); if (ws) { try { ws.send(JSON.stringify({ type, from: fromUser })); } catch (_) {} } };
        // SB-2 (integration): don't pop a challenge over a LIVE match — auto-decline so the
        // current staked match isn't clobbered and the challenger isn't left hanging.
        if (this.mode === '1v1' && this.mpState && !this.mpState.seriesOver) {
            if (this.mpChallengeTimer) clearInterval(this.mpChallengeTimer);
            reply('challenge_decline');
            return;
        }
        // The relay replaced the old invitation, so neither dialog can still be accepted.
        if (this.pendingChallenger && this.pendingChallenger !== fromUser) {
            reply('challenge_decline');
            clearInterval(this.mpChallengeTimer); this.mpChallengeTimer = null;
            this.pendingChallenger = null;
            document.getElementById('challenge-dialog').style.display = 'none';
            this._announce('The invitation was superseded.');
            return;
        }
        SFX.play('sosumi', 0.5, { priority: true });   // the challenge alert ducks the rest (SFX_SPEC §2)
        document.body.classList.add('challenge-waiting');   // STUDY_BREAK_CHALLENGE_ALERT_SPEC §3
        const dialog = document.getElementById('challenge-dialog');
        document.getElementById('challenge-msg').textContent = fromUser + ' wants to play Study Break! (one game · 1 candy at stake, winner takes 2 🍬)';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.style.display = 'block';
        // Remembered so close() (Esc, the close box) declines on the student's behalf instead of
        // leaving the challenger hanging until the server's 30s sweep.
        if (this.mpChallengeTimer) clearInterval(this.mpChallengeTimer);
        this.pendingChallenger = fromUser;
        this._announce(fromUser + ' challenged you. Enter accepts, Escape declines.');

        // 25s client-side so this client's own decline beats the server's 30s expiry.
        let countdown = 25;
        const timerEl = document.getElementById('challenge-timer');
        timerEl.textContent = countdown + 's';
        const finish = (type) => {
            if (this.pendingChallenger !== fromUser) return;
            if (type === 'challenge_accept' && this._abandonedChallenges) delete this._abandonedChallenges[fromUser];
            clearInterval(this.mpChallengeTimer); this.mpChallengeTimer = null;
            this.pendingChallenger = null;
            dialog.style.display = 'none';
            document.body.classList.remove('challenge-waiting');
            reply(type);
        };
        document.getElementById('challenge-accept-btn').onclick = () => finish('challenge_accept');
        document.getElementById('challenge-decline-btn').onclick = () => finish('challenge_decline');

        this.mpChallengeTimer = setInterval(() => {
            countdown--;
            timerEl.textContent = countdown + 's';
            if (countdown <= 0) finish('challenge_decline');
        }, 1000);
    },

    _declinePendingChallenge() {
        const from = this.pendingChallenger;
        if (!from) return;
        this.pendingChallenger = null;
        if (this.mpChallengeTimer) { clearInterval(this.mpChallengeTimer); this.mpChallengeTimer = null; }
        document.body.classList.remove('challenge-waiting');
        const ws = this._liveWs();
        if (ws) { try { ws.send(JSON.stringify({ type: 'challenge_decline', from })); } catch (_) {} }
    },

    startMatch(data) {
        // SB-3 / F3: don't clobber a LIVE staked match (a duplicate match_start, or a 2nd
        // challenge accepted mid-series) — the existing escrow would be orphaned. Ignore the
        // new start; the both-confirm-or-refund backstop still settles the live one.
        if (this.mode === '1v1' && this.mpState && !this.mpState.seriesOver) return;
        // Clear any leftover per-match timers from a prior match before building a fresh mpState.
        if (this.mpState) {
            clearTimeout(this.mpState._advanceTimer);
            clearTimeout(this.mpState._stakeTimer);
        }
        if (this.countdownTimer) { clearInterval(this.countdownTimer); this.countdownTimer = null; }
        if (this.mpState && this.mpState.roomId && data && data.roomId !== this.mpState.roomId) {
            // Leave the finished room explicitly: the relay routes by socket->room, so a lingering
            // old room would deliver the old opponent's bare opponent_left/ko into this new match.
            const oldWs = this._liveWs();
            if (oldWs) { try { oldWs.send(JSON.stringify({ type: 'game_leave', roomId: this.mpState.roomId })); } catch (_) {} }
        }
        this._clearOutgoingChallenge(false);
        this._rematchNote = '';
        this._declinePendingChallenge();   // a dialog from a THIRD student is stale once this match starts
        this.clearFx = null; this.fuseFx = null;
        SFX.play('wildEep', 0.6);
        document.getElementById('challenge-dialog').style.display = 'none';
        document.getElementById('game-lobby').style.display = 'none';
        document.getElementById('game-score').style.display = '';

        // Set up split screen
        this.canvas.style.display = 'none';
        const splitEl = document.getElementById('game-split');
        splitEl.style.display = 'block';

        const c1 = document.getElementById('gameCanvas1');
        const c2 = document.getElementById('gameCanvas2');
        c1.width = 215; c1.height = 302;
        c2.width = 215; c2.height = 302;

        this.splitConfig.canvas = c1;
        this.splitConfig.ctx = c1.getContext('2d');
        this.splitConfig.ctx.imageSmoothingEnabled = false;
        this.opponentConfig.canvas = c2;
        this.opponentConfig.ctx = c2.getContext('2d');
        this.opponentConfig.ctx.imageSmoothingEnabled = false;

        this.enterSplitMode();

        document.getElementById('p1-label').textContent = this.mpUsername || 'You';
        document.getElementById('p2-label').textContent = data.opponent;

        this.mpState = {
            roomId: data.roomId,
            opponent: data.opponent,
            side: data.side,
            opponentBoard: Array.from({ length: this.TOTAL_ROWS }, () => Array(this.COLS).fill(null)),
            opponentScore: 0,
            opponentLines: 0,
            opponentLevel: 1,
            opponentActive: null,
            pendingGarbage: 0,
            // STAKES + best-of-3 series (STUDY_BREAK_STAKES_SPEC Phase 2). roomId is the
            // server-minted, shared, unguessable matchId — used directly for the candy escrow.
            myWins: 0, oppWins: 0, gameNumber: 1,
            gameScored: false, _wonThisGame: false, _forfeit: false,
            seriesOver: false, _resolved: false, staked: false, candyOutcome: null,
        };
        // Escrow 1 candy for the match (graceful: a guest / stakes-off / pre-migration → free play).
        this._studyBreakArmStakes();
        this._startHeartbeat();   // MP-5: opponent-freeze watchdog + keep-alive

        // Start countdown then game
        this.state = 'countdown';
        this.countdownValue = 3;
        this.updateHud();
        this._announce('Match starting in 3');
        try {
            const focusTarget = (this.splitConfig && this.splitConfig.canvas) || this.canvas;
            if (focusTarget) {
                if (!focusTarget.hasAttribute('tabindex')) focusTarget.tabIndex = -1;
                focusTarget.focus({ preventScroll: true });
            }
        } catch (_) {}
        this.draw();

        const ms = this.mpState;
        this.countdownTimer = setInterval(() => {
            if (!this.isOpen() || this.mpState !== ms || ms.seriesOver || this.state !== 'countdown') { clearInterval(this.countdownTimer); this.countdownTimer = null; return; }
            this.countdownValue--;
            this._announce(this.countdownValue > 0 ? String(this.countdownValue) : 'Go');
            this.draw();
            if (this.countdownValue <= 0) {
                clearInterval(this.countdownTimer); this.countdownTimer = null;
                this._seedRng(this.mpState.roomId + ':1');   // shared piece sequence for game 1
                this.resetBoardState();
                this.state = 'running';
                this.hold = this.nextFromBag();   // from the bag, not a side draw (honest 9-of-each counts)
                this.fillQueueTo(6);
                this.spawnNext();
                this.startLoop();
                this.updateHud();
            }
        }, 1000);

        // WebRTC P2P is OFF: it never connected (the relay mints side 'left'/'right', the offer path
        // tested `side === 0`; rtc_* messages carry no `to`, so the relay dropped them) — every match
        // just sat through a STUN call + 5s timeout before running on the WS relay anyway. The rtc_*
        // plumbing is kept for a future P2P that fixes both; the WS relay is the one transport today.
    },

    // Send game state to server after each piece lock
    sendGameState() {
        if (!this.mpState || !this.board) return;   // MP-5: heartbeat can tick pre-resetBoardState (countdown)
        // Compress board: only send non-null cells as [row, col, colorIndex]
        const colorPalette = this._palette();
        const compressed = [];
        for (let y = 0; y < this.TOTAL_ROWS; y++) {
            for (let x = 0; x < this.COLS; x++) {
                const cell = this.board[y][x];
                if (cell) {
                    const ci = colorPalette.indexOf(cell.color);
                    compressed.push([y, x, ci >= 0 ? ci : 0]);
                }
            }
        }
        this.sendGameMessage({
            type: 'game_state',
            board: compressed,
            score: this.score,
            lines: this.lines,
            level: this.level,
            active: this.active ? { type: this.active.type, rot: this.active.rot, x: this.active.x, y: this.active.y } : null,
            hold: this.hold,
            queue: this.queue.slice(0, 3),
            state: this.state
        });
    },

    // TETRIS_HARDENING (MP-1): resolve the LIVE socket on demand. studyBreak reuses the
    // Desk's always-on DogePresence socket, which auto-reconnects as a NEW object on any
    // drop — so a cached this.mpWs goes stale (readyState CLOSED) and outbound game traffic
    // silently dies, hanging the match one-sidedly. Always prefer the live presence socket.
    _liveWs() {
        if (typeof DogePresence !== 'undefined' && DogePresence.ws && DogePresence.ws.readyState === 1) return DogePresence.ws;
        if (this.mpWs && this.mpWs.readyState === 1) return this.mpWs;
        return null;
    },

    // MP-5: opponent-freeze watchdog + heartbeat. Without this, a peer whose tab freezes /
    // throttles (no clean close) leaves the match hung — you wait forever for a game_over that
    // never comes. The heartbeat is a periodic sendGameState() (a message the relay definitely
    // forwards, unlike a bespoke ping a whitelisting relay might drop), so an idle-but-present
    // opponent keeps stamping us "alive". If THEIR traffic stops for OPPONENT_TIMEOUT_MS while a
    // game is running, treat it as opponentLeft('timeout') — you win by forfeit, the bet refunds
    // via the server (they never confirm), mirroring the accepted rage-quit semantics.
    // Games a player must win to take the match. 1 = a single game, then the verdict.
    WINS_TO_TAKE: 1,

    _startHeartbeat() {
        this._stopHeartbeat();
        if (!this.mpState) return;
        this.mpState.lastOpponentMs = Date.now();   // grace from match start
        this.heartbeatTimer = setInterval(() => {
            const ms = this.mpState;
            if (!this.isOpen() || !ms || ms.seriesOver) { this._stopHeartbeat(); return; }
            this.sendGameState();   // heartbeat (also keeps the opponent's board view fresh)
            if (this.state === 'running' && ms.lastOpponentMs && (Date.now() - ms.lastOpponentMs) > this.OPPONENT_TIMEOUT_MS) {
                this._stopHeartbeat();
                this.opponentLeft('timeout');
            }
        }, this.HEARTBEAT_MS);
    },
    _stopHeartbeat() {
        if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    },

    sendGameMessage(msg) {
        // SB-4: stamp the match id so the peer can drop stale cross-game messages.
        if (this.mpState && this.mpState.roomId && msg.roomId === undefined) msg.roomId = this.mpState.roomId;
        const json = JSON.stringify(msg);
        if (this.useP2P && this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(json);
            return;
        }
        const ws = this._liveWs();
        if (ws) ws.send(json);
    },

    // ── Solo personal record (per signed-in student, on this device) ──────────────────────
    // The relay's Hall of Fame is class-wide and in-memory; this is the student's own history:
    // best score + the last 10 solo scores. The game-over card shows the best and the mean of
    // the recent runs — the same "center of your distribution" idea the course teaches.
    _statsKey() {
        let who = this.mpUsername;
        try { if (!who && typeof DogePresence !== 'undefined' && DogePresence.getUsername) who = DogePresence.getUsername(); } catch (_) {}
        return 'studybreak-stats:' + (who || 'anon');
    },
    _loadStats() {
        try {
            const raw = JSON.parse(localStorage.getItem(this._statsKey()) || 'null');
            if (raw && typeof raw === 'object') return {
                best: raw.best && Number.isFinite(raw.best.score) && raw.best.score >= 0 ? raw.best : null,
                recent: Array.isArray(raw.recent) ? raw.recent.filter(score => Number.isFinite(score) && score >= 0).slice(-10) : []
            };
        } catch (_) {}
        return { best: null, recent: [] };
    },
    _recordSoloResult() {
        if (this.mode === '1v1' || this.state !== 'gameover') return;
        const stats = this._loadStats();
        const isBest = this.score > 0 && (!stats.best || this.score > stats.best.score);
        if (isBest) stats.best = { score: this.score, lines: this.lines, level: this.level, at: Date.now() };
        stats.recent = stats.recent.concat([this.score]).slice(-10);
        try { localStorage.setItem(this._statsKey(), JSON.stringify(stats)); } catch (_) {}
        this._lastResult = { isBest, best: stats.best, recent: stats.recent };
        if (isBest && stats.recent.length > 1) SFX.play('goldChime', 0.6);
    },

    // Every loss funnels through here: state, the opponent's game_over, sound, flash, and (solo)
    // the personal record.
    _endGame(message) {
        this.state = 'gameover';
        this.clearFx = null; this.fuseFx = null;
        if (this.mode === '1v1') {
            if (this.mpState) this.mpState.gameOverAt = Date.now();   // 1500ms cross-KO window (see opponentKO)
            this.sendGameMessage({ type: 'game_over', score: this.score, lines: this.lines });
        }
        SFX.play('monkey', 0.6);
        this.flash(message);
        this._recordSoloResult();
        this._announce(message + ' — game over, score ' + this.score + '. Enter or R plays again, Escape exits.');
    },

    // MP-3: buffer remote ICE candidates that arrive before setRemoteDescription, then flush.
    // addIceCandidate before a remote description (or after teardown) rejects — guard + .catch.
    _addIce(candidate) {
        const pc = this.peerConnection;
        if (!pc || !candidate) return;
        if (pc.remoteDescription && pc.remoteDescription.type) {
            try { pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {}); } catch (_) {}
        } else {
            (this._pendingIce = this._pendingIce || []).push(candidate);
        }
    },
    _flushIce() {
        const pc = this.peerConnection;
        if (!pc || !this._pendingIce || !this._pendingIce.length) return;
        const pend = this._pendingIce; this._pendingIce = [];
        for (const c of pend) { try { pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}); } catch (_) {} }
    },

    setupWebRTC() {
        if (!this.mpState || !this._liveWs()) return;
        this.useP2P = false;
        this._pendingIce = [];
        this.peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        this.peerConnection.onicecandidate = (e) => {
            if (e.candidate) { const ws = this._liveWs(); if (ws) ws.send(JSON.stringify({ type: 'rtc_ice', candidate: e.candidate })); }
        };

        // Host (side 0) creates the DataChannel and offer
        if (this.mpState.side === 0) {
            this.dataChannel = this.peerConnection.createDataChannel('game');
            this.setupDataChannel(this.dataChannel);
            this.peerConnection.createOffer().then(offer => {
                return this.peerConnection.setLocalDescription(offer);
            }).then(() => {
                const ws = this._liveWs();
                if (ws && this.peerConnection) ws.send(JSON.stringify({ type: 'rtc_offer', sdp: this.peerConnection.localDescription }));
            }).catch(() => {});
        } else {
            // Guest waits for DataChannel
            this.peerConnection.ondatachannel = (e) => {
                this.dataChannel = e.channel;
                this.setupDataChannel(this.dataChannel);
            };
        }

        // 5-second fallback timeout
        this.rtcTimeout = setTimeout(() => {
            if (!this.useP2P) {
                console.log('WebRTC P2P failed, using WS relay');
                if (this.peerConnection) { this.peerConnection.close(); this.peerConnection = null; }
                this.dataChannel = null;
            }
        }, 5000);
    },

    setupDataChannel(channel) {
        channel.onopen = () => {
            this.useP2P = true;
            if (this.rtcTimeout) { clearTimeout(this.rtcTimeout); this.rtcTimeout = null; }
            console.log('WebRTC P2P connected');
        };
        channel.onclose = () => {
            this.useP2P = false;
            console.log('WebRTC DataChannel closed, falling back to WS');
        };
        channel.onmessage = (e) => {
            let data;
            try { data = JSON.parse(e.data); } catch (_) { return; }
            if (!data || typeof data !== 'object') return;
            // Translate raw game messages to server-style types
            if (data.type === 'game_state') data.type = 'opponent_state';
            else if (data.type === 'game_garbage') { data.type = 'garbage_incoming'; }
            else if (data.type === 'game_over') { data.type = 'opponent_ko'; data.finalScore = data.score; }
            else if (data.type === 'game_leave') data.type = 'opponent_left';
            this.handleMpMessage(data);
        };
    },

    updateOpponentState(data) {
        if (!this.mpState) return;
        if (data && data.roomId && data.roomId !== this.mpState.roomId) return;   // SB-4: stale cross-game state
        this.mpState.oppSeenThisRound = true;
        this.mpState.lastOpponentMs = Date.now();   // MP-5: opponent is alive
        const colorPalette = this._palette();
        // Decompress board. Every field is peer-supplied: range-check before indexing.
        const inRange = (v, max) => Number.isInteger(v) && v >= 0 && v < max;
        if (Array.isArray(data.board)) {
            const board = Array.from({ length: this.TOTAL_ROWS }, () => Array(this.COLS).fill(null));
            for (const entry of data.board) {
                if (!Array.isArray(entry)) continue;
                const [y, x, ci] = entry;
                if (!inRange(y, this.TOTAL_ROWS) || !inRange(x, this.COLS)) continue;
                board[y][x] = { color: colorPalette[ci] || '#888888' };
            }
            this.mpState.opponentBoard = board;   // a light (board-less) update keeps the last board
        }
        if (typeof this._witnessOpponentGold === 'function') this._witnessOpponentGold(data);
        this.mpState.opponentScore = Math.max(0, Number(data.score) || 0);
        this.mpState.opponentLines = Math.max(0, Number(data.lines) || 0);
        this.mpState.opponentLevel = Math.max(1, Number(data.level) || 1);
        const a = data.active;
        this.mpState.opponentActive = (a && typeof a === 'object' && this.pieces[a.type] && inRange(a.rot, 4) && Number.isInteger(a.x) && Number.isInteger(a.y))
            ? { type: a.type, rot: a.rot, x: a.x, y: a.y } : null;
        this.mpState.opponentHold = (typeof data.hold === 'string' && this.pieces[data.hold]) ? data.hold : null;
        this.mpState.opponentQueue = Array.isArray(data.queue) ? data.queue.filter((t) => typeof t === 'string' && !!this.pieces[t]).slice(0, 3) : [];
        // Render opponent board
        this.drawOpponentBoard();
    },

    // TETRIS_SQUARES_SPEC §3: the opponent's gold lines, derived from the score / lines / level
    // values every game_state message already carries (no new relay field; the relay forwards the
    // same message shape). Score changes only through a line clear, by L × (100·plain + 500·silver
    // + 1000·gold) at the level L the clear happened at (= the level in their previous message),
    // plus 10 for a perfect clear. With n = the lines delta and U = (Δscore − perfect) / (100·L):
    //   U − n = 4·silver + 9·gold,  silver + gold ≤ n ≤ 4,
    // which has exactly one solution (4·Δs = 9·Δg has none with |Δg| < 4), so a fuse + tetris in
    // one lock counts its gold lines and a double silver never reads as gold. Each lock sends a
    // full state at once, so one message carries at most one clear; anything that does not decode
    // (a lost message, a new game resetting the score) counts nothing.
    // Trust (Codex review 2026-10-10): these are the opponent client's own reported values — the
    // same trust level as the base stake, which already rests on both clients' reports of the win.
    // A forged score can claim a gold clear exactly as a forged report can claim the win; the
    // premium adds no new trust surface, and the server pays only when both reports agree.
    _witnessOpponentGold(data) {
        const ms = this.mpState;
        if (!ms || !data) return;
        const score = Number(data.score), lines = Number(data.lines), level = Number(data.level);
        if (!Number.isFinite(score) || !Number.isFinite(lines) || !Number.isFinite(level)) return;
        const prev = ms._oppWitness;
        ms._oppWitness = { score, lines, level };
        if (!prev) return;
        const gold = this._goldLinesFromDeltas(score - prev.score, lines - prev.lines, prev.level);
        if (gold) ms.oppGoldClears = (ms.oppGoldClears || 0) + gold;
    },

    // Gold lines in ONE clear from its score delta, lines delta and the level it was cleared at
    // (0 when the deltas are not exactly one clear). Pure; see _witnessOpponentGold.
    _goldLinesFromDeltas(dScore, dLines, level) {
        if (!Number.isInteger(dLines) || dLines < 1 || dLines > 4) return 0;
        if (!Number.isInteger(level) || level < 1 || !Number.isInteger(dScore)) return 0;
        let points = dScore;
        if (points % 100 === 10) points -= 10;   // a perfect clear's +10
        if (points <= 0 || points % (100 * level) !== 0) return 0;
        const extra = points / (100 * level) - dLines;   // = 4·silver + 9·gold
        for (let gold = 0; gold <= dLines; gold++) {
            const rest = extra - 9 * gold;
            if (rest < 0 || rest % 4 !== 0) continue;
            if (gold + rest / 4 <= dLines) return gold;
        }
        return 0;
    },

    drawOpponentBoard() {
        if (!this.opponentConfig.ctx || !this.mpState) return;
        const ctx = this.opponentConfig.ctx;
        const cfg = this.opponentConfig;
        ctx.clearRect(0, 0, cfg.CANVAS_W, cfg.CANVAS_H);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cfg.CANVAS_W, cfg.CANVAS_H);

        // Draw board well
        const bx = cfg.BOARD_X;
        const by = cfg.BOARD_Y;
        const bw = this.COLS * cfg.CELL;
        const bh = this.VISIBLE_ROWS * cfg.CELL;
        ctx.fillStyle = '#efefef';
        ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
        ctx.strokeStyle = '#000000';
        ctx.strokeRect(bx - 1.5, by - 1.5, bw + 3, bh + 3);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(bx, by, bw, bh);

        // Grid lines
        ctx.strokeStyle = '#e8e8e8';
        for (let cx = 0; cx <= this.COLS; cx++) {
            const px = bx + cx * cfg.CELL + 0.5;
            ctx.beginPath(); ctx.moveTo(px, by); ctx.lineTo(px, by + bh); ctx.stroke();
        }
        for (let cy = 0; cy <= this.VISIBLE_ROWS; cy++) {
            const py = by + cy * cfg.CELL + 0.5;
            ctx.beginPath(); ctx.moveTo(bx, py); ctx.lineTo(bx + bw, py); ctx.stroke();
        }

        // Draw cells
        for (let y = this.HIDDEN_ROWS; y < this.TOTAL_ROWS; y++) {
            for (let x = 0; x < this.COLS; x++) {
                const cell = this.mpState.opponentBoard[y][x];
                if (!cell) continue;
                const px = bx + x * cfg.CELL;
                const py = by + (y - this.HIDDEN_ROWS) * cfg.CELL;
                this.drawCell(px, py, cfg.CELL, cell.color, false, ctx);   // same bevel as my board
            }
        }

        // Draw opponent active piece
        if (this.mpState.opponentActive) {
            const a = this.mpState.opponentActive;
            const cells = this.pieces[a.type] && this.pieces[a.type][a.rot];
            const color = this.colors[a.type] || '#888888';
            if (cells) {
                for (const [cx, cy] of cells) {
                    const py = a.y + cy;
                    if (py < this.HIDDEN_ROWS) continue;
                    const px = bx + (a.x + cx) * cfg.CELL;
                    const ppy = by + (py - this.HIDDEN_ROWS) * cfg.CELL;
                    ctx.fillStyle = color;
                    ctx.fillRect(px, ppy, cfg.CELL, cfg.CELL);
                    ctx.strokeStyle = '#000000';
                    ctx.strokeRect(px + 0.5, ppy + 0.5, cfg.CELL - 1, cfg.CELL - 1);
                }
            }
        }

        // Score label at top
        ctx.fillStyle = '#000000';
        ctx.font = '9px Geneva, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Score ${this.mpState.opponentScore} | L${this.mpState.opponentLevel}`, cfg.CANVAS_W / 2, 14);
        // Their hold + next three in the gutters (mirrors my side of the split).
        this._drawSplitGutters(ctx, cfg, this.mpState.opponentHold, this.mpState.opponentQueue || [], false);

        // (The incoming-garbage meter now sits beside YOUR board in draw(): it is garbage aimed
        // at you, and drawing it next to the opponent's well read as theirs.)
        ctx.textAlign = 'left';
    },

    receiveGarbage(lines, roomId) {
        if (!this.mpState) return;
        if (roomId && roomId !== this.mpState.roomId) return;   // SB-4: stale cross-game garbage
        this.mpState.lastOpponentMs = Date.now();   // MP-5: opponent is alive
        // Queue it. Garbage lands when the NEXT piece locks without clearing a line (lockPiece) —
        // standard versus rules — so the red meter beside your board is a real warning and a
        // line clear can still cancel it. It used to land on a 1s timer, mid-air, burying the
        // active piece and giving the cancel logic almost no window.
        // Clamp to what one legitimate lock can send (MAX_GARBAGE) and bound the queue: a forged
        // {lines: 24} from DevTools on a shared Chromebook must not bury the opponent.
        const n = Math.min(this.MAX_GARBAGE, Math.max(0, Math.floor(Number(lines) || 0)));
        if (!n) return;
        this.mpState.pendingGarbage = Math.min(this.MAX_GARBAGE * 2, this.mpState.pendingGarbage + n);
        SFX.play('logjam', 0.3);
    },

    insertGarbage() {
        if (!this.mpState || this.mpState.pendingGarbage <= 0) return;
        const count = this.mpState.pendingGarbage;
        this.mpState.pendingGarbage = 0;
        if (this.board.slice(0, count).some(row => row.some(Boolean))) {
            this._endGame('Garbage top out');
            return;
        }
        this._boardVersion++;
        this.clearFx = null; this.fuseFx = null;

        // ONE hole column per batch (standard): a per-row random hole made 2+ rows of garbage
        // effectively undiggable. Local Math.random on purpose — the shared match RNG (_rng)
        // must only be consumed by the piece bag so both clients stay in lockstep.
        const gap = Math.floor(Math.random() * this.COLS);
        for (let i = 0; i < count; i++) {
            // Remove top row
            this.board.shift();
            // Add garbage row at bottom
            const garbageRow = Array(this.COLS).fill(null).map(() => ({
                kind: 'fragment', pieceId: null, pieceType: null, squareId: null, material: null, color: '#888888'
            }));
            garbageRow[gap] = null;
            this.board.push(garbageRow);
        }

        this._computeHints();
        this.draw();
    },

    opponentKO(finalScore, roomId) {
        if (!this.mpState) return;
        if (roomId && roomId !== this.mpState.roomId) return;   // SB-4: stale cross-game KO
        this.mpState.lastOpponentMs = Date.now();   // MP-5: opponent is alive
        const ms = this.mpState;
        if (ms.seriesOver) return;
        // A KO from the PREVIOUS round can only arrive right after we advanced, before the peer's
        // first state packet of the new round. Nobody tops out 700ms into a fresh board.
        if (this.state === 'running' && (ms.gameNumber || 1) > 1 && !ms.oppSeenThisRound && (Date.now() - ms.roundStartedAt) < 700) return;
        const opponentName = ms.opponent || 'Opponent';
        const theirScore = Math.max(0, Number(finalScore) || 0);
        if (this.state === 'gameover' && !ms.gameScored && !ms._forfeit) {
            // Both topped out in the same instant (the two game_over messages crossed). Decide it the
            // same way on both screens: higher score wins, the server-minted 'left' side breaks a tie.
            // Both cards used to say YOU WIN while both tallies counted a loss → 'bet refunded'.
            const iWin = this.score > theirScore || (this.score === theirScore && ms.side === 'left');
            ms._wonThisGame = iWin;
            ms.gameOverAt = 0;   // decided — score it on the next frame
            SFX.play(iWin ? 'koWin' : 'monkey', 0.7);
            this.flash(iWin ? `YOU WIN! Both topped out \u2014 you led ${this.score} to ${theirScore}`
                            : `Both topped out \u2014 ${opponentName} led ${theirScore} to ${this.score}`);
            this.updateHud();
            this.draw();
            return;
        }
        if (this.state === 'gameover' && ms.gameScored) return;   // my loss is already counted; don't rewrite the card
        ms._wonThisGame = true;   // I won this game of the series
        SFX.play('koWin', 0.7);
        this.state = 'gameover';
        this.clearFx = null; this.fuseFx = null;
        this.flash(`YOU WIN! You: ${this.score} | ${opponentName}: ${theirScore}`);
        this.updateHud();
        this.draw();
    },

    opponentLeft(reason, roomId) {
        if (!this.mpState) return;
        if (roomId && roomId !== this.mpState.roomId) return;
        const ms = this.mpState;
        clearInterval(this.countdownTimer); this.countdownTimer = null;
        clearTimeout(ms._stakeTimer); ms._stakeTimer = null;
        // Series already decided: a late leave (the winner pressing Esc) must not replay the win
        // jingle or rewrite the loser's card into 'Bob disconnected'.
        if (ms.seriesOver) return;
        ms._wonThisGame = true;
        ms._forfeit = true;
        // Forfeit ends the series NOW (don't wait for / let the auto-advance fire a ghost game, and
        // don't let a prior game's gameScored guard swallow this). I win by forfeit; the opponent is
        // gone and won't confirm → the bet refunds via the server sweep (accepted rage-quit-voids).
        if (!ms.seriesOver) {
            clearTimeout(ms._advanceTimer);
            ms.myWins = Math.max((ms.myWins || 0), (ms.oppWins || 0) + 1);   // ensure I'm the reported winner
            ms.gameScored = true;
            ms.seriesOver = true;
            this._studyBreakResolveStakes();
        }
        SFX.play('koWin', 0.7);
        this.state = 'gameover';
        this.clearFx = null; this.fuseFx = null;
        const opponentName = this.mpState.opponent || 'Opponent';
        const myScore = this.score;
        const theirScore = this.mpState.opponentScore || 0;
        if (reason === 'quit') {
            this.flash(`Opponent fled! You win! You: ${myScore} | ${opponentName}: ${theirScore}`);
        } else {
            this.flash(`${opponentName} disconnected. You: ${myScore} | ${opponentName}: ${theirScore}`);
        }
        this.updateHud();
        this.draw();
    },

    // ── STUDY BREAK STAKES (STUDY_BREAK_STAKES_SPEC Phase 2) ────────────────────
    // Escrow 1 candy for the match. Both clients POST /wallet/bet/open with the SAME
    // server-minted roomId → the server escrows once both join. Fully GRACEFUL: a guest /
    // stakes-off / pre-migration / insufficient response just leaves the match unstaked (free).
    _studyBreakArmStakes(attempt = 0) {
        const ms = this.mpState;
        if (!ms || !ms.roomId || !ms.opponent || typeof _dogeWalletAction !== 'function') return;
        if (ms._opening) return ms._opening;
        ms._opening = _dogeWalletAction('/wallet/bet/open', { matchId: ms.roomId, opponentUsername: ms.opponent }).then((res) => {
            if (this.mpState !== ms) return;
            ms.staked = !!(res && res.ok && (res.status === 'opened' || res.status === 'open'));
            ms.stakePending = !!(res && res.ok && res.status === 'waiting');
            if (ms.stakePending && !ms.seriesOver && attempt < 5) {
                ms._stakeTimer = setTimeout(() => {
                    ms._stakeTimer = null;
                    if (this.mpState === ms && !ms.seriesOver) this._studyBreakArmStakes(attempt + 1);
                }, [2000, 5000, 10000, 20000, 40000][attempt]);
            }
            this.draw();
        }).catch(() => {}).finally(() => { ms._opening = null; });
        return ms._opening;
    },
    // Count THIS game's outcome exactly once (guarded), then either end the series + resolve the
    // candy, or auto-advance to the next game. Called from drawGameOverCard (the single 1v1
    // game-over choke point). _wonThisGame is set by opponentKO/opponentLeft; default = I topped out.
    _studyBreakScoreGameOnce() {
        const ms = this.mpState;
        if (this.mode !== '1v1' || !ms || ms.gameScored || ms.seriesOver) return;
        if (this.state !== 'gameover') return;
        // A self top-out waits 1500ms for a crossing opponent KO before it counts (opponentKO then
        // decides a simultaneous top-out deterministically). Fixtures without gameOverAt count at once.
        if (!ms._wonThisGame && !ms._forfeit && ms.gameOverAt && (Date.now() - ms.gameOverAt) < 1500) return;
        ms.gameScored = true;
        if (ms._wonThisGame) ms.myWins = (ms.myWins || 0) + 1; else ms.oppWins = (ms.oppWins || 0) + 1;
        // ONE game decides the match (teacher 2026-09-28: best-of-3 was beyond most people's patience).
        // The series machinery (wins, gameNumber, escrow-per-roomId) is kept; only the finish line moved.
        const winsToTake = this.WINS_TO_TAKE || 1;
        if (ms.myWins >= winsToTake || ms.oppWins >= winsToTake || ms._forfeit) {
            ms.seriesOver = true;
            this._studyBreakResolveStakes();
            if (typeof this.updateHud === 'function') this.updateHud();   // help line: 'R = rematch · Esc = exit'
        } else {
            // series continues → auto-advance both clients to the next game (each detects its own
            // game-end ~simultaneously). R/Enter still advances immediately; Esc exits (forfeit).
            clearTimeout(ms._advanceTimer);
            ms._advanceTimer = setTimeout(() => {
                if (this.isOpen() && this.mpState === ms && !ms.seriesOver && this.state === 'gameover') this.startNewGame();
            }, 3000);
        }
    },
    // Report the series winner to the server (both players → settle on agreement, refund on
    // disagreement/timeout — the server has no game truth). Shows the candy outcome on the card.
    _studyBreakResolveStakes() {
        const ms = this.mpState;
        if (!ms || ms._resolved) return;
        if (!this._pendingSettlements) this._pendingSettlements = Object.create(null);
        if (this._pendingSettlements[ms.roomId]) return;
        if (typeof _dogeWalletAction !== 'function') return;
        const pending = { startedAt: Date.now(), attempt: 0, timer: null };
        this._pendingSettlements[ms.roomId] = pending;
        clearTimeout(ms._advanceTimer);
        const iWon = (ms.myWins || 0) > (ms.oppWins || 0);
        const winnerUsername = iWon ? (this.mpUsername || '') : ms.opponent;
        // Gold lines per player (TETRIS_SQUARES_SPEC §3): mine counted by lockPiece, the opponent's
        // witnessed from their board snapshots. HTTP body only; no relay message changes.
        const goldClears = {};
        if (this.mpUsername) goldClears[this.mpUsername] = ms.myGoldClears || 0;
        if (ms.opponent) goldClears[ms.opponent] = ms.oppGoldClears || 0;
        const body = { matchId: ms.roomId, winnerUsername, goldClears };
        ms.candyOutcome = 'pending';
        this.draw();
        // These room-scoped retries intentionally survive close() and rematches (a financial
        // report outlives the window it was made in).
        const settle = async () => {
            pending.timer = null;
            // A slow bet/open must not block the report forever: wait at most 10s for it.
            if (ms._opening) await Promise.race([ms._opening.catch(() => {}), new Promise((r) => setTimeout(r, 10000))]);
            let res;
            try { res = await _dogeWalletAction('/wallet/bet/resolve', body); } catch (_) {}
            // Terminal = the server settled/refunded, or told us definitively there is nothing to
            // settle. Everything else (network, 'Database error', 5xx, pending) is retried — a wrong
            // 'refunded' label on a transient failure would lie to the student.
            const PERMANENT = ['no such match', 'unknown winner', 'winner must be a player', 'matchId + winnerUsername required', 'stakes disabled', 'not a player in this match'];
            const permanent = !!(res && res.ok === false && PERMANENT.includes(String(res.error)));
            const terminal = !!(res && ((res.ok && (res.status === 'settled' || res.status === 'refunded')) || permanent));
            if (terminal) {
                ms._resolved = true;
                // A paid gold premium moves a second candy (the server says so: premiumPaid).
                const moved = res.ok && res.premiumPaid ? 2 : 1;
                ms.candyOutcome = !res.ok ? 'none' : (res.status === 'settled' ? (iWon ? '+' : '-') + moved : 'refunded');
                clearTimeout(pending.timer); pending.timer = null;
                delete this._pendingSettlements[ms.roomId];
                if (this.mpState === ms) this.draw();
                if (typeof _candyRefreshWalletUI === 'function') _candyRefreshWalletUI();
                return;
            }
            // Keep trying while this tab lives (every 15s after the first minute): an honest winner
            // must not lose the pot to a long outage. The server sweep is the last-resort refund.
            const delay = [1000, 2000, 4000, 8000, 15000][Math.min(pending.attempt++, 4)];
            pending.timer = setTimeout(settle, delay);
        };
        return settle();
    },
    // Casino Stats lab (D4): the student's Tetris-betting record + expected value per game — the
    // probability lesson. Fetched into the lobby line when the lobby opens. Graceful for guests.
    _studyBreakCasinoLine() {
        const el = document.getElementById('lobby-casino');
        if (!el || typeof _dogeWalletBase !== 'function') return;
        const c = _dogeWalletBase();
        if (!c) return;   // guest / signed out → keep the static hint
        fetch(c.base + '/wallet/casino', { headers: { 'Authorization': 'Bearer ' + c.token } })
            .then((r) => (r.ok ? r.json() : null)).then((j) => {
                if (!j || !j.ok || !(j.games > 0)) return;   // no record yet → keep the static hint
                const ev = j.netCandy / j.games;
                const sgn = (n) => (n >= 0 ? '+' : '');
                el.textContent = `Your record: ${j.wins || 0}W–${j.losses || 0}L · ${sgn(j.netCandy)}${j.netCandy} 🍬 · EV ${sgn(ev)}${ev.toFixed(2)}/match`;
            }).catch(() => {});
    },

    togglePause() {
        if (!this.isOpen()) return;
        // No pausing inside a 1v1 match: a paused player froze the opponent's match indefinitely
        // (the heartbeat kept stamping "alive", so the freeze watchdog never fired). Solo pauses.
        if (this._inLiveMatch()) return;
        this._acc = 0;
        if (this.state === 'running') {
            this.state = 'paused';
            this.clearKeys();
        } else if (this.state === 'paused') {
            this.state = 'running';
            this.lastTime = 0;
            this.fallTimer = 0;   // no instant drop/lock on the first frame back
            this.lockTimer = 0;
            this.clearKeys();
            this.canvas.focus();
        }
        this.updateHud();
    },

    update(delta, now) {
        this.tick = (this.tick || 0) + 1;   // one per fixed 16.67 ms step (TETRIS_SQUARES_SPEC slab sheen)
        if (!this.active) {
            this.spawnTimer -= delta;
            if (this.spawnTimer <= 0) this.spawnNext();
            return;
        }

        this.handleAutoShift(now);

        const gravity = this.keys.down.down ? this.softDropInterval() : this.gravityInterval();
        this.fallTimer += delta;
        while (this.fallTimer >= gravity) {
            if (!this.tryMove(0, 1)) {
                this.fallTimer = 0;
                break;
            }
            this.fallTimer -= gravity;
        }

        if (this.isGrounded(this.active)) {
            this.lockTimer += delta;
            if (this.lockTimer >= this.LOCK_DELAY) this.lockPiece();
        } else if (this.lockResets < this.LOCK_RESET_CAP) {
            this.lockTimer = 0;
        }
    },

    // Geometric curve (L1 920ms → L5 ≈416 → L9 ≈188 → floor 90 from L13), a level every 6 lines. The
    // old linear −65ms/level over 10 lines meant a normal 20-40 line break never left 920-660ms.
    gravityInterval() {
        return Math.max(90, Math.round(920 * Math.pow(0.82, this.level - 1)));
    },

    // Soft drop stays meaningfully faster than gravity at every level: the fixed 80ms was barely
    // quicker than the 90ms gravity floor from level 14 on.
    softDropInterval() {
        return Math.min(this.SOFT_DROP_INTERVAL, Math.max(20, Math.round(this.gravityInterval() / 4)));
    },

    // Piece randomness. Solo uses Math.random. A 1v1 match seeds a small PRNG from the
    // server-minted roomId (shared by both clients, per game of the series) so BOTH players get
    // the SAME piece sequence and starting hold — luck of the bag no longer decides a candy bet.
    _rand: null,
    _rng() {
        return this._rand ? this._rand() : Math.random();
    },
    _seedRng(seedText) {
        // FNV-1a string hash → mulberry32.
        let h = 0x811c9dc5;
        const s = String(seedText);
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
        let a = h >>> 0;
        this._rand = () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    },

    randomType() {
        return this.types[Math.floor(this._rng() * this.types.length)];
    },

    refillBag() {
        const fresh = [];
        for (let i = 0; i < 9; i++) {
            for (const type of this.types) fresh.push(type);
        }
        for (let i = fresh.length - 1; i > 0; i--) {
            const j = Math.floor(this._rng() * (i + 1));
            [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
        }
        this.bag = this.bag.concat(fresh);
    },

    nextFromBag() {
        if (!this.bag.length) this.refillBag();
        // Drought guard: a type unseen for 14+ pieces jumps the queue. Pure bag reordering, so both
        // 1v1 clients (same seed, same ops) stay in lockstep; cuts P(drought ≥ 25) from ~70% to ~5%.
        if (this._since) {
            for (const t of this.types) {
                if (this._since[t] >= 14) {
                    const i = this.bag.lastIndexOf(t);   // pop() takes from the END
                    if (i < 0) continue;
                    if (i !== this.bag.length - 1) { this.bag.splice(i, 1); this.bag.push(t); }
                    break;
                }
            }
        }
        const type = this.bag.pop();
        if (!this._since) this._since = {};
        for (const t of this.types) this._since[t] = (this._since[t] || 0) + 1;
        this._since[type] = 0;
        return type;
    },

    fillQueueTo(n) {
        while (this.queue.length < n) this.queue.push(this.nextFromBag());
    },

    createPiece(type) {
        return {
            type,
            rot: 0,
            x: 3,
            y: this.SPAWN_Y,
            id: this.nextPieceId++
        };
    },

    spawnNext() {
        this.fillQueueTo(3);
        const type = this.queue.shift();
        this.fillQueueTo(3);
        const piece = this.createPiece(type);
        if (!this.isValid(piece)) {
            this.active = null;
            this._endGame('Stack jammed');
            this.updateHud();
            return;
        }
        this.active = piece;
        this.holdLocked = false;
        this.fallTimer = 0;
        this.lockTimer = 0;
        this.lockResets = 0;   // SB-1(core): fresh lock-reset budget for the new piece
        this.pieceCounts[type] = (this.pieceCounts[type] || 0) + 1;   // solo game-over histogram
        const buffered = this._buffered; this._buffered = null;
        if (buffered) {
            if (buffered.hold) this.holdSwap();
            if (buffered.rotate && this.active && this.isValid(this.active)) this.tryRotate(buffered.rotate);
        }
        this._mpDirty = true;
        this.updateHud();
    },

    // SB-1(core): cap how many times a move/rotate can reset the lock delay WHILE GROUNDED,
    // so spinning a grounded piece forever can't stall the game. Airborne frames keep that budget.
    _resetLockTimer() {
        if (this.active && this.isGrounded(this.active)) {
            if (this.lockResets < this.LOCK_RESET_CAP) { this.lockTimer = 0; this.lockResets++; }
        } else if (this.lockResets < this.LOCK_RESET_CAP) {
            this.lockTimer = 0;
        }
    },

    getCells(piece, rot = piece.rot, x = piece.x, y = piece.y) {
        return this.pieces[piece.type][rot].map(([cx, cy]) => ({ x: x + cx, y: y + cy }));
    },

    isValid(piece, dx = 0, dy = 0, rot = piece.rot) {
        for (const cell of this.getCells(piece, rot, piece.x + dx, piece.y + dy)) {
            if (cell.x < 0 || cell.x >= this.COLS) return false;
            if (cell.y < 0 || cell.y >= this.TOTAL_ROWS) return false;
            if (this.board[cell.y][cell.x]) return false;
        }
        return true;
    },

    isGrounded(piece) {
        return !this.isValid(piece, 0, 1);
    },

    tryMove(dx, dy) {
        if (!this.active || !this.isValid(this.active, dx, dy)) return false;
        this.active.x += dx;
        this.active.y += dy;
        this._resetLockTimer();
        this._mpDirty = true;
        this.updateHud();
        return true;
    },

    tryRotate(dir) {
        if (!this.active) return false;
        const nextRot = (this.active.rot + dir + 4) % 4;
        // Kick order: neutral, sideways (rotation-direction first), floor kick (up), then the
        // 2-wide wall/floor kicks only the I piece needs. The old table tried DOWN second, which
        // could sink a piece a row on rotate — surprising, and never what a wall/floor collision needs.
        const wide = this.active.type === 'I' ? [[2,0],[-2,0],[0,-2]] : [];
        const kicks = dir === 1
            ? [[0,0],[1,0],[-1,0],[0,-1]].concat(wide)    // CW: neutral, right, left, up
            : [[0,0],[-1,0],[1,0],[0,-1]].concat(wide);   // CCW: neutral, left, right, up
        for (const [dx, dy] of kicks) {
            if (this.isValid(this.active, dx, dy, nextRot)) {
                this.active.rot = nextRot;
                this.active.x += dx;
                this.active.y += dy;
                this._resetLockTimer();
                this._mpDirty = true;
                this.updateHud();
                return true;
            }
        }
        return false;
    },

    holdSwap() {
        if (!this.active || this.holdLocked) return;
        SFX.play('moof', 0.3);
        const current = this.active.type;
        const swap = this.hold;
        this.hold = current;
        if (swap) {
            const replacement = this.createPiece(swap);
            if (!this.isValid(replacement)) {
                this.active = null;
                this._endGame('Hold jammed the stack');
                this.updateHud();
                return;
            }
            this.active = replacement;
        } else {
            this.spawnNext();
        }
        this.holdLocked = true;
        this.lockResets = 0;
        this.lockTimer = 0;
        this.fallTimer = 0;
        this._mpDirty = true;
        this.updateHud();
    },

    getGhostY() {
        if (!this.active) return 0;
        let y = this.active.y;
        while (this.isValid(this.active, 0, y - this.active.y + 1)) y++;
        return y;
    },

    firmDrop() {
        if (!this.active) return;
        const target = this.getGhostY();
        // Already down: the second tap locks (a natural double-tap hard drop). It used to zero the
        // lock timer every press, so tapping Up faster than 500ms stalled a piece forever.
        if (target === this.active.y) { this.lockPiece(); return; }
        this.active.y = target;
        this.fallTimer = 0;
        this.lockTimer = 0;
        this._mpDirty = true;
        this.updateHud();
    },

    // Space: hard drop — straight down AND lock. (Up stays a firm drop: down without locking,
    // so a piece can still be slid into a square after it lands.)
    hardDrop() {
        if (!this.active) return;
        this.active.y = this.getGhostY();
        this.lockPiece();
    },

    handleAutoShift(now) {
        if (!this.active) return;
        const L = this.keys.left, R = this.keys.right;
        // Both arrows held: the LAST one pressed wins (overlapping presses used to freeze the piece).
        const dir = (L.down && R.down) ? this.keys.lastDir : (L.down ? 'left' : (R.down ? 'right' : null));
        if (!dir) return;
        const k = dir === 'left' ? L : R;
        // Discard excessive backlog after suspension; ordinary frames retain the remainder.
        if (now - k.next >= this.DAS_REPEAT * 3) k.next = now;
        for (let repeats = 0; repeats < 3 && now >= k.next; repeats++) {
            this.tryMove(dir === 'left' ? -1 : 1, 0);
            k.next += this.DAS_REPEAT;
        }
    },

    lockPiece() {
        if (!this.active) return;
        const piece = this.active;
        let toppedOut = false;
        let leveledUp = false;
        for (const cell of this.getCells(piece)) {
            if (cell.y < this.HIDDEN_ROWS) toppedOut = true;
            this.board[cell.y][cell.x] = {
                kind: 'piece',
                pieceId: piece.id,
                pieceType: piece.type,
                squareId: null,
                material: null,
                color: this.colors[piece.type]
            };
        }

        const firstSquares = this.detectSquares();
        // Snapshot the full rows BEFORE they collapse: the clear is shown as a 120ms white flash over
        // the old board instead of rows vanishing in the same frame the piece locks.
        const fullRows = [];
        for (let y = 0; y < this.TOTAL_ROWS; y++) if (this.board[y].every(Boolean)) fullRows.push(y);
        const snapshot = fullRows.length ? this.board.map((row) => row.slice()) : null;
        const clear = this.clearLines();
        const secondSquares = clear.lines ? this.detectSquares() : { gold: 0, silver: 0 };
        this._boardVersion++;
        let perfect = false;

        if (clear.lines) {
            // squareRows: the cleared rows that held slab cells (a square clear) flash fully white.
            const squareRows = fullRows.filter((y) => snapshot[y].some((c) => c && c.kind === 'square'));
            this.clearFx = { board: snapshot, rows: fullRows, squareRows, timer: 120 };
            this.lines += clear.lines;
            this.score += clear.points * this.level;   // 100 / 500 / 1000 per line × the level it was cleared at
            // Gold lines this game: the stakes' gold premium report (TETRIS_SQUARES_SPEC §3).
            if (this.mpState && clear.goldStrips) this.mpState.myGoldClears = (this.mpState.myGoldClears || 0) + clear.goldStrips;
            perfect = this.board.every((row) => row.every((c) => !c));   // empty well after the clear
            if (perfect) this.score += 10;
            const prevLevel = this.level;
            this.level = 1 + Math.floor(this.lines / this.LINES_PER_LEVEL);
            if (this.level > prevLevel) {
                leveledUp = true;
                clearTimeout(this._levelUpTimer);
                this._levelUpTimer = setTimeout(() => {
                    this._levelUpTimer = null;
                    SFX.play('indigo', 0.7);
                }, 350);
            }
        }

        // Send garbage to opponent in 1v1 mode. Squares matter here too: each gold line adds 2 rows,
        // each silver line 1 (TETRIS_SQUARES_SPEC §2; capped at MAX_GARBAGE, the receive side clamps
        // the same). Same game_garbage message, only the value grows.
        let sentGarbage = 0;
        if (this.mode === '1v1' && this.mpState && clear.lines > 0) {
            const garbageTable = { 1: 0, 2: 1, 3: 2, 4: 4 };
            const garbageToSend = Math.min(this.MAX_GARBAGE, (garbageTable[clear.lines] || 0) + (clear.goldStrips || 0) * 2 + (clear.silverStrips || 0));
            // Cancel pending incoming garbage first
            if (this.mpState.pendingGarbage > 0 && garbageToSend > 0) {
                const canceled = Math.min(this.mpState.pendingGarbage, garbageToSend);
                this.mpState.pendingGarbage -= canceled;
                const netGarbage = garbageToSend - canceled;
                if (netGarbage > 0) {
                    this.sendGameMessage({ type: 'game_garbage', lines: netGarbage });
                    sentGarbage = netGarbage;
                }
            } else if (garbageToSend > 0) {
                this.sendGameMessage({ type: 'game_garbage', lines: garbageToSend });
                sentGarbage = garbageToSend;
            }
        }

        const totalGold = firstSquares.gold + secondSquares.gold;
        const totalSilver = firstSquares.silver + secondSquares.silver;
        // One cue per lock: the plain 'droplet' only when nothing else happened (no four-deep stack of
        // oscillators on a gold tetris); otherwise the fuse bell and/or the clear cue below
        // (TETRIS_SQUARES_SPEC §4: the gold bell when any gold fused, else the silver bell).
        if (totalGold) SFX.play('fuseGold', 0.7);
        else if (totalSilver) SFX.play('fuseSilver', 0.6);
        else if (!clear.lines) SFX.play('droplet', 0.3);

        const messages = [];
        if (totalGold) messages.push(totalGold === 1 ? 'Gold square!' : `${totalGold} gold squares!`);
        if (totalSilver) messages.push(totalSilver === 1 ? 'Silver square!' : `${totalSilver} silver squares!`);
        if (clear.lines) {
            messages.push(clear.lines === 4 ? 'TETRIS' : `${clear.lines} line${clear.lines > 1 ? 's' : ''}`);
            if (clear.goldStrips) messages.push(clear.goldStrips === 1 ? 'gold line ×1000' : `${clear.goldStrips} gold lines ×1000`);
            if (clear.silverStrips) messages.push(clear.silverStrips === 1 ? 'silver line ×500' : `${clear.silverStrips} silver lines ×500`);
        }
        if (perfect) messages.push('PERFECT CLEAR +10');
        if (sentGarbage) messages.push(`+${sentGarbage} garbage sent`);
        if (leveledUp) messages.push(`LEVEL ${this.level}`);
        if (messages.length) this.flash(messages.join(' • '));
        if (totalGold || totalSilver) this._announce(messages.join(', '));
        if (clear.lines === 4) SFX.play('wildEep', 0.8);
        else if (clear.lines === 3) SFX.play('quack', 0.7);
        else if (clear.lines === 2) SFX.play('sosumi', 0.6);
        else if (clear.lines === 1) SFX.play('boing', 0.5);
        // A square clear: the line-clear cue above, then (60 ms later, inside the sound) the rising chime.
        if (clear.goldStrips) SFX.play('squareChimeGold', 0.6);
        else if (clear.silverStrips) SFX.play('squareChimeSilver', 0.6);

        this.active = null;
        this.spawnTimer = this.ENTRY_DELAY + (this.clearFx ? 120 : 0);   // let the clear flash play
        this.fallTimer = 0;
        this.lockTimer = 0;
        this._mpDirty = true;

        if (toppedOut) {
            this._endGame('Top out');
        } else if (this._inLiveMatch() && this.mpState.pendingGarbage > 0 && !clear.lines) {
            // Queued garbage lands now — after a lock that cleared nothing (versus rules).
            this.insertGarbage();
        }
        this._computeHints();
        if (this.mode === '1v1') this.sendGameState();
        this.updateHud();
    },

    // TETRIS_SQUARES_SPEC §1. A 4x4 region fuses when its 16 cells are exactly four WHOLE pieces
    // (every cell a locked piece cell with a pieceId; four distinct pieces, each with all four of
    // its cells inside the region). Fused-square cells and garbage / fragment cells never qualify.
    // One pass, top row first then left column first: when candidate regions overlap, the
    // top-left one fuses and the overlapping one no longer qualifies (its cells are now slab).
    // Material: gold when all four pieces are the same shape, else silver.
    detectSquares() {
        let formedGold = 0;
        let formedSilver = 0;
        const fused = [];
        for (let y = this.HIDDEN_ROWS; y <= this.TOTAL_ROWS - 4; y++) {
            for (let x = 0; x <= this.COLS - 4; x++) {
                const region = this._wholePieceRegion(x, y);
                if (!region) continue;
                const material = new Set(region.map((cell) => cell.pieceType)).size === 1 ? 'gold' : 'silver';
                const squareId = this.nextSquareId++;
                if (!this._slabBornAt) this._slabBornAt = {};
                this._slabBornAt[squareId] = this.tick || 0;
                const color = material === 'gold' ? this.colors.gold : this.colors.silver;
                for (const cell of region) {
                    this.board[cell.y][cell.x] = {
                        kind: 'square',
                        pieceId: null,
                        pieceType: null,
                        squareId,
                        material,
                        color
                    };
                }
                fused.push(squareId);
                if (material === 'gold') {
                    formedGold++;
                    this.goldCount++;
                } else {
                    formedSilver++;
                    this.silverCount++;
                }
            }
        }
        // The fuse flash: 250 ms over each new slab, found by squareId so it follows the slab when a
        // clear in the same lock moves it (see draw()).
        if (fused.length) {
            const live = this.fuseFx && this.fuseFx.timer > 0 ? this.fuseFx.squareIds : [];
            this.fuseFx = { squareIds: live.concat(fused), timer: 250 };
        }
        return { gold: formedGold, silver: formedSilver };
    },

    // The region's 16 cells when they are exactly four whole locked pieces, else null.
    _wholePieceRegion(x, y) {
        const region = [];
        const counts = new Map();
        for (let dy = 0; dy < 4; dy++) {
            for (let dx = 0; dx < 4; dx++) {
                const cell = this.board[y + dy][x + dx];
                if (!cell || cell.kind !== 'piece' || cell.pieceId == null) return null;
                region.push({ x: x + dx, y: y + dy, pieceId: cell.pieceId, pieceType: cell.pieceType });
                counts.set(cell.pieceId, (counts.get(cell.pieceId) || 0) + 1);
            }
        }
        if (counts.size !== 4) return null;
        for (const n of counts.values()) if (n !== 4) return null;
        return region;
    },

    // ── Square hint: 4x4 regions that are ONE piece drop away from a square ──────────────
    // Recomputed on every lock (and garbage insert), never per frame. A region qualifies when its
    // 16 cells are exactly 3 whole pieces (12 cells) + a 4-cell hole that one piece can drop
    // into: the hole is 4-connected (every connected 4-cell hole is one of the 7 tetrominoes),
    // nothing sits above it inside the region, and the columns above it are clear to the top of
    // the well. Gold outline when the three pieces share a type, silver otherwise. This is the
    // one in-game demonstration of what "build a 4x4 square" means.
    _hints: [],
    _computeHints() {
        const hints = [];
        for (let y = this.HIDDEN_ROWS; y <= this.TOTAL_ROWS - 4; y++) {
            for (let x = 0; x <= this.COLS - 4; x++) {
                const hint = this._hintAt(x, y);
                if (hint) hints.push(hint);
            }
        }
        this._hints = hints;
    },
    _hintAt(x, y) {
        const counts = new Map();
        const types = new Set();
        const holes = [];
        for (let dy = 0; dy < 4; dy++) {
            for (let dx = 0; dx < 4; dx++) {
                const cell = this.board[y + dy][x + dx];
                if (!cell) { holes.push({ x: x + dx, y: y + dy }); continue; }
                if (cell.kind !== 'piece' || cell.pieceId == null) return null;
                counts.set(cell.pieceId, (counts.get(cell.pieceId) || 0) + 1);
                types.add(cell.pieceType);
            }
        }
        if (holes.length !== 4 || counts.size !== 3) return null;
        for (const n of counts.values()) if (n !== 4) return null;
        const holeKeys = new Set(holes.map((h) => h.x + ',' + h.y));
        // The hole must be open from above: every cell above each hole cell (inside the region
        // and on up the well) is empty. A hole cell under another hole cell is fine.
        for (const h of holes) {
            for (let yy = h.y - 1; yy >= 0; yy--) {
                if (holeKeys.has(h.x + ',' + yy)) continue;
                if (this.board[yy][h.x]) return null;
            }
        }
        // 4-connected hole → exactly one tetromino shape fills it.
        const seen = new Set([holes[0].x + ',' + holes[0].y]);
        const stack = [holes[0]];
        while (stack.length) {
            const c = stack.pop();
            for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                const k = (c.x + dx) + ',' + (c.y + dy);
                if (holeKeys.has(k) && !seen.has(k)) { seen.add(k); stack.push({ x: c.x + dx, y: c.y + dy }); }
            }
        }
        if (seen.size !== 4) return null;
        const supported = holes.some(h => h.y + 1 === this.TOTAL_ROWS ||
            (!holeKeys.has(h.x + ',' + (h.y + 1)) && this.board[h.y + 1][h.x]));
        if (!supported) return null;
        return { x, y, material: types.size === 1 ? 'gold' : 'silver' };
    },
    drawHints() {
        if (!this._hints || !this._hints.length || this.state !== 'running') return;
        const ctx = this.ctx;
        ctx.save();
        ctx.setLineDash([3, 2]);
        ctx.lineWidth = 1;
        for (const h of this._hints) {
            const pos = this.boardToPixel(h.x, h.y);
            const size = 4 * this.CELL;
            ctx.strokeStyle = h.material === 'gold' ? '#c9a227' : '#8a8a8a';
            ctx.strokeRect(pos.x + 1.5, pos.y + 1.5, size - 3, size - 3);
        }
        ctx.restore();
    },

    clearLines() {
        const fullRows = [];
        for (let y = 0; y < this.TOTAL_ROWS; y++) {
            if (this.board[y].every(Boolean)) fullRows.push(y);
        }
        if (!fullRows.length) return { lines: 0, points: 0, goldStrips: 0, silverStrips: 0 };

        // TETRIS_SQUARES_SPEC §1: each cleared row pays by the best slab material in it — plain
        // line 100, silver line 500, gold line 1000 (lockPiece multiplies by the level). A row that
        // holds any slab cell is a square clear; goldStrips / silverStrips count gold / silver LINES
        // (a row through two gold squares is one gold line). The REST of the square stays a square
        // (a 4x3, then 4x2, then 4x1 remainder — rows only ever leave whole), so every later row
        // through it pays again. (Squares stopped shattering: teacher decision 2026-09-09.)
        const LINE_POINTS = { plain: 100, silver: 500, gold: 1000 };
        let points = 0;
        let goldStrips = 0;
        let silverStrips = 0;
        for (const y of fullRows) {
            let material = 'plain';
            for (const cell of this.board[y]) {
                if (!cell || cell.kind !== 'square' || cell.squareId == null) continue;
                if (cell.material === 'gold') material = 'gold';
                else if (material === 'plain') material = 'silver';
            }
            points += LINE_POINTS[material];
            if (material === 'gold') goldStrips++;
            else if (material === 'silver') silverStrips++;
        }

        const survivors = this.board.filter((_, index) => !fullRows.includes(index));
        while (survivors.length < this.TOTAL_ROWS) survivors.unshift(Array(this.COLS).fill(null));
        this.board = survivors;

        // A cut PIECE (fewer than its 4 cells left) becomes an X fragment: it can never be part of a
        // whole-piece square again. Squares themselves are never fragmented (see above).
        const counts = {};
        for (let y = 0; y < this.TOTAL_ROWS; y++) {
            for (let x = 0; x < this.COLS; x++) {
                const cell = this.board[y][x];
                if (cell && cell.kind === 'piece' && cell.pieceId != null) {
                    counts[cell.pieceId] = (counts[cell.pieceId] || 0) + 1;
                }
            }
        }
        for (let y = 0; y < this.TOTAL_ROWS; y++) {
            for (let x = 0; x < this.COLS; x++) {
                const cell = this.board[y][x];
                if (cell && cell.kind === 'piece' && counts[cell.pieceId] !== 4) {
                    this.board[y][x] = {
                        kind: 'fragment',
                        pieceId: null,
                        pieceType: null,
                        squareId: null,
                        material: null,
                        color: cell.color
                    };
                }
            }
        }

        return { lines: fullRows.length, points, goldStrips, silverStrips };
    },

    flash(message) {
        this.flashText = message;
        this.flashTimer = 1800;
        this.updateHud();
    },

    updateHud() {
        if (!this.scoreEl || !this.helpEl) return;
        this.scoreEl.textContent = `Score ${this.score} | Lines ${this.lines} | Level ${this.level} | Gold ${this.goldCount} | Silver ${this.silverCount}`;
        const ms = this.mpState;
        const live = this._inLiveMatch();
        const opp = live ? String(ms.opponent || 'opponent').slice(0, 12) : '';
        let prefix = '';
        if (this.state === 'idle') prefix = 'Enter or click to start • Fit 4 whole pieces into a 4×4: same shape = gold, mixed = silver';
        else if (this.state === 'paused') prefix = 'Paused • P, Enter, or click the board to resume • R = new game';
        else if (this.state === 'gameover') {
            if (live && ms.seriesOver) prefix = `${this.flashText || 'Series over'} • R = rematch • Esc = exit`;
            else if (live) prefix = `${this.flashText || 'Game over'} • next game in 3s • R to skip`;
            else prefix = `Game over • Final score ${this.score} • Enter, R, or click to play again`;
        }
        else if (live) prefix = this.flashText || `vs ${opp} • Game ${ms.gameNumber || 1} of 3 • 2→1, 3→2, 4→4 garbage, squares add more • red = incoming`;
        else prefix = this.flashText || 'Marathon mode • A line through gold pays 1000, through silver 500 (× level)';
        if (this._classroomNote) prefix = `${this._classroomNote} • ${prefix}`;
        const legend = live
            ? '←→ move • Z/X rotate • ↓ soft • ↑ firm • Space hard • C/Shift hold • Esc×2 forfeit'
            : '←→ move • Z/X rotate • ↓ soft • ↑ firm • Space hard • C/Shift hold • P pause • M mute';
        this.helpEl.textContent = `${prefix} • ${legend}`;
        // Screen-reader line: state transitions only, never the per-move HUD churn.
        if (this.state === 'running' && this._lastLiveState === 'paused') this._announce('Resumed');
        else if (this.state !== 'running' && (this.state !== this._lastLiveState || prefix !== this._lastLive)) this._announce(prefix);
        this._lastLiveState = this.state;
        this._lastLive = prefix;
    },

    // drawGameOverCard runs every frame; only touch the DOM when the help text actually changes.
    _setHelpText(text) {
        if (this._classroomNote) text = this._classroomNote + ' • ' + text;
        if (!this.helpEl || this._lastHelpText === text) return;
        this._lastHelpText = text;
        this.helpEl.textContent = text;
    },
    _announce(text) {
        const el = document.getElementById('game-live');
        if (el) el.textContent = text;
    },

    boardToPixel(x, y) {
        return {
            x: this.BOARD_X + x * this.CELL,
            y: this.BOARD_Y + (y - this.HIDDEN_ROWS) * this.CELL
        };
    },

    draw(cfg) {
        const c = cfg || this;
        const ctx = c.ctx || this.ctx;
        if (!ctx) return;
        const canvasW = c.CANVAS_W || this.CANVAS_W;
        const canvasH = c.CANVAS_H || this.CANVAS_H;
        ctx.clearRect(0, 0, canvasW, canvasH);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasW, canvasH);

        this.drawBoardWell();

        if (this.mode !== '1v1' || !this.mpState) {
            this.drawPanelBox(12, 14, 116, 78, 'HOLD (C)');
            this.drawPanelBox(12, 102, 116, 78, 'STATUS');
            this.drawPanelBox(12, 190, 116, 96, 'SQUARES');
            this.drawPanelBox(302, 14, 116, 182, 'NEXT');
            this.drawPanelBox(302, 206, 116, 80, 'KEYS');

            if (this.hold) {
                if (this.holdLocked) ctx.globalAlpha = 0.4;   // dimmed while the hold is spent for this piece
                this.drawMiniPiece(this.hold, 22, 36, 96, 42);
                ctx.globalAlpha = 1;
            }
            this._drawBreakClock(ctx);

            ctx.fillStyle = '#000000';
            ctx.font = '10px Geneva, Arial, sans-serif';
            const stats = [
                `LEVEL ${this.level}`,
                `LINES ${this.lines}`,
                `SCORE ${this.score}`,
                `GOLD ${this.goldCount}`,
                `SILVER ${this.silverCount}`
            ];
            stats.forEach((line, idx) => ctx.fillText(line, 22, 122 + idx * 11));

            // The whole-piece rule IS the game — say it.
            ctx.font = '9px Geneva, Arial, sans-serif';
            const squareText = [
                '4 WHOLE pieces in 4\u00d74',
                'same shape = gold',
                'mixed shapes = silver',
                'gold line 1000',
                'silver line 500',
                'X = broken piece'
            ];
            squareText.forEach((line, idx) => ctx.fillText(line, 18, 208 + idx * 12));
            ctx.font = '10px Geneva, Arial, sans-serif';

            this.queue.slice(0, 3).forEach((type, idx) => {
                this.drawPreviewSlot(314, 34 + idx * 50, 92, 40);
                this.drawMiniPiece(type, 318, 38 + idx * 50, 84, 32);
            });

            ctx.font = '9px Geneva, Arial, sans-serif';
            const keyLines = [
                '\u2190\u2192 move   \u2193 soft',
                'Z / X rotate   \u2191 drop',
                'Space = hard drop',
                'C hold  P pause  M mute'
            ];
            keyLines.forEach((line, idx) => ctx.fillText(line, 310, 226 + idx * 13));
            ctx.font = '10px Geneva, Arial, sans-serif';
        } else {
            // In 1v1 mode, show compact stats above the board
            ctx.fillStyle = '#000000';
            ctx.font = '9px Geneva, Arial, sans-serif';
            const ms = this.mpState;
            ctx.fillText(`L${this.level} \u00b7 ${this.lines} ln \u00b7 ${this.score} pts`, this.BOARD_X, 14);
            // My hold + next three in the gutters; series score + the garbage rule under the well.
            this._drawSplitGutters(ctx, this, this.hold, this.queue, this.holdLocked);
            const wellBottom = this.BOARD_Y + this.VISIBLE_ROWS * this.CELL;
            ctx.textAlign = 'center';
            ctx.fillText(`Game ${ms.gameNumber || 1} of 3 \u00b7 you ${ms.myWins || 0}\u2013${ms.oppWins || 0} ${String(ms.opponent || '').slice(0, 10)}${ms.staked ? ' \u00b7 pot 2 \ud83c\udf6c \u00b7 gold \u00d72' : ms.stakePending ? ' \u00b7 pot pending' : ' \u00b7 free'}`, this.CANVAS_W / 2, wellBottom + 16);
            ctx.fillStyle = '#666666';
            ctx.font = '8px Geneva, Arial, sans-serif';
            ctx.fillText('red = incoming garbage \u00b7 clear a line to cancel', this.CANVAS_W / 2, wellBottom + 28);
            ctx.font = '9px Geneva, Arial, sans-serif';
            ctx.fillStyle = '#000000';
            ctx.textAlign = 'left';
            // Incoming-garbage meter beside MY well: red bars = rows that land on my next
            // non-clearing lock (clear lines first to cancel them).
            const pending = this.mpState.pendingGarbage || 0;
            if (pending > 0) {
                const bottom = this.BOARD_Y + this.VISIBLE_ROWS * this.CELL;
                ctx.fillStyle = '#ff0000';
                for (let i = 0; i < Math.min(pending, this.VISIBLE_ROWS); i++) {
                    ctx.fillRect(this.BOARD_X - 7, bottom - (i + 1) * this.CELL, 4, this.CELL - 1);
                }
                ctx.textAlign = 'right';
                ctx.fillText(`\u26A0 +${pending}`, this.BOARD_X - 10, this.BOARD_Y);
                ctx.textAlign = 'left';
            }
        }

        const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        if (!reducedMotion && this.clearFx && this.clearFx.board) {
            // Line-clear flash: paint the pre-clear board with the full rows lit white for ~120ms.
            const liveBoard = this.board;
            this.board = this.clearFx.board;
            this.drawBoardCells();
            this.board = liveBoard;
            const squareRows = this.clearFx.squareRows || [];
            for (const row of this.clearFx.rows) {
                if (row < this.HIDDEN_ROWS) continue;
                // A square clear lights its whole row solid white; a plain clear keeps today's 85%.
                ctx.fillStyle = squareRows.includes(row) ? '#ffffff' : 'rgba(255,255,255,0.85)';
                const pos = this.boardToPixel(0, row);
                ctx.fillRect(pos.x, pos.y, this.COLS * this.CELL, this.CELL);
            }
        } else {
            this.drawBoardCells();
        }
        if (!reducedMotion && this.fuseFx) this._drawFuseFlash();
        this.drawHints();

        if (this.active) {
            this.drawGhostPiece();
            this.drawPiece(this.active, this.active.y, false);
            this._drawLockCue();
        }

        if (this.flashText && this.state === 'running') this.drawFlashBanner(this.flashText);
        if (this.state === 'countdown') {
            this.drawCenterCard('GET READY', this.countdownValue > 0 ? String(this.countdownValue) : 'GO!');
            return;
        }
        if (this.state === 'idle') this.drawModeSelect();
        if (this.state === 'paused') this.drawCenterCard('PAUSED', 'P = resume \u00b7 R = new game');
        if (this.state === 'gameover') {
            // SB-1: route 1v1 game-over through the card (the scoring choke point) whenever a
            // match is live — NOT gated on flashText, so a flash-less topout can't bypass scoring.
            if (this.mode === '1v1' && this.mpState) {
                this.drawGameOverCard(this.flashText || '');
            } else {
                this.drawSoloGameOverCard();
            }
        }

        // Draw opponent board each frame in 1v1 mode
        if (this.mode === '1v1' && this.mpState) {
            this.drawOpponentBoard();
        }
    },

    drawPanelBox(x, y, w, h, title) {
        const ctx = this.ctx;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.fillStyle = '#dddddd';
        ctx.fillRect(x + 1, y + 1, w - 2, 12);
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(x + 1.5, y + 1.5);
        ctx.lineTo(x + w - 1.5, y + 1.5);
        ctx.lineTo(x + 1.5, y + 1.5);
        ctx.lineTo(x + 1.5, y + 12.5);
        ctx.stroke();
        ctx.strokeStyle = '#888888';
        ctx.beginPath();
        ctx.moveTo(x + w - 1.5, y + 1.5);
        ctx.lineTo(x + w - 1.5, y + h - 1.5);
        ctx.lineTo(x + 1.5, y + h - 1.5);
        ctx.stroke();
        ctx.fillStyle = '#000000';
        ctx.font = '10px Chicago, Arial, sans-serif';
        ctx.fillText(title, x + 6, y + 10);
    },

    drawPreviewSlot(x, y, w, h) {
        const ctx = this.ctx;
        ctx.fillStyle = '#f6f6f6';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#000000';
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    },

    drawBoardWell() {
        const ctx = this.ctx;
        const x = this.BOARD_X - 2;
        const y = this.BOARD_Y - 2;
        const w = this.COLS * this.CELL + 4;
        const h = this.VISIBLE_ROWS * this.CELL + 4;
        ctx.fillStyle = '#efefef';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = this._inDanger() ? '#b00000' : '#000000';   // quiet warning, no beep
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(this.BOARD_X, this.BOARD_Y, this.COLS * this.CELL, this.VISIBLE_ROWS * this.CELL);
        ctx.strokeStyle = '#d8d8d8';
        for (let cx = 0; cx <= this.COLS; cx++) {
            const px = this.BOARD_X + cx * this.CELL + 0.5;
            ctx.beginPath();
            ctx.moveTo(px, this.BOARD_Y + 0.5);
            ctx.lineTo(px, this.BOARD_Y + this.VISIBLE_ROWS * this.CELL + 0.5);
            ctx.stroke();
        }
        for (let cy = 0; cy <= this.VISIBLE_ROWS; cy++) {
            const py = this.BOARD_Y + cy * this.CELL + 0.5;
            ctx.beginPath();
            ctx.moveTo(this.BOARD_X + 0.5, py);
            ctx.lineTo(this.BOARD_X + this.COLS * this.CELL + 0.5, py);
            ctx.stroke();
        }
    },

    drawBoardCells() {
        const ctx = this.ctx;
        const squareGroups = new Map();
        for (let y = this.HIDDEN_ROWS; y < this.TOTAL_ROWS; y++) {
            for (let x = 0; x < this.COLS; x++) {
                const cell = this.board[y][x];
                if (!cell) continue;
                if (cell.kind === 'square' && cell.squareId != null) {
                    if (!squareGroups.has(cell.squareId)) squareGroups.set(cell.squareId, { material: cell.material, cells: [] });
                    squareGroups.get(cell.squareId).cells.push({ x, y });
                } else {
                    const pos = this.boardToPixel(x, y);
                    this.drawCell(pos.x, pos.y, this.CELL, cell.color, cell.kind === 'fragment');
                }
            }
        }
        for (const [squareId, square] of squareGroups) {
            const xs = square.cells.map((cell) => cell.x);
            const ys = square.cells.map((cell) => cell.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            const pos = this.boardToPixel(minX, minY);
            this.drawSquareBlock(pos.x, pos.y, (maxX - minX + 1) * this.CELL, (maxY - minY + 1) * this.CELL, square.material, squareId);
        }
    },

    drawCell(x, y, size, color, fragment = false, ctx = this.ctx) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, size, size);
        ctx.strokeStyle = '#000000';
        ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(x + 1, y + 1, size - 2, 1);
        ctx.fillRect(x + 1, y + 1, 1, size - 2);
        ctx.fillStyle = 'rgba(0,0,0,0.20)';
        ctx.fillRect(x + size - 2, y + 1, 1, size - 2);
        ctx.fillRect(x + 1, y + size - 2, size - 2, 1);
        if (fragment) {
            ctx.strokeStyle = 'rgba(0,0,0,0.45)';
            ctx.beginPath();
            ctx.moveTo(x + 2.5, y + 2.5);
            ctx.lineTo(x + size - 2.5, y + size - 2.5);
            ctx.moveTo(x + size - 2.5, y + 2.5);
            ctx.lineTo(x + 2.5, y + size - 2.5);
            ctx.stroke();
        }
    },

    // The fuse flash (TETRIS_SQUARES_SPEC §1): each just-fused slab glows white, fading over 250 ms.
    _drawFuseFlash() {
        const fx = this.fuseFx;
        if (!fx || !fx.squareIds || !fx.squareIds.length) return;
        const ids = new Set(fx.squareIds);
        const ctx = this.ctx;
        ctx.fillStyle = `rgba(255,255,255,${(0.9 * Math.max(0, fx.timer) / 250).toFixed(3)})`;
        for (let y = this.HIDDEN_ROWS; y < this.TOTAL_ROWS; y++) {
            for (let x = 0; x < this.COLS; x++) {
                const cell = this.board[y][x];
                if (!cell || cell.kind !== 'square' || !ids.has(cell.squareId)) continue;
                const pos = this.boardToPixel(x, y);
                ctx.fillRect(pos.x, pos.y, this.CELL, this.CELL);
            }
        }
    },

    // TETRIS_SQUARES_SPEC §1 Visual, metallic (teacher 2026-10-10: "gold shouldn't just be yellow and
    // silver grey — it needs metallic sheen"). One block per slab, clipped to the slab's CURRENT
    // bounding rows (a slab cut by a clear keeps the effect on what is left):
    //   (a) a vertical five-stop base gradient,
    //   (b) a soft-edged diagonal specular band (~18% of the slab width) that sweeps once over
    //       1.2 s at fuse, then drifts across once every 6 s — its phase comes from the game's own
    //       fixed-step tick (this.tick, 16.67 ms), never the wall clock, so every client and both
    //       skins draw the same frame,
    //   (c) a 1 px darker outer bevel and a 1 px light bevel on the top / left inner edge,
    //   (d) a faint brushed texture: four thin horizontal lines at 8% alpha.
    // Cost per slab per frame: one gradient fill, one band fill, a few 1 px lines.
    METAL: {
        gold:   { stops: ['#7A4F00', '#F2C14E', '#FFF1B0', '#D9A62E', '#6E4400'], spec: '255,246,213', specAlpha: 0.6,  dark: '#4A3000', light: '#FFF1B0' },
        silver: { stops: ['#4A4F57', '#C9D1D9', '#F4F7FA', '#AEB6C0', '#3E434A'], spec: '255,255,255', specAlpha: 0.55, dark: '#2A2E34', light: '#F4F7FA' }
    },
    SWEEP_TICKS: 72,     // the first pass at fuse: 1.2 s of 16.67 ms ticks
    DRIFT_TICKS: 360,    // then one pass every 6 s

    // 0..1 position of a slab's highlight band, from the game tick and the tick the slab fused at.
    _slabSweepPhase(squareId) {
        const born = (this._slabBornAt && this._slabBornAt[squareId] != null) ? this._slabBornAt[squareId] : 0;
        const age = Math.max(0, (this.tick || 0) - born);
        if (age < this.SWEEP_TICKS) return age / this.SWEEP_TICKS;
        return ((age - this.SWEEP_TICKS) % this.DRIFT_TICKS) / this.DRIFT_TICKS;
    },

    drawSquareBlock(x, y, w, h, material, squareId) {
        const ctx = this.ctx;
        const metal = material === 'gold' ? this.METAL.gold : this.METAL.silver;
        // (a) base gradient, top to bottom of the slab as it stands now.
        const base = ctx.createLinearGradient(x, y, x, y + h);
        metal.stops.forEach((color, i) => base.addColorStop(i / (metal.stops.length - 1), color));
        ctx.fillStyle = base;
        ctx.fillRect(x, y, w, h);
        // (d) brushed texture.
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        for (let i = 1; i <= 4; i++) ctx.fillRect(x + 1, y + Math.round((h * i) / 5), w - 2, 1);
        // (b) the specular band: a gradient across the 45° diagonal (isolines x + y = const), soft
        // at both edges, positioned by the tick phase; one fill clipped to the slab.
        const band = w * 0.18;
        const s0 = (x + y - band) + this._slabSweepPhase(squareId) * (w + h + band);
        const spec = ctx.createLinearGradient(s0 - y, y, s0 - y + band / 2, y + band / 2);
        spec.addColorStop(0, `rgba(${metal.spec},0)`);
        spec.addColorStop(0.5, `rgba(${metal.spec},${metal.specAlpha})`);
        spec.addColorStop(1, `rgba(${metal.spec},0)`);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.fillStyle = spec;
        ctx.fillRect(x, y, w, h);
        ctx.restore();
        // (c) bevels: darker 1 px outer edge, light 1 px top/left inner edge.
        ctx.strokeStyle = metal.dark;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.strokeStyle = metal.light;
        ctx.beginPath();
        ctx.moveTo(x + 1.5, y + h - 1.5);
        ctx.lineTo(x + 1.5, y + 1.5);
        ctx.lineTo(x + w - 1.5, y + 1.5);
        ctx.stroke();
    },

    drawPiece(piece, drawY = piece.y, ghost = false) {
        const color = this.colors[piece.type];
        for (const cell of this.getCells(piece, piece.rot, piece.x, drawY)) {
            if (cell.y < this.HIDDEN_ROWS) continue;
            const pos = this.boardToPixel(cell.x, cell.y);
            if (ghost) {
                this.drawGhostCell(pos.x, pos.y, this.CELL, color);
            } else {
                this.drawCell(pos.x, pos.y, this.CELL, color, false);
            }
        }
    },

    drawGhostPiece() {
        if (!this.active) return;
        const gy = this.getGhostY();
        const mat = this._ghostMaterial(gy);
        this.drawPiece(this.active, gy, true);
        if (mat) {
            // Dropping here completes a whole-piece square: outline the ghost in gold/silver.
            const ctx = this.ctx;
            ctx.save();
            ctx.lineWidth = 2;
            ctx.strokeStyle = mat === 'gold' ? '#c9a227' : '#8a8a8a';
            for (const cell of this.getCells(this.active, this.active.rot, this.active.x, gy)) {
                if (cell.y < this.HIDDEN_ROWS) continue;
                const pos = this.boardToPixel(cell.x, cell.y);
                ctx.strokeRect(pos.x + 2, pos.y + 2, this.CELL - 4, this.CELL - 4);
            }
            ctx.restore();
        }
    },

    drawGhostCell(x, y, size, color) {
        const ctx = this.ctx;
        // Faint fill in the piece's own colour plus the outline: at CELL=10 the hairline alone vanished.
        if (color) { ctx.globalAlpha = 0.18; ctx.fillStyle = color; ctx.fillRect(x + 1, y + 1, size - 2, size - 2); ctx.globalAlpha = 1; }
        ctx.strokeStyle = '#7f7f7f';
        ctx.strokeRect(x + 2.5, y + 2.5, size - 5, size - 5);
    },

    drawMiniPiece(type, x, y, w, h, ctx = this.ctx) {
        const cells = this.pieces[type][0];
        const xs = cells.map((cell) => cell[0]);
        const ys = cells.map((cell) => cell[1]);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const pw = maxX - minX + 1;
        const ph = maxY - minY + 1;
        const scale = Math.min(10, Math.floor(Math.min((w - 8) / pw, (h - 8) / ph)));
        const ox = x + Math.floor((w - pw * scale) / 2) - minX * scale;
        const oy = y + Math.floor((h - ph * scale) / 2) - minY * scale;
        for (const [cx, cy] of cells) {
            this.drawCell(ox + cx * scale, oy + cy * scale, scale, this.colors[type], false, ctx);
        }
    },

    drawFlashBanner(text) {
        const ctx = this.ctx;
        const w = this.COLS * this.CELL - 12;
        const x = this.BOARD_X + 6;
        const y = this.BOARD_Y + 8;
        ctx.font = '10px Chicago, Arial, sans-serif';
        // Pack the ' • ' parts into as few lines as fit the well (max 3), clipped to the banner: a
        // 'SILVER SQUARE! • 2 LINES • SILVER BONUS +10' used to smear across HOLD/NEXT.
        const parts = String(text).toUpperCase().split(' \u2022 ');
        const lines = [];
        let cur = '';
        for (const p of parts) {
            const cand = cur ? cur + ' \u2022 ' + p : p;
            if (cur && ctx.measureText(cand).width > w - 8) { lines.push(cur); cur = p; } else cur = cand;
        }
        if (cur) lines.push(cur);
        const shown = lines.slice(0, 3);
        const h = 8 + shown.length * 11;
        ctx.fillStyle = '#000000';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        shown.forEach((ln, i) => ctx.fillText(ln, x + w / 2, y + 12 + i * 11));
        ctx.restore();
        ctx.textAlign = 'left';
    },

    drawCenterCard(title, subtitle) {
        const ctx = this.ctx;
        const w = 168;
        const h = 60;
        const x = this.BOARD_X + (this.COLS * this.CELL - w) / 2;
        const y = this.BOARD_Y + (this.VISIBLE_ROWS * this.CELL - h) / 2;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#000000';
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.fillStyle = '#dddddd';
        ctx.fillRect(x + 1, y + 1, w - 2, 14);
        ctx.fillStyle = '#000000';
        ctx.font = '10px Chicago, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(title, x + w / 2, y + 11);
        ctx.font = '10px Geneva, Arial, sans-serif';
        ctx.fillText(subtitle, x + w / 2, y + 35);
        ctx.fillText('Gold = same shape  •  Silver = mixed', x + w / 2, y + 48);
        ctx.textAlign = 'left';
    },

    // Solo game over: this run, your best, and the mean of your last runs (see _recordSoloResult).
    drawSoloGameOverCard() {
        const ctx = this.ctx;
        const r = this._lastResult || {};
        const w = 212, h = 124;
        const x = this.BOARD_X + (this.COLS * this.CELL - w) / 2;
        const y = this.BOARD_Y + (this.VISIBLE_ROWS * this.CELL - h) / 2;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#000000'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.fillStyle = r.isBest ? this.colors.gold : '#dddddd'; ctx.fillRect(x + 1, y + 1, w - 2, 14);
        ctx.fillStyle = '#000000'; ctx.font = '10px Chicago, Arial, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(r.isBest ? 'NEW BEST!' : 'GAME OVER', x + w / 2, y + 11);
        ctx.font = '10px Geneva, Arial, sans-serif';
        ctx.fillText(`Score ${this.score}  \u2022  Lines ${this.lines}  \u2022  Level ${this.level}`, x + w / 2, y + 28);
        const best = r.best ? r.best.score : this.score;
        const recent = Array.isArray(r.recent) && r.recent.length ? r.recent : [this.score];
        const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
        ctx.fillStyle = '#333333'; ctx.font = '9px Geneva, Arial, sans-serif';
        ctx.fillText(`Your best ${best}  \u2022  mean of last ${recent.length}: ${Math.round(mean * 10) / 10}`, x + w / 2, y + 42);
        // Piece-count histogram: the 63-bag as a sampling demo (9 of each per bag, drawn without
        // replacement — no type can pass 9 before piece 64).
        const counts = this.pieceCounts || {};
        const n = this.types.reduce((s, t) => s + (counts[t] || 0), 0);
        const max = Math.max(1, ...this.types.map((t) => counts[t] || 0));
        const barW = 14, gap = 10, baseY = y + 88, maxH = 30;
        const startX = x + w / 2 - (this.types.length * (barW + gap) - gap) / 2;
        ctx.font = '8px Geneva, Arial, sans-serif';
        this.types.forEach((t, i) => {
            const c = counts[t] || 0;
            const bh = Math.round((c / max) * maxH);
            const bx = startX + i * (barW + gap);
            ctx.fillStyle = this.colors[t]; ctx.fillRect(bx, baseY - bh, barW, bh);
            if (bh > 1) { ctx.strokeStyle = '#000000'; ctx.strokeRect(bx + 0.5, baseY - bh + 0.5, barW - 1, bh - 1); }
            ctx.fillStyle = '#000000';
            ctx.fillText(`${t} ${c}`, bx + barW / 2, baseY + 9);
        });
        ctx.fillStyle = '#666666';
        ctx.fillText(`n = ${n} pieces  \u2022  the bag holds 9 of each shape`, x + w / 2, y + 106);
        ctx.font = '9px Geneva, Arial, sans-serif';
        ctx.fillStyle = '#000000';
        ctx.fillText(this._breakNote() || 'Enter, R, or click to play again  \u2022  Esc to exit', x + w / 2, y + 118);
        ctx.textAlign = 'left';
    },

    drawGameOverCard(flashText) {
        // Count THIS game into the best-of-3 series (once) + maybe resolve the candy bet.
        this._studyBreakScoreGameOnce();
        const ctx = this.ctx;
        const ms = this.mpState;
        // Parse flash text: "YOU WIN! You: 1250 | Bob: 980" or "Opponent fled! ..." or "Bob disconnected. ..."
        let title = 'GAME OVER';
        let detail = '';
        if (flashText.startsWith('YOU WIN!')) { title = 'YOU WIN!'; detail = flashText.replace('YOU WIN! ', ''); }
        else if (flashText.includes('fled!')) { title = 'YOU WIN!'; detail = flashText.replace(/Opponent fled! You win! ?/, ''); }
        else if (flashText.includes('disconnected')) { title = 'DISCONNECTED'; detail = flashText; }
        else { detail = flashText; }
        // One game decides it: the verdict line + the candy status (STUDY_BREAK_STAKES_SPEC Phase 2, amended 2026-09-28).
        let seriesLine = '', statusLine = '';
        if (ms) {
            seriesLine = `One game \u00b7 you vs ${String(ms.opponent || 'opp').slice(0, 10)}`;
            if (ms.seriesOver) {
                const won = (ms.myWins || 0) > (ms.oppWins || 0);
                title = won ? 'YOU WIN!' : 'YOU LOSE';
                if (ms.candyOutcome === '+1') statusLine = '🍬 +1 candy to your wallet!';
                else if (ms.candyOutcome === '-1') statusLine = '🍬 −1 candy (you lost the bet)';
                else if (ms.candyOutcome === '+2') statusLine = '🍬 +2 candy — gold premium!';
                else if (ms.candyOutcome === '-2') statusLine = '🍬 −2 candy (lost the bet + gold premium)';
                else if (ms.candyOutcome === 'refunded') statusLine = 'bet refunded — no agreement';
                else if (ms.candyOutcome === 'pending') statusLine = 'settling the bet…';
                else if (ms.candyOutcome === 'none') statusLine = 'no bet to settle — no candy moved';
                else if (ms.stakePending) statusLine = 'pot pending';
                else if (!ms.staked) statusLine = 'free match — no candy moved';
                else statusLine = 'R = rematch · Esc = exit';
            } else {
                statusLine = `Game ${ms.gameNumber || 1} — next game in 3s… (R to skip)`;
            }
        }
        const w = 212;
        const h = ms ? 100 : 72;
        const x = this.BOARD_X + (this.COLS * this.CELL - w) / 2;
        const y = this.BOARD_Y + (this.VISIBLE_ROWS * this.CELL - h) / 2;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#000000'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.fillStyle = '#dddddd'; ctx.fillRect(x + 1, y + 1, w - 2, 14);
        ctx.fillStyle = '#000000'; ctx.font = '10px Chicago, Arial, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(title, x + w / 2, y + 11);
        ctx.font = '10px Geneva, Arial, sans-serif';
        let detailLine = detail;
        if (ctx.measureText(detailLine).width > w - 16) {
            while (detailLine && ctx.measureText(detailLine + '\u2026').width > w - 16) detailLine = detailLine.slice(0, -1);
        }
        if (detailLine !== detail) detailLine += '\u2026';
        ctx.fillText(detailLine, x + w / 2, y + 30);
        if (ms) {
            ctx.fillStyle = '#333333'; ctx.font = '9px Geneva, Arial, sans-serif';
            ctx.fillText(seriesLine, x + w / 2, y + 48);
            ctx.fillStyle = (ms.candyOutcome === '+1' || ms.candyOutcome === '+2') ? '#0a6b2e' : ((ms.candyOutcome === '-1' || ms.candyOutcome === '-2') ? '#b00000' : '#000000');
            ctx.font = '10px Chicago, Arial, sans-serif';
            ctx.fillText(statusLine, x + w / 2, y + 68);
            ctx.fillStyle = '#666666'; ctx.font = '9px Geneva, Arial, sans-serif';
            const o = this._outgoing;
            const foot = ms.seriesOver
                ? (o && o.text ? o.text : (this._rematchNote ? this._rematchNote + ' · Esc to exit' : `Score ${this.score} · R = rematch · Esc = exit`))
                : `Score ${this.score} · Esc to exit`;
            let footerLine = foot;
            if (ctx.measureText(footerLine).width > w - 16) {
                while (footerLine && ctx.measureText(footerLine + '\u2026').width > w - 16) footerLine = footerLine.slice(0, -1);
            }
            if (footerLine !== foot) footerLine += '\u2026';
            ctx.fillText(footerLine, x + w / 2, y + 88);
            this._setHelpText([detail, seriesLine, statusLine, foot].filter(Boolean).join(' \u2022 '));
        } else {
            ctx.fillStyle = '#666666'; ctx.font = '9px Geneva, Arial, sans-serif';
            ctx.fillText('R to rematch  •  Esc to exit', x + w / 2, y + 48);
            ctx.fillStyle = '#000000'; ctx.fillText(`Score ${this.score}  •  Lines ${this.lines}`, x + w / 2, y + 60);
        }
        if (!ms) this._setHelpText(detail + ' \u2022 R to rematch \u2022 Esc to exit');
        ctx.textAlign = 'left';
    },

    drawModeSelect() {
        const ctx = this.ctx;
        const w = 200;
        const stats = this._loadStats();
        const h = 100;
        const x = this.BOARD_X + (this.COLS * this.CELL - w) / 2;
        const y = this.BOARD_Y + (this.VISIBLE_ROWS * this.CELL - h) / 2;
        // Card background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#000000';
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        // Title bar
        ctx.fillStyle = '#dddddd';
        ctx.fillRect(x + 1, y + 1, w - 2, 14);
        ctx.fillStyle = '#000000';
        ctx.font = '10px Chicago, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('STUDY BREAK', x + w / 2, y + 11);
        // Subtitle
        ctx.font = '10px Geneva, Arial, sans-serif';
        ctx.fillText(this._lessonDone === true ? 'Lesson done \u2014 enjoy the break'
            : (this._lessonDone === false ? 'Do Now not done \u2014 short break?' : 'Square Mode'), x + w / 2, y + 28);
        // Solo button area
        const btnW = 70, btnH = 24, gap = 16;
        const btnY = y + 38;
        const soloX = x + w / 2 - btnW - gap / 2;
        const vsX = x + w / 2 + gap / 2;
        // Solo button
        ctx.strokeStyle = '#000000';
        ctx.strokeRect(soloX + 0.5, btnY + 0.5, btnW - 1, btnH - 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(soloX + 1, btnY + 1, btnW - 2, btnH - 2);
        ctx.fillStyle = '#000000';
        ctx.font = '10px Chicago, Arial, sans-serif';
        ctx.fillText('SOLO', soloX + btnW / 2, btnY + 15);
        ctx.font = '9px Geneva, Arial, sans-serif';
        ctx.fillText('1 / Enter', soloX + btnW / 2, btnY + 22);
        // 1v1 button
        ctx.strokeStyle = '#000000';
        ctx.strokeRect(vsX + 0.5, btnY + 0.5, btnW - 1, btnH - 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(vsX + 1, btnY + 1, btnW - 2, btnH - 2);
        ctx.fillStyle = '#000000';
        ctx.font = '10px Chicago, Arial, sans-serif';
        ctx.fillText('1v1', vsX + btnW / 2, btnY + 15);
        ctx.font = '9px Geneva, Arial, sans-serif';
        ctx.fillText('2 / click', vsX + btnW / 2, btnY + 22);
        // Your own record on this device (the relay never had a Hall of Fame; a class-wide all-time
        // board would be an equity problem in a mixed-skill room anyway).
        const lbY = btnY + btnH + 12;
        ctx.font = '9px Geneva, Arial, sans-serif';
        ctx.fillStyle = '#333333';
        if (stats.best) {
            const recent = stats.recent.length ? stats.recent : [stats.best.score];
            const mean = Math.round((recent.reduce((a, b) => a + b, 0) / recent.length) * 10) / 10;
            ctx.fillText(`Best ${stats.best.score} \u00b7 mean of last ${recent.length}: ${mean}`, x + w / 2, lbY);
        } else {
            ctx.fillText('First game: 4 whole pieces make a 4\u00d74', x + w / 2, lbY);
        }
        ctx.fillStyle = '#000000';
        // Footer
        ctx.fillText(this._breakNote() || 'same shape = gold \u00b7 mixed = silver', x + w / 2, y + h - 8);
        ctx.textAlign = 'left';
        // Store button rects for click detection
        this._soloBtn = { x: soloX, y: btnY, w: btnW, h: btnH };
        this._vsBtn = { x: vsX, y: btnY, w: btnW, h: btnH };
    }
};

function openGame() {
    bumpUsage('game');
    MacSFX.play('wildEep', 0.5);
    studyBreak.open();
}

function closeGame() {
    studyBreak.close();
}

window.studyBreak = studyBreak;
