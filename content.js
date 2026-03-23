// =============================================================================
// Otiyot+ Content Script
// Runs on every page. Applies four visual enhancements to Hebrew text:
//   1. Colour-coding each letter by its nikud (vowel mark)
//   2. Swapping the page font to the dyslexia-friendly Hebrew typeface
//   3. Adding extra letter-spacing for easier reading
//   4. NEW: Reading Focus Mode (Blurring everything except highlighted text)
// =============================================================================

(function () {

  // ---------------------------------------------------------------------------
  // 1. MASTER NIKUD COLOUR MAP
  // ---------------------------------------------------------------------------
  const ALL_NIKUD = {
    '\u05B0': { color: '#1850f7ff', key: 'nikud_05B0', label: 'Shva'         },
    '\u05B1': { color: '#f59f34ff', key: 'nikud_05B1', label: 'Hataf Segol'  },
    '\u05B2': { color: '#66fd7aff', key: 'nikud_05B2', label: 'Hataf Patach' },
    '\u05B3': { color: 'rgb(141, 98, 250)', key: 'nikud_05B3', label: 'Hataf Kamatz' },
    '\u05B4': { color: 'rgb(16, 138, 118)', key: 'nikud_05B4', label: 'Hiriq'         },
    '\u05B5': { color: '#fd29baff', key: 'nikud_05B5', label: 'Tsere'         },
    '\u05B6': { color: '#f81b1bff', key: 'nikud_05B6', label: 'Segol'         },
    '\u05B7': { color: '#b2b5b8ff', key: 'nikud_05B7', label: 'Patach'       },
    '\u05B8': { color: '#bbed50ff', key: 'nikud_05B8', label: 'Kamatz'       },
    '\u05B9': { color: '#6ee4efff', key: 'nikud_05B9', label: 'Holam'         },
    '\u05BB': { color: '#1cc00dff', key: 'nikud_05BB', label: 'Kubutz'       },
    '\u05BC': { color: 'rgb(242, 254, 6)', key: 'nikud_05BC', label: 'Dagesh'       },
  };

  let ACTIVE_VOWEL_HIGHLIGHTS = {};
  let NIKUD_SET = new Set();
  const ALL_NIKUD_SET = new Set(Object.keys(ALL_NIKUD));

  // ---------------------------------------------------------------------------
  // 2. CHARACTER CLASSIFICATION HELPERS
  // ---------------------------------------------------------------------------
  function isCantillation(code) { return code >= 0x0591 && code <= 0x05AF; }
  function isHebrewLetter(code) { return code >= 0x05D0 && code <= 0x05EA; }

  // ---------------------------------------------------------------------------
  // 3. SETTINGS
  // ---------------------------------------------------------------------------
  let settings = {
    colorNekudot:  true,
    fontEnabled:   true,
    letterSpacing: 0,
    focusMode:     false, // NEW: Default Focus Mode setting
  };

  function rebuildActiveNikud() {
    ACTIVE_VOWEL_HIGHLIGHTS = {};
    Object.entries(ALL_NIKUD).forEach(([char, meta]) => {
      if (settings[meta.key] !== false) {
        ACTIVE_VOWEL_HIGHLIGHTS[char] = meta.color;
      }
    });
    NIKUD_SET = new Set(Object.keys(ACTIVE_VOWEL_HIGHLIGHTS));
  }

 // ---------------------------------------------------------------------------
  // 4. STYLE INJECTION
  // Writes (or rewrites) a single <style> tag with all visual rules.
  // ---------------------------------------------------------------------------
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

    const fontRule = settings.fontEnabled
      ? `* { font-family: 'DyslexiaHebrew', David, 'Times New Roman', serif !important; }`
      : '';

    const spacingRule = settings.letterSpacing > 0
      ? `body, body * { letter-spacing: ${settings.letterSpacing}px !important; }`
      : '';

    const spanStyle = `
      .otiyot-letter-block {
        padding: 0 1px;
        border-radius: 3px;
        display: inline;
        line-height: inherit;
      }
    `;

    // Focus Mode Overlay CSS
    // Using will-change: clip-path for high-performance scrolling
// REPLACING SECTION 4 (Focus Mode Overlay CSS)
    const focusStyle = `
      #otiyot-focus-overlay {
        position: fixed;
        top: 0; left: 0;
        width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.35); 
        backdrop-filter: blur(8px);      
        -webkit-backdrop-filter: blur(8px);
        pointer-events: none;            
        z-index: 2147483647;            
        transition: opacity 0.2s;
        opacity: 0;                      
        will-change: clip-path;
      }
      #otiyot-focus-overlay.active {
        opacity: 1;
      }
      /* PRIORITY SYSTEM: Makes browser selection transparent so Niqqud colors show */
      .otiyot-letter-block::selection {
        background: rgba(255, 255, 255, 0.2) !important;
        color: inherit !important;
      }
      /* Fallback for selected text inside the span */
      ::selection {
        background: rgba(41, 171, 226, 0.2); 
      }
    `;

    styleEl.textContent = fontFace + fontRule + spacingRule + spanStyle + focusStyle;

    styleEl.textContent = fontFace + fontRule + spacingRule + spanStyle + focusStyle;
  }

  // ---------------------------------------------------------------------------
  // 5. TEXT NODE PROCESSOR
  // Walks all text nodes, finds Hebrew letters with nikud, and wraps in spans.
  // ---------------------------------------------------------------------------
  function processTextNodes(root) {
    if (!settings.colorNekudot) return;

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

      while (i < text.length) {
        const char = text[i];
        const charCode = char.charCodeAt(0);

        if (isHebrewLetter(charCode)) {
          let diacritics = '';   
          let firstNikud = null; 
          let j = i + 1;

          while (j < text.length) {
            const next = text[j];
            const nextCode = next.charCodeAt(0);

            if (NIKUD_SET.has(next)) {
              if (firstNikud === null) firstNikud = next;
              diacritics += next;
              j++;
            } else if (ALL_NIKUD_SET.has(next)) {
              diacritics += next;
              j++;
            } else if (isCantillation(nextCode)) {
              diacritics += next;
              j++;
            } else { break; }
          }

          if (firstNikud !== null) {
            const span = document.createElement('span');
            span.className = 'otiyot-letter-block';
            span.style.backgroundColor = ACTIVE_VOWEL_HIGHLIGHTS[firstNikud];
            span.textContent = char + diacritics;
            fragment.appendChild(span);
            i = j;
            continue;
          } else if (diacritics.length > 0) {
            fragment.appendChild(document.createTextNode(char + diacritics));
            i = j;
            continue;
          }
        }
        fragment.appendChild(document.createTextNode(char));
        i++;
      }
      textNode.parentNode.replaceChild(fragment, textNode);
    });
  }

  // ---------------------------------------------------------------------------
  // 6. MUTATION OBSERVER (For Dynamic Content / Sefaria)
  // ---------------------------------------------------------------------------
  let debounceTimer = null;
  let pendingNodes  = [];

  const observer = new MutationObserver((mutations) => {
    mutations.forEach(m => {
      m.addedNodes.forEach(n => {
        if (n.nodeType === Node.ELEMENT_NODE) pendingNodes.push(n);
      });
    });

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (pendingNodes.length === 0) return;
      const toProcess = pendingNodes.splice(0);
      observer.disconnect();
      toProcess.forEach(el => processTextNodes(el));
      observer.observe(document.body, { childList: true, subtree: true });
    }, 200);
  });

  // ---------------------------------------------------------------------------
  // 6.5 ENHANCED READING FOCUS MODE LOGIC
  // Handles the spotlight effect. Supports scrolling and Niqqud-spans.
  // ---------------------------------------------------------------------------
