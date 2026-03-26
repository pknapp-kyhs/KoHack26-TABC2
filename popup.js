// =============================================================================
// Otiyot+ Popup Script
// Handles all UI interactions in the extension popup.
// Saves settings to chrome.storage.sync so content.js can read them.
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {

  // ---------------------------------------------------------------------------
  // 1. NIKUD DEFINITIONS
  // Must stay in sync with content.js ALL_NIKUD — same keys, same order.
  // ---------------------------------------------------------------------------
  const NIKUD_LIST = [
    { char: '\u05B0', key: 'nikud_05B0', label: 'Shva',   color: '#3877ff' },
    { char: '\u05B4', key: 'nikud_05B4', label: 'Hiriq',  color: '#7debb0' },
    { char: '\u05B5', key: 'nikud_05B5', label: 'Tsere',  color: '#fd29ba' },
    { char: '\u05B6', key: 'nikud_05B6', label: 'Segol',  color: '#f81b1b' },
    { char: '\u05B7', key: 'nikud_05B7', label: 'Patach', color: '#66fd7a' },
    { char: '\u05B8', key: 'nikud_05B8', label: 'Kamatz', color: '#8d62fa' },
    { char: '\u05B9', key: 'nikud_05B9', label: 'Holam',  color: '#6ee4ef' },
    { char: '\u05BB', key: 'nikud_05BB', label: 'Kubutz', color: '#1cc00d' },
    { char: '\u05BC', key: 'nikud_05BC', label: 'Dagesh', color: '#f2fe06' },
  ];

  // ---------------------------------------------------------------------------
  // 2. ELEMENT REFS — main controls
  // ---------------------------------------------------------------------------
  const colorToggle = document.getElementById('colorToggle');
  const fontToggle  = document.getElementById('fontToggle');
  const focusToggle = document.getElementById('focusToggle');
  const spaceRange  = document.getElementById('spaceRange');
  const spaceVal    = document.getElementById('spaceVal');
  const nikudPanel  = document.getElementById('nikudPanel');
  const toggleAllOn  = document.getElementById('toggleAllOn');
  const toggleAllOff = document.getElementById('toggleAllOff');

  // ---------------------------------------------------------------------------
  // 3. BUILD THE PER-NIKUD TOGGLE ROWS DYNAMICALLY
  // Each row shows: colour swatch  |  Hebrew char  |  name  |  toggle switch
  // ---------------------------------------------------------------------------
  const nikudCheckboxes = {}; // key → <input> element, for bulk operations

  NIKUD_LIST.forEach(({ char, key, label, color }) => {
    // Row container
    const row = document.createElement('div');
    row.className = 'nikud-row';

    // Colour swatch
    const swatch = document.createElement('span');
    swatch.className = 'nikud-swatch';
    swatch.style.background = color;

    // Hebrew character display
    const heChar = document.createElement('span');
    heChar.className = 'nikud-char';
    heChar.textContent = '\u05D1' + char; // Show on Bet so diacritic is visible

    // Label
    const lbl = document.createElement('span');
    lbl.className = 'nikud-label';
    lbl.textContent = label;

    // Toggle switch (reuses the same CSS as the main toggles)
    const switchLabel = document.createElement('label');
    switchLabel.className = 'switch';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id   = key;
    input.checked = true; // default; overwritten when settings load
    nikudCheckboxes[key] = input;

    const track = document.createElement('span');
    track.className = 'track';

    switchLabel.appendChild(input);
    switchLabel.appendChild(track);

    input.addEventListener('change', saveAll);

    row.appendChild(swatch);
    row.appendChild(heChar);
    row.appendChild(lbl);
    row.appendChild(switchLabel);
    nikudPanel.appendChild(row);
  });

  // ---------------------------------------------------------------------------
  // 4. BULK ALL-ON / ALL-OFF BUTTONS
  // ---------------------------------------------------------------------------
  toggleAllOn.addEventListener('click', () => {
    NIKUD_LIST.forEach(({ key }) => { nikudCheckboxes[key].checked = true; });
    saveAll();
  });

  toggleAllOff.addEventListener('click', () => {
    NIKUD_LIST.forEach(({ key }) => { nikudCheckboxes[key].checked = false; });
    saveAll();
  });

  // ---------------------------------------------------------------------------
  // 5. COLLAPSIBLE NIKUD PANEL
  // Clicking the nikud strip header expands/collapses the per-nikud settings.
  // ---------------------------------------------------------------------------
  const nikudHeader = document.getElementById('nikudHeader');
  const nikudChevron = document.getElementById('nikudChevron');
  let panelOpen = false;

  nikudHeader.addEventListener('click', () => {
    panelOpen = !panelOpen;
    nikudPanel.style.display  = panelOpen ? 'block' : 'none';
    nikudChevron.textContent  = panelOpen ? '▲' : '▼';
  });

  // ---------------------------------------------------------------------------
  // 6. LOAD SAVED SETTINGS
  // ---------------------------------------------------------------------------
  const nikudDefaults = {};
  NIKUD_LIST.forEach(({ key }) => { nikudDefaults[key] = true; });

  chrome.storage.sync.get({
    colorNekudot:  true,
    fontEnabled:   true,
    focusMode:     false,
    letterSpacing: 0,
    ...nikudDefaults,
  }, (res) => {
    colorToggle.checked   = res.colorNekudot;
    fontToggle.checked    = res.fontEnabled;
    focusToggle.checked   = res.focusMode;
    spaceRange.value      = res.letterSpacing;
    spaceVal.textContent  = res.letterSpacing + 'px';

    NIKUD_LIST.forEach(({ key }) => {
      nikudCheckboxes[key].checked = res[key] !== false;
    });
  });

  // ---------------------------------------------------------------------------
  // 7. SAVE ALL SETTINGS
  // ---------------------------------------------------------------------------
  function saveAll() {
    const toSave = {
      colorNekudot:  colorToggle.checked,
      fontEnabled:   fontToggle.checked,
      focusMode:     focusToggle.checked,
      letterSpacing: parseInt(spaceRange.value, 10),
    };
    NIKUD_LIST.forEach(({ key }) => {
      toSave[key] = nikudCheckboxes[key].checked;
    });
    chrome.storage.sync.set(toSave);
  }

  // Event Listeners for main toggles
  colorToggle.addEventListener('change', saveAll);
  fontToggle.addEventListener('change', saveAll);
  focusToggle.addEventListener('change', saveAll);

  // Event Listener for the range slider
  spaceRange.addEventListener('input', () => {
    spaceVal.textContent = spaceRange.value + 'px';
    saveAll();
  });
});
