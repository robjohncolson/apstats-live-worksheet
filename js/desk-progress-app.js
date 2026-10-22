/* ═══ MY PROGRESS APP ═══ */
const PROG_DRILLER_API = 'https://lrsl-driller-production.up.railway.app';
const PROG_QUIZ_SB = {
    url: 'https://bzqbhtrurzzavhqbgqrs.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6cWJodHJ1cnp6YXZocWJncXJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxOTc1NDMsImV4cCI6MjA3NDc3MzU0M30.xDHsAxOlv0uprE9epz-M_Emn6q3mRegtTpFt0sl9uBo'
};

const ProgressApp = {
    username: null,
    realName: null,
    cache: {},
    cacheMaxAge: 60000,
    activeTab: 'driller',
    foundIn: { driller: false, quiz: false },

    open: function() {
        bumpUsage('progress');
        MacSFX.play('wildEep', 0.5);
        var overlay = document.getElementById('app-progress-overlay');
        var win = overlay.querySelector('.app-window');
        win.style.left = '50%';
        win.style.top = '50%';
        win.style.transform = 'translate(-50%, -50%)';
        win.classList.remove('maximized');
        overlay.style.display = 'block';
        this.username = localStorage.getItem('progress-username') || null;
        if (this.username) {
            this.showLoading();
            this.lookupUser().then(function() { ProgressApp.renderMain(); });
        } else {
            this.renderLogin();
        }
    },

    close: function() {
        MacSFX.play('click', 0.3);
        document.getElementById('app-progress-overlay').style.display = 'none';
    },

    destroy: function() {
        this.close();
        this.cache = {};
    },

    // --- Helpers ---
    esc: function(s) {
        if (s == null) return '';
        var d = document.createElement('div');
        d.textContent = String(s);
        return d.innerHTML;
    },

    fmtDate: function(v) {
        if (!v) return '—';
        var d;
        if (typeof v === 'number') d = new Date(v);
        else d = new Date(v);
        if (isNaN(d)) return '—';
        var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        var h = d.getHours(); var m = d.getMinutes();
        var ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return mo[d.getMonth()] + ' ' + d.getDate() + ', ' + h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
    },

    fmtDuration: function(ms) {
        if (!ms) return '0s';
        var s = Math.round(ms / 1000);
        if (s < 60) return s + 's';
        var m = Math.floor(s / 60);
        return m + 'm ' + (s % 60) + 's';
    },

    starIcon: function(type) {
        switch(type) {
            case 'gold': return '<span class="prog-star" style="color:#DAA520">★</span>';
            case 'silver': return '<span class="prog-star" style="color:#C0C0C0">★</span>';
            case 'bronze': return '<span class="prog-star" style="color:#CD7F32">★</span>';
            case 'tin': return '<span class="prog-star" style="color:#888">★</span>';
            default: return '—';
        }
    },

    showLoading: function() {
        document.getElementById('progress-content').innerHTML =
            '<div class="prog-loading">Loading...</div>';
    },

    // --- Fetch helpers ---
    drillerFetch: function(path) {
        return fetch(PROG_DRILLER_API + path)
            .then(function(r) { return r.ok ? r.json() : []; })
            .catch(function() { return []; });
    },

    quizFetch: function(table, query) {
        return fetch(PROG_QUIZ_SB.url + '/rest/v1/' + table + '?' + query, {
            headers: { apikey: PROG_QUIZ_SB.key }
        }).then(function(r) { return r.ok ? r.json() : []; })
          .catch(function() { return []; });
    },

    // --- Login ---
    userList: [],

    renderLogin: function(err) {
        var self = this;
        var content = document.getElementById('progress-content');
        content.innerHTML =
            '<div class="prog-login">' +
                '<div class="chicago" style="font-size:14px">My Progress</div>' +
                '<div class="geneva" style="font-size:11px;color:var(--plat-lo)">Select your username and enter your password</div>' +
                '<select id="prog-user-select" class="geneva" style="font-size:12px;border:1px solid var(--black);padding:4px 8px;width:216px;background:var(--white);box-shadow:inset 1px 1px 0 var(--plat-lo)">' +
                    '<option value="">Loading users...</option>' +
                '</select>' +
                '<input id="prog-pass-input" class="geneva" type="password" placeholder="Password" style="width:200px" />' +
                '<button class="s7btn s7btn-default" onclick="ProgressApp.handleLogin()">Log In</button>' +
                (err ? '<div class="prog-err geneva">' + this.esc(err) + '</div>' : '') +
            '</div>';
        var passInp = document.getElementById('prog-pass-input');
        passInp.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') ProgressApp.handleLogin();
        });
        // Fetch user list if not cached
        if (this.userList.length > 0) {
            this.populateDropdown();
        } else {
            this.drillerFetch('/api/users').then(function(users) {
                if (Array.isArray(users)) {
                    self.userList = users.sort(function(a, b) {
                        return (a.real_name || a.username).localeCompare(b.real_name || b.username);
                    });
                }
                self.populateDropdown();
            });
        }
    },

    populateDropdown: function() {
        var sel = document.getElementById('prog-user-select');
        if (!sel) return;
        var prefill = localStorage.getItem('progress-username') || localStorage.getItem('student-name') || '';
        var html = '<option value="">— Select —</option>';
        for (var i = 0; i < this.userList.length; i++) {
            var u = this.userList[i];
            var label = u.real_name ? u.real_name + ' (' + u.username + ')' : u.username;
            var selected = u.username === prefill ? ' selected' : '';
            html += '<option value="' + this.esc(u.username) + '"' + selected + '>' + this.esc(label) + '</option>';
        }
        sel.innerHTML = html;
        if (prefill) {
            var passInp = document.getElementById('prog-pass-input');
            if (passInp) passInp.focus();
        }
    },

    handleLogin: function() {
        var sel = document.getElementById('prog-user-select');
        var passInp = document.getElementById('prog-pass-input');
        var username = sel.value;
        var password = (passInp.value || '').trim();
        if (!username) { this.renderLogin('Please select a username.'); return; }
        if (!password) { this.renderLogin('Please enter your password.'); return; }
        var self = this;
        this.showLoading();
        fetch(PROG_DRILLER_API + '/api/users/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, password: password })
        }).then(function(r) { return r.json(); })
          .then(function(result) {
            if (result.valid) {
                self.username = username;
                self.realName = result.real_name || username;
                localStorage.setItem('progress-username', username);
                self.foundIn.driller = true;
                // Also check quiz DB
                self.quizFetch('users', 'username=eq.' + encodeURIComponent(username) + '&select=real_name')
                    .then(function(q) {
                        self.foundIn.quiz = q && q.length > 0;
                        self.renderMain();
                    });
            } else {
                self.renderLogin(result.error || 'Incorrect password.');
            }
        }).catch(function() {
            self.renderLogin('Connection error. Try again.');
        });
    },

    lookupUser: function() {
        // Called when reopening with cached username — re-verify against both DBs
        var self = this;
        return Promise.all([
            this.drillerFetch('/api/users/' + encodeURIComponent(this.username) + '/stars'),
            this.quizFetch('users', 'username=eq.' + encodeURIComponent(this.username) + '&select=real_name')
        ]).then(function(results) {
            self.foundIn.driller = results[0] && !results[0].error;
            self.foundIn.quiz = results[1] && results[1].length > 0;
            if (self.foundIn.quiz) self.realName = results[1][0].real_name || self.username;
            if (!self.foundIn.driller && !self.foundIn.quiz) {
                self.username = null;
                localStorage.removeItem('progress-username');
                self.renderLogin('Session expired. Please log in again.');
            }
        });
    },

    logout: function() {
        this.username = null;
        this.realName = null;
        this.cache = {};
        this.foundIn = { driller: false, quiz: false };
        localStorage.removeItem('progress-username');
        this.renderLogin();
    },

    // --- Main View ---
    renderMain: function() {
        if (!this.username) return;
        var content = document.getElementById('progress-content');
        content.innerHTML =
            '<div class="prog-header">' +
                '<span class="chicago">&#128100; ' + this.esc(this.realName) +
                (this.realName !== this.username ? ' <span class="geneva" style="font-size:9px;color:var(--plat-lo)">(' + this.esc(this.username) + ')</span>' : '') +
                '</span>' +
                '<span class="logout-link geneva" onclick="ProgressApp.logout()">Log Out</span>' +
            '</div>' +
            '<div class="prog-tabs" id="progress-tabs"></div>' +
            '<div class="prog-table-wrap" id="progress-body"></div>';
        this.renderTabs();
        this.switchTab(this.activeTab);
    },

    renderTabs: function() {
        var tabs = [
            { id: 'driller', label: 'Driller', src: 'driller' },
            { id: 'quiz',    label: 'Quiz Answers', src: 'quiz' },
            { id: 'badges',  label: 'Badges', src: 'quiz' },
            { id: 'time',    label: 'Time on Task', src: 'driller' }
        ];
        var html = '';
        for (var i = 0; i < tabs.length; i++) {
            var t = tabs[i];
            var active = t.id === this.activeTab ? ' active' : '';
            var dim = !this.foundIn[t.src] ? ' dim' : '';
            html += '<div class="prog-tab' + active + dim + '" onclick="ProgressApp.switchTab(\'' + t.id + '\')">' + t.label + '</div>';
        }
        document.getElementById('progress-tabs').innerHTML = html;
    },

    switchTab: function(tabId) {
        var self = this;
        this.activeTab = tabId;
        this.renderTabs();
        var body = document.getElementById('progress-body');
        body.innerHTML = '<div class="prog-loading">Loading...</div>';
        var cached = this.cache[tabId];
        if (cached && Date.now() - cached.ts < this.cacheMaxAge) {
            this.renderTabContent(tabId, cached.data);
            return;
        }
        this.fetchTab(tabId).then(function(data) {
            self.cache[tabId] = { data: data, ts: Date.now() };
            if (self.activeTab === tabId) self.renderTabContent(tabId, data);
        });
    },

    fetchTab: function(tabId) {
        var u = encodeURIComponent(this.username);
        switch (tabId) {
            case 'driller':
                if (!this.foundIn.driller) return Promise.resolve(null);
                return Promise.all([
                    this.drillerFetch('/api/progress/' + u),
                    this.drillerFetch('/api/progress/' + u + '/stats')
                ]).then(function(r) { return { progress: r[0], stats: r[1] }; });
            case 'quiz':
                if (!this.foundIn.quiz) return Promise.resolve(null);
                return this.quizFetch('answers',
                    'username=eq.' + u + '&select=question_id,answer_value,timestamp&order=timestamp.desc&limit=100');
            case 'badges':
                if (!this.foundIn.quiz) return Promise.resolve(null);
                return this.quizFetch('badges',
                    'username=eq.' + u + '&select=badge_type,earned_date&order=earned_date.desc');
            case 'time':
                if (!this.foundIn.driller) return Promise.resolve(null);
                return this.drillerFetch('/api/progress/' + u + '/stats')
                    .then(function(d) { return d && d.timeSessions ? d.timeSessions : d; });
            default: return Promise.resolve(null);
        }
    },

    // --- Renderers ---
    renderTabContent: function(tabId, data) {
        var body = document.getElementById('progress-body');
        if (data === null) {
            body.innerHTML = '<div class="prog-empty">No data — username not found in this database.</div>';
            return;
        }
        switch (tabId) {
            case 'driller': this.renderDriller(body, data); break;
            case 'quiz':    this.renderQuiz(body, data); break;
            case 'badges':  this.renderBadges(body, data); break;
            case 'time':    this.renderTime(body, data); break;
        }
    },

    renderDriller: function(body, data) {
        var rows = [];
        if (Array.isArray(data.progress)) rows = data.progress;
        else if (data.progress && typeof data.progress === 'object') rows = [data.progress];
        if (rows.length === 0 && (!data.stats || (Array.isArray(data.stats) && data.stats.length === 0))) {
            body.innerHTML = '<div class="prog-empty">No driller progress yet.</div>';
            return;
        }
        var html = '<table class="prog-table"><thead><tr>' +
            '<th>Cartridge</th><th>Gold</th><th>Silver</th><th>Bronze</th><th>Tin</th><th>Score</th></tr></thead><tbody>';
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            html += '<tr><td>' + this.esc(r.cartridge_id) + '</td>' +
                '<td style="color:#DAA520">' + (r.gold_stars || 0) + '</td>' +
                '<td style="color:#C0C0C0">' + (r.silver_stars || 0) + '</td>' +
                '<td style="color:#CD7F32">' + (r.bronze_stars || 0) + '</td>' +
                '<td style="color:#888">' + (r.tin_stars || 0) + '</td>' +
                '<td>' + (r.total_weighted_score || 0) + '</td></tr>';
        }
        html += '</tbody></table>';
        body.innerHTML = html;
    },

    renderQuiz: function(body, data) {
        if (!data || data.length === 0) {
            body.innerHTML = '<div class="prog-empty">No quiz answers recorded.</div>';
            return;
        }
        var html = '<table class="prog-table"><thead><tr>' +
            '<th>Question</th><th>Answer</th><th>Submitted</th></tr></thead><tbody>';
        for (var i = 0; i < data.length; i++) {
            var r = data[i];
            var ans = r.answer_value;
            if (ans && ans.length > 80) ans = ans.substring(0, 77) + '...';
            html += '<tr><td>' + this.esc(r.question_id) + '</td>' +
                '<td>' + this.esc(ans) + '</td>' +
                '<td>' + this.fmtDate(r.timestamp) + '</td></tr>';
        }
        html += '</tbody></table>';
        body.innerHTML = html;
    },

    renderBadges: function(body, data) {
        if (!data || data.length === 0) {
            body.innerHTML = '<div class="prog-empty">No badges earned yet.</div>';
            return;
        }
        var html = '<div style="padding:16px;display:flex;flex-wrap:wrap;gap:12px">';
        for (var i = 0; i < data.length; i++) {
            var b = data[i];
            html += '<div style="text-align:center;padding:8px 12px;border:1px solid var(--plat-lo);background:var(--platinum);border-radius:2px;' +
                'box-shadow:inset 1px 1px 0 var(--plat-hi),inset -1px -1px 0 var(--bevel-lo)">' +
                '<div class="prog-badge">' + this.esc(b.badge_type) + '</div>' +
                '<div class="geneva" style="font-size:8px;color:var(--plat-lo)">' + this.fmtDate(b.earned_date) + '</div>' +
                '</div>';
        }
        html += '</div>';
        body.innerHTML = html;
    },

    renderTime: function(body, data) {
        if (!data || (Array.isArray(data) && data.length === 0)) {
            body.innerHTML = '<div class="prog-empty">No time sessions recorded.</div>';
            return;
        }
        var sessions = Array.isArray(data) ? data : [];
        var totalMs = 0;
        for (var i = 0; i < sessions.length; i++) totalMs += (sessions[i].active_time_ms || 0);
        var html = '<div class="prog-section-hdr chicago">Total Active Time: ' + this.fmtDuration(totalMs) + '</div>';
        html += '<table class="prog-table"><thead><tr>' +
            '<th>#</th><th>Active Time</th><th>Date</th></tr></thead><tbody>';
        for (var j = 0; j < sessions.length; j++) {
            var s = sessions[j];
            html += '<tr><td>' + (j + 1) + '</td>' +
                '<td>' + this.fmtDuration(s.active_time_ms) + '</td>' +
                '<td>' + this.fmtDate(s.session_start || s.created_at) + '</td></tr>';
        }
        html += '</tbody></table>';
        body.innerHTML = html;
    }
};

function openProgress() { ProgressApp.open(); }
function destroyProgress() { ProgressApp.destroy(); }
