Release 2.1.4 — Camera cleanup, Keypad relabel, Time Synchronization

What's new
• Security tab — new "Time Synchronization" panel: GPS, NTP and GSM time sync flags are now read on connect, included in Read All / Write All, and saved into templates.
• Keypad tab (renamed from "Keyboard") — clearer labels:
  – "Vehicle ID?" → "Request Driver?"
  – "Driver tag type?" → "Driver card only!"
  – "Enter driver code?" → "Prevent code entry"
  – "Request dose?" → "Request preset?"
  – "Request odometer?" → "Mileage", "Compare odometer" → "Compare mileage"
  – Dependent checkboxes (Verify driver?, Driver card only!, Prevent code entry) are disabled when "Request Driver?" is off; "Compare mileage" is disabled when "Mileage" is off.
• Security tab — "Online timeout, sec" is now editable when authentication method is Online or Online/Offline (was always disabled).

Changes
• Camera tab — Camera 2 slot removed. Only Camera 0 (RS232) and Camera 1 (RS485) are exposed; existing CAMERA2 entries in old templates are silently ignored on load.
