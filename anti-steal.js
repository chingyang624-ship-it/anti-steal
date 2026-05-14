/*!
 * Anti-Steal Protection v8 (password-gated, customer-safe)
 *
 * Behaviour:
 * - Normal visitors (no DevTools): browse normally, never affected
 * - ANYONE who opens DevTools, before OR after page load: white screen
 * - The ONLY way to inspect is the password (set via #__dev__= , then
 *   stored in localStorage). There is no free "grace mode" bypass anymore.
 * - Touch devices skip DevTools detection (mobile metrics are unreliable)
 * - No raf-drift / debugger / mass-clear (those caused false positives)
 *
 * HOW THE OWNER UNLOCKS: see notes at the very bottom of this file.
 */
(function () {
    'use strict';

    var DEV_KEY = 'Yang_2004_dev';

    var _setInterval = window.setInterval.bind(window);
    var _addEventListener = EventTarget.prototype.addEventListener;
    var _warn = (window.console && console.warn) ? console.warn.bind(console) : function () {};

    // --- skip on localhost / dev hosts ---
    try {
        var host = location.hostname || '';
        if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0'
            || host === '' || host.indexOf('192.168.') === 0 || host.indexOf('10.') === 0
            || /\.local$/.test(host) || host.indexOf('dev.') === 0
            || location.protocol === 'file:') {
            _warn('[anti-steal] local/dev host - skipped');
            return;
        }
    } catch (e) {}

    // --- password unlock: localStorage is the permanent switch ---
    try {
        if (localStorage.getItem('__asd_dev__') === DEV_KEY) {
            _warn('[anti-steal] dev mode - skipped');
            return;
        }
    } catch (e) {}

    // --- password unlock: accept the key from URL query OR hash, then store it ---
    // The #hash is tried because some site builders strip the ?query before
    // this script runs, but usually leave the #hash alone.
    try {
        var fromQuery = null, fromHash = null;
        try { fromQuery = new URL(location.href).searchParams.get('__dev__'); } catch (e) {}
        try {
            var m = (location.hash || '').match(/__dev__=([^&]+)/);
            if (m) fromHash = decodeURIComponent(m[1]);
        } catch (e) {}
        if (fromQuery === DEV_KEY || fromHash === DEV_KEY) {
            try { localStorage.setItem('__asd_dev__', DEV_KEY); } catch (e) {}
            try {
                var u = new URL(location.href);
                u.searchParams.delete('__dev__');
                u.hash = (u.hash || '').replace(/[#&]?__dev__=[^&]*/, '');
                history.replaceState({}, '', u.toString());
            } catch (e) {}
            _warn('[anti-steal] dev key accepted - unlocked for this browser');
            return;
        }
    } catch (e) {}

    // --- environment flags ---
    var IS_TOUCH = false;
    try {
        IS_TOUCH = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
            || (navigator.maxTouchPoints || 0) > 0
            || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    } catch (e) {}

    var KILLED = false;
    function kill() {
        if (KILLED) return;
        KILLED = true;
        try { window.stop(); } catch (e) {}
        try {
            document.documentElement.innerHTML =
                '<head><meta charset="utf-8">'
                + '<meta name="viewport" content="width=device-width,initial-scale=1">'
                + '<style>html,body{background:#fff;font-family:system-ui;margin:0;'
                + 'padding:40px;color:#222;font-size:16px}</style>'
                + '</head><body><h2>Access denied</h2></body>';
        } catch (e) {}
    }

    // ============ Layer 1: deterrence (never breaks anything for visitors) ============
    var css = document.createElement('style');
    css.textContent =
        'html,body,body *{-webkit-user-select:none!important;-moz-user-select:none!important;'
        + 'user-select:none!important;-webkit-touch-callout:none!important;}'
        + 'input,textarea,[contenteditable="true"]{-webkit-user-select:text!important;'
        + 'user-select:text!important;}'
        + 'img,video,canvas{-webkit-user-drag:none!important;user-drag:none!important;}';
    try { (document.documentElement || document.head).appendChild(css); } catch (e) {}

    function blockEvent(e) {
        var tag = (e.target && e.target.tagName) || '';
        var editable = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable);
        if (editable && ['copy', 'cut', 'paste', 'selectstart'].indexOf(e.type) !== -1) return;
        try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
        return false;
    }
    ['contextmenu', 'selectstart', 'copy', 'cut', 'dragstart'].forEach(function (ev) {
        try { _addEventListener.call(document, ev, blockEvent, { capture: true }); } catch (e) {}
    });

    _addEventListener.call(document, 'keydown', function (e) {
        var k = (e.key || '').toLowerCase();
        var cm = e.ctrlKey || e.metaKey;
        if (k === 'f12'
            || (cm && e.shiftKey && ['i', 'j', 'c', 'k'].indexOf(k) !== -1)
            || (cm && !e.shiftKey && ['u', 's'].indexOf(k) !== -1)) {
            try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
            return false;
        }
    }, { capture: true });

    // ============ Layer 2: DevTools detection -> white screen ============
    // Touch devices: skip entirely (mobile viewport metrics are unreliable).
    if (IS_TOUCH) return;

    var initDPR = window.devicePixelRatio || 1;
    var initScale = (window.visualViewport && window.visualViewport.scale) || 1;

    // Window-gap method, zoom-guarded so that zooming never triggers a kill.
    function devtoolsByGap() {
        try {
            var dpr = window.devicePixelRatio || 1;
            var scale = (window.visualViewport && window.visualViewport.scale) || 1;
            if (Math.abs(dpr - initDPR) > 0.02 || Math.abs(scale - initScale) > 0.02) return false;
            var wGap = (window.outerWidth || 0) - (window.innerWidth || 0);
            var hGap = (window.outerHeight || 0) - (window.innerHeight || 0);
            return wGap > 200 || hGap > 200;
        } catch (e) { return false; }
    }

    // Console getter trap: only fires when DevTools console actually renders it.
    var consoleHit = false;
    var trap = {};
    try {
        Object.defineProperty(trap, 'id', { get: function () { consoleHit = true; return ''; } });
    } catch (e) {}

    // NO grace mode: DevTools open at ANY time -> kill. Still requires 2
    // consecutive hits so a single transient glitch cannot cause a false kill.
    var streak = 0;
    var NEED = 2;

    _setInterval(function () {
        if (KILLED) return;
        if (document.hidden) { streak = 0; return; }   // ignore background tabs

        var hit = false;
        try {
            if (devtoolsByGap()) hit = true;
            consoleHit = false;
            console.log('%c', trap);
            if (consoleHit) hit = true;
        } catch (e) {}

        if (hit) {
            streak++;
            if (streak >= NEED) kill();
        } else {
            streak = 0;
        }
    }, 700);

})();

/*
 * ====================================================================
 * HOW YOU (the site owner) UNLOCK & INSPECT YOUR OWN SITE
 * ====================================================================
 * There is NO free bypass. The password (the localStorage key) is the
 * only way in. Set it once per browser:
 *
 * METHOD A - try this first (hash key):
 *   Visit:  https://truedinkum.com/#__dev__=Yang_2004_dev
 *   If your site builder leaves the #hash alone, the script reads it,
 *   stores the password in localStorage, and unlocks THIS browser
 *   permanently. After that you can open DevTools freely.
 *
 * METHOD B - if Method A does not work (builder strips the hash too):
 *   1. In your site builder, temporarily REMOVE the anti-steal loader
 *      snippet. Save / publish.
 *   2. Visit your site, press F12, open the Console tab, run:
 *        localStorage.setItem('__asd_dev__', 'Yang_2004_dev')
 *   3. Put the anti-steal loader snippet back. Save / publish.
 *   4. This browser is now unlocked permanently.
 *
 * To LOCK this browser again (turn dev mode off):
 *   Open the Console and run:  localStorage.removeItem('__asd_dev__')
 * ====================================================================
 */
