Release 2.1.2 — Pumps tab fixes

Fixes:
• Decimal fields (Start L, Stop L, Rounding, Price per L, Imp/L) can now be edited normally — typing "1.12" no longer gets snapped back on every keystroke.
• Comma input from the numeric keypad is auto-converted to a dot, so values entered on systems with a "," decimal separator are accepted by the device (which only supports ".").
• Start L / Stop L / Rounding are now displayed as #.## and Price per L as #.### (formatted on blur, free typing while focused).

New:
• Totalizer is editable in PULSER mode — useful when re-syncing the controller's totalizer with a meter reading. Read-only for other pump types.
