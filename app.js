'use strict';

// ============================================================
// Elements / constants
// ============================================================

const $ = id => document.getElementById(id);

const screen = $('screen');
const hint = $('hint');
const status = $('status');

const STORE = 'neural-journal-v1';
const PASSWORD_LENGTH = 8;

const enc = new TextEncoder();
const dec = new TextDecoder();

const arrows = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→'
};


// ============================================================
// App state
// ============================================================

let vault = null;
let key = null;
let entries = [];

let view = 'lock';
let busy = false;

let sequence = [];
let firstSequence = null;
let failures = 0;

let draft = null;
let saveQueue = Promise.resolve();

let selectedDate = new Date();

let historyState = {
  origin: 'menu',
  day: null,
  focus: null
};

let pointer = null;
let suppressClick = false;
let calendarPointerActive = false;


// ============================================================
// General helpers
// ============================================================

const b64 = value =>
  btoa(
    String.fromCharCode(
      ...new Uint8Array(value)
    )
  );

const un64 = value =>
  Uint8Array.from(
    atob(value),
    character => character.charCodeAt(0)
  );

function dateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function displayDate(date) {
  return new Date(date).toLocaleDateString(
    undefined,
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }
  );
}

function today() {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return now;
}

function say(message = '') {
  status.textContent = message;
}

function el(tag, text, className) {
  const element = document.createElement(tag);

  if (text !== undefined) {
    element.textContent = text;
  }

  if (className) {
    element.className = className;
  }

  return element;
}

function button(label, action, small) {
  const element = el('button', label);

  element.type = 'button';
  element.onclick = action;

  if (small) {
    element.append(
      el('small', small)
    );
  }

  return element;
}

function base(title, instruction = '') {
  screen.replaceChildren();
  screen.className = '';
  hint.textContent = instruction;

  if (title) {
    screen.append(
      el('h1', title)
    );
  }
}

function focusFirst() {
  screen
    .querySelector('textarea,input,button')
    ?.focus();
}

function createDraft() {
  const now = new Date();

  return {
    id: crypto.randomUUID(),
    created: now.toISOString(),
    day: dateKey(now),
    text: ''
  };
}

function suppressNextClick() {
  suppressClick = true;

  setTimeout(() => {
    suppressClick = false;
  }, 350);
}


// ============================================================
// Encryption / storage
// ============================================================

async function derive(sequenceValue, salt) {
  const material =
    await crypto.subtle.importKey(
      'raw',
      enc.encode(
        sequenceValue.join(',')
      ),
      'PBKDF2',
      false,
      ['deriveKey']
    );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 600000,
      hash: 'SHA-256'
    },
    material,
    {
      name: 'AES-GCM',
      length: 256
    },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(
  data,
  encryptionKey,
  salt
) {
  const iv =
    crypto.getRandomValues(
      new Uint8Array(12)
    );

  const cipher =
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv
      },
      encryptionKey,
      enc.encode(
        JSON.stringify(data)
      )
    );

  return {
    version: 1,
    salt,
    iv: b64(iv),
    cipher: b64(cipher)
  };
}

function persist() {
  const snapshot =
    JSON.stringify(entries);

  const encryptionKey = key;
  const salt = vault.salt;

  say('Saving…');

  saveQueue =
    saveQueue
      .catch(() => {})
      .then(async () => {
        const next =
          await encrypt(
            JSON.parse(snapshot),
            encryptionKey,
            salt
          );

        localStorage.setItem(
          STORE,
          JSON.stringify(next)
        );

        vault = next;
      });

  return saveQueue;
}


// ============================================================
// Lock screen
// ============================================================

