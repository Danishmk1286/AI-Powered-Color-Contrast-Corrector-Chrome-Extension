# Purpose: Generate a dataset of color pairs and label their comfort based on WCAG contrast ratio.
# Language: Python 3

import random
import pandas as pd

# ----------------------------------------------------
# Step 1 — Define functions for luminance and contrast
# ----------------------------------------------------
def luminance(r, g, b):
    """
    Compute relative luminance of a color using the WCAG 2.1 formula.
    Input: RGB values (0–255)
    Output: Luminance between 0 and 1
    """
    a = [v / 255.0 for v in (r, g, b)]
    a = [v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4 for v in a]
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]

def contrast_ratio(fg, bg):
    """
    Calculate WCAG contrast ratio between foreground and background.
    Output: Number between 1 and 21
    """
    L1 = luminance(*fg)
    L2 = luminance(*bg)
    return (max(L1, L2) + 0.05) / (min(L1, L2) + 0.05)


# ----------------------------------------------------
# Step 2 — Generate random color pairs
# ----------------------------------------------------
rows = []
for _ in range(5000):  # Generate 5,000 examples
    fg = [random.randint(0, 255) for _ in range(3)]
    bg = [random.randint(0, 255) for _ in range(3)]
    ratio = contrast_ratio(fg, bg)

    # ------------------------------------------------
    # Step 3 — Label according to comfort rule
    # ------------------------------------------------
    # For now: ≥ 4.5 = comfortable, else uncomfortable
    label = 1 if ratio >= 4.5 else 0

    rows.append({
        "fg_r": fg[0], "fg_g": fg[1], "fg_b": fg[2],
        "bg_r": bg[0], "bg_g": bg[1], "bg_b": bg[2],
        "contrast_ratio": ratio,
        "label": label
    })


# ----------------------------------------------------
# Step 4 — Save to CSV
# ----------------------------------------------------
df = pd.DataFrame(rows)
df.to_csv("data/color_pairs.csv", index=False)
print("✅ Dataset saved at: data/color_pairs.csv")
print(df.head())
