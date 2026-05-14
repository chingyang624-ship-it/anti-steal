/*!
 * Anti-Steal Protection v7 (customer-safe)
 *
 * Changes vs v6:
 * - Removed false-positive-prone checks: raf-drift, debugger statement, mass-clear
 * - DevTools detection: window-gap + console trap only, zoom-guarded,
 *   requires 4 consecutive hits before acting
 * - Touch devices skip DevTools detection entirely
 * - If DevTools is already open at load, page is NOT killed (grace mode)
 * Result: real visitors are essentially never hit; casual copying is still
 * deterred; DevTools opened after load -> white screen.
 *
 * Dev backdoor for the site owner: see notes at the very bottom of this file.
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

    // --- dev backdoor: localStorage switch (permanent for your own browser) ---
    try {
        if (localStorage.getItem('__asd_dev__') === DEV_KEY) {
            _warn('[anti-steal] dev mode - skipped');
            return;
        }
        // also accept ?__dev__=KEY in case the platform did NOT strip it
        var sp = new URL(location.href).searchParams;
        if (sp.get('__dev__') === DEV_KEY) {
            try { localStorage.setItem('__asd_dev__', DEV_KEY); } catch (e) {}
            _warn('[anti-steal] dev key accepted');
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
    // Touch devices: skip entirely. Mobile viewport metrics are unreliable and
    // would cause false positives for ordinary phone users.
    if (IS_TOUCH) return;

    var initDPR = window.devicePixelRatio || 1;
    var initScale = (window.visualViewport && window.visualViewport.scale) || 1;

    // Window-gap method: when DevTools is docked, outer vs inner size differ a lot.
    // Zoom-guarded: if the user changed zoom, we report "not DevTools" so that
    // zooming in (elderly users, high-DPI screens, etc.) never triggers a kill.
    function devtoolsByGap() {
        try {
            var dpr = window.devicePixelRatio || 1;
            var scale = (window.visualViewport && window.visualViewport.scale) || 1;
            if (Math.abs(dpr - initDPR) > 0.02 || Math.abs(scale - initScale) > 0.02) return false;
            var wGap = (window.outerWidth || 0) - (window.innerWidth || 0);
            var hGap = (window.outerHeight || 0) - (window.innerHeight || 0);
            // 200px threshold: normal browser chrome / scrollbars are far smaller
            return wGap > 200 || hGap > 200;
        } catch (e) { return false; }
    }

    // Console getter trap: the getter only runs if DevTools console actually
    // renders the logged object. Safe - has no effect for normal visitors.
    var consoleHit = false;
    var trap = {};
    try {
        Object.defineProperty(trap, 'id', { get: function () { consoleHit = true; return ''; } });
    } catch (e) {}

    // If DevTools is ALREADY open when the page loads, do not kill. This both
    // (a) lets the site owner inspect, and (b) avoids killing a real visitor
    // who happened to have DevTools open for some unrelated reason.
    var graceMode = devtoolsByGap();

    // Require several CONSECUTIVE hits before acting. This removes any
    // one-off transient false positive.
    var streak = 0;
    var NEED = 4;

    _setInterval(function () {
        if (KILLED) return;
        if (document.hidden) { streak = 0; return; }   // ignore background tabs

        if (graceMode) {
            // stay in grace mode until DevTools is closed, then re-arm
            if (!devtoolsByGap()) { graceMode = false; streak = 0; }
            return;
        }

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
    }, 1000);

})();

/*
 * ====================================================================
 * HOW YOU (the site owner) INSPECT YOUR OWN SITE
 * ====================================================================
 * The dev backdoor is a localStorage switch. Set it once, per browser,
 * and the whole script is skipped on that browser forever.
 *
 * Steps:
 *   1. Open a NEW blank tab.
 *   2. Press F12 to open DevTools (blank tab has no protection).
 *      Keep DevTools DOCKED (attached to the side/bottom, not a separate window).
 *   3. Keep DevTools open, then go to https://truedinkum.com in that tab.
 *      Because DevTools was already open at load, the script is in "grace
 *      mode" and will NOT white-screen the page.
 *   4. In the DevTools Console, run:
 *        localStorage.setItem('__asd_dev__', 'Yang_2004_dev')
 *   5. Done. From now on this browser skips the script entirely - you can
 *      inspect freely without opening DevTools first.
 *
 * To turn dev mode OFF again, run in the Console:
 *        localStorage.removeItem('__asd_dev__')
 * ====================================================================
 */
