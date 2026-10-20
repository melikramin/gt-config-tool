Release 2.1.9 — GT-2 router support

What's new
• GT-2 router support. The configurator recognizes the GT-2 by its hardware type and shows only the settings this device has: Status, Diagnostics, Server, WiFi, Ethernet, RS Interfaces and System.
• Status tab (GT-2) — firmware version, device model, supply voltage, internal battery and internal temperature.
• Server settings — new connection channels: Ethernet, Ethernet + GSM and Ethernet + WiFi, and the new GT2 Slave protocol. On GT-2, GSM channels and the APN block are unavailable (the device has no GSM modem) and only the GT2 Slave protocol can be selected.
• WiFi settings work on GT-2 exactly as on GT-9.
• Ethernet tab (GT-2) — DHCP or static IP settings. Reading and saving will be enabled as soon as the firmware supports the Ethernet command.
• RS Interfaces (GT-2) — RS232 and RS485 are shown with their current settings (GT2 Slave device type). Editing is not available yet.
• Diagnostics (GT-2) — RS232, RS485 and the new Bluetooth log channel.
• System tab (GT-2) — firmware update from a file, factory reset, settings reset, and the new BLE module update: the device switches its Bluetooth module into update mode and keeps working while the update is done from a phone.

Improvements
• Server settings — on GT-9, GT-7 and other devices without an Ethernet port, the Ethernet channels are shown but cannot be selected.
