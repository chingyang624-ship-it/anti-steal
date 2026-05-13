/*!
 * Anti-Steal Protection v6
 * ??????,????????
 *
 * ============ ??:?????????? ============
 * ???? DEV_KEY ????????????,????,??????
 * ???,??? https://yoursite.com/?__dev__=????
 * ????,????????????(localStorage ??)?
 *
 * ???????:????/????,????????? __asd_dev__ ???
 * ===================================================
 *
 * ????(localhost / 127.0.0.1 / dev.* / *.local)?????
 */
(function () {
    'use strict';

    // ============ ??? ============
    const DEV_KEY = 'Yang@2004';
    // ===============================

    const _defineProperty = Object.defineProperty;
    const _setTimeout = window.setTimeout.bind(window);
    const _setInterval = window.setInterval.bind(window);
    const _clearTimeout = window.clearTimeout.bind(window);
    const _clearInterval = window.clearInterval.bind(window);
    const _rAF = (window.requestAnimationFrame || function (cb) { return _setTimeout(cb, 16); }).bind(window);
    const _performance_now = performance.now.bind(performance);
    const _addEventListener = EventTarget.prototype.addEventListener;
    const _consoleWarn = console.warn.bind(console);
    const _ReflectDefineProperty = (typeof Reflect !== 'undefined' && Reflect.defineProperty) || null;

    const CS = document.currentScript;
    function toInt(v) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : undefined; }
    const GAP_W = toInt(CS && CS.dataset.gap) ?? 160;
    const GAP_H = toInt(CS && CS.dataset.gap) ?? 160;
    const BLOCK_IFRAME = !!(CS && CS.dataset.blockIframe === '1');
    const REDIRECT_URL = (CS && CS.dataset.redirect) || '';
    const TEST_MODE = !!(CS && CS.dataset.testMode === '1');

    // ============================================================
    // ????? 1:??????????
    // ============================================================
    try {
        const host = location.hostname || '';
        if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0'
            || host === '' || host.startsWith('192.168.') || host.startsWith('10.')
            || host.endsWith('.local') || host.startsWith('dev.')
            || location.protocol === 'file:') {
            _consoleWarn('[anti-steal] local/dev host — protection skipped');
            return;
        }
    } catch (e) {}

    // ============================================================
    // ????? 2:URL ?? + localStorage ??
    // ============================================================
    try {
        const url = new URL(location.href);
        const urlKey = url.searchParams.get('__dev__');
        if (urlKey === DEV_KEY) {
            // ?? localStorage(? hook ??,??????)
            try { localStorage.setItem('__asd_dev__', DEV_KEY); } catch (e) {}
            // ?? URL ??,???????
            url.searchParams.delete('__dev__');
            try { history.replaceState({}, '', url.toString()); } catch (e) {}
            _consoleWarn('[anti-steal] dev key accepted — protection disabled for this browser');
            return;
        }
        // ???????? localStorage
        if (localStorage.getItem('__asd_dev__') === DEV_KEY) {
            _consoleWarn('[anti-steal] dev mode active — protection skipped');
            return;
        }
    } catch (e) {}

    // ============================================================
    // ??? ???????????(? v5 ??) ???
    // ============================================================
    const IS_TOUCH = (function () {
        try {
            return (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
                || (navigator.maxTouchPoints || 0) > 0
                || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
        } catch (e) { return false; }
    })();
    const IS_FRAMED = (function () { try { return window.top !== window.self; } catch (e) { return true; } })();

    let KILLED = false;
    let pageHiddenAt = 0;
    let devtoolsOpenAtStart = false;
    let detectStreak = 0;

    if (BLOCK_IFRAME && IS_FRAMED) {
        try { window.top.location = location.href; }
        catch (e) { document.documentElement.innerHTML = ''; }
        return;
    }

    function kill(reason) {
        if (KILLED) return;
        if (TEST_MODE) { _consoleWarn('[anti-steal] WOULD KILL (test mode):', reason); return; }
        KILLED = true;
        try { window.stop(); } catch (e) {}
        if (REDIRECT_URL) { try { location.replace(REDIRECT_URL); return; } catch (e) {} }
        try {
            document.documentElement.innerHTML =
                '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
                + '<style>html,body{background:#fff;font-family:system-ui;margin:0;padding:40px;color:#222;font-size:16px}</style>'
                + '</head><body><h2>Access denied</h2><p>??????? [' + reason + ']</p></body>';
        } catch (e) {}
    }
    function warn(reason) { if (TEST_MODE) _consoleWarn('[anti-steal] detected:', reason); }

    // CSS ??
    const protectStyle = document.createElement('style');
    protectStyle.textContent = `
        html,body,body *{
            -webkit-user-select:none!important;-moz-user-select:none!important;
            -ms-user-select:none!important;user-select:none!important;
            -webkit-touch-callout:none!important;
            -webkit-tap-highlight-color:transparent!important;
        }
        input,textarea,[contenteditable="true"]{
            -webkit-user-select:text!important;user-select:text!important;
        }
        img,video,canvas{-webkit-user-drag:none!important;user-drag:none!important;}
        @media print{html{display:none!important}}
    `;
    try { (document.documentElement || document.head).appendChild(protectStyle); } catch (e) {}

    function blockEvent(e) {
        const tag = (e.target && e.target.tagName) || '';
        const isEditable = tag === 'INPUT' || tag === 'TEXTAREA'
            || (e.target && e.target.isContentEditable);
        if (isEditable && ['copy', 'cut', 'paste', 'selectstart'].indexOf(e.type) !== -1) return;
        try { e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation(); } catch (_) {}
        return false;
    }
    ['contextmenu', 'selectstart', 'copy', 'cut', 'dragstart', 'drop', 'auxclick'].forEach(ev => {
        try {
            _addEventListener.call(window, ev, blockEvent, { capture: true });
            _addEventListener.call(document, ev, blockEvent, { capture: true });
        } catch (e) {}
    });

    _addEventListener.call(document, 'visibilitychange', function () {
        if (document.hidden) {
            pageHiddenAt = _performance_now();
        } else {
            rafLast = _performance_now();
            pageHiddenAt = 0;
            detectStreak = 0;
        }
    });

    if (IS_TOUCH) { try { window.print = function () {}; } catch (e) {} return; }

    // ===== ??? =====
    try { window.print = function () {}; } catch (e) {}

    function isBlockedKey(e) {
        const key = (e.key || '').toLowerCase();
        const cm = e.ctrlKey || e.metaKey;
        const sh = e.shiftKey;
        if (key === 'f12') return true;
        if (sh && key === 'f10') return true;
        if (e.key === 'ContextMenu') return true;
        if (cm && sh && ['i', 'j', 'c', 'k', 'u', 'e', 'm', 'p', 's'].indexOf(key) !== -1) return true;
        if (cm && !sh && !e.altKey && ['u', 's', 'p'].indexOf(key) !== -1) return true;
        if (e.metaKey && e.altKey && ['i', 'j', 'c', 'k'].indexOf(key) !== -1) return true;
        return false;
    }
    function keyHandler(e) {
        if (isBlockedKey(e)) {
            try { e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation(); } catch (_) {}
            return false;
        }
    }
    ['keydown', 'keyup', 'keypress'].forEach(ev => {
        try {
            _addEventListener.call(window, ev, keyHandler, { capture: true });
            _addEventListener.call(document, ev, keyHandler, { capture: true });
        } catch (e) {}
    });

    const PROTECTED_PROPS = ['devicePixelRatio', 'outerWidth', 'outerHeight'];
    function isProtectedTarget(obj, prop) {
        const p = String(prop);
        if ((obj === window || obj === globalThis) && PROTECTED_PROPS.indexOf(p) !== -1) return p;
        if (obj === window.visualViewport && p === 'scale') return 'vv-scale';
        return null;
    }
    try {
        const hookedDefine = function (obj, prop, desc) {
            try {
                const hit = isProtectedTarget(obj, prop);
                if (hit) { kill('tamper-' + hit); return obj; }
            } catch (e) {}
            return _defineProperty.apply(this, arguments);
        };
        _defineProperty(Object, 'defineProperty', {
            configurable: false, writable: false, value: hookedDefine
        });
    } catch (e) {}

    try {
        if (_ReflectDefineProperty) {
            const hookedReflect = function (obj, prop, desc) {
                try {
                    const hit = isProtectedTarget(obj, prop);
                    if (hit) { kill('tamper-reflect-' + hit); return false; }
                } catch (e) {}
                return _ReflectDefineProperty.apply(this, arguments);
            };
            _defineProperty(Reflect, 'defineProperty', {
                configurable: false, writable: false, value: hookedReflect
            });
        }
    } catch (e) {}

    try {
        let clearCount = 0, clearWindow = 0;
        function makeHook(orig) {
            return function () {
                const now = _performance_now();
                if (now - clearWindow > 200) { clearWindow = now; clearCount = 0; }
                clearCount++;
                if (clearCount > 50) { kill('mass-clear'); return; }
                return orig.apply(this, arguments);
            };
        }
        window.clearTimeout = makeHook(_clearTimeout);
        window.clearInterval = makeHook(_clearInterval);
    } catch (e) {}

    const initScale = (window.visualViewport && window.visualViewport.scale) || 1;
    const initDPR = window.devicePixelRatio || 1;
    function detectByGap() {
        try {
            const ow = window.outerWidth || 0, iw = window.innerWidth || 0;
            const oh = window.outerHeight || 0, ih = window.innerHeight || 0;
            const scale = (window.visualViewport && window.visualViewport.scale) || 1;
            const dpr = window.devicePixelRatio || 1;
            if (Math.abs(scale - initScale) > 0.05 || Math.abs(dpr - initDPR) > 0.05) return false;
            return (ow - iw >= GAP_W) || (oh - ih >= GAP_H);
        } catch (e) { return false; }
    }
    function detectByDebugger() {
        try {
            const t0 = _performance_now();
            debugger;
            return (_performance_now() - t0) > 100;
        } catch (e) { return false; }
    }

    try {
        if (detectByGap() || detectByDebugger()) {
            devtoolsOpenAtStart = true;
            warn('devtools already open at load');
        }
    } catch (e) {}

    let consoleTrap = false;
    const trap = {};
    try {
        _defineProperty(trap, 'id', { get: function () { consoleTrap = true; return ''; } });
    } catch (e) {}

    let rafLast = _performance_now();

    _setInterval(function () {
        if (KILLED) return;
        if (document.hidden) return;
        try {
            const gap = detectByGap();
            const dbg = detectByDebugger();
            consoleTrap = false;
            console.log('%c', trap);
            console.clear && console.clear();
            const detected = gap || dbg || consoleTrap;

            if (detected) {
                detectStreak++;
                if (!devtoolsOpenAtStart && detectStreak >= 3) {
                    return kill('devtools-opened');
                }
            } else {
                if (devtoolsOpenAtStart) {
                    devtoolsOpenAtStart = false;
                    warn('devtools closed — guard re-armed');
                }
                detectStreak = 0;
            }
        } catch (e) {}
    }, 1200);

    function rafTick() {
        if (KILLED) return;
        try {
            const now = _performance_now();
            if (!document.hidden && pageHiddenAt === 0 && now - rafLast > 3000) {
                if (!devtoolsOpenAtStart) { kill('raf-drift'); return; }
            }
            rafLast = now;
        } catch (e) {}
        _rAF(rafTick);
    }
    _rAF(rafTick);

    _addEventListener.call(window, 'resize', function () {
        _rAF(function () {
            try {
                if (detectByGap() && !devtoolsOpenAtStart) {
                    detectStreak++;
                    if (detectStreak >= 3) kill('resize-gap');
                }
            } catch (e) {}
        });
    }, { capture: true, passive: true });

})();
