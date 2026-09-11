# Neural Journal

Small vanilla HTML/CSS/JS app for Meta Ray-Ban Display. Set and confirm eight directional swipes, unlock into a focused entry, then pinch to open Meta’s handwriting/voice composer. Swipe up for the menu. Entries save as composer text is committed. Date lookup uses directional year/month/day controls.

Entries are stored only in this browser’s localStorage, encrypted with AES-GCM and a PBKDF2-derived key (600,000 SHA-256 iterations). Eight directions have limited entropy: this is a convenience lock, not strong protection against someone who can copy the encrypted data. There is no recovery or synchronization; clearing site data loses entries. Phone and glasses have separate journals. Keep the deployment origin stable.

Meta requires focus plus a physical pinch to open its composer; focus alone cannot open it, and the app cannot force handwriting instead of dictation. Needs firmware with web-app composer support. Desktop arrow keys and touch swipes support testing. Device input, encryption support, and composer behavior require testing on real glasses.

Source: https://github.com/facebook/meta-wearables-webapp/tree/main/plugins/meta-wearables-webapp/skills/add-text-input

## Upload

Extract this ZIP and upload index.html, styles.css, app.js, and this README.md to the root of your GitHub repository. Publish that folder with GitHub Pages and use the resulting HTTPS page URL in Meta’s web-app setup. No build or dependencies required. Upload the extracted files, not the ZIP itself. Never put journal data in the repository.
