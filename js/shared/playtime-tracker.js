// === Papiano — shared play-time tracker ===
//
// Credits time spent on a piano page to profiles/<uid>.playTimeSeconds, the
// field the leaderboards and the play-time quests read.
//
// Why this file exists: the tracker used to live only in app.js (loaded ONLY by
// dashboard.html) and in multiplayer-piano.js, which meant Solo Piano — the
// main single-player instrument — credited nothing, while sitting idle on the
// dashboard did. Rather than add a third and fourth divergent copy, the pages
// that were missing it load this.
//
// Deliberately NOT wired into dashboard.html or multiplayer.html: both already
// have a working tracker and are left alone.
//
// Requires cognito-auth (window.papianoAuth) and appsync-client
// (window.papianoData), so the tag must come after both.
//
// Signed-out visitors are simply not tracked — these pages are playable
// without an account, exactly like the dashboard, and anonymous play has no
// profile to credit.
(function () {
    'use strict';

    var SYNC_MS = 60000;
    // The server clamps each accepted increment to real elapsed time AND to a
    // hard 120s ceiling (see incrementPlayTimeSeconds). Sending more than that
    // in one call would silently have the excess dropped, so a backlog built up
    // during an outage is drained across calls instead of thrown away in one.
    var MAX_DELTA_PER_CALL = 120;
    var PLAY_MS_KEY = 'papiano_play_ms_v1';
    var PLAY_DAY_KEY = 'papiano_play_day_v1';

    var startedAt = 0;
    var pending = 0;
    var timer = null;
    var inFlight = false;

    function currentUid() {
        try {
            return (window.papianoAuth && window.papianoAuth.currentUser && window.papianoAuth.currentUser.uid) || '';
        } catch (e) { return ''; }
    }

    // UTC, matching the server's own day boundary and home-hero.js's reader.
    // (multiplayer-piano.js uses Asia/Jakarta for its copy of this cache — a
    // pre-existing inconsistency that only shifts when the local "today" pill
    // rolls over, not what the server counts.)
    function todayUTC() {
        return new Date().toISOString().slice(0, 10);
    }

    // Same cache the dashboard home hero and the quest page read, so time spent
    // here shows up in "N min today" without waiting for a reload.
    function addDailyLocal(seconds) {
        try {
            var today = todayUTC();
            var storedDay = localStorage.getItem(PLAY_DAY_KEY);
            var cur = storedDay === today ? (parseInt(localStorage.getItem(PLAY_MS_KEY), 10) || 0) : 0;
            if (storedDay !== today) localStorage.setItem(PLAY_DAY_KEY, today);
            localStorage.setItem(PLAY_MS_KEY, String(Math.max(0, cur) + seconds * 1000));
        } catch (e) { /* private mode / quota — the server total is unaffected */ }
    }

    function accumulate() {
        if (!startedAt || document.hidden) return;
        var now = Date.now();
        var elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
        if (!elapsed) return;
        startedAt = now;
        pending += elapsed;
    }

    function sync(force) {
        accumulate();
        if (inFlight || pending <= 0) return;
        var uid = currentUid();
        if (!uid) { pending = 0; return; }
        if (!window.papianoData || typeof window.papianoData.gql !== 'function') return;

        var delta = Math.min(pending, MAX_DELTA_PER_CALL);
        pending -= delta;
        inFlight = true;
        addDailyLocal(delta);

        window.papianoData.gql(
            'mutation($d: Int!) { incrementPlayTimeSeconds(deltaSeconds: $d) { playTimeSeconds } }',
            { d: delta },
            force ? { keepalive: true } : undefined
        ).then(function () {
            inFlight = false;
        }).catch(function (err) {
            // Put it back so the next tick retries rather than losing the time.
            pending += delta;
            inFlight = false;
            if (window.console && console.warn) console.warn('[Papiano] play-time sync failed, will retry:', (err && err.message) || err);
        });
    }

    function start() {
        if (!currentUid() || document.hidden) return;
        if (!startedAt) startedAt = Date.now();
        if (timer) return;
        timer = setInterval(function () { sync(false); }, SYNC_MS);
    }

    function stop(flush) {
        accumulate();
        startedAt = 0;
        if (timer) { clearInterval(timer); timer = null; }
        if (flush) sync(true);
    }

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) stop(true); else start();
    });
    // pagehide covers the iOS/bfcache case that beforeunload misses.
    window.addEventListener('pagehide', function () { stop(true); });

    var lastUid = '';

    function wireAuth() {
        if (!window.papianoAuth) return false;
        lastUid = currentUid();
        if (typeof window.papianoAuth.onAuthStateChanged === 'function') {
            window.papianoAuth.onAuthStateChanged(function (user) {
                var newUid = (user && user.uid) || '';
                if (newUid !== lastUid) {
                    // A real account switch (or sign-out): any not-yet-synced
                    // seconds were accrued under the PREVIOUS identity, and
                    // currentUid() already reflects the new one by the time
                    // this fires, so there is no way left to sync them to the
                    // right account. Drop them rather than silently crediting
                    // one player's leftover seconds to whoever's signed in
                    // next -- the "old account's play time followed me to the
                    // new account" bug. startedAt must be zeroed too (not just
                    // pending): start() only sets it when falsy, so a leftover
                    // timestamp from the previous user would otherwise get
                    // measured as fresh elapsed time on the very next sync()
                    // and repopulate pending right back under the new uid.
                    pending = 0;
                    startedAt = 0;
                    lastUid = newUid;
                }
                if (newUid) start(); else stop(false);
            });
        }
        start();
        return true;
    }
    if (!wireAuth()) {
        window.addEventListener('papiano-auth-ready', wireAuth, { once: true });
    }

    window.papianoPlayTime = { start: start, stop: stop, flush: function () { sync(true); } };
})();
