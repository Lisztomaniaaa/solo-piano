// Auto-update poller — reloads page when version.json changes
(function(){
    var APP_VERSION = null;
    var CHECK_MS = 120000;
    var busy = false;
    function isTyping(){
        var el = document.activeElement;
        if(!el) return false;
        var tag = (el.tagName || '').toLowerCase();
        return tag === 'input' || tag === 'textarea' || el.isContentEditable === true;
    }
    function reloadUrl(latest){
        // Preserve whatever query params the page already had (e.g.
        // multiplayer.html?stage=1&room=<id>&password=<pw> deep links) —
        // only add/overwrite `v`, never drop the rest of the query string.
        var params = new URLSearchParams(location.search);
        params.set('v', latest);
        return location.pathname + '?' + params.toString();
    }
    function applyUpdate(latest){
        try{
            if(sessionStorage.getItem('papianoReloadGuard') === latest) return;
            sessionStorage.setItem('papianoReloadGuard', latest);
        }catch(e){}
        var url = reloadUrl(latest);
        if(window.caches){
            caches.keys().then(function(names){ names.forEach(function(n){ caches.delete(n); }); }).catch(function(){}).finally(function(){
                location.replace(url);
            });
        } else {
            location.replace(url);
        }
    }
    async function fetchVersion(){
        try{
            var res = await fetch('/version.json?_=' + Date.now(), { cache:'no-store' });
            if(res.ok){
                var data = await res.json();
                return String((data && data.version) || '');
            }
        }catch(e){}
        return '';
    }
    async function init(){
        APP_VERSION = await fetchVersion();
    }
    async function check(){
        if(busy || document.hidden || !APP_VERSION) return;
        busy = true;
        var latest = await fetchVersion();
        if(latest && latest !== APP_VERSION && !isTyping()) applyUpdate(latest);
        busy = false;
    }
    init();
    setInterval(check, CHECK_MS);
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) check(); });
})();
