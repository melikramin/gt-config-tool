Release 2.1.0 — Camera configuration & Keys tab improvements

What's new:
• New "Camera" tab: connect and configure up to 3 cameras (camera 0 = RS232, cameras 1-2 = RS485). Choose port baud rate and image size; pick capture triggers (timer, input change, shock, tilt, e-key/RFID); run automatic camera search and shoot a test image right from the UI.
• Camera settings are saved to the template (.gtcfg), loaded back, and travel with the rest under "Read all" / "Write to device".

Fixes:
• "Keys" tab no longer scans all 2000 empty slots: if there are no keys, it shows "Key database is empty" right away. If, say, 5 keys exist, reading stops after 5 are found.
• "Write to device" no longer aborts on a single slow command — all settings reach the device, errors are surfaced in the status bar.
• The redundant LOG;RESET line was removed from templates and from the "Write to device" sequence.
