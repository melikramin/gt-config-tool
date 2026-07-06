Release 2.1.7 — GSM/GNSS log analyzer, light-theme readability

What's new
• Diagnostics tab — a built-in GSM/GNSS log analyzer. As the device logs stream in, plain-language hints are shown inline (EN/RU): GSM registration and signal state, WCDMA/3G status, SIM problems (CPIN NOT READY), CGREG/CEREG "denied", and GPS fix quality parsed from NMEA (position, satellites in use, HDOP). The analyzer is on by default and switches automatically to the right mode when you enable the GSM or GNSS (GPS) log channel. Its hints are included in Copy All and Save, and can be selected/copied like any log text.
• Diagnostics tab — an analysis mode selector (Off / GSM / GPS / All) at the top of the log.

Improvements
• Light theme — greatly improved readability, especially outdoors and in bright sunlight. Input fields are now white and clearly framed by their panels, borders are crisp, and text is near-black instead of low-contrast gray. Previously the light theme washed out into gray-on-gray. The dark theme is unchanged.
• Analyzer hint colors are theme-aware, so they stay readable on a white background and never blend into the log text.

Bug fixes
• Protocol tab — the Save button no longer goes inactive after loading a template. Template-loaded values are treated as unsaved edits until they are written to the device.
