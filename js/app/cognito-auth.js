// === Papiano — Cognito Auth (replaces firebase-auth-compat.js) ===
// Native fetch() against the Cognito Identity Provider REST API + the
// Hosted UI OAuth2/PKCE redirect flow for Google federation — no AWS SDK,
// no third-party auth library. Mirrors the subset of the firebase.auth()
// API surface that app.js / auth-email.js actually call, so the rest of
// the app can be migrated with small, targeted edits.
//
// Session lifecycle guarantees:
//  - Persisted tokens are ALWAYS restored on load, even when a stale
//    ?code= redirect param fails to exchange (reload/back-button cases).
//  - Tokens are refreshed proactively (timer + tab-visibility + before
//    every API call via getFreshIdToken), so a session never silently
//    dies at the 60-minute ID-token expiry while the app is open.
//  - Refresh is dual-path: the native InitiateAuth REFRESH_TOKEN_AUTH
//    first, falling back to the Hosted UI /oauth2/token endpoint (the
//    canonical path for Google-federated refresh tokens).
//  - signOut() only revokes THIS session's refresh token (RevokeToken),
//    never GlobalSignOut — logging out on one device must not force a
//    re-login on every other device.
//
// Exposed as window.papianoAuth.

(function () {
    var REGION = 'ap-southeast-1';
    var CLIENT_ID = '6np9l79eo6om3dtm3f1kgghajn';
    // Custom domain (same-site with the app!) — the Hosted UI session
    // cookie is reachable from papiano.app pages via background fetch, so
    // sign-out clears it silently with zero navigation. The old
    // papiano-auth.auth.ap-southeast-1.amazoncognito.com prefix domain
    // still exists on the pool but is no longer used by the frontend.
    var COGNITO_DOMAIN = 'auth.papiano.app';
    var IDP_ENDPOINT = 'https://cognito-idp.' + REGION + '.amazonaws.com/';
    var TOKEN_ENDPOINT = 'https://' + COGNITO_DOMAIN + '/oauth2/token';
    // Only paths registered as Cognito Callback/Logout URLs may be used in
    // OAuth redirects. '/', and '/admin.html' are registered; anything else
    // (piano pages) must bounce through the root.
    var OAUTH_PATH = (location.pathname === '/' || location.pathname === '/admin.html') ? location.pathname : '/';
    var REDIRECT_URI = location.origin + OAUTH_PATH;

    var TOK_ID = 'papiano_id_token';
    var TOK_ACCESS = 'papiano_access_token';
    var TOK_REFRESH = 'papiano_refresh_token';
    var PKCE_KEY = 'papiano_pkce_verifier';
    // Set when a sign-out couldn't clear the Hosted UI SSO cookie on the
    // Cognito domain (cross-site → impossible without a navigation). The
    // next Google sign-in consumes it by bouncing through /logout first.
    var SSO_STALE_KEY = 'papiano_sso_stale';
    // Set just before that /logout bounce; on return, init() consumes it
    // and continues straight into the Google authorize redirect.
    var RESUME_GOOGLE_KEY = 'papiano_resume_google';
    // When the auth domain is a papiano.app subdomain, requests from the
    // app are same-site, so SameSite=Lax session cookies DO travel on a
    // background fetch — sign-out can clear the Hosted UI session silently.
    var SAME_SITE_AUTH = /\.papiano\.app$/.test(COGNITO_DOMAIN);

    // Refresh when less than this much ID-token lifetime remains.
    var REFRESH_SKEW_MS = 5 * 60 * 1000;
    var MAINTAIN_INTERVAL_MS = 60 * 1000;

    var currentUser = null;
    var idToken = null, accessToken = null, refreshToken = null;
    var listeners = [];
    var resolved = false;
    var refreshInFlight = null;

    function b64url(buf) {
        var bytes = new Uint8Array(buf);
        var bin = '';
        for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    async function makePkcePair() {
        var verifierBytes = new Uint8Array(32);
        crypto.getRandomValues(verifierBytes);
        var verifier = b64url(verifierBytes);
        var digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
        return { verifier: verifier, challenge: b64url(digest) };
    }

    function decodeJwt(token) {
        var payload = token.split('.')[1];
        return JSON.parse(decodeURIComponent(escape(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))));
    }

    function userFromIdToken(token) {
        var c = decodeJwt(token);
        var isFederated = !!c.identities;
        return {
            uid: c.sub,
            email: c.email || '',
            displayName: c.name || c.given_name || (c.email ? c.email.split('@')[0] : 'Papiano User'),
            photoURL: c.picture || '',
            emailVerified: c.email_verified === true || c.email_verified === 'true',
            providerData: [{ providerId: isFederated ? 'google.com' : 'password' }],
        };
    }

    function idTokenExpiryMs() {
        if (!idToken) return 0;
        try { return decodeJwt(idToken).exp * 1000; } catch (_e) { return 0; }
    }

    function persistTokens() {
        try {
            if (idToken) localStorage.setItem(TOK_ID, idToken); else localStorage.removeItem(TOK_ID);
            if (accessToken) localStorage.setItem(TOK_ACCESS, accessToken); else localStorage.removeItem(TOK_ACCESS);
            if (refreshToken) localStorage.setItem(TOK_REFRESH, refreshToken); else localStorage.removeItem(TOK_REFRESH);
        } catch (_e) {}
    }

    function loadPersistedTokens() {
        try {
            idToken = localStorage.getItem(TOK_ID) || null;
            accessToken = localStorage.getItem(TOK_ACCESS) || null;
            refreshToken = localStorage.getItem(TOK_REFRESH) || null;
        } catch (_e) {}
    }

    function clearTokens() {
        idToken = accessToken = refreshToken = null;
        persistTokens();
    }

    function notify() {
        listeners.forEach(function (cb) { try { cb(currentUser); } catch (_e) {} });
    }

    async function cognitoRequest(action, body, opts) {
        var res = await fetch(IDP_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSCognitoIdentityProviderService.' + action,
            },
            body: JSON.stringify(body),
            keepalive: !!(opts && opts.keepalive),
        });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok) {
            var err = new Error(data.message || (action + ' failed'));
            err.code = data.__type || '';
            throw err;
        }
        return data;
    }

    // A structured rejection carries a .code (Cognito API error type or
    // OAuth error string); a plain network failure (fetch() rejected) does
    // not. Only structured rejections mean the session is genuinely over.
    function isAuthRejection(e) {
        return !!(e && e.code !== undefined);
    }

    async function setSession(authResult) {
        idToken = authResult.IdToken;
        accessToken = authResult.AccessToken;
        if (authResult.RefreshToken) refreshToken = authResult.RefreshToken;
        persistTokens();
        var wasSignedOut = !currentUser;
        currentUser = userFromIdToken(idToken);
        // Token rotation for the same user must not re-run the app's
        // sign-in bootstrap — only notify when the signed-in state flips.
        if (wasSignedOut) notify();
        return currentUser;
    }

    // localStorage is the single source of truth for the session. Multiple
    // tabs (and bfcache-restored pages) share it; a tab must never refresh
    // with — or destroy a session over — a token that only exists in its
    // own stale memory. Re-read storage, adopt whatever is there.
    function syncFromStorage() {
        var prevUid = currentUser ? currentUser.uid : null;
        loadPersistedTokens();
        if (!idToken) {
            currentUser = null;
            if (prevUid) notify();
            return;
        }
        try {
            var next = userFromIdToken(idToken);
            currentUser = next;
            if (next.uid !== prevUid) notify();
        } catch (_e) {}
    }

    function storedRefreshToken() {
        try { return localStorage.getItem(TOK_REFRESH) || null; } catch (_e) { return refreshToken; }
    }

    async function doRefresh() {
        // Work only from the freshest persisted state: a stale tab must
        // refresh with the CURRENT session's token, never its own old copy
        // (which may belong to a revoked session or even another account).
        syncFromStorage();
        var rt = refreshToken;
        if (!rt) {
            var e0 = new Error('No refresh token');
            e0.code = 'NoRefreshToken'; e0.failedToken = null;
            throw e0;
        }
        function finish(result) {
            // If another tab replaced the session while this request was in
            // flight (re-login, account switch), do NOT clobber it — adopt.
            var stored = storedRefreshToken();
            if (stored && stored !== rt) { syncFromStorage(); return; }
            return setSession(result);
        }

        // Path 1: the OAuth token endpoint — the canonical refresh route,
        // and the ONLY authority allowed to condemn a refresh token. Ending
        // the session requires its explicit 'invalid_grant'; every other
        // failure shape (429, 5xx, empty body, fetch rejection) is treated
        // as transient so a network blip can never destroy a valid session.
        var invalidGrantErr = null;
        try {
            var res = await fetch(TOKEN_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    client_id: CLIENT_ID,
                    refresh_token: rt,
                }).toString(),
            });
            var d = await res.json().catch(function () { return null; });
            if (res.ok && d && d.id_token) {
                await finish({ IdToken: d.id_token, AccessToken: d.access_token, RefreshToken: d.refresh_token });
                return;
            }
            if (d && d.error === 'invalid_grant') {
                invalidGrantErr = new Error(d.error_description || 'Refresh token is no longer valid');
                invalidGrantErr.code = 'invalid_grant';
                invalidGrantErr.failedToken = rt;
            }
        } catch (_net) {}

        // Path 2: native InitiateAuth. WARNING: for Google-federated users
        // this API can answer NotAuthorizedException "Refresh Token has
        // been revoked" even when the token is perfectly valid (verified
        // against CloudTrail: the failing token had zero revocation events)
        // — so its rejection must NEVER end the session by itself. It only
        // gets to rescue: a success here heals the session.
        try {
            var data = await cognitoRequest('InitiateAuth', {
                AuthFlow: 'REFRESH_TOKEN_AUTH',
                ClientId: CLIENT_ID,
                AuthParameters: { REFRESH_TOKEN: rt },
            });
            var ar = data && data.AuthenticationResult;
            if (ar && ar.IdToken) {
                await finish({ IdToken: ar.IdToken, AccessToken: ar.AccessToken });
                return;
            }
        } catch (_e2) {}

        if (invalidGrantErr) throw invalidGrantErr; // canonical endpoint condemned it
        var transient = new Error('Refresh failed (transient)');
        transient.failedToken = rt;
        throw transient; // no .code — callers keep the tokens and retry later
    }

    // A structured refresh rejection means THAT token's session is over —
    // but only end the app session if that token is still the stored one.
    // If storage moved on (another tab re-logged in or switched accounts),
    // rescue this tab by adopting the newer session instead of nuking it.
    function refreshRejected(failedRt) {
        var stored = storedRefreshToken();
        if (stored && stored !== failedRt) {
            syncFromStorage();
            return true; // rescued
        }
        endSession();
        return false;
    }

    // Single-flight: concurrent callers share one refresh round-trip.
    function refreshSession() {
        if (!refreshInFlight) {
            refreshInFlight = doRefresh().finally(function () { refreshInFlight = null; });
        }
        return refreshInFlight;
    }

    function endSession() {
        clearTokens();
        var wasSignedIn = !!currentUser;
        currentUser = null;
        if (wasSignedIn) notify();
    }

    // Returns an ID token guaranteed fresh enough for an API call,
    // refreshing first when little lifetime remains. Never throws:
    // returns null when there is no usable session.
    async function getFreshIdToken(forceRefresh) {
        if (!idToken && !refreshToken) return null;
        var msLeft = idTokenExpiryMs() - Date.now();
        if (!forceRefresh && msLeft > REFRESH_SKEW_MS) return idToken;
        if (!refreshToken) return msLeft > 0 ? idToken : null;
        try {
            await refreshSession();
        } catch (e) {
            if (isAuthRejection(e)) {
                refreshRejected(e.failedToken);
                // Either rescued by a newer stored session (whose token may
                // be usable as-is) or genuinely signed out (idToken null).
                return idTokenExpiryMs() > Date.now() ? idToken : null;
            }
            // Network blip: hand back the current token if it still has any
            // life in it; the maintenance loop retries the refresh later.
            return idTokenExpiryMs() > Date.now() ? idToken : null;
        }
        return idToken;
    }

    async function handleRedirectCallback() {
        var params = new URLSearchParams(location.search);
        var code = params.get('code');
        var err = params.get('error');
        if (err) {
            history.replaceState({}, '', location.pathname);
            return { error: err, description: params.get('error_description') || '' };
        }
        if (!code) return null;
        var verifier = sessionStorage.getItem(PKCE_KEY) || '';
        history.replaceState({}, '', location.pathname);
        var body = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: CLIENT_ID,
            code: code,
            redirect_uri: REDIRECT_URI,
            code_verifier: verifier,
        });
        var res = await fetch(TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok) { throw new Error(data.error_description || data.error || 'Google sign-in failed.'); }
        try { sessionStorage.removeItem(PKCE_KEY); } catch (_e) {}
        await setSession({ IdToken: data.id_token, AccessToken: data.access_token, RefreshToken: data.refresh_token });
        return { ok: true };
    }

    async function restorePersistedSession() {
        if (!idToken) return;
        var claims = null;
        try { claims = decodeJwt(idToken); } catch (_e) {}
        if (claims && claims.exp * 1000 > Date.now() + 30000) {
            currentUser = userFromIdToken(idToken);
            return;
        }
        if (!refreshToken) {
            clearTokens();
            return;
        }
        try {
            await refreshSession();
        } catch (e) {
            if (isAuthRejection(e)) {
                // Cognito itself rejected the refresh token — that session
                // is over (unless a newer one exists in storage).
                refreshRejected(e.failedToken);
            } else {
                // Network-level failure — common right after a phone wakes
                // from sleep, where the first request fires before the
                // network is ready. One short retry, then keep the tokens:
                // the maintenance loop below heals the session as soon as
                // connectivity returns, without forcing a fresh login.
                await new Promise(function (r) { setTimeout(r, 1200); });
                try {
                    await refreshSession();
                } catch (e2) {
                    if (isAuthRejection(e2)) refreshRejected(e2.failedToken);
                }
            }
        }
    }

    async function init() {
        // Returning from the pre-sign-in /logout bounce? Head straight into
        // the Google authorize redirect — the user already clicked "sign in
        // with Google"; this page load is just a hop in that flow.
        try {
            if (sessionStorage.getItem(RESUME_GOOGLE_KEY) === '1') {
                sessionStorage.removeItem(RESUME_GOOGLE_KEY);
                await signInWithGoogleRedirect();
                return; // navigating away
            }
        } catch (_e) {}

        // Restore FIRST: a failed ?code= exchange (stale code from a reload
        // or back-button) must never wipe out a valid stored session.
        loadPersistedTokens();

        var redirectError = null;
        try {
            var redirectResult = await handleRedirectCallback();
            if (redirectResult && redirectResult.ok) {
                resolved = true;
                notify();
                // Only ever set by /login (js/app/login.js) right before sending
                // the user into this same Google redirect round trip -- OAUTH_PATH
                // always lands the ?code= exchange back on "/" regardless of where
                // the flow started, so this is the one place that can send a
                // /login-initiated sign-in on to wherever it actually meant to go
                // instead of stranding it on the homepage.
                try {
                    var pendingReturn = sessionStorage.getItem('papiano_post_login_return');
                    if (pendingReturn) {
                        sessionStorage.removeItem('papiano_post_login_return');
                        location.replace(pendingReturn);
                        return;
                    }
                } catch (_e) {}
                return;
            }
            if (redirectResult && redirectResult.error) {
                redirectError = { error: redirectResult.error, description: redirectResult.description };
            }
        } catch (e) {
            redirectError = { description: e.message };
        }

        await restorePersistedSession();
        resolved = true;
        notify();
        // Only surface the redirect error when it actually left the user
        // signed out — e.g. don't flash "sign-in failed" over a session
        // that was safely restored from storage.
        if (redirectError && !currentUser) {
            window.dispatchEvent(new CustomEvent('papiano-auth-error', { detail: redirectError }));
        }
    }

    // ---- Session maintenance -------------------------------------------
    // Keeps the ID token fresh while the app is open, and heals sessions
    // interrupted by connectivity loss (phone sleep, tab suspend).
    async function maintainSession() {
        if (resolved) syncFromStorage(); // heap follows storage, always
        if (!refreshToken || document.hidden) return;
        var msLeft = idTokenExpiryMs() - Date.now();
        if (msLeft > REFRESH_SKEW_MS && currentUser) return;
        try {
            await refreshSession();
        } catch (e) {
            if (isAuthRejection(e)) refreshRejected(e.failedToken);
            // else: transient network issue — next tick retries.
        }
    }
    setInterval(maintainSession, MAINTAIN_INTERVAL_MS);
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) maintainSession();
    });
    // bfcache restores bring back a page with a frozen JS heap that missed
    // every storage event while suspended — resync before it acts on (or
    // revokes!) tokens that may belong to a long-dead session.
    window.addEventListener('pageshow', function (e) {
        if (e.persisted) maintainSession();
    });

    // ---- Cross-tab sync -------------------------------------------------
    // Piano pages, the main app, and admin share one localStorage session.
    // When another tab signs in/out or rotates tokens, adopt its state.
    window.addEventListener('storage', function (e) {
        if (e.key !== null && e.key !== TOK_ID && e.key !== TOK_ACCESS && e.key !== TOK_REFRESH) return;
        syncFromStorage();
    });

    function onAuthStateChanged(cb) {
        listeners.push(cb);
        // The immediate "already resolved" callback MUST be deferred, never
        // synchronous. On the fast boot path (valid stored token, zero
        // network) init() resolves in microtasks BEFORE app.min.js even
        // evaluates, so app.js registers its bootstrap listener while its
        // own top-level statements are still running — a synchronous cb
        // re-enters app.js and hits `authStateResolved = true` before that
        // `let` exists, dying on a TDZ ReferenceError. The listener then
        // never re-fires (token rotations don't notify), leaving the whole
        // app permanently "logged out" over a perfectly valid session.
        if (resolved) {
            var fire = function () {
                if (listeners.indexOf(cb) >= 0) cb(currentUser);
            };
            if (typeof queueMicrotask === 'function') queueMicrotask(fire);
            else Promise.resolve().then(fire);
        }
        return function () {
            var i = listeners.indexOf(cb);
            if (i >= 0) listeners.splice(i, 1);
        };
    }

    // Fire-and-forget revocation of THIS session's refresh token (and the
    // access/ID tokens minted from it). Deliberately not GlobalSignOut:
    // logging out here must not kill the user's sessions on other devices.
    function revokeSessionToken(token) {
        if (!token) return;
        try {
            cognitoRequest('RevokeToken', { Token: token, ClientId: CLIENT_ID }, { keepalive: true }).catch(function () {});
        } catch (_e) {}
    }

    // Instant sign-out: clears local state and notifies the UI immediately —
    // no navigation, no reload. The refresh-token revocation runs in the
    // background (keepalive, so it survives even if the user navigates).
    //
    // The Hosted UI's SSO session cookie on the Cognito domain is the one
    // thing that can't always be cleared from here: it's SameSite=Lax, so a
    // cross-site background fetch never carries it. Two strategies:
    //  - Same-site auth domain (auth.papiano.app): the fetch DOES carry the
    //    cookie — clear the session silently right now.
    //  - Cross-site (amazoncognito.com): mark the session stale; the next
    //    Google sign-in bounces through /logout first (see
    //    signInWithGoogleRedirect), clearing it in a navigation that flow
    //    already needs. Email sign-in is unaffected either way.
    async function signOut() {
        // Logout means "end the CURRENT session" — sync from storage first
        // so a stale tab revokes the real session's token, not an old copy
        // from its own frozen heap.
        syncFromStorage();
        var rt = refreshToken;
        endSession();
        revokeSessionToken(rt);
        if (SAME_SITE_AUTH) {
            try {
                fetch('https://' + COGNITO_DOMAIN + '/logout?client_id=' + CLIENT_ID
                    + '&logout_uri=' + encodeURIComponent(REDIRECT_URI),
                    { mode: 'no-cors', credentials: 'include', keepalive: true }).catch(function () {});
            } catch (_e) {}
        } else {
            try { localStorage.setItem(SSO_STALE_KEY, '1'); } catch (_e) {}
        }
    }

    // Programmatic sign-out (ban watcher, deleted-account gate, delete
    // fallback): clears this browser's session WITHOUT revoking the refresh
    // token. Revocation is reserved for the user actually pressing Log out —
    // a false positive in an automated path must never permanently poison a
    // valid session server-side.
    function signOutLocal() {
        syncFromStorage();
        endSession();
    }

    async function signInWithEmailAndPassword(email, password, captchaToken) {
        var params = {
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: CLIENT_ID,
            AuthParameters: { USERNAME: email, PASSWORD: password },
        };
        // Cloudflare Turnstile token — Cognito forwards ClientMetadata to the
        // Pre-Authentication Lambda trigger (as request.validationData /
        // request.clientMetadata), which verifies it server-side. A missing
        // token is left for the trigger to decide on (soft vs enforce mode),
        // never blocked here, since the client is not the security boundary.
        if (captchaToken) params.ClientMetadata = { captchaToken: String(captchaToken) };
        var data = await cognitoRequest('InitiateAuth', params);
        if (data.ChallengeName) {
            var e = new Error('Additional verification is required for this account.');
            e.code = data.ChallengeName;
            throw e;
        }
        var user = await setSession(data.AuthenticationResult);
        return { user: user };
    }

    async function signUpWithEmailAndPassword(email, password, displayName, captchaToken) {
        var params = {
            ClientId: CLIENT_ID,
            Username: email,
            Password: password,
            UserAttributes: [
                { Name: 'email', Value: email },
                { Name: 'name', Value: displayName },
            ],
        };
        // Turnstile token forwarded to the Pre Sign-up trigger (native
        // sign-ups only) via ClientMetadata — same server-side check as login.
        if (captchaToken) params.ClientMetadata = { captchaToken: String(captchaToken) };
        await cognitoRequest('SignUp', params);
    }

    async function confirmSignUp(email, code) {
        await cognitoRequest('ConfirmSignUp', { ClientId: CLIENT_ID, Username: email, ConfirmationCode: code });
    }

    async function resendConfirmationCode(email) {
        await cognitoRequest('ResendConfirmationCode', { ClientId: CLIENT_ID, Username: email });
    }

    async function forgotPassword(email) {
        await cognitoRequest('ForgotPassword', { ClientId: CLIENT_ID, Username: email });
    }

    async function confirmForgotPassword(email, code, newPassword) {
        await cognitoRequest('ConfirmForgotPassword', {
            ClientId: CLIENT_ID, Username: email, ConfirmationCode: code, Password: newPassword,
        });
    }

    async function deleteCurrentUser() {
        if (!accessToken) throw new Error('Not signed in.');
        await cognitoRequest('DeleteUser', { AccessToken: accessToken });
        clearTokens();
        currentUser = null;
        notify();
    }

    // Re-runs the password sign-in to obtain a fresh access token before a
    // sensitive operation (account deletion) — Cognito's equivalent of
    // Firebase's reauthenticateWithCredential.
    async function reauthenticateWithPassword(email, password, captchaToken) {
        await signInWithEmailAndPassword(email, password, captchaToken);
    }

    async function signInWithGoogleRedirect() {
        // A previous sign-out left a stale Hosted UI session on the Cognito
        // domain (cross-site, uncleaable at logout time). Bounce through
        // /logout first — it clears the session and 302s straight back to
        // this page, where init() sees RESUME_GOOGLE_KEY and continues into
        // the real authorize redirect. One extra hop, only on the first
        // Google sign-in after a logout, and only until the auth domain
        // moves same-site.
        var stale = false;
        try {
            stale = localStorage.getItem(SSO_STALE_KEY) === '1';
            if (stale) localStorage.removeItem(SSO_STALE_KEY);
        } catch (_e) {}
        if (stale && !SAME_SITE_AUTH) {
            try { sessionStorage.setItem(RESUME_GOOGLE_KEY, '1'); } catch (_e) {}
            location.href = 'https://' + COGNITO_DOMAIN + '/logout?client_id=' + CLIENT_ID
                + '&logout_uri=' + encodeURIComponent(REDIRECT_URI);
            return;
        }
        var pair = await makePkcePair();
        sessionStorage.setItem(PKCE_KEY, pair.verifier);
        var params = new URLSearchParams({
            client_id: CLIENT_ID,
            response_type: 'code',
            scope: 'openid email profile aws.cognito.signin.user.admin',
            redirect_uri: REDIRECT_URI,
            code_challenge: pair.challenge,
            code_challenge_method: 'S256',
            identity_provider: 'Google',
            // NOTE: do not bother with prompt=select_account here — verified
            // empirically that Cognito does NOT forward it to Google (the
            // authorize redirect to accounts.google.com carries no prompt
            // param). Google shows its account chooser on its own whenever
            // the browser holds more than one Google session; with a single
            // session it signs in silently, which is standard SSO behavior.
        });
        location.href = 'https://' + COGNITO_DOMAIN + '/oauth2/authorize?' + params.toString();
    }

    var papianoAuth = {
        get currentUser() { return currentUser; },
        onAuthStateChanged: onAuthStateChanged,
        signOut: signOut,
        signOutLocal: signOutLocal,
        signInWithEmailAndPassword: signInWithEmailAndPassword,
        signUpWithEmailAndPassword: signUpWithEmailAndPassword,
        confirmSignUp: confirmSignUp,
        resendConfirmationCode: resendConfirmationCode,
        forgotPassword: forgotPassword,
        confirmForgotPassword: confirmForgotPassword,
        deleteCurrentUser: deleteCurrentUser,
        reauthenticateWithPassword: reauthenticateWithPassword,
        signInWithGoogleRedirect: signInWithGoogleRedirect,
        getIdToken: function () { return idToken; },
        getAccessToken: function () { return accessToken; },
        getFreshIdToken: getFreshIdToken,
    };
    window.papianoAuth = papianoAuth;

    init().then(function () {
        window.__papianoAuthReady = true;
        window.dispatchEvent(new Event('papiano-auth-ready'));
    });
})();
