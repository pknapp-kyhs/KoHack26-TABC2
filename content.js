// =============================================================================
// Otiyot+ Content Script (Isolated Hebrew-only logic)
// =============================================================================
// MERGED: Partner's advanced rewrite (Shva Na/Nach, highlight modes, SVG focus,
//         real-time settings) + span padding/border-radius from GitHub version.
// =============================================================================

(function () {

  // 1. MASTER NIKUD COLOUR MAP
  //
  // Shva (U+05B0) is one Unicode point but has two phonetic readings:
  //   Shva Na  (voiced) — acts like a short vowel
  //   Shva Nach (silent) — no vowel sound
  // We use synthetic keys 'SHVA_NA' and 'SHVA_NACH' in ACTIVE_VOWEL_HIGHLIGHTS
  // for colour lookup. classifyShva() resolves which applies at runtime.
  // U+05B0 itself stays in ALL_NIKUD_SET so the diacritic collector still picks
  // it up, but it is NOT added to NIKUD_SET (which maps directly to colour keys).
  //
  // Holam-Vav (וֹ) and Shuruk (וּ) are Vav-based vowels handled by classifyVav().
  const SHVA_CHAR = '\u05B0';

  const ALL_NIKUD = {
    'SHVA_NA':   { color: '#cc0000', key: 'nikud_shva_na',   label: 'Shva Na'   }, // deep red
    'SHVA_NACH': { color: '#ff88aa', key: 'nikud_shva_nach', label: 'Shva Nach' }, // pink
    '\u05B4':    { color: '#ff9900', key: 'nikud_05B4', label: 'Hiriq'  },
    '\u05B5':    { color: '#cccc00', key: 'nikud_05B5', label: 'Tsere'  },
    '\u05B6':    { color: '#00cc00', key: 'nikud_05B6', label: 'Segol'  },
    '\u05B7':    { color: '#6aa84f', key: 'nikud_05B7', label: 'Patach' },
    '\u05B8':    { color: '#6fa8dc', key: 'nikud_05B8', label: 'Kamatz' },
    '\u05B9':    { color: '#0000ff', key: 'nikud_05B9', label: 'Holam'  },
    '\u05BB':    { color: '#9900ff', key: 'nikud_05BB', label: 'Kubutz' },
    '\u05BC':    { color: '#ff00ff', key: 'nikud_05BC', label: 'Dagesh' },
  };

  const HATAF_MAP = {
    '\u05B1': '\u05B6',
    '\u05B2': '\u05B7',
    '\u05B3': '\u05B8',
  };

  let ACTIVE_VOWEL_HIGHLIGHTS = {};
  let NIKUD_SET = new Set();
  const ALL_NIKUD_SET = new Set([
    ...Object.keys(ALL_NIKUD).filter(k => k.length === 1),
    SHVA_CHAR,
    ...Object.keys(HATAF_MAP),
  ]);

  // 2. CHARACTER CLASSIFICATION HELPERS
  function isCantillation(code) { return code >= 0x0591 && code <= 0x05AF; }
  function isHebrewLetter(code) { return code >= 0x05D0 && code <= 0x05EA; }
  function isLetterModifier(code) {
    return code === 0x05C1 || code === 0x05C2 ||
           code === 0x05BF ||
           code === 0x05C4 || code === 0x05C5;
  }

  // 3. SETTINGS
  let settings = {
    colorNekudot:     true,
    fontEnabled:      true,
    letterSpacing:    0,
    focusMode:        false,
    highlightMode:    'block',
    highlightOpacity: 100,
  };

  function hexToRgba(hex, opacity) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${(opacity / 100).toFixed(2)})`;
  }

  function rebuildActiveNikud() {
    ACTIVE_VOWEL_HIGHLIGHTS = {};
    Object.entries(ALL_NIKUD).forEach(([key, meta]) => {
      if (settings[meta.key] !== false) ACTIVE_VOWEL_HIGHLIGHTS[key] = meta.color;
    });
    Object.entries(HATAF_MAP).forEach(([hataf, base]) => {
      if (ACTIVE_VOWEL_HIGHLIGHTS[base] !== undefined) {
        ACTIVE_VOWEL_HIGHLIGHTS[hataf] = ACTIVE_VOWEL_HIGHLIGHTS[base];
      }
    });
    NIKUD_SET = new Set(
      Object.keys(ACTIVE_VOWEL_HIGHLIGHTS).filter(k => k.length === 1)
    );
    if (settings['nikud_shva_na'] !== false || settings['nikud_shva_nach'] !== false) {
      NIKUD_SET.add(SHVA_CHAR);
    }
  }

  // 4. STYLE INJECTION
  function applyVisualSettings() {
    let styleEl = document.getElementById('otiyot-plus-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'otiyot-plus-style';
      document.head && document.head.appendChild(styleEl);
    }

    const fontUrl = chrome.runtime.getURL('dyslexia-hebrew-extended.otf');

    const fontFace = `
      @font-face {
        font-family: 'DyslexiaHebrew';
        src: url('${fontUrl}') format('opentype');
        unicode-range: U+05D0-05EA, U+05B0-05BD, U+05BF, U+05C1-05C2, U+05C4-05C5, U+05C7, U+FB1D-FB4E;
      }
    `;

    // MERGED: Added padding + border-radius from GitHub version
    const hebrewRule = `
      .otiyot-letter-block {
        display: inline;
        line-height: inherit;
        padding: 0 1px;
        border-radius: 3px;
        ${settings.fontEnabled ? "font-family: 'DyslexiaHebrew', sans-serif !important;" : ""}
        ${settings.letterSpacing > 0
          ? `display: inline-block !important; vertical-align: baseline !important;
             margin-inline-end: ${settings.letterSpacing}px !important; letter-spacing: 0 !important;`
          : ''}
      }
      .otiyot-nikud-char { /* reserved for future per-diacritic styling */ }
    `;

    const focusStyle = `
      #otiyot-focus-overlay {
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px); pointer-events: none;
        z-index: 2147483647; transition: opacity 0.25s; opacity: 0;
        will-change: clip-path;
      }
      #otiyot-focus-overlay.active { opacity: 1; }
      .otiyot-letter-block::selection { background: rgba(41, 171, 226, 0.2) !important; color: inherit !important; }
    `;

    styleEl.textContent = fontFace + hebrewRule + focusStyle;
  }

  // ---------------------------------------------------------------------------
  // SHVA CLASSIFICATION
  // ---------------------------------------------------------------------------
  const LONG_VOWEL_SET = new Set([
    '\u05B5', // Tsere
    '\u05B4', // Hiriq (long)
    '\u05B9', // Holam
    '\u05BB', // Kubutz / Shuruk
    '\u05B8', // Kamatz Gadol
  ]);

  function classifyShva(text, letterPos, diacritics, prevDominantNikud, prevWasShva) {
    let wordInitial = true;
    for (let k = letterPos - 1; k >= 0; k--) {
      const c = text.charCodeAt(k);
      if (isHebrewLetter(c)) { wordInitial = false; break; }
      if (c === 0x20 || c === 0x05BE || c === 0x2D) break;
    }
    if (wordInitial) return 'SHVA_NA';

    const afterLen = letterPos + 1 + diacritics.length;
    if (afterLen >= text.length) return 'SHVA_NACH';
    const nextCode = text.charCodeAt(afterLen);
    const isNextHebrew = isHebrewLetter(nextCode);
    const isNextDiac   = (nextCode >= 0x0590 && nextCode <= 0x05CF);
    if (!isNextHebrew && !isNextDiac) return 'SHVA_NACH';

    if (prevDominantNikud && LONG_VOWEL_SET.has(prevDominantNikud)) return 'SHVA_NA';
    if (diacritics.includes('\u05BC')) return 'SHVA_NA';
    if (prevWasShva) return 'SHVA_NACH';

    let ahead = afterLen;
    while (ahead < text.length) {
      const c = text.charCodeAt(ahead);
      if (isHebrewLetter(c)) {
        for (let k = ahead + 1; k < text.length; k++) {
          const nc = text.charCodeAt(k);
          if (nc === 0x05B0) return 'SHVA_NA';
          if (isHebrewLetter(nc) || nc === 0x20) break;
        }
        break;
      }
      ahead++;
    }
    return 'SHVA_NACH';
  }

  function classifyVav(diacritics) {
    if (diacritics.includes('\u05B9')) return 'HOLAM_VAV';
    if (diacritics.includes('\u05BC') &&
        !/[\u05B0-\u05BBd\u05BD]/.test(diacritics.replace('\u05BC', ''))) {
      return 'SHURUK';
    }
    return null;
  }

  // 5. TEXT NODE PROCESSOR
  function processTextNodes(root) {
    const active = settings.colorNekudot || settings.fontEnabled || settings.letterSpacing > 0;
    if (!active) return;

    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'NOSCRIPT']);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    const targets = [];
    let node;

    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (parent && !SKIP_TAGS.has(parent.tagName) && !parent.classList.contains('otiyot-letter-block')) {
        targets.push(node);
      }
    }

    targets.forEach(textNode => {
      if (!textNode.parentNode) return;
      const text = textNode.nodeValue;
      if (!/[\u05D0-\u05EA]/.test(text)) return;

      const fragment = document.createDocumentFragment();
      let i = 0;
      let prevDominantNikud = null;
      let prevWasShva       = false;

      while (i < text.length) {
        const char     = text[i];
        const charCode = char.charCodeAt(0);

        if (isHebrewLetter(charCode)) {
          let diacritics = '';
          let rawNikud   = null;
          let j = i + 1;

          while (j < text.length) {
            const next     = text[j];
            const nextCode = next.charCodeAt(0);
            if (isLetterModifier(nextCode)) {
              diacritics += next; j++;
            } else if (NIKUD_SET.has(next)) {
              if (rawNikud === null || (next !== '\u05BC' && rawNikud === '\u05BC')) {
                rawNikud = next;
              }
              diacritics += next; j++;
            } else if (ALL_NIKUD_SET.has(next) || isCantillation(nextCode)) {
              diacritics += next; j++;
            } else {
              break;
            }
          }

          let colourKey = rawNikud;

          if (char === '\u05D5') {
            const vavRole = classifyVav(diacritics);
            if (vavRole === 'HOLAM_VAV') colourKey = '\u05B9';
            else if (vavRole === 'SHURUK') colourKey = '\u05BB';
          }

          if (rawNikud === SHVA_CHAR || diacritics.includes(SHVA_CHAR)) {
            const shvaKey = classifyShva(text, i, diacritics, prevDominantNikud, prevWasShva);
            if (rawNikud === SHVA_CHAR) colourKey = shvaKey;
            prevWasShva = true;
          } else {
            prevWasShva = false;
          }
          prevDominantNikud = rawNikud;

          const outerSpan = document.createElement('span');
          outerSpan.className = 'otiyot-letter-block';
          const color = colourKey ? ACTIVE_VOWEL_HIGHLIGHTS[colourKey] : null;

          if (settings.colorNekudot && color) {
            if (settings.highlightMode === 'nikud') {
              outerSpan.style.color = hexToRgba(color, settings.highlightOpacity);
            } else {
              outerSpan.style.backgroundColor = hexToRgba(color, settings.highlightOpacity);
            }
          }
          outerSpan.textContent = char + diacritics;
          fragment.appendChild(outerSpan);
          i = j;

        } else {
          if (char === ' ' || charCode === 0x05BE) {
            prevDominantNikud = null;
            prevWasShva       = false;
          }
          fragment.appendChild(document.createTextNode(char));
          i++;
        }
      }
      textNode.parentNode.replaceChild(fragment, textNode);
    });
  }

  // 6. OBSERVERS & FOCUS MODE
  let debounceTimer = null;
  let pendingNodes  = [];

  const observer = new MutationObserver((mutations) => {
    mutations.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === Node.ELEMENT_NODE) pendingNodes.push(n); }));
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (pendingNodes.length === 0) return;
      const toProcess = pendingNodes.splice(0);
      observer.disconnect();
      toProcess.forEach(el => processTextNodes(el));
      observer.observe(document.body, { childList: true, subtree: true });
    }, 200);
  });

  let _focusHandler = null;

  function teardownFocusMode() {
    if (_focusHandler) {
      document.removeEventListener('selectionchange', _focusHandler);
      document.removeEventListener('scroll',          _focusHandler, { capture: true });
      window.removeEventListener(  'resize',          _focusHandler);
      _focusHandler = null;
    }
    const ov  = document.getElementById('otiyot-focus-overlay');
    const svg = document.getElementById('otiyot-clip-svg');
    if (ov)  ov.remove();
    if (svg) svg.remove();
  }

  function initFocusMode() {
    teardownFocusMode();
    if (!settings.focusMode) return;

    const overlay = document.createElement('div');
    overlay.id = 'otiyot-focus-overlay';
    document.body.appendChild(overlay);

    const svgNS = 'http://www.w3.org/2000/svg';
    const clipSvg = document.createElementNS(svgNS, 'svg');
    clipSvg.setAttribute('id', 'otiyot-clip-svg');
    clipSvg.setAttribute('style', 'position:fixed;top:0;left:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:2147483646');
    const clipPathEl = document.createElementNS(svgNS, 'clipPath');
    clipPathEl.setAttribute('id', 'otiyot-focus-clip');
    clipPathEl.setAttribute('clipPathUnits', 'userSpaceOnUse');
    clipSvg.appendChild(clipPathEl);
    document.body.appendChild(clipSvg);

    const updateFocus = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && sel.toString().trim().length > 0) {
        const range = sel.getRangeAt(0);
        const W = window.innerWidth, H = window.innerHeight, PAD = 6;

        const rawRects = Array.from(range.getClientRects()).filter(r =>
          r.width > 0 && r.height > 0 && r.bottom >= 0 && r.top <= H
        );

        if (rawRects.length === 0) { overlay.classList.remove('active'); return; }

        const lines = [];
        rawRects.forEach(r => {
          let merged = false;
          for (const line of lines) {
            const overlap = Math.min(r.bottom, line.bottom) + 4 > Math.max(r.top, line.top);
            if (overlap) {
              line.left   = Math.min(line.left, r.left);
              line.right  = Math.max(line.right, r.right);
              line.top    = Math.min(line.top, r.top);
              line.bottom = Math.max(line.bottom, r.bottom);
              merged = true;
              break;
            }
          }
          if (!merged) lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
        });

        let d = `M0,0 L0,${H} L${W},${H} L${W},0 Z `;
        lines.forEach(l => {
          const x1 = Math.max(0, l.left - PAD), y1 = Math.max(0, l.top - PAD);
          const x2 = Math.min(W, l.right + PAD), y2 = Math.min(H, l.bottom + PAD);
          d += `M${x1},${y1} L${x2},${y1} L${x2},${y2} L${x1},${y2} Z `;
        });

        while (clipPathEl.firstChild) clipPathEl.removeChild(clipPathEl.firstChild);
        const pathEl = document.createElementNS(svgNS, 'path');
        pathEl.setAttribute('d', d.trim());
        pathEl.setAttribute('fill-rule', 'evenodd');
        clipPathEl.appendChild(pathEl);

        overlay.style.clipPath = 'url(#otiyot-focus-clip)';
        overlay.classList.add('active');
      } else {
        overlay.classList.remove('active');
      }
    };

    _focusHandler = updateFocus;
    document.addEventListener('selectionchange', updateFocus);
    document.addEventListener('scroll',          updateFocus, { passive: true, capture: true });
    window.addEventListener(  'resize',          updateFocus);
  }

  // 7. INITIALISATION & LIVE UPDATES
  const nikudDefaults = {};
  Object.values(ALL_NIKUD).forEach(({ key }) => { nikudDefaults[key] = true; });

  chrome.storage.sync.get({ ...settings, ...nikudDefaults }, (res) => {
    Object.assign(settings, res);
    rebuildActiveNikud();
    applyVisualSettings();
    processTextNodes(document.body);
    initFocusMode();
    observer.observe(document.body, { childList: true, subtree: true });
  });

  function stripOtiyotSpans() {
    document.querySelectorAll('.otiyot-letter-block').forEach(span => {
      const parent = span.parentNode;
      if (parent) parent.replaceChild(document.createTextNode(span.textContent), span);
    });
    document.normalize();
  }

  function applyAll() {
    rebuildActiveNikud();
    applyVisualSettings();
    observer.disconnect();
    stripOtiyotSpans();
    processTextNodes(document.body);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== 'OTIYOT_SETTINGS') return;
    Object.assign(settings, msg.settings);
    applyAll();
    initFocusMode();
  });
})();
