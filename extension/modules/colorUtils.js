/**
 * Color Utilities Module
 * Handles color parsing, conversion, and WCAG contrast calculations
 */

// Canvas for color parsing
const __colCanvas = document.createElement("canvas");
const __colCtx = __colCanvas.getContext("2d", { willReadFrequently: true });

/**
 * Parse CSS color string to RGBA array
 * @param {string} css - CSS color string
 * @param {Array} fallback - Fallback RGBA values
 * @returns {Array} RGBA array [r, g, b, a]
 */
export function parseCSSColorToRGBA(css, fallback = [0, 0, 0, 1]) {
  if (!css || css === "transparent" || css === "rgba(0, 0, 0, 0)") {
    return fallback;
  }

  try {
    __colCtx.fillStyle = "#000";
    __colCtx.fillStyle = css;
    const computed = __colCtx.fillStyle;

    // Handle HEX format (#RRGGBB or #RGB)
    if (computed.startsWith("#")) {
      const hex = computed.substring(1);
      let r, g, b;

      if (hex.length === 3) {
        // #RGB format
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      } else if (hex.length === 6) {
        // #RRGGBB format
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
      } else {
        return fallback;
      }

      return [r, g, b, 1];
    }

    // Handle rgb() or rgba() format
    const m = computed.match(/rgba?\(([^)]+)\)/i);
    if (!m) {
      return fallback;
    }

    const parts = m[1].split(",").map((s) => s.trim());
    const r = Math.min(255, Math.max(0, parseFloat(parts[0])));
    const g = Math.min(255, Math.max(0, parseFloat(parts[1])));
    const b = Math.min(255, Math.max(0, parseFloat(parts[2])));
    const a =
      parts[3] !== undefined
        ? Math.min(1, Math.max(0, parseFloat(parts[3])))
        : 1;

    return [r, g, b, a];
  } catch (e) {
    console.warn(`🎨 Error parsing color "${css}":`, e);
    return fallback;
  }
}

/**
 * Convert RGB to linear color space
 * @param {number} c - Color component (0-255)
 * @returns {number} Linear color value
 */
export function toLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/**
 * Calculate relative luminance from RGB
 * @param {Array} rgb - RGB array [r, g, b]
 * @returns {number} Relative luminance
 */
