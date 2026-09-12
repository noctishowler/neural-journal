# Neural Journal

A journaling web app for Meta Display with neural-band handwriting,
swipe-password unlock, and date-searchable entries.

## Controls

- Unlock using your eight-swipe password.
- Pinch the entry field to open Meta’s handwriting/voice composer.
- Swipe down to select **Save entry**, then pinch to save and clear.
- Swipe up from the entry screen to open the menu.
- Middle-finger back tap returns to the previous screen.
- Select a history row to read it; swipe up/down to scroll.
- Calendar: left/right moves one day; up/down moves one week.
  Pinch a date to view entries. Dots mark dates with saved entries.

## Setup

Upload `index.html`, `styles.css`, and `app.js` to the repository root.
Enable GitHub Pages using `main` → `/ (root)`.

Add this URL to your Meta Display web apps:

https://noctishowler.github.io/neural-journal/

No build step or dependencies required.

## Storage

Entries are encrypted and stored locally in the device’s browser.
Existing entries and passwords remain compatible with this update.

Save before closing or reloading; unsaved text is lost.
There is no device sync or password recovery.
Clearing site data deletes the journal.

The swipe password is a convenience lock with limited strength.

## Compatibility

Meta supplies the handwriting/voice composer and back gesture.
This update still needs testing on the glasses.