function showLock() {
  view = 'lock';
  sequence = [];

  base(
    vault
      ? 'Journal locked'
      : firstSequence
        ? 'Repeat your swipes'
        : 'Choose your swipe password',
    'Swipe in any direction • 8 swipes'
  );

  screen.className = 'lock';

  screen.append(
    el(
      'p',
      vault
        ? 'Enter your eight-swipe sequence.'
        : firstSequence
          ? 'Repeat the same eight swipes to confirm.'
          : 'Choose eight directions you can remember.',
      'sub'
    ),

    el(
      'div',
      '○'.repeat(PASSWORD_LENGTH),
      'dots'
    )
  );

  const directions =
    el(
      'div',
      undefined,
      'directions'
    );

  Object.entries(arrows)
    .forEach(([direction, symbol]) => {
      directions.append(
        button(
          symbol,
          () => swipe(direction)
        )
      );
    });

  screen.append(
    directions,

    button(
      'Start over',
      () => {
        if (busy) return;

        firstSequence = null;
        showLock();
      }
    )
  );

  if (!vault) {
    screen.append(
      el(
        'p',
        'Your sequence encrypts your journal. Forgotten sequences cannot be recovered.',
        'sub'
      )
    );
  }

  focusFirst();
}

async function unlock() {
  busy = true;

  const enteredSequence =
    sequence.slice();

  say(
    vault
      ? 'Unlocking…'
      : 'Creating your journal…'
  );

  try {
    if (vault) {
      const encryptionKey =
        await derive(
          enteredSequence,
          un64(vault.salt)
        );

      let data;

      try {
        data =
          await crypto.subtle.decrypt(
            {
              name: 'AES-GCM',
              iv: un64(vault.iv)
            },
            encryptionKey,
            un64(vault.cipher)
          );
      } catch {
        failures++;

        say(
          'Sequence not recognized. Try again.'
        );

        showLock();
        return;
      }

      entries =
        JSON.parse(
          dec.decode(data)
        );

      if (!Array.isArray(entries)) {
        throw new Error(
          'Invalid journal'
        );
      }

      key = encryptionKey;

    } else {
      const salt =
        crypto.getRandomValues(
          new Uint8Array(16)
        );

      const encryptionKey =
        await derive(
          enteredSequence,
          salt
        );

      const next =
        await encrypt(
          [],
          encryptionKey,
          b64(salt)
        );

      localStorage.setItem(
        STORE,
        JSON.stringify(next)
      );

      vault = next;
      key = encryptionKey;
      entries = [];
    }

    firstSequence = null;
    failures = 0;

    newEntry();

    say('Unlocked');

  } catch {
    say(
      'Cannot open the journal. Storage or encryption is unavailable.'
    );

    showLock();

  } finally {
    busy = false;
  }
}

async function lock() {
  if (busy) return;

  if (draft?.text.trim()) {
    showWriter();

    say(
      'Swipe right to save your entry before locking.'
    );

    return;
  }

  busy = true;

  try {
    await saveQueue.catch(() => {});

    key = null;
    entries = [];
    draft = null;
    firstSequence = null;

    showLock();
    say('Locked');

  } finally {
    busy = false;
  }
}


// ============================================================
// Navigation
// ============================================================

function swipe(direction) {
  if (
    busy ||
    !arrows[direction]
  ) {
    return;
  }

  // Lock screen uses all four directions.
  if (view === 'lock') {
    sequence.push(direction);

    const dots =
      screen.querySelector('.dots');

    if (dots) {
      dots.textContent =
        '●'.repeat(sequence.length) +
        '○'.repeat(
          PASSWORD_LENGTH -
          sequence.length
        );
    }

    if (
      sequence.length ===
      PASSWORD_LENGTH
    ) {
      handleCompletedSequence();
    }

    return;
  }

  // Left means back everywhere after unlock.
  if (direction === 'ArrowLeft') {
    goBack();
    return;
  }

  if (view === 'write') {
    handleWriterSwipe(direction);
    return;
  }

  if (view === 'read') {
    handleReaderSwipe(direction);
    return;
  }

  // Calendar movement uses pointer drag.
  if (view === 'date') {
    return;
  }

  if (
    view === 'menu' ||
    view === 'history'
  ) {
    if (
      direction === 'ArrowUp' ||
      direction === 'ArrowDown'
    ) {
      navigate(direction);
    }
  }
}