export function relLuminance([r, g, b]) {
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/**
 * Calculate WCAG contrast ratio
 * @param {Array} fgRGB - Foreground RGB array
 * @param {Array} bgRGB - Background RGB array
 * @returns {number} Contrast ratio
 */
export function wcagContrast(fgRGB, bgRGB) {
  const L1 = relLuminance(fgRGB);
  const L2 = relLuminance(bgRGB);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Convert RGB to HSL
 * @param {Array} rgb - RGB array [r, g, b]
 * @returns {Array} HSL array [h, s, l]
 */
export function rgbToHsl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return [h * 360, s * 100, l * 100];
}

/**
 * Convert HSL to RGB
 * @param {Array} hsl - HSL array [h, s, l]
 * @returns {Array} RGB array [r, g, b]
 */
export function hslToRgb([h, s, l]) {
  h /= 360;
  s /= 100;
  l /= 100;
  let r, g, b;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * Convert RGB array to RGB string
 * @param {Array} rgb - RGB array [r, g, b]
 * @returns {string} RGB string
 */
export function rgbToStr(rgb) {
  const [r = 0, g = 0, b = 0] = Array.isArray(rgb) ? rgb : [0, 0, 0];
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

/**
 * Alpha blend source over destination
 * @param {Array} src - Source RGBA array
 * @param {Array} dst - Destination RGBA array
 * @returns {Array} Blended RGBA array
 */
export function blendRGBA(src, dst) {
  const [sr, sg, sb, sa] = src;
  const [dr, dg, db, da] = dst;
  const outA = sa + da * (1 - sa);
  if (outA === 0) return [0, 0, 0, 0];
  const outR = (sr * sa + dr * da * (1 - sa)) / outA;
  const outG = (sg * sa + dg * da * (1 - sa)) / outA;
  const outB = (sb * sa + db * da * (1 - sa)) / outA;
  return [outR, outG, outB, outA];
}

/**
 * Blend colors using standard alpha compositing
 * @param {Array} fgRGBA - Foreground RGBA array
 * @param {Array} bgRGBA - Background RGBA array
 * @returns {Array} Blended RGBA array
 */
export function blendColors(fgRGBA, bgRGBA) {
  const [fr, fg, fb, fa] = fgRGBA;
  const [br, bg, bb, ba] = bgRGBA;

  // Standard alpha compositing formula
  const blendedR = fr * fa + br * (1 - fa);
  const blendedG = fg * fa + bg * (1 - fa);
  const blendedB = fb * fa + bb * (1 - fa);

  // Result alpha is the combination (for further blending)
  const blendedA = fa + ba * (1 - fa);

  return [blendedR, blendedG, blendedB, blendedA];
}

/**
 * Convert RGB to CIELAB (L*a*b*) color space
 * @param {Array} rgb - RGB array [r, g, b] (0-255)
 * @returns {Array} LAB array [L*, a*, b*]
 */
export function rgbToLab([r, g, b]) {
  // Convert RGB to linear RGB
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);

  // Convert to XYZ (using D65 illuminant)
  let X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  let Y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
  let Z = R * 0.0193339 + G * 0.1191920 + B * 0.9503041;

  // Normalize by D65 white point
  X /= 0.95047;
  Y /= 1.00000;
  Z /= 1.08883;

  // Apply f function for LAB conversion
  const f = (t) => {
    const delta = 6.0 / 29.0;
    if (t > delta ** 3) {
      return Math.pow(t, 1.0 / 3.0);
    }
    return t / (3 * delta ** 2) + 4.0 / 29.0;
  };

  const fx = f(X);
  const fy = f(Y);
  const fz = f(Z);

  // Calculate L*, a*, b* (using bStar to avoid conflict with RGB b)
  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bStar = 200 * (fy - fz);

  return [L, a, bStar];
}

/**
 * Convert CIELAB (L*a*b*) to RGB color space
 * @param {Array} lab - LAB array [L*, a*, b*]
 * @returns {Array} RGB array [r, g, b] (0-255)
 */
export function labToRgb([L, a, bStar]) {
  // Convert LAB to XYZ
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - bStar / 200;

  const delta = 6.0 / 29.0;
  const xr = fx > delta ? fx ** 3 : 3 * delta ** 2 * (fx - 4.0 / 29.0);
  const yr = fy > delta ? fy ** 3 : 3 * delta ** 2 * (fy - 4.0 / 29.0);
  const zr = fz > delta ? fz ** 3 : 3 * delta ** 2 * (fz - 4.0 / 29.0);

  // Denormalize by D65 white point
  const X = xr * 0.95047;
  const Y = yr * 1.00000;
  const Z = zr * 1.08883;

  // Convert XYZ to linear RGB
  let R = X * 3.2404542 + Y * -1.5371385 + Z * -0.4985314;
  let G = X * -0.9692660 + Y * 1.8760108 + Z * 0.0415560;
  let B = X * 0.0556434 + Y * -0.2040259 + Z * 1.0572252;

  // Convert linear RGB to sRGB (gamma correction)
  const toSRGB = (c) => {
    if (c <= 0.0031308) {
      return 12.92 * c;
    }
    return 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
  };

  R = toSRGB(R);
  G = toSRGB(G);
  B = toSRGB(B);

  // Clamp and convert to 0-255
  return [
    Math.max(0, Math.min(255, Math.round(R * 255))),
    Math.max(0, Math.min(255, Math.round(G * 255))),
    Math.max(0, Math.min(255, Math.round(B * 255)))
  ];
}

/**
 * Calculate CIEDE2000 Delta E (perceptual color difference)
 * @param {Array} lab1 - First LAB color [L*, a*, b*]
 * @param {Array} lab2 - Second LAB color [L*, a*, b*]
 * @returns {number} Delta E value (lower = more similar)
 */
export function deltaE2000([L1, a1, b1Star], [L2, a2, b2Star]) {
  // Convert to radians
  const deg2rad = Math.PI / 180;

  // Calculate C* (chroma) and h (hue angle)
  const C1 = Math.sqrt(a1 * a1 + b1Star * b1Star);
  const C2 = Math.sqrt(a2 * a2 + b2Star * b2Star);
  const Cbar = (C1 + C2) / 2;

  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cbar, 7) / (Math.pow(Cbar, 7) + Math.pow(25, 7))));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;

  const C1p = Math.sqrt(a1p * a1p + b1Star * b1Star);
  const C2p = Math.sqrt(a2p * a2p + b2Star * b2Star);

  let h1p = Math.atan2(b1Star, a1p) * 180 / Math.PI;
  let h2p = Math.atan2(b2Star, a2p) * 180 / Math.PI;

  // Normalize hue angles to 0-360
  if (h1p < 0) h1p += 360;
  if (h2p < 0) h2p += 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dHp;
  if (C1p * C2p === 0) {
    dHp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    dHp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    dHp = h2p - h1p - 360;
  } else {
    dHp = h2p - h1p + 360;
  }

  dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dHp * deg2rad / 2);

  const Lpbar = (L1 + L2) / 2;
  const Cpbar = (C1p + C2p) / 2;

  let Hpbar;
  if (C1p * C2p === 0) {
    Hpbar = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    Hpbar = (h1p + h2p) / 2;
  } else if (Math.abs(h1p - h2p) > 180 && h1p + h2p < 360) {
    Hpbar = (h1p + h2p + 360) / 2;
  } else {
    Hpbar = (h1p + h2p - 360) / 2;
  }

  const T = 1 - 0.17 * Math.cos((Hpbar - 30) * deg2rad) +
            0.24 * Math.cos(2 * Hpbar * deg2rad) +
            0.32 * Math.cos((3 * Hpbar + 6) * deg2rad) -
            0.20 * Math.cos((4 * Hpbar - 63) * deg2rad);

  const dTheta = 30 * Math.exp(-Math.pow((Hpbar - 275) / 25, 2));

  const RC = 2 * Math.sqrt(Math.pow(Cpbar, 7) / (Math.pow(Cpbar, 7) + Math.pow(25, 7)));

  const RT = -Math.sin(2 * dTheta * deg2rad) * RC;

  const SL = 1 + (0.015 * Math.pow(Lpbar - 50, 2)) / Math.sqrt(20 + Math.pow(Lpbar - 50, 2));
  const SC = 1 + 0.045 * Cpbar;
  const SH = 1 + 0.015 * Cpbar * T;

  const kL = 1;
  const kC = 1;
  const kH = 1;

  const dE00 = Math.sqrt(
    Math.pow(dLp / (kL * SL), 2) +
    Math.pow(dCp / (kC * SC), 2) +
    Math.pow(dHp / (kH * SH), 2) +
    RT * (dCp / (kC * SC)) * (dHp / (kH * SH))
  );

  return dE00;
}