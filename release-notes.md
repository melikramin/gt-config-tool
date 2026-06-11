Release 2.1.6 — Keys/Tags import & write fixes

Bug fixes
• Tags/Keys tab — XLSX import no longer drops keys. Previously only IDs that were exactly 12 hex characters were accepted, so a list of normal-length keys imported just a handful. IDs are now normalized to the device's 12-hex-char format: shorter IDs are left-padded with zeros, over-long IDs keep their rightmost 12 chars (left bytes dropped), and the header row is correctly skipped.
• Tags/Keys tab — writing thousands of keys is now fast. The keys table was being fully repainted on every command, which made a large write crawl even though the device replies instantly. The table is now memoized so write speed is limited only by the device.

What's new
• Tags/Keys tab — a "Loading…" indicator is shown on the Import button while a large file is being parsed.
• Tags/Keys tab — tab switching is blocked while keys are being read or written, so the operation and its progress bar stay on screen instead of being lost.
• Tags/Keys tab — when the list has more keys than the device has slots, only the first N (up to the device limit) are written instead of failing on overflow; the result message reports how many were written.
• Tags/Keys tab — a "Stop" button can interrupt an in-progress write; the result message reports how many keys were written before stopping.
