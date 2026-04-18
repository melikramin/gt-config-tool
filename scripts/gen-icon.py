"""Generate build/icon.ico for the GT-9 Configurator app.

Draws a flat fuel-pump silhouette on an orange rounded-square background
at 1024px, downsamples to ICO multi-size (16..256) for Windows.
Run: python scripts/gen-icon.py
"""
from PIL import Image, ImageDraw
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
BUILD.mkdir(exist_ok=True)

ORANGE = (235, 95, 25, 255)
ORANGE_DARK = (200, 75, 15, 255)
WHITE = (255, 255, 255, 255)

SIZE = 1024
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Background: rounded square
pad = 60
d.rounded_rectangle((pad, pad, SIZE - pad, SIZE - pad), radius=160, fill=ORANGE)

# === Fuel pump silhouette (white) ===
# Main pump body
body = (260, 340, 620, 850)
d.rounded_rectangle(body, radius=24, fill=WHITE)

# Base pedestal
d.rectangle((240, 830, 640, 880), fill=WHITE)

# Display screen (darker orange inset, top portion of body)
d.rounded_rectangle((300, 380, 580, 540), radius=12, fill=ORANGE_DARK)

# Horizontal divider line on pump body (seam)
d.rectangle((280, 600, 600, 616), fill=ORANGE)

# Button/nozzle holder circle
d.ellipse((320, 650, 400, 730), outline=ORANGE, width=14)

# === Hose/nozzle arm going up-right ===
# Horizontal arm extending right from body
arm_y = 430
d.rectangle((620, arm_y, 740, arm_y + 70), fill=WHITE)

# Vertical pipe going up
pipe_x = 720
d.rectangle((pipe_x, 210, pipe_x + 70, arm_y + 70), fill=WHITE)

# Pipe cap / top curve
d.rounded_rectangle((pipe_x - 10, 195, pipe_x + 80, 260), radius=20, fill=WHITE)

# Nozzle spout pointing up-left
spout = [
    (pipe_x - 15, 205),
    (pipe_x + 85, 205),
    (pipe_x + 85, 270),
    (pipe_x + 55, 270),
    (pipe_x + 55, 330),
    (pipe_x + 25, 330),
    (pipe_x + 25, 270),
    (pipe_x - 15, 270),
]

# Drop/flame highlight on top of nozzle
drop_cx, drop_cy = pipe_x + 35, 160
d.ellipse((drop_cx - 22, drop_cy - 28, drop_cx + 22, drop_cy + 16), fill=WHITE)

# Save as multi-size ICO (Pillow downsamples from source for each size)
target_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
ico_path = BUILD / "icon.ico"
img.resize((256, 256), Image.LANCZOS).save(ico_path, format="ICO", sizes=target_sizes)

# Also export a 512px PNG for README / marketing
png_path = BUILD / "icon.png"
img.resize((512, 512), Image.LANCZOS).save(png_path, format="PNG")

print(f"Wrote {ico_path} ({ico_path.stat().st_size} bytes)")
print(f"Wrote {png_path} ({png_path.stat().st_size} bytes)")
