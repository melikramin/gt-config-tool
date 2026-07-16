Release 2.1.8 — GSM analyzer: modem reboots, socket errors, LTE search

What's new
• Diagnostics tab — the GSM log analyzer now explains modem reboots. RDY and +CFUN: 1 are recognized as "modem booted and ready" and "radio module on", so a restart in the middle of a log is obvious instead of looking like random noise.
• Diagnostics tab — modem time (+CCLK) is now shown, and an unsynchronized clock is called out as a warning. A modem reporting year 04 or 80 has not received time from the network yet — a common reason a device looks alive while its records land with wrong timestamps.
• Diagnostics tab — full coverage of Quectel socket open errors: server unreachable (566), operation busy (568), operation timeout (569), PDP context broken down (570), APN not configured (573) and port busy (574). Previously these codes went by unexplained.
• Diagnostics tab — the missing LTE registration states: searching for network (+CEREG: 0,2), unknown state (0,4) and registered in roaming (0,5). A long LTE search is now flagged the same way a long 2G/3G search already was.

Improvements
• Server settings — the server response timeout sent with the connection settings is now 10 seconds instead of 30, so the device notices a dead link and reconnects faster.

Bug fixes
• Diagnostics tab — +QIOPEN: <id>,567 was explained incorrectly as "socket open aborted/timeout". Per the Quectel manual 567 means the socket has been closed, and in practice it arrives right after the firmware itself closed the socket by its own timeout. It is now shown as a warning with the correct meaning, so it is no longer mistaken for a connection failure.