function handleCompletedSequence() {
  if (
    !vault &&
    !firstSequence
  ) {
    firstSequence =
      sequence.slice();

    showLock();
    say('Repeat to confirm');

    return;
  }

  if (
    !vault &&
    sequence.join() !==
      firstSequence.join()
  ) {
    firstSequence = null;

    showLock();

    say(
      'Sequences did not match. Choose again.'
    );

    return;
  }

  if (failures >= 5) {
    busy = true;

    say(
      'Please wait 15 seconds before trying again.'
    );

    setTimeout(
      () => {
        busy = false;
        failures = 0;

        showLock();

        say(
          'Try your sequence again'
        );
      },
      15000
    );

    return;
  }

  unlock();
}

function handleWriterSwipe(direction) {
  if (direction === 'ArrowRight') {
    saveEntry();

  } else if (
    direction === 'ArrowUp'
  ) {
    showMenu();

  } else if (
    direction === 'ArrowDown'
  ) {
    screen
      .querySelector('textarea')
      ?.scrollBy({
        top: 160
      });
  }
}

function handleReaderSwipe(direction) {
  if (
    direction !== 'ArrowUp' &&
    direction !== 'ArrowDown'
  ) {
    return;
  }

  screen
    .querySelector('.entry-text')
    ?.scrollBy({
      top:
        direction === 'ArrowDown'
          ? 160
          : -160
    });
}

function navigate(direction) {
  const items = [
    ...screen.querySelectorAll(
      'button,input,textarea'
    )
  ];

  if (!items.length) {
    return;
  }

  const current =
    items.indexOf(
      document.activeElement
    );

  const delta =
    direction === 'ArrowUp'
      ? -1
      : 1;

  const next =
    current < 0
      ? 0
      : (
          current +
          delta +
          items.length
        ) % items.length;

  items[next].focus();
}

function goBack() {
  if (busy) return;

  switch (view) {
    case 'read':
      showHistory();
      break;

    case 'history':
      if (
        historyState.origin ===
        'calendar'
      ) {
        showDate();
      } else {
        showMenu();
      }
      break;

    case 'date':
      showMenu();
      break;

    case 'menu':
      showWriter();
      break;

    case 'write':
      showMenu();
      break;

    case 'lock':
      sequence = [];
      showLock();
      break;
  }
}


// ============================================================
// Journal writer
// ============================================================

function newEntry() {
  draft = createDraft();
  showWriter();
}

function showWriter() {
  if (!draft) {
    draft = createDraft();
  }

  view = 'write';

  base(
    'New entry',
    '→ Save & clear · ↑ Menu · Pinch to write'
  );

  screen.className = 'writer';

  const field =
    el('textarea');

  field.placeholder =
    'What’s on your mind?';

  field.setAttribute(
    'aria-label',
    'Journal entry. Pinch to handwrite or dictate.'
  );

  field.value =
    draft.text;

  const updateDraft = () => {
    draft.text =
      field.value;

    draft.updated =
      new Date().toISOString();

    say(
      draft.text.trim()
        ? 'Unsaved entry'
        : ''
    );
  };

  field.addEventListener(
    'input',
    updateDraft
  );

  field.addEventListener(
    'change',
    updateDraft
  );

  screen.append(field);
  field.focus();
}

async function saveEntry() {
  if (busy) {
    return false;
  }

  const field =
    screen.querySelector('textarea');

  if (
    !field ||
    !draft
  ) {
    return false;
  }

  draft.text =
    field.value;

  if (!draft.text.trim()) {
    say(
      'Write an entry first.'
    );

    return false;
  }

  busy = true;
  field.readOnly = true;

  const previous =
    entries.slice();

  const saved = {
    ...draft,
    updated:
      new Date().toISOString()
  };

  const index =
    entries.findIndex(
      entry =>
        entry.id === saved.id
    );

  if (index < 0) {
    entries.unshift(saved);
  } else {
    entries[index] = saved;
  }

  try {
    await persist();

    draft = createDraft();

    field.value = '';
    field.scrollTop = 0;

    say('Entry saved');

    return true;

  } catch {
    entries = previous;

    say(
      'Not saved. Your entry is still here. Swipe right to retry.'
    );

    return false;

  } finally {
    field.readOnly = false;
    busy = false;
  }
}


