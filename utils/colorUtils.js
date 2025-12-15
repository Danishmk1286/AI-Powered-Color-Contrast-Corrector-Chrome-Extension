// --- Helper Functions ---

/** Converts 0-255 RGB to 0.0-1.0 linear color (sRGB to linear RGB). */
function srgbToLinear(c) {
  c /= 255.0;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Calculates the relative luminance of an RGB color. */
function getLuminance(r, g, b) {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  // WCAG Luminance formula
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** Converts a hex color string to an RGB object. */
export function hexToRgb(hex) {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/** Converts RGB components to a 6-digit hex color string. */
export function rgbToHex(r, g, b) {
  const toHex = (c) => c.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// --- WCAG Contrast Functions ---

/**
 * Calculates the contrast ratio between two hex colors (Foreground vs Background).
 * @param {string} fgHex Foreground color in #RRGGBB format.
 * @param {string} bgHex Background color in #RRGGBB format.
 * @returns {number} The contrast ratio (1.0 to 21.0).
 */
export function getContrastRatio(fgHex, bgHex) {
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);
  if (!fg || !bg) return 1.0;

  const L1 = getLuminance(fg.r, fg.g, fg.b);
  const L2 = getLuminance(bg.r, bg.g, bg.b);

  const brighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);

  // WCAG Contrast Ratio Formula
  return (brighter + 0.05) / (darker + 0.05);
}

/**
 * Adjusts the foreground color (lightens/darkens) to meet a target contrast ratio.
 * This is a simplified adjustment that moves the foreground color closer to black or white.
 * @param {string} fgHex Current foreground color.
 * @param {string} bgHex Background color.
 * @param {number} targetRatio The desired minimum contrast ratio.
 * @returns {string} The new foreground color in hex.
 */
export function adjustColorForContrast(fgHex, bgHex, targetRatio) {
  const bg = hexToRgb(bgHex);
  const L_bg = getLuminance(bg.r, bg.g, bg.b);
  const current_L_fg = getLuminance(
    hexToRgb(fgHex).r,
    hexToRgb(fgHex).g,
    hexToRgb(fgHex).b
  );

  // Determine if the current foreground is closer to white or black (relative to background)
  // This helps decide whether to lighten or darken.
  const is_light_bg = L_bg > 0.5;
  const should_lighten =
    current_L_fg < L_bg || (is_light_bg && current_L_fg < 0.5);

  // Create two extremes: pure black and pure white
  const blackHex = "#000000";
  const whiteHex = "#ffffff";

  // Check the contrast of black and white against the background
  const cr_black = getContrastRatio(blackHex, bgHex);
  const cr_white = getContrastRatio(whiteHex, bgHex);

  let target_fg_hex = fgHex;

  // Simple adjustment: pick the color (black or white) that provides the needed contrast.
  if (cr_white >= targetRatio) {
    // White works, try to move toward white
    if (cr_black < targetRatio || (cr_white > cr_black && should_lighten)) {
      target_fg_hex = whiteHex;
    }
  }
  if (cr_black >= targetRatio) {
    // Black works, try to move toward black
    if (cr_white < targetRatio || (cr_black > cr_white && !should_lighten)) {
      target_fg_hex = blackHex;
    }
  }

  // Note: For a more sophisticated tool, you would use a color-stepping algorithm
  // to find the least intrusive change, but using pure black/white is effective
  // and simple for guaranteed contrast.

  return target_fg_hex;
}

/**
 * Placeholder for image optimization. Real implementation is complex.
 * This version simply returns extreme contrast colors.
 * @param {string} fgHex Current foreground color.
 * @param {string} bgHex Approximated solid background color.
 * @returns {{foreground: string, background: string}} Optimized colors.
 */
export function optimizeTextOverImage(fgHex, bgHex) {
  // Check the contrast of black and white against the approximate background color
  const cr_black = getContrastRatio("#000000", bgHex);
  const cr_white = getContrastRatio("#ffffff", bgHex);

  // If we have an image, we assume a semi-transparent black or white overlay
  // is needed on the background, and the text color should be opposite.

  if (cr_black > cr_white) {
    // Background is light, text should be black
    return {
      foreground: "#000000",
      background: "rgba(255, 255, 255, 0.6)", // Add a light, semi-transparent overlay
    };
  } else {
    // Background is dark, text should be white
    return {
      foreground: "#ffffff",
      background: "rgba(0, 0, 0, 0.6)", // Add a dark, semi-transparent overlay
    };
  }
}