// REPLACING SECTION 6.5 (initFocusMode)
  function initFocusMode() {
    if (!settings.focusMode) return;

    let overlay = document.getElementById('otiyot-focus-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'otiyot-focus-overlay';
      document.body.appendChild(overlay);
    }

    let rafId = null;

    const updateFocus = () => {
      const selection = window.getSelection();
      
      if (selection.rangeCount > 0 && selection.toString().trim().length > 0) {
        const range = selection.getRangeAt(0);
        const bounds = range.getBoundingClientRect();
        
        // Hide if the text moves entirely off-screen
        if (bounds.bottom < 0 || bounds.top > window.innerHeight) {
          overlay.classList.remove('active');
          return;
        }

        const p = 8; // Padding for Vowels
        const top = bounds.top - p;
        const left = bounds.left - p;
        const bottom = bounds.bottom + p;
        const right = bounds.right + p;

        overlay.style.clipPath = `polygon(
          0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%, 
          ${left}px ${top}px, 
          ${right}px ${top}px, 
          ${right}px ${bottom}px, 
          ${left}px ${bottom}px, 
          ${left}px ${top}px
        )`;
        
        overlay.classList.add('active');
      } else {
        overlay.classList.remove('active');
      }
    };

    // Optimization: requestAnimationFrame makes the movement smooth
    const onScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateFocus);
    };

    // 'true' at the end ensures we catch scrolls on sub-elements/divs
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    document.addEventListener('selectionchange', updateFocus);
    window.addEventListener('resize', updateFocus);
  }
  // ---------------------------------------------------------------------------
  // 7. INITIALISATION
  // ---------------------------------------------------------------------------
  const nikudDefaults = {};
  Object.values(ALL_NIKUD).forEach(({ key }) => { nikudDefaults[key] = true; });

  chrome.storage.sync.get({ ...settings, ...nikudDefaults }, (res) => {
    Object.assign(settings, res);
    rebuildActiveNikud();
    applyVisualSettings();
    processTextNodes(document.body);
    
    // Initialize focus mode
    initFocusMode(); 
    
    observer.observe(document.body, { childList: true, subtree: true });
  });

  // Reload the page on settings change to ensure a clean state
  chrome.storage.onChanged.addListener(() => {
    location.reload();
  });

})();