// ============================================================
// Main menu
// ============================================================

function showMenu() {
  view = 'menu';

  base(
    'Journal',
    '↑ ↓ Choose · Pinch to open · ← Back'
  );

  screen.className = 'menu';

  screen.append(
    button(
      'Continue entry',
      showWriter
    ),

    button(
      'Previous entries',
      () => {
        historyState = {
          origin: 'menu',
          day: null,
          focus: null
        };

        showHistory();
      }
    ),

    button(
      'Find a date',
      () => {
        selectedDate = today();

        historyState = {
          origin: 'calendar',
          day: null,
          focus: null
        };

        showDate();
      }
    ),

    button(
      'Lock journal',
      lock
    )
  );

  focusFirst();
}


// ============================================================
// Entry history / reader
// ============================================================

function showHistory() {
  view = 'history';

  const day =
    historyState.day;

  base(
    day
      ? displayDate(
          `${day}T12:00:00`
        )
      : 'Previous entries',

    '↑ ↓ Choose · Pinch to read · ← Back'
  );

  screen.className = 'history';

  const matches =
    entries
      .filter(entry => {
        if (!entry.text.trim()) {
          return false;
        }

        return (
          !day ||
          entry.day === day
        );
      })
      .sort(
        (a, b) =>
          b.created.localeCompare(
            a.created
          )
      );

  const list =
    el(
      'div',
      undefined,
      'list'
    );

  matches.forEach(entry => {
    const row =
      button(
        '',
        () => {
          historyState.focus =
            entry.id;

          showEntry(entry);
        }
      );

    row.className =
      'history-row';

    row.dataset.entryId =
      entry.id;

    row.append(
      el(
        'span',
        displayDate(entry.created),
        'entry-date'
      ),

      el(
        'span',
        entry.text.replace(
          /\s+/g,
          ' '
        ),
        'entry-preview'
      )
    );

    list.append(row);
  });

  if (!matches.length) {
    list.append(
      el(
        'p',
        day
          ? 'No entries for this date.'
          : 'No saved entries yet.',
        'empty'
      )
    );
  }

  screen.append(list);

  const target = [
    ...list.querySelectorAll(
      'button'
    )
  ].find(
    item =>
      item.dataset.entryId ===
      historyState.focus
  );

  (
    target ||
    list.querySelector('button')
  )?.focus();
}

function showEntry(entry) {
  view = 'read';

  base(
    displayDate(entry.created),
    '↑ ↓ Scroll · ← Back'
  );

  screen.className = 'reader';

  const text =
    el(
      'div',
      entry.text,
      'entry-text'
    );

  text.tabIndex = 0;

  text.setAttribute(
    'aria-label',
    'Journal entry'
  );

  screen.append(text);
  text.focus();
}


// ============================================================
// Calendar
// ============================================================

function selectCalendarDay(dayButton) {
  if (!dayButton) {
    return;
  }

  const stamp =
    dayButton.dataset.date;

  if (!stamp) {
    return;
  }

  const [
    year,
    month,
    day
  ] =
    stamp
      .split('-')
      .map(Number);

  selectedDate =
    new Date(
      year,
      month - 1,
      day,
      12
    );

  screen
    .querySelectorAll(
      '.calendar-day.selected'
    )
    .forEach(item =>
      item.classList.remove(
        'selected'
      )
    );

  screen
    .querySelectorAll(
      '[aria-selected="true"]'
    )
    .forEach(cell =>
      cell.removeAttribute(
        'aria-selected'
      )
    );

  screen
    .querySelectorAll(
      '.calendar-day'
    )
    .forEach(item => {
      item.tabIndex =
        item === dayButton
          ? 0
          : -1;
    });

  dayButton.classList.add(
    'selected'
  );

  dayButton
    .parentElement
    ?.setAttribute(
      'aria-selected',
      'true'
    );

  dayButton.focus({
    preventScroll: true
  });
}

