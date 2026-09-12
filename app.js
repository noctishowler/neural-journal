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