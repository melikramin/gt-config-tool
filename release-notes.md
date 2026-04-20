Release 2.1.0 — Camera configuration & Keys tab improvements

What's new:
• New "Camera" tab: connect and configure up to 3 cameras (camera 0 = RS232, cameras 1-2 = RS485). Choose port baud rate and image size; pick capture triggers (timer, input change, shock, tilt, e-key/RFID); run automatic camera search and shoot a test image right from the UI.
• Camera settings are saved to the template (.gtcfg), loaded back, and travel with the rest under "Read all" / "Write to device".

Fixes:
• "Keys" tab no longer scans all 2000 empty slots: if there are no keys, it shows "Key database is empty" right away. If, say, 5 keys exist, reading stops after 5 are found.
• "Write to device" no longer aborts on a single slow command — all settings reach the device, errors are surfaced in the status bar.
• The redundant LOG;RESET line was removed from templates and from the "Write to device" sequence.


Релиз 2.1.0 — настройка камер и улучшения вкладки «Ключи»

Что нового:
• Новая вкладка «Камера»: можно подключить и настроить до 3 камер (камера 0 = RS232, камеры 1-2 = RS485). Доступны выбор скорости порта, размера кадра, триггеры съёмки (по таймеру, изменению входов, удару, наклону, e-ключу/RFID), автоматический поиск камеры и тестовый снимок прямо из интерфейса.
• Настройки камер сохраняются в шаблон (.gtcfg), загружаются обратно и переносятся вместе с остальными при «Считать всё» / «Записать в устройство».

Исправления:
• На вкладке «Ключи» больше не сканируются все 2000 пустых ячеек: если ключей нет — сразу показывается «База ключей пуста». Если, например, ключей 5 — чтение останавливается после 5 найденных.
• При записи всех настроек в устройство процесс больше не обрывается из-за одной медленной команды — все настройки доходят до конца, а ошибки видны в строке статуса.
• Из шаблона и команды «Записать в устройство» убрана лишняя служебная команда LOG;RESET.