function calendarDayAt(x, y) {
  return document
    .elementFromPoint(x, y)
    ?.closest('.calendar-day');
}

function openSelectedDate() {
  historyState = {
    origin: 'calendar',
    day: dateKey(selectedDate),
    focus: null
  };

  showHistory();
}

function showDate() {
  view = 'date';

  base(
    selectedDate.toLocaleDateString(
      undefined,
      {
        month: 'long',
        year: 'numeric'
      }
    ),
    'Drag to choose · Release to open · ← Back'
  );

  screen.className = 'calendar';

  const grid =
    el(
      'div',
      undefined,
      'calendar-grid'
    );

  grid.setAttribute(
    'role',
    'grid'
  );

  grid.setAttribute(
    'aria-label',
    'Choose a journal date'
  );

  const headings =
    el(
      'div',
      undefined,
      'calendar-week'
    );

  headings.setAttribute(
    'role',
    'row'
  );

  [
    'Su',
    'Mo',
    'Tu',
    'We',
    'Th',
    'Fr',
    'Sa'
  ].forEach(label => {
    const heading =
      el(
        'span',
        label,
        'weekday'
      );

    heading.setAttribute(
      'role',
      'columnheader'
    );

    headings.append(heading);
  });

  grid.append(headings);

  const start =
    new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      1,
      12
    );

  start.setDate(
    start.getDate() -
    start.getDay()
  );

  const savedDays =
    new Set(
      entries
        .filter(
          entry =>
            entry.text.trim()
        )
        .map(
          entry =>
            entry.day
        )
    );

  const todayStamp =
    dateKey(new Date());

  const selectedStamp =
    dateKey(selectedDate);

  let selectedButton = null;

  for (
    let week = 0;
    week < 6;
    week++
  ) {
    const row =
      el(
        'div',
        undefined,
        'calendar-week'
      );

    row.setAttribute(
      'role',
      'row'
    );

    for (
      let day = 0;
      day < 7;
      day++
    ) {
      const date =
        new Date(start);

      date.setDate(
        start.getDate() +
        week * 7 +
        day
      );

      const stamp =
        dateKey(date);

      const cell =
        el('div');

      cell.setAttribute(
        'role',
        'gridcell'
      );

      const dayButton =
        button(
          String(date.getDate()),
          event =>
            event?.preventDefault?.()
        );

      dayButton.className =
        'calendar-day';

      dayButton.dataset.date =
        stamp;

      dayButton.tabIndex = -1;

      dayButton.setAttribute(
        'aria-label',
        displayDate(date) +
          (
            savedDays.has(stamp)
              ? ', has entries'
              : ''
          )
      );

      if (
        date.getMonth() !==
        selectedDate.getMonth()
      ) {
        dayButton.classList.add(
          'outside-month'
        );
      }

      if (savedDays.has(stamp)) {
        dayButton.classList.add(
          'has-entries'
        );

        dayButton.append(
          el(
            'span',
            '•',
            'entry-dot'
          )
        );
      }

      if (stamp === todayStamp) {
        dayButton.setAttribute(
          'aria-current',
          'date'
        );
      }

      if (
        stamp ===
        selectedStamp
      ) {
        dayButton.tabIndex = 0;

        dayButton.classList.add(
          'selected'
        );

        cell.setAttribute(
          'aria-selected',
          'true'
        );

        selectedButton =
          dayButton;
      }

      cell.append(dayButton);
      row.append(cell);
    }

    grid.append(row);
  }

  screen.append(grid);

  selectedButton?.focus({
    preventScroll: true
  });
}


// ============================================================
// Keyboard / Neural Band events
// ============================================================

