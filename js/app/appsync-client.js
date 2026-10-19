// === Papiano — AppSync GraphQL client (replaces Firestore/RTDB SDKs) ===
// Native fetch() for queries/mutations + AppSync's raw realtime WebSocket
// protocol for subscriptions — no Amplify, no AWS SDK. Exposed as
// window.papianoData. Auth is the Cognito ID token from window.papianoAuth.

(function () {
    var GRAPHQL_HTTP = 'https://6cljvnfz55cmbodlh5527n2oty.appsync-api.ap-southeast-1.amazonaws.com/graphql';
    var REALTIME_WS = 'wss://6cljvnfz55cmbodlh5527n2oty.appsync-realtime-api.ap-southeast-1.amazonaws.com/graphql';
    var API_HOST = '6cljvnfz55cmbodlh5527n2oty.appsync-api.ap-southeast-1.amazonaws.com';

    function b64(obj) {
        return btoa(JSON.stringify(obj));
    }

    // Always hand AppSync a token with real lifetime left — papianoAuth
    // refreshes it first when it's close to (or past) expiry.
    async function authHeader(forceRefresh) {
        var token = window.papianoAuth && await window.papianoAuth.getFreshIdToken(forceRefresh);
        if (!token) throw new Error('Not signed in.');
        return { Authorization: token, host: API_HOST };
    }

    function isTokenRejection(errorType, message) {
        var t = String(errorType || '') + ' ' + String(message || '');
        // Covers both AppSync's own Cognito-authorizer rejections (e.g.
        // "UnauthorizedException: Unable to parse JWT token" for an
        // expired/garbage token, caught before our Lambda even runs) AND
        // our resolvers' own GraphqlError('...', 'Unauthenticated') from
        // requireSignedIn(). "Unauthenticated" does NOT match "unauthorized"
        // as a substring (missed by the original regex) — verified live
        // against both error shapes before fixing.
        return /unauthori[sz]ed|unauthenticated|token has expired|not authorized|invalid.*token/i.test(t);
    }

    async function gqlOnce(query, variables, forceRefresh, opts) {
        var header = await authHeader(forceRefresh);
        var init = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: header.Authorization },
            body: JSON.stringify({ query: query, variables: variables || {} }),
        };
        // keepalive lets a page-teardown call (beforeunload) survive the
        // browser tearing down the page mid-flight — same pattern already
        // used by cognito-auth.js's own unload-time writes.
        if (opts && opts.keepalive) init.keepalive = true;
        var res = await fetch(GRAPHQL_HTTP, init);
        var body = await res.json().catch(function () { return {}; });
        if (body.errors && body.errors.length) {
            var e = new Error(body.errors[0].message || 'GraphQL error');
            e.errorType = body.errors[0].errorType || (body.errors[0].extensions && body.errors[0].extensions.code) || '';
            try { window.papianoAuth?._diag?.('gql.err', { q: String(query).replace(/\s+/g, ' ').slice(0, 60), type: e.errorType, msg: String(e.message).slice(0, 120) }); } catch (_d) {}
            throw e;
        }
        return body.data;
    }

    async function gql(query, variables, opts) {
        try {
            return await gqlOnce(query, variables, false, opts);
        } catch (e) {
            // Clock skew / a token that expired mid-flight: force one refresh
            // and retry once, so a momentarily stale token never surfaces as
            // a fake "logged out" failure to the UI.
            if (isTokenRejection(e.errorType, e.message)) {
                return await gqlOnce(query, variables, true, opts);
            }
            throw e;
        }
    }

    // ---- Realtime subscriptions (AppSync raw WebSocket protocol) ----
    var ws = null;
    var wsConnectPromise = null;
    var subs = {}; // id -> { query, variables, onData, onError, onClose, onReconnect }
    var reconnectTimer = null;
    var reconnectDelay = 1000; // ms, doubles up to RECONNECT_MAX_DELAY
    var RECONNECT_MAX_DELAY = 20000;

    function genId() {
        if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
        return 'id_' + Math.random().toString(36).slice(2) + Date.now();
    }

    // The socket drops on its own (idle timeout, sleep/wake, wifi<->cellular
    // handoff, backgrounded tab) far more often than any caller expects, and
    // there used to be no reconnect at all — a single drop silently killed
    // every live subscription (room roster, seats, moderation, and the note
    // stream itself) until a full page reload. Now: keep retrying with
    // backoff and re-issue 'start' for every still-active subscription id,
    // so callers never have to know the socket churned. Only give up for
    // real sign-outs (authHeader's 'Not signed in.'), not transient network
    // failures.
    function scheduleReconnect() {
        if (reconnectTimer) return;
        if (!Object.keys(subs).length) return; // nothing to restore
        reconnectTimer = setTimeout(async function () {
            reconnectTimer = null;
            try {
                var sock = await openSocket();
                reconnectDelay = 1000;
                await Promise.all(Object.keys(subs).map(function (id) {
                    return startSub(sock, id, subs[id]).then(function () {
                        if (subs[id] && subs[id].onReconnect) {
                            try { subs[id].onReconnect(); } catch (_e) {}
                        }
                    });
                }));
            } catch (e) {
                if (String(e && e.message) === 'Not signed in.') {
                    Object.keys(subs).forEach(function (id) {
                        var sub = subs[id];
                        if (sub && sub.onClose) { try { sub.onClose(); } catch (_e) {} }
                        delete subs[id];
                    });
                    return;
                }
                reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_DELAY);
                scheduleReconnect();
            }
        }, reconnectDelay);
    }

    function openSocket() {
        if (wsConnectPromise) return wsConnectPromise;
        wsConnectPromise = (async function () {
            var header = await authHeader(false);
            return await new Promise(function (resolve, reject) {
            var url = REALTIME_WS
                + '?header=' + encodeURIComponent(b64(header))
                + '&payload=' + encodeURIComponent(b64({}));
            var sock = new WebSocket(url, 'graphql-ws');
            var settled = false;

            sock.onopen = function () {
                sock.send(JSON.stringify({ type: 'connection_init' }));
            };
            sock.onmessage = function (ev) {
                var msg;
                try { msg = JSON.parse(ev.data); } catch (_e) { return; }
                if (msg.type === 'connection_ack') {
                    if (!settled) { settled = true; ws = sock; resolve(sock); }
                } else if (msg.type === 'data') {
                    var sub = subs[msg.id];
                    if (sub && sub.onData) sub.onData(msg.payload && msg.payload.data);
                } else if (msg.type === 'error') {
                    var sub2 = subs[msg.id];
                    if (sub2 && sub2.onError) sub2.onError(msg.payload);
                    if (!settled) { settled = true; reject(new Error('Realtime connection failed')); }
                }
                // 'ka' (keep-alive) and 'start_ack' need no handling.
            };
            sock.onerror = function () {
                if (!settled) { settled = true; reject(new Error('Realtime socket error')); }
            };
            sock.onclose = function () {
                ws = null;
                wsConnectPromise = null;
                scheduleReconnect();
            };
            });
        })();
        wsConnectPromise.catch(function () { wsConnectPromise = null; });
        return wsConnectPromise;
    }

    async function startSub(sock, id, sub) {
        var header = await authHeader(false);
        sock.send(JSON.stringify({
            id: id,
            type: 'start',
            payload: {
                data: JSON.stringify({ query: sub.query, variables: sub.variables || {} }),
                extensions: { authorization: header },
            },
        }));
    }

    // Returns an unsubscribe function. onData(data) fires per event;
    // onError(payload) fires on subscription-level errors; onClose() fires
    // only when the subscription is given up for good (real sign-out) —
    // transient drops are reconnected automatically. onReconnect() (optional)
    // fires after the socket comes back, so a caller backed by a point-in-time
    // query (not just a live delta) can re-fetch to cover the gap.
    async function subscribe(query, variables, onData, onError, onClose, onReconnect) {
        var sock = await openSocket();
        var id = genId();
        subs[id] = { query: query, variables: variables, onData: onData, onError: onError, onClose: onClose, onReconnect: onReconnect };
        await startSub(sock, id, subs[id]);
        return function unsubscribe() {
            delete subs[id];
            if (ws) {
                try { ws.send(JSON.stringify({ id: id, type: 'stop' })); } catch (_e) {}
            }
        };
    }

    window.papianoData = { gql: gql, subscribe: subscribe };
})();
