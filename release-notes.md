Release 2.1.5 — Settings persistence fixes, online timeout write fix

Bug fixes
• Settings tabs — saved values no longer revert to a stale state. Previously, after changing and saving a setting, switching to another tab and back showed the old pre-save value until you pressed "Read". The in-app cache is now refreshed on every successful save (Server, Protocol, GPS, Inputs/Outputs, RS Interfaces, FLS, Pumps, Keypad, Security, Printer).
• Tags/Keys tab — the keys list is no longer cleared when you switch to another tab and back. It now persists for the whole connection and is cleared on disconnect.
• Security tab — "Online timeout" is now written to the device. The PUMPSEC write command previously omitted this field, so changes to it were silently lost.

What's new
• Status tab — the pump panel now reflects the pump configuration: unconfigured pump slots (type = 0) are shown faded instead of being colored only by the FUEL status flag.
• Security tab — tag authorization (TAGCFG) gains two new fields: "Key length (bytes)" and "Byte order" (big/little endian). Both are read on connect, written on save, and included in templates and Read All / Write All.