document.addEventListener(
  'keydown',
  event => {
    if (
      event.isComposing ||
      event.repeat
    ) {
      return;
    }

    if (arrows[event.key]) {
      event.preventDefault();
      swipe(event.key);
      return;
    }

    const isSelect =
      event.key === 'Enter' ||
      event.key === ' ';

    const isTextInput =
      ['TEXTAREA', 'INPUT']
        .includes(
          document.activeElement
            ?.tagName
        );

    if (
      isSelect &&
      !isTextInput
    ) {
      event.preventDefault();

      if (view === 'date') {
        openSelectedDate();
      } else {
        document
          .activeElement
          ?.click?.();
      }

      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      goBack();
    }
  }
);


// ============================================================
// Pointer / drag events
// ============================================================

document.addEventListener(
  'pointerdown',
  event => {
    pointer = {
      x: event.clientX,
      y: event.clientY,
      id: event.pointerId,
      time: performance.now()
    };

    calendarPointerActive =
      view === 'date';

    if (
      calendarPointerActive
    ) {
      const day =
        calendarDayAt(
          event.clientX,
          event.clientY
        );

      if (day) {
        selectCalendarDay(day);
      }
    }
  }
);

document.addEventListener(
  'pointermove',
  event => {
    if (
      !pointer ||
      event.pointerId !== pointer.id
    ) {
      return;
    }

    if (
      view !== 'date' ||
      !calendarPointerActive
    ) {
      return;
    }

    const day =
      calendarDayAt(
        event.clientX,
        event.clientY
      );

    if (day) {
      selectCalendarDay(day);
    }
  }
);

document.addEventListener(
  'pointerup',
  event => {
    if (
      !pointer ||
      event.pointerId !== pointer.id
    ) {
      return;
    }

    const start = pointer;

    pointer = null;

    const wasCalendarPointer =
      calendarPointerActive;

    calendarPointerActive =
      false;

    if (wasCalendarPointer) {
      suppressNextClick();
      openSelectedDate();
      return;
    }

    const dx =
      event.clientX - start.x;

    const dy =
      event.clientY - start.y;

    const elapsed =
      performance.now() -
      start.time;

    const distance =
      Math.max(
        Math.abs(dx),
        Math.abs(dy)
      );

    if (distance < 45) {
      return;
    }

    suppressNextClick();

    if (elapsed >= 700) {
      return;
    }

    const direction =
      Math.abs(dx) >
      Math.abs(dy)
        ? (
            dx > 0
              ? 'ArrowRight'
              : 'ArrowLeft'
          )
        : (
            dy > 0
              ? 'ArrowDown'
              : 'ArrowUp'
          );

    swipe(direction);
  }
);

document.addEventListener(
  'pointercancel',
  () => {
    pointer = null;
    calendarPointerActive = false;
  }
);

document.addEventListener(
  'click',
  event => {
    if (!suppressClick) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
  },
  true
);


// ============================================================
// Lifecycle
// ============================================================

window.addEventListener(
  'pagehide',
  () => {
    key = null;
    entries = [];
    draft = null;
    firstSequence = null;

    showLock();
  }
);

window.addEventListener(
  'storage',
  event => {
    if (event.key === STORE) {
      location.reload();
    }
  }
);


// ============================================================
// Startup
// ============================================================

$('date').textContent =
  new Date().toLocaleDateString(
    undefined,
    {
      month: 'short',
      day: 'numeric'
    }
  );

try {
  const raw =
    localStorage.getItem(STORE);

  if (raw) {
    vault =
      JSON.parse(raw);

    if (
      vault.version !== 1 ||
      !vault.salt ||
      !vault.iv ||
      !vault.cipher
    ) {
      throw new Error(
        'Invalid vault'
      );
    }
  }

  if (!crypto.subtle) {
    throw new Error(
      'Encryption unavailable'
    );
  }

  showLock();

} catch {
  base(
    'Journal unavailable'
  );

  screen.append(
    el(
      'p',
      'Encrypted storage could not be opened. Try a supported browser over HTTPS. Existing data has not been changed.'
    )
  );
}