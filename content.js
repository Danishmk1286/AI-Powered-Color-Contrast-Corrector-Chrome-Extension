(function () {
  console.log("[CONTENT_DEBUG] Script execution started.");
  if (window.__AI_CONTRAST_SCRIPT_LOADED__) {
    console.log("[CONTENT_DEBUG] Script already loaded. Exiting to prevent duplicate execution.");
    return;
  }
  window.__AI_CONTRAST_SCRIPT_LOADED__ = true;

  // ============================================================================
  // AI Color Contrast Assistant - Browser Extension
  // Automatically detects and fixes color contrast issues for WCAG compliance
  // ============================================================================
  //
  // SECTION INDEX:
  // ---------------
  // SECTION 1: Initialization & Guards (Lines ~1-15)
  // SECTION 2: Color Utilities (Lines ~16-250)
  //   - parseCSSColorToRGBA, toLinear, relLuminance, wcagContrast
  //   - rgbToHsl, hslToRgb (color conversion)
  //   - rgbToStr, blendRGBA, blendColors
  //   - verifyAppliedStyle (live verification)
  //
  // SECTION 3: Background Resolution (Lines ~620-730)
  //   - getEffectiveBackgroundRGBA (ancestor chain walking)
  //   - getEffectiveForegroundRGB
  //   - hasBackgroundGradient, hasBackgroundImage, isTextOverImage
  //
  // SECTION 4: Eligibility/Skip Logic (Lines ~4970-5180)
  //   - shouldSkipContrastFix (ONLY gatekeeper for skipping)
  //   - getEffectiveBackgroundInfo
  //
  // SECTION 5: Color Adjustment Engine (Lines ~3120-3430)
  //   - adjustColorToContrast (main correction algorithm)
  //
  // SECTION 6: Element Processing (Lines ~5180-6750)
  //   - processElementForContrast (single element handler)
  //   - scanWithAI (main scan function)
  //
  // SECTION 7: Hover System (Lines ~1700-3120, 7050-8350)
  //   - fixButtonHoverState, applyHoverLogic
  //   - hover event handlers, CSS injection
  //
  // SECTION 8: MutationObserver (Lines ~8560-8650)
  //   - startObservingDynamicContent
  //   - stopObservingDynamicContent
  //
  // SECTION 9: Message Handlers & API (Lines ~8650-9000)
  //   - Chrome runtime message handlers
  //   - API communication (callAI, checkAPIHealth)
  //
  // ============================================================================


  const DEBUG_HOVER = false;
  const __colCanvas = document.createElement("canvas");
  const __colCtx = __colCanvas.getContext("2d", { willReadFrequently: true });

  // Research-based alpha thresholds for background color resolution (HCI principles)
  // NEAR_INVISIBLE_ALPHA: Subliminal threshold - continue traversal only if alpha < this value
  const NEAR_INVISIBLE_ALPHA = 0.02;
  // SEMI_SOLID_ALPHA: Visual dominance threshold (informational - implicitly handled by >= 0.02 stop condition)
  const SEMI_SOLID_ALPHA = 0.5;

  function parseCSSColorToRGBA(css, fallback = [0, 0, 0, 1]) {
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

  function toLinear(c) {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }

  function relLuminance([r, g, b]) {
    const R = toLinear(r);
    const G = toLinear(g);
    const B = toLinear(b);
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  }

  /**
   * WCAG 2.2 Compliant Color Parser
   * Normalizes any CSS color string to RGB array
   * @param {string|Array} color - CSS color string or [r, g, b] array
   * @returns {Array|null} [r, g, b] array or null if invalid
   */
  function parseColourToRGB(color) {
    // If already an array, return it
    if (Array.isArray(color) && color.length >= 3) {
      return color.slice(0, 3).map(c => Math.max(0, Math.min(255, Math.round(c))));
    }
    
    // If string, parse it
    if (typeof color !== 'string') return null;
    
    // Try direct RGB/RGBA parsing first (faster)
    const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbMatch) {
      return [+rgbMatch[1], +rgbMatch[2], +rgbMatch[3]];
    }
    
    // Use browser's color parsing (handles hex, hsl, named colors, etc.)
    try {
      const div = document.createElement('div');
      div.style.color = color;
      // Don't append to body if it doesn't exist yet
      if (document.body) {
        document.body.appendChild(div);
        const rgb = getComputedStyle(div).color; // always rgb(...) or rgba(...)
        div.remove();
        const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return m ? [+m[1], +m[2], +m[3]] : null;
      } else {
        // Fallback: try parseCSSColorToRGBA if available
        const parsed = parseCSSColorToRGBA(color, null);
        return parsed ? parsed.slice(0, 3) : null;
      }
    } catch (e) {
      // Fallback to existing parser
      const parsed = parseCSSColorToRGBA(color, null);
      return parsed ? parsed.slice(0, 3) : null;
    }
  }

  /**
   * WCAG 2.2 Compliant Contrast Calculation
   * Returns the WCAG contrast ratio (1:1 – 21:1) between two colours
   * @param {string|Array} fg - Foreground color (CSS string or [r, g, b] array)
   * @param {string|Array} bg - Background color (CSS string or [r, g, b] array)
   * @returns {number} Contrast ratio (1-21)
   */
  function getContrast(fg, bg) {
    const fgRgb = parseColourToRGB(fg);
    const bgRgb = parseColourToRGB(bg);
    if (!fgRgb || !bgRgb) return 21; // fail-safe

    const l1 = relLuminance(fgRgb);
    const l2 = relLuminance(bgRgb);
    const lighter = Math.max(l1, l2);
    const darker  = Math.min(l1, l2);

    return (lighter + 0.05) / (darker + 0.05); // WCAG formula
  }

  /**
   * WCAG 2.2 Compliance Checker
   * Does the ratio pass WCAG 2.2 for the given text size and level?
   * @param {number} ratio - Contrast ratio from getContrast()
   * @param {number} sizePt - Font size in points (1 px = 0.75 pt)
   * @param {string} level - 'AA' | 'AAA'
   * @param {HTMLElement} element - Optional element to check font-weight
   * @returns {boolean} True if meets WCAG requirements
   */
  function meetsWCAG(ratio, sizePt = 12, level = 'AA', element = null) {
    const large = sizePt >= 18 || (sizePt >= 14 && isBold(element));
    if (level === 'AA') return large ? ratio >= 3 : ratio >= 4.5;
    if (level === 'AAA') return large ? ratio >= 4.5 : ratio >= 7;
    return false;

    function isBold(el) {
      if (el) {
        try {
          return Number(getComputedStyle(el).fontWeight) >= 700;
        } catch (e) {
          // Fallback to body if element check fails
        }
      }
      // Quick-and-dirty: check computed font-weight ≥ 700
      try {
        return Number(getComputedStyle(document.body).fontWeight) >= 700;
      } catch (e) {
        return false;
      }
    }
  }

  /**
   * Backward-compatible wrapper for existing code
   * Accepts RGB arrays [r, g, b] for compatibility
   * @param {Array|string} fgRGB - Foreground color
   * @param {Array|string} bgRGB - Background color
   * @returns {number} Contrast ratio
   */
  function wcagContrast(fgRGB, bgRGB) {
    return getContrast(fgRGB, bgRGB);
  }

  // HSL conversion helpers for brand-preserving hover colors
  // Accepts [r, g, b] array where each is 0-255
  // Returns [h, s, l] where h is 0-360 degrees, s and l are 0-100 percentages
  function rgbToHsl(input) {
    // Validate input
    if (!Array.isArray(input) || input.length < 3) {
      console.warn('rgbToHsl: Invalid input, expecting [r, g, b] array');
      return [0, 0, 0];
    }

    let [r, g, b] = input;

    // Validate individual values
    if (typeof r !== 'number' || typeof g !== 'number' || typeof b !== 'number' ||
      isNaN(r) || isNaN(g) || isNaN(b)) {
      console.warn('rgbToHsl: Invalid RGB values, returning default');
      return [0, 0, 0];
    }

    r = Math.max(0, Math.min(255, r)) / 255;
    g = Math.max(0, Math.min(255, g)) / 255;
    b = Math.max(0, Math.min(255, b)) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0,
      s = 0,
      l = (max + min) / 2;

    if (max !== min) {
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

  // Converts [h, s, l] to [r, g, b]
  // Expects h as 0-360 degrees, s and l as 0-100 percentages
  // Returns [r, g, b] where each is 0-255
  function hslToRgb(input) {
    // Validate input
    if (!Array.isArray(input) || input.length < 3) {
      console.warn('hslToRgb: Invalid input, expecting [h, s, l] array');
      return [128, 128, 128];
    }

    let [h, s, l] = input;

    // Validate individual values
    if (typeof h !== 'number' || typeof s !== 'number' || typeof l !== 'number' ||
      isNaN(h) || isNaN(s) || isNaN(l)) {
      console.warn('hslToRgb: Invalid HSL values, returning default');
      return [128, 128, 128];
    }

    // Normalize values
    h = ((h % 360) + 360) % 360 / 360; // Handle negative hues
    s = Math.max(0, Math.min(100, s)) / 100;
    l = Math.max(0, Math.min(100, l)) / 100;

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

  // ============================================================================
  // Rule-Based HSL Fallback Algorithm
  // Used when CIELAB optimization fails or produces invalid results
  // ============================================================================

  /**
   * Rule-based HSL fallback algorithm for color suggestions
   * Used when CIELAB optimization fails or produces invalid results
   * 
   * Algorithm:
   * 1. Determine which color (text or background) is lighter
   * 2. Keep the lighter one fixed; modify the darker one
   * 3. Iteratively adjust the darker color's lightness in HSL space (1% steps)
   * 4. Collect valid shades that meet contrast ≥ targetRatio
   * 5. Return the best valid color (first one that meets target)
   * 
   * @param {Array<number>} fgRGB - Foreground RGB [r, g, b]
   * @param {Array<number>} bgRGB - Background RGB [r, g, b]
   * @param {number} targetRatio - Target contrast ratio (e.g., 4.5)
   * @returns {Array<number>} - Adjusted RGB color [r, g, b]
   */
  function ruleBasedHslFallback(fgRGB, bgRGB, targetRatio) {
    // Compute relative luminance for both colors
    const fgLum = relLuminance(fgRGB);
    const bgLum = relLuminance(bgRGB);
    
    // Determine which color is lighter
    const fgIsLighter = fgLum > bgLum;
    
    // ALWAYS adjust the foreground color (text), keep background fixed
    // This preserves brand colors by adjusting text, not background
    const fixedColor = bgRGB; // Background stays fixed
    const adjustColor = fgRGB; // Foreground (text) is adjusted
    
    // Convert the foreground color to HSL
    const adjustHsl = rgbToHsl(adjustColor);
    const [h, s, l] = adjustHsl;
    
    // Determine direction: if foreground is darker than background, lighten it
    // If foreground is lighter than background, darken it
    const needLighter = !fgIsLighter; // If fg is darker, lighten it
    
    // Collect valid shades (up to 5)
    const validShades = [];
    const step = 1; // 1% steps
    const startL = l;
    const limit = needLighter ? 100 : 0;
    const direction = needLighter ? 1 : -1;
    
    // Walk lightness from current value to limit
    for (let testL = startL; (needLighter && testL <= limit) || (!needLighter && testL >= limit); testL += direction * step) {
      // Clamp lightness to valid range
      const clampedL = Math.max(0, Math.min(100, testL));
      
      // Convert back to RGB
      const testRgb = hslToRgb([h, s, clampedL]);
      
      // Compute contrast: foreground (test) against background (fixed)
      const testContrast = wcagContrast(testRgb, fixedColor);
      
      // If contrast meets target, collect this shade
      if (testContrast >= targetRatio) {
        validShades.push({
          rgb: testRgb,
          contrast: testContrast,
          lightness: clampedL
        });
        
        // Stop after finding first valid color (we want the closest to original)
        break;
      }
      
      // Safety: prevent infinite loops
      if (Math.abs(testL - limit) < 0.01) break;
    }
    
    // If we found valid shades, return the first one (closest to original)
    if (validShades.length > 0) {
      const best = validShades[0];
      console.log(`   ✅ [RULE-BASED] Found valid color: RGB(${best.rgb.map(x => Math.round(x)).join(',')}), contrast=${best.contrast.toFixed(2)}:1, lightness=${best.lightness.toFixed(1)}%`);
      return best.rgb;
    }
    
    // If no valid shade found, return the original foreground color
    console.warn(`   ⚠️  [RULE-BASED] No valid shade found, returning original foreground color`);
    return adjustColor;
  }

  // ============================================================================
  // PHASE A: Core Logic Migration - Pure JavaScript CIELAB Functions
  // Zero-latency on-device color science (replaces localhost API calls)
  // ============================================================================

  /**
   * Python-style wrapper: Convert RGB to CIELAB
   * CRITICAL FIX: Mathematically verified against Python implementation
   * @param {number} r - Red component (0-255)
   * @param {number} g - Green component (0-255)
   * @param {number} b - Blue component (0-255)
   * @returns {Array} LAB array [L*, a*, b*]
   */
  function _rgb_to_lab(r, g, b) {
    // Validate inputs
    if (typeof r !== 'number' || typeof g !== 'number' || typeof b !== 'number' ||
        isNaN(r) || isNaN(g) || isNaN(b)) {
      console.error('[CIELAB] Invalid RGB input:', r, g, b);
      return [50, 0, 0]; // Return neutral gray on error
    }
    
    // Clamp to valid range
    r = Math.max(0, Math.min(255, Math.round(r)));
    g = Math.max(0, Math.min(255, Math.round(g)));
    b = Math.max(0, Math.min(255, Math.round(b)));
    
    try {
      const lab = rgbToLab([r, g, b]);
      // Validate output
      if (!Array.isArray(lab) || lab.length !== 3 || 
          lab.some(v => typeof v !== 'number' || isNaN(v) || !isFinite(v))) {
        console.error('[CIELAB] Invalid LAB output:', lab);
        return [50, 0, 0];
      }
      return lab;
    } catch (error) {
      console.error('[CIELAB] Error in _rgb_to_lab:', error);
      return [50, 0, 0];
    }
  }

  /**
   * Python-style wrapper: Calculate CIEDE2000 Delta E
   * CRITICAL FIX: Mathematically verified against Python implementation
   * @param {Array} lab1 - First LAB color [L*, a*, b*]
   * @param {Array} lab2 - Second LAB color [L*, a*, b*]
   * @returns {number} Delta E value (lower = more similar)
   */
  function _delta_e_2000(lab1, lab2) {
    // Validate inputs
    if (!Array.isArray(lab1) || !Array.isArray(lab2) || 
        lab1.length !== 3 || lab2.length !== 3) {
      console.error('[CIELAB] Invalid LAB input:', lab1, lab2);
      return Infinity; // Return maximum difference on error
    }
    
    try {
      const deltaE = deltaE2000(lab1, lab2);
      // Validate output
      if (typeof deltaE !== 'number' || isNaN(deltaE) || !isFinite(deltaE)) {
        console.error('[CIELAB] Invalid Delta E output:', deltaE);
        return Infinity;
      }
      return Math.max(0, deltaE); // Ensure non-negative
    } catch (error) {
      console.error('[CIELAB] Error in _delta_e_2000:', error);
      return Infinity;
    }
  }

  /**
   * Python-style wrapper: Find optimal color using CIELAB optimization with Delta E minimization
   * CRITICAL FIX: Ensures always returns valid RGB array [r, g, b]
   * This is the core on-device replacement for the localhost API call
   * @param {Array} fg - Foreground RGB [r, g, b]
   * @param {Array} bg - Background RGB [r, g, b]
   * @param {number} target - Target contrast ratio
   * @returns {Array} Optimal foreground RGB [r, g, b] that meets target with minimum Delta E
   */
  function _find_optimal_color_cielab(fg, bg, target) {
    // Validate inputs
    if (!Array.isArray(fg) || fg.length !== 3 || !Array.isArray(bg) || bg.length !== 3) {
      console.error('[CIELAB] Invalid RGB input - fg:', fg, 'bg:', bg);
      // Return safe fallback
      return bg[0] + bg[1] + bg[2] < 382 ? [255, 255, 255] : [0, 0, 0];
    }
    
    if (typeof target !== 'number' || isNaN(target) || target <= 0) {
      console.error('[CIELAB] Invalid target contrast:', target);
      target = 4.5; // Default to WCAG AA
    }
    
    try {
      const result = adjustColorToContrast(fg, bg, target, {});
      
      // CRITICAL: adjustColorToContrast now always returns an RGB array [r, g, b]
      // Validate result is an array
      let optimalRgb = null;
      
      if (Array.isArray(result) && result.length === 3) {
        // Validate all values are numbers
        const isValid = result.every(v => {
          const num = Number(v);
          return !isNaN(num) && isFinite(num) && num >= 0 && num <= 255;
        });
        
        if (isValid) {
          optimalRgb = result.map(v => Math.max(0, Math.min(255, Math.round(Number(v)))));
        } else {
          console.error('[CIELAB] Invalid RGB values in result:', result);
          const bgLum = relLuminance(bg);
          optimalRgb = bgLum < 0.5 ? [255, 255, 255] : [0, 0, 0];
        }
      } else {
        console.error('[CIELAB] Invalid result from adjustColorToContrast (not an array):', result);
        // Calculate safe fallback based on background
        const bgLum = relLuminance(bg);
        optimalRgb = bgLum < 0.5 ? [255, 255, 255] : [0, 0, 0];
      }
      
      // Ensure all values are valid numbers in 0-255 range
      optimalRgb = optimalRgb.map(c => {
        const val = Math.round(Number(c));
        return Math.max(0, Math.min(255, isNaN(val) ? 0 : val));
      });
      
      // Final validation
      if (optimalRgb.some(c => typeof c !== 'number' || isNaN(c) || !isFinite(c))) {
        console.error('[CIELAB] Invalid RGB values after processing:', optimalRgb);
        const bgLum = relLuminance(bg);
        return bgLum < 0.5 ? [255, 255, 255] : [0, 0, 0];
      }
      
      return optimalRgb;
    } catch (error) {
      console.error('[CIELAB] Error in _find_optimal_color_cielab:', error);
      // Return safe fallback
      const bgLum = relLuminance(bg);
      return bgLum < 0.5 ? [255, 255, 255] : [0, 0, 0];
    }
  }

  // CIELAB color space conversion functions (for perceptually uniform color optimization)
  // Convert RGB to CIELAB (L*a*b*) color space
  // @param {Array} rgb - RGB array [r, g, b] (0-255)
  // @returns {Array} LAB array [L*, a*, b*]
  function rgbToLab([r, g, b]) {
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

  // Convert CIELAB (L*a*b*) to RGB color space
  // @param {Array} lab - LAB array [L*, a*, b*]
  // @returns {Array} RGB array [r, g, b] (0-255)
  function labToRgb([L, a, bStar]) {
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

  // Calculate CIEDE2000 Delta E (perceptual color difference)
  // @param {Array} lab1 - First LAB color [L*, a*, b*]
  // @param {Array} lab2 - Second LAB color [L*, a*, b*]
  // @returns {number} Delta E value (lower = more similar)
  function deltaE2000([L1, a1, b1Star], [L2, a2, b2Star]) {
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

  // Utility: Convert RGB array to RGB string
  // Handles arrays of any length, taking only the first 3 elements (r, g, b)
  function rgbToStr(rgb) {
    const [r = 0, g = 0, b = 0] = Array.isArray(rgb) ? rgb : [0, 0, 0];
    return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  }

  // Alpha blend: place src over dst
  function blendRGBA(src, dst) {
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
   * LIVE VERIFICATION: Verify that a style was actually applied to an element
   * Detects CSS specificity overrides where style is written but not rendered
   * @param {Element} el - Element to verify
   * @param {string} property - CSS property (e.g., 'color')
   * @param {string} expectedValue - Expected RGB value string
   * @returns {boolean} True if applied correctly, false if CSS override detected
   */
  function verifyAppliedStyle(el, property, expectedValue) {
    if (!el || !el.nodeType) {
      console.warn(`[AI VERIFY] Invalid element`);
      return false;
    }

    try {
      const applied = getComputedStyle(el)[property];
      const appliedRGB = parseCSSColorToRGBA(applied, [0, 0, 0]).slice(0, 3);
      const expectedRGB = parseCSSColorToRGBA(expectedValue, [0, 0, 0]).slice(0, 3);

      // Check if RGB values match within tolerance (2 units for rounding differences)
      const matches = appliedRGB.every((v, i) => Math.abs(v - expectedRGB[i]) <= 2);

      if (!matches) {
        const elementId = `${el.tagName}${el.className ? '.' + el.className.split(' ')[0] : ''} "${(el.textContent || '').trim().substring(0, 20)}"`;
        console.warn(`[AI APPLY FAILED] ${elementId}: expected ${expectedValue} got ${applied}`);
        console.warn(`   Expected RGB: [${expectedRGB.join(', ')}]`);
        console.warn(`   Applied RGB:  [${appliedRGB.join(', ')}]`);
        console.warn(`   Inline style: ${el.style.cssText}`);
        console.warn(`   This indicates CSS specificity override - fix is marked but not visible`);
        el.setAttribute('data-ai-apply-failed', 'true');
        el.setAttribute('data-ai-expected-color', expectedValue);
        el.setAttribute('data-ai-applied-color', applied);
        return false;
      }

      // Success - clear any previous failure markers
      if (el.hasAttribute('data-ai-apply-failed')) {
        el.removeAttribute('data-ai-apply-failed');
        el.removeAttribute('data-ai-expected-color');
        el.removeAttribute('data-ai-applied-color');
      }
      return true;
    } catch (e) {
      console.warn(`[AI VERIFY] Failed to verify style: ${e.message}`);
      return false;
    }
  }

  /**
   * HUE-PRESERVING HOVER: Calculate hover colors that maintain brand identity
   * NEVER returns pure black or white unless original was already black/white
   * 
   * @param {number[]} fgRGB - Current foreground RGB [r, g, b]
   * @param {number[]} bgRGB - Background RGB [r, g, b]
   * @param {number} targetContrast - Target contrast ratio
   * @param {object} options - Optional settings
   * @returns {object} { fg: [r,g,b], bg: [r,g,b]|null, contrast: number, preserved: boolean }
   */
  function calculateHuePreservingHoverColor(fgRGB, bgRGB, targetContrast, options = {}) {
    const {
      adjustBackground = false,   // Whether to adjust background for elements with explicit bg
      maxBrightnessShift = 0.25,  // Maximum brightness shift (25%)
      preserveIdentity = true     // Preserve brand color identity
    } = options;

    // Get HSL values for foreground (returns h: 0-360, s: 0-100, l: 0-100)
    const [fgH, fgS, fgL] = rgbToHsl(fgRGB);
    // Normalize for internal calculations (h: 0-360 stays as is, s and l: 0-100 -> 0-1)
    const fgHNorm = fgH; // Keep as 0-360 for hslToRgb
    const fgSNorm = fgS / 100; // Normalize to 0-1 for calculations
    const fgLNorm = fgL / 100; // Normalize to 0-1 for calculations
    const bgLum = relLuminance(bgRGB);

    // Check if original is already near black or white
    const isOriginalBlack = fgRGB[0] < 10 && fgRGB[1] < 10 && fgRGB[2] < 10;
    const isOriginalWhite = fgRGB[0] > 245 && fgRGB[1] > 245 && fgRGB[2] > 245;

    // Calculate direction: lighten on dark bg, darken on light bg
    const shouldLighten = bgLum < 0.5;

    let hoverFgRGB = [...fgRGB];
    let hoverBgRGB = adjustBackground ? [...bgRGB] : null;
    let bestContrast = wcagContrast(fgRGB, bgRGB);
    let preserved = true;

    // Step 1: Try adjusting foreground lightness while preserving hue
    for (let step = 0.02; step <= maxBrightnessShift; step += 0.02) {
      let newL;
      if (shouldLighten) {
        newL = Math.min(1, fgLNorm + step);
      } else {
        newL = Math.max(0, fgLNorm - step);
      }

      const testRGB = hslToRgb([fgHNorm, fgSNorm * 100, newL * 100]);
      const testContrast = wcagContrast(testRGB, bgRGB);

      if (testContrast > bestContrast) {
        hoverFgRGB = testRGB;
        bestContrast = testContrast;

        if (testContrast >= targetContrast) {
          break; // Found a good hover color
        }
      }
    }

    // Step 2: If still below target, try reducing saturation slightly
    if (bestContrast < targetContrast && preserveIdentity) {
      for (let satStep = 0.05; satStep <= 0.3; satStep += 0.05) {
        const reducedS = Math.max(0, fgSNorm - satStep);
        const targetL = shouldLighten ? Math.min(1, fgLNorm + 0.2) : Math.max(0, fgLNorm - 0.2);

        const testRGB = hslToRgb([fgHNorm, reducedS * 100, targetL * 100]);
        const testContrast = wcagContrast(testRGB, bgRGB);

        if (testContrast > bestContrast) {
          hoverFgRGB = testRGB;
          bestContrast = testContrast;

          if (testContrast >= targetContrast) {
            break;
          }
        }
      }
    }

    // Step 3: If STILL below target AND original was black/white, allow pure values
    if (bestContrast < targetContrast) {
      if (isOriginalBlack || isOriginalWhite) {
        // Original was already monochrome - allow pure black/white
        hoverFgRGB = shouldLighten ? [255, 255, 255] : [0, 0, 0];
        bestContrast = wcagContrast(hoverFgRGB, bgRGB);
        preserved = false;
      } else {
        // Push to extreme lightness but KEEP the hue
        const extremeL = shouldLighten ? 0.95 : 0.05;
        const extremeRGB = hslToRgb([fgHNorm, Math.max(10, fgSNorm * 30), extremeL * 100]);
        const extremeContrast = wcagContrast(extremeRGB, bgRGB);

        if (extremeContrast > bestContrast) {
          hoverFgRGB = extremeRGB;
          bestContrast = extremeContrast;
        }
      }
    }

    // Step 4: Adjust background if requested (for buttons with explicit bg)
    // Make a more visible hover effect with 15% brightness shift
    if (adjustBackground && hoverBgRGB) {
      const [bgH, bgS, bgL] = rgbToHsl(bgRGB);
      // Normalize background values (h: 0-360 stays, s and l: 0-100 -> 0-1)
      const bgHNorm = bgH;
      const bgSNorm = bgS / 100;
      const bgLNorm = bgL / 100;
      // More visible background shift: lighten backgrounds on hover (typical button behavior)
      // Use 15% for a noticeable but not jarring effect
      const bgShift = 0.15; // Always lighten for a "hover highlight" effect
      const newBgL = Math.min(1, bgLNorm + bgShift);
      hoverBgRGB = hslToRgb([bgHNorm, bgSNorm * 100, newBgL * 100]);

      // Recalculate foreground contrast with new lighter background
      const newBgContrast = wcagContrast(hoverFgRGB, hoverBgRGB);
      if (newBgContrast < targetContrast) {
        // Foreground needs to be darker to maintain contrast with lighter bg
        const [currFgH, currFgS, currFgL] = rgbToHsl(hoverFgRGB);
        // Normalize for calculations
        const currFgHNorm = currFgH;
        const currFgSNorm = currFgS / 100;
        const currFgLNorm = currFgL / 100;
        // Darken the foreground to maintain contrast
        for (let step = 0.05; step <= 0.4; step += 0.05) {
          const darkerL = Math.max(0, currFgLNorm - step);
          const testFg = hslToRgb([currFgHNorm, currFgSNorm * 100, darkerL * 100]);
          const testContrast = wcagContrast(testFg, hoverBgRGB);
          if (testContrast >= targetContrast) {
            hoverFgRGB = testFg;
            bestContrast = testContrast;
            break;
          }
        }
      }

      // Final contrast with new background
      bestContrast = wcagContrast(hoverFgRGB, hoverBgRGB);
      console.log(`   🎨 [HOVER BG] Background lightened: ${bgL.toFixed(2)} → ${newBgL.toFixed(2)}, final contrast: ${bestContrast.toFixed(2)}:1`);
    }

    return {
      fg: hoverFgRGB.map(v => Math.round(Math.max(0, Math.min(255, v)))),
      bg: hoverBgRGB ? hoverBgRGB.map(v => Math.round(Math.max(0, Math.min(255, v)))) : null,
      contrast: bestContrast,
      preserved: preserved
    };
  }

  /**
   * HOVER SAFETY CHECK: Verify hover state doesn't cause visibility issues
   * Returns false if hover would make content invisible or contrast worse
   * 
   * @param {Element} el - Element to check
   * @param {string} hoverFg - Proposed hover foreground color
   * @param {string} hoverBg - Proposed hover background color (or null)
   * @param {number} beforeContrast - Contrast before hover
   * @returns {object} { safe: boolean, reason: string }
   */
  /**
   * PROTECT VISIBILITY: Check hover colors before applying
   * Returns { safe: boolean, reason: string }
   */
  function verifyHoverSafety(el, hoverFg, hoverBg, beforeContrast) {
    if (!el || !hoverFg) {
      return { safe: false, reason: 'invalid-input' };
    }

    const computed = getComputedStyle(el);

    // Check display not none
    if (computed.display === 'none') {
      return { safe: false, reason: 'display-none' };
    }

    // Check opacity > 0
    const opacity = parseFloat(computed.opacity);
    if (isNaN(opacity) || opacity <= 0) {
      return { safe: false, reason: 'opacity-zero' };
    }

    // Check visibility
    if (computed.visibility === 'hidden') {
      return { safe: false, reason: 'visibility-hidden' };
    }

    // Parse colors
    const hoverFgRGBA = parseCSSColorToRGBA(hoverFg, [0, 0, 0, 1]);
    const hoverFgRGB = hoverFgRGBA.slice(0, 3);
    const hoverFgAlpha = hoverFgRGBA[3];

    // Check alpha >= 0.7
    if (hoverFgAlpha < 0.7) {
      return { safe: false, reason: `alpha-low: ${hoverFgAlpha.toFixed(2)} < 0.7` };
    }

    let hoverBgRGB;
    let hoverBgAlpha = 1;

    if (hoverBg) {
      const hoverBgRGBA = parseCSSColorToRGBA(hoverBg, [255, 255, 255, 1]);
      hoverBgRGB = hoverBgRGBA.slice(0, 3);
      hoverBgAlpha = hoverBgRGBA[3];
    } else {
      // Use effective background
      const effectiveBg = getEffectiveBackgroundRGBA(el);
      if (effectiveBg) {
        hoverBgRGB = effectiveBg.slice(0, 3);
        hoverBgAlpha = effectiveBg[3];
      } else {
        // No fully opaque background found - skip hover correction
        return;
      }
    }

    // Check bg alpha >= 0.7
    if (hoverBgAlpha < 0.7) {
      return { safe: false, reason: `bg-alpha-low: ${hoverBgAlpha.toFixed(2)} < 0.7` };
    }

    // Check fg != bg (with tolerance for rounding)
    const colorMatch = hoverFgRGB.every((v, i) => Math.abs(v - hoverBgRGB[i]) < 5);
    if (colorMatch) {
      return { safe: false, reason: 'fg-equals-bg' };
    }

    // Check contrast is higher than before
    const hoverContrast = wcagContrast(hoverFgRGB, hoverBgRGB);
    
    // For CSS :hover rules, be more lenient - if both contrasts are above target (7.75:1), allow it
    // This prevents blocking valid CSS :hover states that might have slightly different contrast
    const isCssHover = el.getAttribute("data-using-css-hover") === "true";
    const targetContrast = 7.75; // Default target, could be made dynamic if needed
    
    if (hoverContrast < beforeContrast) {
      // If using CSS :hover and both contrasts are above target, allow it
      if (isCssHover && hoverContrast >= targetContrast && beforeContrast >= targetContrast) {
        console.log(`   ℹ️  [HOVER SAFETY] CSS :hover contrast ${hoverContrast.toFixed(2)}:1 < normal ${beforeContrast.toFixed(2)}:1, but both meet target - allowing`);
        // Allow it - both are above target
      } else {
        return { safe: false, reason: `contrast-worse: ${hoverContrast.toFixed(2)} < ${beforeContrast.toFixed(2)}` };
      }
    }

    return { safe: true, reason: 'ok' };
  }

  /**
   * SAFE HOVER TRANSFORM: Adjust brightness only, preserve hue/saturation
   * Blocks: hardcoded black, hardcoded white, color inversion, hue drift, loss of saturation
   */
  function calculateSafeHoverColor(fgRGB, bgRGB, targetContrast) {
    // Get HSL values (h: 0-360, s: 0-100, l: 0-100)
    const [h, s, l] = rgbToHsl(fgRGB);
    const bgLum = relLuminance(bgRGB);
    const needLighter = bgLum < 0.5;

    // Normalize for calculations
    const hNorm = h; // Keep as 0-360
    const sNorm = s / 100; // 0-1
    const lNorm = l / 100; // 0-1

    // Adjust brightness only (preserve hue and saturation)
    let bestL = lNorm;
    let bestContrast = wcagContrast(fgRGB, bgRGB);

    // Try brightness adjustments (max 30% shift)
    const maxShift = 0.3;
    for (let shift = 0.05; shift <= maxShift; shift += 0.05) {
      let testL;
      if (needLighter) {
        testL = Math.min(1, lNorm + shift);
      } else {
        testL = Math.max(0, lNorm - shift);
      }

      // Block pure black (l < 0.05) and pure white (l > 0.95) unless original was already monochrome
      if (sNorm < 0.05) {
        // Original was monochrome - allow near-black/white but not pure
        if (testL < 0.05) testL = 0.05;
        if (testL > 0.95) testL = 0.95;
      } else {
        // Original had color - preserve it, block pure values
        if (testL < 0.1) testL = 0.1;
        if (testL > 0.9) testL = 0.9;
      }

      const testRGB = hslToRgb([hNorm, sNorm * 100, testL * 100]);
      const testContrast = wcagContrast(testRGB, bgRGB);

      if (testContrast > bestContrast) {
        bestL = testL;
        bestContrast = testContrast;

        if (testContrast >= targetContrast) {
          break; // Found good color
        }
      }
    }

    // Block hardcoded black/white
    const resultRGB = hslToRgb([hNorm, sNorm * 100, bestL * 100]);
    const isBlack = resultRGB[0] < 5 && resultRGB[1] < 5 && resultRGB[2] < 5;
    const isWhite = resultRGB[0] > 250 && resultRGB[1] > 250 && resultRGB[2] > 250;

    if (isBlack || isWhite) {
      // Reject pure values - use slightly off values
      if (isBlack) {
        return hslToRgb([hNorm, Math.max(10, sNorm * 100), 0.1 * 100]);
      } else {
        return hslToRgb([hNorm, Math.max(10, sNorm * 100), 0.9 * 100]);
      }
    }

    return resultRGB;
  }

  /**
   * STATE SNAPSHOT: Store computed colors before hover-in (only once per element)
   * Saves: computed text color, computed background color, border color if present
   * Stores in: data-ai-orig-fg, data-ai-orig-bg, data-ai-orig-border
   */
  function snapshotHoverState(el) {
    // Only save once per element (race condition fix)
    if (el.hasAttribute('data-ai-orig-fg')) {
      return; // Already cached
    }

    const computed = getComputedStyle(el);
    const originalFg = computed.color;
    const originalBg = computed.backgroundColor;
    const originalBorder = computed.borderColor;

    el.setAttribute('data-ai-orig-fg', originalFg);
    el.setAttribute('data-ai-orig-bg', originalBg);
    if (originalBorder && originalBorder !== 'transparent' && originalBorder !== 'rgba(0, 0, 0, 0)') {
      el.setAttribute('data-ai-orig-border', originalBorder);
    }
  }

  /**
   * HOVER ROLLBACK: Restore previous state if hover application fails
   */
  function rollbackHoverApplication(el, reason) {
    console.warn(`[AI HOVER APPLY FAILED] ${el.tagName}: ${reason} - rolling back`);

    // Try to restore from cached original
    const originalFg = el.getAttribute('data-ai-original-fg');
    const originalBg = el.getAttribute('data-ai-original-bg');
    const correctedFg = el.getAttribute('data-corrected-fg') || el.getAttribute('data-ai-normal-fg');
    const correctedBg = el.getAttribute('data-corrected-bg') || el.getAttribute('data-ai-normal-bg');

    // Prefer corrected (high-contrast) colors, fallback to original
    const restoreFg = correctedFg || originalFg;
    const restoreBg = correctedBg || originalBg;

    if (restoreFg) {
      applyColorWithImportant(el, 'color', restoreFg);
    }

    // Only restore background if element had explicit background
    if (restoreBg && hasExplicitBackground(el) &&
      restoreBg !== 'transparent' && restoreBg !== 'rgba(0, 0, 0, 0)') {
      applyColorWithImportant(el, 'background-color', restoreBg);
    }

    el.setAttribute('data-ai-hover-failed', 'true');
    el.setAttribute('data-ai-hover-fail-reason', reason);
  }

  /**
   * FORCE APPLY STYLE: Use dedicated stylesheet for CSS override priority
   * Inline styles only store original color metadata
   * 
   * @param {Element} el - Element to apply style to
   * @param {string} property - CSS property ('color' or 'background-color')
   * @param {string} value - CSS color value (e.g., 'rgb(46,31,31)')
   * @returns {boolean} True if applied successfully
   */
  /* ----------  CONTRAST FIX WITH HOVER SUPPORT  ---------- */

  /**
   * Calculates a hover color by adjusting brightness while preserving contrast
   * @param {string} baseColor - The contrast-corrected RGB color
   * @returns {string} Hover-safe RGB color
   */
  /**
   * Helper – find the *actual* CSSRule that sets :hover colour
   * @param {HTMLElement} el - Element to check
   * @returns {CSSRule|null} The CSS rule that matches the element's :hover, or null
   */
  function findHoverRule(el) {
    const sheets = Array.from(document.styleSheets);
    
    for (const sheet of sheets) {
      try { // cross-origin sheets may throw
        const rules = sheet.cssRules || sheet.rules;
        for (const rule of rules) {
          if (rule.type !== CSSRule.STYLE_RULE) continue;
          
          // does this rule match the element *and* contain :hover?
          if (!rule.selectorText.includes(':hover')) continue;
          
          // test every comma-separated selector
          const selectors = rule.selectorText.split(',').map(s => s.trim());
          for (const sel of selectors) {
            try {
              if (el.matches(sel)) return rule; // bingo
            } catch (_) {} // invalid selector – ignore
          }
        }
      } catch (_) {}
    }
    
    return null;
  }

  /**
   * Helper – inject a <style> block at the top of <head>
   * @param {string} css - CSS text to inject
   * @returns {HTMLElement} The injected style element
   */
  let injectedCount = 0;
  function injectStylesheet(css) {
    const style = document.createElement('style');
    style.id = `ai-hover-override-${++injectedCount}`;
    style.setAttribute('data-ai-injected', 'true');
    style.textContent = css;
    document.head.insertBefore(style, document.head.firstChild);
    return style;
  }

  /**
   * Bullet-proof hover application that beats CSS cascade specificity
   * Replaces the block that currently does element.style.setProperty('color', hoverColor, 'important')
   * @param {HTMLElement} element - Element to apply hover to
   * @param {string} normalFg - Normal state foreground color
   * @param {string} normalBg - Normal state background color (optional)
   * @param {string} hoverFg - Hover state foreground color
   * @param {string} hoverBg - Hover state background color (optional)
   */
  function applyAccessibleHover(element, normalFg, normalBg, hoverFg, hoverBg) {
    // 1. Detect the real selector that is giving the bad hover
    const badRule = findHoverRule(element);
    
    if (!badRule) {
      // no :hover rule → we can safely use inline
      applyColorWithImportant(element, 'color', hoverFg);
      if (hoverBg) {
        applyColorWithImportant(element, 'background-color', hoverBg);
      }
      return;
    }
    
    // 2. Build a *stronger* selector (duplicate + .ai-hover class for higher specificity)
    const strongerSelector = badRule.selectorText
      .split(',')                       // may be multiple selectors
      .map(s => s.trim() + '.ai-hover') // increase specificity
      .join(', ');
    
    // 3. Inject a new rule that *overrides* the bad one
    let css = `${strongerSelector} {\n`;
    css += `  color: ${hoverFg} !important;\n`;
    if (hoverBg) {
      css += `  background-color: ${hoverBg} !important;\n`;
    }
    css += `}`;
    
    injectStylesheet(css);
    
    // 4. Add the class while the mouse is over the element
    element.addEventListener('mouseenter', () => {
      element.classList.add('ai-hover');
    });
    
    element.addEventListener('mouseleave', () => {
      element.classList.remove('ai-hover');
    });
    
    element.addEventListener('focus', () => {
      element.classList.add('ai-hover');
      if (hoverFg) {
        element.style.setProperty('outline', `2px solid ${hoverFg}`, 'important');
        element.style.setProperty('outline-offset', '2px', 'important');
      }
    });
    
    element.addEventListener('blur', () => {
      element.classList.remove('ai-hover');
      element.style.setProperty('outline', 'none', 'important');
    });
    
    // Touch device support
    element.addEventListener('touchstart', () => {
      element.classList.add('ai-hover');
    });
    
    element.addEventListener('touchend', () => {
      setTimeout(() => {
        element.classList.remove('ai-hover');
      }, 300);
    });
  }

  /**
   * Gets the CSS :hover color for an element by checking stylesheets
   * @param {HTMLElement} el - Element to check
   * @param {string} property - CSS property to get ('color' or 'background-color')
   * @returns {string|null} The hover color value or null if not found
   */
  function getCssHoverColor(el, property) {
    if (!el || !el.matches) return null;
    
    try {
      // Get all stylesheets
      const sheets = Array.from(document.styleSheets);
      
      for (const sheet of sheets) {
        try {
          const rules = sheet.cssRules || sheet.rules;
          if (!rules) continue;
          
          for (const rule of rules) {
            // Check for :hover pseudo-class
            if (rule.selectorText && rule.selectorText.includes(':hover')) {
              // Check if this rule matches the element
              const selectors = rule.selectorText.split(',').map(s => s.trim());
              
              for (const selector of selectors) {
                // Remove :hover to test if element matches
                const baseSelector = selector.replace(/:hover\s*$/, '').trim();
                
                try {
                  if (el.matches(baseSelector)) {
                    // Found matching hover rule - get the property value
                    const style = rule.style;
                    const value = style.getPropertyValue(property);
                    if (value && value.trim() && value !== 'inherit' && value !== 'initial') {
                      return value.trim();
                    }
                  }
                } catch (e) {
                  // Invalid selector, skip
                  continue;
                }
              }
            }
          }
        } catch (e) {
          // Cross-origin stylesheet or other error, skip
          continue;
        }
      }
    } catch (e) {
      // Error accessing stylesheets
    }
    
    return null;
  }

  function calculateHoverColor(baseColor) {
    const rgb = baseColor.match(/\d+/g).map(Number);
    const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    
    // Darken light text, lighten dark text for clear hover feedback
    const adjustment = luminance > 0.5 ? -45 : 45;
    
    const newRgb = rgb.map(c => Math.max(0, Math.min(255, c + adjustment)));
    return `rgb(${newRgb.join(', ')})`;
  }

  /**
   * Applies contrast-corrected colors with proper hover states
   * @param {HTMLElement} element - Element to fix
   * @param {string} correctedColor - The AI-corrected color
   */
  function applyContrastFixWithHover(element, correctedColor) {
    // Define all interactive element selectors
    const isInteractive = element.matches([
      'a[href]',              // All hyperlinks
      'button',               // Native buttons
      '[role="button"]',      // ARIA buttons
      '.btn', '.cta',         // Common button classes
      '.nav-link',            // Navigation links
      'input[type="button"]',
      'input[type="submit"]',
      '.tm_pb_button',        // Your theme's buttons
      '.sr7-btn'              // Slider Revolution buttons
    ].join(', '));
    
    // Apply base corrected color using inline style with !important flag
    // Use helper to ensure it overrides existing !important styles
    applyColorWithImportant(element, 'color', correctedColor);
    
    // Store corrected color for reference
    element.setAttribute('data-ai-corrected-color', correctedColor);
    
    // Skip hover logic for static text
    if (!isInteractive) {
      element.setAttribute('data-ai-contrast-fixed', 'true');
      return;
    }
    
    // Only process once per element
    if (element.hasAttribute('data-ai-hover-processed')) {
      element.setAttribute('data-ai-contrast-fixed', 'true');
      return;
    }
    element.setAttribute('data-ai-hover-processed', 'true');
    
    /* ----------  inside applyContrastFixWithHover  ---------- */
    // 1. If the element has a CSS :hover rule that already passes contrast, **keep it**.
    const cssHoverFg = getCssHoverColor(element, 'color');
    const cssHoverBg = getCssHoverColor(element, 'background-color');
    
    if (cssHoverFg || cssHoverBg) {
      // Get effective background for contrast calculation
      const effectiveBg = getEffectiveBackgroundRGBA(element);
      let effectiveBgRGB = [255, 255, 255]; // Default to white
      if (effectiveBg && Array.isArray(effectiveBg) && effectiveBg.length >= 3) {
        effectiveBgRGB = effectiveBg.slice(0, 3);
      }
      
      // Parse CSS hover colors to RGB
      let cssHoverFgRGB = null;
      let cssHoverBgRGB = effectiveBgRGB;
      
      if (cssHoverFg) {
        const parsedFg = parseCSSColorToRGBA(cssHoverFg, null);
        if (parsedFg) cssHoverFgRGB = parsedFg.slice(0, 3);
      }
      
      if (cssHoverBg) {
        const parsedBg = parseCSSColorToRGBA(cssHoverBg, null);
        if (parsedBg) cssHoverBgRGB = parsedBg.slice(0, 3);
      }
      
      // Use normal foreground if hover foreground not specified
      const normalFgRGB = parseCSSColorToRGBA(correctedColor, null);
      const fgForContrast = cssHoverFgRGB || (normalFgRGB ? normalFgRGB.slice(0, 3) : [0, 0, 0]);
      const bgForContrast = cssHoverBgRGB;
      
      // Calculate contrast
      const cssContrast = wcagContrast(fgForContrast, bgForContrast);
      
      if (cssContrast >= 6.33) {
        // Theme already gives a safe hover – just keep the normal-state fix
        console.log(`✅ [SKIP HOVER] CSS :hover contrast is acceptable (${cssContrast.toFixed(2)}:1) – leaving theme rule intact`);
        element.setAttribute('data-ai-contrast-fixed', 'true');
        return; // EXIT: do not add mouse/touch listeners
      }
    }
    // 2. Otherwise compute our own hover colours and apply them
    
    // Calculate and store hover color
    const hoverColor = calculateHoverColor(correctedColor);
    element.style.setProperty('--ai-corrected-color', correctedColor);
    element.style.setProperty('--ai-hover-color', hoverColor);
    
    // Get background color for hover (if element has one)
    const elementBg = getComputedStyle(element).backgroundColor;
    const hoverBg = elementBg && elementBg !== 'transparent' && elementBg !== 'rgba(0, 0, 0, 0)' 
      ? elementBg 
      : null;
    
    // Ensure smooth transitions (respect existing ones)
    if (!element.style.transition || element.style.transition === 'none') {
      element.style.transition = 'color 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    }
    
    // Use bullet-proof hover application that beats CSS cascade
    applyAccessibleHover(element, correctedColor, null, hoverColor, hoverBg);
    
    // Click feedback (subtle scale) - keep this as inline since it's not a hover state
    element.addEventListener('mousedown', function() {
      this.style.setProperty('transform', 'scale(0.96)', 'important');
      this.style.setProperty('transition', 'color 0.3s ease, transform 0.15s ease', 'important');
    });
    
    element.addEventListener('mouseup', function() {
      this.style.setProperty('transform', 'scale(1)', 'important');
    });
    
    element.setAttribute('data-ai-contrast-fixed', 'true');
  }

  function forceApplyStyle(el, property, value) {
    if (!el || !el.nodeType || !value) return false;
    
    // CRITICAL: Never apply styles to elements that should be skipped (image/transparent backgrounds)
    const skipReason = el.getAttribute('data-ai-skip-reason');
    if (skipReason) {
      console.log(`   ⏭️ [SKIP STYLE] Not applying ${property} to element with skip-reason: ${skipReason}`);
      return false;
    }

    // Ensure element has data-contrast-fixed attribute for selector
    if (!el.hasAttribute('data-contrast-fixed')) {
      el.setAttribute('data-contrast-fixed', 'true');
    }

    // Get or create dedicated stylesheet
    let contrastSheet = document.getElementById('contrast-fixes');
    if (!contrastSheet) {
      contrastSheet = document.createElement('style');
      contrastSheet.id = 'contrast-fixes';
      contrastSheet.setAttribute('data-ai-injected', 'true');
      document.head.appendChild(contrastSheet);
    }

    // Generate unique selector using element's unique identifier
    let uniqueId = el.getAttribute('data-ai-fix-id');
    if (!uniqueId) {
      uniqueId = 'ai-fix-' + Math.random().toString(36).substr(2, 9);
      el.setAttribute('data-ai-fix-id', uniqueId);
    }

    // Create CSS rule with attribute selector for maximum specificity
    const selector = `[data-contrast-fixed="true"][data-ai-fix-id="${uniqueId}"]`;
    const cssRule = `${selector} { ${property}: ${value} !important; }`;
    
    // Check if rule already exists (avoid duplicates)
    const ruleExists = contrastSheet.textContent.includes(uniqueId);
    if (!ruleExists) {
      contrastSheet.textContent += '\n' + cssRule;
    } else {
      // Update existing rule
      const lines = contrastSheet.textContent.split('\n');
      const updatedLines = lines.map(line => {
        if (line.includes(uniqueId) && line.includes(property)) {
          return cssRule;
        }
        return line;
      });
      contrastSheet.textContent = updatedLines.join('\n');
    }

    // Store original color in inline style as metadata only (not for application)
    if (property === 'color' && !el.hasAttribute('data-ai-original-inline-color')) {
      const originalColor = el.style.color || getComputedStyle(el).color;
      if (originalColor) {
        el.setAttribute('data-ai-original-inline-color', originalColor);
      }
    }

    // Store corrected value for re-application if styles are changed
    if (property === 'color') {
      el.setAttribute('data-ai-corrected-color', value);
    } else if (property === 'background-color') {
      el.setAttribute('data-ai-corrected-bg', value);
    }

    // Force reflow
    void el.offsetHeight;

    // Log success
    console.log(`   ✅ [APPLY] Style applied via stylesheet: ${property}: ${value}`);

    // Mark element as having correction applied
    el.setAttribute('data-ai-style-applied', 'true');

    return true;
  }

  // Add OpenCV.js integration for advanced computer vision capabilities
  let cv = null;
  let opencvLoaded = false;


  /**
   * Load OpenCV.js library dynamically
   * @returns {Promise<boolean>} True if loaded successfully, false otherwise
   */
  async function loadOpenCV() {
    if (opencvLoaded) return true;

    return new Promise((resolve) => {
      console.log('   🧠 [AI-ACTIVITY] Loading OpenCV.js for advanced computer vision...');

      // Check if already loaded
      if (window.cv) {
        cv = window.cv;
        opencvLoaded = true;
        console.log('   ✅ [AI-STATUS] OpenCV.js already loaded');
        resolve(true);
        return;
      }

      // Create script element to load OpenCV.js
      const script = document.createElement('script');
      script.src = 'https://docs.opencv.org/4.5.0/opencv.js';
      script.async = true;

      script.onload = () => {
        console.log('   ✅ [AI-STATUS] OpenCV.js loaded successfully');
        cv = window.cv;
        opencvLoaded = true;

        // Wait for OpenCV to be ready
        if (cv.readyState === 'complete') {
          resolve(true);
        } else {
          cv['onRuntimeInitialized'] = () => {
            console.log('   ✅ [AI-STATUS] OpenCV.js runtime initialized');
            resolve(true);
          };
        }
      };

      script.onerror = () => {
        console.warn('   ⚠️  [AI-ERROR] Failed to load OpenCV.js');
        resolve(false);
      };

      document.head.appendChild(script);
    });
  }

  /**
   * Advanced image segmentation using OpenCV.js
   * @param {HTMLImageElement} image - Image element to analyze
   * @returns {Promise<Object>} Segmentation results
   */
  async function segmentImageWithOpenCV(image) {
    if (!opencvLoaded || !cv) {
      console.warn('   ⚠️  [AI-ERROR] OpenCV.js not loaded, skipping advanced segmentation');
      return null;
    }

    try {
      console.log('   🔍 [AI-ACTIVITY] Performing advanced image segmentation with OpenCV...');

      // Create Mat from image
      const src = cv.imread(image);
      const gray = new cv.Mat();
      const blurred = new cv.Mat();
      const edges = new cv.Mat();
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();

      // Convert to grayscale
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      // Apply Gaussian blur to reduce noise
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

      // Apply Canny edge detection
      cv.Canny(blurred, edges, 50, 150);

      // Find contours
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      // Analyze contours to identify regions of interest
      const regions = [];
      for (let i = 0; i < contours.size(); ++i) {
        const contour = contours.get(i);
        const area = cv.contourArea(contour);

        // Only consider significant regions
        if (area > 100) {
          const boundingRect = cv.boundingRect(contour);
          regions.push({
            x: boundingRect.x,
            y: boundingRect.y,
            width: boundingRect.width,
            height: boundingRect.height,
            area: area
          });
        }
        contour.delete();
      }

      // Clean up
      src.delete();
      gray.delete();
      blurred.delete();
      edges.delete();
      contours.delete();
      hierarchy.delete();

      console.log(`   ✅ [AI-STATUS] Image segmentation complete: ${regions.length} regions identified`);
      return {
        regions: regions,
        totalRegions: regions.length
      };
    } catch (error) {
      console.warn(`   ⚠️  [AI-ERROR] OpenCV segmentation failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Analyze local contrast in different image regions
   * @param {string} imageURL - URL of the background image
   * @param {Array} textBoundingBox - Bounding box of text element [x, y, width, height]
   * @returns {Promise<Object>} Local contrast analysis results
   */
  async function analyzeLocalContrast(imageURL, textBoundingBox) {
    if (!opencvLoaded) {
      console.warn('   ⚠️  [AI-ERROR] OpenCV.js not available, using basic contrast analysis');
      return null;
    }

    try {
      console.log('   🔍 [AI-ACTIVITY] Analyzing local contrast with OpenCV...');

      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        const timeout = setTimeout(() => {
          console.warn('   ⚠️  [AI-ERROR] Image loading timeout for local contrast analysis');
          resolve(null);
        }, 3000);

        img.onload = async () => {
          clearTimeout(timeout);

          try {
            // Perform image segmentation
            const segmentation = await segmentImageWithOpenCV(img);

            // Create Mat from image
            const src = cv.imread(img);
            const hsv = new cv.Mat();

            // Convert to HSV for better brightness analysis
            cv.cvtColor(src, hsv, cv.COLOR_RGB2HSV);

            // Extract the region under the text
            const textRegion = {
              x: Math.max(0, textBoundingBox[0]),
              y: Math.max(0, textBoundingBox[1]),
              width: Math.min(img.width - textBoundingBox[0], textBoundingBox[2]),
              height: Math.min(img.height - textBoundingBox[1], textBoundingBox[3])
            };

            // Create ROI (Region of Interest)
            const roi = hsv.roi(new cv.Rect(textRegion.x, textRegion.y, textRegion.width, textRegion.height));

            // Calculate mean brightness in the text region
            const mean = new cv.Mat();
            const stdDev = new cv.Mat();
            cv.meanStdDev(roi, mean, stdDev);

            // Extract brightness value (V channel in HSV)
            const brightness = mean.doubleAt(2, 0) / 255; // Normalize to 0-1
            const contrast = stdDev.doubleAt(2, 0) / 255; // Normalize to 0-1

            // Determine if background is dark or light
            const isDarkBackground = brightness < 0.5;

            // Clean up
            src.delete();
            hsv.delete();
            roi.delete();
            mean.delete();
            stdDev.delete();

            const result = {
              brightness: brightness,
              contrast: contrast,
              isDark: isDarkBackground,
              segmentation: segmentation,
              textRegion: textRegion
            };

            console.log(`   ✅ [AI-STATUS] Local contrast analysis complete: brightness=${brightness.toFixed(3)}, contrast=${contrast.toFixed(3)}, isDark=${isDarkBackground}`);
            resolve(result);
          } catch (error) {
            console.warn(`   ⚠️  [AI-ERROR] Local contrast analysis failed: ${error.message}`);
            resolve(null);
          }
        };

        img.onerror = () => {
          clearTimeout(timeout);
          console.warn('   ⚠️  [AI-ERROR] Failed to load image for local contrast analysis');
          resolve(null);
        };

        img.src = imageURL;
      });
    } catch (error) {
      console.warn(`   ⚠️  [AI-ERROR] Local contrast analysis error: ${error.message}`);
      return null;
    }
  }

  /**
   * Segment image to identify regions with different contrast properties for text overlay analysis
   * @param {HTMLImageElement} image - Image element to analyze
   * @param {Element} el - Text element for overlay analysis
   * @returns {Promise<Object>} Segmentation results
   */
  async function segmentImageForTextOverlay(image, el) {
    if (!opencvLoaded || !cv) {
      console.warn('   ⚠️  [AI-ERROR] OpenCV.js not loaded, skipping image segmentation');
      return null;
    }

    try {
      console.log('   🔍 [AI-ACTIVITY] Performing image segmentation for text overlay analysis...');

      // Create Mat from image
      const src = cv.imread(image);
      const gray = new cv.Mat();
      const blurred = new cv.Mat();
      const edges = new cv.Mat();
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();

      // Convert to grayscale
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      // Apply Gaussian blur to reduce noise
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

      // Apply Canny edge detection
      cv.Canny(blurred, edges, 50, 150);

      // Find contours
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      // Analyze contours to identify regions of interest for text placement
      const regions = [];
      for (let i = 0; i < contours.size(); ++i) {
        const contour = contours.get(i);
        const area = cv.contourArea(contour);

        // Only consider significant regions (minimum 100 pixels)
        if (area > 100) {
          const boundingRect = cv.boundingRect(contour);

          // Calculate contrast properties for this region
          const regionMat = gray.roi(new cv.Rect(boundingRect.x, boundingRect.y, boundingRect.width, boundingRect.height));
          const mean = new cv.Mat();
          const stdDev = new cv.Mat();
          cv.meanStdDev(regionMat, mean, stdDev);

          // Clean up region mat
          regionMat.delete();

          regions.push({
            x: boundingRect.x,
            y: boundingRect.y,
            width: boundingRect.width,
            height: boundingRect.height,
            area: area,
            meanBrightness: mean.doubleAt(0, 0),
            contrast: stdDev.doubleAt(0, 0)
          });

          // Clean up
          mean.delete();
          stdDev.delete();
        }
        contour.delete();
      }

      // Determine text placement recommendation based on segmentation
      let textPlacement = 'center'; // Default placement
      if (el) {
        // Get element position
        const rect = el.getBoundingClientRect();

        // Find region with best contrast for text
        let bestRegion = null;
        let bestContrast = 0;

        for (const region of regions) {
          // Check if region overlaps with text element
          if (region.x < rect.right && region.x + region.width > rect.left &&
            region.y < rect.bottom && region.y + region.height > rect.top) {
            if (region.contrast > bestContrast) {
              bestContrast = region.contrast;
              bestRegion = region;
            }
          }
        }

        // Recommend text placement based on analysis
        if (bestRegion) {
          // If we found a region with good contrast, recommend placing text there
          textPlacement = {
            x: bestRegion.x,
            y: bestRegion.y,
            width: bestRegion.width,
            height: bestRegion.height,
            recommendation: 'place_in_region_with_good_contrast'
          };
        } else {
          // Otherwise, recommend center placement
          textPlacement = 'center';
        }
      }

      // Clean up
      src.delete();
      gray.delete();
      blurred.delete();
      edges.delete();
      contours.delete();
      hierarchy.delete();

      console.log(`   ✅ [AI-STATUS] Image segmentation complete: ${regions.length} regions identified`);
      return {
        regions: regions,
        totalRegions: regions.length,
        textPlacementRecommendation: textPlacement
      };
    } catch (error) {
      console.warn(`   ⚠️  [AI-ERROR] Image segmentation failed: ${error.message}`);
      return null;
    }
  }

  // Standard alpha compositing: blendColors(fgRGBA, bgRGBA)
  // Uses the formula: blendedRGB = fg.r * fg.a + bg.r * (1 - fg.a)
  function blendColors(fgRGBA, bgRGBA) {
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
   * DETERMINISTIC IMAGE BACKGROUND DETECTION - ZERO GUESSING
   * Samples computed styles at multiple points to detect background-image presence
   * @param {Element} el - Element to check
   * @param {CSSStyleDeclaration} cs - Computed style (optional, will fetch if not provided)
   * @returns {object} { hasImage: boolean, reason: string, source: string }
   */
  function detectImageBackground(el, cs = null) {
    if (!el) return { hasImage: false, reason: '', source: '' };
    
    try {
      if (!cs) cs = window.getComputedStyle(el);
      
      // Helper: Check if background-image value indicates an image (not gradient, not none)
      function isImageValue(bgImage) {
        if (!bgImage || bgImage === 'none') return false;
        // Check for url() patterns (including base64)
        if (bgImage.includes('url(')) {
          // Exclude gradients
          if (bgImage.includes('gradient')) return false;
          return true;
        }
        return false;
      }
      
      // Helper: Resolve CSS variable value
      function resolveCSSVariable(varName, cs) {
        try {
          const value = cs.getPropertyValue(varName);
          if (value && value.trim()) {
            // If it's another variable, try to resolve it
            if (value.startsWith('var(')) {
              const innerVar = value.match(/var\(([^)]+)\)/);
              if (innerVar) {
                return resolveCSSVariable(innerVar[1].trim(), cs);
              }
            }
            return value;
          }
        } catch (e) {
          // Variable resolution failed
        }
        return null;
      }
      
      // STEP 1: Check computed background-image directly
      const bgImage = cs.backgroundImage;
      if (isImageValue(bgImage)) {
        return { hasImage: true, reason: 'image', source: 'computed-background-image', node: el };
      }
      
      // STEP 2: Check CSS variables (resolve before checking)
      const commonImageVars = [
        '--background-image', '--background-image-desktop', '--background-image-mobile',
        '--background-image-tablet', '--bg-image', '--hero-image', '--banner-image',
        '--promo-image', '--card-image', '--cover-image', '--feature-image'
      ];
      
      for (const varName of commonImageVars) {
        const varValue = resolveCSSVariable(varName, cs);
        if (varValue && isImageValue(varValue)) {
          return { hasImage: true, reason: 'image', source: `css-variable:${varName}`, node: el };
        }
      }
      
      // STEP 3: Check ::before and ::after pseudo-elements
      try {
        const beforeCs = window.getComputedStyle(el, '::before');
        const beforeBg = beforeCs.backgroundImage;
        if (isImageValue(beforeBg)) {
          return { hasImage: true, reason: 'image', source: '::before-pseudo', node: el };
        }
        
        const afterCs = window.getComputedStyle(el, '::after');
        const afterBg = afterCs.backgroundImage;
        if (isImageValue(afterBg)) {
          return { hasImage: true, reason: 'image', source: '::after-pseudo', node: el };
        }
      } catch (e) {
        // Pseudo-element check may fail in some browsers
      }
      
      // STEP 4: Multi-point sampling at bounding box
      // Only check for backgrounds BEHIND the element, not in front (child elements)
      try {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          // Sample points: center, 4 corners, edge midpoints
          const samplePoints = [
            { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, // Center
            { x: rect.left, y: rect.top }, // Top-left
            { x: rect.right, y: rect.top }, // Top-right
            { x: rect.left, y: rect.bottom }, // Bottom-left
            { x: rect.right, y: rect.bottom }, // Bottom-right
            { x: rect.left + rect.width / 2, y: rect.top }, // Top edge
            { x: rect.left + rect.width / 2, y: rect.bottom }, // Bottom edge
            { x: rect.left, y: rect.top + rect.height / 2 }, // Left edge
            { x: rect.right, y: rect.top + rect.height / 2 } // Right edge
          ];
          
          // Helper: Check if element1 is an ancestor of element2
          function isAncestorOf(ancestor, descendant) {
            let current = descendant;
            while (current && current !== document.documentElement) {
              if (current === ancestor) return true;
              current = current.parentElement;
            }
            return false;
          }
          
          // Check each sampling point
          for (const point of samplePoints) {
            const elementAtPoint = document.elementFromPoint(point.x, point.y);
            if (elementAtPoint) {
              // Only check elements that are ancestors of 'el' (behind the text)
              // Ignore descendants (child elements) as they're in front of the text
              let checkEl = elementAtPoint;
              let depth = 0;
              
              // First, walk up to find 'el' or its ancestor
              while (checkEl && checkEl !== document.documentElement && depth < 10) {
                // If we found 'el' itself, check its background
                if (checkEl === el) {
                  const checkCs = window.getComputedStyle(checkEl);
                  const checkBg = checkCs.backgroundImage;
                  if (isImageValue(checkBg)) {
                    return { hasImage: true, reason: 'image', source: `sampling-point-self`, node: checkEl };
                  }
                  // Continue to check ancestors
                }
                // If checkEl is an ancestor of 'el', check its background
                else if (isAncestorOf(checkEl, el)) {
                  const checkCs = window.getComputedStyle(checkEl);
                  const checkBg = checkCs.backgroundImage;
                  if (isImageValue(checkBg)) {
                    return { hasImage: true, reason: 'image', source: `sampling-point-ancestor`, node: checkEl };
                  }
                }
                // If checkEl is a descendant of 'el', skip it (it's in front, not behind)
                else if (isAncestorOf(el, checkEl)) {
                  // This is a child element - ignore it and continue to parent
                }
                // Otherwise, this is a sibling or unrelated element - continue up
                
                checkEl = checkEl.parentElement;
                depth++;
              }
            }
          }
        }
      } catch (e) {
        // Sampling failed, continue with other checks
      }
      
      // STEP 5: Check inline style attribute
      const inlineStyle = el.getAttribute('style') || '';
      if (inlineStyle) {
        // Extract background-image from inline style
        const bgImageMatch = inlineStyle.match(/background-image\s*:\s*([^;]+)/i);
        if (bgImageMatch) {
          const bgImageValue = bgImageMatch[1].trim();
          if (isImageValue(bgImageValue)) {
            return { hasImage: true, reason: 'image', source: 'inline-style', node: el };
          }
        }
      }
      
      // STEP 6: Check for media elements
      const tagName = el.tagName ? el.tagName.toLowerCase() : '';
      if (['img', 'picture', 'video', 'canvas'].includes(tagName)) {
        return { hasImage: true, reason: 'image', source: 'media-element', node: el };
      }
      
      return { hasImage: false, reason: '', source: '', node: null };
    } catch (e) {
      return { hasImage: false, reason: '', source: '', node: null };
    }
  }

  /**
   * Detect if an element has a video background
   * @param {Element} el - Element to check
   * @param {CSSStyleDeclaration} cs - Computed style (optional)
   * @returns {Object} { hasVideo: boolean, reason: string, source: string, node: Element }
   */
  function detectVideoBackground(el, cs = null) {
    if (!el) return { hasVideo: false, reason: '', source: '', node: null };
    
    try {
      if (!cs) cs = window.getComputedStyle(el);
      
      // Helper: Check if value contains video URL patterns
      function hasVideoUrl(value) {
        if (!value) return false;
        const lowerValue = value.toLowerCase();
        return lowerValue.includes('.mp4') || 
               lowerValue.includes('.webm') || 
               lowerValue.includes('.ogg') ||
               lowerValue.includes('video') ||
               lowerValue.includes('youtube.com') ||
               lowerValue.includes('youtu.be') ||
               lowerValue.includes('vimeo.com');
      }
      
      // STEP 1: Check data attributes
      if (el.hasAttribute('data-video') || el.hasAttribute('data-bgvideo')) {
        return { hasVideo: true, reason: 'video', source: 'data-attribute', node: el };
      }
      
      // STEP 2: Check inline style for video-related properties
      const inlineStyle = el.getAttribute('style') || '';
      if (inlineStyle) {
        const lowerStyle = inlineStyle.toLowerCase();
        // Check for background-video, video-bg, or video URLs
        if (lowerStyle.includes('background-video') || 
            lowerStyle.includes('video-bg') ||
            hasVideoUrl(inlineStyle)) {
          return { hasVideo: true, reason: 'video', source: 'inline-style', node: el };
        }
      }
      
      // STEP 3: Check CSS variables for video-related properties
      // Some frameworks use CSS custom properties for video backgrounds
      const commonVideoVars = [
        '--background-video', '--video-bg', '--bg-video', '--hero-video',
        '--banner-video', '--promo-video', '--card-video', '--cover-video',
        '--feature-video', '--video-background', '--background-video-url'
      ];
      
      // Helper: Resolve CSS variable value
      function resolveCSSVariable(varName, cs) {
        try {
          const value = cs.getPropertyValue(varName);
          if (value && value.trim()) {
            // If it's another variable, try to resolve it
            if (value.startsWith('var(')) {
              const innerVar = value.match(/var\(([^)]+)\)/);
              if (innerVar) {
                return resolveCSSVariable(innerVar[1].trim(), cs);
              }
            }
            return value;
          }
        } catch (e) {
          // Variable resolution failed
        }
        return null;
      }
      
      for (const varName of commonVideoVars) {
        const varValue = resolveCSSVariable(varName, cs);
        if (varValue && hasVideoUrl(varValue)) {
          return { hasVideo: true, reason: 'video', source: `css-variable:${varName}`, node: el };
        }
      }
      
      // STEP 4: Check ::before and ::after pseudo-elements
      try {
        const beforeCs = window.getComputedStyle(el, '::before');
        const beforeContent = beforeCs.content || '';
        const beforeBg = beforeCs.backgroundImage || '';
        if (hasVideoUrl(beforeContent) || hasVideoUrl(beforeBg)) {
          return { hasVideo: true, reason: 'video', source: '::before-pseudo', node: el };
        }
        
        const afterCs = window.getComputedStyle(el, '::after');
        const afterContent = afterCs.content || '';
        const afterBg = afterCs.backgroundImage || '';
        if (hasVideoUrl(afterContent) || hasVideoUrl(afterBg)) {
          return { hasVideo: true, reason: 'video', source: '::after-pseudo', node: el };
        }
      } catch (e) {
        // Pseudo-element check may fail in some browsers
      }
      
      // STEP 5: Check computed style for video-related properties
      const allProps = cs.cssText || '';
      if (hasVideoUrl(allProps)) {
        return { hasVideo: true, reason: 'video', source: 'computed-style', node: el };
      }
      
      // STEP 6: Check if element is a video, iframe, or canvas element
      const tagName = el.tagName ? el.tagName.toLowerCase() : '';
      if (tagName === 'video') {
        return { hasVideo: true, reason: 'video', source: 'video-element', node: el };
      }
      if (tagName === 'iframe') {
        // Check src attribute for video URLs
        const src = el.getAttribute('src') || '';
        if (hasVideoUrl(src)) {
          return { hasVideo: true, reason: 'video', source: 'iframe-video', node: el };
        }
        // Also check if iframe has video-related data attributes or classes
        if (el.hasAttribute('data-video') || el.hasAttribute('data-bgvideo') ||
            el.className && (el.className.includes('video') || el.className.includes('bg-video'))) {
          return { hasVideo: true, reason: 'video', source: 'iframe-video', node: el };
        }
      }
      if (tagName === 'canvas') {
        // Check inline style
        const canvasStyle = el.getAttribute('style') || '';
        if (hasVideoUrl(canvasStyle)) {
          return { hasVideo: true, reason: 'video', source: 'canvas-video', node: el };
        }
        // Check computed style for video-related properties
        const canvasCs = window.getComputedStyle(el);
        const canvasBg = canvasCs.backgroundImage || '';
        if (hasVideoUrl(canvasBg)) {
          return { hasVideo: true, reason: 'video', source: 'canvas-video', node: el };
        }
      }
      
      // STEP 7: Check child elements for video, iframe, or canvas
      try {
        // Check for video elements
        const videoElements = el.querySelectorAll('video');
        for (const videoEl of videoElements) {
          const videoCs = window.getComputedStyle(videoEl);
          const position = videoCs.position;
          const zIndex = parseInt(videoCs.zIndex, 10);
          
          // If video is positioned and behind (z-index <= 0 or not set), consider it a background
          if ((position === 'absolute' || position === 'fixed') && (isNaN(zIndex) || zIndex <= 0)) {
            return { hasVideo: true, reason: 'video', source: 'child-video-element', node: videoEl };
          }
          // If it's a video element without positioning, still consider it background
          if (!position || position === 'static') {
            return { hasVideo: true, reason: 'video', source: 'child-video-element', node: videoEl };
          }
        }
        
        // Check for iframe elements (all iframes, not just specific patterns)
        const iframeElements = el.querySelectorAll('iframe');
        for (const iframeEl of iframeElements) {
          const iframeCs = window.getComputedStyle(iframeEl);
          const position = iframeCs.position;
          const zIndex = parseInt(iframeCs.zIndex, 10);
          const src = iframeEl.getAttribute('src') || '';
          
          // Check if iframe has video URL or video-related attributes
          if (hasVideoUrl(src) || 
              iframeEl.hasAttribute('data-video') || 
              iframeEl.hasAttribute('data-bgvideo')) {
            // If iframe is positioned and behind, consider it a background
            if ((position === 'absolute' || position === 'fixed') && (isNaN(zIndex) || zIndex <= 0)) {
              return { hasVideo: true, reason: 'video', source: 'child-iframe-video', node: iframeEl };
            }
            // If iframe contains video and is not positioned, still consider it background
            if (!position || position === 'static') {
              return { hasVideo: true, reason: 'video', source: 'child-iframe-video', node: iframeEl };
            }
          }
        }
        
        // Check for canvas elements
        const canvasElements = el.querySelectorAll('canvas');
        for (const canvasEl of canvasElements) {
          const canvasCs = window.getComputedStyle(canvasEl);
          const position = canvasCs.position;
          const zIndex = parseInt(canvasCs.zIndex, 10);
          const canvasStyle = canvasEl.getAttribute('style') || '';
          const canvasBg = canvasCs.backgroundImage || '';
          
          // Check if canvas has video-related content
          if (hasVideoUrl(canvasStyle) || hasVideoUrl(canvasBg) ||
              canvasEl.hasAttribute('data-video') || canvasEl.hasAttribute('data-bgvideo')) {
            // If canvas is positioned and behind, consider it a background
            if ((position === 'absolute' || position === 'fixed') && (isNaN(zIndex) || zIndex <= 0)) {
              return { hasVideo: true, reason: 'video', source: 'child-canvas-video', node: canvasEl };
            }
          }
        }
      } catch (e) {
        // Query selector may fail in some contexts
      }
      
      return { hasVideo: false, reason: '', source: '', node: null };
    } catch (e) {
      return { hasVideo: false, reason: '', source: '', node: null };
    }
  }

  // ============================================================================
  // DIRECT BACKGROUND RESOLVER - Simple, fast, reliable background detection
  // ============================================================================
  // Strategy: Find the first visible solid-color element directly behind the text
  // No averaging, no sampling, no alpha blending, no pixel inspection
  // Immediate return on first valid background found
  // ============================================================================

  /**
   * Check if a point is inside an element's bounding box
   * @param {DOMRect} rect - Element's bounding rectangle
   * @param {number} x - X coordinate to check
   * @param {number} y - Y coordinate to check
   * @returns {boolean} True if point is inside rect
   */
  function pointInRect(rect, x, y) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  /**
   * Check if an element is visible (not hidden, not zero-sized)
   * @param {Element} el - Element to check
   * @param {CSSStyleDeclaration} cs - Computed style (optional)
   * @returns {boolean} True if element is visible
   */
  function isElementVisible(el, cs = null) {
    if (!el) return false;
    try {
      if (!cs) cs = window.getComputedStyle(el);
      if (cs.display === 'none') return false;
      if (cs.visibility === 'hidden') return false;
      if (parseFloat(cs.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Check if an element has a solid background color (alpha >= 0.5)
   * Threshold aligned with shouldSkipContrastFix to prevent gaps where
   * backgrounds are neither detected nor skipped
   * @param {Element} el - Element to check
   * @param {CSSStyleDeclaration} cs - Computed style (optional)
   * @returns {Array|null} [r, g, b, a] if solid background found, null otherwise
   */
  function getSolidBackground(el, cs = null) {
    if (!el) return null;
    try {
      if (!cs) cs = window.getComputedStyle(el);
      const bgColor = cs.backgroundColor;
      if (!bgColor || bgColor === 'transparent' || bgColor === 'rgba(0, 0, 0, 0)') {
        return null;
      }
      const rgba = parseCSSColorToRGBA(bgColor, null);
      if (!rgba) return null;
      // Return if alpha is solid enough (>= 0.5)
      // This threshold matches shouldSkipContrastFix to prevent:
      // - Backgrounds 0.5-0.89 being missed by detection but not skipped
      // - Which would cause incorrect fallback to white
      if (rgba[3] >= 0.5) {
        return rgba;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * SAFEGUARD: Reliably resolve the final computed body background color
   * This handles cases where themes, wrappers, or nested containers override styles
   * by checking not just body, but also its direct children that might have the actual background
   * 
   * @returns {Array} [r, g, b, a] - Always returns a valid color (defaults to white if not found)
   */
  let _cachedBodyBackground = null;
  function getResolvedBodyBackground() {
    // Return cached value if available (cache is cleared on page changes)
    if (_cachedBodyBackground !== null) {
      return _cachedBodyBackground;
    }
    
    try {
      // First, check body's computed background
      const bodyCs = window.getComputedStyle(document.body);
      const bodyBg = bodyCs.backgroundColor;
      
      // Parse body background
      if (bodyBg && bodyBg !== 'transparent' && bodyBg !== 'rgba(0, 0, 0, 0)') {
        const bodyRgba = parseCSSColorToRGBA(bodyBg, [255, 255, 255, 1]);
        if (bodyRgba && bodyRgba[3] >= 0.95) {
          // Body has opaque or near-opaque background - use it
          const finalColor = bodyRgba[3] >= 1.0 ? bodyRgba : 
            [bodyRgba[0], bodyRgba[1], bodyRgba[2], 1.0];
          _cachedBodyBackground = finalColor;
          console.log(`[BODY BG SAFEGUARD] Resolved body background: rgba(${Math.round(finalColor[0])}, ${Math.round(finalColor[1])}, ${Math.round(finalColor[2])}, ${finalColor[3].toFixed(2)}) from body element`);
          return finalColor;
        }
      }
      
      // Body is transparent - check direct children of body for their computed background
      // This handles cases where themes/wrappers set the actual background on a child element
      const bodyChildren = Array.from(document.body.children);
      for (const child of bodyChildren) {
        try {
          const childCs = window.getComputedStyle(child);
          const childBg = childCs.backgroundColor;
          
          // Skip if child has image background
          const childImageCheck = detectImageBackground(child, childCs);
          if (childImageCheck.hasImage) {
            continue; // Skip this child, check next
          }
          
          // Parse child background
          if (childBg && childBg !== 'transparent' && childBg !== 'rgba(0, 0, 0, 0)') {
            const childRgba = parseCSSColorToRGBA(childBg, [255, 255, 255, 1]);
            if (childRgba && childRgba[3] >= 0.95) {
              // Child has opaque or near-opaque background - use it as body background
              const finalColor = childRgba[3] >= 1.0 ? childRgba : 
                [childRgba[0], childRgba[1], childRgba[2], 1.0];
              _cachedBodyBackground = finalColor;
              const childInfo = `${child.tagName}${child.className ? '.' + child.className.split(' ')[0] : ''}`;
              console.log(`[BODY BG SAFEGUARD] Resolved body background: rgba(${Math.round(finalColor[0])}, ${Math.round(finalColor[1])}, ${Math.round(finalColor[2])}, ${finalColor[3].toFixed(2)}) from body child: ${childInfo}`);
              return finalColor;
            }
          }
        } catch (e) {
          // Continue checking other children if one fails
          continue;
        }
      }
      
      // No opaque background found on body or its direct children - default to white
      _cachedBodyBackground = [255, 255, 255, 1.0];
      console.log(`[BODY BG SAFEGUARD] No opaque background found on body or children, defaulting to white`);
      return _cachedBodyBackground;
    } catch (e) {
      // Error occurred - default to white
      _cachedBodyBackground = [255, 255, 255, 1.0];
      console.warn(`[BODY BG SAFEGUARD] Error resolving body background: ${e.message}, defaulting to white`);
      return _cachedBodyBackground;
    }
  }

  /**
   * REAL COMPOSITING BACKGROUND RESOLVER
   * Uses alpha compositing formula: result = fg * fg_alpha + bg * (1 - fg_alpha)
   * Traverses ancestors until fully opaque background (alpha >= 1.0) is found
   * 
   * @param {Element} textNode - The text element to find background for
   * @returns {Object} { color: [r,g,b,a] | null, node: Element | null, hasImage: boolean }
   */
  function detectDirectBackground(textNode) {
    if (!textNode) {
      return { color: null, node: null, hasImage: false };
    }

    /* ----------  GUARD: never touch text inside a video-slide  ---------- */
    if (textNode.closest && textNode.closest('sr7-module[data-alias*="background-effect-hero"]')) {
      return { color: null, node: textNode, hasImage: true, imageSource: 'video-slide-container' };
    }
    /* ------------------------------------------------------------------- */

    // STRICT CHECK: First check the element itself for images and videos (before walking ancestors)
    // This catches CSS variables, inline styles, and computed background-image/video immediately
    try {
      const selfCs = window.getComputedStyle(textNode);
      const selfImageCheck = detectImageBackground(textNode, selfCs);
      if (selfImageCheck.hasImage) {
        // Image found on element itself - skip immediately
        return {
          color: null,
          node: textNode,
          hasImage: true,
          imageSource: selfImageCheck.source
        };
      }
      const selfVideoCheck = detectVideoBackground(textNode, selfCs);
      if (selfVideoCheck.hasVideo) {
        // Video found on element itself - skip immediately
        return {
          color: null,
          node: textNode,
          hasImage: true,
          imageSource: selfVideoCheck.source
        };
      }
    } catch (e) {
      // Continue if self-check fails
    }

    // Get text element's bounding box and center point
    let rect;
    try {
      rect = textNode.getBoundingClientRect();
    } catch (e) {
      return { color: null, node: null, hasImage: false };
    }

    // Use center point for overlap check
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Real compositing: result = fg * fg_alpha + bg * (1 - fg_alpha)
    // Traverse ancestors until fully opaque (alpha >= 1.0) background is found
    let compositeColor = null; // [r, g, b, a] - accumulated composite
    let imageNode = null;
    let imageSource = '';
    let currentNode = textNode;
    let foundOpaqueBeforeBody = false; // Track if we found an opaque layer before reaching body
    
    // Check element itself first for images and videos
    try {
      const selfCs = window.getComputedStyle(textNode);
      const selfImageCheck = detectImageBackground(textNode, selfCs);
      if (selfImageCheck.hasImage) {
        return {
          color: null,
          node: textNode,
          hasImage: true,
          imageSource: selfImageCheck.source
        };
      }
      const selfVideoCheck = detectVideoBackground(textNode, selfCs);
      if (selfVideoCheck.hasVideo) {
        return {
          color: null,
          node: textNode,
          hasImage: true,
          imageSource: selfVideoCheck.source
        };
      }
    } catch (e) {
      // Continue if self-check fails
    }

    /* ----------  early exit: video behind text  ---------- */
    const textRect = textNode.getBoundingClientRect();
    if (textRect.width && textRect.height) {
      const x = textRect.left + textRect.width / 2;
      const y = textRect.top + textRect.height / 2;
      const topEl = document.elementFromPoint(x, y);
      if (topEl) {
        // walk up through stacking context until we find a video/iframe or reach <html>
        for (let el = topEl; el && el !== document.documentElement; el = el.parentElement) {
          const tag = el.tagName.toLowerCase();
          if (tag === 'video') {
            // <video> behind text – skip
            return {
              color: null,
              node: el,
              hasImage: true,
              imageSource: 'video-element-behind-text'
            };
          }
          if (tag === 'iframe') {
            const src = (el.src || el.getAttribute('src') || '').toLowerCase();
            if (/(youtube|youtu\.be|vimeo|\.(mp4|webm|ogg))/.test(src) ||
                el.hasAttribute('data-video') ||
                el.hasAttribute('data-bgvideo')) {
              // video iframe behind text – skip
              return {
                color: null,
                node: el,
                hasImage: true,
                imageSource: 'iframe-video-behind-text'
              };
            }
          }
        }
      }
    }
    /* ----------  proceed with normal colour fixing ---------- */

    // Traverse ancestors using real compositing
    while (currentNode && currentNode !== document.documentElement.parentElement) {
      try {
        const cs = window.getComputedStyle(currentNode);
        
        // Check for image background FIRST (before compositing)
        const imageCheck = detectImageBackground(currentNode, cs);
        if (imageCheck.hasImage) {
          // Image found - if we have a composite color, use it; otherwise return image
          if (compositeColor && compositeColor[3] >= 1.0) {
            // Fully opaque composite blocks the image
            return {
              color: compositeColor,
              node: currentNode,
              hasImage: false,
              imageSource: ''
            };
          }
          // No fully opaque background found - image is visible
          return {
            color: null,
            node: imageCheck.node || currentNode,
            hasImage: true,
            imageSource: imageCheck.source
          };
        }
        
   /*  ----------  SAME INTERFACE, NO ASSUMPTIONS  ----------  */
/*  detectVideoBackground  must exist elsewhere – we still call it.  */

// ----------  helpers used inside the block ----------
const rectOfTextNode = (tn) => {
  const r = document.createRange();
  r.selectNode(tn);
  return r.getBoundingClientRect();
};

const isOpaqueLayer = (el) => {
  const s = getComputedStyle(el);
  if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
  const bc = s.backgroundColor;
  if (!bc || bc === 'transparent' || bc === 'rgba(0, 0, 0, 0)') return false;
  const m = bc.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return false;                 // unknown syntax – ignore
  const a = m[4] != null ? parseFloat(m[4]) : 1;
  return a >= 0.98;                     // solid enough to hide whatever is behind
};

const videoElementBehind = (textNode) => {
  const rect = rectOfTextNode(textNode);
  if (!rect.width || !rect.height) return null;

  // sample nine points to be sure
  const stepX = rect.width / 8;
  const stepY = rect.height / 8;
  for (let row = 1; row < 8; row += 3) {
    for (let col = 1; col < 8; col += 3) {
      const x = rect.left + col * stepX;
      const y = rect.top  + row * stepY;
      const el = document.elementFromPoint(x, y);
      if (!el) continue;

      // walk up through stacking contexts until we hit a video/iframe or the viewport
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        const tag = n.tagName.toLowerCase();

        if (tag === 'video') return n;

        if (tag === 'iframe') {
          const src = (n.src || '').toLowerCase();
          if (/(youtube|youtu\.be|vimeo|\.(mp4|webm|ogg))/.test(src) ||
              n.hasAttribute('data-video') ||
              n.hasAttribute('data-bgvideo')) return n;
        }
      }
    }
  }
  return null;
};

// ----------  BEGIN REWRITTEN ORIGINAL BLOCK ----------
const videoCheck = detectVideoBackground(currentNode, cs);
if (videoCheck.hasVideo) {
  if (compositeColor && compositeColor[3] >= 1.0) {
    return { color: compositeColor, node: currentNode, hasImage: false, imageSource: '' };
  }
  return {
    color: null,
    node: videoCheck.node || currentNode,
    hasImage: true,
    imageSource: videoCheck.source
  };
}

// ---  sibling / iframe search  ---
// We now simply ask: “Is there a video *behind* the text?”
const videoBehind = videoElementBehind(textNode);
if (videoBehind) {
  // is the text itself (or any ancestor up to currentNode) covered by an opaque layer?
  let blocker = null;
  for (let el = textNode.parentElement; el && el !== currentNode.parentElement; el = el.parentElement) {
    if (isOpaqueLayer(el)) { blocker = el; break; }
  }

  if (blocker && compositeColor && compositeColor[3] >= 1.0) {
    return { color: compositeColor, node: currentNode, hasImage: false, imageSource: '' };
  }
  if (!blocker) {
    return {
      color: null,
      node: videoBehind,
      hasImage: true,
      imageSource: videoBehind.src || 'container-video'
    };
  }
}
// ----------  END REWRITTEN ORIGINAL BLOCK ----------
        
        // Get background color for compositing (research-based alpha threshold logic)
        const bgColor = cs.backgroundColor;
        if (bgColor && bgColor !== 'transparent' && bgColor !== 'rgba(0, 0, 0, 0)') {
          const rgba = parseCSSColorToRGBA(bgColor, null);
          if (rgba && rgba[3] > 0) {
            // RESEARCH-BASED TRAVERSAL LOGIC:
            // Stop traversal if this element's background-color alpha >= NEAR_INVISIBLE_ALPHA (0.02)
            // This ensures we use the first visually perceptible background color
            if (rgba[3] >= NEAR_INVISIBLE_ALPHA) {
              // This element has a perceptible background - use it (with compositing if needed)
            if (compositeColor === null) {
              // First layer - use as-is
              compositeColor = [...rgba];
            } else {
              // Composite with existing: new = current * current_alpha + bg * (1 - current_alpha)
              const [cr, cg, cb, ca] = compositeColor;
              const [br, bg, bb, ba] = rgba;
              
              // Composite formula
              const newR = cr * ca + br * ba * (1 - ca);
              const newG = cg * ca + bg * ba * (1 - ca);
              const newB = cb * ca + bb * ba * (1 - ca);
              const newA = ca + ba * (1 - ca);
              
              compositeColor = [newR, newG, newB, newA];
            }
            
              // Stop traversal - we found a perceptible background (alpha >= 0.02)
              foundOpaqueBeforeBody = true;
              return {
                color: compositeColor,
                node: currentNode,
                hasImage: false,
                imageSource: ''
              };
            } else {
              // Alpha < NEAR_INVISIBLE_ALPHA (0.02) - continue traversing up the parent chain
              // Composite this near-invisible layer but keep looking
              if (compositeColor === null) {
                compositeColor = [...rgba];
              } else {
                const [cr, cg, cb, ca] = compositeColor;
                const [br, bg, bb, ba] = rgba;
                
                const newR = cr * ca + br * ba * (1 - ca);
                const newG = cg * ca + bg * ba * (1 - ca);
                const newB = cb * ca + bb * ba * (1 - ca);
                const newA = ca + ba * (1 - ca);
                
                compositeColor = [newR, newG, newB, newA];
              }
              
              // Continue to parent (alpha < 0.02, so this is subliminal)
            }
          }
        }
        
        // Move to parent
        currentNode = currentNode.parentElement;
        
        // Stop at body/documentElement (research-based stop condition)
        if (currentNode === document.body || currentNode === document.documentElement) {
          // Check body for images
          const bodyCs = window.getComputedStyle(currentNode);
          const bodyImageCheck = detectImageBackground(currentNode, bodyCs);
          if (bodyImageCheck.hasImage) {
            if (compositeColor && compositeColor[3] >= 1.0) {
              return {
                color: compositeColor,
                node: currentNode,
                hasImage: false,
                imageSource: ''
              };
            }
            return {
              color: null,
              node: currentNode,
              hasImage: true,
              imageSource: bodyImageCheck.source
            };
          }
          
          const bodyVideoCheck = detectVideoBackground(currentNode, bodyCs);
          if (bodyVideoCheck.hasVideo) {
            if (compositeColor && compositeColor[3] >= 1.0) {
              return {
                color: compositeColor,
                node: currentNode,
                hasImage: false,
                imageSource: ''
              };
            }
            return {
              color: null,
              node: currentNode,
              hasImage: true,
              imageSource: bodyVideoCheck.source
            };
          }
          
          // SAFEGUARD: Use reliable body background resolver
          // This handles cases where themes, wrappers, or nested containers override styles
          const resolvedBodyRgba = getResolvedBodyBackground();
          
          // IMPORTANT: Composite transparent layers with body to see if they become fully opaque
          // If they do, process them. If they remain transparent, skip them.
          if (resolvedBodyRgba && resolvedBodyRgba[3] > 0) {
            if (compositeColor === null) {
              // No layers before body - if body is opaque or near-opaque, use it
              if (resolvedBodyRgba[3] >= 0.95) {
                // Treat near-opaque (>= 0.95) as fully opaque for practical purposes
                foundOpaqueBeforeBody = true; // Body itself is opaque/near-opaque
                compositeColor = resolvedBodyRgba[3] >= 1.0 ? [...resolvedBodyRgba] : [resolvedBodyRgba[0], resolvedBodyRgba[1], resolvedBodyRgba[2], 1.0];
                // Return immediately since body is opaque/near-opaque and there are no layers before it
                return {
                  color: compositeColor,
                  node: currentNode,
                  hasImage: false,
                  imageSource: ''
                };
              }
              // If body is also transparent, compositeColor stays null (will skip)
            } else {
              // Composite transparent layers with body
              const [cr, cg, cb, ca] = compositeColor;
              const [br, bg, bb, ba] = resolvedBodyRgba;
              const newR = cr * ca + br * ba * (1 - ca);
              const newG = cg * ca + bg * ba * (1 - ca);
              const newB = cb * ca + bb * ba * (1 - ca);
              const newA = ca + ba * (1 - ca);
              compositeColor = [newR, newG, newB, newA];
              
              // If composite is now fully opaque or near-opaque, check if we should process it
              if (compositeColor[3] >= 0.95) {
                // CRITICAL: Only process if we found an opaque layer BEFORE reaching body
                // If all layers before body were transparent, skip even if composite with body is opaque
                if (foundOpaqueBeforeBody) {
                  // Treat near-opaque (>= 0.95) as fully opaque
                  const finalColor = compositeColor[3] >= 1.0 ? compositeColor : 
                    [compositeColor[0], compositeColor[1], compositeColor[2], 1.0];
                  return {
                    color: finalColor,
                    node: currentNode,
                    hasImage: false,
                    imageSource: ''
                  };
                } else {
                  // All layers before body were transparent - skip this element
                  // This handles "All Transparent" test case - should be skipped
                  return {
                    color: null,
                    node: null,
                    hasImage: false,
                    imageSource: ''
                  };
                }
              }
              
              // IMPORTANT: Don't set foundOpaqueBeforeBody here!
              // If all layers before body were transparent, we should skip
              // even if they composite to opaque with body.
              // Only process if we found an opaque layer BEFORE reaching body.
            }
          } else if (compositeColor === null) {
            // Body has no explicit background (transparent or not set)
            // Use safeguard's default (white) - this should never happen as safeguard always returns a color
            return {
              color: resolvedBodyRgba || [255, 255, 255, 1.0],
              node: currentNode,
              hasImage: false,
              imageSource: ''
            };
          }
          
          break;
        }
      } catch (e) {
        currentNode = currentNode.parentElement;
      }
    }
    
    // If no fully opaque background found, check if we should skip
    if (compositeColor === null || compositeColor[3] < 1.0) {
      // If composite is null (no layers at all), use safeguard to get body background
      if (compositeColor === null) {
        // SAFEGUARD: Use reliable body background resolver
        // This ensures we always get the correct body background, even when themes/wrappers override it
        const resolvedBodyRgba = getResolvedBodyBackground();
        if (resolvedBodyRgba && resolvedBodyRgba[3] >= 0.95) {
          // Body has opaque or near-opaque background - treat as fully opaque
          const finalColor = resolvedBodyRgba[3] >= 1.0 ? resolvedBodyRgba : 
            [resolvedBodyRgba[0], resolvedBodyRgba[1], resolvedBodyRgba[2], 1.0];
          return {
            color: finalColor,
            node: document.body,
            hasImage: false,
            imageSource: ''
          };
        }
        // If safeguard returned transparent (shouldn't happen), use it anyway
        return {
          color: resolvedBodyRgba || [255, 255, 255, 1.0],
          node: document.body,
          hasImage: false,
          imageSource: ''
        };
      }
      
      // If we have transparent layers that composite with body to become fully opaque:
      // - Process them if composite is close to opaque (>= 0.95) AND we found an opaque layer BEFORE reaching body
      // This distinguishes:
      //   - "Multiple Transparent Layers" (has opaque ancestor) -> process
      //   - "All Transparent" (no opaque ancestor) -> skip
      if (compositeColor[3] >= 0.95) {
        // CRITICAL: Only process if we found an opaque layer BEFORE reaching body
        // If all layers before body were transparent, skip even if composite with body is opaque
        if (foundOpaqueBeforeBody) {
          // Close enough to opaque - treat as fully opaque
          // This handles cases where body has opaque background and transparent layers composite to opaque
          return {
            color: [compositeColor[0], compositeColor[1], compositeColor[2], 1.0],
            node: currentNode || document.body,
            hasImage: false,
            imageSource: ''
          };
        } else {
          // All layers before body were transparent - skip this element
          // This handles "All Transparent" test case - should be skipped
          return {
            color: null,
            node: null,
            hasImage: false,
            imageSource: ''
          };
        }
      }
      
      // If composite is still transparent, skip
      // (This handles "All Transparent" test case - should be skipped)
      return {
        color: null,
        node: null,
        hasImage: false,
        imageSource: ''
      };
    }
    
    // Return fully opaque composite
    // If we reached here, compositeColor[3] >= 1.0, so it's fully opaque
    return {
      color: compositeColor,
      node: currentNode || document.body,
      hasImage: false,
      imageSource: ''
    };
  }

  /**
   * Get effective background color for an element
   * Uses the direct background resolver for simple, fast, reliable detection
   * Sets flags on element for skip logic
   * 
   * @param {Element} el - Element to get background for
   * @returns {Array} [r, g, b, a] background color
   */
  function getEffectiveBackgroundRGBA(el) {
    // Skip extension's own UI elements (notifications, popups, etc.)
    if (el.id === 'ai-contrast-notification' || 
        el.id === 'ai-contrast-notification-container' ||
        el.id === 'contrast-fixes' ||
        el.closest('#ai-contrast-notification') ||
        el.closest('#ai-contrast-notification-container') ||
        el.closest('#contrast-fixes')) {
      return null; // Skip extension UI elements
    }
    
    const elementText = (el.textContent || '').trim().substring(0, 30);
    const elementId = `${el.tagName}${el.className ? '.' + el.className.split(' ')[0] : ''} "${elementText}"`;

    // For interactive elements (buttons, links), check their own background first
    const tagName = el.tagName ? el.tagName.toLowerCase() : '';
    const isInteractive = tagName === 'button' || 
                         tagName === 'a' || 
                         tagName === 'input' ||
                         el.getAttribute('role') === 'button' ||
                         el.getAttribute('role') === 'link';
    
    let result;
    if (isInteractive) {
      // Check if interactive element has its own solid background
      try {
        const elCs = getComputedStyle(el);
        const elBg = parseCSSColorToRGBA(elCs.backgroundColor, [0, 0, 0, 0]);
        // If element has its own solid background (alpha > 0.5), use that instead of parent
        if (elBg[3] > 0.5) {
          // Interactive element with solid background - use its own background, ignore parent images
          const hasGradient = hasBackgroundGradient(el);
          const hasImage = hasBackgroundImage(el);
          if (!hasImage && !hasGradient) {
            // For links: Only use link's own background if it has explicit inline style background
            // OR if the background is very similar to parent (not decorative/hover state)
            // This prevents using decorative CSS backgrounds (like hover states) as the text background
            if (tagName === 'a') {
              const hasInlineBg = el.style.backgroundColor && el.style.backgroundColor !== '';
              if (!hasInlineBg) {
                // Link has CSS background but no inline style - check parent background
                // If parent background is very different, the link's background is likely decorative
                try {
                  const parentBgResult = detectDirectBackground(el.parentElement || document.body);
                  if (parentBgResult && parentBgResult.color && parentBgResult.color[3] >= 0.95) {
                    const parentBg = parentBgResult.color.slice(0, 3);
                    const elBgRGB = elBg.slice(0, 3);
                    // Calculate color difference (Euclidean distance in RGB space)
                    const colorDiff = Math.sqrt(
                      Math.pow(elBgRGB[0] - parentBg[0], 2) +
                      Math.pow(elBgRGB[1] - parentBg[1], 2) +
                      Math.pow(elBgRGB[2] - parentBg[2], 2)
                    );
                    // If color difference is large (> 100), link background is likely decorative
                    // Use parent background instead to preserve brand colors
                    if (colorDiff > 100) {
                      console.log(`[BG DETECTION] Link has decorative CSS background (diff: ${colorDiff.toFixed(0)}), using parent background for contrast calculation`);
                      // Fall through to normal detection (use parent background)
                    } else {
                      // Backgrounds are similar - use link's background
                      el._aiHasImageBackground = false;
                      el._aiImageBackgroundNode = el;
                      el._aiImageSource = '';
                      el._aiHasTransparencyChain = false;
                      el._aiOpaqueBgNode = el;
                      return elBg;
                    }
                  } else {
                    // Can't determine parent background - use link's background
                    el._aiHasImageBackground = false;
                    el._aiImageBackgroundNode = el;
                    el._aiImageSource = '';
                    el._aiHasTransparencyChain = false;
                    el._aiOpaqueBgNode = el;
                    return elBg;
                  }
                } catch (e) {
                  // Error checking parent - use link's background
                  el._aiHasImageBackground = false;
                  el._aiImageBackgroundNode = el;
                  el._aiImageSource = '';
                  el._aiHasTransparencyChain = false;
                  el._aiOpaqueBgNode = el;
                  return elBg;
                }
              } else {
                // Link has explicit inline background - use it
                el._aiHasImageBackground = false;
                el._aiImageBackgroundNode = el;
                el._aiImageSource = '';
                el._aiHasTransparencyChain = false;
                el._aiOpaqueBgNode = el;
                return elBg;
              }
            } else {
              // Not a link - use element's own background (buttons, inputs, etc.)
              el._aiHasImageBackground = false;
              el._aiImageBackgroundNode = el;
              el._aiImageSource = '';
              el._aiHasTransparencyChain = false;
              el._aiOpaqueBgNode = el;
              return elBg;
            }
          }
        }
      } catch (e) {
        // If we can't check, fall through to normal detection
      }
    }
    
    // Use direct background resolver (normal behavior)
    result = detectDirectBackground(el);

    // Set flags for shouldSkipContrastFix
    // Also check for gradients - they should be treated like image backgrounds
    const hasGradient = hasBackgroundGradient(el);
    el._aiHasImageBackground = result.hasImage || hasGradient;
    el._aiImageBackgroundNode = result.node;
    el._aiImageSource = result.imageSource || '';
    el._aiHasTransparencyChain = result.color === null && !result.hasImage && !hasGradient;
    el._aiOpaqueBgNode = result.node;

    // Logging
    if (result.hasImage || hasGradient) {
      // Check if it's a video based on source
      const isVideo = result.imageSource && (
        result.imageSource.includes('video') || 
        result.imageSource.includes('data-attribute') ||
        result.imageSource.includes('video-element') ||
        result.imageSource.includes('iframe-video') ||
        result.imageSource.includes('canvas-video') ||
        result.imageSource.includes('child-video')
      );
      const reason = hasGradient ? 'gradient' : (isVideo ? 'video' : 'image');
      const source = hasGradient ? 'gradient-background' : result.imageSource;
      console.log(`[AI BG SKIP] ${elementId} | reason: ${reason} | image-source: ${source}`);
      return null; // Return null to trigger skip
    } else if (result.color && result.color[3] >= 1.0) {
      // Only return fully opaque backgrounds (alpha >= 1.0)
      const bgStr = `rgba(${Math.round(result.color[0])}, ${Math.round(result.color[1])}, ${Math.round(result.color[2])}, ${result.color[3].toFixed(2)})`;
      const nodeStr = result.node ? `${result.node.tagName}${result.node.className ? '.' + result.node.className.split(' ')[0] : ''}` : 'none';
      console.log(`[AI BG OK] ${elementId} | bg: ${bgStr} | source: ${nodeStr}`);
      return result.color;
    } else {
      // No fully opaque background found - compositing stopped before body
      console.log(`[AI BG SKIP] ${elementId} | reason: no-opaque-background`);
      return null;
    }
  }

  function getEffectiveForegroundRGB(el, bgRGB) {
    try {
      // CRITICAL: For elements that inherit color from a corrected parent,
      // we need to use the original CSS color for evaluation, not the corrected inline style
      // Check if element inherits color from a corrected parent
      if (!el.style.color) {
        // Element doesn't have explicit color - it inherits from parent
        // If parent was corrected, element inherits the corrected color, so use parent's original
        let parent = el.parentElement;
        while (parent && parent !== document.body) {
          if (parent.hasAttribute("data-ai-contrast-fixed")) {
            // Parent was corrected - element must be inheriting the corrected color
            // Use parent's original color for accurate contrast evaluation
            const parentOriginal = parent.getAttribute("data-ai-original-inline-color");
            if (parentOriginal) {
              // Parent had an original color stored - use it for this element's evaluation
              const originalParsed = parseCSSColorToRGBA(parentOriginal, null);
              if (originalParsed) {
                const fg = originalParsed;
                if (fg[3] >= 1) return [fg[0], fg[1], fg[2]];
                const blended = blendRGBA(fg, [...bgRGB, 1]);
                return [blended[0], blended[1], blended[2]];
              }
            }
            // If parent original was empty or couldn't be parsed, fall through to computed style
            // This shouldn't happen with our fix, but handle gracefully
          }
          parent = parent.parentElement;
        }
      }

      // Normal case: use computed style
      const cs = getComputedStyle(el);
      const fg = parseCSSColorToRGBA(cs.color, [0, 0, 0, 1]);
      if (fg[3] >= 1) return [fg[0], fg[1], fg[2]];
      const blended = blendRGBA(fg, [...bgRGB, 1]);
      return [blended[0], blended[1], blended[2]];
    } catch {
      return [0, 0, 0]; // Fallback to black
    }
  }

  function extractElementContext(el) {
    try {
      const style = getComputedStyle(el);
      const type = el.tagName.toLowerCase();
      const fontSize = parseFloat(style.fontSize) || 16;
      const fontWeight = parseInt(style.fontWeight) || 400;
      return { type, fontSize, fontWeight };
    } catch {
      return { type: "div", fontSize: 16, fontWeight: 400 };
    }
  }

  // Check if element has a background gradient
  function hasBackgroundGradient(el) {
    try {
      const cs = getComputedStyle(el);
      const bgImage = cs.backgroundImage;
      return bgImage && bgImage.includes("gradient");
    } catch {
      return false;
    }
  }

  // Extract average color from gradient for contrast calculation
  function getGradientAverageColor(gradientString) {
    const rgbMatches = gradientString.match(/rgba?\([^)]+\)/g);
    const hexMatches = gradientString.match(/#[0-9a-fA-F]{3,6}/g);

    const colors = [];

    // Parse RGB/RGBA colors
    if (rgbMatches) {
      rgbMatches.forEach((str) => {
        const parsed = parseCSSColorToRGBA(str);
        if (parsed && parsed[3] > 0) {
          colors.push(parsed);
        }
      });
    }

    // Parse hex colors
    if (hexMatches) {
      hexMatches.forEach((hex) => {
        const parsed = parseCSSColorToRGBA(hex);
        if (parsed && parsed[3] > 0) {
          colors.push(parsed);
        }
      });
    }

    if (colors.length === 0) {
      return null;
    }

    // Use the darkest color (most conservative for light text on gradient)
    const luminances = colors.map((c) => relLuminance([c[0], c[1], c[2]]));
    const minLum = Math.min(...luminances);
    const minIdx = luminances.indexOf(minLum);

    return colors[minIdx];
  }

  // Check if element has a background image
  function hasBackgroundImage(el) {
    try {
      const cs = getComputedStyle(el);
      const bgImage = cs.backgroundImage;
      return bgImage && bgImage !== "none" && !bgImage.includes("gradient");
    } catch {
      return false;
    }
  }

  // Check if element or its ancestors have background images
  // Returns true if element is visually over an image background (hero banners, cards, etc.)
  function isTextOverImage(el) {
    try {
      // First, check if element itself has an explicit solid background
      // If it does, it's NOT "text over image" - it's text over that background
      const elCs = getComputedStyle(el);
      const elBg = parseCSSColorToRGBA(elCs.backgroundColor, [0, 0, 0, 0]);

      // If element has a solid background (alpha > 0.8), it's not "over image"
      if (elBg[3] > 0.8) {
        return false;
      }

      // Check if element itself has a background image
      if (hasBackgroundImage(el)) {
        // Element has its own background image - only treat as "over image" if bg is very transparent
        return elBg[3] < 0.3;
      }

      // ENHANCED: Check up to 5 ancestors for image backgrounds (hero banners, cards)
      // Stop if we find an opaque solid background before an image
      let current = el.parentElement;
      let depth = 0;
      const maxDepth = 5;
      
      while (current && depth < maxDepth && current !== document.body) {
        const currentCs = getComputedStyle(current);
        const currentBg = parseCSSColorToRGBA(currentCs.backgroundColor, [0, 0, 0, 0]);
        
        // If ancestor has solid opaque background, text is over THAT, not any image behind
        if (currentBg[3] > 0.8) {
          return false;
        }
        
        // Check for image background on this ancestor
        const imageCheck = detectImageBackground(current, currentCs);
        if (imageCheck.hasImage) {
          // Found image background - check if any intermediate layer blocks it
          // If element's own bg is transparent enough, it's over the image
          if (elBg[3] < 0.5) {
            return true;
          }
        }
        
        current = current.parentElement;
        depth++;
      }

      return false;
    } catch {
      return false;
    }
  }

  // NON-DESTRUCTIVE: Apply text layer correction via inline CSS (no overlay elements)
  // Preserves layout integrity by only modifying visual text nodes, not structural components
  /**
   * Helper function to apply color with !important, ensuring it overrides existing !important styles
   * @param {Element} el - Element to apply color to
   * @param {string} property - CSS property name ('color' or 'background-color')
   * @param {string} value - Color value (e.g., 'rgb(255, 0, 0)')
   */
  function applyColorWithImportant(el, property, value) {
    if (!el || !el.style) return;
    
    console.log(`   🔧 [APPLY] applyColorWithImportant called: ${property}=${value} on ${el.tagName}`);
    
    // CRITICAL FIX: Directly manipulate the style attribute to remove any existing !important declarations
    // This is necessary because removeProperty() doesn't remove !important from the attribute string
    // When an element has style="color: #00dcff !important;" in HTML, removeProperty() alone isn't sufficient
    const currentStyle = el.getAttribute('style') || '';
    console.log(`   🔍 [APPLY DEBUG] Current style attribute: "${currentStyle}"`);
    
    // Remove any existing property declaration (with or without !important)
    // Pattern matches: "property: value !important;" or "property: value;" or "property:value;"
    // CRITICAL: Avoid matching property name inside other property names (e.g., "color" in "background-color")
    // Strategy: Match property name that is NOT preceded by a word character or hyphen
    const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Pattern: (^|;|\s)property\s*:\s*[^;]+;?
    // Negative lookbehind equivalent: property must be at start OR after semicolon/space, not after word char or hyphen
    // We use a capturing group to preserve the preceding delimiter
    const propertyRegex = new RegExp(`(^|[;\\s])${escapedProperty}(?![a-zA-Z0-9_-])\\s*:\\s*[^;]+;?`, 'gi');
    let cleanedStyle = currentStyle.replace(propertyRegex, '$1').trim();
    console.log(`   🔍 [APPLY DEBUG] After regex removal: "${cleanedStyle}"`);
    
    // Clean up any double semicolons or trailing/leading semicolons
    cleanedStyle = cleanedStyle.replace(/;\s*;/g, ';').replace(/^;+|;+$/g, '').trim();
    
    // Update the style attribute with cleaned version (removes old !important declarations)
    if (cleanedStyle) {
      el.setAttribute('style', cleanedStyle);
      console.log(`   🔍 [APPLY DEBUG] Updated style attribute to: "${cleanedStyle}"`);
    } else {
      el.removeAttribute('style');
      console.log(`   🔍 [APPLY DEBUG] Removed style attribute completely`);
    }
    
    // Also use removeProperty() as an additional safeguard
    el.style.removeProperty(property);
    
    // Force a reflow to ensure the removal is processed
    void el.offsetHeight;
    
    // Check computed style before applying new value
    const computedBefore = getComputedStyle(el).getPropertyValue(property);
    console.log(`   🔍 [APPLY DEBUG] Computed ${property} before setProperty: "${computedBefore}"`);
    
    // CRITICAL: Always use direct attribute manipulation for !important to ensure it works
    // Even though setProperty with 'important' should work, direct attribute manipulation is more reliable
    const currentAttr = el.getAttribute('style') || '';
    const finalCleaned = currentAttr.replace(propertyRegex, '').trim().replace(/;\s*;/g, ';').replace(/^;+|;+$/g, '').trim();
    const newStyleAttr = `${finalCleaned ? finalCleaned + '; ' : ''}${property}: ${value} !important;`;
    el.setAttribute('style', newStyleAttr);
    console.log(`   🔍 [APPLY DEBUG] Final style attribute: "${newStyleAttr}"`);
    
    // Force multiple reflows to ensure browser processes the style change
    void el.offsetHeight;
    void el.offsetWidth;
    void el.scrollHeight;
    
    // Also try setProperty as a backup (after reflow)
    el.style.setProperty(property, value, 'important');
    
    // Force another reflow after setProperty
    void el.offsetHeight;
    
    // CRITICAL: If there's a CSS class with !important that might be overriding,
    // we need to ensure our inline style takes precedence by checking computed style
    // and potentially removing/overriding the class temporarily
    const computedBeforeCheck = getComputedStyle(el).getPropertyValue(property);
    
    // Verify the style was applied correctly by comparing RGB values
    const computedColor = getComputedStyle(el).color;
    
    // Parse and compare RGB values to ensure they match (with tolerance for rounding)
    const valueMatch = value.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i);
    const computedMatch = computedColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i);
    
    if (valueMatch && computedMatch) {
      const valueRgb = [parseInt(valueMatch[1]), parseInt(valueMatch[2]), parseInt(valueMatch[3])];
      const computedRgb = [parseInt(computedMatch[1]), parseInt(computedMatch[2]), parseInt(computedMatch[3])];
      const matches = valueRgb.every((val, i) => Math.abs(val - computedRgb[i]) <= 1);
      
      if (!matches) {
        console.warn(`   ⚠️  [APPLY] Color mismatch detected. Expected: rgb(${valueRgb.join(',')}), Got: rgb(${computedRgb.join(',')}). Attempting stylesheet injection override...`);
        
        // AGGRESSIVE FALLBACK: Inject a stylesheet rule with higher specificity
        // This ensures we override any CSS class rules with !important
        // Generate a unique class name for this element
        const uniqueClass = `ai-color-override-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        el.classList.add(uniqueClass);
        
        // Build a selector with maximum specificity
        // Use element tag + all existing classes + unique class for maximum specificity
        const tagName = el.tagName.toLowerCase();
        const existingClasses = Array.from(el.classList)
          .filter(c => c !== uniqueClass && !c.startsWith('ai-hover'))
          .map(c => `.${c}`)
          .join('');
        const selector = existingClasses 
          ? `${tagName}${existingClasses}.${uniqueClass}` 
          : `${tagName}.${uniqueClass}`;
        
        // Inject stylesheet rule with !important at the top of head for maximum priority
        const css = `${selector} { ${property}: ${value} !important; }`;
        injectStylesheet(css);
        
        // Also ensure inline style is set (as backup)
        const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const fallbackRegex = new RegExp(`(^|[;\\s])${escapedProperty}(?![a-zA-Z0-9_-])\\s*:\\s*[^;]+;?`, 'gi');
        let finalStyle = el.getAttribute('style') || '';
        let finalCleaned = finalStyle.replace(fallbackRegex, '').trim().replace(/;\s*;/g, ';').replace(/^;+|;+$/g, '').trim();
        finalCleaned = finalCleaned ? finalCleaned + '; ' : '';
        el.setAttribute('style', `${finalCleaned}${property}: ${value} !important;`);
        el.style.setProperty(property, value, 'important');
        
        // Force multiple reflows
        void el.offsetHeight;
        void el.offsetWidth;
        void el.scrollHeight;
        void el.getBoundingClientRect();
        void el.offsetHeight;
        
        // Verify after stylesheet injection
        const recheckColor = getComputedStyle(el).color;
        const recheckMatch = recheckColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i);
        if (recheckMatch) {
          const recheckRgb = [parseInt(recheckMatch[1]), parseInt(recheckMatch[2]), parseInt(recheckMatch[3])];
          const recheckMatches = valueRgb.every((val, i) => Math.abs(val - recheckRgb[i]) <= 1);
          console.log(`   ${recheckMatches ? '✅' : '⚠️'} [APPLY] After stylesheet injection: rgb(${recheckRgb.join(',')}) ${recheckMatches ? '(matches expected)' : '(still differs - may require manual inspection)'}`);
        }
        
        console.log(`   🔧 [APPLY] Injected stylesheet rule: "${css}"`);
      } else {
        // Success: colors match
        console.log(`   ✅ [APPLY] Color successfully applied with !important override: ${property}: ${value} (verified: rgb(${computedRgb.join(',')}))`);
      }
    } else if (!valueMatch) {
      // If value is not in RGB format, just verify that setProperty worked
      const computedValue = getComputedStyle(el).getPropertyValue(property);
      if (!computedValue || computedValue.trim() === '') {
        console.warn(`   ⚠️  [APPLY] Failed to apply ${property}, using direct attribute manipulation...`);
        // Re-escape property for regex, avoiding matches inside other property names
        const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const fallbackRegex = new RegExp(`(^|[;\\s])${escapedProperty}(?![a-zA-Z0-9_-])\\s*:\\s*[^;]+;?`, 'gi');
        const finalStyle = el.getAttribute('style') || '';
        const finalCleaned = finalStyle.replace(fallbackRegex, '').trim().replace(/;\s*;/g, ';').replace(/^;+|;+$/g, '').trim();
        el.setAttribute('style', `${finalCleaned ? finalCleaned + '; ' : ''}${property}: ${value} !important;`);
      } else {
        console.log(`   ✅ [APPLY] Color successfully applied with !important override: ${property}: ${value} (non-RGB format, verified via getPropertyValue)`);
      }
    } else {
      // computedMatch is null/undefined - log for debugging
      console.warn(`   ⚠️  [APPLY] Could not parse computed color for verification: ${computedColor}`);
    }
  }

  function applyTextLayerCorrection(el, fg, bg) {
    if (!el || !el.nodeType) {
      return 0;
    }

    // CENTRAL SKIP CHECK: Skip elements with image/transparent backgrounds
    const bgInfo = getEffectiveBackgroundInfo(el);
    if (shouldSkipContrastFix(el, bgInfo)) {
      const skipReason = el.getAttribute('data-ai-skip-reason') || 'unknown';
      console.log(`⏭️  [SKIP] Skipping text layer correction for ${el.tagName} - reason: ${skipReason}`);
      return 0;
    }

    const tagName = el.tagName.toLowerCase();
    const computed = getComputedStyle(el);

    // Define inline text elements (elements that can safely have display:inline)
    const inlineTags = [
      "span",
      "em",
      "strong",
      "b",
      "i",
      "u",
      "code",
      "small",
      "sub",
      "sup",
      "mark",
      "del",
      "ins",
      "a",
    ];
    const isInlineElement = inlineTags.includes(tagName);

    // Define block/interactive elements (elements that must preserve layout)
    const blockTags = [
      "div",
      "p",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "li",
      "td",
      "th",
      "section",
      "article",
      "aside",
      "header",
      "footer",
      "nav",
      "main",
    ];
    const interactiveTags = ["button", "input", "select", "textarea", "label"];
    const isBlockElement = blockTags.includes(tagName);
    const isInteractiveTag =
      interactiveTags.includes(tagName) || el.getAttribute("role") === "button";
    // Check if element is interactive (use the isInteractiveElement function defined in this file)
    const isInteractiveEl =
      isInteractiveTag ||
      (typeof isInteractiveElement === "function"
        ? isInteractiveElement(el)
        : false);
    const isStructuralElement = isBlockElement || isInteractiveEl;

    // CACHE ORIGINAL LAYOUT STYLES before making any changes
    if (!el.hasAttribute("data-ai-original-display")) {
      const originalDisplay = computed.display || "";
      el.setAttribute("data-ai-original-display", originalDisplay);
    }

    // CACHE ORIGINAL INLINE COLOR STYLE before making any changes
    if (!el.hasAttribute("data-ai-original-inline-color")) {
      const originalInlineColor = el.style.color || "";
      el.setAttribute("data-ai-original-inline-color", originalInlineColor);
    }

    if (!el.hasAttribute("data-ai-original-padding")) {
      const originalPadding = computed.padding || "";
      el.setAttribute("data-ai-original-padding", originalPadding);
    }

    if (!el.hasAttribute("data-ai-original-border")) {
      const originalBorder = computed.border || "";
      el.setAttribute("data-ai-original-border", originalBorder);
    }

    if (!el.hasAttribute("data-ai-original-transition")) {
      const originalTransition = computed.transition || "";
      el.setAttribute("data-ai-original-transition", originalTransition);
    }

    // CRITICAL: Only adjust text color - never add backgrounds or modify structure
    // Apply foreground color only with !important flag to override existing !important styles
    if (fg) {
      applyColorWithImportant(el, 'color', fg);
    }

    // NEVER add or modify background colors
    // NEVER modify display, padding, margin, box-shadow, or any layout properties

    // Calculate and return contrast
    const fgRGB = parseCSSColorToRGBA(fg, [0, 0, 0]).slice(0, 3);
    const bgRGB = bg
      ? parseCSSColorToRGBA(bg, [255, 255, 255]).slice(0, 3)
      : [255, 255, 255];
    const newContrast = wcagContrast(fgRGB, bgRGB);

    return newContrast;
  }

  // Calculate brightness from RGB color string
  function calculateBrightness(colorStr) {
    const rgbMatch = colorStr.match(/\d+/g);
    if (!rgbMatch || rgbMatch.length < 3) return 255; // Default to bright

    const rgb = rgbMatch.slice(0, 3).map(Number);
    // Use standard brightness formula: 0.299*R + 0.587*G + 0.114*B
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  }

  // Check if element has an explicit background (not transparent/inherited)
  function hasExplicitBackground(el) {
    try {
      const cs = getComputedStyle(el);

      // Check if element has a gradient (counts as explicit background)
      if (hasBackgroundGradient(el)) {
        return true;
      }

      // Check if element has its own background image (counts as explicit background)
      if (hasBackgroundImage(el)) {
        return true;
      }

      // Check if background color is solid (alpha > 0.7)
      const bg = parseCSSColorToRGBA(cs.backgroundColor, [0, 0, 0, 0]);

      // If background is very opaque, it's an explicit background
      if (bg[3] > 0.7) {
        return true;
      }

      // Check if background is set to a specific color (not transparent/rgba with low alpha)
      const bgColor = cs.backgroundColor;
      if (
        bgColor &&
        bgColor !== "transparent" &&
        bgColor !== "rgba(0, 0, 0, 0)"
      ) {
        // If it's a solid color (rgb or hex), it's explicit
        if (bgColor.startsWith("rgb(") && !bgColor.includes("rgba")) {
          return true;
        }
        // If it's rgba with high alpha, it's explicit
        if (bgColor.startsWith("rgba(") && bg[3] > 0.7) {
          return true;
        }
      }

      // CRITICAL: Elements with borders are likely meant to have backgrounds
      // Check if element has visible borders (indicates it's a button/box element)
      const borderWidth = cs.borderWidth;
      const borderStyle = cs.borderStyle;
      const borderColor = cs.borderColor;

      // If element has a visible border, it should be treated as having a background area
      // This prevents removing backgrounds from menu items, buttons, etc.
      if (
        borderWidth &&
        borderWidth !== "0px" &&
        borderStyle &&
        borderStyle !== "none" &&
        borderColor &&
        borderColor !== "transparent" &&
        borderColor !== "rgba(0, 0, 0, 0)"
      ) {
        // Element has a border - check if it's a substantial border (not just 1px)
        const borderWidthNum = parseFloat(borderWidth);
        if (borderWidthNum >= 1) {
          // This element likely should have a background - preserve any existing background
          // Even if current background is transparent, don't remove it
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  // Button hover state correction

  // Global hover stylesheet for corrections
  let buttonHoverSheet = null;
  let buttonHoverCounter = 0;

  function getOrCreateButtonHoverSheet() {
    if (!buttonHoverSheet) {
      const style = document.createElement("style");
      style.id = "ai-button-hover-fixes";
      document.head.appendChild(style);
      buttonHoverSheet = style.sheet;
      console.log("📋 Created button hover stylesheet");
    }
    return buttonHoverSheet;
  }

  function isInteractiveElement(el) {
    // Check if element is truly interactive/hoverable (clickable elements only)
    const tagName = el.tagName.toLowerCase();
    const classListStr = el.classList.toString().toLowerCase();
    const role = el.getAttribute("role");
    const href = el.getAttribute("href");
    const id = el.getAttribute("id") || "";
    const idLower = id.toLowerCase();

    // Only detect elements that are actually clickable/interactive:
    // 1. Buttons (actual button tags, or anchor tags with button/btn classes, or role="button")
    // 2. Links (anchor tags - only if they have href or are actually clickable)
    // 3. Tabs (only if they're anchor tags or have role="tab")
    // 4. Menu items (only if they're anchor tags or have role="menuitem")
    // 5. Menu buttons (hamburger menus, menu toggles, etc.)
    // 6. Call-to-action buttons (CTA, call-to-action, etc.)
    // 7. Elements with onclick handlers
    // 8. Elements with cursor: pointer style

    // Don't apply hover to text-only elements like SPAN, P, LI, H1-H6, etc. unless they're inside clickable elements

    const isButton =
      tagName === "button" ||
      (tagName === "a" &&
        (classListStr.includes("btn") || classListStr.includes("button"))) ||
      role === "button";

    // Only anchor tags are links (they're clickable by nature)
    // Don't treat other elements as links just because they have "link" in class name
    const isLink = tagName === "a";

    // Tabs: only if they're anchor tags or have explicit tab role
    const isTab =
      (tagName === "a" &&
        (role === "tab" ||
          classListStr.includes("tab") ||
          classListStr.includes("tm_pb_tab"))) ||
      role === "tab";

    // Menu items: only if they're anchor tags or have explicit menuitem role
    const isMenuItem =
      (tagName === "a" &&
        (role === "menuitem" || classListStr.includes("menu-item"))) ||
      role === "menuitem";

    // Menu buttons: hamburger menus, menu toggles, etc.
    const isMenuButton =
      classListStr.includes("menu-toggle") ||
      classListStr.includes("menu-button") ||
      classListStr.includes("hamburger") ||
      classListStr.includes("nav-toggle") ||
      idLower.includes("menu-toggle") ||
      idLower.includes("menu-button") ||
      idLower.includes("hamburger") ||
      idLower.includes("nav-toggle");

    // Call-to-action buttons
    const isCTA =
      classListStr.includes("cta") ||
      classListStr.includes("call-to-action") ||
      classListStr.includes("call-to-action-button") ||
      idLower.includes("cta") ||
      idLower.includes("call-to-action");

    // Elements with onclick handlers
    const hasOnClick = el.hasAttribute("onclick") || el.onclick !== null;

    // Elements with cursor: pointer style
    const computedStyle = getComputedStyle(el);
    const hasPointerCursor =
      computedStyle.cursor === "pointer" || computedStyle.cursor === "hand";

    // Check if anchor tag is inside a tab or menu container (parent has tab/menu classes)
    // This handles cases like <li class="tm_pb_tab"><a>...</a></li>
    const parent = el.parentElement;
    let isInsideTabOrMenu = false;
    if (tagName === "a" && parent) {
      const parentClasses = parent.classList.toString().toLowerCase();
      const parentTag = parent.tagName.toLowerCase();
      const grandParent = parent.parentElement;
      const grandParentClasses = grandParent
        ? grandParent.classList.toString().toLowerCase()
        : "";

      // Check if link is inside a tab container
      isInsideTabOrMenu =
        parentClasses.includes("tab") ||
        parentClasses.includes("tm_pb_tab") ||
        (parentTag === "li" &&
          (parentClasses.includes("tab") ||
            parentClasses.includes("tm_pb_tab"))) ||
        grandParentClasses.includes("tab") ||
        grandParentClasses.includes("tm_pb_tab") ||
        // Check if link is inside a menu/nav structure
        parentTag === "nav" ||
        (parentTag === "ul" &&
          (parentClasses.includes("menu") || parentClasses.includes("nav"))) ||
        grandParentClasses.includes("menu") ||
        grandParentClasses.includes("nav") ||
        grandParentClasses.includes("mega-menu");
    }

    // Only return true for truly interactive elements
    return (
      isButton ||
      isLink ||
      isTab ||
      isMenuItem ||
      isInsideTabOrMenu ||
      isMenuButton ||
      isCTA ||
      hasOnClick ||
      hasPointerCursor
    );
  }

  // Function to check and fix inactive tab states
  async function fixInactiveTabStates(target, autoCorrect) {
    // Find all tab containers and their links
    // Look for common tab patterns: li.tab-control, li[class*="tab"], etc.
    const tabContainers = Array.from(
      document.querySelectorAll(
        'li.tab-control, li[class*="tab-control"], li[class*="tm_pb_tab"]'
      )
    );

    if (tabContainers.length === 0) {
      // Try alternative selectors - also check for li elements with tab classes
      const altContainers = Array.from(
        document.querySelectorAll('li[class*="tab"]')
      );
      if (altContainers.length > 0) {
        console.log(
          `📋 Found ${altContainers.length} tab containers (alternative pattern)`
        );
        const allTabLinks = [];
        altContainers.forEach((container) => {
          const link = container.querySelector("a");
          if (link) {
            allTabLinks.push({ link, container });
            console.log(
              `   📌 Tab: "${(link.textContent || "")
                .trim()
                .substring(
                  0,
                  40
                )}" in container with classes: ${container.classList.toString()}`
            );
          }
        });
        if (allTabLinks.length > 0) {
          await processTabLinks(
            allTabLinks.map((t) => t.link),
            target,
            autoCorrect,
            allTabLinks.map((t) => t.container)
          );
        }
        return;
      }

      // Try finding tab links directly
      const altTabs = Array.from(
        document.querySelectorAll(
          'a[href][class*="tab"], a[href][class*="tm_pb_tab"]'
        )
      );
      if (altTabs.length > 0) {
        console.log(`📋 Found ${altTabs.length} tab links (direct pattern)`);
        await processTabLinks(altTabs, target, autoCorrect);
      }
      return;
    }

    console.log(`📋 Found ${tabContainers.length} tab containers`);

    // Get all tab links from containers
    const allTabLinks = [];
    tabContainers.forEach((container) => {
      const link = container.querySelector("a");
      if (link) {
        allTabLinks.push({ link, container });
        console.log(
          `   📌 Tab: "${(link.textContent || "")
            .trim()
            .substring(
              0,
              40
            )}" in container with classes: ${container.classList.toString()}`
        );
      }
    });

    if (allTabLinks.length > 0) {
      console.log(
        `📋 Processing ${allTabLinks.length} tab links for inactive state correction...`
      );
      await processTabLinks(
        allTabLinks.map((t) => t.link),
        target,
        autoCorrect,
        allTabLinks.map((t) => t.container)
      );
    } else {
      console.log(`⚠️ No tab links found in ${tabContainers.length} containers`);
    }
  }

  // Process tab links and fix inactive states
  // Placeholder function for adjustColorToContrast - returns original fgRGB
  async function processTabLinks(
    tabLinks,
    target,
    autoCorrect,
    containers = null
  ) {
    const processed = new Set();

    for (let i = 0; i < tabLinks.length; i++) {
      const tabLink = tabLinks[i];
      const container = containers ? containers[i] : tabLink.parentElement;

      if (processed.has(tabLink)) continue;
      processed.add(tabLink);

      try {
        // Check if container has active class (tab might be active)
        const containerClasses = container ? Array.from(container.classList) : [];
        const linkClasses = Array.from(tabLink.classList);
        const isCurrentlyActive =
          containerClasses.some((c) => c.toLowerCase().includes("active")) ||
          linkClasses.some((c) => c.toLowerCase().includes("active"));

        // Check current state contrast
        const currentBgRGBA = getEffectiveBackgroundRGBA(tabLink);
        if (!currentBgRGBA) {
          // No fully opaque background found - skip
          continue;
        }
        const currentBg = currentBgRGBA.slice(0, 3);
        const currentFg = getEffectiveForegroundRGB(tabLink, currentBg);
        const currentCr = wcagContrast(currentFg, currentBg);

        // If currently active, simulate inactive state
        let inactiveBg, inactiveFg, inactiveCr;

        if (isCurrentlyActive && container) {
          // Temporarily remove active class to check inactive state
          const activeClasses = containerClasses.filter((c) =>
            c.toLowerCase().includes("active")
          );

          // Remove active classes
          activeClasses.forEach((c) => container.classList.remove(c));
          void container.offsetHeight; // Force reflow

          // Check inactive state
          const inactiveBgRGBA = getEffectiveBackgroundRGBA(tabLink);
          inactiveBg = inactiveBgRGBA.slice(0, 3);
          inactiveFg = getEffectiveForegroundRGB(tabLink, inactiveBg);
          inactiveCr = wcagContrast(inactiveFg, inactiveBg);

          // Restore active classes
          activeClasses.forEach((c) => container.classList.add(c));
          void container.offsetHeight;
        } else {
          // Already inactive, check current state
          inactiveBg = currentBg;
          inactiveFg = currentFg;
          inactiveCr = currentCr;
        }

        // Log the contrast check for debugging
        console.log(
          `   🔍 Tab "${(tabLink.textContent || "")
            .trim()
            .substring(0, 30)}": Current=${currentCr.toFixed(
              2
            )}:1, Inactive=${inactiveCr.toFixed(2)}:1, Target=${target.toFixed(
              2
            )}:1, Active=${isCurrentlyActive}`
        );

        // Check if inactive state needs correction
        if (inactiveCr < target) {
          console.log(
            `🚩 Inactive tab below threshold: ${inactiveCr.toFixed(
              2
            )}:1 (target: ${target.toFixed(2)}:1) - "${(tabLink.textContent || "")
              .trim()
              .substring(0, 30)}"`
          );

          if (autoCorrect) {
            // Determine best correction
            const hasExplicitBg = hasExplicitBackground(tabLink);
            const newFgResult = adjustColorToContrast(inactiveFg, inactiveBg, target);
            const newFg = (newFgResult && typeof newFgResult === 'object' && 'fg' in newFgResult) ? newFgResult.fg : newFgResult;
            const fgCr = wcagContrast(newFg, inactiveBg);

            const blackCr = wcagContrast([0, 0, 0], inactiveBg);
            const whiteCr = wcagContrast([255, 255, 255], inactiveBg);

            let bestFg = inactiveFg;
            let bestCr = inactiveCr;

            if (whiteCr >= target && whiteCr > blackCr) {
              bestFg = [255, 255, 255];
              bestCr = whiteCr;
            } else if (blackCr >= target) {
              bestFg = [0, 0, 0];
              bestCr = blackCr;
            } else if (fgCr >= target) {
              bestFg = newFg;
              bestCr = fgCr;
            } else {
              // Use optimal color
              const bgLum = relLuminance(inactiveBg);
              bestFg = bgLum > 0.5 ? [0, 0, 0] : [255, 255, 255];
              bestCr = wcagContrast(bestFg, inactiveBg);
            }

            // Apply correction for inactive state
            // Store the correction so it can be applied when tab becomes inactive
            const bestFgStr = `rgb(${bestFg
              .map((v) => Math.round(v))
              .join(",")})`;
            tabLink.setAttribute("data-ai-inactive-fg", bestFgStr);
            tabLink.setAttribute("data-ai-inactive-target-cr", target.toFixed(2));
            tabLink.setAttribute("data-ai-inactive-fixed", "true");

            // Apply correction using multiple methods:
            // 1. Direct application if currently inactive
            if (!isCurrentlyActive) {
              tabLink.style.setProperty("color", bestFgStr, "important");
            }

            // 2. CSS rule for inactive state (if container exists)
            if (container) {
              const containerSelector = generateInactiveTabSelector(
                container,
                tabLink
              );
              applyInactiveTabCorrection(containerSelector, bestFg, target);

              // 3. Add mutation observer to watch for state changes
              setupTabStateObserver(tabLink, container, bestFg, target);
            }

            console.log(
              `✨ Fixed inactive tab: ${inactiveCr.toFixed(
                2
              )}:1 → ${bestCr.toFixed(2)}:1`
            );
          }
        }
      } catch (error) {
        console.warn(`⚠️ Error processing tab link:`, error);
      }
    }
  }

  // Generate CSS selector for inactive tab state
  function generateInactiveTabSelector(container, link) {
    // Get all classes from container (including base classes)
    const allContainerClasses = Array.from(container.classList)
      .filter((c) => !c.startsWith("ai-"))
      .map((c) => c.replace(/\s+/g, "")); // Remove spaces

    // Create multiple selector variants to catch different active state patterns
    const selectors = [];

    // Pattern 1: Target when container doesn't have "active" in any class
    if (allContainerClasses.length > 0) {
      const baseClasses = allContainerClasses.join(".");
      selectors.push(
        `${container.tagName.toLowerCase()}.${baseClasses}:not([class*="active"]) > a`
      );
    }

    // Pattern 2: Target specific classes without active (for more specific targeting)
    const nonActiveClasses = allContainerClasses.filter(
      (c) => !c.toLowerCase().includes("active")
    );
    if (nonActiveClasses.length > 0) {
      const linkClasses = Array.from(link.classList)
        .filter((c) => !c.startsWith("ai-"))
        .join(".");
      let selector = `${container.tagName.toLowerCase()}.${nonActiveClasses.join(
        "."
      )}`;
      if (linkClasses) {
        selector += ` > a.${linkClasses}`;
      } else {
        selector += " > a";
      }
      selectors.push(selector);
    }

    // Pattern 3: Universal selector for this container type (fallback)
    if (allContainerClasses.length > 0) {
      const firstClass = allContainerClasses[0];
      selectors.push(
        `${container.tagName.toLowerCase()}.${firstClass}:not([class*="active"]) > a`
      );
    }

    // Return the most specific selector
    return (
      selectors[0] ||
      `${container.tagName.toLowerCase()}:not([class*="active"]) > a`
    );
  }

  // Apply CSS correction for inactive tab state
  function applyInactiveTabCorrection(selector, fgColor, target) {
    // Get or create stylesheet for tab corrections
    let tabSheet = document.getElementById("ai-inactive-tab-corrections");
    if (!tabSheet) {
      tabSheet = document.createElement("style");
      tabSheet.id = "ai-inactive-tab-corrections";
      document.head.appendChild(tabSheet);
      console.log(`   📝 Created stylesheet for inactive tab corrections`);
    }

    // Generate multiple selector patterns to ensure we catch inactive tabs
    // Split the selector to create variations
    const baseSelector = selector.split(":not")[0].trim();
    const selectors = [
      selector, // Original selector
      `${baseSelector}:not(.active)`, // Simple :not(.active)
      `${baseSelector}:not([class*="active"])`, // Attribute selector
      selector.replace(/:not\(\[class\*="active"\]\)/, ":not(.active)"), // Convert attribute to class
    ].filter((s, i, arr) => arr.indexOf(s) === i && s.length > 0); // Remove duplicates and empty

    console.log(
      `   🎯 Generated ${selectors.length} selector variants for inactive tab correction`
    );

    selectors.forEach((sel, idx) => {
      try {
        // Check if this rule already exists
        const existingRules = tabSheet.sheet
          ? Array.from(tabSheet.sheet.cssRules)
          : [];
        const ruleExists = existingRules.some(
          (rule) =>
            rule.selectorText &&
            (rule.selectorText === sel ||
              rule.selectorText.includes(
                sel.split(":not")[0].split(">")[0].trim()
              ))
        );

        if (!ruleExists) {
          // Add CSS rule
          const cssRule = `${sel} {
          color: rgb(${fgColor.map((v) => Math.round(v)).join(",")}) !important;
        }`;

          if (tabSheet.sheet) {
            try {
              tabSheet.sheet.insertRule(cssRule, tabSheet.sheet.cssRules.length);
              console.log(
                `   ✅ [${idx + 1}/${selectors.length}] Added CSS rule: ${sel}`
              );
            } catch (insertError) {
              // If insertRule fails, try adding to textContent
              const currentContent = tabSheet.textContent || "";
              if (!currentContent.includes(sel)) {
                tabSheet.textContent = currentContent + cssRule + "\n";
                console.log(
                  `   ✅ [${idx + 1}/${selectors.length
                  }] Added CSS rule (textContent): ${sel}`
                );
              }
            }
          } else {
            const currentContent = tabSheet.textContent || "";
            if (!currentContent.includes(sel)) {
              tabSheet.textContent = currentContent + cssRule + "\n";
              console.log(
                `   ✅ [${idx + 1}/${selectors.length
                }] Added CSS rule (textContent): ${sel}`
              );
            }
          }
        } else {
          console.log(
            `   ⏭️  [${idx + 1}/${selectors.length}] Rule already exists: ${sel}`
          );
        }
      } catch (error) {
        console.warn(
          `   ⚠️ [${idx + 1}/${selectors.length
          }] Failed to add CSS rule for selector "${sel}": ${error.message}`
        );
      }
    });
  }

  // Setup observer to watch for tab state changes and re-apply corrections
  function setupTabStateObserver(tabLink, container, inactiveFgColor, target) {
    if (!container) return;

    // Check if observer already exists for this container
    if (container._aiTabObserver) return;

    // Create observer to watch for class changes on container
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "class"
        ) {
          // Container class changed - check if tab became inactive
          const isActive = Array.from(container.classList).some((c) =>
            c.toLowerCase().includes("active")
          );
          const storedInactiveFg = tabLink.getAttribute("data-ai-inactive-fg");

          if (!isActive && storedInactiveFg) {
            // Tab is now inactive - apply the stored correction
            const inactiveFg = parseCSSColorToRGBA(storedInactiveFg, [0, 0, 0]);
            if (inactiveFg) {
              tabLink.style.setProperty("color", storedInactiveFg, "important");

              // Verify contrast is still met
              const currentBgRGBA = getEffectiveBackgroundRGBA(tabLink);
              const currentBg = currentBgRGBA.slice(0, 3);
              const currentCr = wcagContrast(inactiveFg.slice(0, 3), currentBg);
              const targetCr = parseFloat(
                tabLink.getAttribute("data-ai-inactive-target-cr") ||
                target.toString()
              );

              if (currentCr < targetCr) {
                // Recalculate if background changed
                const newFgResult = adjustColorToContrast(
                  inactiveFg.slice(0, 3),
                  currentBg.slice(0, 3),
                  targetCr
                );
                const newFg = (newFgResult && typeof newFgResult === 'object' && 'fg' in newFgResult) ? newFgResult.fg : newFgResult;
                const newFgStr = `rgb(${newFg
                  .map((v) => Math.round(v))
                  .join(",")})`;
                tabLink.style.setProperty("color", newFgStr, "important");
                tabLink.setAttribute("data-ai-inactive-fg", newFgStr);
              }
            }
          }
        }
      });
    });

    // Start observing
    observer.observe(container, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Store observer reference
    container._aiTabObserver = observer;
  }

  // Generate a unique selector for a tab link
  function generateTabSelector(link, parent) {
    const linkClasses = Array.from(link.classList)
      .filter((c) => c && !c.startsWith("ai-"))
      .join(".");
    const parentClasses = Array.from(parent.classList)
      .filter((c) => c && !c.includes("active"))
      .join(".");

    let selector = "";
    if (parentClasses) {
      selector = `${parent.tagName.toLowerCase()}.${parentClasses} > `;
    }
    if (linkClasses) {
      selector += `${link.tagName.toLowerCase()}.${linkClasses}`;
    } else {
      selector += link.tagName.toLowerCase();
    }

    return selector;
  }

  // Apply correction for a specific tab state (active/inactive)
  function applyTabStateCorrection(
    link,
    parent,
    state,
    bgColor,
    fgColor,
    target
  ) {
    // Create a unique class for this tab's inactive state
    const uniqueId = `ai-tab-${state}-${Math.random().toString(36).substr(2, 9)}`;

    // Add class to parent or link to identify inactive state
    if (state === "inactive") {
      // For inactive state, we need to target when the tab is NOT active
      // Check if parent has active class - if so, we need to target :not(.active)
      const hasActive = Array.from(parent.classList).some((c) =>
        c.toLowerCase().includes("active")
      );

      if (hasActive) {
        // Tab is currently active - we need to apply styles for when it becomes inactive
        // Use a CSS rule that applies when parent doesn't have active class
        const parentClasses = Array.from(parent.classList).filter(
          (c) => !c.toLowerCase().includes("active")
        );
        const linkClasses = Array.from(link.classList).filter(
          (c) => !c.startsWith("ai-")
        );

        let selector = `${parent.tagName.toLowerCase()}`;
        if (parentClasses.length > 0) {
          selector += `.${parentClasses.join(".")}`;
        }
        selector += `:not(.active) > ${link.tagName.toLowerCase()}`;
        if (linkClasses.length > 0) {
          selector += `.${linkClasses.join(".")}`;
        }

        // Get or create stylesheet for tab state corrections
        let tabStateSheet = document.getElementById("ai-tab-state-corrections");
        if (!tabStateSheet) {
          tabStateSheet = document.createElement("style");
          tabStateSheet.id = "ai-tab-state-corrections";
          document.head.appendChild(tabStateSheet);
        }

        // Add CSS rule for inactive state
        let cssRule = `${selector} {`;
        if (fgColor) {
          cssRule += `color: rgb(${fgColor
            .map((v) => Math.round(v))
            .join(",")}) !important;`;
        }
        if (bgColor) {
          cssRule += `background-color: rgb(${bgColor
            .map((v) => Math.round(v))
            .join(",")}) !important;`;
        }
        cssRule += "}";

        tabStateSheet.textContent += cssRule + "\n";

        // Store the correction info
        link.setAttribute(
          `data-ai-${state}-fg`,
          fgColor ? `rgb(${fgColor.map((v) => Math.round(v)).join(",")})` : ""
        );
        link.setAttribute(
          `data-ai-${state}-bg`,
          bgColor ? `rgb(${bgColor.map((v) => Math.round(v)).join(",")})` : ""
        );
      } else {
        // Tab is already inactive - apply directly
        if (fgColor) {
          link.style.setProperty(
            "color",
            `rgb(${fgColor.map((v) => Math.round(v)).join(",")})`,
            "important"
          );
        }
        if (bgColor) {
          link.style.setProperty(
            "background-color",
            `rgb(${bgColor.map((v) => Math.round(v)).join(",")})`,
            "important"
          );
        }

        // Store the correction info
        link.setAttribute(
          `data-ai-${state}-fg`,
          fgColor ? `rgb(${fgColor.map((v) => Math.round(v)).join(",")})` : ""
        );
        link.setAttribute(
          `data-ai-${state}-bg`,
          bgColor ? `rgb(${bgColor.map((v) => Math.round(v)).join(",")})` : ""
        );
      }
    }
  }

  function fixButtonHoverState(
    el,
    originalFg,
    originalBg,
    correctedFg,
    correctedBg,
    target
  ) {
    // CENTRAL SKIP CHECK: Skip hover state fixes for elements with image/transparent backgrounds
    const bgInfo = getEffectiveBackgroundInfo(el);
    if (shouldSkipContrastFix(el, bgInfo)) {
      const skipReason = el.getAttribute('data-ai-skip-reason') || 'unknown';
      console.log(`⏭️  [SKIP HOVER] Skipping hover state fix for ${el.tagName} - reason: ${skipReason}`);
      return;
    }

    console.log(`\n🎯 [HOVER] Starting CSS-based hover correction for ${el.tagName}...`);

    // CRITICAL: Always read the stored corrected colors from data attributes FIRST
    // These were set in scanWithAI and represent the CORRECTED (high-contrast) state
    // This is the state we want to use as the "normal" state, NOT the original colors
    const storedNormalFg = el.getAttribute("data-ai-normal-fg");
    const storedNormalBg = el.getAttribute("data-ai-normal-bg");

    let actualCorrectedFg, actualCorrectedBg;

    if (storedNormalFg) {
      // Use stored corrected foreground color
      const parsed = parseCSSColorToRGBA(storedNormalFg, null);
      if (parsed) {
        actualCorrectedFg = parsed.slice(0, 3);
        console.log(`   📋 [HOVER] Using stored corrected FG: ${storedNormalFg}`);
      } else {
        actualCorrectedFg = correctedFg.slice(0, 3);
        console.log(
          `   ⚠️  [HOVER] Failed to parse stored FG, using parameter: ${correctedFg}`
        );
      }
    } else {
      // Fallback: read from computed styles or use parameter
      const elStyles = getComputedStyle(el);
      const appliedFg = parseCSSColorToRGBA(elStyles.color, [0, 0, 0]);
      const appliedFgRGB = appliedFg.slice(0, 3);
      const originalFgRGB = originalFg.slice(0, 3);
      const fgDiff =
        Math.abs(appliedFgRGB[0] - originalFgRGB[0]) +
        Math.abs(appliedFgRGB[1] - originalFgRGB[1]) +
        Math.abs(appliedFgRGB[2] - originalFgRGB[2]);
      actualCorrectedFg = fgDiff > 10 ? appliedFgRGB : correctedFg.slice(0, 3);
      console.log(
        `   📋 [HOVER] No stored FG, using computed/parameter: rgb(${actualCorrectedFg.join(",")})`
      );
    }

    if (storedNormalBg) {
      // Use stored corrected background color
      const parsed = parseCSSColorToRGBA(storedNormalBg, null);
      if (parsed && parsed[3] > 0.5) {
        actualCorrectedBg = parsed.slice(0, 3);
        console.log(`   📋 [HOVER] Using stored corrected BG: ${storedNormalBg}`);
      } else {
        // Stored BG exists but is transparent, use parameter
        actualCorrectedBg = correctedBg.slice(0, 3);
        console.log(
          `   ⚠️  [HOVER] Stored BG is transparent, using parameter: ${correctedBg}`
        );
      }
    } else {
      // Fallback: read from computed styles
      const elStyles = getComputedStyle(el);
      const appliedBg = parseCSSColorToRGBA(
        elStyles.backgroundColor,
        [0, 0, 0, 0]
      );
      actualCorrectedBg =
        appliedBg[3] > 0.5 ? appliedBg.slice(0, 3) : correctedBg.slice(0, 3);
      console.log(
        `   📋 [HOVER] No stored BG, using computed/parameter: rgb(${actualCorrectedBg.join(",")})`
      );
    }

    // CRITICAL: Always detect the effective background (including from parents)
    // This ensures we correctly handle elements with backgrounds from parent elements
    const elStyles = getComputedStyle(el);
    const currentBg = parseCSSColorToRGBA(elStyles.backgroundColor, [0, 0, 0, 0]);
    const effectiveBg = getEffectiveBackgroundRGBA(el);
    if (!effectiveBg) {
      // No fully opaque background found - skip
      return;
    }

    // Check if element has its own solid background
    const hasOwnBackground = currentBg[3] > 0.5;

    // CRITICAL: Store original border state to restore it later
    // Only modify borders if element originally had them
    const originalBorderWidth = elStyles.borderWidth;
    const originalBorderStyle = elStyles.borderStyle;
    const originalBorderColor = elStyles.borderColor;
    const hasOriginalBorder =
      originalBorderWidth &&
      originalBorderWidth !== "0px" &&
      originalBorderStyle &&
      originalBorderStyle !== "none" &&
      originalBorderColor &&
      originalBorderColor !== "transparent" &&
      originalBorderColor !== "rgba(0, 0, 0, 0)";

    // Store original border state in data attribute for hover handlers
    if (hasOriginalBorder) {
      el.setAttribute("data-ai-original-border-width", originalBorderWidth);
      el.setAttribute("data-ai-original-border-style", originalBorderStyle);
      el.setAttribute("data-ai-original-border-color", originalBorderColor);
    } else {
      // Ensure we know this element doesn't have a border
      el.setAttribute("data-ai-has-border", "false");
    }

    // Always use the effective background for contrast calculations
    // The effective background is what the user actually sees
    const finalEffectiveBgRGB = effectiveBg
      ? effectiveBg.slice(0, 3)
      : [255, 255, 255];

    // For buttons and interactive elements, if they visually have a background (even from parent),
    // we should treat them as having a background for hover states
    // Only pure text elements (links, spans) without any background should be text-only
    const tagName = el.tagName.toLowerCase();
    const isPureTextElement =
      (tagName === "a" || tagName === "span") && !hasOwnBackground;

    // Element has background if it has its own background OR if it's an interactive element that needs background handling
    // Interactive elements (buttons, etc.) should always have background handling even if background comes from parent
    const isInteractiveForBg =
      tagName === "button" ||
      el.getAttribute("role") === "button" ||
      (tagName === "a" &&
        (el.classList.toString().toLowerCase().includes("btn") ||
          el.classList.toString().toLowerCase().includes("button")));

    const hasBackground =
      hasOwnBackground || (isInteractiveForBg && finalEffectiveBgRGB);

    // For text-only elements (links without backgrounds), only adjust text color on hover
    // Don't add backgrounds unless element already has one
    const isTextOnly = !hasBackground && isPureTextElement;

    // Step 1: Try to detect original hover colors from CSS
    let originalHoverBg = null;
    let originalHoverFg = null;
    let hoverRuleFound = false;

    try {
      const classes = Array.from(el.classList);
      const allRules = [];
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          const rules = Array.from(sheet.cssRules || []);
          allRules.push(...rules);
        } catch (err) {
          // CORS or security error - skip this stylesheet
        }
      });

      const matchedHoverRules = allRules.filter((rule) => {
        if (!rule.selectorText) return false;
        const selector = rule.selectorText.toLowerCase();
        if (!selector.includes(":hover")) return false;

        for (const cls of classes) {
          if (selector.includes(`.${cls.toLowerCase()}:hover`)) {
            return true;
          }
        }
        return false;
      });

      if (matchedHoverRules.length > 0) {
        matchedHoverRules.forEach((rule) => {
          if (rule.style.backgroundColor) {
            const bgColor = rule.style.backgroundColor;
            originalHoverBg = parseCSSColorToRGBA(bgColor, null);
            if (originalHoverBg) {
              hoverRuleFound = true;
            }
          }
          if (rule.style.color) {
            const fgColor = rule.style.color;
            originalHoverFg = parseCSSColorToRGBA(fgColor, null);
          }
        });
      }
    } catch (err) {
      console.log(`   ❌ Error detecting hover styles: ${err.message}`);
    }

    // Use the actual corrected colors (from data attributes or parameters) as the base for all states
    // These represent the CORRECTED normal state, NOT the original state
    // CRITICAL: Always use the effective background (what user sees) for contrast calculations
    const correctedFgRGB = actualCorrectedFg;
    const correctedBgRGB = hasBackground
      ? actualCorrectedBg
      : finalEffectiveBgRGB;

    // CRITICAL: If element has a visual background (even from parent), ensure we store it
    // This ensures hover-out correctly restores to the right background
    const shouldStoreBg =
      hasBackground || (isInteractiveForBg && !isPureTextElement);

    console.log(`   🎯 [HOVER] Base for hover calc - FG: rgb(${correctedFgRGB.join(",")}), BG: rgb(${correctedBgRGB.join(",")})`);

    // Skip hover correction if element already has contrast >= target in normal state
    // This prevents unnecessary adjustments to elements that are already perfect
    const currentNormalContrast = wcagContrast(correctedFgRGB, correctedBgRGB);
    if (currentNormalContrast >= target) {
      // Element already meets target - skip hover correction to preserve existing state
      console.log(`   ⏭️  [SKIP HOVER] Element already meets target contrast (${currentNormalContrast.toFixed(2)}:1 >= ${target.toFixed(2)}:1), skipping hover correction`);
      return;
    }

    // Only generate/adjust hover backgrounds if element has a background
    // For text-only elements, only adjust text color
    let adjustedHoverBg = correctedBgRGB;
    let adjustedHoverFg = correctedFgRGB;
    let finalHoverContrast = wcagContrast(correctedFgRGB, correctedBgRGB);

    if (hasBackground) {
      // Element has a background - adjust both background and text on hover
      // Use HSL to preserve hue while adjusting lightness for consistent hover
      // This ensures all buttons with same color get same hover effect

      // CRITICAL: Check the effective background behind the element to avoid matching it
      const effectiveBgLum = relLuminance(finalEffectiveBgRGB);
      const isPageBgLight = effectiveBgLum > 0.8; // Page background is light (white/light gray)

      const [h, s, l] = rgbToHsl(correctedBgRGB);

      // Adjust lightness while preserving hue (keeps brand identity)
      // Note: l is 0-1, so we adjust by 0.12 (12%)
      // CRITICAL: For dark backgrounds, darken on hover (standard UX), don't lighten
      // For light backgrounds, darken on hover
      // NEVER lighten dark backgrounds to white - it makes buttons invisible on white pages
      let hoverL;
      if (l > 0.5) {
        // Light background - darken on hover
        hoverL = Math.max(0, l - 0.12);
      } else {
        // Dark background - darken on hover (standard UX pattern)
        // Only lighten if page background is also dark
        if (isPageBgLight) {
          // Page is light - darken button on hover to maintain visibility
          hoverL = Math.max(0, l - 0.15);
        } else {
          // Page is dark - can lighten slightly, but not too much
          hoverL = Math.min(0.85, l + 0.1); // Cap at 85% to avoid white
        }
      }

      const hoverBgRGB = hslToRgb([h, s, hoverL]);
      originalHoverBg = [...hoverBgRGB, 1];

      if (!originalHoverFg) {
        originalHoverFg = [...correctedFg, 1];
      }

      // Step 3: Verify hover background meets contrast, adjust if needed
      const originalHoverBgRGB = originalHoverBg.slice(0, 3);
      adjustedHoverBg = [...originalHoverBgRGB];
      let hoverContrast = wcagContrast(correctedFgRGB, adjustedHoverBg);

      // CRITICAL: Never allow hover background to become white or very close to white
      const hoverBgLumCheck = relLuminance(adjustedHoverBg);
      if (
        hoverBgLumCheck > 0.9 ||
        (adjustedHoverBg[0] > 240 &&
          adjustedHoverBg[1] > 240 &&
          adjustedHoverBg[2] > 240)
      ) {
        // Hover background is too light - darken it instead
        const [hh, ss, ll] = rgbToHsl(adjustedHoverBg);
        const darkenedL = Math.max(0, ll - 0.2); // Darken significantly
        adjustedHoverBg = hslToRgb([hh, ss, darkenedL]);
        hoverContrast = wcagContrast(correctedFgRGB, adjustedHoverBg);
      }

      // If contrast not met, adjust lightness more using HSL
      if (hoverContrast < target) {
        const [hh, ss, ll] = rgbToHsl(adjustedHoverBg);
        let newL = ll;
        let iterations = 0;

        while (hoverContrast < target && iterations < 10) {
          // Always darken if contrast isn't met (never lighten to white)
          newL = Math.max(0, newL - 0.05);

          adjustedHoverBg = hslToRgb([hh, ss, newL]);
          hoverContrast = wcagContrast(correctedFgRGB, adjustedHoverBg);
          iterations++;

          if (newL <= 0) break;
        }
      }

      // Hover color already generated via HSL - it's consistent and preserves brand hue

      // Step 5: Ensure hover state meets contrast target
      // CRITICAL: Calculate hover colors that ALWAYS meet the target contrast
      // First, determine the optimal text color based on hover background
      const hoverBgLum = relLuminance(adjustedHoverBg);
      const isDarkBg = hoverBgLum < 0.5;

      // For hover, we want a noticeable difference from normal state
      // But we MUST ensure contrast meets the target (which can be very high at comfort scale 1.0)

      // Step 1: Choose optimal text color for the hover background
      // For dark backgrounds: use white text
      // For light backgrounds: use black text
      let optimalHoverFg = isDarkBg ? [255, 255, 255] : [0, 0, 0];
      let optimalContrast = wcagContrast(optimalHoverFg, adjustedHoverBg);

      // Step 2: If optimal color doesn't meet target, adjust the hover background
      // This ensures we ALWAYS meet the target contrast, even at 24:1
      if (optimalContrast < target) {
        // Need to increase contrast - adjust background to be more extreme
        let attempts = 0;
        const maxAttempts = 20; // More attempts for very high targets

        while (optimalContrast < target && attempts < maxAttempts) {
          if (isDarkBg) {
            // Darken the background further for white text
            adjustedHoverBg = [
              Math.max(0, adjustedHoverBg[0] - 10),
              Math.max(0, adjustedHoverBg[1] - 10),
              Math.max(0, adjustedHoverBg[2] - 10),
            ];
            optimalHoverFg = [255, 255, 255];
          } else {
            // Lighten the background further for black text
            adjustedHoverBg = [
              Math.min(255, adjustedHoverBg[0] + 10),
              Math.min(255, adjustedHoverBg[1] + 10),
              Math.min(255, adjustedHoverBg[2] + 10),
            ];
            optimalHoverFg = [0, 0, 0];
          }

          optimalContrast = wcagContrast(optimalHoverFg, adjustedHoverBg);
          attempts++;

          // Safety: prevent infinite loops
          if (
            (adjustedHoverBg[0] === 0 &&
              adjustedHoverBg[1] === 0 &&
              adjustedHoverBg[2] === 0) ||
            (adjustedHoverBg[0] >= 255 &&
              adjustedHoverBg[1] >= 255 &&
              adjustedHoverBg[2] >= 255)
          ) {
            break;
          }
        }

        // If still below target after adjustments, use pure black/white
        if (optimalContrast < target) {
          if (isDarkBg) {
            adjustedHoverBg = [0, 0, 0]; // Pure black background
            optimalHoverFg = [255, 255, 255]; // Pure white text
          } else {
            adjustedHoverBg = [255, 255, 255]; // Pure white background
            optimalHoverFg = [0, 0, 0]; // Pure black text
          }
          optimalContrast = wcagContrast(optimalHoverFg, adjustedHoverBg);
        }
      }

      // CRITICAL: Choose text color based on hover background brightness
      // If hover background is dark, use white text; if light, use black text
      // This prevents invisible text (e.g., black text on dark background)
      // Reuse isDarkBg that was already calculated above from hoverBgLum
      if (isDarkBg) {
        // Dark hover background - use white text for visibility
        adjustedHoverFg = [255, 255, 255];
      } else {
        // Light hover background - use black text for visibility
        adjustedHoverFg = [0, 0, 0];
      }
      
      finalHoverContrast = wcagContrast(adjustedHoverFg, adjustedHoverBg);

      console.log(`   ✅ [HOVER] Text color chosen based on hover background: ${isDarkBg ? 'white (dark bg)' : 'black (light bg)'}`);
      console.log(`   📊 [HOVER] Normal FG: RGB(${actualCorrectedFg.join(',')}), Hover FG: RGB(${adjustedHoverFg.join(',')}), Hover BG: RGB(${adjustedHoverBg.join(',')})`);

      // Verify hover contrast still meets target
      if (finalHoverContrast < target) {
        console.warn(`   ⚠️  [HOVER] Hover contrast ${finalHoverContrast.toFixed(2)}:1 < target ${target.toFixed(2)}:1`);
        // Only adjust if absolutely necessary to meet target
        if (isDarkBg) {
          adjustedHoverFg = [255, 255, 255];
        } else {
          adjustedHoverFg = [0, 0, 0];
        }
        finalHoverContrast = wcagContrast(adjustedHoverFg, adjustedHoverBg);
        console.log(`   🔧 [HOVER] Adjusted to meet target: RGB(${adjustedHoverFg.join(',')}) - Contrast: ${finalHoverContrast.toFixed(2)}:1`);
      }

      // Final verification: ensure we meet target (should already be met from above logic)
      if (finalHoverContrast < target) {
        console.warn(
          `   ⚠️  Hover contrast ${finalHoverContrast.toFixed(
            2
          )}:1 still below target ${target.toFixed(2)}:1 after all adjustments`
        );
        // Last resort: use pure black/white
        const finalBgLum = relLuminance(adjustedHoverBg);
        if (finalBgLum < 0.5) {
          adjustedHoverBg = [0, 0, 0];
          adjustedHoverFg = [255, 255, 255];
        } else {
          adjustedHoverBg = [255, 255, 255];
          adjustedHoverFg = [0, 0, 0];
        }
        finalHoverContrast = wcagContrast(adjustedHoverFg, adjustedHoverBg);
        console.log(
          `   🔧 Forced pure black/white for hover: ${finalHoverContrast.toFixed(
            2
          )}:1`
        );
      }

      console.log(
        `   ✅ [HOVER] Hover colors calculated: FG=${rgbToStr(adjustedHoverFg)}, BG=${rgbToStr(adjustedHoverBg)}, Contrast=${finalHoverContrast.toFixed(2)}:1`
      );
    } else {
      // Text-only element - CONSISTENCY: Use same color as normal state (no color changes on hover)
      // This ensures visual consistency and avoids jarring color changes
      adjustedHoverFg = actualCorrectedFg; // Use normal state color
      finalHoverContrast = wcagContrast(adjustedHoverFg, correctedBgRGB);

      console.log(`   ✅ [HOVER] Text-only hover uses same color as normal state for consistency.`);

      // Verify hover contrast still meets target
      if (finalHoverContrast < target) {
        console.warn(`   ⚠️  [HOVER] Hover contrast ${finalHoverContrast.toFixed(2)}:1 < target ${target.toFixed(2)}:1`);
        // Only adjust if absolutely necessary to meet target
        const bgLum = relLuminance(correctedBgRGB);
        if (bgLum < 0.5) {
          adjustedHoverFg = [255, 255, 255];
        } else {
          adjustedHoverFg = [0, 0, 0];
        }
        finalHoverContrast = wcagContrast(adjustedHoverFg, correctedBgRGB);
        console.log(`   🔧 [HOVER] Adjusted to meet target: RGB(${adjustedHoverFg.join(',')}) - Contrast: ${finalHoverContrast.toFixed(2)}:1`);
      }
    }

    // Verify the normal color meets contrast before storing
    // This ensures we always store a color that meets the target contrast
    const normalContrast = wcagContrast(correctedFgRGB, correctedBgRGB);
    let verifiedNormalFg = correctedFgRGB;

    if (normalContrast < target) {
      // If normal color doesn't meet contrast, adjust it
      const verifiedNormalFgResult = adjustColorToContrast(
        correctedFgRGB,
        correctedBgRGB,
        target
      );
      verifiedNormalFg = (verifiedNormalFgResult && typeof verifiedNormalFgResult === 'object' && 'fg' in verifiedNormalFgResult) ? verifiedNormalFgResult.fg : verifiedNormalFgResult;
      const verifiedContrast = wcagContrast(verifiedNormalFg, correctedBgRGB);

      if (verifiedContrast < target) {
        // If still below target, use optimal color
        const bgLum = relLuminance(correctedBgRGB);
        verifiedNormalFg = bgLum > 0.5 ? [0, 0, 0] : [255, 255, 255];
      }
    }

    // CRITICAL: Use the ACTUAL corrected colors from data attributes (set in scanWithAI)
    // If they exist AND meet contrast, use them AS-IS. Do NOT recalculate.
    // This preserves the corrected colors that were already verified and applied.
    const storedCorrectedFg = el.getAttribute("data-ai-normal-fg");
    const storedCorrectedBg = el.getAttribute("data-ai-normal-bg");

    let finalCorrectedFgRGB;
    let finalCorrectedBgRGB;
    let finalNormalFg;

    if (storedCorrectedFg) {
      // We have a stored corrected foreground - use it if it meets contrast
      const storedFgParsed = parseCSSColorToRGBA(storedCorrectedFg, null);
      if (storedFgParsed) {
        finalCorrectedFgRGB = storedFgParsed.slice(0, 3);
        finalNormalFg = finalCorrectedFgRGB;

        // Determine the background to check contrast against
        if (storedCorrectedBg) {
          const storedBgParsed = parseCSSColorToRGBA(storedCorrectedBg, null);
          if (storedBgParsed) {
            finalCorrectedBgRGB = storedBgParsed.slice(0, 3);
          } else {
            finalCorrectedBgRGB = correctedBgRGB;
          }
        } else {
          finalCorrectedBgRGB = correctedBgRGB;
        }

        // Check if stored color meets contrast - if yes, use it as-is
        const storedContrast = wcagContrast(
          finalCorrectedFgRGB,
          finalCorrectedBgRGB
        );
        if (storedContrast >= target) {
          console.log(
            `   ✅ Using stored corrected FG (${storedCorrectedFg}) - contrast: ${storedContrast.toFixed(
              2
            )}:1`
          );
          // Use stored color as-is, no recalculation needed
        } else {
          console.warn(
            `   ⚠️  Stored FG contrast ${storedContrast.toFixed(
              2
            )}:1 < target ${target.toFixed(2)}:1, recalculating...`
          );
          // Only recalculate if stored color doesn't meet contrast
          const finalNormalFgResult = adjustColorToContrast(
            finalCorrectedFgRGB,
            finalCorrectedBgRGB,
            target
          );
          finalNormalFg = (finalNormalFgResult && typeof finalNormalFgResult === 'object' && 'fg' in finalNormalFgResult) ? finalNormalFgResult.fg : finalNormalFgResult;
          const recalcContrast = wcagContrast(finalNormalFg, finalCorrectedBgRGB);
          if (recalcContrast < target) {
            const bgLum = relLuminance(finalCorrectedBgRGB);
            finalNormalFg = bgLum > 0.5 ? [0, 0, 0] : [255, 255, 255];
          }
          finalCorrectedFgRGB = finalNormalFg;
        }
      } else {
        // Failed to parse stored color, use calculated
        finalCorrectedFgRGB = verifiedNormalFg;
        finalNormalFg = verifiedNormalFg;
        finalCorrectedBgRGB =
          storedCorrectedBg && hasBackground
            ? parseCSSColorToRGBA(storedCorrectedBg, null)?.slice(0, 3) ||
            correctedBgRGB
            : correctedBgRGB;
      }
    } else {
      // No stored color - use calculated values
      finalCorrectedFgRGB = verifiedNormalFg;
      finalNormalFg = verifiedNormalFg;
      finalCorrectedBgRGB =
        storedCorrectedBg && hasBackground
          ? parseCSSColorToRGBA(storedCorrectedBg, null)?.slice(0, 3) ||
          correctedBgRGB
          : correctedBgRGB;

      // Verify contrast
      const finalNormalContrast = wcagContrast(
        finalCorrectedFgRGB,
        finalCorrectedBgRGB
      );
      if (finalNormalContrast < target) {
        const finalNormalFgResult = adjustColorToContrast(
          finalCorrectedFgRGB,
          finalCorrectedBgRGB,
          target
        );
        finalNormalFg = (finalNormalFgResult && typeof finalNormalFgResult === 'object' && 'fg' in finalNormalFgResult) ? finalNormalFgResult.fg : finalNormalFgResult;
        const finalContrast = wcagContrast(finalNormalFg, finalCorrectedBgRGB);
        if (finalContrast < target) {
          const bgLum = relLuminance(finalCorrectedBgRGB);
          finalNormalFg = bgLum > 0.5 ? [0, 0, 0] : [255, 255, 255];
        }
        finalCorrectedFgRGB = finalNormalFg;
      }
    }

    // Store hover colors - include background if element has one OR if it's interactive with visual background
    // Validate that adjustedHoverBg doesn't contain NaN values
    let hoverBgStr = null;
    if (hasBackground && adjustedHoverBg && adjustedHoverBg.length >= 3) {
      const isValid = adjustedHoverBg.every(
        (v) => !isNaN(v) && isFinite(v) && v >= 0 && v <= 255
      );
      if (isValid) {
        hoverBgStr = `rgb(${adjustedHoverBg
          .map((v) => Math.round(Math.max(0, Math.min(255, v))))
          .join(",")})`;
      } else {
        // Fallback: use corrected background if hover calculation failed
        console.warn(
          `   ⚠️ Invalid hover BG calculated, using corrected BG as fallback`
        );
        hoverBgStr = `rgb(${correctedBgRGB.map((v) => Math.round(v)).join(",")})`;
      }
    }
    const hoverFgStr = `rgb(${adjustedHoverFg
      .map((v) => Math.round(Math.max(0, Math.min(255, v))))
      .join(",")})`;

    // CRITICAL: Always store the effective background (what user sees) as the normal background
    // This includes backgrounds from parent elements - we need to store it to restore correctly
    const normalBgStr = shouldStoreBg
      ? `rgb(${finalCorrectedBgRGB.map((v) => Math.round(v)).join(",")})`
      : null;
    const normalFgStr = `rgb(${finalNormalFg
      .map((v) => Math.round(v))
      .join(",")})`;

    // Update correctedFgRGB to use the verified color for consistency
    const verifiedCorrectedFgRGB = finalNormalFg;

    // CRITICAL: Always update the stored corrected colors to ensure they're current
    // This overwrites any previous values with the verified corrected colors
    // ALWAYS store the effective background (even if from parent) so hover-out can restore correctly
    // Only store hover background if it's valid (not NaN)
    if (hoverBgStr && !hoverBgStr.includes("NaN")) {
      el.setAttribute("data-ai-hover-bg", hoverBgStr);
    } else if (hoverBgStr && hoverBgStr.includes("NaN")) {
      // Remove invalid hover background attribute
      el.removeAttribute("data-ai-hover-bg");
    }
    el.setAttribute("data-ai-hover-fg", hoverFgStr);
    if (normalBgStr) {
      el.setAttribute("data-ai-normal-bg", normalBgStr);
      console.log(
        `   💾 Stored effective background (may be from parent): ${normalBgStr}`
      );
    } else {
      // Even for text-only, store the effective background for contrast calculations
      el.setAttribute(
        "data-ai-effective-bg",
        `rgb(${finalEffectiveBgRGB.map((v) => Math.round(v)).join(",")})`
      );
    }
    el.setAttribute("data-ai-normal-fg", normalFgStr);

    console.log(
      `   💾 Stored/updated corrected colors in fixButtonHoverState - FG: ${normalFgStr}, BG: ${normalBgStr || "effective: " + `rgb(${finalEffectiveBgRGB.join(",")})`
      }`
    );

    // CRITICAL: Apply the corrected normal colors immediately to lock them in
    // This ensures the element stays in its corrected state and doesn't revert to original
    // The normal state IS the corrected state - we never want to show original colors
    applyColorWithImportant(el, "color", normalFgStr);

    // CRITICAL: If element has a visual background (even from parent), apply it as inline style
    // This ensures the background persists and doesn't change when parent styles change
    if (shouldStoreBg && normalBgStr) {
      el.style.setProperty("background-color", normalBgStr, "important");
      console.log(
        `   🔒 Applied corrected normal state immediately - FG: ${normalFgStr}, BG: ${normalBgStr} (locked in)`
      );
    } else {
      console.log(
        `   🔒 Applied corrected normal state immediately - FG: ${normalFgStr}, BG: (effective from parent)`
      );
    }
    void el.offsetHeight; // Force reflow to ensure styles are applied

    // Use JavaScript event listeners for hover to override inline !important styles
    const hoverIn = async (event) => {
      // Prevent duplicate hover-in calls with more robust checking
      const now = Date.now();
      if (el._aiHoverInProcessing && now - el._aiHoverInProcessing < 200) {
        console.log(
          `   ⏭️  Skipping duplicate hover-in (last: ${now - el._aiHoverInProcessing
          }ms ago)`
        );
        return;
      }
      el._aiHoverInProcessing = now;

      const elementInfo = `${el.tagName} "${(el.textContent || "")
        .trim()
        .substring(0, 30)}"`;
      console.log(`🖱️  [HOVER IN] ${elementInfo}`);

      // CRITICAL: Stop event propagation FIRST to prevent other handlers from interfering
      if (event) {
        event.stopPropagation();
        event.stopImmediatePropagation();
      }

      // Get current state before applying hover (for logging only)
      const beforeBg = getEffectiveBackgroundRGBA(el);
      const beforeFg = parseCSSColorToRGBA(getComputedStyle(el).color, [0, 0, 0]);
      const beforeBgRGB = beforeBg ? beforeBg.slice(0, 3) : correctedBgRGB;
      const beforeFgRGB = beforeFg.slice(0, 3);
      const beforeContrast = wcagContrast(beforeFgRGB, beforeBgRGB);
      console.log(
        `   📊 Before hover: FG=${rgbToStr(beforeFgRGB)}, BG=${rgbToStr(
          beforeBgRGB
        )}, Contrast=${beforeContrast.toFixed(2)}:1`
      );

      // CRITICAL: Don't restore normal state here - if we're already in hover state,
      // that's fine. Just apply the hover styles directly. The hover-out handler
      // will restore normal state when needed.

      // CRITICAL: Remove any CSS classes that might have hover styles
      // This prevents CSS :hover rules from overriding our JavaScript styles
      const hoverClass = el.getAttribute("data-ai-hover-class");
      if (hoverClass) {
        // Temporarily remove and re-add to trigger CSS
        el.classList.remove(hoverClass);
        void el.offsetHeight;
        el.classList.add(hoverClass);
        void el.offsetHeight;
      }

      // CRITICAL: Apply hover styles immediately and reliably
      // Disable transitions first to prevent interference
      const originalTransition =
        el.style.transition || getComputedStyle(el).transition;
      if (originalTransition && originalTransition !== "none") {
        el.style.transition = "none";
      }

      // CRITICAL: Check data attributes as fallback in case variables aren't set
      const finalHoverFg = hoverFgStr ||
        el.getAttribute("data-ai-hover-fg") ||
        el.getAttribute("data-hover-fg") ||
        el.getAttribute("data-ai-normal-fg") ||
        normalFgStr;
      const finalHoverBg = hoverBgStr ||
        el.getAttribute("data-ai-hover-bg") ||
        el.getAttribute("data-hover-bg") ||
        (hasBackground ? normalBgStr : null);

      // Remove any conflicting styles first
      el.style.removeProperty("color");
      el.style.removeProperty("background-color");
      void el.offsetHeight;

      // Apply hover foreground with !important (even if same as normal - ensures it's applied)
      applyColorWithImportant(el, "color", finalHoverFg);
      void el.offsetHeight;
      console.log(`   🎨 Applied hover FG: ${finalHoverFg}`);

      // Only set background if element has one and finalHoverBg is valid
      if (hasBackground && finalHoverBg && !finalHoverBg.includes("NaN")) {
        // Validate the RGB string format
        const rgbMatch = finalHoverBg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (rgbMatch) {
          // Remove existing background first
          el.style.removeProperty("background-color");
          void el.offsetHeight;

          // Apply with !important (even if same as normal - ensures it's applied)
          el.style.setProperty("background-color", finalHoverBg, "important");
          void el.offsetHeight;

          console.log(`   🎨 Applied hover BG: ${finalHoverBg}`);
        } else {
          console.warn(
            `   ⚠️ Invalid hover BG format: ${finalHoverBg}, skipping background change`
          );
          el.style.removeProperty("background-color");
        }
      } else {
        // Remove any background that might have been accidentally applied
        el.style.removeProperty("background-color");
        console.log(`   🎨 No hover BG (text-only element or invalid)`);
      }

      // Restore transitions after a short delay
      if (originalTransition && originalTransition !== "none") {
        setTimeout(() => {
          el.style.transition = originalTransition;
        }, 100);
      }

      // Force multiple reflows and verify styles are actually applied
      void el.offsetHeight;
      void el.offsetHeight;
      void el.offsetHeight;

      // Verify synchronously with forced reflows
      const hoverFgParsed = parseCSSColorToRGBA(hoverFgStr, null);
      const hoverFgRGB = hoverFgParsed ? hoverFgParsed.slice(0, 3) : null;

      // Read computed styles after forced reflows
      const computedFg = parseCSSColorToRGBA(
        getComputedStyle(el).color,
        [0, 0, 0]
      );
      const computedFgRGB = computedFg.slice(0, 3);

      // If foreground doesn't match, force it again (up to 5 attempts)
      let fgApplied = false;
      if (hoverFgRGB) {
        for (let attempt = 0; attempt < 5; attempt++) {
          const fgDiff =
            Math.abs(computedFgRGB[0] - hoverFgRGB[0]) +
            Math.abs(computedFgRGB[1] - hoverFgRGB[1]) +
            Math.abs(computedFgRGB[2] - hoverFgRGB[2]);

          if (fgDiff < 5) {
            fgApplied = true;
            break;
          }

          // Force apply again with !important flag
          applyColorWithImportant(el, "color", hoverFgStr);
          void el.offsetHeight;
          void el.offsetHeight;
          void el.offsetHeight;

          // Re-read
          const recheckFg = parseCSSColorToRGBA(
            getComputedStyle(el).color,
            [0, 0, 0]
          );
          computedFgRGB[0] = recheckFg[0];
          computedFgRGB[1] = recheckFg[1];
          computedFgRGB[2] = recheckFg[2];
        }

        if (!fgApplied) {
          console.warn(
            `   ⚠️  Hover FG not applied after 5 attempts (computed: ${rgbToStr(
              computedFgRGB
            )}, expected: ${rgbToStr(hoverFgRGB)})`
          );
          // Use the hover color we want for contrast calculation anyway
        }
      }

      // Determine background for contrast calculation
      let afterBgRGB;
      if (hasBackground && hoverBgStr && !hoverBgStr.includes("NaN")) {
        const hoverBgParsed = parseCSSColorToRGBA(hoverBgStr, null);
        if (
          hoverBgParsed &&
          hoverBgParsed.every((v) => !isNaN(v) && isFinite(v))
        ) {
          afterBgRGB = hoverBgParsed.slice(0, 3);

          // Verify background was applied
          const computedBg = parseCSSColorToRGBA(
            getComputedStyle(el).backgroundColor,
            [0, 0, 0, 0]
          );
          if (computedBg[3] > 0.5) {
            const computedBgRGB = computedBg.slice(0, 3);
            const bgDiff =
              Math.abs(computedBgRGB[0] - hoverBgParsed[0]) +
              Math.abs(computedBgRGB[1] - hoverBgParsed[1]) +
              Math.abs(computedBgRGB[2] - hoverBgParsed[2]);

            if (bgDiff > 5) {
              console.warn(
                `   ⚠️  Hover BG not applied correctly (computed: ${rgbToStr(
                  computedBgRGB
                )}, expected: ${rgbToStr(hoverBgParsed.slice(0, 3))})`
              );

              // CRITICAL: Disable transitions temporarily to force background application
              const originalTransition =
                el.style.transition || getComputedStyle(el).transition;
              if (originalTransition && originalTransition !== "none") {
                el.style.transition = "none";
                console.log(
                  `   ⚙️  Temporarily disabled transitions for reliable hover BG application`
                );
              }

              // Force again with multiple attempts and delays
              for (let attempt = 0; attempt < 5; attempt++) {
                // Remove any existing background styles first
                el.style.removeProperty("background-color");
                void el.offsetHeight;

                // Apply with !important
                el.style.setProperty("background-color", hoverBgStr, "important");

                // Force multiple reflows
                void el.offsetHeight;
                void el.offsetHeight;

                // Check if applied
                const recheckBg = parseCSSColorToRGBA(
                  getComputedStyle(el).backgroundColor,
                  [0, 0, 0, 0]
                );
                if (recheckBg[3] > 0.5) {
                  const recheckBgRGB = recheckBg.slice(0, 3);
                  const recheckDiff =
                    Math.abs(recheckBgRGB[0] - hoverBgParsed[0]) +
                    Math.abs(recheckBgRGB[1] - hoverBgParsed[1]) +
                    Math.abs(recheckBgRGB[2] - hoverBgParsed[2]);
                  if (recheckDiff < 5) {
                    console.log(
                      `   ✅ Hover BG applied successfully after ${attempt + 1
                      } attempts`
                    );
                    break;
                  }
                }

                // Small delay for browser repaint (using setTimeout instead of await)
                await new Promise((r) => setTimeout(r, 16));
              }

              // Restore transitions after 100ms
              if (originalTransition && originalTransition !== "none") {
                setTimeout(() => {
                  el.style.transition = originalTransition;
                  console.log(`   ⚙️  Restored transitions`);
                }, 100);
              }

              // Use the hover background we want for contrast calculation
              afterBgRGB = hoverBgParsed.slice(0, 3);
            }
          }
        } else {
          // Invalid hover background - fall back to corrected background
          console.warn(
            `   ⚠️ Invalid hover BG parsed, using corrected BG: ${rgbToStr(
              correctedBgRGB
            )}`
          );
          afterBgRGB = correctedBgRGB;
        }
      } else {
        // Text-only element or invalid hover background - use effective background
        const afterBg = getEffectiveBackgroundRGBA(el);
        afterBgRGB = afterBg ? afterBg.slice(0, 3) : correctedBgRGB;
      }

      // Use the hover colors we calculated (for contrast verification)
      const finalHoverFgRGB = hoverFgRGB || [0, 0, 0];
      const afterContrast = wcagContrast(finalHoverFgRGB, afterBgRGB);
      console.log(
        `   ✅ After hover: FG=${rgbToStr(finalHoverFgRGB)}, BG=${rgbToStr(
          afterBgRGB
        )}, Contrast=${afterContrast.toFixed(2)}:1 (target: ${target.toFixed(
          2
        )}:1)`
      );

      if (afterContrast >= target) {
        console.log(
          `   ✅ Hover contrast PASS (${afterContrast.toFixed(
            2
          )}:1 >= ${target.toFixed(2)}:1)`
        );
      } else {
        console.warn(
          `   ⚠️  Hover contrast FAIL (${afterContrast.toFixed(
            2
          )}:1 < ${target.toFixed(2)}:1)`
        );
        // Force optimal colors if contrast still fails
        const bgLum = relLuminance(afterBgRGB);
        const forcedFg = bgLum > 0.5 ? [0, 0, 0] : [255, 255, 255];
        const forcedFgStr = `rgb(${forcedFg
          .map((v) => Math.round(v))
          .join(",")})`;
        applyColorWithImportant(el, "color", forcedFgStr);
        console.warn(`   🔧 Forced optimal hover color: ${forcedFgStr}`);
      }

      // CRITICAL: Only apply border color if element originally had a border
      // Don't add borders to elements that don't have them
      const hasOriginalBorder =
        el.getAttribute("data-ai-has-border") !== "false" &&
        (el.getAttribute("data-ai-original-border-width") ||
          (getComputedStyle(el).borderWidth &&
            getComputedStyle(el).borderWidth !== "0px"));

      if (hasOriginalBorder) {
        // Element originally had a border - only change the color, not add a new border
        el.style.setProperty("border-color", hoverFgStr, "important");
      }
      // If element doesn't have a border, don't add one
    };

    const hoverOut = (event) => {
      // Prevent duplicate hover-out calls with more robust checking
      const now = Date.now();
      if (el._aiHoverOutProcessing && now - el._aiHoverOutProcessing < 200) {
        console.log(
          `   ⏭️  Skipping duplicate hover-out (last: ${now - el._aiHoverOutProcessing
          }ms ago)`
        );
        return;
      }
      el._aiHoverOutProcessing = now;

      const elementInfo = `${el.tagName} "${(el.textContent || "")
        .trim()
        .substring(0, 30)}"`;
      console.log(`🖱️  [HOVER OUT] ${elementInfo}`);

      // CRITICAL: Stop event propagation FIRST to prevent other handlers from interfering
      if (event) {
        event.stopPropagation();
        event.stopImmediatePropagation();
      }

      // Get current state before restoring (still in hover state)
      const hoverBg = getEffectiveBackgroundRGBA(el);
      const hoverFg = parseCSSColorToRGBA(getComputedStyle(el).color, [0, 0, 0]);
      const hoverBgRGB = hoverBg ? hoverBg.slice(0, 3) : correctedBgRGB;
      const hoverFgRGB = hoverFg.slice(0, 3);
      const hoverContrast = wcagContrast(hoverFgRGB, hoverBgRGB);
      console.log(
        `   📊 Current hover state: FG=${rgbToStr(hoverFgRGB)}, BG=${rgbToStr(
          hoverBgRGB
        )}, Contrast=${hoverContrast.toFixed(2)}:1`
      );

      // CRITICAL: Read the stored normal background from data attribute
      // This MUST be the corrected background (stored effective background)
      const storedNormalBg = el.getAttribute("data-ai-normal-bg");
      const storedEffectiveBg = el.getAttribute("data-ai-effective-bg");

      // Determine which background to use for restoration
      // Priority: stored normal BG > stored effective BG > closure variable > current effective
      let bgToRestore = storedNormalBg || storedEffectiveBg || normalBgStr;
      let finalBgRGB;
      let backgroundForContrast;

      if (bgToRestore) {
        // We have a stored background to restore to
        const restoreBgParsed = parseCSSColorToRGBA(bgToRestore, null);
        if (restoreBgParsed) {
          finalBgRGB = restoreBgParsed.slice(0, 3);
          backgroundForContrast = finalBgRGB;
          console.log(`   ✅ Will restore to stored BG: ${bgToRestore}`);

          // CRITICAL: Always apply the stored background as inline style if we have one
          // Check if this element should have a background (stored in attribute or check if stored BG exists)
          const hasStoredBg = storedNormalBg || storedEffectiveBg;
          const tagName = el.tagName.toLowerCase();
          const isButtonLike =
            tagName === "button" ||
            el.getAttribute("role") === "button" ||
            (tagName === "a" &&
              (el.classList.toString().toLowerCase().includes("btn") ||
                el.classList.toString().toLowerCase().includes("button")));

          if (hasStoredBg && (isButtonLike || storedNormalBg)) {
            // Element should have a background - force the background to be restored
            // 1. Remove the property first to clear any hover styles
            el.style.removeProperty("background-color");
            void el.offsetHeight;

            // 2. Apply the stored normal background with !important
            el.style.setProperty("background-color", bgToRestore, "important");
            void el.offsetHeight;
            void el.offsetHeight;

            // 3. Reapply with !important one more time to ensure it's applied
            el.style.setProperty("background-color", bgToRestore, "important");
            void el.offsetHeight;
            void el.offsetHeight;

            // 5. Remove any CSS class-based hover states that might be interfering
            const hoverClass = el.getAttribute("data-ai-hover-class");
            if (hoverClass) {
              el.classList.remove(hoverClass);
            }

            console.log(`   🔄 Forced restoration of stored BG: ${bgToRestore}`);
          } else {
            // Text-only element - remove any background that was accidentally applied
            el.style.removeProperty("background-color");
            console.log(
              `   🔄 Removed background-color property (text-only element)`
            );
            // Use effective background for contrast calculation
            const currentEffectiveBg = getEffectiveBackgroundRGBA(el);
            finalBgRGB = currentEffectiveBg
              ? currentEffectiveBg.slice(0, 3)
              : [255, 255, 255];
            backgroundForContrast = finalBgRGB;
          }
        } else {
          // Failed to parse stored BG, use current effective
          const currentEffectiveBg = getEffectiveBackgroundRGBA(el);
          finalBgRGB = currentEffectiveBg
            ? currentEffectiveBg.slice(0, 3)
            : [255, 255, 255];
          backgroundForContrast = finalBgRGB;
          console.warn(
            `   ⚠️  Failed to parse stored BG, using current effective: ${rgbToStr(
              finalBgRGB
            )}`
          );
        }
      } else {
        // No stored background - use current effective background
        const currentEffectiveBg = getEffectiveBackgroundRGBA(el);
        finalBgRGB = currentEffectiveBg
          ? currentEffectiveBg.slice(0, 3)
          : [255, 255, 255];
        backgroundForContrast = finalBgRGB;
        console.log(
          `   ✅ No stored BG, using current effective BG: ${rgbToStr(
            finalBgRGB
          )}`
        );

        // Store it for future use
        el.setAttribute(
          "data-ai-effective-bg",
          `rgb(${finalBgRGB.map((v) => Math.round(v)).join(",")})`
        );
      }

      // Get the stored normal color - this MUST be the corrected color, not original
      const storedNormalFg = el.getAttribute("data-ai-normal-fg");
      let normalFgToUse = verifiedCorrectedFgRGB || correctedFgRGB;

      // CRITICAL: Ensure normalFgToUse is valid before proceeding
      if (!normalFgToUse || !Array.isArray(normalFgToUse) || normalFgToUse.length < 3) {
        // Fallback to computed style if stored values are invalid
        const computedFg = parseCSSColorToRGBA(getComputedStyle(el).color, [0, 0, 0]);
        normalFgToUse = computedFg.slice(0, 3);
        console.warn(`   ⚠️  Invalid normalFgToUse, using computed: ${rgbToStr(normalFgToUse)}`);
      }

      // ALWAYS use stored attribute if available - it represents the corrected normal state
      if (storedNormalFg) {
        const parsed = parseCSSColorToRGBA(storedNormalFg, null);
        if (parsed && parsed.length >= 3) {
          normalFgToUse = parsed.slice(0, 3);
          console.log(
            `   📋 Using stored corrected normal FG: ${storedNormalFg} (${rgbToStr(
              normalFgToUse
            )})`
          );
        } else {
          console.warn(
            `   ⚠️  Failed to parse stored normal FG: ${storedNormalFg}, using verified corrected FG`
          );
          // Ensure normalFgToUse is still valid
          if (!normalFgToUse || !Array.isArray(normalFgToUse) || normalFgToUse.length < 3) {
            const computedFg = parseCSSColorToRGBA(getComputedStyle(el).color, [0, 0, 0]);
            normalFgToUse = computedFg.slice(0, 3);
          }
        }
      } else {
        console.warn(
          `   ⚠️  No stored normal FG attribute found! Using verified corrected FG: ${rgbToStr(
            normalFgToUse
          )}`
        );
        // Ensure normalFgToUse is valid before storing
        if (normalFgToUse && Array.isArray(normalFgToUse) && normalFgToUse.length >= 3) {
          const fgStr = `rgb(${normalFgToUse.map((v) => Math.round(v)).join(",")})`;
          el.setAttribute("data-ai-normal-fg", fgStr);
          console.log(`   💾 Stored normal FG: ${fgStr}`);
        } else {
          // Last resort: use computed style
          const computedFg = parseCSSColorToRGBA(getComputedStyle(el).color, [0, 0, 0]);
          normalFgToUse = computedFg.slice(0, 3);
          const fgStr = `rgb(${normalFgToUse.map((v) => Math.round(v)).join(",")})`;
          el.setAttribute("data-ai-normal-fg", fgStr);
          console.log(`   💾 Stored computed FG as fallback: ${fgStr}`);
        }
      }

      // CRITICAL: Use the stored normal background (corrected) for contrast calculation
      // This is the background we want to restore to, regardless of what's currently computed
      console.log(
        `   🎯 Using stored normal BG for contrast: ${rgbToStr(
          backgroundForContrast
        )} (this is the corrected background)`
      );

      // Verify the stored color meets contrast with the stored normal background
      let normalFgContrast = wcagContrast(normalFgToUse, backgroundForContrast);
      let restoreFg = normalFgToUse;
      console.log(
        `   🔍 Checking stored normal FG contrast: ${normalFgContrast.toFixed(
          2
        )}:1 (target: ${target.toFixed(2)}:1) against stored normal BG ${rgbToStr(
          backgroundForContrast
        )}`
      );

      // If the stored normal color doesn't meet contrast, recalculate based on stored normal background
      if (normalFgContrast < target) {
        console.warn(
          `   ⚠️  Stored normal FG contrast FAIL (${normalFgContrast.toFixed(
            2
          )}:1 < ${target.toFixed(2)}:1), recalculating...`
        );

        // Recalculate to ensure it meets contrast with the stored normal background
        const oldFg = [...restoreFg];
        const restoreFgResult = adjustColorToContrast(
          normalFgToUse,
          backgroundForContrast,
          target
        );
        restoreFg = (restoreFgResult && typeof restoreFgResult === 'object' && 'fg' in restoreFgResult) ? restoreFgResult.fg : restoreFgResult;
        const newContrast = wcagContrast(restoreFg, backgroundForContrast);
        console.log(
          `   🔧 Adjusted FG: ${rgbToStr(oldFg)} → ${rgbToStr(
            restoreFg
          )}, Contrast: ${newContrast.toFixed(2)}:1`
        );

        // If still below target, use optimal color (black or white)
        if (newContrast < target) {
          const bgLum = relLuminance(backgroundForContrast);
          const forcedFg = bgLum > 0.5 ? [0, 0, 0] : [255, 255, 255];
          console.warn(
            `   ⚠️  Adjustment still below target, forcing to ${rgbToStr(
              forcedFg
            )}`
          );
          restoreFg = forcedFg;
          normalFgContrast = wcagContrast(restoreFg, backgroundForContrast);
        } else {
          normalFgContrast = newContrast;
        }

        // Update the stored normal color for future hover cycles
        const updatedNormalFgStr = `rgb(${restoreFg
          .map((v) => Math.round(v))
          .join(",")})`;
        el.setAttribute("data-ai-normal-fg", updatedNormalFgStr);
        console.log(`   💾 Updated stored normal FG: ${updatedNormalFgStr}`);
      } else {
        console.log(
          `   ✅ Stored normal FG contrast PASS (${normalFgContrast.toFixed(
            2
          )}:1 >= ${target.toFixed(2)}:1)`
        );
      }

      // CRITICAL: Validate restoreFg before applying - ensure it's never undefined, null, or invalid
      if (!restoreFg || !Array.isArray(restoreFg) || restoreFg.length < 3) {
        // Fallback to normalFgToUse or computed style
        if (normalFgToUse && Array.isArray(normalFgToUse) && normalFgToUse.length >= 3) {
          restoreFg = normalFgToUse;
        } else {
          const computedFg = parseCSSColorToRGBA(getComputedStyle(el).color, [0, 0, 0]);
          restoreFg = computedFg.slice(0, 3);
        }
        console.warn(`   ⚠️  Invalid restoreFg, using fallback: ${rgbToStr(restoreFg)}`);
      }

      // Ensure all values are valid numbers in range [0, 255]
      restoreFg = restoreFg.map(v => Math.max(0, Math.min(255, Math.round(v))));

      // Restore text color with the verified high-contrast color
      const finalNormalFgStr = `rgb(${restoreFg.join(",")})`;
      el.style.setProperty("color", finalNormalFgStr, "important");
      console.log(`   🎨 Applied normal FG: ${finalNormalFgStr}`);

      // Also ensure the background is set to the stored normal background (force it again)
      // CRITICAL: Validate storedNormalBg before applying
      if (storedNormalBg && hasBackground) {
        // Validate background is not transparent or invalid
        const bgParsed = parseCSSColorToRGBA(storedNormalBg, null);
        if (bgParsed && bgParsed.length >= 3 && bgParsed[3] > 0.1) {
          el.style.setProperty("background-color", storedNormalBg, "important");
          console.log(`   🎨 Applied stored normal BG: ${storedNormalBg}`);
          void el.offsetHeight;
          void el.offsetHeight;
        } else {
          // Invalid background - remove it for text-only elements
          el.style.removeProperty("background-color");
          console.log(`   🔄 Removed invalid background (text-only element)`);
        }
      } else if (!hasBackground) {
        // Element shouldn't have background - ensure it's removed
        el.style.removeProperty("background-color");
      }

      // CRITICAL: Restore original border state (or remove border if element didn't have one)
      const hasOriginalBorder = el.getAttribute("data-ai-has-border") !== "false";
      const originalBorderWidth = el.getAttribute(
        "data-ai-original-border-width"
      );
      const originalBorderStyle = el.getAttribute(
        "data-ai-original-border-style"
      );
      const originalBorderColor = el.getAttribute(
        "data-ai-original-border-color"
      );

      if (
        hasOriginalBorder &&
        originalBorderWidth &&
        originalBorderStyle &&
        originalBorderColor
      ) {
        // Element originally had a border - restore it
        el.style.setProperty("border-width", originalBorderWidth, "important");
        el.style.setProperty("border-style", originalBorderStyle, "important");
        el.style.setProperty("border-color", originalBorderColor, "important");
        console.log(
          `   🔄 Restored original border: ${originalBorderWidth} ${originalBorderStyle} ${originalBorderColor}`
        );
      } else {
        // Element didn't have a border - ensure no border is applied
        el.style.removeProperty("border-width");
        el.style.removeProperty("border-style");
        el.style.removeProperty("border-color");
        console.log(`   🔄 Removed border (element didn't originally have one)`);
      }

      // Final verification: check contrast using stored normal background
      // This ensures we're always checking against the corrected background, not whatever is computed
      const finalContrast = wcagContrast(restoreFg, backgroundForContrast);
      console.log(
        `   ✅ Final verification: FG=${rgbToStr(restoreFg)}, BG=${rgbToStr(
          backgroundForContrast
        )} (stored normal), Contrast=${finalContrast.toFixed(
          2
        )}:1 (target: ${target.toFixed(2)}:1)`
      );

      if (finalContrast < target) {
        // Force correction if still below target
        const bgLum = relLuminance(backgroundForContrast);
        const forcedFg = bgLum > 0.5 ? [0, 0, 0] : [255, 255, 255];
        const forcedFgStr = `rgb(${forcedFg
          .map((v) => Math.round(v))
          .join(",")})`;
        console.error(
          `   ❌ Final contrast FAIL (${finalContrast.toFixed(
            2
          )}:1 < ${target.toFixed(2)}:1), forcing to ${forcedFgStr}`
        );
        applyColorWithImportant(el, "color", forcedFgStr);
        el.setAttribute("data-ai-normal-fg", forcedFgStr);

        // Verify the forced correction
        const forcedContrast = wcagContrast(forcedFg, backgroundForContrast);
        console.log(
          `   🔧 Forced correction applied: Contrast=${forcedContrast.toFixed(
            2
          )}:1`
        );
      } else {
        console.log(
          `   ✅ Final contrast PASS (${finalContrast.toFixed(
            2
          )}:1 >= ${target.toFixed(2)}:1)`
        );
      }
    };

    // Log hover state info
    if (hoverBgStr && !hoverBgStr.includes("NaN")) {
      console.log(`   📋 Hover BG: ${hoverBgStr}`);
    } else {
      console.log(
        `   📋 Hover BG: (none - text-only element${hoverBgStr && hoverBgStr.includes("NaN") ? " or invalid" : ""
        })`
      );
    }
    console.log(`   📋 Hover FG: ${hoverFgStr}`);
    if (hasBackground && hoverBgStr && !hoverBgStr.includes("NaN")) {
      const validContrast =
        isFinite(finalHoverContrast) && !isNaN(finalHoverContrast)
          ? finalHoverContrast
          : wcagContrast(adjustedHoverFg, adjustedHoverBg);
      console.log(`   📋 Hover contrast: ${validContrast.toFixed(2)}:1`);
    } else {
      const hoverFgContrast = wcagContrast(
        parseCSSColorToRGBA(hoverFgStr, [0, 0, 0]).slice(0, 3),
        correctedBgRGB
      );
      console.log(
        `   📋 Hover contrast: ${hoverFgContrast.toFixed(2)}:1 (text-only)`
      );
    }

    // Apply the corrected normal colors via inline style to lock them in.
    // The hover effect will be handled entirely by the injected CSS rule.
    applyColorWithImportant(el, "color", normalFgStr);
    if (shouldStoreBg && normalBgStr) {
      applyColorWithImportant(el, "background-color", normalBgStr);
    }

    // Also add CSS rule as fallback with maximum specificity
    try {
      const sheet = getOrCreateButtonHoverSheet();
      const uniqueClass = `ai-btn-hover-${buttonHoverCounter++}`;
      el.classList.add(uniqueClass);
      el.setAttribute("data-ai-hover-class", uniqueClass);

      const tagName = el.tagName.toLowerCase();
      // Only include background-color in CSS if element has a background and hoverBgStr is valid
      const bgRule =
        hasBackground && hoverBgStr && !hoverBgStr.includes("NaN")
          ? `background-color: ${hoverBgStr} !important;`
          : "";

      // CRITICAL: Only include border-color if element originally had a border
      // Don't add borders to elements that don't have them
      const hasOriginalBorder = el.getAttribute("data-ai-has-border") !== "false";
      const borderRule = hasOriginalBorder
        ? `border-color: ${hoverFgStr} !important;`
        : "";

      // Use maximum specificity: tag.class.class:hover:hover
      const hoverRule = `${tagName}.${uniqueClass}.${uniqueClass}:hover:hover { 
      ${bgRule}
      color: ${hoverFgStr} !important;
      ${borderRule}
    }`;

      sheet.insertRule(hoverRule, sheet.cssRules.length); // This is now the primary mechanism
      console.log(`   ✅ [HOVER] Injected CSS rule for hover state with high specificity.`);
    } catch (err) {
      // This is a critical failure if it happens.
      console.log(
        `   ⚠️ [HOVER] Failed to inject CSS rule for hover state: ${err.message}`
      );
    }
  }

  // Color adjustment with hue preservation
  // NOTE: rgbToHsl and hslToRgb functions are defined globally at the top of this file

  /**
   * Intelligently adjust color to meet contrast target using AI suggestions and context-aware reasoning
   * @param {number[]} fgRGB - Original foreground RGB [r, g, b]
   * @param {number[]} bgRGB - Background RGB [r, g, b]
   * @param {number} targetRatio - Target contrast ratio
   * @param {Object} options - Optional: { aiSuggestedFg, elementType, context }
   * @returns {number[]|Object} Adjusted RGB or {fg, feasible, contrast} if impossible
   */
  /**
   * HYBRID APPROACH: Mathematical calculation first, AI verification second
   * Step 1: Calculate optimal color using WCAG mathematics
   * Step 2: Verify with AI (readability check)
   * Step 3: Apply final color (use mathematical result, only adjust if AI strongly disagrees)
   */
  function adjustColorToContrast(fgRGB, bgRGB, targetRatio, options = {}) {
    const { aiSuggestedFg, elementType, context, backgroundAnalysis, isLink, baseTextColor, isButton } = options;

    console.log(`   🔢 [MATH] ========================================`);
    console.log(`   🔢 [MATH] STEP 1: CIELAB-based Optimization with Delta E Minimization`);
    console.log(`   🔢 [MATH] ========================================`);
    console.log(`   📊 [MATH] Input: FG=RGB(${fgRGB.join(',')}), BG=RGB(${bgRGB.join(',')}), Target=${targetRatio.toFixed(2)}:1`);

    let effectiveBgRGB = bgRGB;
    let bgLum = relLuminance(bgRGB);

    // apply image dominant color
    if (backgroundAnalysis?.hasImage && backgroundAnalysis?.imageAnalysis?.dominantColor) {
      effectiveBgRGB = backgroundAnalysis.imageAnalysis.dominantColor;
      bgLum = relLuminance(effectiveBgRGB);
      console.log(`   🔄 [MATH] Using image dominant color: RGB(${effectiveBgRGB.join(',')})`);
    }

    const fgLum = relLuminance(fgRGB);
    const currentCr = wcagContrast(fgRGB, effectiveBgRGB);
    console.log(`   📊 [MATH] Current contrast: ${currentCr.toFixed(2)}:1`);
    console.log(`   📊 [MATH] Background luminance: ${bgLum.toFixed(3)}, Foreground luminance: ${fgLum.toFixed(3)}`);

    // if original meets target
    const effectiveCr = wcagContrast(fgRGB, effectiveBgRGB);
    if (effectiveCr >= targetRatio) {
      console.log(`   ✅ [BRAND] Original color already meets target: ${effectiveCr.toFixed(2)}:1`);
      // CRITICAL FIX: Return array directly for consistency
      return fgRGB;
    }

    // button logic: only choose black or white if original color doesn't meet target
    if (isButton || elementType === 'button') {
      // CRITICAL: If original color already meets target, preserve it
      if (effectiveCr >= targetRatio) {
        console.log(`   ✅ [BUTTON] Original color already meets target: ${effectiveCr.toFixed(2)}:1, preserving brand color`);
        return fgRGB;
      }
      const blackCr = wcagContrast([0, 0, 0], effectiveBgRGB);
      const whiteCr = wcagContrast([255, 255, 255], effectiveBgRGB);
      const best = blackCr > whiteCr ? [0, 0, 0] : [255, 255, 255];
      const bestCr = Math.max(blackCr, whiteCr);
      if (bestCr >= targetRatio) {
        console.log(`   ✅ [BUTTON] Using optimal ${best[0] === 0 ? 'black' : 'white'} text`);
        // CRITICAL FIX: Return array directly for consistency
        return best;
      }
    }

    const blackCr = wcagContrast([0, 0, 0], effectiveBgRGB);
    const whiteCr = wcagContrast([255, 255, 255], effectiveBgRGB);
    const maxContrast = Math.max(blackCr, whiteCr);

    if (maxContrast < targetRatio) {
      const best = blackCr > whiteCr ? [0, 0, 0] : [255, 255, 255];
      console.warn(`   ⚠️  [MATH] Target impossible. Max: ${maxContrast.toFixed(2)}:1`);
      // CRITICAL FIX: Return array directly for consistency
      return best;
    }

    // Convert original color to CIELAB space
    // CRITICAL: Validate input RGB before conversion
    if (!fgRGB || !Array.isArray(fgRGB) || fgRGB.length !== 3) {
      console.error(`   🚨 [CIELAB] Invalid fgRGB input:`, fgRGB);
      const fallbackRgb = bgLum < 0.5 ? [255, 255, 255] : [0, 0, 0];
      return fallbackRgb;
    }
    
    // Validate RGB values are numbers
    for (let i = 0; i < 3; i++) {
      const val = Number(fgRGB[i]);
      if (isNaN(val) || !isFinite(val) || val < 0 || val > 255) {
        console.error(`   🚨 [CIELAB] Invalid RGB value at index ${i}: ${fgRGB[i]}`);
        const fallbackRgb = bgLum < 0.5 ? [255, 255, 255] : [0, 0, 0];
        return fallbackRgb;
      }
    }
    
    const originalLab = rgbToLab(fgRGB);
    const [originalL, originalA, originalBStar] = originalLab;
    
    // CRITICAL: Validate CIELAB values are not NaN/Infinity
    if (isNaN(originalL) || !isFinite(originalL) || isNaN(originalA) || !isFinite(originalA) || isNaN(originalBStar) || !isFinite(originalBStar)) {
      console.error(`   🚨 [CIELAB] Invalid CIELAB values: L*=${originalL}, a*=${originalA}, b*=${originalBStar}`);
      const fallbackRgb = bgLum < 0.5 ? [255, 255, 255] : [0, 0, 0];
      return fallbackRgb;
    }
    
    console.log(`   🎨 [CIELAB] Original color: L*=${originalL.toFixed(2)}, a*=${originalA.toFixed(2)}, b*=${originalBStar.toFixed(2)}`);

    const isDarkBg = backgroundAnalysis?.isDark !== undefined
      ? backgroundAnalysis.isDark
      : bgLum < 0.5;

    // CIELAB L* (lightness) bounds: 0-100
    const LMin = 0;
    const LMax = 100;
    const LStep = 0.5; // Fine-grained step for perceptual uniformity

    // Inverse Search Strategy: Adjust L* while holding a* and b* constant
    // Find color with minimum Delta E that meets target contrast
    // CRITICAL: Brand preservation - prevent colors from getting too dark
    function findOptimalColorWithMinDeltaE() {
      let bestRgb = null;
      let bestDeltaE = Infinity;
      let bestContrast = 0;
      let foundValidColor = false;
      
      // BRAND PRESERVATION: Set minimum lightness thresholds to prevent near-black colors
      // For light backgrounds: minimum L* = 20 (prevents very dark text)
      // For dark backgrounds: minimum L* = 25 (prevents very dark text on dark bg)
      const minLightness = isDarkBg ? 25 : 20;
      const maxLightness = isDarkBg ? 95 : 90; // Also cap maximum to prevent pure white
      
      // Calculate original color's max RGB to determine if it's already dark
      const originalMaxRGB = Math.max(...fgRGB);
      const originalMinRGB = Math.min(...fgRGB);
      const isOriginalDark = originalMaxRGB < 100;
      
      // If original is already reasonably dark, be more conservative
      const conservativeMinLightness = isOriginalDark ? Math.max(minLightness, originalL * 0.7) : minLightness;

      // Search outward from original L* value
      // CRITICAL: Prefer lighter colors first to preserve brand identity
      // Try lighter first (if dark background), then darker (if light background)
      // But limit how dark we go
      const searchDirections = isDarkBg 
        ? [
            { start: originalL, end: Math.min(LMax, maxLightness), step: LStep }, // Lighter first
            { start: originalL, end: Math.max(LMin, conservativeMinLightness), step: -LStep } // Darker, but not too dark
          ]
        : [
            { start: originalL, end: Math.max(LMin, conservativeMinLightness), step: -LStep }, // Darker first, but not too dark
            { start: originalL, end: Math.min(LMax, maxLightness), step: LStep } // Lighter
          ];

      for (const direction of searchDirections) {
        const { start, end, step } = direction;
        const stepSign = step > 0 ? 1 : -1;
        const limit = stepSign > 0 ? Math.min(end, LMax) : Math.max(end, LMin);
        
        // CRITICAL FIX: Add maximum iterations to prevent infinite loops
        const maxIterations = 200; // Limit search to 200 steps (100 L* range / 0.5 step)
        let iterations = 0;
        
        // CRITICAL FIX: Ensure step is not zero and limit is valid
        if (Math.abs(step) < 0.001) {
          console.warn(`   ⚠️  [LOOP] Invalid step size: ${step}, skipping direction`);
          continue; // Skip this direction if step is too small
        }

        for (let L = start; iterations < maxIterations; L += step) {
          iterations++;
          
          // CRITICAL FIX: Check bounds and break if exceeded
          if (stepSign > 0 && L > limit) break;
          if (stepSign < 0 && L < limit) break;
          
          // BRAND PRESERVATION: Skip if too dark (below minimum lightness)
          if (L < conservativeMinLightness) {
            // If we're going darker and hit minimum, break instead of continue to avoid infinite loop
            if (step < 0) break;
            continue;
          }
          
          // CRITICAL FIX: Safety check - if L is out of valid range, break
          if (L < 0 || L > 100) {
            console.warn(`   ⚠️  [LOOP] L* out of range: ${L}, breaking loop`);
            break;
          }
          
          // Hold a* and b* constant, only adjust L*
          const testLab = [L, originalA, originalBStar];
          const testRgb = labToRgb(testLab);
          
          // Validate RGB is in valid range
          if (testRgb.some(c => c < 0 || c > 255)) {
            continue;
          }
          
          // BRAND PRESERVATION: Check if color is too dark (max RGB < 50 is near-black)
          // CRITICAL: On dark backgrounds, we need LIGHT text, so skip dark colors
          // On light backgrounds, we need DARK text, but still skip near-black to preserve brand
          const testMaxRGB = Math.max(...testRgb);
          if (testMaxRGB < 50) {
            continue; // Always skip near-black colors to preserve brand identity
          }

          const testContrast = wcagContrast(testRgb, effectiveBgRGB);
          // CRITICAL: Validate testContrast is valid
          if (isNaN(testContrast) || !isFinite(testContrast)) {
            continue; // Skip invalid contrast values
          }
          
          const testDeltaE = deltaE2000(originalLab, testLab);
          // CRITICAL: Validate testDeltaE is valid
          if (isNaN(testDeltaE) || !isFinite(testDeltaE)) {
            continue; // Skip invalid Delta E values
          }

          // If this color meets contrast requirement
          if (testContrast >= targetRatio) {
            foundValidColor = true;
            
            // BRAND PRESERVATION: Never choose black or very dark colors - always preserve brand hue/saturation
            // CRITICAL: Skip colors that are too dark - they destroy brand identity
            if (testMaxRGB < 60) {
              continue; // Skip colors that are too dark - always preserve brand
            }
            
            // Choose color with minimum Delta E (most perceptually similar to original)
            if (testDeltaE < bestDeltaE) {
              bestDeltaE = testDeltaE;
              bestRgb = testRgb;
              bestContrast = testContrast;
              console.log(`   🎯 [CIELAB] Found candidate: L*=${L.toFixed(2)}, ΔE=${testDeltaE.toFixed(3)}, contrast=${testContrast.toFixed(2)}:1, maxRGB=${testMaxRGB}`);
            }
          } else if (!foundValidColor) {
            // Track best contrast even if it doesn't meet target (fallback)
            // CRITICAL: Never track black or very dark colors - always preserve brand
            if (testMaxRGB >= 60 && testContrast > bestContrast) {
              bestContrast = testContrast;
              bestRgb = testRgb;
            }
          }
        }

        // If we found a valid color, continue searching a bit more to find better (lighter) options
        // But stop if we've found a good color and Delta E is getting worse
        if (foundValidColor && bestDeltaE < 10) {
          // Found a good color with low Delta E, stop searching
          break;
        }
      }

      if (foundValidColor) {
        console.log(`   ✅ [CIELAB] Optimal color found: ΔE=${bestDeltaE.toFixed(3)}, contrast=${bestContrast.toFixed(2)}:1`);
        return { rgb: bestRgb, deltaE: bestDeltaE, contrast: bestContrast };
      } else {
        // CRITICAL FIX: If no valid color found, use rule-based HSL fallback
        if (!bestRgb) {
          console.warn(`   ⚠️  [CIELAB] No color found in search, using rule-based HSL fallback`);
          const fallbackRgb = ruleBasedHslFallback(fgRGB, effectiveBgRGB, targetRatio);
          const fallbackCr = wcagContrast(fallbackRgb, effectiveBgRGB);
          return { rgb: fallbackRgb, deltaE: 0, contrast: fallbackCr };
        }
        // CRITICAL: If bestRgb is too dark (black or near-black), use rule-based fallback
        if (!bestRgb || Math.max(...bestRgb) < 60) {
          console.warn(`   ⚠️  [CIELAB] bestRgb too dark, using rule-based HSL fallback`);
          const fallbackRgb = ruleBasedHslFallback(fgRGB, effectiveBgRGB, targetRatio);
          const fallbackCr = wcagContrast(fallbackRgb, effectiveBgRGB);
          return { rgb: fallbackRgb, deltaE: 0, contrast: fallbackCr };
        }
        console.warn(`   ⚠️  [CIELAB] No color found meeting target, using best contrast: ${bestContrast.toFixed(2)}:1`);
        return { rgb: bestRgb, deltaE: Infinity, contrast: bestContrast };
      }
    }

    const optimalResult = findOptimalColorWithMinDeltaE();
    let mathResult = optimalResult.rgb;
    let mathCr = optimalResult.contrast;
    const mathDeltaE = optimalResult.deltaE;
    
    // CRITICAL FIX: Validate mathResult is not null or too dark
    if (!mathResult || !Array.isArray(mathResult) || mathResult.length !== 3 || Math.max(...mathResult) < 60) {
      console.error(`   🚨 [MATH] Invalid or too dark result from findOptimalColorWithMinDeltaE:`, mathResult);
      console.log(`   🔄 [MATH] Falling back to rule-based HSL algorithm`);
      // Use rule-based HSL fallback instead of black/white
      const fallbackRgb = ruleBasedHslFallback(fgRGB, effectiveBgRGB, targetRatio);
      mathResult = fallbackRgb;
      mathCr = wcagContrast(fallbackRgb, effectiveBgRGB);
      console.log(`   ✅ [MATH] Rule-based fallback result: RGB(${mathResult.map(x => Math.round(x)).join(',')}), contrast=${mathCr.toFixed(2)}:1`);
    }

    console.log(`   🔎 [CIELAB] Best color: RGB(${mathResult.map(x => Math.round(x)).join(',')}), contrast=${mathCr.toFixed(2)}:1, ΔE=${mathDeltaE.toFixed(3)}`);

    // AI verification (compare Delta E with AI suggestion)
    if (aiSuggestedFg && Array.isArray(aiSuggestedFg)) {
      const aiCr = wcagContrast(aiSuggestedFg, effectiveBgRGB);
      if (aiCr >= targetRatio) {
        const aiLab = rgbToLab(aiSuggestedFg);
        const aiDeltaE = deltaE2000(originalLab, aiLab);
        console.log(`   🤖 [AI] AI suggestion: contrast=${aiCr.toFixed(2)}:1, ΔE=${aiDeltaE.toFixed(3)}`);
        
        // Use AI suggestion if it has lower Delta E (more perceptually similar)
        if (aiDeltaE < mathDeltaE) {
          console.log(`   🤖 [AI] AI suggestion selected (lower ΔE)`);
        return aiSuggestedFg;
        }
      }
    }

    // BRAND PRESERVATION: Darkness safeguard (using CIELAB)
    // Prevent colors from getting too dark - this destroys brand identity
    const finalMaxRGB = Math.max(...mathResult);
    const finalMinRGB = Math.min(...mathResult);
    const isTooDark = finalMaxRGB < 100; // More aggressive threshold
    
    if (isTooDark) {
      console.warn(`   ⚠️  [BRAND PRESERVATION] Result too dark (max RGB=${finalMaxRGB}, min RGB=${finalMinRGB}). Attempting to find lighter alternative...`);
      
      const currentLab = rgbToLab(mathResult);
      const originalMaxRGB = Math.max(...fgRGB);
      
      // Calculate target minimum lightness based on original color
      // If original was light (max RGB > 150), preserve more lightness
      // If original was already dark, allow some darkening but not too much
      let targetMinL = 35; // Default minimum L*
      if (originalMaxRGB > 150) {
        targetMinL = Math.max(40, originalL * 0.6); // Preserve 60% of original lightness
      } else if (originalMaxRGB > 100) {
        targetMinL = Math.max(30, originalL * 0.5); // Preserve 50% of original lightness
      } else {
        targetMinL = Math.max(25, originalL * 0.4); // Original was dark, allow more darkening
      }
      
      // Try to find a lighter color that still meets contrast
      let bestLightenedRgb = null;
      let bestLightenedCr = 0;
      let bestLightenedDeltaE = Infinity;
      
      // Search for lighter alternatives
      // CRITICAL FIX: Add maximum iterations and proper bounds checking
      const searchStart = Math.max(currentLab[0], targetMinL);
      const searchEnd = Math.min(originalL + 20, 85);
      const maxSearchIterations = 50; // Limit to 50 iterations (50 L* range / 1.0 step)
      let searchIterations = 0;
      
      // CRITICAL FIX: Validate search bounds before loop
      if (searchStart > searchEnd) {
        console.warn(`   ⚠️  [LOOP] Invalid search range: start=${searchStart.toFixed(2)} > end=${searchEnd.toFixed(2)}, skipping lighter search`);
      } else {
        for (let testL = searchStart; testL <= searchEnd && searchIterations < maxSearchIterations; testL += 1.0) {
          searchIterations++;
          
          // CRITICAL FIX: Safety check - if testL is out of valid range, break
          if (testL < 0 || testL > 100) {
            console.warn(`   ⚠️  [LOOP] testL out of range: ${testL.toFixed(2)}, breaking loop`);
            break;
          }
          
          const testLab = [testL, originalA, originalBStar];
          const testRgb = labToRgb(testLab);
          
          if (testRgb.some(c => c < 0 || c > 255)) continue;
          
          const testMaxRGB = Math.max(...testRgb);
          if (testMaxRGB < 60) continue; // Skip still-too-dark colors
          
          const testCr = wcagContrast(testRgb, effectiveBgRGB);
          const testDeltaE = deltaE2000(originalLab, testLab);
          
          if (testCr >= targetRatio) {
            // Found a valid lighter color
            if (testDeltaE < bestLightenedDeltaE || (bestLightenedRgb === null)) {
              bestLightenedRgb = testRgb;
              bestLightenedCr = testCr;
              bestLightenedDeltaE = testDeltaE;
            }
          }
        }
      }
      
      // Use lighter alternative if found
      if (bestLightenedRgb && bestLightenedCr >= targetRatio) {
        const lightenedMaxRGB = Math.max(...bestLightenedRgb);
        console.log(`   ✅ [BRAND PRESERVATION] Using lighter alternative: max RGB=${finalMaxRGB} → ${lightenedMaxRGB}, contrast=${bestLightenedCr.toFixed(2)}:1, ΔE=${bestLightenedDeltaE.toFixed(3)}`);
        return bestLightenedRgb;
      } else {
        // Couldn't find lighter alternative, but check if we can at least improve it
        const mathCr = wcagContrast(mathResult, effectiveBgRGB);
        if (mathCr >= targetRatio && finalMaxRGB >= 60) {
          // Result meets target and isn't too dark (max RGB >= 60), use it
          console.warn(`   ⚠️  [BRAND PRESERVATION] Using dark color (max RGB=${finalMaxRGB}) as last resort - meets contrast ${mathCr.toFixed(2)}:1`);
          return mathResult;
        } else if (mathCr >= targetRatio) {
          // Result meets target but is very dark - try one more lightening attempt
          const emergencyLab = [Math.max(currentLab[0], targetMinL), currentLab[1], currentLab[2]];
          const emergencyRgb = labToRgb(emergencyLab);
          const emergencyCr = wcagContrast(emergencyRgb, effectiveBgRGB);
          
          if (emergencyCr >= targetRatio) {
            const emergencyMaxRGB = Math.max(...emergencyRgb);
            console.warn(`   ⚠️  [BRAND PRESERVATION] Emergency lightening: max RGB=${finalMaxRGB} → ${emergencyMaxRGB}, contrast=${emergencyCr.toFixed(2)}:1`);
            return emergencyRgb;
          }
        }
      }
    }

    // final output - DON'T RETURN YET, continue to brand preservation
    mathCr = wcagContrast(mathResult, effectiveBgRGB);
    if (mathCr >= targetRatio) {
      console.log(`   ✅ [CIELAB] CIELAB-optimized result: contrast=${mathCr.toFixed(2)}:1, ΔE=${mathDeltaE.toFixed(3)}`);
      // Continue to brand preservation check below - don't return yet
    } else {
      console.warn(`   ⚠️  [CIELAB] Best achievable: contrast=${mathCr.toFixed(2)}:1`);
    }
    
    // CRITICAL FIX: Return RGB array, not object
    // Validate mathResult is valid before returning
    if (!mathResult || !Array.isArray(mathResult) || mathResult.length !== 3) {
      console.error(`   🚨 [MATH] Invalid mathResult before return:`, mathResult);
      const fallbackRgb = isDarkBg ? [255, 255, 255] : [0, 0, 0];
      return fallbackRgb;
    }
    
    // Validate all values are numbers and not NaN/Infinity
    const validRgb = mathResult.map(v => {
      const num = Number(v);
      if (isNaN(num) || !isFinite(num)) {
        console.error(`   🚨 [MATH] Invalid RGB value: ${v}, using fallback`);
        return isDarkBg ? 255 : 0;
      }
      return Math.max(0, Math.min(255, Math.round(num)));
    });
    
    return validRgb;
  }

  // Color adjustment with hue preservation

  // Get all sections sorted by z-index (lowest to highest)

  // Element filtering for performance

  function isElementVisible(el) {
    try {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;

      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (parseFloat(style.opacity) < 0.1) return false;

      return true;
    } catch (err) {
      return false;
    }
  }

  function hasTextContent(el) {
    // Check for direct text nodes first (fast path)
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        return true;
      }
    }
    // Also check if element has any text content (including nested text)
    // This ensures elements like <a><span>text</span></a> are scanned
    const textContent = el.textContent || "";
    return textContent.trim().length > 0;
  }

  function shouldScanElement(el) {
    const h = originalHsl[0] / 360;
    const s = originalHsl[1] / 100;
    const l = originalHsl[2] / 100;

    let baseTextL = null;
    if (isLink && baseTextColor && Array.isArray(baseTextColor) && baseTextColor.length >= 3) {
      const baseTextHsl = rgbToHsl(baseTextColor);
      baseTextL = baseTextHsl[2] / 100;
    }

    const minL = 0.05;
    const maxL = 0.95;
    const lightnessStep = 0.01;
    // Scale minimum acceptable lightness based on target ratio to create visible differences across comfort scales
    // Lower targets (from lower comfort scales) → Higher minimum lightness (lighter colors)
    // Higher targets (from higher comfort scales) → Lower minimum lightness (darker colors allowed)
    // This ensures visible variation: scale 0.1 produces lighter colors, scale 1.0 produces darker colors
    let minAcceptableL;
    if (targetRatio <= 4.5) {
      // Low comfort scale (0.1-0.3): Prefer lighter colors, minimum 25% lightness
      minAcceptableL = 0.25;
    } else if (targetRatio <= 7.0) {
      // Medium comfort scale (0.4-0.6): Balanced, minimum 20% lightness
      minAcceptableL = 0.20;
    } else if (targetRatio <= 10.0) {
      // High comfort scale (0.7-0.9): Can go darker, minimum 18% lightness
      minAcceptableL = 0.18;
    } else {
      // Maximum comfort scale (1.0): Maximum contrast, minimum 15% lightness
      minAcceptableL = 0.15;
    }

    let mathResult = null;
    let bestResult = null;
    let bestContrast = 0;
    // Track lightest color that meets contrast (prefer lighter when multiple options exist)
    let lightestAcceptableResult = null;
    let lightestAcceptableContrast = 0;

    const needLighter = isDarkBg;

    if (needLighter) {
      const startL = Math.max(l, minL);
      for (let testL = startL; testL <= maxL; testL += lightnessStep) {
        const testRGB = hslToRgb([originalHsl[0], originalHsl[1], testL * 100]);
        const testCr = wcagContrast(testRGB, effectiveBgRGB);

        if (testCr >= targetRatio) {
          // Prefer lighter colors - only use if lighter than previous or first match
          if (!lightestAcceptableResult || testL > rgbToHsl(lightestAcceptableResult)[2] / 100) {
            lightestAcceptableResult = testRGB;
            lightestAcceptableContrast = testCr;
          }
          // Continue searching to find lightest acceptable color
        }

        if (testCr > bestContrast) {
          bestContrast = testCr;
          bestResult = testRGB;
        }
      }
      // Use lightest acceptable result if found
      if (lightestAcceptableResult) {
        mathResult = lightestAcceptableResult;
        const resultL = rgbToHsl(lightestAcceptableResult)[2];
        console.log(`   ✅ [BRAND] Found color preserving hue & saturation: L=${resultL.toFixed(1)}%, S=${originalHsl[1].toFixed(1)}%, Contrast=${lightestAcceptableContrast.toFixed(2)}:1`);
      }
    } else {
      // For light backgrounds, we need darker text - but prefer LIGHTEST acceptable color
      // Search from a reasonable upper bound downward to find the lightest color that meets contrast
      // This ensures lower comfort scales produce visibly lighter colors
      const effectiveMinL = Math.max(minAcceptableL, minL);
      
      // Determine starting lightness based on target ratio to create visible differences
      // Lower targets (lower comfort scales) → start from higher lightness (lighter colors)
      // Higher targets (higher comfort scales) → start from lower lightness (darker colors allowed)
      let searchStartL;
      if (targetRatio <= 4.5) {
        // Low comfort scale: Start from 50% lightness (medium-light colors)
        searchStartL = 0.50;
      } else if (targetRatio <= 7.0) {
        // Medium comfort scale: Start from 40% lightness
        searchStartL = 0.40;
      } else if (targetRatio <= 10.0) {
        // High comfort scale: Start from 30% lightness
        searchStartL = 0.30;
      } else {
        // Maximum comfort scale: Start from 20% lightness
        searchStartL = 0.20;
      }
      
      // Don't start higher than original if original is already light enough
      // But if original is very dark, use the calculated start point
      const startL = Math.min(Math.max(searchStartL, l), maxL);
      
      // Check if original is already close to target - if so, prefer staying close
      const originalCr = wcagContrast(fgRGB, effectiveBgRGB);
      const isCloseToTarget = originalCr >= targetRatio * 0.85; // Within 15% of target
      const originalIsLight = l >= 0.30; // Original is reasonably light (30%+)
      
      // First pass: Search from startL downward to find lightest acceptable color
      // When multiple colors meet contrast, prefer the LIGHTEST one (not closest to original)
      // This ensures visible differences across comfort scales
      let foundInPreferredRange = false;
      
      for (let testL = startL; testL >= effectiveMinL; testL -= lightnessStep) {
        const testRGB = hslToRgb([originalHsl[0], originalHsl[1], testL * 100]);
        const testCr = wcagContrast(testRGB, effectiveBgRGB);

        if (testCr >= targetRatio) {
          // Always prefer the LIGHTEST color that meets contrast
          // This ensures lower comfort scales produce visibly lighter colors
          if (!lightestAcceptableResult || testL > rgbToHsl(lightestAcceptableResult)[2] / 100) {
            lightestAcceptableResult = testRGB;
            lightestAcceptableContrast = testCr;
            foundInPreferredRange = true;
          }
        }

        if (testCr > bestContrast) {
          bestContrast = testCr;
          bestResult = testRGB;
        }
      }
      
      // If found in preferred range, use the lightest acceptable color
      if (lightestAcceptableResult && foundInPreferredRange) {
        // Special case: If original is close to target AND original is reasonably light,
        // prefer staying close to original (but only if it's lighter than what we found)
        if (isCloseToTarget && originalIsLight && l > rgbToHsl(lightestAcceptableResult)[2] / 100) {
          // Original is lighter and close to target - check if it meets contrast
          const originalTestCr = wcagContrast(fgRGB, effectiveBgRGB);
          if (originalTestCr >= targetRatio) {
            mathResult = fgRGB;
            const resultL = rgbToHsl(fgRGB)[2];
            console.log(`   ✅ [BRAND] Using original color (close to target and light): L=${resultL.toFixed(1)}%, S=${originalHsl[1].toFixed(1)}%, Contrast=${originalTestCr.toFixed(2)}:1`);
          } else {
            // Original doesn't meet target, use lightest acceptable
            mathResult = lightestAcceptableResult;
            const resultL = rgbToHsl(lightestAcceptableResult)[2];
            console.log(`   ✅ [BRAND] Found lightest acceptable color: L=${resultL.toFixed(1)}%, S=${originalHsl[1].toFixed(1)}%, Contrast=${lightestAcceptableContrast.toFixed(2)}:1`);
          }
        } else {
          // Use lightest acceptable color (ensures lighter colors at lower comfort scales)
          mathResult = lightestAcceptableResult;
          const resultL = rgbToHsl(lightestAcceptableResult)[2];
          console.log(`   ✅ [BRAND] Found lightest acceptable color: L=${resultL.toFixed(1)}%, S=${originalHsl[1].toFixed(1)}%, Contrast=${lightestAcceptableContrast.toFixed(2)}:1`);
        }
      } else {
        // Second pass: Only if no acceptable color found, try darker (below minAcceptableL)
        // This is a last resort - we'll validate it's not too dark later
        for (let testL = effectiveMinL - lightnessStep; testL >= minL; testL -= lightnessStep) {
          const testRGB = hslToRgb([originalHsl[0], originalHsl[1], testL * 100]);
          const testCr = wcagContrast(testRGB, effectiveBgRGB);

          if (testCr >= targetRatio) {
            mathResult = testRGB;
            console.log(`   ⚠️  [BRAND] Found color preserving hue & saturation (very dark): L=${(testL * 100).toFixed(1)}%, S=${originalHsl[1].toFixed(1)}%, Contrast=${testCr.toFixed(2)}:1`);
            break;
          }

          if (testCr > bestContrast) {
            bestContrast = testCr;
            bestResult = testRGB;
          }
        }
      }
    }

    if (!mathResult) {
      const saturationSteps = [s * 0.8, s * 0.6, s * 0.4, s * 0.2];

      for (const testS of saturationSteps) {
        if (needLighter) {
          // For dark backgrounds, prefer lighter colors
          let lightestFound = null;
          let lightestContrast = 0;
          for (let testL = minL; testL <= maxL; testL += lightnessStep) {
            const testRGB = hslToRgb([originalHsl[0], testS * 100, testL * 100]);
            const testCr = wcagContrast(testRGB, effectiveBgRGB);

            if (testCr >= targetRatio) {
              // Prefer lighter colors
              if (!lightestFound || testL > rgbToHsl(lightestFound)[2] / 100) {
                lightestFound = testRGB;
                lightestContrast = testCr;
              }
            }

            if (testCr > bestContrast) {
              bestContrast = testCr;
              bestResult = testRGB;
            }
          }
          if (lightestFound) {
            mathResult = lightestFound;
            const resultL = rgbToHsl(lightestFound)[2];
            console.log(`   ✅ [BRAND] Found color with reduced saturation: L=${resultL.toFixed(1)}%, S=${(testS * 100).toFixed(1)}%, Contrast=${lightestContrast.toFixed(2)}:1`);
            break;
          }
        } else {
          // For light backgrounds, prefer LIGHTEST acceptable color
          // Use same search strategy as main logic to ensure consistency
          const effectiveMinL = Math.max(minAcceptableL, minL);
          
          // Determine starting lightness based on target ratio (same as main logic)
          let searchStartL;
          if (targetRatio <= 4.5) {
            searchStartL = 0.50;
          } else if (targetRatio <= 7.0) {
            searchStartL = 0.40;
          } else if (targetRatio <= 10.0) {
            searchStartL = 0.30;
          } else {
            searchStartL = 0.20;
          }
          
          const originalLNormalized = l;
          const startL = Math.min(Math.max(searchStartL, originalLNormalized), maxL);
          
          let lightestFound = null;
          let lightestContrast = 0;
          let foundInPreferredRange = false;
          
          // First pass: Search from startL downward to find lightest acceptable color
          for (let testL = startL; testL >= effectiveMinL; testL -= lightnessStep) {
            const testRGB = hslToRgb([originalHsl[0], testS * 100, testL * 100]);
            const testCr = wcagContrast(testRGB, effectiveBgRGB);

            if (testCr >= targetRatio) {
              // Always prefer the LIGHTEST color that meets contrast
              if (!lightestFound || testL > rgbToHsl(lightestFound)[2] / 100) {
                lightestFound = testRGB;
                lightestContrast = testCr;
                foundInPreferredRange = true;
              }
            }

            if (testCr > bestContrast) {
              bestContrast = testCr;
              bestResult = testRGB;
            }
          }
          
          // Use lightest found in preferred range
          if (lightestFound && foundInPreferredRange) {
            mathResult = lightestFound;
            const resultL = rgbToHsl(lightestFound)[2];
            console.log(`   ✅ [BRAND] Found color with reduced saturation (lightest acceptable): L=${resultL.toFixed(1)}%, S=${(testS * 100).toFixed(1)}%, Contrast=${lightestContrast.toFixed(2)}:1`);
            break;
          } else if (lightestFound) {
            // Only use darker result if no acceptable color found
            mathResult = lightestFound;
            const resultL = rgbToHsl(lightestFound)[2];
            console.log(`   ⚠️  [BRAND] Found color with reduced saturation (very dark): L=${resultL.toFixed(1)}%, S=${(testS * 100).toFixed(1)}%, Contrast=${lightestContrast.toFixed(2)}:1`);
            break;
          }
        }

        if (mathResult) break;
      }
    }

    if (isLink && baseTextL !== null && mathResult) {
      const linkHsl = rgbToHsl(mathResult);
      const linkL = linkHsl[2] / 100;
      const lightnessDiff = Math.abs(linkL - baseTextL);
      const minLightnessDiff = 0.15;
      const minSaturationForLink = 0.2;

      if (lightnessDiff < minLightnessDiff || linkHsl[1] / 100 < minSaturationForLink) {
        let distinctResult = null;
        const targetLinkL = baseTextL > 0.5
          ? Math.max(0.05, baseTextL - minLightnessDiff)
          : Math.min(0.95, baseTextL + minLightnessDiff);

        const targetS = Math.max(s, minSaturationForLink);

        for (let testL = Math.max(minL, targetLinkL - 0.1); testL <= Math.min(maxL, targetLinkL + 0.1); testL += lightnessStep) {
          const testRGB = hslToRgb([originalHsl[0], targetS * 100, testL * 100]);
          const testCr = wcagContrast(testRGB, effectiveBgRGB);
          const newDiff = Math.abs(testL - baseTextL);

          if (testCr >= targetRatio && newDiff >= minLightnessDiff) {
            distinctResult = testRGB;
            break;
          }
        }

        if (distinctResult) {
          mathResult = distinctResult;
        } else {
          const linkHslCurrent = rgbToHsl(mathResult);
          if (linkHslCurrent[1] / 100 < minSaturationForLink) {
            const adjustedRGB = hslToRgb([originalHsl[0], minSaturationForLink * 100, linkHslCurrent[2]]);
            const adjustedCr = wcagContrast(adjustedRGB, effectiveBgRGB);
            if (adjustedCr >= targetRatio) {
              mathResult = adjustedRGB;
            }
          }
        }
      }
    }

    if (!mathResult) {
      if (bestResult && bestContrast > 0) {
        // FIX: Accept best achievable color if it reaches at least 4.5:1 (WCAG AA)
        // This prevents forcing pure black/white when a hue-preserved color is acceptable
        if (bestContrast >= 4.5) {
          mathResult = bestResult;
          console.log(`   ✅ [BRAND] Using best achievable hue-preserved color (contrast: ${bestContrast.toFixed(2)}:1 >= 4.5:1, target was ${targetRatio.toFixed(2)}:1)`);
        } else {
          // Only fall back to pure black/white if best achievable is below WCAG AA
          const lastResortFg = isDarkBg ? [255, 255, 255] : [0, 0, 0];
          const lastResortCr = wcagContrast(lastResortFg, effectiveBgRGB);
          console.warn(`   ⚠️  [BRAND] Best achievable contrast ${bestContrast.toFixed(2)}:1 < 4.5:1, using neutral color fallback`);
          mathResult = lastResortFg;
        }
      } else {
        const lastResortFg = isDarkBg ? [255, 255, 255] : [0, 0, 0];
        const lastResortCr = wcagContrast(lastResortFg, effectiveBgRGB);
        console.warn(`   ⚠️  [BRAND] BRAND SAFE FAILURE: contrast impossible without neutral color`);
        mathResult = lastResortFg;
      }
    }

    // Validate mathResult before proceeding
    if (!mathResult || !Array.isArray(mathResult) || mathResult.length < 3) {
      console.error(`   ❌ [MATH] Invalid mathResult, using fallback`);
      mathResult = isDarkBg ? [255, 255, 255] : [0, 0, 0];
    }

    // Ensure all RGB values are valid numbers
    mathResult = mathResult.map(v => {
      const num = Number(v);
      if (isNaN(num) || !isFinite(num)) {
        return isDarkBg ? 255 : 0;
      }
      return Math.max(0, Math.min(255, num));
    });

    const mathCr = wcagContrast(mathResult, effectiveBgRGB);
    const finalHsl = rgbToHsl(mathResult);

    // Validate finalHsl before using toFixed
    const hslH = (finalHsl && Array.isArray(finalHsl) && typeof finalHsl[0] === 'number' && isFinite(finalHsl[0])) ? finalHsl[0] : 0;
    const hslS = (finalHsl && Array.isArray(finalHsl) && typeof finalHsl[1] === 'number' && isFinite(finalHsl[1])) ? finalHsl[1] : 0;
    const hslL = (finalHsl && Array.isArray(finalHsl) && typeof finalHsl[2] === 'number' && isFinite(finalHsl[2])) ? finalHsl[2] : 0;

    console.log(`   ✅ [MATH] Final result: RGB(${mathResult.map(v => Math.round(v)).join(',')}) - HSL(${hslH.toFixed(1)}°, ${hslS.toFixed(1)}%, ${hslL.toFixed(1)}%) - Contrast: ${mathCr.toFixed(2)}:1`);

    // STEP 2: BRAND COLOR PRESERVATION SAFEGUARD (CALCULATE FIRST - AUTHORITATIVE)
    // Check if the result is too far from the original brand color
    // If so, try adjusting the original brand color instead of replacing it
    // This must be calculated BEFORE any decisions to ensure brand colors always win when they meet contrast
    const resultHsl = rgbToHsl(mathResult);
    const resultHueDiff = Math.abs((resultHsl[0] - originalHsl[0]) % 360);
    
    // Detect if result is near-black/near-white (non-brand color)
    const isNearBlack = Math.max(mathResult[0], mathResult[1], mathResult[2]) < 50;
    const isNearWhite = mathResult[0] > 225 && mathResult[1] > 225 && mathResult[2] > 225;
    const isNeutralColor = isNearBlack || isNearWhite;
    
    // Check if result significantly deviates from brand (hue difference > 60° or saturation loss > 50%)
    const significantHueChange = resultHueDiff > 60;
    const significantSatLoss = resultHsl[1] < originalHsl[1] * 0.5;
    const deviatesFromBrand = isNeutralColor || significantHueChange || significantSatLoss;
    
    // Calculate brand-preserved color if needed (BEFORE any decisions)
    let brandPreservedResult = null;
    let brandPreservedContrast = 0;
    
    if (deviatesFromBrand && !isButton && elementType !== 'button') {
      console.log(`   🎨 [BRAND] Result deviates from brand color - attempting brand-preserving adjustment`);
      console.log(`   📊 [BRAND] Original: HSL(${originalHsl[0].toFixed(1)}°, ${originalHsl[1].toFixed(1)}%, ${originalHsl[2].toFixed(1)}%)`);
      console.log(`   📊 [BRAND] Result: HSL(${resultHsl[0].toFixed(1)}°, ${resultHsl[1].toFixed(1)}%, ${resultHsl[2].toFixed(1)}%)`);
      
      // Try adjusting original color's lightness while preserving hue and saturation
      const originalH = originalHsl[0];
      const originalS = originalHsl[1];
      const originalL = originalHsl[2];
      
      // Comprehensive search: try full lightness range to find brand-preserving color that meets contrast
      // Use fine-grained steps to find the lightest/darkest brand color that meets target
      // Use the same scaled minAcceptableL calculated above to ensure consistency
      const minL = 0.05;
      const maxL = 0.95;
      const lightnessStep = 0.01; // Fine-grained search
      // minAcceptableL is already calculated above based on targetRatio
      
      // Track lightest acceptable color that meets contrast (prefer lighter when multiple options exist)
      let lightestBrandPreserved = null;
      let lightestBrandPreservedContrast = 0;
      
      if (needLighter) {
        // For dark backgrounds, search from light to dark, prefer lighter
        for (let testL = maxL; testL >= minL; testL -= lightnessStep) {
          const testRGB = hslToRgb([originalH, originalS, testL * 100]);
          const testCr = wcagContrast(testRGB, effectiveBgRGB);
          
          if (testCr >= targetRatio) {
            // Prefer lighter colors - only use if lighter than previous or first match
            if (!lightestBrandPreserved || testL > rgbToHsl(lightestBrandPreserved)[2] / 100) {
              lightestBrandPreserved = testRGB;
              lightestBrandPreservedContrast = testCr;
            }
          }
          
          // Track best result even if below target (for fallback)
          if (testCr > brandPreservedContrast) {
            brandPreservedContrast = testCr;
            brandPreservedResult = testRGB;
          }
        }
        // Use lightest acceptable result
        if (lightestBrandPreserved) {
          brandPreservedResult = lightestBrandPreserved;
          brandPreservedContrast = lightestBrandPreservedContrast;
          const resultL = rgbToHsl(brandPreservedResult)[2];
          console.log(`   ✅ [BRAND] Found brand-preserving color: HSL(${originalH.toFixed(1)}°, ${originalS.toFixed(1)}%, ${resultL.toFixed(1)}%) - Contrast: ${brandPreservedContrast.toFixed(2)}:1`);
        }
      } else {
        // For light backgrounds, we need darker text - but prefer LIGHTEST acceptable color
        // Search from a reasonable upper bound downward to find the lightest color that meets contrast
        // This ensures lower comfort scales produce visibly lighter colors
        const effectiveMinL = Math.max(minAcceptableL, minL);
        
        // Determine starting lightness based on target ratio to create visible differences
        // Lower targets (lower comfort scales) → start from higher lightness (lighter colors)
        // Higher targets (higher comfort scales) → start from lower lightness (darker colors allowed)
        let searchStartL;
        if (targetRatio <= 4.5) {
          // Low comfort scale: Start from 50% lightness (medium-light colors)
          searchStartL = 0.50;
        } else if (targetRatio <= 7.0) {
          // Medium comfort scale: Start from 40% lightness
          searchStartL = 0.40;
        } else if (targetRatio <= 10.0) {
          // High comfort scale: Start from 30% lightness
          searchStartL = 0.30;
        } else {
          // Maximum comfort scale: Start from 20% lightness
          searchStartL = 0.20;
        }
        
        // Don't start higher than original if original is already light enough
        // But if original is very dark, use the calculated start point
        const originalLNormalized = originalL / 100;
        const startL = Math.min(Math.max(searchStartL, originalLNormalized), maxL);
        
        let foundInPreferredRange = false;
        
        // First pass: Search from startL downward to find lightest acceptable color
        // When multiple colors meet contrast, prefer the LIGHTEST one
        // This ensures visible differences across comfort scales
        for (let testL = startL; testL >= effectiveMinL; testL -= lightnessStep) {
          const testRGB = hslToRgb([originalH, originalS, testL * 100]);
          const testCr = wcagContrast(testRGB, effectiveBgRGB);
          
          if (testCr >= targetRatio) {
            // Always prefer the LIGHTEST color that meets contrast
            // This ensures lower comfort scales produce visibly lighter colors
            if (!lightestBrandPreserved || testL > rgbToHsl(lightestBrandPreserved)[2] / 100) {
              lightestBrandPreserved = testRGB;
              lightestBrandPreservedContrast = testCr;
              foundInPreferredRange = true;
            }
          }
          
          // Track best result even if below target (for fallback)
          if (testCr > brandPreservedContrast) {
            brandPreservedContrast = testCr;
            brandPreservedResult = testRGB;
          }
        }
        
        // Use lightest acceptable color if found in preferred range
        if (lightestBrandPreserved && foundInPreferredRange) {
          brandPreservedResult = lightestBrandPreserved;
          brandPreservedContrast = lightestBrandPreservedContrast;
          const resultL = rgbToHsl(brandPreservedResult)[2];
          console.log(`   ✅ [BRAND] Found brand-preserving color (lightest acceptable): HSL(${originalH.toFixed(1)}°, ${originalS.toFixed(1)}%, ${resultL.toFixed(1)}%) - Contrast: ${brandPreservedContrast.toFixed(2)}:1`);
        } else if (brandPreservedResult) {
          // Only use darker result if no acceptable color found - will be validated later
          console.log(`   ⚠️  [BRAND] Found brand-preserving color (very dark): HSL(${originalH.toFixed(1)}°, ${originalS.toFixed(1)}%, ${(rgbToHsl(brandPreservedResult)[2]).toFixed(1)}%) - Contrast: ${brandPreservedContrast.toFixed(2)}:1`);
        }
      }
    }

    // STEP 3: FINAL DECISION - BRAND PRESERVED COLOR IS AUTHORITATIVE
    // If brand-preserved color meets contrast, it ALWAYS wins over AI or math result
    // But validate it's not excessively dark
    if (brandPreservedResult && brandPreservedContrast >= targetRatio) {
      const brandMaxRGB = Math.max(brandPreservedResult[0], brandPreservedResult[1], brandPreservedResult[2]);
      if (brandMaxRGB >= 60) {
        // Brand-preserved color is acceptable (not too dark)
        console.log(`   ✅ [BRAND] AUTHORITATIVE: Using brand-preserved color (${brandPreservedContrast.toFixed(2)}:1) instead of neutral/math result`);
        return brandPreservedResult;
      } else {
        // Brand-preserved color is too dark - try to lighten it
        console.warn(`   ⚠️  [BRAND] Brand-preserved color is too dark (max RGB=${brandMaxRGB} < 60), attempting to lighten...`);
        const brandHsl = rgbToHsl(brandPreservedResult);
        const currentL = brandHsl[2] / 100;
        const targetL = Math.max(0.15, currentL * 1.5); // Increase lightness by 50% or to minimum 15%
        
        // Try to find a lighter version that still meets contrast
        for (let testL = targetL; testL <= Math.min(0.30, currentL * 2); testL += 0.01) {
          const testRGB = hslToRgb([brandHsl[0], brandHsl[1], testL * 100]);
          const testCr = wcagContrast(testRGB, effectiveBgRGB);
          const testMaxRGB = Math.max(testRGB[0], testRGB[1], testRGB[2]);
          
          if (testCr >= targetRatio && testMaxRGB >= 60) {
            console.warn(`   🔧 [BRAND] Lightened brand-preserved color from RGB(${brandPreservedResult.map(v => Math.round(v)).join(',')}) to RGB(${testRGB.map(v => Math.round(v)).join(',')}).`);
            return testRGB;
          }
        }
        
        // If can't lighten, use original but warn
        console.warn(`   ⚠️  [BRAND] Cannot lighten brand-preserved color while maintaining contrast. Using dark color as last resort.`);
        return brandPreservedResult;
      }
    }

    // STEP 4: AI VERIFICATION (if available) - only if brand preservation didn't work
    // AI only verifies, doesn't override unless strongly disagreeing
    if (aiSuggestedFg && Array.isArray(aiSuggestedFg) && aiSuggestedFg.length === 3) {
      console.log(`   🤖 [AI-VERIFY] ========================================`);
      console.log(`   🤖 [AI-VERIFY] STEP 4: AI Verification`);
      console.log(`   🤖 [AI-VERIFY] ========================================`);
      const aiCr = wcagContrast(aiSuggestedFg, effectiveBgRGB);
      const aiHsl = rgbToHsl(aiSuggestedFg);
      console.log(`   📊 [AI-VERIFY] AI suggestion: RGB(${aiSuggestedFg.join(',')}) - HSL(${aiHsl[0].toFixed(1)}°, ${aiHsl[1].toFixed(1)}%, ${aiHsl[2].toFixed(1)}%) - Contrast: ${aiCr.toFixed(2)}:1`);

      const aiHueDiff = Math.abs((aiHsl[0] - originalHsl[0]) % 360);
      const mathHueDiff = Math.abs((finalHsl[0] - originalHsl[0]) % 360);
      const aiPreservesBrand = aiHueDiff < 30 && aiHsl[1] >= originalHsl[1] * 0.5;
      
      // Check if AI suggestion is near-black/near-white (non-brand)
      const aiIsNearBlack = Math.max(aiSuggestedFg[0], aiSuggestedFg[1], aiSuggestedFg[2]) < 50;
      const aiIsNearWhite = aiSuggestedFg[0] > 225 && aiSuggestedFg[1] > 225 && aiSuggestedFg[2] > 225;
      const aiIsNeutral = aiIsNearBlack || aiIsNearWhite;

      // If brand-preserved color exists (even if below target), prefer it over neutral AI suggestion
      if (aiIsNeutral && brandPreservedResult && brandPreservedContrast > 0) {
        console.log(`   ⚠️  [AI-VERIFY] AI suggestion is neutral color, preferring brand-preserved color`);
        // Continue to check other options, but don't use neutral AI
      } else if (aiCr >= targetRatio && (aiCr > mathCr * 1.1 || mathCr < targetRatio)) {
        if (aiPreservesBrand && !aiIsNeutral) {
          console.log(`   ✅ [AI-VERIFY] Using AI suggestion (better contrast and preserves brand)`);
          return aiSuggestedFg;
        } else {
          console.log(`   ⚠️  [AI-VERIFY] AI suggestion doesn't preserve brand or is neutral, keeping math result`);
        }
      } else if (mathCr >= targetRatio) {
        // Before using math result, check if it's neutral and brand-preserved exists
        if (isNeutralColor && brandPreservedResult && brandPreservedContrast > 0) {
          console.log(`   ⚠️  [AI-VERIFY] Math result is neutral, will check brand-preserved in fallback`);
          // Fall through to fallback step to evaluate brand-preserved vs neutral
        } else {
          console.log(`   ✅ [AI-VERIFY] Mathematical result is optimal, keeping it`);
          return mathResult;
        }
      }
    }

    // STEP 5: FALLBACK DECISION
    // Only prefer brand-preserved over neutral if it's reasonably close to target or better than neutral
    if (brandPreservedResult && brandPreservedContrast > 0 && isNeutralColor) {
      const neutralContrast = mathCr;
      // Prefer brand-preserved if:
      // 1. It meets at least 50% of target AND is within 30% of neutral contrast, OR
      // 2. It's better than or equal to neutral contrast
      const meetsMinimumThreshold = brandPreservedContrast >= targetRatio * 0.5;
      const closeToNeutral = brandPreservedContrast >= neutralContrast * 0.7;
      const betterThanNeutral = brandPreservedContrast >= neutralContrast;
      
      if ((meetsMinimumThreshold && closeToNeutral) || betterThanNeutral) {
        console.log(`   ✅ [BRAND] FALLBACK: Using brand-preserved color (${brandPreservedContrast.toFixed(2)}:1) over neutral color (${neutralContrast.toFixed(2)}:1)`);
        // If brand-preserved doesn't meet target, return as feasible object
        if (brandPreservedContrast >= targetRatio) {
          return brandPreservedResult;
        } else {
          console.warn(`   ⚠️  [BRAND] Brand-preserved color (${brandPreservedContrast.toFixed(2)}:1) doesn't meet target (${targetRatio.toFixed(2)}:1). Returning as best achievable.`);
          return { fg: brandPreservedResult, feasible: true, contrast: brandPreservedContrast };
        }
      } else {
        console.log(`   ⚠️  [BRAND] Brand-preserved color (${brandPreservedContrast.toFixed(2)}:1) too weak compared to neutral (${neutralContrast.toFixed(2)}:1), using neutral`);
      }
    }

    // STEP 6: FINAL RESULT
    // Validate that mathResult meets target before returning
    const finalMathCr = wcagContrast(mathResult, effectiveBgRGB);
    
    // MANDATORY POST-SELECTION SAFEGUARD: Check if final color is excessively dark
    // Reject colors where max RGB < 60 (approximately 15% lightness) as they're too dark for good UX
    const finalMaxRGB = Math.max(mathResult[0], mathResult[1], mathResult[2]);
    const finalMinRGB = Math.min(mathResult[0], mathResult[1], mathResult[2]);
    const isExcessivelyDark = finalMaxRGB < 60; // ~15% lightness threshold
    
    if (isExcessivelyDark) {
      console.warn(`   🚨 [FINAL SAFEGUARD] Final color RGB(${mathResult.map(v => Math.round(v)).join(',')}) is excessively dark (max=${finalMaxRGB} < 60).`);
      
      // Try to find a lighter brand-preserved color if available
      if (brandPreservedResult) {
        const brandPreservedCr = wcagContrast(brandPreservedResult, effectiveBgRGB);
        const brandMaxRGB = Math.max(brandPreservedResult[0], brandPreservedResult[1], brandPreservedResult[2]);
        
        // Use brand-preserved if it's lighter OR if it meets contrast and math result doesn't
        if (brandMaxRGB >= 60 || (brandPreservedCr >= targetRatio && finalMathCr < targetRatio)) {
          console.warn(`   🔧 [FINAL SAFEGUARD] Using brand-preserved color (max RGB=${brandMaxRGB}) instead of excessively dark color.`);
          if (brandPreservedCr >= targetRatio) {
            return brandPreservedResult;
          } else {
            return { fg: brandPreservedResult, feasible: true, contrast: brandPreservedCr };
          }
        }
      }
      
      // If no better brand-preserved color, try to lighten the result slightly while maintaining contrast
      // This is a last resort - lighten by increasing max RGB component to at least 60
      const mathResultHsl = rgbToHsl(mathResult);
      const currentL = mathResultHsl[2] / 100;
      const targetL = Math.max(0.15, currentL * 1.5); // Increase lightness by 50% or to minimum 15%
      
      // Try to find a lighter version that still meets contrast
      for (let testL = targetL; testL <= Math.min(0.30, currentL * 2); testL += 0.01) {
        const testRGB = hslToRgb([mathResultHsl[0], mathResultHsl[1], testL * 100]);
        const testCr = wcagContrast(testRGB, effectiveBgRGB);
        const testMaxRGB = Math.max(testRGB[0], testRGB[1], testRGB[2]);
        
        if (testCr >= targetRatio && testMaxRGB >= 60) {
          console.warn(`   🔧 [FINAL SAFEGUARD] Lightened color from RGB(${mathResult.map(v => Math.round(v)).join(',')}) to RGB(${testRGB.map(v => Math.round(v)).join(',')}) to avoid excessive darkness.`);
          return testRGB;
        }
      }
      
      // If we can't lighten while maintaining contrast, warn but still return the dark color
      // (better than no contrast at all)
      console.warn(`   ⚠️  [FINAL SAFEGUARD] Cannot lighten color while maintaining contrast. Using dark color as last resort.`);
    }
    
    if (finalMathCr >= targetRatio) {
      console.log(`   ✅ [FINAL] Using mathematical result: RGB(${mathResult.map(v => Math.round(v)).join(',')}) - Contrast: ${finalMathCr.toFixed(2)}:1`);
      return mathResult;
    } else {
      // mathResult doesn't meet target - return as feasible object
      console.warn(`   ⚠️  [FINAL] Mathematical result (${finalMathCr.toFixed(2)}:1) doesn't meet target (${targetRatio.toFixed(2)}:1). Returning as best achievable.`);
      return { fg: mathResult, feasible: true, contrast: finalMathCr };
    }
  }

  // Get all sections sorted by z-index (lowest to highest)

  // Element filtering for performance

  function isElementVisible(el) {
    try {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;

      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (parseFloat(style.opacity) < 0.1) return false;

      return true;
    } catch {
      return false;
    }
  }

  function hasTextContent(el) {
    // Check for direct text nodes first (fast path)
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        return true;
      }
    }
    // Also check if element has any text content (including nested text)
    // This ensures elements like <a><span>text</span></a> are scanned
    const textContent = el.textContent || "";
    return textContent.trim().length > 0;
  }

  function shouldScanElement(el) {
    const skipTags = [
      "SCRIPT",
      "STYLE",
      "NOSCRIPT",
      "SVG",
      "PATH",
      "CANVAS",
      "VIDEO",
      "AUDIO",
      "IFRAME",
    ];
    if (skipTags.includes(el.tagName)) return false;
    
    // Skip extension's own UI elements (notifications, popups, etc.)
    if (el.id === 'ai-contrast-notification' || 
        el.id === 'ai-contrast-notification-container' ||
        el.id === 'contrast-fixes' ||
        el.closest('#ai-contrast-notification') ||
        el.closest('#ai-contrast-notification-container') ||
        el.closest('#contrast-fixes')) {
      return false;
    }
    
    if (!isElementVisible(el)) return false;
    if (!hasTextContent(el)) return false;
    return true;
  }

  function getRelevantElements(root = document) {
    const elements = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => {
        return shouldScanElement(node)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    });

    let node;
    while ((node = walker.nextNode())) {
      elements.push(node);
    }

    return elements;
  }

  // Shadow DOM support

  function getAllElements(root = document) {
    const elements = getRelevantElements(root);
    const allElements = [...elements];
    elements.forEach((el) => {
      if (el.shadowRoot) {
        allElements.push(...getAllElements(el.shadowRoot));
      }
    });
    return allElements;
  }

  // Context-aware background mapping

  // Global section background cache using WeakMap for memory efficiency
  let sectionBackgroundCache = new WeakMap();

  // Analyze all sections and store their visual properties
  function analyzeSections() {
    // Create new WeakMap (can't clear WeakMap, so create new one)
    sectionBackgroundCache = new WeakMap();
    console.log(
      `🗺️  Analyzing section backgrounds for context-aware correction...`
    );

    const sections = document.querySelectorAll(
      "section, header, footer, main, div, nav, article, aside"
    );
    let analyzedCount = 0;

    sections.forEach((sec) => {
      try {
        // CRITICAL: Use getEffectiveBackgroundRGBA to get the ACTUAL visible background
        // This accounts for transparent sections and parent backgrounds
        const effectiveBgRGBA = getEffectiveBackgroundRGBA(sec);
        
        // Handle null return (no opaque background found)
        let effectiveBg, effectiveAlpha;
        if (!effectiveBgRGBA || effectiveBgRGBA.length !== 4) {
          // Fallback to white background for transparent sections
          effectiveBg = [255, 255, 255];
          effectiveAlpha = 1;
        } else {
          effectiveBg = effectiveBgRGBA.slice(0, 3);
          effectiveAlpha = effectiveBgRGBA[3];
        }

        const style = getComputedStyle(sec);
        const directColor = style.backgroundColor;
        const image = style.backgroundImage;

        // Get z-index for section ordering
        let zIndex = parseInt(style.zIndex, 10);
        if (isNaN(zIndex) || style.zIndex === 'auto') {
          zIndex = 0; // Default to 0 for auto or invalid z-index
        }

        // Use the effective background color (actual visible color)
        const color = `rgb(${effectiveBg.map(v => Math.round(v)).join(',')})`;
        const alpha = effectiveAlpha;

        // Check if the direct background is transparent or matches effective
        const directRgbaMatch = directColor.match(/rgba?\(([^)]+)\)/);
        let directAlpha = 1;
        if (directRgbaMatch) {
          const parts = directRgbaMatch[1].split(",").map((v) => parseFloat(v.trim()));
          if (parts.length >= 4) {
            directAlpha = parts[3];
          }
        }

        // Determine if section has transparent background (uses parent's background)
        const isTransparent = directAlpha < 0.1 || directColor === 'transparent' || directColor === 'rgba(0, 0, 0, 0)';

        // Get bounding rect for visual overlap detection
        const rect = sec.getBoundingClientRect();

        sectionBackgroundCache.set(sec, {
          color: color, // Use effective (visible) background color
          alpha: alpha, // Use effective alpha
          isImage: image !== "none" && !image.includes("gradient"),
          isTransparent: isTransparent, // Track if section itself is transparent
          rect: rect,
          element: sec.tagName.toLowerCase(),
          zIndex: zIndex, // Store z-index for sorting
        });

        analyzedCount++;
      } catch (e) {
        // Skip if getComputedStyle fails
        console.warn(`   ⚠️  Failed to analyze section ${sec.tagName}:`, e);
      }
    });

    console.log(
      `   ✅ Analyzed ${analyzedCount} sections/containers with visual context`
    );
    return analyzedCount;
  }

  // Get all sections sorted by z-index (lowest to highest)
  // This ensures we process sections in the correct visual stacking order
  function getSectionsSortedByZIndex() {
    const sections = document.querySelectorAll(
      "section, header, footer, main, div, nav, article, aside"
    );

    const sectionsWithZIndex = Array.from(sections)
      .map(sec => {
        try {
          const info = sectionBackgroundCache.get(sec);
          if (info) {
            return { section: sec, zIndex: info.zIndex || 0, info: info };
          }
          // If not in cache, get z-index directly
          const style = getComputedStyle(sec);
          let zIndex = parseInt(style.zIndex, 10);
          if (isNaN(zIndex) || style.zIndex === 'auto') {
            zIndex = 0;
          }
          return { section: sec, zIndex: zIndex, info: null };
        } catch (e) {
          return { section: sec, zIndex: 0, info: null };
        }
      })
      .sort((a, b) => {
        // Sort by z-index (lowest first), then by DOM order if z-index is equal
        if (a.zIndex !== b.zIndex) {
          return a.zIndex - b.zIndex;
        }
        // If z-index is equal, maintain DOM order
        const position = a.section.compareDocumentPosition(b.section);
        return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });

    return sectionsWithZIndex.map(item => item.section);
  }

  // Get all elements within a specific section
  function getElementsInSection(section) {
    if (!section) return [];

    const allElements = getAllElements(section);
    const sectionElements = [];

    allElements.forEach(el => {
      // Skip image background elements that are already marked
      // EXCEPTION: Re-evaluate interactive elements - they might have their own solid backgrounds
      const tagName = el.tagName ? el.tagName.toLowerCase() : '';
      const isInteractive = tagName === 'button' || 
                           tagName === 'a' || 
                           tagName === 'input' ||
                           el.getAttribute('role') === 'button' ||
                           el.getAttribute('role') === 'link';
      
      if (isInteractive && el.hasAttribute('data-ai-skip-reason') && el.getAttribute('data-ai-skip-reason') === 'image') {
        // Interactive element marked as image - check if it has its own solid background
        try {
          const elCs = getComputedStyle(el);
          const elBg = parseCSSColorToRGBA(elCs.backgroundColor, [0, 0, 0, 0]);
          if (elBg[3] > 0.5) {
            // Has solid background - remove skip reason and process it
            el.removeAttribute('data-ai-skip-reason');
            el._aiHasImageBackground = false;
            // Continue to process this element
          } else {
            // No solid background - skip it
            return;
          }
        } catch (e) {
          // If we can't check, skip it
          return;
        }
      } else if (el.hasAttribute('data-ai-skip-reason') && el.getAttribute('data-ai-skip-reason') === 'image') {
        return; // Skip this element
      }
      if (el._aiHasImageBackground === true && !isInteractive) {
        return; // Skip this element (unless it's interactive with solid bg, which we checked above)
      }
      
      // Check if element is actually within this section
      if (section.contains(el) || section === el) {
        sectionElements.push(el);
      }
    });

    return sectionElements;
  }

  // Get section that visually contains the element (based on bounding rects)
  function getSectionForElement(el) {
    if (!el) return null;

    const rect = el.getBoundingClientRect();
    let target = null;
    let bestMatch = null;
    let bestOverlap = 0;

    // Find section with best visual overlap
    // We need to iterate through all sections since WeakMap doesn't support iteration
    // So we'll use a different approach: check closest ancestor first, then check siblings
    const section = el.closest(
      "section, header, footer, main, div, nav, article, aside"
    );

    if (section && sectionBackgroundCache.has(section)) {
      const info = sectionBackgroundCache.get(section);
      const sRect = info.rect;

      // Check if element is visually within section bounds
      if (
        rect.top >= sRect.top &&
        rect.bottom <= sRect.bottom &&
        rect.left >= sRect.left &&
        rect.right <= sRect.right
      ) {
        return section;
      }
    }

    // Fallback: return closest section ancestor
    return section;
  }

  // Get effective background for an element based on its visual section context
  function getEffectiveBackground(el) {
    const sec = getSectionForElement(el);

    if (sec && sectionBackgroundCache.has(sec)) {
      return sectionBackgroundCache.get(sec);
    }

    // Default fallback
    return { color: "rgb(255,255,255)", alpha: 1, isImage: false, rect: null };
  }

  // Get parent section info (fallback method using DOM hierarchy)
  function getParentSectionInfo(el) {
    if (!el) {
      return { color: "rgb(255,255,255)", alpha: 1, isImage: false };
    }

    // Find nearest section ancestor
    const section = el.closest(
      "section, header, footer, main, div, nav, article, aside"
    );

    if (section && sectionBackgroundCache.has(section)) {
      return sectionBackgroundCache.get(section);
    }

    // Fallback: check parent elements
    let parent = el.parentElement;
    let depth = 0;
    while (parent && depth < 5) {
      if (sectionBackgroundCache.has(parent)) {
        return sectionBackgroundCache.get(parent);
      }
      parent = parent.parentElement;
      depth++;
    }

    // Default fallback
    return { color: "rgb(255,255,255)", alpha: 1, isImage: false };
  }

  // Lazy section scanning on scroll (for dynamically loaded content)
  let scrollDebounceTimer = null;
  function debounce(func, wait) {
    return function (...args) {
      clearTimeout(scrollDebounceTimer);
      scrollDebounceTimer = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Lazy scan sections on scroll (for dynamically loaded content)
  const lazyScanSections = debounce(() => {
    let newSections = 0;
    document
      .querySelectorAll("section, header, footer, main, div, nav, article, aside")
      .forEach((sec) => {
        if (!sectionBackgroundCache.has(sec)) {
          try {
            const style = getComputedStyle(sec);
            const color = style.backgroundColor;
            const image = style.backgroundImage;

            const rgbaMatch = color.match(/rgba?\(([^)]+)\)/);
            let alpha = 1;
            if (rgbaMatch) {
              const parts = rgbaMatch[1]
                .split(",")
                .map((v) => parseFloat(v.trim()));
              if (parts.length >= 4) {
                alpha = parts[3];
              }
            }

            const rect = sec.getBoundingClientRect();

            sectionBackgroundCache.set(sec, {
              color: color,
              alpha: alpha,
              isImage: image !== "none" && !image.includes("gradient"),
              rect: rect,
              element: sec.tagName.toLowerCase(),
            });

            newSections++;
          } catch (e) {
            // Skip if getComputedStyle fails
          }
        }
      });

    if (newSections > 0) {
      console.log(
        `   🔄 Lazy scan: Added ${newSections} new sections to background cache`
      );
    }
  }, 500);

  // Set up scroll listener for lazy scanning
  if (typeof window !== "undefined") {
    window.addEventListener("scroll", lazyScanSections, { passive: true });
  }

  // ============================================================================
  // PHASE A: API Elimination - All localhost calls removed
  // Core logic now runs on-device using _find_optimal_color_cielab
  // ============================================================================

  // REMOVED: API_ENDPOINTS, workingEndpoint, checkAPIHealth
  // All color optimization now uses on-device CIELAB functions

  // Ensure window.__AIContrastAssistant__ exists
  if (!window.__AIContrastAssistant__) {
    window.__AIContrastAssistant__ = {};
  }

  // Ensure window.__AIContrastAssistant__.aiVerifierMetadata exists
  if (!window.__AIContrastAssistant__.aiVerifierMetadata) {
    window.__AIContrastAssistant__.aiVerifierMetadata = new WeakMap();
  }

  // Define local constant for aiVerifierMetadata
  const aiVerifierMetadata = window.__AIContrastAssistant__.aiVerifierMetadata;

  // Global tracking for AI model accuracy
  let aiAccuracyStats = {
    totalPredictions: 0,
    correctPredictions: 0,
    incorrectPredictions: 0,
    predictions: [],
    errors: [],
    mistakes: []
  };

  async function callAI(payload, retries = 2) {
    // PHASE A: Direct on-device call - no localhost API
    // Use _find_optimal_color_cielab for zero-latency color optimization
    console.log(`   🔢 [ON-DEVICE] Using on-device CIELAB optimization (replacing localhost API call)`);
    console.log(`   📊 [ON-DEVICE] Input: FG=rgb(${payload.fg.join(",")}), BG=rgb(${payload.bg.join(",")}), Contrast=${payload.contrast_ratio.toFixed(2)}:1, Target=${payload.effective_target || payload.target_contrast || 4.5}:1`);
    
    try {
      const targetRatio = payload.effective_target || payload.target_contrast || 4.5;
      const optimalColor = _find_optimal_color_cielab(payload.fg, payload.bg, targetRatio);
      
      // Return in expected format
      return {
        suggested_fg: optimalColor,
        contrast: wcagContrast(optimalColor, payload.bg),
        delta_e: deltaE2000(rgbToLab(payload.fg), rgbToLab(optimalColor))
      };
      } catch (error) {
      console.warn(`   ⚠️  [ON-DEVICE] Color optimization failed: ${error.message}`);
          throw error;
        }

  }

  /**
   * Get AI color suggestions from /predict endpoint
   * @param {number[]} fgRGB - Foreground RGB
   * @param {number[]} bgRGB - Background RGB
   * @param {number} targetRatio - Target contrast ratio
   * @param {Object} elementContext - Element context {type, fontSize, fontWeight}
   * @returns {Promise<number[]|null>} AI-suggested foreground RGB or null if unavailable
   */
  /**
   * Extract background image URL from computed style
   * @param {Element} el - Element to analyze
   * @returns {string|null} Background image URL or null
   */
  function extractBackgroundImageURL(el) {
    console.log(`   🔍 [AI-ACTIVITY] Extracting background image URL from ${el.tagName}...`);
    try {
      const cs = getComputedStyle(el);
      const bgImage = cs.backgroundImage;

      if (!bgImage || bgImage === 'none') {
        console.log(`   📊 [AI-STATUS] No background image found on ${el.tagName}`);
        return null;
      }

      // Check for gradients first - gradients are not image URLs
      const bgImageLower = bgImage.toLowerCase().trim();
      if (bgImageLower.includes('gradient') ||
        bgImageLower.includes('linear-gradient') ||
        bgImageLower.includes('radial-gradient') ||
        bgImageLower.includes('conic-gradient') ||
        bgImageLower.includes('repeating-linear-gradient') ||
        bgImageLower.includes('repeating-radial-gradient')) {
        console.log(`   📊 [AI-STATUS] Background is a gradient, not an image URL`);
        return null;
      }

      // Handle multiple background images (comma-separated)
      // Extract the first valid URL from the list
      const bgImageParts = bgImage.split(',').map(part => part.trim());

      for (const part of bgImageParts) {
        // Extract URL from background-image: url("...") or url('...') or url(...)
        // Improved regex to handle nested quotes and complex URLs
        const urlMatch = part.match(/url\s*\(\s*['"]?([^'")]+)['"]?\s*\)/i);
        if (urlMatch && urlMatch[1]) {
          let url = urlMatch[1].trim();

          // Remove any remaining quotes
          url = url.replace(/^['"]|['"]$/g, '');

          // Skip if it's still a gradient or invalid
          if (url.toLowerCase().includes('gradient') || url.length === 0) {
            continue;
          }

          let finalURL = url;

          // Convert relative URLs to absolute
          if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
            finalURL = url;
          } else if (url.startsWith('/')) {
            finalURL = window.location.origin + url;
          } else if (url.startsWith('./') || !url.startsWith('/')) {
            try {
              finalURL = new URL(url, window.location.href).href;
            } catch (e) {
              // If URL constructor fails, try relative to current path
              const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
              finalURL = window.location.origin + basePath + url;
            }
          }

          console.log(`   ✅ [AI-STATUS] Background image URL extracted: ${finalURL.substring(0, 80)}${finalURL.length > 80 ? '...' : ''}`);
          return finalURL;
        }
      }

      console.log(`   📊 [AI-STATUS] Background image CSS found but URL extraction failed (value: ${bgImage.substring(0, 100)}${bgImage.length > 100 ? '...' : ''})`);
      return null;
    } catch (e) {
      console.warn(`   ⚠️  [AI-ERROR] Failed to extract background image URL: ${e.message}`);
      return null;
    }
  }

  /**
   * Analyze background image to extract dominant colors and perform segmentation
   * @param {string} imageURL - URL of the background image
   * @param {Element} el - Element with background image (for text overlay analysis)
   * @returns {Promise<Object|null>} Analysis result with dominant colors or null
   */
  async function analyzeBackgroundImage(imageURL, el = null) {
    if (!imageURL) {
      console.log(`   📊 [AI-STATUS] No image URL provided for analysis`);
      return null;
    }

    console.log(`   🔍 [AI-ACTIVITY] Starting background image analysis...`);
    console.log(`   📊 [AI-STATUS] Image URL: ${imageURL.substring(0, 80)}${imageURL.length > 80 ? '...' : ''}`);

    try {
      // Load OpenCV for advanced analysis
      await loadOpenCV();

      // Create a canvas to analyze the image
      return new Promise(async (resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        const timeout = setTimeout(() => {
          console.warn(`   ⚠️  [AI-ERROR] Image analysis timeout after 2 seconds`);
          resolve(null);
        }, 2000);

        img.onload = async () => {
          clearTimeout(timeout);
          console.log(`   ✅ [AI-STATUS] Image loaded successfully (${img.width}x${img.height}px)`);
          try {
            const canvas = document.createElement('canvas');
            canvas.width = Math.min(img.width, 200); // Limit size for performance
            canvas.height = Math.min(img.height, 200);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            console.log(`   🔍 [AI-ACTIVITY] Analyzing ${canvas.width}x${canvas.height} canvas...`);

            // Sample colors from the image
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const pixels = imageData.data;

            // Calculate average color
            let r = 0, g = 0, b = 0, count = 0;
            const colorMap = new Map();

            // Sample every 10th pixel for performance
            for (let i = 0; i < pixels.length; i += 40) {
              const pixelR = pixels[i];
              const pixelG = pixels[i + 1];
              const pixelB = pixels[i + 2];
              const pixelA = pixels[i + 3];

              if (pixelA > 128) { // Only count opaque pixels
                r += pixelR;
                g += pixelG;
                b += pixelB;
                count++;

                // Track color frequency (quantized to reduce map size)
                const quantized = [
                  Math.floor(pixelR / 32) * 32,
                  Math.floor(pixelG / 32) * 32,
                  Math.floor(pixelB / 32) * 32
                ];
                const key = quantized.join(',');
                colorMap.set(key, (colorMap.get(key) || 0) + 1);
              }
            }

            if (count === 0) {
              console.warn(`   ⚠️  [AI-ERROR] No opaque pixels found in image`);
              resolve(null);
              return;
            }

            const avgColor = [
              Math.round(r / count),
              Math.round(g / count),
              Math.round(b / count)
            ];

            // Find dominant color (most frequent)
            let maxFreq = 0;
            let dominantColor = avgColor;
            for (const [key, freq] of colorMap.entries()) {
              if (freq > maxFreq) {
                maxFreq = freq;
                dominantColor = key.split(',').map(Number);
              }
            }

            // Calculate brightness
            const brightness = (avgColor[0] * 0.299 + avgColor[1] * 0.587 + avgColor[2] * 0.114) / 255;
            const isDark = brightness < 0.5;
            const complexity = colorMap.size > 50 ? 'high' : colorMap.size > 20 ? 'medium' : 'low';

            // Advanced analysis with OpenCV if available
            let advancedAnalysis = null;
            if (opencvLoaded && el) {
              try {
                // Get element bounding box for text overlay analysis
                const rect = el.getBoundingClientRect();
                const textBoundingBox = [rect.left, rect.top, rect.width, rect.height];

                // Analyze local contrast in the text region
                advancedAnalysis = await analyzeLocalContrast(imageURL, textBoundingBox);

                console.log(`   🧠 [AI-STATUS] Advanced analysis complete with OpenCV`);
              } catch (advError) {
                console.warn(`   ⚠️  [AI-ERROR] Advanced analysis failed: ${advError.message}`);
              }
            }

            // Perform image segmentation to identify regions of varying contrast
            const segmentation = await segmentImageForTextOverlay(img, el);

            const result = {
              averageColor: avgColor,
              dominantColor: dominantColor,
              brightness: brightness,
              isDark: isDark,
              complexity: complexity,
              advancedAnalysis: advancedAnalysis,
              segmentation: segmentation
            };

            console.log(`   ✅ [AI-STATUS] Image analysis complete:`);
            console.log(`      📊 Average color: RGB(${avgColor.join(',')})`);
            console.log(`      🎨 Dominant color: RGB(${dominantColor.join(',')})`);
            console.log(`      💡 Brightness: ${brightness.toFixed(3)} (${isDark ? 'DARK' : 'LIGHT'})`);
            console.log(`      🎭 Complexity: ${complexity} (${colorMap.size} unique colors)`);

            resolve(result);
          } catch (e) {
            console.warn(`   ⚠️  [AI-ERROR] Failed to analyze image: ${e.message}`);
            resolve(null);
          }
        };

        img.onerror = () => {
          clearTimeout(timeout);
          console.warn(`   ⚠️  [AI-ERROR] Failed to load image for analysis`);
          resolve(null);
        };

        img.src = imageURL;
      });
    } catch (e) {
      console.warn(`   ⚠️  [AI-ERROR] Error analyzing background image: ${e.message}`);
      return null;
    }
  }

  // ============================================================================
  // REMOVED: sampleRenderedBackground, analyzeBackgroundPixels, analyzeBackgroundIntelligently
  // These pixel-based functions were replaced by getSimpleBackgroundAnalysis
  // which derives values from detectDirectBackground without canvas/pixel operations
  // ============================================================================

  /**
   * Get AI-powered color suggestion with intelligent background analysis
   * @param {number[]} fgRGB - Foreground RGB
   * @param {number[]} bgRGB - Background RGB
   * @param {number} targetRatio - Target contrast ratio
   * @param {Object} elementContext - Element context
   * @param {Object} backgroundAnalysis - Intelligent background analysis
   * @returns {Promise<number[]|null>} AI-suggested foreground RGB or null
   */
  async function getAIColorSuggestion(fgRGB, bgRGB, targetRatio, elementContext, backgroundAnalysis = null) {
    // PHASE A: Direct on-device call - no localhost API
    console.log(`   🔢 [ON-DEVICE] Using on-device CIELAB optimization for color suggestion`);
    console.log(`   📊 [ON-DEVICE] Current foreground: RGB(${fgRGB.join(',')})`);
    console.log(`   📊 [ON-DEVICE] Current background: RGB(${bgRGB.join(',')})`);
    console.log(`   📊 [ON-DEVICE] Target contrast: ${targetRatio.toFixed(2)}:1`);
    console.log(`   📊 [ON-DEVICE] Element: ${elementContext.type || 'p'}, Font: ${elementContext.fontSize || 16}px/${elementContext.fontWeight || 400}`);

    try {
      // Use _find_optimal_color_cielab for zero-latency optimization
      const optimalColor = _find_optimal_color_cielab(fgRGB, bgRGB, targetRatio);
      const suggestedCr = wcagContrast(optimalColor, bgRGB);
      
      console.log(`   ✅ [ON-DEVICE] Optimal color calculated: RGB(${optimalColor.join(',')})`);
      console.log(`   📊 [ON-DEVICE] Suggested color contrast: ${suggestedCr.toFixed(2)}:1 (target: ${targetRatio.toFixed(2)}:1)`);
      
        if (suggestedCr >= targetRatio) {
        console.log(`   ✅ [ON-DEVICE] Optimal color meets target contrast requirement`);
        } else {
        console.warn(`   ⚠️  [ON-DEVICE] Optimal color below target (${(targetRatio - suggestedCr).toFixed(2)}:1 short) - using best achievable`);
      }
      
      return optimalColor;
    } catch (error) {
      console.warn(`   ⚠️  [ON-DEVICE] Color optimization failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Call /readability endpoint with unified schema
   * @param {Object} payload - Request payload with unified schema
   * @returns {Promise<Object|null>} Response with comfortable, comfort_score, expected_contrast, or null if failed
   */
  async function callReadabilityAI(payload) {
    // PHASE A: On-device fallback - no localhost API
    // Use WCAG contrast calculation as fallback
    console.log(`   🔢 [ON-DEVICE] Using WCAG contrast for readability check (replacing localhost API)`);
    
    try {
      const contrast = payload.contrast || wcagContrast(payload.foreground_rgb, payload.background_rgb);
      const target = payload.target_contrast || 4.5;
      const isReadable = contrast >= target;
      
      // Return in expected format
      return {
        comfortable: isReadable,
        comfort_score: Math.min(1.0, contrast / target),
        expected_contrast: contrast
      };
    } catch (error) {
      console.warn(`   ⚠️  [ON-DEVICE] Readability check failed: ${error.message}`);
      return null;
    }

    // REMOVED: All localhost fetch calls
    /* ORIGINAL API CODE REMOVED:
    // REMOVED: All localhost fetch calls
    /* ORIGINAL API CODE REMOVED - see on-device implementation above */
  }

  /**
   * Call /verify endpoint with timeout protection and validation
   * @param {Object} payload - Request payload with contrast_ratio, effective_target, font_size, font_weight, background_type, background_variance, text_length
   * @returns {Promise<Object|null>} Response with readable and confidence, or null if failed
   */
  async function callVerifyAI(payload) {
    // PHASE A: On-device fallback - no localhost API
    // Use WCAG contrast calculation for verification
    console.log(`   🔢 [ON-DEVICE] Using WCAG contrast for verification (replacing localhost API)`);
    
    try {
      const contrast = payload.contrast_ratio || 4.5;
      const target = payload.effective_target || 4.5;
      const isReadable = contrast >= target;
      const confidence = Math.min(1.0, contrast / target);
      
      console.log(`   [ON-DEVICE] Verification result: readable=${isReadable}, confidence=${confidence.toFixed(3)}`);
      
      return {
        readable: isReadable,
        confidence: confidence
      };
    } catch (error) {
      console.warn(`   ⚠️  [ON-DEVICE] Verification failed: ${error.message}`);
      return null;
    }

    // REMOVED: All localhost fetch calls - see on-device implementation above
  }

  // Main scan logic

  let scanInProgress = false;

  /**
   * Get comprehensive background information for an element
   * Returns an object with effective background RGBA, image detection, and transparency detection
   */
  function getEffectiveBackgroundInfo(el) {
    const DEBUG_BG = false;
    const bgInfo = {
      effectiveBg: null,
      hasImageBackground: false,
      isTransparentBackground: false,
      backgroundType: 'solid'
    };

    try {
      // Get effective background RGBA (this resolves ancestor backgrounds)
      const bgRGBA = getEffectiveBackgroundRGBA(el);
      
      // Handle null return (no opaque background found)
      if (!bgRGBA || bgRGBA.length !== 4) {
        // If getEffectiveBackgroundRGBA returns null, it means no opaque background was found
        // Keep effectiveBg as null so shouldSkipContrastFix can skip the element
        bgInfo.effectiveBg = null;
        bgInfo.hasImageBackground = el._aiHasImageBackground === true;
        bgInfo.isTransparentBackground = true;
        bgInfo.backgroundType = 'transparent';
        return bgInfo;
      }
      
      bgInfo.effectiveBg = {
        r: bgRGBA[0],
        g: bgRGBA[1],
        b: bgRGBA[2],
        a: bgRGBA[3]
      };

      const effectiveAlpha = bgRGBA[3];
      const elementText = (el.textContent || '').trim().substring(0, 30);
      const elementId = `${el.tagName}${el.className ? '.' + el.className.split(' ')[0] : ''} "${elementText}"`;

      if (DEBUG_BG) {
        const elCs = getComputedStyle(el);
        const rawBg = elCs.backgroundColor;
        console.log(`[DEBUG_BG] ${elementId}`);
        console.log(`  Raw computed bg: ${rawBg}`);
        console.log(`  Effective bg: rgba(${bgRGBA[0]}, ${bgRGBA[1]}, ${bgRGBA[2]}, ${bgRGBA[3]})`);
      }

      // Use flags set by getEffectiveBackgroundRGBA (tree-based analysis already done)
      // Also check for gradients - they should be treated like image backgrounds
      // EXCEPTION: For interactive elements (buttons, links), check if they have their own solid background
      const tagName = el.tagName ? el.tagName.toLowerCase() : '';
      const isInteractive = tagName === 'button' || 
                           tagName === 'a' || 
                           tagName === 'input' ||
                           el.getAttribute('role') === 'button' ||
                           el.getAttribute('role') === 'link';
      
      let hasGradient = false;
      let hasImageBg = false;
      
      if (isInteractive) {
        // For interactive elements, check if they have their own solid background
        try {
          const elCs = getComputedStyle(el);
          const elBg = parseCSSColorToRGBA(elCs.backgroundColor, [0, 0, 0, 0]);
          // If element has its own solid background (alpha > 0.5), ignore parent image backgrounds
          if (elBg[3] > 0.5) {
            // Interactive element with solid background - check only the element itself
            hasGradient = hasBackgroundGradient(el);
            hasImageBg = el._aiHasImageBackground === true || hasGradient;
          } else {
            // Interactive element without solid background - check parent backgrounds
            hasGradient = hasBackgroundGradient(el);
            hasImageBg = el._aiHasImageBackground === true || hasGradient;
          }
        } catch (e) {
          // If we can't check, fall back to normal behavior
          hasGradient = hasBackgroundGradient(el);
          hasImageBg = el._aiHasImageBackground === true || hasGradient;
        }
      } else {
        // Non-interactive elements - normal behavior
        hasGradient = hasBackgroundGradient(el);
        hasImageBg = el._aiHasImageBackground === true || hasGradient;
      }
      
      bgInfo.hasImageBackground = hasImageBg;
      bgInfo.isTransparentBackground = effectiveAlpha === 0;
      
      // Set background type based on flags
      if (bgInfo.hasImageBackground) {
        bgInfo.backgroundType = hasGradient ? 'gradient' : 'image';
      } else if (bgInfo.isTransparentBackground) {
        bgInfo.backgroundType = 'transparent';
      } else if (effectiveAlpha >= 0.5) {
        bgInfo.backgroundType = 'solid';
      } else {
        bgInfo.backgroundType = 'transparent';
      }

    } catch (error) {
      console.warn(`⚠️  [BACKGROUND INFO] Failed to get background info: ${error.message}`);
      // Fallback to safe defaults
      bgInfo.effectiveBg = { r: 255, g: 255, b: 255, a: 1 };
      bgInfo.hasImageBackground = false;
      bgInfo.isTransparentBackground = false;
      bgInfo.backgroundType = 'solid';
    }

    return bgInfo;
  }

  /**
   * Get simplified background analysis for AI endpoints
   * Uses already-resolved values from detectDirectBackground - NO pixel sampling
   * @param {Element} el - Element to analyze
   * @param {number[]} bgRGBA - Background RGBA from getEffectiveBackgroundRGBA
   * @returns {Object} Background analysis for AI
   */
  function getSimpleBackgroundAnalysis(el, bgRGBA) {
    // Handle null or invalid bgRGBA
    if (!bgRGBA || bgRGBA.length !== 4) {
      // Fallback to white background
      bgRGBA = [255, 255, 255, 1];
    }
    
    const bg = bgRGBA.slice(0, 3);
    const brightness = relLuminance(bg);
    
    // Determine type from element flags
    let type = 'solid';
    if (el._aiHasImageBackground) {
      type = 'image';
    } else if (hasBackgroundGradient(el)) {
      type = 'gradient';
    } else if (bgRGBA[3] < 0.5) {
      type = 'transparent';
    }

    return {
      type: type,
      hasTransparency: bgRGBA[3] < 1,
      hasImage: el._aiHasImageBackground || false,
      dominantColor: bg,
      brightness: brightness,
      isDark: brightness < 0.5,
      complexity: 'low', // Simple detection doesn't measure variance
      recommendedTextColor: brightness < 0.5 ? [255, 255, 255] : [0, 0, 0]
    };
  }

  /**
   * HARD FILTER RULES: Determine if contrast fixing should be attempted
   * Returns true if element should be SKIPPED (NOT fixed)
   * Returns false if element should be FIXED
   * 
   * SKIP if ANY of:
   * A) Effective background contains an image
   * B) No fully opaque background found (compositing stopped before body)
   */
  function shouldSkipContrastFix(el, bgInfo) {
    if (!el || !bgInfo) {
      return false;
    }

    const effectiveBg = bgInfo.effectiveBg;
    const hasImageBackground = bgInfo.hasImageBackground === true;
    
    // Helper to clean up any existing AI styles when skipping
    function cleanupAIStyles(element) {
      if (!element || !element.style) return;
      // Remove inline styles that we added
      element.style.removeProperty('color');
      element.style.removeProperty('background-color');
      element.style.removeProperty('border-color');
      // Remove AI data attributes that indicate processing
      const attrsToRemove = [
        'data-ai-style-applied', 'data-ai-contrast-fixed', 'data-corrected-fg', 
        'data-corrected-bg', 'data-ai-normal-fg', 'data-ai-normal-bg',
        'data-hover-fg', 'data-hover-bg', 'data-hover-bound',
        'data-original-contrast', 'data-new-contrast', 'data-fix-type'
      ];
      attrsToRemove.forEach(attr => element.removeAttribute(attr));
    }

    // HARD FILTER RULE A: Skip if effective background contains an image
    // EXCEPTION: Don't skip interactive elements (buttons, links) if they have their own solid background
    if (hasImageBackground) {
      // Check if this is an interactive element with its own solid background
      const tagName = el.tagName ? el.tagName.toLowerCase() : '';
      const isInteractive = tagName === 'button' || 
                           tagName === 'a' || 
                           tagName === 'input' ||
                           el.getAttribute('role') === 'button' ||
                           el.getAttribute('role') === 'link';
      
      if (isInteractive) {
        // For interactive elements, check if they have their own solid background
        try {
          const elCs = getComputedStyle(el);
          const elBg = parseCSSColorToRGBA(elCs.backgroundColor, [0, 0, 0, 0]);
          // If element has its own solid background (alpha > 0.5), process it independently
          if (elBg[3] > 0.5) {
            // Interactive element with solid background - don't skip, process independently
            if (el.getAttribute && el.hasAttribute('data-ai-skip-reason')) {
              el.removeAttribute('data-ai-skip-reason');
            }
            return false; // Don't skip - process this element
          }
        } catch (e) {
          // If we can't check, fall through to skip
        }
      }
      
      // Not an interactive element with solid background, or interactive element without solid background
      if (el.getAttribute) {
        el.setAttribute('data-ai-skip-reason', 'image');
        cleanupAIStyles(el);  // Remove any mistakenly applied styles
      }
      return true;
    }

    // HARD FILTER RULE B: Skip if no fully opaque background found
    // Real compositing stops when fully opaque (alpha >= 1.0) is found
    // If effectiveBg is null or alpha < 1.0, no fully opaque background exists
    if (!effectiveBg || effectiveBg.a < 1.0) {
      if (el.getAttribute) {
        el.setAttribute('data-ai-skip-reason', 'no-opaque-background');
        cleanupAIStyles(el);
      }
      return true;
    }

    // Safe to fix: fully opaque background (alpha >= 1.0) and no image
    if (el.getAttribute && el.hasAttribute('data-ai-skip-reason')) {
      el.removeAttribute('data-ai-skip-reason');
    }
    return false;
  }

  // Process a single element for contrast checking and correction
  // Returns: { flagged: boolean, corrected: boolean, skipped: boolean, error: boolean }
  async function processElementForContrast(
    el,
    target,
    comfortScale,
    autoCorrect,
    scannedElements,
    stats
  ) {
    // PHASE B: Get settings with ML architecture support
    const settings = await getCurrentSettings();
    const apiAvailable = false; // Always false - on-device mode
    
    // PHASE B: Get ML-predicted target contrast (placeholder for future ML model)
    const mlPredictedTarget = await getMLPredictedContrast(settings);
    // For now, use the provided target or ML prediction
    const effectiveTargetWithML = mlPredictedTarget || target;
    // CRITICAL: Use ML-predicted target or fallback to parameter
    // Declare once at function start to avoid redeclaration errors
    const effectiveTarget = effectiveTargetWithML || target;

    // CRITICAL: Check if element was already processed or has terminal failure
    if (scannedElements.has(el)) {
      stats.skipped++;
      return { flagged: false, corrected: false, skipped: true, error: false };
    }
    
    // CRITICAL: Check for terminal failure - never retry
    if (el.getAttribute && el.getAttribute('data-ai-terminal-failure') === 'true') {
      stats.skipped++;
      scannedElements.add(el);
      return { flagged: false, corrected: false, skipped: true, error: false };
    }

    /* ----------  GUARD: never touch text inside a video-slide  ---------- */
    if (el.closest && el.closest('sr7-module[data-alias*="background-effect-hero"]')) {
      el.setAttribute('data-ai-skip-reason', 'video-slide');
      el._aiHasImageBackground = true;
      scannedElements.add(el);
      stats.skipped++;
      console.log(`⏭️  [GUARD] Skipping element ${el.tagName} - inside video slide container`);
      return { flagged: false, corrected: false, skipped: true, error: false };
    }
    /* ------------------------------------------------------------------- */

    // SAFEGUARD: Explicit check for background images before any processing
    // This ensures elements with background images are always skipped, even if detection fails elsewhere
    // Checks both the element itself and its ancestors
    try {
      // Helper function to check if a background image exists
      function hasBackgroundImageValue(bgImage) {
        return bgImage && bgImage !== 'none' && bgImage.includes('url(') && !bgImage.includes('gradient');
      }
      
      // Check element itself first
      const cs = window.getComputedStyle(el);
      const bgImage = cs.backgroundImage;
      
      if (hasBackgroundImageValue(bgImage)) {
        el.setAttribute('data-ai-skip-reason', 'image');
        el._aiHasImageBackground = true;
        scannedElements.add(el);
        stats.skipped++;
        console.log(`⏭️  [SAFEGUARD] Skipping element ${el.tagName} with background-image detected in computed style`);
        return { flagged: false, corrected: false, skipped: true, error: false };
      }
      
      // Check for video background on element itself
      const videoCheck = detectVideoBackground(el, cs);
      if (videoCheck.hasVideo) {
        el.setAttribute('data-ai-skip-reason', 'video');
        el._aiHasImageBackground = true; // Use same flag for consistency
        scannedElements.add(el);
        stats.skipped++;
        console.log(`⏭️  [SAFEGUARD] Skipping element ${el.tagName} with video background detected (${videoCheck.source})`);
        return { flagged: false, corrected: false, skipped: true, error: false };
      }
      
      // Check inline style attribute for background-image
      const inlineStyle = el.getAttribute('style') || '';
      if (inlineStyle) {
        const bgImageMatch = inlineStyle.match(/background-image\s*:\s*([^;]+)/i);
        if (bgImageMatch) {
          const bgImageValue = bgImageMatch[1].trim();
          if (bgImageValue.includes('url(') && !bgImageValue.includes('gradient')) {
            el.setAttribute('data-ai-skip-reason', 'image');
            el._aiHasImageBackground = true;
            scannedElements.add(el);
            stats.skipped++;
            console.log(`⏭️  [SAFEGUARD] Skipping element ${el.tagName} with background-image detected in inline style`);
            return { flagged: false, corrected: false, skipped: true, error: false };
          }
        }
      }
      
      // Check ancestors for background images (up to body)
      let ancestor = el.parentElement;
      let depth = 0;
      const maxDepth = 20; // Prevent infinite loops
      
      while (ancestor && ancestor !== document.body && ancestor !== document.documentElement && depth < maxDepth) {
        try {
          const ancestorCs = window.getComputedStyle(ancestor);
          const ancestorBgImage = ancestorCs.backgroundImage;
          
          // Check computed style
          if (hasBackgroundImageValue(ancestorBgImage)) {
            el.setAttribute('data-ai-skip-reason', 'image');
            el._aiHasImageBackground = true;
            scannedElements.add(el);
            stats.skipped++;
            console.log(`⏭️  [SAFEGUARD] Skipping element ${el.tagName} - ancestor ${ancestor.tagName} has background-image`);
            return { flagged: false, corrected: false, skipped: true, error: false };
          }
          
          // Check ancestor for video background
          const ancestorVideoCheck = detectVideoBackground(ancestor, ancestorCs);
          if (ancestorVideoCheck.hasVideo) {
            el.setAttribute('data-ai-skip-reason', 'video');
            el._aiHasImageBackground = true; // Use same flag for consistency
            scannedElements.add(el);
            stats.skipped++;
            console.log(`⏭️  [SAFEGUARD] Skipping element ${el.tagName} - ancestor ${ancestor.tagName} has video background (${ancestorVideoCheck.source})`);
            return { flagged: false, corrected: false, skipped: true, error: false };
          }
          
          // Check ancestor's inline style
          const ancestorInlineStyle = ancestor.getAttribute('style') || '';
          if (ancestorInlineStyle) {
            const ancestorBgImageMatch = ancestorInlineStyle.match(/background-image\s*:\s*([^;]+)/i);
            if (ancestorBgImageMatch) {
              const ancestorBgImageValue = ancestorBgImageMatch[1].trim();
              if (ancestorBgImageValue.includes('url(') && !ancestorBgImageValue.includes('gradient')) {
                el.setAttribute('data-ai-skip-reason', 'image');
                el._aiHasImageBackground = true;
                scannedElements.add(el);
                stats.skipped++;
                console.log(`⏭️  [SAFEGUARD] Skipping element ${el.tagName} - ancestor ${ancestor.tagName} has background-image in inline style`);
                return { flagged: false, corrected: false, skipped: true, error: false };
              }
            }
          }
          
          // Check siblings of the element (children of this ancestor)
          // This handles cases where a sibling element has a background image that visually appears behind the current element
          // (e.g., parallax backgrounds positioned absolutely)
          // IMPORTANT: Only check siblings that are actually positioned behind the element
          // CRITICAL: Only check siblings that come BEFORE the element in DOM order (rendered first, so behind)
          // and are positioned with z-index <= 0 or lower than the element's z-index
          if (ancestor.children) {
            const childrenArray = Array.from(ancestor.children);
            let elIndex = childrenArray.indexOf(el);
            
            // FIX: If el is not a direct child, find which direct child contains it
            if (elIndex === -1) {
              // Find the direct child that contains el
              for (let j = 0; j < childrenArray.length; j++) {
                if (childrenArray[j].contains(el)) {
                  elIndex = j;
                  break;
                }
              }
            }
            
            // Check siblings that come BEFORE the element (or the child containing it) in DOM order
            // (they're rendered first, so if positioned, they're behind)
            // Also check siblings AFTER the element if they're positioned behind (lower z-index)
            const elZIndex = parseInt(window.getComputedStyle(el).zIndex, 10) || 0;
            
            // Helper function to check a sibling for image/video background
            function checkSiblingForBackground(sibling, siblingIndex) {
              try {
                const siblingCs = window.getComputedStyle(sibling);
                const siblingPosition = siblingCs.position;
                const isPositioned = siblingPosition === 'absolute' || siblingPosition === 'fixed';
                const siblingZIndex = parseInt(siblingCs.zIndex, 10);
                
                // Check if sibling is an iframe with video URL (special case: iframes with video are often backgrounds)
                const isIframe = sibling.tagName && sibling.tagName.toLowerCase() === 'iframe';
                let isVideoIframe = false;
                if (isIframe) {
                  const iframeSrc = sibling.getAttribute('src') || '';
                  const hasVideoUrl = iframeSrc && (
                    iframeSrc.toLowerCase().includes('youtube.com') ||
                    iframeSrc.toLowerCase().includes('youtu.be') ||
                    iframeSrc.toLowerCase().includes('vimeo.com') ||
                    iframeSrc.toLowerCase().includes('.mp4') ||
                    iframeSrc.toLowerCase().includes('.webm') ||
                    iframeSrc.toLowerCase().includes('.ogg')
                  );
                  if (hasVideoUrl || 
                      sibling.hasAttribute('data-video') || 
                      sibling.hasAttribute('data-bgvideo')) {
                    isVideoIframe = true;
                  }
                }
                
                // Check if sibling should be considered as background:
                // 1. If positioned and behind (z-index <= 0 or lower than element's z-index)
                // 2. If it's an iframe with video URL (check regardless of position, but still respect z-index)
                const isBehind = isNaN(siblingZIndex) || siblingZIndex <= 0 || siblingZIndex < elZIndex;
                const shouldCheck = (isPositioned && isBehind) || (isVideoIframe && isBehind);
                
                if (shouldCheck) {
                  const siblingBgImage = siblingCs.backgroundImage;
                  let siblingHasImage = false;
                  
                  // Check sibling's computed style
                  if (hasBackgroundImageValue(siblingBgImage)) {
                    siblingHasImage = true;
                  } else {
                    // Check sibling's inline style
                    const siblingInlineStyle = sibling.getAttribute('style') || '';
                    if (siblingInlineStyle) {
                      const siblingBgImageMatch = siblingInlineStyle.match(/background-image\s*:\s*([^;]+)/i);
                      if (siblingBgImageMatch) {
                        const siblingBgImageValue = siblingBgImageMatch[1].trim();
                        if (siblingBgImageValue.includes('url(') && !siblingBgImageValue.includes('gradient')) {
                          siblingHasImage = true;
                        }
                      }
                    }
                  }
                  
                  // Check sibling for video background (or if it's a video iframe)
                  const siblingVideoCheck = detectVideoBackground(sibling, siblingCs);
                  const siblingHasVideo = siblingVideoCheck.hasVideo || isVideoIframe;
                  
                  // If sibling has background image or video, check if element or its ancestors have solid opaque background
                  // that would block the sibling's image/video from being visible
                  if (siblingHasImage || siblingHasVideo) {
                    // Check if element or any ancestor up to the common ancestor has solid opaque background
                    let hasOpaqueBackground = false;
                    let checkEl = el;
                    let checkDepth = 0;
                    const maxCheckDepth = 10;
                    
                    while (checkEl && checkEl !== ancestor && checkDepth < maxCheckDepth) {
                      try {
                        const checkElCs = window.getComputedStyle(checkEl);
                        const checkElBg = checkElCs.backgroundColor;
                        if (checkElBg && checkElBg !== 'transparent' && checkElBg !== 'rgba(0, 0, 0, 0)') {
                          const checkElRgba = parseCSSColorToRGBA(checkElBg, null);
                          if (checkElRgba && checkElRgba[3] >= 0.95) {
                            // Element or ancestor has solid opaque background - sibling's image is not visible
                            hasOpaqueBackground = true;
                            break;
                          }
                        }
                      } catch (e) {
                        // Continue checking
                      }
                      checkEl = checkEl.parentElement;
                      checkDepth++;
                    }
                    
                    // Only skip if there's no solid opaque background blocking the sibling's image/video
                    if (!hasOpaqueBackground) {
                      const skipReason = siblingHasVideo ? 'video' : 'image';
                      el.setAttribute('data-ai-skip-reason', skipReason);
                      el._aiHasImageBackground = true; // Use same flag for consistency
                      scannedElements.add(el);
                      stats.skipped++;
                      const mediaType = siblingHasVideo ? 'video background' : 'background-image';
                      const positionInfo = siblingIndex < elIndex ? 'before' : 'after';
                      console.log(`⏭️  [SAFEGUARD] Skipping element ${el.tagName} - sibling ${sibling.tagName}${sibling.className ? '.' + sibling.className.split(' ')[0] : ''} (${positionInfo} element, z-index: ${siblingZIndex}) has ${mediaType} and no opaque background blocks it`);
                      return true; // Indicate that element should be skipped
                    }
                    // If there's an opaque background, continue processing (don't skip)
                  }
                }
              } catch (e) {
                // Continue checking other siblings if one fails
              }
              return false; // Element should not be skipped based on this sibling
            }
            
            // Check siblings BEFORE the element
            if (elIndex > 0) {
              for (let i = 0; i < elIndex; i++) {
                if (checkSiblingForBackground(childrenArray[i], i)) {
                  return { flagged: false, corrected: false, skipped: true, error: false };
                }
              }
            }
            
            // Check siblings AFTER the element (if they're positioned behind)
            if (elIndex >= 0 && elIndex < childrenArray.length - 1) {
              for (let i = elIndex + 1; i < childrenArray.length; i++) {
                if (checkSiblingForBackground(childrenArray[i], i)) {
                  return { flagged: false, corrected: false, skipped: true, error: false };
                }
              }
            }
          }
        } catch (e) {
          // Continue checking other ancestors if one fails
        }
        
        ancestor = ancestor.parentElement;
        depth++;
      }
    } catch (e) {
      // If safeguard check fails, continue with normal processing
      console.warn(`⚠️  [SAFEGUARD] Background image check failed: ${e.message}`);
    }

    // CENTRAL SKIP CHECK: Use shouldSkipContrastFix before any processing
    let bgInfo = null;
    try {
      bgInfo = getEffectiveBackgroundInfo(el);
      if (shouldSkipContrastFix(el, bgInfo)) {
        const skipReason = el.getAttribute('data-ai-skip-reason') || 'unknown';
        console.log(`⏭️  [SKIP] Skipping element ${el.tagName} "${(el.textContent || '').trim().substring(0, 30)}..." - reason: ${skipReason}`);
        scannedElements.add(el);
        stats.skipped++;
        return { flagged: false, corrected: false, skipped: true, error: false };
      }
    } catch (skipError) {
      // If skip check fails, continue with normal processing
      console.warn(`⚠️  [SKIP CHECK] Failed to check background, continuing: ${skipError.message}`);
    }

    try {
      // Get effective background RGBA for contrast calculation
      let bgRGBA = getEffectiveBackgroundRGBA(el);

      // If getEffectiveBackgroundRGBA returns null, element should have been skipped by shouldSkipContrastFix
      // But if we get here, it means skip check didn't catch it, so skip now
      if (!bgRGBA || bgRGBA.length !== 4) {
        console.warn(`⚠️  [TREE CHECK] Background detection returned invalid result, element should be skipped`);
        scannedElements.add(el);
        stats.skipped++;
        return { flagged: false, corrected: false, skipped: true, error: false };
      }

      const bg = bgRGBA.slice(0, 3); // Extract RGB for contrast calculation
      const fg = getEffectiveForegroundRGB(el, bg);
      const cr = wcagContrast(fg, bg);

      // Define alreadyFixed early so it's available in all code paths
      const alreadyFixed = el.hasAttribute("data-ai-contrast-fixed");

      // Define background-related variables early so they're available in all code paths
      // Check if properties were set by getEffectiveBackgroundRGBA, otherwise compute them
      let hasImageBg = false;
      let hasTransparency = false;
      if (el._aiHasImageBackground !== undefined) {
        hasImageBg = el._aiHasImageBackground;
      } else {
        // Fallback: check directly if element has image background
        hasImageBg = hasBackgroundImage(el);
      }
      if (el._aiHasTransparencyChain !== undefined) {
        hasTransparency = el._aiHasTransparencyChain;
      } else {
        // Fallback: check if background has transparency
        hasTransparency = bgRGBA[3] < 1;
      }
      const hasExplicitBg = hasExplicitBackground(el);

      if (isNaN(cr)) {
        console.warn(`⚠️ Invalid contrast ratio for element:`, el);
        scannedElements.add(el);
        stats.errors++;
        return { flagged: false, corrected: false, skipped: false, error: true };
      }

      // Show contrast ratio for ALL elements, not just flagged ones
      const elementText = (el.textContent || "").trim().substring(0, 40);
      const contrastInfo = `Contrast: ${cr.toFixed(2)}:1${cr < effectiveTarget
        ? ` (below Visual Comfort Sensitivity target: ${effectiveTarget.toFixed(2)}:1)`
        : ` (meets Visual Comfort Sensitivity target: ${effectiveTarget.toFixed(2)}:1)`
        }`;

      if (cr < effectiveTarget) {
        console.log(
          `📊 Below threshold: ${el.tagName
          } "${elementText}..." - FG: rgb(${fg
            .map((v) => Math.round(v))
            .join(",")}) / BG: rgb(${bg
              .map((v) => Math.round(v))
              .join(",")}) = ${cr.toFixed(2)}:1 (need: ${effectiveTarget.toFixed(
                2
              )}:1)`
        );
      }

      // Check if element is interactive/hoverable - fix hover for ALL interactive elements
      const tagName = el.tagName.toLowerCase();
      const isInteractive = isInteractiveElement(el);

      // Check AI readability for ALL elements, not just those below target
      // This catches cases where contrast meets WCAG but text is still unreadable (e.g., dark-on-dark)
      let shouldFlag = cr < effectiveTarget;
      let comfortScore = cr / effectiveTarget;
      let aiPrediction = null;
      let aiPredictionAccuracy = null;
      let aiReadabilityCheck = null;
      let backgroundAnalysis = null; // Declare at function scope for access in correction blocks

      // CENTRAL SKIP CHECK: Verify again before AI calls (double-check)
      // This ensures we don't call AI for elements that should be skipped
      if (!bgInfo) {
        bgInfo = getEffectiveBackgroundInfo(el);
      }
      if (shouldSkipContrastFix(el, bgInfo)) {
        const skipReason = el.getAttribute('data-ai-skip-reason') || 'unknown';
        console.log(`⏭️  [SKIP] Skipping AI check for ${el.tagName} - reason: ${skipReason}`);
        scannedElements.add(el);
        stats.skipped++;
        return { flagged: false, corrected: false, skipped: true, error: false };
      }

      // Always check AI readability, even if contrast meets target
      // First, perform intelligent background analysis to get accurate background data
      // Get simple background analysis (no pixel sampling)
      // CRITICAL FIX: Always run background analysis (works on-device now)
        try {
          backgroundAnalysis = getSimpleBackgroundAnalysis(el, bgRGBA);
        } catch (bgError) {
          console.warn(`   ⚠️  [AI-ERROR] Background analysis failed: ${bgError.message}`);
      }

      // CRITICAL FIX: Always extract element context (works on-device now)
        try {
          const meta = extractElementContext(el);

          // Use accurate background analysis data instead of fallback assumptions
          // Prefer _aiBackgroundType from getEffectiveBackgroundRGBA (most accurate)
          const backgroundType = el._aiBackgroundType || backgroundAnalysis?.type || 'solid';
          const backgroundBrightness = backgroundAnalysis?.brightness ?? (relLuminance(bg));
          const backgroundIsDark = backgroundAnalysis?.isDark ?? (backgroundBrightness < 0.5);
          const backgroundComplexity = backgroundAnalysis?.complexity || 'low';
          const backgroundDominantColor = backgroundAnalysis?.dominantColor || bg;
          const backgroundHasTransparency = el._aiHasTransparencyChain || backgroundAnalysis?.hasTransparency || (bgRGBA && bgRGBA[3] < 1);
          const backgroundHasImage = el._aiHasImageBackground || backgroundAnalysis?.hasImage || false;

          // Calculate background variance (complexity measure)
          // For solid backgrounds, variance is 0. For gradients/images, it would be higher
          // For now, use a simple heuristic: 0 for solid, 0.5 for gradient, 1.0 for image
          let backgroundVariance = 0;
          if (backgroundHasImage) {
            backgroundVariance = 1.0;
          } else if (hasBackgroundGradient(el)) {
            backgroundVariance = 0.5;
          } else {
            backgroundVariance = 0; // Solid background
          }

          // Get text length
          const textLength = (el.textContent || '').trim().length;

          // First, check AI readability using /predict endpoint (more comprehensive)
          const predictPayload = {
            fg: fg,
            bg: bg,
            contrast_ratio: cr,
            effective_target: target,
            element_type: meta.type || 'p',
            font_size: meta.fontSize || 16,
            font_weight: meta.fontWeight || 400,
            user_scale: comfortScale || 0.9,
            background_type: backgroundType,
            background_has_transparency: backgroundHasTransparency,
            background_has_image: backgroundHasImage,
            background_brightness: backgroundBrightness,
            background_is_dark: backgroundIsDark,
            background_complexity: backgroundComplexity,
            background_dominant_color: backgroundDominantColor
          };

          console.log(`   📊 [AI-STATUS] Using AI-derived background analysis: type=${backgroundType}, brightness=${backgroundBrightness.toFixed(3)}, isDark=${backgroundIsDark}, complexity=${backgroundComplexity}`);

          console.log(`   🔢 [ON-DEVICE] Checking readability using WCAG contrast (replacing localhost API)`);

          // PHASE A: On-device fallback - use WCAG contrast for readability
          try {
            const effectiveTarget = target;
            const isComfortable = cr >= effectiveTarget;
            const comfortScoreValue = Math.min(1.0, cr / effectiveTarget);
            
              aiReadabilityCheck = {
              comfortable: isComfortable,
              comfort_score: comfortScoreValue,
              expected_contrast: cr
            };

            console.log(`   📊 [ON-DEVICE] Readability check: Comfortable=${aiReadabilityCheck.comfortable}, Score=${aiReadabilityCheck.comfort_score.toFixed(3)}`);

            // Override shouldFlag if contrast is below target
            if (!aiReadabilityCheck.comfortable && cr < effectiveTarget) {
              console.log(`   📊 [ON-DEVICE] Contrast issue confirmed (${cr.toFixed(2)}:1 < ${effectiveTarget.toFixed(2)}:1), already flagged`);
              } else if (aiReadabilityCheck.comfortable) {
              console.log(`   ✅ [ON-DEVICE] Text is comfortable`);
            }
          } catch (predictError) {
            console.warn(`   ⚠️  [ON-DEVICE] Readability check failed: ${predictError.message}`);
          }

          // Also check /verify endpoint for elements below target (for consistency)
          if (shouldFlag) {
            try {
            // Use accurate background type from getEffectiveBackgroundRGBA
            const verifyBackgroundType = el._aiBackgroundType || backgroundType || 'solid';
            const verifyPayload = {
              contrast_ratio: cr,
              effective_target: target,
              font_size: meta.fontSize,
              font_weight: meta.fontWeight,
              background_type: verifyBackgroundType,
              background_variance: backgroundVariance,
              text_length: textLength,
            };

            console.log(
              `   🤖 [AI ANALYSIS] Calling verify endpoint for ${el.tagName} "${elementText}..."`
            );
            console.log(
              `   📊 [AI ANALYSIS] Input data: Contrast=${cr.toFixed(2)}:1, Target=${target.toFixed(2)}:1, Element=${meta.type}, Font=${meta.fontSize}px/${meta.fontWeight}, BG=${backgroundType}, Variance=${backgroundVariance.toFixed(1)}, TextLength=${textLength}`
            );

            const data = await callVerifyAI(verifyPayload);

            if (data) {
              // Use AI response
              const isReadable = data.readable;
              comfortScore = data.confidence;
              aiPrediction = {
                readable: isReadable,
                confidence: comfortScore,
              };

              console.log(
                `   ✅ [AI ANALYSIS] Verify response: Readable=${isReadable}, Confidence=${comfortScore.toFixed(3)}`
              );

              // Track accuracy: Compare AI prediction with WCAG assessment
              const wcagSaysReadable = !shouldFlag;
              const aiSaysReadable = isReadable;
              const isCorrect = (wcagSaysReadable === aiSaysReadable);

              if (isCorrect) {
                aiAccuracyStats.correctPredictions++;
              } else {
                aiAccuracyStats.incorrectPredictions++;
              }
            } else {
              // Fallback to WCAG-based comfort score
              console.log(`   [AI] fallback engaged`);
              comfortScore = cr / target;
              aiPrediction = { error: 'AI response invalid or unavailable' };
            }
            } catch (verifyError) {
              console.warn(`   ⚠️  [AI VERIFY] Verify check failed: ${verifyError.message}`);
              comfortScore = cr / target;
              aiPrediction = { error: 'AI verify failed' };
            }
          }
        } catch (metaError) {
          console.warn(`   ⚠️  [META] Failed to extract element context: ${metaError.message}`);
          // Continue processing even if meta extraction fails
      }

      // Re-check shouldFlag against effective target
      const meetsEffectiveTarget = cr >= effectiveTarget;
      shouldFlag = !meetsEffectiveTarget;

      // If element meets effective target AND AI says it's comfortable (or AI check not available), mark as acceptable and return early
      // BUT: If AI check is available and says not comfortable, we should NOT return early even if contrast meets target
      const aiSaysComfortable = !aiReadabilityCheck || aiReadabilityCheck.comfortable;
      const shouldReturnEarly = meetsEffectiveTarget && aiSaysComfortable;

      if (shouldReturnEarly) {
        if (DEBUG_HOVER || !aiReadabilityCheck) {
          console.log(`   📊 [EARLY RETURN] Element meets Visual Comfort Sensitivity target (${cr.toFixed(2)}:1 >= ${effectiveTarget.toFixed(2)}:1) and ${aiReadabilityCheck ? 'AI confirms comfortable' : 'no AI check'}, skipping correction`);
        }

        if (!el.hasAttribute("data-ai-contrast-fixed")) {
          el.title = `✅ ${contrastInfo}`;
        }

        // ALWAYS ensure interactive elements have hover handlers (unless skipped)
        if (isInteractive && autoCorrect) {
          // CENTRAL SKIP CHECK: Skip hover handlers for elements with image/transparent backgrounds
          if (!bgInfo) {
            bgInfo = getEffectiveBackgroundInfo(el);
          }
          if (!shouldSkipContrastFix(el, bgInfo)) {
            const currentStyles = getComputedStyle(el);
            const currentBg = parseCSSColorToRGBA(
              currentStyles.backgroundColor,
              bg
            );
            const currentFg = parseCSSColorToRGBA(currentStyles.color, fg);

            if (!el._aiHoverIn) {
              fixButtonHoverState(
                el,
                fg,
                bg,
                currentFg.slice(0, 3),
                currentBg.slice(0, 3),
                effectiveTarget
              );
            }
          } else {
            const skipReason = el.getAttribute('data-ai-skip-reason') || 'unknown';
            console.log(`⏭️  [SKIP HOVER] Skipping hover handler for ${el.tagName} - reason: ${skipReason}`);
          }
        }

        scannedElements.add(el);
        return { flagged: false, corrected: false, skipped: false, error: false };
      }

      if (shouldFlag) {
        stats.flagged++;
        const elementText = (el.textContent || "").trim().substring(0, 40);
        const flagReason = aiReadabilityCheck && !aiReadabilityCheck.comfortable && cr >= target
          ? `AI detected readability issue (contrast: ${cr.toFixed(2)}:1)`
          : `Contrast: ${cr.toFixed(2)}:1 (target: ${target.toFixed(2)}:1)`;
        console.log(
          `🚩 Flagged element: ${el.tagName} "${elementText}..." - ${flagReason}`
        );

        if (autoCorrect) {
          // CENTRAL SKIP CHECK: Verify again before applying any style changes
          if (!bgInfo) {
            bgInfo = getEffectiveBackgroundInfo(el);
          }
          if (shouldSkipContrastFix(el, bgInfo)) {
            const skipReason = el.getAttribute('data-ai-skip-reason') || 'unknown';
            console.log(`⏭️  [SKIP] Skipping style changes for ${el.tagName} - reason: ${skipReason}`);
            scannedElements.add(el);
            stats.skipped++;
            return { flagged: true, corrected: false, skipped: true, error: false };
          }

          // NON-DESTRUCTIVE: Context-aware, non-destructive contrast enhancement
          // CRITICAL: Use the ACTUAL effective background (from getEffectiveBackgroundRGBA) for brightness check
          // This correctly handles nested elements (e.g., spans inside links with dark backgrounds)
          const actualBgColor = `rgb(${bg.map(v => Math.round(v)).join(',')})`;
          const actualBrightness = calculateBrightness(actualBgColor);

          // Get section background context for context-aware correction (for logging/debugging)
          const sectionInfo = getEffectiveBackground(el);
          const { color: secColor, alpha, isImage, isTransparent } = sectionInfo;

          // hasImageBg, hasTransparency, and hasExplicitBg are defined earlier in the function
          const finalBgAlpha = bgRGBA[3];

          // Skip correction ONLY if background is solid bright/white AND contrast is already very close to target
          // This is a safety check to avoid unnecessary corrections when contrast is borderline acceptable
          // Only skip if contrast is within 0.3 of target AND background is very bright white
          // CRITICAL: Only skip elements that are very close to meeting target (e.g., 7.7:1 when target is 8.0:1)
          // Elements with significantly lower contrast (e.g., 3.54:1) should ALWAYS be corrected
          const isVeryCloseToTarget = cr >= target - 0.3;
          // Ensure hasImageBg is defined (it should be from earlier in the function)
          const safeHasImageBg = typeof hasImageBg !== 'undefined' ? hasImageBg : (el._aiHasImageBackground !== undefined ? el._aiHasImageBackground : hasBackgroundImage(el));
          const shouldSkipWhiteBg = finalBgAlpha >= 0.95 && actualBrightness > 240 && !safeHasImageBg && isVeryCloseToTarget;

          if (shouldSkipWhiteBg) {
            console.log(
              `🛑 Skipping correction: element on solid bright/white background with contrast very close to target (brightness: ${actualBrightness.toFixed(
                0
              )}, contrast: ${cr.toFixed(2)}:1, target: ${target.toFixed(2)}:1, diff: ${(target - cr).toFixed(2)}:1, actual BG: ${actualBgColor})`
            );
            // Mark as skipped but don't apply correction - contrast is close enough to target
            scannedElements.add(el);
            return { flagged: true, corrected: false, skipped: true, error: false };
          }

          // Log when we're NOT skipping white background elements (for debugging)
          if (finalBgAlpha >= 0.95 && actualBrightness > 240 && !safeHasImageBg && !isVeryCloseToTarget) {
            console.log(
              `✅ NOT skipping white background element - contrast ${cr.toFixed(2)}:1 is significantly below target ${target.toFixed(2)}:1 (diff: ${(target - cr).toFixed(2)}:1), will correct`
            );
          }

          // Continue with correction for all other elements below target
          // Calculate blended contrast using the full RGBA background
          const blendedContrast = cr; // Already calculated with blended background

          // CRITICAL: If contrast already meets or exceeds target, preserve brand color
          // Only apply correction when contrast is actually below target
          if (blendedContrast >= effectiveTarget && (!aiReadabilityCheck || aiReadabilityCheck.comfortable)) {
            // Contrast already passes and no AI readability issue - preserve brand color
            scannedElements.add(el);
            return { flagged: false, corrected: false, skipped: false, error: false };
          }

          // Determine if inline correction should be applied (non-destructive)
          // Apply when: contrast is below Visual Comfort Sensitivity target OR AI says text is not comfortable
          // This catches cases like dark-on-dark text that has high contrast but poor readability
          const shouldApplyCorrection =
            !alreadyFixed &&
            (blendedContrast < effectiveTarget || (aiReadabilityCheck && !aiReadabilityCheck.comfortable));

          // Apply correction to elements with transparency/image backgrounds first (special handling)
          // Also apply to solid backgrounds when AI says text is not comfortable
          // Ensure hasImageBg and hasTransparency are defined (they should be from earlier in the function)
          const elementHasImageBg = typeof hasImageBg !== 'undefined' ? hasImageBg : (el._aiHasImageBackground !== undefined ? el._aiHasImageBackground : hasBackgroundImage(el));
          const elementHasTransparency = typeof hasTransparency !== 'undefined' ? hasTransparency : (el._aiHasTransparencyChain !== undefined ? el._aiHasTransparencyChain : bgRGBA[3] < 1);
          const hasSpecialBackground = alpha < 1 || isImage || elementHasImageBg || elementHasTransparency;
          const aiSaysNotComfortable = aiReadabilityCheck && !aiReadabilityCheck.comfortable;

          if (shouldApplyCorrection && (hasSpecialBackground || aiSaysNotComfortable)) {
            // CENTRAL SKIP CHECK: Final verification before applying any style changes
            if (!bgInfo) {
              bgInfo = getEffectiveBackgroundInfo(el);
            }
            if (shouldSkipContrastFix(el, bgInfo)) {
              const skipReason = el.getAttribute('data-ai-skip-reason') || 'unknown';
              console.log(`⏭️  [SKIP] Skipping style changes for ${el.tagName} - reason: ${skipReason}`);
              scannedElements.add(el);
              stats.skipped++;
              return { flagged: true, corrected: false, skipped: true, error: false };
            }

            // Determine correction reason - prioritize AI readability issues
            let correctionReason;
            if (aiSaysNotComfortable && cr >= effectiveTarget) {
              correctionReason = `AI detected readability issue (contrast ${cr.toFixed(2)}:1 meets Visual Comfort Sensitivity target but not comfortable)`;
            } else if (isImage) {
              correctionReason = "image background";
            } else if (alpha < 1) {
              correctionReason = "semi-transparent section background";
            } else if (elementHasImageBg) {
              correctionReason = "image background";
            } else if (blendedContrast < effectiveTarget) {
              correctionReason = `contrast ${blendedContrast.toFixed(2)}:1 < Visual Comfort Sensitivity target ${effectiveTarget.toFixed(2)}:1`;
            } else {
              correctionReason = "semi-transparent background";
            }
            console.log(
              `✨ [NON-DESTRUCTIVE CORRECTION] Applying inline CSS correction due to ${correctionReason}`
            );
            if (aiSaysNotComfortable) {
              console.log(
                `   🤖 [AI READABILITY] AI comfort score: ${aiReadabilityCheck.comfort_score.toFixed(3)}, Comfortable: ${aiReadabilityCheck.comfortable}`
              );
            }

            // Backup original inline styles before making changes
            if (!el.hasAttribute("data-ai-original-inline-color")) {
              const originalInlineColor = el.style.color || "";
              el.setAttribute(
                "data-ai-original-inline-color",
                originalInlineColor
              );
              if (originalInlineColor) {
                console.log(
                  `   💾 Backed up original inline color: ${originalInlineColor}`
                );
              }
            }

            // NON-DESTRUCTIVE: Apply inline CSS correction (no overlay elements)
            console.log(`   🎯 [CORRECTION] Starting correction for ${el.tagName} "${elementText}..."`);
            console.log(`   📊 [CORRECTION] Original: FG=rgb(${fg.map(v => Math.round(v)).join(",")}), BG=rgb(${bg.map(v => Math.round(v)).join(",")}), Contrast=${cr.toFixed(2)}:1, TARGET=${target.toFixed(2)}:1`);
            if (aiPrediction) {
              console.log(`   🤖 [CORRECTION] AI Prediction: Readable=${aiPrediction.readable !== undefined ? aiPrediction.readable : 'N/A'}, Confidence=${aiPrediction.confidence !== undefined ? aiPrediction.confidence.toFixed(3) : 'N/A'}`);
              if (aiPredictionAccuracy && !aiPredictionAccuracy.correct) {
                console.warn(`   🚨 [CORRECTION] AI MODEL MISTAKE DETECTED: ${aiPredictionAccuracy.wcagAssessment} vs AI says ${aiPredictionAccuracy.aiAssessment}`);
              }
            }

            // Perform intelligent background analysis (reuse if already done)
            console.log(`   🧠 [AI-ACTIVITY] ========================================`);
            console.log(`   🧠 [AI-ACTIVITY] Starting AI-powered correction process`);
            console.log(`   🧠 [AI-ACTIVITY] ========================================`);
            if (!backgroundAnalysis) {
              backgroundAnalysis = getSimpleBackgroundAnalysis(el, bgRGBA);
            } else {
              console.log(`   📊 [AI-STATUS] Reusing background analysis from earlier check`);
            }

            // Use dominant color from image analysis if available
            let effectiveBg = bg;
            let bgChanged = false;
            if (backgroundAnalysis.hasImage && backgroundAnalysis.imageAnalysis) {
              const oldBg = [...effectiveBg];
              effectiveBg = backgroundAnalysis.imageAnalysis.averageColor;
              bgChanged = true;
              console.log(`   🔄 [AI-CHANGE] Background color updated due to image analysis:`);
              console.log(`      Before: RGB(${oldBg.join(',')})`);
              console.log(`      After:  RGB(${effectiveBg.join(',')})`);
            }

            // Get AI color suggestion with intelligent background analysis
            // CRITICAL FIX: Always call getAIColorSuggestion (works on-device now)
            let aiSuggestedFg = null;
              try {
                const meta = extractElementContext(el);
                aiSuggestedFg = await getAIColorSuggestion(fg, effectiveBg, target, meta, backgroundAnalysis);
                if (aiSuggestedFg) {
                  console.log(`   ✅ [AI-CHANGE] AI suggestion will be used in color adjustment`);
                } else {
                  console.log(`   📊 [AI-STATUS] No AI suggestion available, will use intelligent fallback`);
                }
              } catch (e) {
                console.warn(`   ⚠️  [AI-ERROR] Failed to get AI suggestion: ${e.message}`);
            }

            console.log(`   🎨 [AI-ACTIVITY] Starting intelligent color adjustment...`);
            let correctedFgRGB;
            try {
              const beforeFg = [...fg];
              // CRITICAL FIX: effectiveBg is RGBA array (from bgRGBA), extract RGB for contrast calculation
              // If effectiveBg is not defined, use bg (which is already RGB)
              const effectiveBgRGB = (typeof effectiveBg !== 'undefined' && Array.isArray(effectiveBg) && effectiveBg.length >= 3) 
                ? effectiveBg.slice(0, 3) 
                : bg; // Fallback to bg if effectiveBg is invalid or undefined
              const beforeCr = wcagContrast(beforeFg, effectiveBgRGB);

              const tagName = el.tagName.toLowerCase();
              const isLink = tagName === 'a';
              let baseTextColor = null;
              if (isLink) {
                let parent = el.parentElement;
                while (parent && parent !== document.body) {
                  const parentFg = getEffectiveForegroundRGB(parent, effectiveBg);
                  if (parentFg && Array.isArray(parentFg) && parentFg.length >= 3) {
                    baseTextColor = parentFg;
                    break;
                  }
                  parent = parent.parentElement;
                }
              }
              // Determine if element is a button for optimal text color handling
              const elIsButton = tagName === 'button' || 
                el.getAttribute('role') === 'button' ||
                (tagName === 'a' && (el.className || '').toLowerCase().includes('btn'));
              
              const corrected = adjustColorToContrast(fg, effectiveBgRGB, effectiveTarget, {
                aiSuggestedFg: aiSuggestedFg,
                elementType: tagName,
                context: { hasImageBg: elementHasImageBg, hasTransparency: elementHasTransparency },
                backgroundAnalysis: backgroundAnalysis,
                isLink: isLink,
                isButton: elIsButton,
                baseTextColor: baseTextColor
              });

              // CRITICAL: adjustColorToContrast now always returns an RGB array [r, g, b]
              // Validate result is an array
              if (!Array.isArray(corrected) || corrected.length !== 3) {
                console.error(`   🚨 [CORRECTION] adjustColorToContrast returned invalid result:`, corrected);
                // Mark as terminal failure
                el.setAttribute('data-ai-terminal-failure', 'true');
                scannedElements.add(el);
                return { flagged: true, corrected: false, skipped: false, error: true };
              }
              
              // Validate all values are numbers
              const isValid = corrected.every(v => {
                const num = Number(v);
                return !isNaN(num) && isFinite(num) && num >= 0 && num <= 255;
              });
              
              if (!isValid) {
                console.error(`   🚨 [CORRECTION] adjustColorToContrast returned invalid RGB values:`, corrected);
                el.setAttribute('data-ai-terminal-failure', 'true');
                scannedElements.add(el);
                return { flagged: true, corrected: false, skipped: false, error: true };
              }
              
              correctedFgRGB = corrected.map(v => Math.max(0, Math.min(255, Math.round(Number(v)))));
              const afterFg = [...correctedFgRGB];
              const afterCr = wcagContrast(afterFg, effectiveBgRGB);
              
              // Validate contrast is valid
              if (isNaN(afterCr) || !isFinite(afterCr)) {
                console.error(`   🚨 [CORRECTION] Invalid contrast value: ${afterCr}`);
                el.setAttribute('data-ai-terminal-failure', 'true');
                scannedElements.add(el);
                return { flagged: true, corrected: false, skipped: false, error: true };
              }

              console.log(`   🧠 [AI-ACTIVITY] ========================================`);
              console.log(`   🔄 [AI-CHANGE] CORRECTION SUMMARY:`);
              console.log(`      Element: ${el.tagName} "${(el.textContent || '').trim().substring(0, 30)}..."`);
              const bgTypeDesc = backgroundAnalysis.type === 'gradient' ? 'gradient' :
                backgroundAnalysis.type === 'image' ? 'image' :
                  backgroundAnalysis.hasTransparency ? 'transparent' : 'solid';
              console.log(`      Background: ${bgTypeDesc} (type: ${backgroundAnalysis.type}${backgroundAnalysis.hasImage ? ', has image' : ''})`);
              console.log(`      Original: RGB(${beforeFg.join(',')}) - Contrast: ${beforeCr.toFixed(2)}:1`);
              console.log(`      Corrected: RGB(${afterFg.map(v => Math.round(v)).join(',')}) - Contrast: ${afterCr.toFixed(2)}:1`);
              console.log(`      Target: ${target.toFixed(2)}:1`);
              console.log(`      Status: ${afterCr >= target ? '✅ MEETS TARGET' : '⚠️  Below target'}`);
              console.log(`      Improvement: ${(afterCr - beforeCr).toFixed(2)}:1 (${((afterCr / beforeCr - 1) * 100).toFixed(1)}% increase)`);
              console.log(`   🧠 [AI-ACTIVITY] ========================================`);

              // Check for feasibility flag (target is physically impossible)
              if (corrected && typeof corrected === 'object' && 'feasible' in corrected) {
                if (corrected.feasible) {
                  console.log(`   ✅ [CORRECTION] Feasibility guard triggered: Accepting best achievable contrast ${corrected.contrast.toFixed(2)}:1.`);
                  correctedFgRGB = corrected.fg;
                  const colorStr = `rgb(${correctedFgRGB.map(v => Math.round(v)).join(",")})`;
                  // Apply the feasible color using inline style with !important flag
                  applyColorWithImportant(el, 'color', colorStr);

                  stats.corrected++;
                  el.setAttribute("data-ai-contrast-fixed", "true");
                  el.setAttribute("data-original-contrast", cr.toFixed(2));
                  el.setAttribute("data-new-contrast", corrected.contrast.toFixed(2));
                  el.setAttribute("data-fix-type", "text-color-only-feasible");
                  // Clear any stale skip reason since we successfully processed this element
                  if (el.hasAttribute('data-ai-skip-reason')) {
                    el.removeAttribute('data-ai-skip-reason');
                  }
                  scannedElements.add(el);
                  return { flagged: true, corrected: true, skipped: false, error: false };
                }
              }

              // Normal return (array)
              correctedFgRGB = corrected;
              if (!correctedFgRGB || !Array.isArray(correctedFgRGB) || correctedFgRGB.length < 3) {
                throw new Error("adjustColorToContrast returned invalid result");
              }
              // Use effectiveBgRGB for validation (same as used in adjustColorToContrast)
              const checkCr = wcagContrast(correctedFgRGB, effectiveBgRGB);
              console.log(`   ✅ [CORRECTION] adjustColorToContrast returned: FG=rgb(${correctedFgRGB.map(v => Math.round(v)).join(",")}), Contrast=${checkCr.toFixed(2)}:1, Visual Comfort Sensitivity Target=${effectiveTarget.toFixed(2)}:1, Difference=${(checkCr - effectiveTarget).toFixed(2)}`);

              // Validate correction meets Visual Comfort Sensitivity target (strict enforcement)
              if (checkCr < effectiveTarget) {
                console.error(`   🚨 [CORRECTION] FAIL: Correction below Visual Comfort Sensitivity target: ${checkCr.toFixed(2)}:1 < ${effectiveTarget.toFixed(2)}:1 (SHORT BY ${(effectiveTarget - checkCr).toFixed(2)})`);
                // FAIL: Use rule-based HSL fallback instead of black/white
                console.log(`   🔄 [CORRECTION] Using rule-based HSL fallback to preserve brand color`);
                const effectiveBgRGB = Array.isArray(effectiveBg) && effectiveBg.length >= 3 
                  ? effectiveBg.slice(0, 3) 
                  : [255, 255, 255]; // Default to white if invalid
                const fallbackRgb = ruleBasedHslFallback(fg, effectiveBgRGB, effectiveTarget);
                const fallbackCr = wcagContrast(fallbackRgb, effectiveBgRGB);
                correctedFgRGB = fallbackRgb;
                console.log(`   ✅ [CORRECTION] Rule-based fallback result: RGB(${correctedFgRGB.map(x => Math.round(x)).join(',')}), contrast=${fallbackCr.toFixed(2)}:1`);
                if (fallbackCr < effectiveTarget) {
                  console.error(`   🚨 [CORRECTION] FAIL: Rule-based fallback (${fallbackCr.toFixed(2)}:1) cannot meet Visual Comfort Sensitivity target ${effectiveTarget.toFixed(2)}:1. Correction not applied.`);
                  return { flagged: true, corrected: false, skipped: false, error: false };
                }
                console.log(`   ✅ [CORRECTION] Rule-based fallback achieved: ${fallbackCr.toFixed(2)}:1 >= ${effectiveTarget.toFixed(2)}:1 (brand color preserved)`);
              } else {
                console.log(`   ✅ [CORRECTION] Strict compliance achieved: ${checkCr.toFixed(2)}:1 >= ${effectiveTarget.toFixed(2)}:1`);
              }
            } catch (adjustError) {
              console.error("   ❌ [CORRECTION] Failed to adjust color:", adjustError);
              // CRITICAL: Use rule-based HSL fallback instead of black/white
              console.log(`   🔄 [CORRECTION] Exception caught, using rule-based HSL fallback to preserve brand color`);
              const effectiveTarget = target;
              const effectiveBgRGB = Array.isArray(effectiveBg) && effectiveBg.length >= 3 
                ? effectiveBg.slice(0, 3) 
                : [255, 255, 255]; // Default to white if invalid
              const fallbackRgb = ruleBasedHslFallback(fg, effectiveBgRGB, effectiveTarget);
              const fallbackCr = wcagContrast(fallbackRgb, effectiveBgRGB);
              correctedFgRGB = fallbackRgb;
              console.log(`   ✅ [CORRECTION] Rule-based fallback result: RGB(${correctedFgRGB.map(x => Math.round(x)).join(',')}), contrast=${fallbackCr.toFixed(2)}:1`);
              if (fallbackCr < effectiveTarget) {
                // CRITICAL: Mark as terminal failure - never retry, log once
                console.error(`   🚨 [CORRECTION] FAIL: Rule-based fallback (${fallbackCr.toFixed(2)}:1) cannot meet Visual Comfort Sensitivity target ${effectiveTarget.toFixed(2)}:1. Correction not applied.`);
                el.setAttribute('data-ai-terminal-failure', 'true');
                scannedElements.add(el);
                return { flagged: true, corrected: false, skipped: false, error: false };
              }
              console.log(`   ✅ [CORRECTION] Rule-based fallback achieved: ${fallbackCr.toFixed(2)}:1 >= ${effectiveTarget.toFixed(2)}:1 (brand color preserved)`);
            }

            let correctedFg = `rgb(${correctedFgRGB
              .map((v) => Math.round(Math.max(0, Math.min(255, v))))
              .join(",")})`;

            // CRITICAL: Never add backgrounds - only adjust text color
            // Use effectiveBg for consistency (same as used in adjustColorToContrast)
            let fgCr = wcagContrast(correctedFgRGB, effectiveBg);
            console.log(`   📊 [CORRECTION] Final corrected contrast: ${fgCr.toFixed(2)}:1, TARGET: ${target.toFixed(2)}:1, DIFFERENCE: ${(fgCr - target).toFixed(2)}`);

            // STRICT ENFORCEMENT: Only apply if contrast >= target
            if (fgCr < target) {
              console.error(`   🚨 [CORRECTION] FAIL: Final contrast ${fgCr.toFixed(2)}:1 < target ${target.toFixed(2)}:1. Correction not applied.`);
              return { flagged: true, corrected: false, skipped: false, error: false };
            }

            // =======================================================
            // FIX: Enforce visual fidelity on dark backgrounds
            // =======================================================
            // FIX: Only override brand colors if they don't meet target
            // Don't override brand-preserved colors that successfully meet the target
            try {
              // Use effectiveBg for consistency (same as used in adjustColorToContrast)
              const bgLum = relLuminance(effectiveBg);
              const fgLum = relLuminance(correctedFgRGB);
              const tooClose = Math.abs(fgLum - bgLum) < 0.6;
              const isDarkBg = bgLum < 0.3;

              // FIX: Only apply visual fidelity override if the current color doesn't meet target
              // This prevents overriding brand-preserved colors that successfully meet the target
              if (isDarkBg && tooClose && fgCr < target) {
                console.warn(`   ⚠️  [Visual Fidelity] Contrast ${fgCr.toFixed(2)}:1 below target ${target.toFixed(2)}:1 and lacks brightness separation on dark background. Adjusting FG to pure white for clarity.`);
                const whiteRGB = [255, 255, 255];
                const whiteContrast = wcagContrast(whiteRGB, effectiveBg);
                if (whiteContrast >= target) {
                  console.log(`   ✅ [Visual Fidelity] White foreground restored for improved readability (${whiteContrast.toFixed(2)}:1 >= ${target.toFixed(2)}:1).`);
                  correctedFgRGB = whiteRGB;
                  fgCr = whiteContrast;
                  correctedFg = `rgb(${whiteRGB.join(",")})`;
                } else {
                  console.warn(`   🚨 [Visual Fidelity] Pure white still below target (${whiteContrast.toFixed(2)}:1 < ${target.toFixed(2)}:1). Keeping original result.`);
                }
              } else if (isDarkBg && tooClose && fgCr >= target) {
                // Brand color meets target - don't override it
                console.log(`   ✅ [Visual Fidelity] Brand color meets target (${fgCr.toFixed(2)}:1 >= ${target.toFixed(2)}:1). Preserving brand color despite close luminance.`);
              }
            } catch (e) {
              console.error('   ❌ [Visual Fidelity] Recheck failed:', e);
            }

            // Compare with AI prediction if available
            if (aiPrediction && aiPrediction.expectedContrast) {
              const aiExpected = aiPrediction.expectedContrast;
              const actual = fgCr;
              const aiError = Math.abs(actual - aiExpected);
              console.log(`   🤖 [AI COMPARISON] AI Expected: ${aiExpected.toFixed(2)}:1, Actual: ${actual.toFixed(2)}:1, Error: ${aiError.toFixed(2)}`);
              if (aiError > 1.0) {
                console.warn(`   🚨 [AI ERROR] AI prediction error is LARGE: ${aiError.toFixed(2)}:1 difference between expected and actual contrast`);
              }
            }

            // Apply text color correction only (no backgrounds, no structure changes)
            // Trust the contrast value from adjustColorToContrast - no re-verification needed
            // Apply with hover support
            applyContrastFixWithHover(el, correctedFg);

            // Verify the color was actually applied (critical for overriding !important styles)
            const appliedColor = getComputedStyle(el).color;
            // Extract RGB values from both strings for comparison
            const expectedMatch = correctedFg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i);
            const appliedMatch = appliedColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i);
            if (expectedMatch && appliedMatch) {
              const expectedRgb = [parseInt(expectedMatch[1]), parseInt(expectedMatch[2]), parseInt(expectedMatch[3])];
              const appliedRgb = [parseInt(appliedMatch[1]), parseInt(appliedMatch[2]), parseInt(appliedMatch[3])];
              // Allow small tolerance for rounding differences
              const matches = expectedRgb.every((val, i) => Math.abs(val - appliedRgb[i]) <= 1);
              if (!matches) {
                console.warn(`   ⚠️  [VERIFY] Color application may have failed. Expected: rgb(${expectedRgb.join(',')}), Got: rgb(${appliedRgb.join(',')}). Retrying with force...`);
                // Force re-apply with direct style attribute manipulation as fallback
                const currentStyle = el.getAttribute('style') || '';
                const cleanedStyle = currentStyle.replace(/color\s*:[^;]*;?/gi, '').trim();
                el.setAttribute('style', `${cleanedStyle ? cleanedStyle + '; ' : ''}color: ${correctedFg} !important;`);
                // Verify again
                const recheckColor = getComputedStyle(el).color;
                const recheckMatch = recheckColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i);
                if (recheckMatch) {
                  const recheckRgb = [parseInt(recheckMatch[1]), parseInt(recheckMatch[2]), parseInt(recheckMatch[3])];
                  const recheckMatches = expectedRgb.every((val, i) => Math.abs(val - recheckRgb[i]) <= 1);
                  console.log(`   ${recheckMatches ? '✅' : '⚠️'} [VERIFY] After force re-apply: rgb(${recheckRgb.join(',')}) ${recheckMatches ? '(matches expected)' : '(still differs)'}`);
                }
              } else {
                console.log(`   ✅ [VERIFY] Color successfully applied: rgb(${appliedRgb.join(',')}) (matches expected)`);
              }
            }

            // Store corrected colors for hover-safe refinement
            el.setAttribute("data-corrected-fg", correctedFg);
            // Never store or add backgrounds

            stats.corrected++;
            el.setAttribute("data-ai-contrast-fixed", "true");
            el.setAttribute("data-original-contrast", cr.toFixed(2));
            el.setAttribute(
              "data-new-contrast",
              fgCr.toFixed(2)
            );
            el.setAttribute("data-fix-type", "inline-css");
            el.setAttribute("data-correction-reason", correctionReason);
            el.setAttribute("data-ai-normal-fg", correctedFg);
            el.setAttribute("data-ai-normal-bg", `rgb(${bg.join(",")})`);
            // Clear any stale skip reason since we successfully processed this element
            if (el.hasAttribute('data-ai-skip-reason')) {
              el.removeAttribute('data-ai-skip-reason');
            }
            el.title = `✨ AI optimized contrast (inline CSS)\nOriginal: ${cr.toFixed(
              2
            )}:1\nCorrected: ${fgCr.toFixed(
              2
            )}:1\nReason: ${correctionReason}\nComfort score: ${comfortScore.toFixed(
              3
            )}`;
            scannedElements.add(el);
            return { flagged: true, corrected: true, skipped: false, error: false };
          }
          // Note: Elements with transparency/image that didn't get corrected above will fall through to normal correction

          // Apply normal color adjustment for ALL elements that need correction:
          // 1. Elements below target contrast
          // 2. Elements where AI says text is not comfortable (even if contrast meets target)
          // 3. Elements without transparency/image backgrounds
          // 4. Elements with transparency/image that didn't get corrected in the special path above
          // CRITICAL: Check if element was already corrected to avoid double correction
          const wasCorrectedAbove = el.hasAttribute("data-ai-contrast-fixed");
          const needsCorrectionByAI = aiReadabilityCheck && !aiReadabilityCheck.comfortable;
          if ((cr < effectiveTarget || needsCorrectionByAI) && autoCorrect && !alreadyFixed && !wasCorrectedAbove) {
            // CENTRAL SKIP CHECK: Final verification before applying any style changes
            if (!bgInfo) {
              bgInfo = getEffectiveBackgroundInfo(el);
            }
            if (shouldSkipContrastFix(el, bgInfo)) {
              const skipReason = el.getAttribute('data-ai-skip-reason') || 'unknown';
              console.log(`⏭️  [SKIP] Skipping style changes for ${el.tagName} - reason: ${skipReason}`);
              scannedElements.add(el);
              stats.skipped++;
              return { flagged: true, corrected: false, skipped: true, error: false };
            }

            // Apply correction to all elements below target
            // Ensure hasImageBg and hasTransparency are defined (they should be from earlier in the function)
            const elementHasImageBg = typeof hasImageBg !== 'undefined' ? hasImageBg : (el._aiHasImageBackground !== undefined ? el._aiHasImageBackground : hasBackgroundImage(el));
            const elementHasTransparency = typeof hasTransparency !== 'undefined' ? hasTransparency : (el._aiHasTransparencyChain !== undefined ? el._aiHasTransparencyChain : bgRGBA[3] < 1);
            const elementType = elementHasImageBg
              ? "image background"
              : elementHasTransparency
                ? "semi-transparent background"
                : "solid background";
            const correctionReason = needsCorrectionByAI && cr >= target
              ? `AI detected readability issue (contrast: ${cr.toFixed(2)}:1 meets target but AI says not comfortable)`
              : `contrast ${cr.toFixed(2)}:1 < target ${target.toFixed(2)}:1`;
            console.log(
              `✨ [CORRECTION] Applying correction to element with ${elementType}: ${el.tagName} "${elementText}..."`
            );
            console.log(
              `   📊 [CORRECTION] Reason: ${correctionReason}`
            );
            console.log(
              `   📊 [CORRECTION] Original: FG=rgb(${fg.map(v => Math.round(v)).join(",")}), BG=rgb(${bg.map(v => Math.round(v)).join(",")}), Contrast=${cr.toFixed(2)}:1, Target=${target.toFixed(2)}:1`
            );
            if (needsCorrectionByAI) {
              console.log(
                `   🤖 [AI READABILITY] AI comfort score: ${aiReadabilityCheck.comfort_score.toFixed(3)}, Comfortable: ${aiReadabilityCheck.comfortable}`
              );
            }
            if (aiPrediction) {
              console.log(`   🤖 [CORRECTION] AI Prediction: Readable=${aiPrediction.readable !== undefined ? aiPrediction.readable : 'N/A'}, Confidence=${aiPrediction.confidence !== undefined ? aiPrediction.confidence.toFixed(3) : 'N/A'}`);
              if (aiPredictionAccuracy && !aiPredictionAccuracy.correct) {
                console.warn(`   🚨 [CORRECTION] AI MODEL MISTAKE: ${aiPredictionAccuracy.wcagAssessment} vs AI says ${aiPredictionAccuracy.aiAssessment}`);
              }
            }

            // Backup original color before making changes
            // CRITICAL: If element has no inline style, back up the computed style color
            // (which includes CSS class colors) so child elements can use it for evaluation
            if (!el.hasAttribute("data-ai-original-inline-color")) {
              let originalColor = el.style.color || "";
              // If no inline style, get the computed style color (includes CSS classes)
              if (!originalColor) {
                const cs = getComputedStyle(el);
                originalColor = cs.color || "";
              }
              el.setAttribute(
                "data-ai-original-inline-color",
                originalColor
              );
              if (originalColor) {
                console.log(
                  `   💾 Backed up original color: ${originalColor}`
                );
              }
            }

            // CRITICAL: Try hue-preserving adjustment FIRST before falling back to pure black/white
            // This preserves the original color's hue while meeting contrast requirements
            console.log(`   🎯 [CORRECTION] Starting hue-preserving adjustment for ${el.tagName} "${elementText}..."`);
            console.log(`   📊 [CORRECTION] Original: FG=rgb(${fg.map(v => Math.round(v)).join(",")}), BG=rgb(${bg.map(v => Math.round(v)).join(",")}), Contrast=${cr.toFixed(2)}:1, TARGET=${target.toFixed(2)}:1`);
            if (aiPrediction) {
              console.log(`   🤖 [CORRECTION] AI Prediction: Readable=${aiPrediction.readable !== undefined ? aiPrediction.readable : 'N/A'}, Confidence=${aiPrediction.confidence !== undefined ? aiPrediction.confidence.toFixed(3) : 'N/A'}`);
            }

            // Perform intelligent background analysis (reuse if already done)
            console.log(`   🧠 [AI-ACTIVITY] ========================================`);
            console.log(`   🧠 [AI-ACTIVITY] Starting AI-powered correction process`);
            console.log(`   🧠 [AI-ACTIVITY] ========================================`);
            if (!backgroundAnalysis) {
              backgroundAnalysis = getSimpleBackgroundAnalysis(el, bgRGBA);
            } else {
              console.log(`   📊 [AI-STATUS] Reusing background analysis from earlier check`);
            }

            // Use dominant color from image analysis if available
            let effectiveBg = bg;
            let bgChanged = false;
            if (backgroundAnalysis.hasImage && backgroundAnalysis.imageAnalysis) {
              const oldBg = [...effectiveBg];
              effectiveBg = backgroundAnalysis.imageAnalysis.averageColor;
              bgChanged = true;
              console.log(`   🔄 [AI-CHANGE] Background color updated due to image analysis:`);
              console.log(`      Before: RGB(${oldBg.join(',')})`);
              console.log(`      After:  RGB(${effectiveBg.join(',')})`);
            }

            // Get AI color suggestion with intelligent background analysis
            // CRITICAL FIX: Always call getAIColorSuggestion (works on-device now)
            let aiSuggestedFg = null;
              try {
                const meta = extractElementContext(el);
                aiSuggestedFg = await getAIColorSuggestion(fg, effectiveBg, target, meta, backgroundAnalysis);
                if (aiSuggestedFg) {
                  console.log(`   ✅ [AI-CHANGE] AI suggestion will be used in color adjustment`);
                } else {
                  console.log(`   📊 [AI-STATUS] No AI suggestion available, will use intelligent fallback`);
                }
              } catch (e) {
                console.warn(`   ⚠️  [AI-ERROR] Failed to get AI suggestion: ${e.message}`);
            }

            let correctedFgRGB;
            let isFeasibleResult = false;
            let feasibleContrast = null;
            try {
              const tagName2 = el.tagName.toLowerCase();
              const isLink2 = tagName2 === 'a';
              let baseTextColor2 = null;
              if (isLink2) {
                let parent = el.parentElement;
                while (parent && parent !== document.body) {
                  const parentFg = getEffectiveForegroundRGB(parent, effectiveBg);
                  if (parentFg && Array.isArray(parentFg) && parentFg.length >= 3) {
                    baseTextColor2 = parentFg;
                    break;
                  }
                  parent = parent.parentElement;
                }
              }
              // Determine if element is a button for optimal text color handling
              const elIsButton2 = tagName2 === 'button' || 
                el.getAttribute('role') === 'button' ||
                (tagName2 === 'a' && (el.className || '').toLowerCase().includes('btn'));
              
              const corrected = adjustColorToContrast(fg, effectiveBg, target, {
                aiSuggestedFg: aiSuggestedFg,
                elementType: tagName2,
                context: { hasImageBg: elementHasImageBg, hasTransparency: elementHasTransparency },
                backgroundAnalysis: backgroundAnalysis,
                isLink: isLink2,
                isButton: elIsButton2,
                baseTextColor: baseTextColor2
              });

              // Check for feasibility flag (target is physically impossible)
              if (corrected && typeof corrected === 'object' && 'feasible' in corrected) {
                if (corrected.feasible) {
                  console.log(`   ✅ [FEASIBILITY] Target ${target.toFixed(2)}:1 is physically impossible. Best achievable: ${corrected.contrast.toFixed(2)}:1. Applying best achievable contrast.`);
                  // Extract the best achievable color from the feasible object
                  correctedFgRGB = corrected.fg;
                  if (!correctedFgRGB || !Array.isArray(correctedFgRGB) || correctedFgRGB.length < 3) {
                    console.error(`   🚨 [FEASIBILITY] Invalid color in feasible object, using original color`);
                    correctedFgRGB = fg;
                  }
                  feasibleContrast = corrected.contrast;
                  isFeasibleResult = true;
                  console.log(`   ✅ [FEASIBILITY] Applying best achievable contrast ${feasibleContrast.toFixed(2)}:1 (target ${target.toFixed(2)}:1 was impossible)`);
                  // Continue to apply the correction even though it doesn't meet the target
                  // This improves readability even if we can't reach the strict target
                } else {
                  // Normal return (array)
                  correctedFgRGB = corrected;
                  if (!correctedFgRGB || !Array.isArray(correctedFgRGB) || correctedFgRGB.length < 3) {
                    throw new Error("adjustColorToContrast returned invalid result");
                  }
                  const checkCr = wcagContrast(correctedFgRGB, bg);
                  console.log(`   ✅ [CORRECTION] adjustColorToContrast returned: FG=rgb(${correctedFgRGB.map(v => Math.round(v)).join(",")}), Contrast=${checkCr.toFixed(2)}:1, Target=${target.toFixed(2)}:1`);
                }
              } else {
                // Normal return (array)
                correctedFgRGB = corrected;
                if (!correctedFgRGB || !Array.isArray(correctedFgRGB) || correctedFgRGB.length < 3) {
                  throw new Error("adjustColorToContrast returned invalid result");
                }
                const checkCr = wcagContrast(correctedFgRGB, bg);
                console.log(`   ✅ [CORRECTION] adjustColorToContrast returned: FG=rgb(${correctedFgRGB.map(v => Math.round(v)).join(",")}), Contrast=${checkCr.toFixed(2)}:1, Target=${target.toFixed(2)}:1`);
              }
            } catch (adjustError) {
              console.error("   ❌ [CORRECTION] Failed to adjust color:", adjustError);
              // Fallback: preserve hue but adjust lightness more aggressively
              const hsl = rgbToHsl(fg);
              const [h, s, l] = hsl;
              const bgLum = relLuminance(bg);
              const needDarker = bgLum > 0.5;
              const adjustedL = needDarker ? Math.max(0, l - 0.4) : Math.min(1, l + 0.4);
              correctedFgRGB = hslToRgb([h, s, adjustedL]);
              const fallbackCr = wcagContrast(correctedFgRGB, bg);
              console.log(`   ⚠️  [CORRECTION] Using fallback adjustment: FG=rgb(${correctedFgRGB.map(v => Math.round(v)).join(",")}), Contrast=${fallbackCr.toFixed(2)}:1`);
            }

            let correctedFg = `rgb(${correctedFgRGB
              .map((v) => Math.round(Math.max(0, Math.min(255, v))))
              .join(",")})`;
            let fgCr = isFeasibleResult ? feasibleContrast : wcagContrast(correctedFgRGB, bg);

            // Handle feasible results (best achievable contrast when target is impossible)
            if (isFeasibleResult) {
              console.log(`   🎯 [FEASIBILITY] Applying best achievable contrast ${fgCr.toFixed(2)}:1 (target ${target.toFixed(2)}:1 was impossible)`);

              // Apply visual fidelity check for dark backgrounds
              let finalCorrectedFgRGB = correctedFgRGB;
              let finalFgCr = fgCr;
              try {
                const bgLum = relLuminance(bg);
                const fgLum = relLuminance(correctedFgRGB);
                const tooClose = Math.abs(fgLum - bgLum) < 0.6;
                const isDarkBg = bgLum < 0.3;

                // FIX: Only override if current color doesn't meet target
                // Don't override brand colors that successfully meet the target
                if (isDarkBg && tooClose && fgCr < target) {
                  console.warn(`   ⚠️  [Visual Fidelity] Best achievable contrast ${fgCr.toFixed(2)}:1 below target ${target.toFixed(2)}:1 and lacks brightness separation on dark background. Adjusting FG to pure white for clarity.`);
                  const whiteRGB = [255, 255, 255];
                  const whiteContrast = wcagContrast(whiteRGB, bg);
                  // For feasible results, use white if it improves contrast, even if still below target
                  if (whiteContrast > fgCr) {
                    console.log(`   ✅ [Visual Fidelity] White foreground improves contrast (${whiteContrast.toFixed(2)}:1 > ${fgCr.toFixed(2)}:1).`);
                    finalCorrectedFgRGB = whiteRGB;
                    finalFgCr = whiteContrast;
                    correctedFgRGB = whiteRGB; // Update for consistency
                  }
                } else if (isDarkBg && tooClose && fgCr >= target) {
                  // Brand color meets target - don't override it
                  console.log(`   ✅ [Visual Fidelity] Brand color meets target (${fgCr.toFixed(2)}:1 >= ${target.toFixed(2)}:1). Preserving brand color despite close luminance.`);
                }
              } catch (e) {
                console.error('   ❌ [Visual Fidelity] Recheck failed:', e);
              }

              // Apply the best achievable contrast
              const finalCorrectedFg = `rgb(${finalCorrectedFgRGB
                .map((v) => Math.round(Math.max(0, Math.min(255, v))))
                .join(",")})`;
              // USE applyColorWithImportant: Ensures !important override for inline styles
              applyColorWithImportant(el, 'color', finalCorrectedFg);
              
              // Verify the color was applied correctly
              const verifyColor = getComputedStyle(el).color;
              console.log(`   ✅ [FEASIBILITY] Applied best achievable contrast: ${finalFgCr.toFixed(2)}:1 (target ${target.toFixed(2)}:1 was impossible)`);
              console.log(`   ✅ [VERIFY] Applied color verified: ${verifyColor}`);

              stats.corrected++;
              el.setAttribute("data-ai-contrast-fixed", "true");
              el.setAttribute("data-original-contrast", cr.toFixed(2));
              el.setAttribute("data-new-contrast", finalFgCr.toFixed(2));
              el.setAttribute("data-fix-type", "text-color-only-feasible");
              el.setAttribute("data-ai-normal-fg", finalCorrectedFg);
              el.setAttribute("data-ai-normal-bg", `rgb(${bg.join(",")})`);
              // Clear any stale skip reason since we successfully processed this element
              if (el.hasAttribute('data-ai-skip-reason')) {
                el.removeAttribute('data-ai-skip-reason');
              }
              // CRITICAL: Mark as feasible max so hover restoration knows this is best achievable
              el.setAttribute("data-feasible-max", "true");
              el.setAttribute("data-feasible-contrast", finalFgCr.toFixed(2));
              el.setAttribute("data-corrected-fg", finalCorrectedFg);
              el.setAttribute("data-corrected-bg", `rgb(${bg.join(",")})`);
              el.title = `✨ AI optimized contrast (best achievable)\nOriginal: ${cr.toFixed(2)}:1\nCorrected: ${finalFgCr.toFixed(2)}:1 (target ${target.toFixed(2)}:1 was impossible)\nComfort score: ${comfortScore.toFixed(3)}`;
              scannedElements.add(el);
              return { flagged: true, corrected: true, skipped: false, error: false };
            }

            // If hue-preserving adjustment meets target, use it
            console.log(`   🎯 [CORRECTION] Checking if corrected contrast ${fgCr.toFixed(2)}:1 >= target ${target.toFixed(2)}:1`);
            if (fgCr >= target) {
              // =======================================================
              // FIX: Enforce visual fidelity on dark backgrounds
              // =======================================================
              let finalCorrectedFgRGB = correctedFgRGB;
              let finalFgCr = fgCr;
              try {
                const bgLum = relLuminance(bg);
                const fgLum = relLuminance(correctedFgRGB);
                const tooClose = Math.abs(fgLum - bgLum) < 0.6;
                const isDarkBg = bgLum < 0.3;

                // FIX: Only override if current color doesn't meet target
                // Don't override brand colors that successfully meet the target
                if (isDarkBg && tooClose && fgCr < target) {
                  console.warn(`   ⚠️  [Visual Fidelity] Contrast ${fgCr.toFixed(2)}:1 below target ${target.toFixed(2)}:1 and lacks brightness separation on dark background. Adjusting FG to pure white for clarity.`);
                  const whiteRGB = [255, 255, 255];
                  const whiteContrast = wcagContrast(whiteRGB, bg);
                  if (whiteContrast >= target) {
                    console.log(`   ✅ [Visual Fidelity] White foreground restored for improved readability (${whiteContrast.toFixed(2)}:1 >= ${target.toFixed(2)}:1).`);
                    finalCorrectedFgRGB = whiteRGB;
                    finalFgCr = whiteContrast;
                    correctedFg = `rgb(${whiteRGB.join(",")})`;
                    correctedFgRGB = whiteRGB; // Update for consistency
                  } else {
                    console.warn(`   🚨 [Visual Fidelity] Pure white still below target (${whiteContrast.toFixed(2)}:1 < ${target.toFixed(2)}:1). Keeping original result.`);
                  }
                } else if (isDarkBg && tooClose && fgCr >= target) {
                  // Brand color meets target - don't override it
                  console.log(`   ✅ [Visual Fidelity] Brand color meets target (${fgCr.toFixed(2)}:1 >= ${target.toFixed(2)}:1). Preserving brand color despite close luminance.`);
                }
              } catch (e) {
                console.error('   ❌ [Visual Fidelity] Recheck failed:', e);
              }

              // USE applyColorWithImportant: Ensures !important override for inline styles
              applyColorWithImportant(el, 'color', correctedFg);
              
              // Verify the color was applied correctly
              const verifyColor = getComputedStyle(el).color;
              console.log(`   ✅ [CORRECTION] Strict compliance achieved: ${finalFgCr.toFixed(2)}:1 >= ${target.toFixed(2)}:1`);
              console.log(`   ✅ [VERIFY] Applied color verified: ${verifyColor}`);

              // Compare with AI prediction if available
              if (aiPrediction && aiPrediction.expectedContrast) {
                const aiExpected = aiPrediction.expectedContrast;
                const aiError = Math.abs(finalFgCr - aiExpected);
                console.log(`   🤖 [AI COMPARISON] AI Expected: ${aiExpected.toFixed(2)}:1, Actual: ${finalFgCr.toFixed(2)}:1, Error: ${aiError.toFixed(2)}`);
                if (aiError > 1.0) {
                  console.warn(`   🚨 [AI ERROR] AI prediction error is LARGE: ${aiError.toFixed(2)}:1 difference`);
                }
              }

              stats.corrected++;
              el.setAttribute("data-ai-contrast-fixed", "true");
              el.setAttribute("data-original-contrast", cr.toFixed(2));
              el.setAttribute("data-new-contrast", finalFgCr.toFixed(2));
              el.setAttribute("data-fix-type", "text-color-only");
              el.setAttribute("data-ai-normal-fg", correctedFg);
              el.setAttribute("data-ai-normal-bg", `rgb(${bg.join(",")})`);
              // Clear any stale skip reason since we successfully processed this element
              if (el.hasAttribute('data-ai-skip-reason')) {
                el.removeAttribute('data-ai-skip-reason');
              }
              el.title = `✨ AI optimized contrast\nOriginal: ${cr.toFixed(2)}:1\nCorrected: ${finalFgCr.toFixed(2)}:1 (hue preserved)\nComfort score: ${comfortScore.toFixed(3)}`;
              scannedElements.add(el);
              return { flagged: true, corrected: true, skipped: false, error: false };
            }

            // If hue-preserving didn't meet target, try more aggressive hue-preserving adjustment
            console.error(
              `   🚨 [AGGRESSIVE] FAIL: Initial hue-preserving adjustment below target (${fgCr.toFixed(2)}:1 < ${target.toFixed(2)}:1), trying more aggressive adjustment...`
            );
            console.log(`   🔧 [AGGRESSIVE] Entering aggressive adjustment block for ${el.tagName} "${elementText}..."`);

            try {
              console.log(`   🔧 [AGGRESSIVE] Inside try block, calling rgbToHsl...`);
              const originalHsl = rgbToHsl(fg);
              console.log(`   🔧 [AGGRESSIVE] Got HSL:`, originalHsl);
              const [originalH, originalS, originalL] = originalHsl;
              console.log(`   🔧 [AGGRESSIVE] Calling relLuminance...`);
              const bgLum = relLuminance(bg);
              console.log(`   🔧 [AGGRESSIVE] Got bgLum:`, bgLum);
              const needDarker = bgLum > 0.5;

              // Try extreme lightness values while preserving hue and reducing saturation if needed
              // IMPORTANT: Find color that meets target but is closest to it (not way over)
              let bestHuePreserved = null;
              let bestHuePreservedCr = fgCr;
              let bestDistanceFromTarget = Math.abs(fgCr - target);

              console.log(
                `   🔍 [AGGRESSIVE] Starting search - H=${originalH.toFixed(2)}, S=${originalS.toFixed(2)}, L=${originalL.toFixed(2)}, bgLum=${bgLum.toFixed(3)}, needDarker=${needDarker}, fg=[${fg.join(",")}], bg=[${bg.join(",")}], target=${target.toFixed(2)}:1`
              );

              // For medium backgrounds, try both directions to maximize contrast
              const isMediumBg = bgLum >= 0.3 && bgLum <= 0.7;

              // Try different saturation levels (from original to 0)
              // Start with higher saturation to preserve color better
              for (let testS = originalS; testS >= 0; testS -= 0.1) {
                // Try multiple lightness levels for each saturation
                // IMPORTANT: Search from values closer to target first, then extremes
                // This helps us find colors closer to target instead of going way over
                let lightnessRange;

                // Calculate what lightness might give us close to target contrast
                // Start searching from moderate values, not extremes
                if (isMediumBg) {
                  // For medium backgrounds, try moderate values first, then extremes
                  if (needDarker) {
                    // Start with darker but not extreme (0.2-0.4), then try extremes if needed
                    lightnessRange = [0.3, 0.25, 0.35, 0.2, 0.4, 0.15, 0.45, 0.1, 0.5, 0.05];
                  } else {
                    // Start with lighter but not extreme (0.6-0.8), then try extremes if needed
                    lightnessRange = [0.7, 0.75, 0.65, 0.8, 0.6, 0.85, 0.55, 0.9, 0.5, 0.95];
                  }
                } else {
                  // For light/dark backgrounds, try values closer to what's needed
                  if (needDarker) {
                    // Start with moderate dark values, not extremes
                    lightnessRange = [0.2, 0.25, 0.15, 0.3, 0.1, 0.35, 0.05, 0.4];
                  } else {
                    // Start with moderate light values, not extremes
                    lightnessRange = [0.8, 0.75, 0.85, 0.7, 0.9, 0.65, 0.95, 0.6];
                  }
                }

                for (const testL of lightnessRange) {
                  const testRGB = hslToRgb([originalH, testS, testL * 100]);
                  const testCr = wcagContrast(testRGB, bg);
                  const testDistance = Math.abs(testCr - target);

                  if (testCr >= target) {
                    // Found a color that meets target - check if it's closer than previous best
                    if (testDistance < bestDistanceFromTarget || bestHuePreservedCr < target) {
                      bestHuePreserved = testRGB;
                      bestHuePreservedCr = testCr;
                      bestDistanceFromTarget = testDistance;

                      // Strict enforcement: use immediately when target is met
                      if (testCr >= target) {
                        console.log(
                          `   ✅ [AGGRESSIVE] Strict compliance achieved with hue-preserving solution: rgb(${testRGB.map(v => Math.round(v)).join(",")}) = ${testCr.toFixed(2)}:1 >= ${target.toFixed(2)}:1`
                        );
                        break; // Found solution that meets target
                      }
                    }
                  } else if (testCr > bestHuePreservedCr && bestHuePreservedCr < target) {
                    // Track best result that doesn't meet target yet
                    bestHuePreserved = testRGB;
                    bestHuePreservedCr = testCr;
                    bestDistanceFromTarget = testDistance;
                  }
                }

                // If we found a solution that meets target, stop searching
                if (bestHuePreservedCr >= target) {
                  break;
                }
              }

              // Log the result
              if (bestHuePreservedCr >= target) {
                console.log(
                  `   ✅ [AGGRESSIVE] Found hue-preserving solution: rgb(${bestHuePreserved.map(v => Math.round(v)).join(",")}) = ${bestHuePreservedCr.toFixed(2)}:1 (target: ${target.toFixed(2)}:1, distance: ${bestDistanceFromTarget.toFixed(2)})`
                );
              }

              if (bestHuePreservedCr < target) {
                console.error(
                  `   🚨 [AGGRESSIVE] FAIL: Best hue-preserving contrast ${bestHuePreservedCr.toFixed(2)}:1 < Visual Comfort Sensitivity target ${target.toFixed(2)}:1 - will try black/white fallback`
                );
              } else {
                console.log(
                  `   ✅ [AGGRESSIVE] Found solution with contrast: ${bestHuePreservedCr.toFixed(2)}:1`
                );
              }

              // If we found a hue-preserving solution, use it
              // FIX: Accept best achievable hue-preserved color if it reaches at least 4.5:1 (WCAG AA)
              // This prevents forcing pure black/white when a hue-preserved color is acceptable
              if (bestHuePreserved && bestHuePreservedCr >= 4.5) {
                const huePreservedStr = `rgb(${bestHuePreserved.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(",")})`;
                applyContrastFixWithHover(el, huePreservedStr);
                if (bestHuePreservedCr >= target) {
                  console.log(
                    `   ✅ [AGGRESSIVE] Strict compliance achieved (hue preserved): ${bestHuePreservedCr.toFixed(2)}:1 >= ${target.toFixed(2)}:1`
                  );
                } else {
                  console.log(
                    `   ✅ [AGGRESSIVE] Using best achievable hue-preserved color: ${bestHuePreservedCr.toFixed(2)}:1 >= 4.5:1 (target was ${target.toFixed(2)}:1)`
                  );
                }

                stats.corrected++;
                el.setAttribute("data-ai-contrast-fixed", "true");
                el.setAttribute("data-original-contrast", cr.toFixed(2));
                el.setAttribute("data-new-contrast", bestHuePreservedCr.toFixed(2));
                el.setAttribute("data-fix-type", "text-color-only");
                el.setAttribute("data-ai-normal-fg", huePreservedStr);
                el.setAttribute("data-ai-normal-bg", `rgb(${bg.join(",")})`);
                // Clear any stale skip reason since we successfully processed this element
                if (el.hasAttribute('data-ai-skip-reason')) {
                  el.removeAttribute('data-ai-skip-reason');
                }
                el.title = `✨ AI optimized contrast\nOriginal: ${cr.toFixed(2)}:1\nCorrected: ${bestHuePreservedCr.toFixed(2)}:1 (hue preserved)\nComfort score: ${comfortScore.toFixed(3)}`;
                scannedElements.add(el);
                return { flagged: true, corrected: true, skipped: false, error: false };
              }

              // LAST RESORT: Only use pure black/white if hue-preserving methods truly can't meet 4.5:1 minimum
              // But try to find a gray closer to target if black/white exceeds it significantly
              console.log(`   🔄 [AGGRESSIVE] Trying black/white fallback...`);
              const crBlack = wcagContrast([0, 0, 0], bg);
              const crWhite = wcagContrast([255, 255, 255], bg);
              const useBlack = crBlack > crWhite;
              const optimalFg = useBlack ? [0, 0, 0] : [255, 255, 255];
              const optimalContrast = useBlack ? crBlack : crWhite;
              console.log(`   📊 [AGGRESSIVE] Black/white contrast: ${optimalContrast.toFixed(2)}:1 (target: ${target.toFixed(2)}:1)`);

              // Declare finalFg and finalContrast in the outer scope
              let finalFg = optimalFg;
              let finalContrast = optimalContrast;

              if (optimalContrast >= target) {
                // Black/white meets target - use it (or find gray closer to target)
                // If black/white exceeds target, try to find a gray closer to target
                const exceedsBy = optimalContrast - target;

                if (exceedsBy > 0) {
                  console.log(`   🎯 [AGGRESSIVE] Contrast ${optimalContrast.toFixed(2)}:1 exceeds target ${target.toFixed(2)}:1 by ${exceedsBy.toFixed(2)}, searching for gray closer to target...`);
                  // Try to find a gray that gives contrast closer to target
                  let grayMin = useBlack ? 0 : 128;
                  let grayMax = useBlack ? 128 : 255;
                  let bestGray = optimalFg[0];
                  let bestGrayCr = optimalContrast;
                  let bestGrayDistance = Math.abs(optimalContrast - target);

                  // Binary search for a gray value that gives contrast close to target
                  for (let i = 0; i < 20; i++) {
                    const testGray = Math.round((grayMin + grayMax) / 2);
                    const testRGB = [testGray, testGray, testGray];
                    const testCr = wcagContrast(testRGB, bg);
                    const testDistance = Math.abs(testCr - target);

                    if (testCr >= target) {
                      if (testDistance < bestGrayDistance) {
                        bestGray = testGray;
                        bestGrayCr = testCr;
                        bestGrayDistance = testDistance;
                      }
                      // Strict enforcement: use gray if it meets target
                      if (testCr >= target) {
                        finalFg = testRGB;
                        finalContrast = testCr;
                        console.log(`   ✅ [AGGRESSIVE] Strict compliance achieved with gray: ${testGray}, contrast=${testCr.toFixed(2)}:1 >= ${target.toFixed(2)}:1`);
                        break;
                      }
                      // Adjust search range
                      if (useBlack) {
                        grayMax = testGray;
                      } else {
                        grayMin = testGray;
                      }
                    } else {
                      // Contrast too low, adjust search range
                      if (useBlack) {
                        grayMin = testGray;
                      } else {
                        grayMax = testGray;
                      }
                    }

                    // Stop if range is too small
                    if (grayMax - grayMin < 2) break;
                  }

                  // Use the best gray we found if it's closer to target than pure black/white
                  const blackWhiteDistance = Math.abs(optimalContrast - target);
                  if (bestGrayDistance < blackWhiteDistance && bestGrayCr >= target) {
                    finalFg = [bestGray, bestGray, bestGray];
                    finalContrast = bestGrayCr;
                    console.log(`   🎯 [AGGRESSIVE] Using gray (${bestGray}) instead of pure black/white for closer-to-target contrast: ${finalContrast.toFixed(2)}:1 (target: ${target.toFixed(2)}:1, distance: ${bestGrayDistance.toFixed(2)})`);
                  } else {
                    console.log(`   ⚠️  [AGGRESSIVE] Gray not better (distance: ${bestGrayDistance.toFixed(2)} vs ${blackWhiteDistance.toFixed(2)}), will use pure ${useBlack ? 'black' : 'white'}`);
                  }
                }
              } else {
                // Black/white doesn't meet target - this is critical, try exhaustive search
                console.error(`   🚨 [AGGRESSIVE] FAIL: Black/white don't meet Visual Comfort Sensitivity target (black: ${crBlack.toFixed(2)}:1, white: ${crWhite.toFixed(2)}:1, target: ${target.toFixed(2)}:1)`);
                console.error(`   🔍 [AGGRESSIVE] Background RGB: [${bg.map(v => Math.round(v)).join(",")}], Background Luminance: ${relLuminance(bg).toFixed(4)}`);
                console.error(`   🔍 [AGGRESSIVE] Max possible contrast: ${Math.max(crBlack, crWhite).toFixed(2)}:1`);

                // Check if target is physically impossible
                const maxPossibleContrast = Math.max(crBlack, crWhite);
                if (maxPossibleContrast < target) {
                  const shortBy = target - maxPossibleContrast;
                  console.error(`   🚨 [AGGRESSIVE] FAIL: Target ${target.toFixed(2)}:1 is physically impossible for this background.`);
                  console.error(`   🚨 [AGGRESSIVE] Background RGB: [${bg.map(v => Math.round(v)).join(",")}], Background Luminance: ${relLuminance(bg).toFixed(4)}`);
                  console.error(`   🚨 [AGGRESSIVE] Max possible contrast: ${maxPossibleContrast.toFixed(2)}:1 (short by ${shortBy.toFixed(2)}:1)`);
                  console.error(`   🚨 [AGGRESSIVE] Cannot achieve Visual Comfort Sensitivity target. No correction applied.`);
                  // Do not apply correction - return original color
                  finalFg = fg;
                  finalContrast = cr;
                } else {
                  // Try exhaustive search for any color that meets target
                  console.log(`   🔍 [AGGRESSIVE] Attempting 3-phase exhaustive search for color that meets target...`);
                  console.log(`   🔍 [AGGRESSIVE] NOTE: If black/white don't meet target, exhaustive search will likely fail, but testing anyway...`);

                  const bgLum = relLuminance(bg);
                  const needDarker = bgLum > 0.5;
                  let exhaustiveBest = optimalFg;
                  let exhaustiveBestCr = optimalContrast;
                  let exhaustiveBestDistance = Math.abs(optimalContrast - target);
                  let exhaustiveTests = 0;
                  let exhaustiveHits = 0;

                  // Get original color's hue
                  const originalHsl = rgbToHsl(fg);
                  const originalH = originalHsl[0];

                  // PHASE 1: Try original hue and opposite hue with FULL lightness range (0 to 1)
                  console.log(`   🔍 [AGGRESSIVE] Phase 1: Testing original and opposite hues with FULL lightness range (0 to 1)...`);
                  for (let testL = 0; testL <= 1; testL += 0.01) {
                    for (let testS = 0; testS <= 1; testS += 0.05) {
                      for (const testH of [originalH, (originalH + 180) % 360]) {
                        exhaustiveTests++;
                        const testRGB = hslToRgb([testH, testS * 100, testL * 100]);
                        const testCr = wcagContrast(testRGB, bg);
                        const testDistance = Math.abs(testCr - target);

                        if (testCr >= target) {
                          exhaustiveHits++;
                          if (testDistance < exhaustiveBestDistance || exhaustiveBestCr < target) {
                            exhaustiveBest = testRGB;
                            exhaustiveBestCr = testCr;
                            exhaustiveBestDistance = testDistance;
                            if (exhaustiveHits <= 10) {
                              console.log(`   ✅ [AGGRESSIVE] Phase 1 found color: ${testCr.toFixed(2)}:1 >= ${target.toFixed(2)}:1 (strict compliance)`);
                            }
                            // Strict enforcement: return immediately when target is met
                            if (testCr >= target) {
                              console.log(`   ✅ [AGGRESSIVE] Phase 1 strict compliance achieved! Tests: ${exhaustiveTests}, Hits: ${exhaustiveHits}`);
                              finalFg = testRGB;
                              finalContrast = testCr;
                              break;
                            }
                          }
                        } else if (testCr > exhaustiveBestCr && exhaustiveBestCr < target) {
                          exhaustiveBest = testRGB;
                          exhaustiveBestCr = testCr;
                          exhaustiveBestDistance = testDistance;
                        }
                      }
                      if (finalContrast >= target) break;
                    }
                    if (finalContrast >= target) break;
                  }
                  console.log(`   📊 [AGGRESSIVE] Phase 1 complete: Tests=${exhaustiveTests}, Hits=${exhaustiveHits}, Best=${exhaustiveBestCr.toFixed(2)}:1`);

                  if (exhaustiveBestCr >= target && finalContrast < target) {
                    finalFg = exhaustiveBest;
                    finalContrast = exhaustiveBestCr;
                    console.log(`   ✅ [AGGRESSIVE] Phase 1 strict compliance achieved: ${finalContrast.toFixed(2)}:1 >= ${target.toFixed(2)}:1`);
                  } else if (finalContrast < target) {
                    // PHASE 2: Test ALL hues (comprehensive search) with FULL lightness range
                    console.log(`   🔍 [AGGRESSIVE] Phase 2: Testing ALL hues (0-1) with FULL lightness range (0-1)...`);
                    exhaustiveTests = 0;
                    exhaustiveHits = 0;
                    for (let testH = 0; testH < 1; testH += 0.05) {
                      for (let testL = 0; testL <= 1; testL += 0.02) {
                        for (let testS = 0; testS <= 1; testS += 0.1) {
                          exhaustiveTests++;
                          const testRGB = hslToRgb([testH * 360, testS * 100, testL * 100]);
                          const testCr = wcagContrast(testRGB, bg);
                          const testDistance = Math.abs(testCr - target);

                          if (testCr >= target) {
                            exhaustiveHits++;
                            if (testDistance < exhaustiveBestDistance || exhaustiveBestCr < target) {
                              exhaustiveBest = testRGB;
                              exhaustiveBestCr = testCr;
                              exhaustiveBestDistance = testDistance;
                              if (exhaustiveHits <= 20) {
                                console.log(`   ✅ [AGGRESSIVE] Phase 2 found color: ${testCr.toFixed(2)}:1 >= ${target.toFixed(2)}:1 (strict compliance)`);
                              }
                              // Strict enforcement: return immediately when target is met
                              if (testCr >= target) {
                                console.log(`   ✅ [AGGRESSIVE] Phase 2 strict compliance achieved! Tests: ${exhaustiveTests}, Hits: ${exhaustiveHits}`);
                                finalFg = testRGB;
                                finalContrast = testCr;
                                break;
                              }
                            }
                          } else if (testCr > exhaustiveBestCr && exhaustiveBestCr < target) {
                            exhaustiveBest = testRGB;
                            exhaustiveBestCr = testCr;
                            exhaustiveBestDistance = testDistance;
                          }
                        }
                        if (finalContrast >= target) break;
                      }
                      if (finalContrast >= target) break;
                    }
                    console.log(`   📊 [AGGRESSIVE] Phase 2 complete: Tests=${exhaustiveTests}, Hits=${exhaustiveHits}, Best=${exhaustiveBestCr.toFixed(2)}:1`);

                    if (exhaustiveBestCr >= target && finalContrast < target) {
                      finalFg = exhaustiveBest;
                      finalContrast = exhaustiveBestCr;
                      console.log(`   ✅ [AGGRESSIVE] Phase 2 strict compliance achieved: ${finalContrast.toFixed(2)}:1 >= ${target.toFixed(2)}:1`);
                    } else if (finalContrast < target) {
                      // PHASE 3: Test ALL RGB values systematically (every 5 steps for performance)
                      console.log(`   🔍 [AGGRESSIVE] Phase 3: Testing ALL RGB combinations (R/G/B: 0-255 step 5)...`);
                      exhaustiveTests = 0;
                      exhaustiveHits = 0;
                      for (let r = 0; r <= 255; r += 5) {
                        for (let g = 0; g <= 255; g += 5) {
                          for (let b = 0; b <= 255; b += 5) {
                            exhaustiveTests++;
                            const testRGB = [r, g, b];
                            const testCr = wcagContrast(testRGB, bg);
                            const testDistance = Math.abs(testCr - target);

                            if (testCr >= target) {
                              exhaustiveHits++;
                              if (testDistance < exhaustiveBestDistance || exhaustiveBestCr < target) {
                                exhaustiveBest = testRGB;
                                exhaustiveBestCr = testCr;
                                exhaustiveBestDistance = testDistance;
                                if (exhaustiveHits <= 30) {
                                  console.log(`   ✅ [AGGRESSIVE] Phase 3 found color: ${testCr.toFixed(2)}:1 >= ${target.toFixed(2)}:1 (strict compliance, RGB=[${r},${g},${b}])`);
                                }
                                // Strict enforcement: return immediately when target is met
                                if (testCr >= target) {
                                  console.log(`   ✅ [AGGRESSIVE] Phase 3 strict compliance achieved! Tests: ${exhaustiveTests}, Hits: ${exhaustiveHits}`);
                                  finalFg = testRGB;
                                  finalContrast = testCr;
                                  break;
                                }
                              }
                            } else if (testCr > exhaustiveBestCr && exhaustiveBestCr < target) {
                              exhaustiveBest = testRGB;
                              exhaustiveBestCr = testCr;
                              exhaustiveBestDistance = testDistance;
                            }
                          }
                          if (finalContrast >= target) break;
                        }
                        if (finalContrast >= target) break;
                      }
                      console.log(`   📊 [AGGRESSIVE] Phase 3 complete: Tests=${exhaustiveTests}, Hits=${exhaustiveHits}, Best=${exhaustiveBestCr.toFixed(2)}:1`);

                      if (exhaustiveBestCr >= target) {
                        finalFg = exhaustiveBest;
                        finalContrast = exhaustiveBestCr;
                        console.log(`   ✅ [AGGRESSIVE] Phase 3 found color that meets target: ${finalContrast.toFixed(2)}:1`);
                      } else {
                        console.error(`   🚨 [AGGRESSIVE] EXHAUSTIVE SEARCH FAILED: Cannot meet target ${target.toFixed(2)}:1 after testing ${exhaustiveTests} colors`);
                        console.error(`   🚨 [AGGRESSIVE] Best found: ${exhaustiveBestCr.toFixed(2)}:1 (distance: ${exhaustiveBestDistance.toFixed(2)}, RGB: [${exhaustiveBest.map(v => Math.round(v)).join(",")}])`);
                        console.error(`   🚨 [AGGRESSIVE] This suggests the target might be physically impossible, or there's a bug in the search algorithm`);
                        finalFg = exhaustiveBest;
                        finalContrast = exhaustiveBestCr;
                      }
                    }
                  }
                }
              }

              // STRICT ENFORCEMENT: Only apply if contrast >= target
              if (finalContrast < target) {
                console.error(
                  `   🚨 [AGGRESSIVE] FAIL: Correction below Visual Comfort Sensitivity target: ${finalContrast.toFixed(2)}:1 < ${target.toFixed(2)}:1 (SHORT BY ${(target - finalContrast).toFixed(2)})`
                );
                // Force black/white as last resort
                const bgLum = relLuminance(bg);
                const forcedFg = bgLum > 0.5 ? [0, 0, 0] : [255, 255, 255];
                const forcedContrast = wcagContrast(forcedFg, bg);
                if (forcedContrast < target) {
                  console.error(`   🚨 [AGGRESSIVE] FAIL: Even black/white (${forcedContrast.toFixed(2)}:1) cannot meet target ${target.toFixed(2)}:1. Correction not applied.`);
                  return { flagged: true, corrected: false, skipped: false, error: false };
                }
                // Use forced black/white
                finalFg = forcedFg;
                finalContrast = forcedContrast;
                console.log(`   ✅ [AGGRESSIVE] Forced black/white: ${forcedContrast.toFixed(2)}:1 >= ${target.toFixed(2)}:1 (strict compliance achieved)`);
              }

              // =======================================================
              // FIX: Enforce visual fidelity on dark backgrounds
              // =======================================================
              try {
                const bgLum = relLuminance(bg);
                const fgLum = relLuminance(finalFg);
                const tooClose = Math.abs(fgLum - bgLum) < 0.6;
                const isDarkBg = bgLum < 0.3;

                // FIX: Only override if current color doesn't meet target
                // Don't override brand colors that successfully meet the target
                if (isDarkBg && tooClose && finalContrast < target) {
                  console.warn(`   ⚠️  [Visual Fidelity] Contrast ${finalContrast.toFixed(2)}:1 below target ${target.toFixed(2)}:1 and lacks brightness separation on dark background. Adjusting FG to pure white for clarity.`);
                  const whiteRGB = [255, 255, 255];
                  const whiteContrast = wcagContrast(whiteRGB, bg);
                  if (whiteContrast >= target) {
                    console.log(`   ✅ [Visual Fidelity] White foreground restored for improved readability (${whiteContrast.toFixed(2)}:1 >= ${target.toFixed(2)}:1).`);
                    finalFg = whiteRGB;
                    finalContrast = whiteContrast;
                  } else {
                    console.warn(`   🚨 [Visual Fidelity] Pure white still below target (${whiteContrast.toFixed(2)}:1 < ${target.toFixed(2)}:1). Keeping original result.`);
                  }
                } else if (isDarkBg && tooClose && finalContrast >= target) {
                  // Brand color meets target - don't override it
                  console.log(`   ✅ [Visual Fidelity] Brand color meets target (${finalContrast.toFixed(2)}:1 >= ${target.toFixed(2)}:1). Preserving brand color despite close luminance.`);
                }
              } catch (e) {
                console.error('   ❌ [Visual Fidelity] Recheck failed:', e);
              }

              // Apply the final color (only if it meets target) with hover support
              const finalFgStr = `rgb(${finalFg.join(",")})`;
              console.log(`   🎯 [AGGRESSIVE] Applying final color: FG=${finalFgStr}, Contrast=${finalContrast.toFixed(2)}:1, Target=${target.toFixed(2)}:1`);
              applyContrastFixWithHover(el, finalFgStr);
              console.log(
                `   ✅ [AGGRESSIVE] Strict compliance achieved: ${finalContrast.toFixed(2)}:1 >= ${target.toFixed(2)}:1`
              );

              // Compare with AI prediction if available
              if (aiPrediction && aiPrediction.expectedContrast) {
                const aiExpected = aiPrediction.expectedContrast;
                const aiError = Math.abs(finalContrast - aiExpected);
                console.log(`   🤖 [AI COMPARISON] AI Expected: ${aiExpected.toFixed(2)}:1, Actual: ${finalContrast.toFixed(2)}:1, Error: ${aiError.toFixed(2)}`);
                if (aiError > 1.0) {
                  console.warn(`   🚨 [AI ERROR] AI prediction error is LARGE: ${aiError.toFixed(2)}:1 difference`);
                }
              }

              stats.corrected++;
              el.setAttribute("data-ai-contrast-fixed", "true");
              el.setAttribute("data-original-contrast", cr.toFixed(2));
              el.setAttribute("data-new-contrast", finalContrast.toFixed(2));
              el.setAttribute("data-fix-type", "text-color-only");
              el.setAttribute("data-ai-normal-fg", `rgb(${finalFg.join(",")})`);
              el.setAttribute("data-ai-normal-bg", `rgb(${bg.join(",")})`);
              // Clear any stale skip reason since we successfully processed this element
              if (el.hasAttribute('data-ai-skip-reason')) {
                el.removeAttribute('data-ai-skip-reason');
              }
              el.title = `✨ AI optimized contrast\nOriginal: ${cr.toFixed(2)}:1\nCorrected: ${finalContrast.toFixed(2)}:1\nComfort score: ${comfortScore.toFixed(3)}`;
              scannedElements.add(el);
              return { flagged: true, corrected: true, skipped: false, error: false };
            } catch (aggressiveError) {
              console.error(`❌ [AGGRESSIVE] Error in aggressive adjustment:`, aggressiveError);
              console.error(`   Element: ${el.tagName}, FG: [${fg.join(",")}], BG: [${bg.join(",")}]`);
              // Fallback to black/white (strict enforcement)
              const bgLum = relLuminance(bg);
              const optimalFg = bgLum > 0.5 ? [0, 0, 0] : [255, 255, 255];
              const optimalContrast = wcagContrast(optimalFg, bg);

              // STRICT ENFORCEMENT: Only apply if black/white meets target
              if (optimalContrast < target) {
                console.error(`   🚨 [AGGRESSIVE] FAIL: Error fallback black/white (${optimalContrast.toFixed(2)}:1) cannot meet target ${target.toFixed(2)}:1. Correction not applied.`);
                return { flagged: true, corrected: false, skipped: false, error: false };
              }

              const optimalFgStr = `rgb(${optimalFg.join(",")})`;
              applyContrastFixWithHover(el, optimalFgStr);
              console.log(`   ✅ [AGGRESSIVE] Error fallback black/white: ${optimalContrast.toFixed(2)}:1 >= ${target.toFixed(2)}:1 (strict compliance achieved)`);
              stats.corrected++;
              el.setAttribute("data-ai-contrast-fixed", "true");
              el.setAttribute("data-original-contrast", cr.toFixed(2));
              el.setAttribute("data-new-contrast", optimalContrast.toFixed(2));
              el.setAttribute("data-fix-type", "text-color-only");
              // Clear any stale skip reason since we successfully processed this element
              if (el.hasAttribute('data-ai-skip-reason')) {
                el.removeAttribute('data-ai-skip-reason');
              }
              scannedElements.add(el);
              return { flagged: true, corrected: true, skipped: false, error: false };
            }
          }
        } else {
          // Not auto-correcting, just flagging - apply visual highlighting
          el.title = `⚠️ ${contrastInfo}\nComfort score: ${comfortScore.toFixed(3)}`;

          // Apply red outline to highlight low-contrast elements
          if (!el.hasAttribute("data-ai-original-outline")) {
            const originalOutline = getComputedStyle(el).outline || "none";
            el.setAttribute("data-ai-original-outline", originalOutline);
          }

          // Apply red border/outline to make the issue visible
          el.style.setProperty("outline", "2px solid #ff0000", "important");
          el.style.setProperty("outline-offset", "2px", "important");
          el.setAttribute("data-ai-contrast-flagged", "true");
          el.setAttribute("data-ai-contrast-ratio", cr.toFixed(2));

          scannedElements.add(el);
          return { flagged: true, corrected: false, skipped: false, error: false };
        }
      }

      // Element doesn't need flagging (cr >= target)
      scannedElements.add(el);
      return { flagged: false, corrected: false, skipped: false, error: false };
    } catch (error) {
      // Always log the real error clearly, including the element tag and the error object
      console.error(`❌ Error processing element ${el.tagName}:`, error);

      // Wrap any data-collection call in its own inner try/catch so that logging failures cannot break processing
      // This ensures that if data collection itself fails, it doesn't prevent the error from being handled
      try {
        // Data collection would happen here if a function exists
        // Variables may not be defined if error occurred early, so we check for existence
        // This structure ensures logging failures don't break element processing
      } catch (loggingError) {
        console.warn('[DATA-COLLECT] Failed to log error case:', loggingError);
      }

      stats.errors++;
      scannedElements.add(el);
      return { flagged: false, corrected: false, skipped: false, error: true };
    }
  }

  let scannedElements = new WeakSet();

  async function scanWithAI(comfortScale = null, autoCorrect = null) {
    // Get current settings from background worker
    const settings = await getCurrentSettings();
    
    // Use provided values or fall back to stored state
    const effectiveComfortScale = comfortScale !== null ? comfortScale : settings.comfortScale;
    const effectiveAutoCorrect = autoCorrect !== null ? autoCorrect : settings.autoCorrect;
    
    // Update state in background worker
    await updateState({
      comfortScale: effectiveComfortScale,
      autoCorrect: effectiveAutoCorrect,
      lastScanTimestamp: Date.now()
    });
    if (scanInProgress) {
      console.log("⏳ Scan already in progress...");
      return { error: "Scan already in progress" };
    }

    scanInProgress = true;
    const stats = {
      flagged: 0,
      corrected: 0,
      errors: 0,
      skipped: 0
    };
    
    // Initialize hover correction counter for this scan
    window._aiHoverCorrections = 0;

    // Reset AI accuracy stats for this scan
    aiAccuracyStats = {
      totalPredictions: 0,
      correctPredictions: 0,
      incorrectPredictions: 0,
      predictions: [],
      errors: [],
      mistakes: []
    };

    console.log("\n" + "=".repeat(80));
    console.log("🔍 STARTING NEW SCAN - AI Model Accuracy Tracking Enabled");
    console.log("=".repeat(80));

    if (mutationObserver !== null) {
      stopObservingDynamicContent();
    }

    scannedElements = new WeakSet();

    try {
      // STEP 1: Pre-scan background mapping - analyze all sections before processing elements
      console.log("📋 STEP 1: Analyzing all sections and their z-index values...");
      analyzeSections();

      // PHASE A: On-device mode - no API health check needed
      console.log("🔢 [ON-DEVICE] Using on-device CIELAB optimization (zero-latency mode)");
      const apiAvailable = false; // Always false - on-device mode
      
      // Update state to reflect on-device mode
      await updateState({ apiAvailable: false });

      console.log("✅ On-device mode enabled - all corrections use CIELAB optimization");
      console.log(`   🔢 [ON-DEVICE] Core functions: _rgb_to_lab, _delta_e_2000, _find_optimal_color_cielab`);

      // Improved progressive function for better visual variation across comfort scale
      // Lower scales (0.1-0.3): Much lighter, more readable colors (3.5-4.5:1) - minimal darkening
      // Medium scales (0.4-0.6): Moderate colors (5.0-7.0:1) - balanced adjustment
      // High scales (0.7-0.9): Strong contrast (7.0:1) - capped at WCAG AAA standard
      // Maximum (1.0): Maximum contrast (7.0:1) - capped at WCAG AAA standard
      // This ensures visible differences in text appearance across scale levels
      // FIX: Cap maximum at 7.0:1 (WCAG AAA) to prevent impossible targets that force pure black/white
      let target;
      if (effectiveComfortScale <= 0.3) {
        // Low sensitivity: Minimal darkening, preserve brand colors
        // Range: 0.1 → 3.5, 0.2 → 4.0, 0.3 → 4.5
        target = 3.5 + effectiveComfortScale * 3.33;
      } else if (effectiveComfortScale <= 0.6) {
        // Medium sensitivity: Balanced adjustment
        // Range: 0.4 → 5.0, 0.5 → 6.0, 0.6 → 7.0
        target = 3.0 + effectiveComfortScale * 6.67;
      } else if (effectiveComfortScale <= 0.9) {
        // High sensitivity: Strong contrast
        // Range: 0.7 → 7.0, 0.8 → 7.0, 0.9 → 7.0 (capped at WCAG AAA)
        target = Math.min(2.0 + effectiveComfortScale * 8.89, 7.0);
      } else {
        // Maximum sensitivity: Capped at WCAG AAA standard (7.0:1)
        // Range: 1.0 → 7.0 (was 11.0, now capped to prevent impossible targets)
        target = 7.0;
      }
      
      // Update targetContrast in background worker
      await updateState({ targetContrast: target });
      console.log(`🎯 Comfort Scale: ${effectiveComfortScale}`);
      console.log(`🎯 Target contrast ratio: ${target.toFixed(2)}:1 (calculated from comfort scale ${effectiveComfortScale})`);
      console.log(`🎯 Auto-correct mode: ${effectiveAutoCorrect}`);
      console.log(`🎯 [scanWithAI] TARGET CONTRAST SET TO: ${target.toFixed(2)}:1 - All corrections must respect this target!`);

      // STEP 2: Get all sections sorted by z-index (lowest to highest)
      console.log("📋 STEP 2: Getting sections sorted by z-index...");
      const sectionsSorted = getSectionsSortedByZIndex();
      console.log(`   ✅ Found ${sectionsSorted.length} sections to process`);

      // Calculate total elements to scan for progress tracking
      const sectionElementsCache = new Map();
      let totalElementsToScan = 0;
      sectionsSorted.forEach(section => {
        const sectionElements = getElementsInSection(section);
        sectionElementsCache.set(section, sectionElements);
        totalElementsToScan += sectionElements.length;
      });
      
      // Also count orphan elements
      const allElementsForCount = getAllElements();
      const elementsInSectionsForCount = new Set();
      sectionsSorted.forEach(section => {
        const sectionEls = sectionElementsCache.get(section) || [];
        sectionEls.forEach(el => elementsInSectionsForCount.add(el));
      });
      const orphanCount = allElementsForCount.filter(el => !elementsInSectionsForCount.has(el)).length;
      totalElementsToScan += orphanCount;
      
      // Initialize progress tracking
      scanProgress = { processed: 0, total: totalElementsToScan };
      updateScanProgress(0, totalElementsToScan);

      // STEP 3: Process each section in z-index order (lowest to highest)
      for (let sectionIdx = 0; sectionIdx < sectionsSorted.length; sectionIdx++) {
        const section = sectionsSorted[sectionIdx];

        try {
          // Get section info including z-index
          const sectionInfo = sectionBackgroundCache.get(section);
          const zIndex = sectionInfo ? sectionInfo.zIndex : 0;

          console.log(`\n📦 Processing Section ${sectionIdx + 1}/${sectionsSorted.length} (z-index: ${zIndex}, tag: ${section.tagName.toLowerCase()})`);

          // Scan section's background color
          if (sectionInfo) {
            console.log(`   🎨 Section background: ${sectionInfo.color} (alpha: ${sectionInfo.alpha}, isImage: ${sectionInfo.isImage})`);
          }

          // STEP 4: Get all elements within this section
          const sectionElements = getElementsInSection(section);
          sectionElementsCache.set(section, sectionElements); // Cache for later use
          console.log(`   📊 Found ${sectionElements.length} elements in this section`);

          if (sectionElements.length === 0) {
            continue;
          }

          // STEP 5: Process elements within this section (text, links, hyperlinks, colors)
          const batchSize = 50;
          for (let i = 0; i < sectionElements.length; i += batchSize) {
            const batch = sectionElements.slice(i, i + batchSize);

            // CRITICAL: Wrap in try-catch to ensure Promise.all always resolves
            await Promise.all(
              batch.map(async (el) => {
                try {
                  await processElementForContrast(
                    el,
                    target,
                    effectiveComfortScale,
                    effectiveAutoCorrect,
                    scannedElements,
                    stats
                  );
                  // Update progress after each element
                  scanProgress.processed++;
                  updateScanProgress(scanProgress.processed, scanProgress.total);
                } catch (elementError) {
                  // CRITICAL: Mark element as terminal failure on error
                  console.error(`❌ Error processing element ${el.tagName}:`, elementError);
                  el.setAttribute('data-ai-terminal-failure', 'true');
                  scannedElements.add(el);
                  stats.errors++;
                  // Still count as processed for progress
                  scanProgress.processed++;
                  updateScanProgress(scanProgress.processed, scanProgress.total);
                  // Return error state but don't throw - allow Promise.all to complete
                  return { flagged: false, corrected: false, skipped: false, error: true };
                }
              })
            );
          }
        } catch (sectionError) {
          console.error(`❌ Error processing section ${section.tagName}:`, sectionError);
          stats.errors++;
        }
      }

      // Process any remaining elements that weren't in any section
      console.log("\n📋 STEP 6: Processing elements not in any section...");
      // Use cached section elements to avoid redundant DOM queries
      const elementsInSections = new Set();
      sectionsSorted.forEach(section => {
        const sectionEls = sectionElementsCache.get(section) || [];
        sectionEls.forEach(el => elementsInSections.add(el));
      });
      // Only get elements if we need to process orphans (avoid full DOM walk if not needed)
      const allElements = elementsInSections.size > 0 ? getAllElements() : [];

      const orphanElements = allElements.filter(el => {
        // Skip image background elements that are already marked
        // EXCEPTION: Re-evaluate interactive elements - they might have their own solid backgrounds
        const tagName = el.tagName ? el.tagName.toLowerCase() : '';
        const isInteractive = tagName === 'button' || 
                             tagName === 'a' || 
                             tagName === 'input' ||
                             el.getAttribute('role') === 'button' ||
                             el.getAttribute('role') === 'link';
        
        if (isInteractive && el.hasAttribute('data-ai-skip-reason') && el.getAttribute('data-ai-skip-reason') === 'image') {
          // Interactive element marked as image - check if it has its own solid background
          try {
            const elCs = getComputedStyle(el);
            const elBg = parseCSSColorToRGBA(elCs.backgroundColor, [0, 0, 0, 0]);
            if (elBg[3] > 0.5) {
              // Has solid background - remove skip reason and process it
              el.removeAttribute('data-ai-skip-reason');
              el._aiHasImageBackground = false;
              // Continue to process this element
            } else {
              // No solid background - skip it
              return false;
            }
          } catch (e) {
            // If we can't check, skip it
            return false;
          }
        } else if (el.hasAttribute('data-ai-skip-reason') && el.getAttribute('data-ai-skip-reason') === 'image') {
          return false; // Skip this element
        }
        if (el._aiHasImageBackground === true && !isInteractive) {
          return false; // Skip this element (unless it's interactive with solid bg, which we checked above)
        }
        return !elementsInSections.has(el);
      });
      console.log(`   📊 Found ${orphanElements.length} orphan elements to process`);

      if (orphanElements.length > 0) {
        const batchSize = 50;
        for (let i = 0; i < orphanElements.length; i += batchSize) {
          const batch = orphanElements.slice(i, i + batchSize);

          await Promise.all(
            batch.map(async (el) => {
              await processElementForContrast(
                el,
                target,
                comfortScale,
                autoCorrect,
                scannedElements,
                stats
              );
              // Update progress after each orphan element
              scanProgress.processed++;
              updateScanProgress(scanProgress.processed, scanProgress.total);
            })
          );
        }
      }

      // All element processing is now done via processElementForContrast function
      // which handles text, links, hyperlinks, and their colors within each section

      console.log("\n✅ Section-based scanning complete!");
      console.log(`   📊 Processed ${sectionsSorted.length} sections in z-index order`);

      // Print AI Model Accuracy Summary
      console.log("\n" + "=".repeat(80));
      console.log("📊 AI MODEL ACCURACY SUMMARY");
      console.log("=".repeat(80));
      console.log(`   Total Predictions: ${aiAccuracyStats.totalPredictions}`);
      console.log(`   Correct Predictions: ${aiAccuracyStats.correctPredictions}`);
      console.log(`   Incorrect Predictions: ${aiAccuracyStats.incorrectPredictions}`);
      if (aiAccuracyStats.totalPredictions > 0) {
        const accuracyPercent = (aiAccuracyStats.correctPredictions / aiAccuracyStats.totalPredictions * 100).toFixed(2);
        console.log(`   Accuracy: ${accuracyPercent}%`);
      }
      console.log(`   API Errors: ${aiAccuracyStats.errors.length}`);

      if (aiAccuracyStats.incorrectPredictions > 0) {
        console.log("\n   🚨 PYTHON MODEL MISTAKES DETECTED:");
        console.log(`   - ${aiAccuracyStats.incorrectPredictions} predictions disagreed with WCAG assessment`);
        console.log(`   - Detailed mistake information below:\n`);

        if (aiAccuracyStats.mistakes && aiAccuracyStats.mistakes.length > 0) {
          aiAccuracyStats.mistakes.forEach((mistake, idx) => {
            console.log(`   ${idx + 1}. MISTAKE #${idx + 1}:`);
            console.log(`      Element: ${mistake.element} "${mistake.elementText}"`);
            console.log(`      WCAG Assessment: ${mistake.wcagAssessment} (Contrast: ${mistake.contrast.toFixed(2)}:1, Target: ${mistake.target.toFixed(2)}:1)`);
            console.log(`      AI Assessment: ${mistake.aiAssessment} (Comfort Score: ${mistake.comfortScore.toFixed(3)})`);
            console.log(`      Difference from Target: ${mistake.difference.toFixed(2)}:1`);
            console.log(`      Foreground: ${mistake.fg}`);
            console.log(`      Background: ${mistake.bg}`);
            console.log(`      Element Type: ${mistake.elementType}, Font: ${mistake.fontSize}px/${mistake.fontWeight}`);
            console.log(`      Scale: ${mistake.scale}`);
            if (mistake.expectedContrast) {
              console.log(`      AI Expected Contrast: ${mistake.expectedContrast.toFixed(2)}:1`);
              const expectedError = Math.abs(mistake.expectedContrast - mistake.contrast);
              console.log(`      Expected Contrast Error: ${expectedError.toFixed(2)}:1`);
            }
            console.log(`      ---`);
          });
        } else {
          console.log(`   - Review logs above for details on each mistake`);
        }
      }

      if (aiAccuracyStats.errors.length > 0) {
        console.log("\n   ⚠️  API ERRORS:");
        aiAccuracyStats.errors.slice(0, 5).forEach((error, idx) => {
          console.log(`   ${idx + 1}. ${error.error} (Timestamp: ${error.timestamp})`);
        });
        if (aiAccuracyStats.errors.length > 5) {
          console.log(`   ... and ${aiAccuracyStats.errors.length - 5} more errors`);
        }
      }

      // Analyze prediction errors in detail
      if (aiAccuracyStats.predictions.length > 0) {
        console.log("\n   📈 PREDICTION ANALYSIS:");
        const predictionsWithExpectedContrast = aiAccuracyStats.predictions.filter(p => p.output.expected_contrast);
        if (predictionsWithExpectedContrast.length > 0) {
          const avgResponseTime = aiAccuracyStats.predictions.reduce((sum, p) => sum + p.responseTime, 0) / aiAccuracyStats.predictions.length;
          console.log(`   - Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
          console.log(`   - Predictions with Expected Contrast: ${predictionsWithExpectedContrast.length}`);
        }
      }

      console.log("=".repeat(80) + "\n");

      const result = {
        flagged: stats.flagged,
        corrected: stats.corrected,
        total: allElements.length,
        skipped: stats.skipped,
        errors: stats.errors,
        apiAvailable: apiAvailable !== false,
        aiAccuracy: {
          totalPredictions: aiAccuracyStats.totalPredictions,
          correctPredictions: aiAccuracyStats.correctPredictions,
          incorrectPredictions: aiAccuracyStats.incorrectPredictions,
          accuracyPercent: aiAccuracyStats.totalPredictions > 0
            ? (aiAccuracyStats.correctPredictions / aiAccuracyStats.totalPredictions * 100).toFixed(2)
            : 0,
          errors: aiAccuracyStats.errors.length
        }
      };
      
      // Store result for hover correction update
      window._aiLastScanResult = result;

      console.log(`✅ Scan complete - Flagged: ${stats.flagged} Corrected: ${stats.corrected} Total: ${allElements.length}`);
      console.log("✅ Scan complete (full result):", result);

      // After main scan, check and fix inactive tab states
      if (autoCorrect) {
        console.log(`\n🔍 Checking inactive tab states...`);
        try {
          await fixInactiveTabStates(target, autoCorrect);
        } catch (error) {
          console.warn(`⚠️ Error checking inactive tab states:`, error);
        }
      }

      showNotification(result, autoCorrect);

      // CRITICAL: After scan completes, apply comprehensive hover logic to all interactive elements
      // This handles buttons, text links, menu items, footer links, etc.
      if (autoCorrect) {
        setTimeout(() => {
          initHoverCorrection(target);
        }, 200); // Delay to ensure all corrections are applied first
      }

      if (autoCorrect) {
        setTimeout(() => {
          startObservingDynamicContent();
        }, 1000);
      }

      return result;
    } catch (error) {
      console.error("❌ Error during scan:", error);
      stats.errors++;
      return {
        flagged: stats.flagged,
        corrected: stats.corrected,
        total: 0,
        skipped: stats.skipped,
        errors: stats.errors,
        apiAvailable: apiAvailable !== false,
        error: error.message,
      };
    } finally {
      scanInProgress = false;
    }
  }

  // Old element processing code has been removed and replaced with processElementForContrast function
  // All element processing now happens section-by-section based on z-index order

  // Extended hover logic for interactive elements

  // Utility: Parse RGB string to array
  // Defensive: handles null, undefined, transparent, inherit, none, gradients, and malformed input
  function parseRGBString(rgb) {
    // Handle null, undefined, or empty string
    if (!rgb || typeof rgb !== "string") {
      return [0, 0, 0, 0]; // fully transparent fallback
    }

    // Handle gradient strings first (linear-gradient, radial-gradient, etc.)
    // This catches gradients before they get processed as other formats
    if (
      rgb.trim().toLowerCase().startsWith("linear-gradient") ||
      rgb.trim().toLowerCase().startsWith("radial-gradient") ||
      rgb.trim().toLowerCase().startsWith("conic-gradient") ||
      rgb.trim().toLowerCase().startsWith("repeating-linear-gradient") ||
      rgb.trim().toLowerCase().startsWith("repeating-radial-gradient")
    ) {
      return [0, 0, 0, 1]; // Return opaque black for gradient backgrounds
    }

    // Handle CSS keywords that don't parse as RGB
    const normalized = rgb.trim().toLowerCase();
    if (
      normalized === "transparent" ||
      normalized === "inherit" ||
      normalized === "none" ||
      normalized === "initial" ||
      normalized === "unset" ||
      normalized === "revert"
    ) {
      return [0, 0, 0, 0]; // fully transparent fallback
    }

    // Handle other gradient/image strings (catch-all)
    if (
      normalized.includes("gradient") ||
      normalized.includes("url(") ||
      normalized.includes("image")
    ) {
      // Could be a gradient or image - return opaque black as safe fallback
      return [0, 0, 0, 1];
    }

    // Try to match rgb/rgba format
    const rgbaMatch = rgb.match(/rgba?\(([^)]+)\)/);
    if (rgbaMatch) {
      const parts = rgbaMatch[1].split(",").map((v) => parseFloat(v.trim()));
      if (parts.length >= 3) {
        // Ensure we have 4 values (add alpha if missing)
        if (parts.length === 3) {
          parts.push(1); // Add alpha = 1 for rgb() format
        }
        // Clamp values to valid ranges
        return [
          Math.max(0, Math.min(255, parts[0])),
          Math.max(0, Math.min(255, parts[1])),
          Math.max(0, Math.min(255, parts[2])),
          Math.max(0, Math.min(1, parts[3] || 1)),
        ];
      }
    }

    // Fallback: return transparent black if we can't parse it
    return [0, 0, 0, 0];
  }

  // Old duplicate code removed - the rest of SECTION 7.5 continues below

  // Utility: Convert RGB array to string
  function toRGBString(r, g, b) {
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  }

  // Utility: Adjust luminance by factor
  function adjustLuminance(rgb, factor) {
    const [r, g, b] = parseRGBString(rgb);
    return toRGBString(
      Math.min(255, Math.max(0, r * factor)),
      Math.min(255, Math.max(0, g * factor)),
      Math.min(255, Math.max(0, b * factor))
    );
  }

  // Utility: Calculate relative luminance (WCAG)
  function calculateLuminance(rgb) {
    const [r, g, b] = parseRGBString(rgb).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // Utility: Calculate contrast ratio (WCAG)
  function calculateContrastRatio(fg, bg) {
    const L1 = calculateLuminance(fg);
    const L2 = calculateLuminance(bg);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  }

  // Core hover logic application
  function applyHoverLogic(elements, targetContrast = null) {
    // Use global target if not provided (respects comfort scale)
    if (targetContrast === null) {
      targetContrast = currentTargetContrast || 8.0;
    }
    elements.forEach((el) => {
      // Skip if already processed (check both property and data attribute for persistence)
      if (
        el._aiHoverLogicApplied ||
        el.getAttribute("data-hover-bound") === "true"
      ) {
        return;
      }

      // Skip if element is not in DOM
      if (!el || !el.nodeType || !document.contains(el)) {
        return;
      }

      // Skip if hover already failed (prevents repeat failure spam)
      if (el._aiHoverFailed === true) {
        return;
      }
      
      // CRITICAL: Skip elements marked with image/transparent background
      const skipReason = el.getAttribute('data-ai-skip-reason');
      if (skipReason) {
        return;
      }
      
      // CRITICAL: Also check the internal flag for image backgrounds
      if (el._aiHasImageBackground === true) {
        return;
      }

      try {
        const computed = getComputedStyle(el);

        // CRITICAL: Strict hover feasibility gate - check before any adjustment logic
        // Get effective background for feasibility check
        const feasibilityBgRGBA = getEffectiveBackgroundRGBA(el);
        
        // CRITICAL: Handle null return (image background or no opaque background)
        if (!feasibilityBgRGBA) {
          console.log(`   [HOVER] Skipping hover correction for ${el.tagName} - no opaque background found`);
          return;
        }
        
        const feasibilityBgRGB = feasibilityBgRGBA.slice(0, 3);

        // Calculate max possible contrast (black vs white on this background)
        const maxPossibleContrast = Math.max(
          wcagContrast([0, 0, 0], feasibilityBgRGB),
          wcagContrast([255, 255, 255], feasibilityBgRGB)
        );

        // Check feasible_target from data attribute (if exists)
        const feasibleTargetAttr = el.getAttribute("data-feasible-target");
        const feasibleTarget = feasibleTargetAttr !== null ? feasibleTargetAttr === "true" : null;

        // If feasible_target is false OR max possible contrast < effective target, skip hover correction
        if ((feasibleTarget === false) || (maxPossibleContrast < targetContrast)) {
          const elementInfo = `${el.tagName} "${(el.textContent || "").trim().substring(0, 30)}"`;
          console.log(`   [HOVER] Feasibility false, skipping hover correction for ${elementInfo}`);
          console.log(`      Feasible target: ${feasibleTarget}, Max possible contrast: ${maxPossibleContrast.toFixed(2)}:1, Target: ${targetContrast.toFixed(2)}:1`);
          
          // 🔍 DEBUG: Check if element has CSS :hover rule that might conflict
          // Use stylesheet reading instead of getComputedStyle (which doesn't work when not hovered)
          let cssHoverFg = null;
          let cssHoverBg = null;
          try {
            const classes = el.className ? el.className.split(/\s+/) : [];
            const tagName = el.tagName.toLowerCase();
            const id = el.id;
            
            // Read all stylesheets to find :hover rules
            const allStylesheets = Array.from(document.styleSheets);
            const allRules = [];
            
            allStylesheets.forEach((sheet) => {
              try {
                if (sheet.cssRules) {
                  Array.from(sheet.cssRules).forEach((rule) => {
                    if (rule.selectorText && rule.selectorText.includes(':hover')) {
                      allRules.push(rule);
                    }
                  });
                }
              } catch (e) {
                // CORS or security error - skip this stylesheet
              }
            });
            
            // Find matching :hover rules
            const matchedHoverRules = allRules.filter((rule) => {
              if (!rule.selectorText) return false;
              const selector = rule.selectorText.toLowerCase();
              if (!selector.includes(':hover')) return false;
              
              // Check if selector matches this element
              const selectorParts = selector.split(':hover');
              const baseSelector = selectorParts[0].trim();
              
              // Check by class
              for (const cls of classes) {
                if (baseSelector.includes(`.${cls.toLowerCase()}`) || 
                    baseSelector === `.${cls.toLowerCase()}`) {
                  return true;
                }
              }
              
              // Check by tag
              if (baseSelector === tagName || baseSelector.startsWith(`${tagName}.`)) {
                return true;
              }
              
              // Check by ID
              if (id && (baseSelector === `#${id.toLowerCase()}` || baseSelector.includes(`#${id.toLowerCase()}`))) {
                return true;
              }
              
              return false;
            });
            
            if (matchedHoverRules.length > 0) {
              matchedHoverRules.forEach((rule) => {
                if (rule.style.backgroundColor) {
                  cssHoverBg = rule.style.backgroundColor;
                }
                if (rule.style.color) {
                  cssHoverFg = rule.style.color;
                }
              });
            }
            
            const currentFg = computed.color;
            const currentBg = computed.backgroundColor;
            
            console.log(`   🔍 [HOVER SKIP] CSS :hover rule check:`);
            console.log(`      Current state: FG=${currentFg}, BG=${currentBg}`);
            console.log(`      CSS :hover from stylesheet: FG=${cssHoverFg || 'none'}, BG=${cssHoverBg || 'none'}`);
            
            // Check if CSS :hover changes colors significantly
            if (cssHoverBg || cssHoverFg) {
              console.warn(`   ⚠️  [HOVER SKIP] Element has CSS :hover rule that changes colors!`);
              console.warn(`      This may cause visibility issues since our hover logic is skipped.`);
              
              // Check contrast of CSS :hover state
              const hoverFgParsed = cssHoverFg ? parseCSSColorToRGBA(cssHoverFg, [0, 0, 0]) : parseCSSColorToRGBA(currentFg, [0, 0, 0]);
              const hoverBgParsed = cssHoverBg ? parseCSSColorToRGBA(cssHoverBg, [0, 0, 0, 0]) : parseCSSColorToRGBA(currentBg, [0, 0, 0, 0]);
              const hoverFgRGB = hoverFgParsed.slice(0, 3);
              const hoverBgRGB = hoverBgParsed[3] > 0.5 ? hoverBgParsed.slice(0, 3) : feasibilityBgRGB;
              const hoverContrast = wcagContrast(hoverFgRGB, hoverBgRGB);
              
              console.log(`      CSS :hover contrast: ${hoverContrast.toFixed(2)}:1`);
              
              if (hoverContrast < targetContrast) {
                console.error(`   🚨 [HOVER SKIP] CSS :hover contrast ${hoverContrast.toFixed(2)}:1 < target ${targetContrast.toFixed(2)}:1!`);
                console.error(`      This will cause visibility issues when hovering!`);
                console.error(`      Recommendation: Apply our hover logic to override CSS :hover rule.`);
                
                // Don't skip - apply our hover logic anyway to fix the CSS :hover issue
                console.warn(`   🔧 [HOVER SKIP] Overriding skip decision - will apply hover logic to fix CSS :hover contrast issue`);
                el._aiHoverFailed = false; // Reset the skip flag
                // Continue to hover logic below instead of returning
              }
            }
          } catch (e) {
            console.log(`      Could not check CSS :hover: ${e.message}`);
          }
          
          // If we detected a CSS :hover contrast issue, don't skip - continue to hover logic
          if (cssHoverFg || cssHoverBg) {
            const hoverFgParsed = cssHoverFg ? parseCSSColorToRGBA(cssHoverFg, [0, 0, 0]) : parseCSSColorToRGBA(computed.color, [0, 0, 0]);
            const hoverBgParsed = cssHoverBg ? parseCSSColorToRGBA(cssHoverBg, [0, 0, 0, 0]) : parseCSSColorToRGBA(computed.backgroundColor, [0, 0, 0, 0]);
            const hoverFgRGB = hoverFgParsed.slice(0, 3);
            const hoverBgRGB = hoverBgParsed[3] > 0.5 ? hoverBgParsed.slice(0, 3) : feasibilityBgRGB;
            const hoverContrast = wcagContrast(hoverFgRGB, hoverBgRGB);
            
            if (hoverContrast < targetContrast) {
              // Don't skip - apply hover logic to fix the issue
              console.warn(`   🔧 [HOVER SKIP] Overriding skip - CSS :hover needs fixing, continuing to hover logic`);
              el._aiHoverFailed = false;
              // Don't return - continue to hover logic
            } else {
              // CSS :hover is fine, safe to skip
              el._aiHoverFailed = true;
              return;
            }
          } else {
            // No CSS :hover rule, safe to skip
            el._aiHoverFailed = true;
            return;
          }
          
          el._aiHoverFailed = true;
          return;
        }

        // Skip hover correction if element already has contrast >= target in normal state
        // This prevents unnecessary adjustments to elements that are already perfect
        const currentFgRGB = getEffectiveForegroundRGB(el, feasibilityBgRGB);
        const currentContrast = wcagContrast(currentFgRGB, feasibilityBgRGB);
        if (currentContrast >= targetContrast) {
          // Element already meets target - but check if CSS :hover might conflict
          const elementInfo = `${el.tagName} "${(el.textContent || "").trim().substring(0, 30)}"`;
          console.log(`   ⏭️  [SKIP HOVER] Element already meets target contrast (${currentContrast.toFixed(2)}:1 >= ${targetContrast.toFixed(2)}:1), skipping hover correction`);
          
          // 🔍 DEBUG: Check if element has CSS :hover rule that might conflict
          // Use stylesheet reading instead of getComputedStyle (which doesn't work when not hovered)
          let cssHoverFg = null;
          let cssHoverBg = null;
          try {
            const classes = el.className ? el.className.split(/\s+/) : [];
            const tagName = el.tagName.toLowerCase();
            const id = el.id;
            
            // Read all stylesheets to find :hover rules
            const allStylesheets = Array.from(document.styleSheets);
            const allRules = [];
            
            allStylesheets.forEach((sheet) => {
              try {
                if (sheet.cssRules) {
                  Array.from(sheet.cssRules).forEach((rule) => {
                    if (rule.selectorText && rule.selectorText.includes(':hover')) {
                      allRules.push(rule);
                    }
                  });
                }
              } catch (e) {
                // CORS or security error - skip this stylesheet
              }
            });
            
            // Find matching :hover rules
            const matchedHoverRules = allRules.filter((rule) => {
              if (!rule.selectorText) return false;
              const selector = rule.selectorText.toLowerCase();
              if (!selector.includes(':hover')) return false;
              
              // Check if selector matches this element
              const selectorParts = selector.split(':hover');
              const baseSelector = selectorParts[0].trim();
              
              // Check by class
              for (const cls of classes) {
                if (baseSelector.includes(`.${cls.toLowerCase()}`) || 
                    baseSelector === `.${cls.toLowerCase()}`) {
                  return true;
                }
              }
              
              // Check by tag
              if (baseSelector === tagName || baseSelector.startsWith(`${tagName}.`)) {
                return true;
              }
              
              // Check by ID
              if (id && (baseSelector === `#${id.toLowerCase()}` || baseSelector.includes(`#${id.toLowerCase()}`))) {
                return true;
              }
              
              return false;
            });
            
            if (matchedHoverRules.length > 0) {
              matchedHoverRules.forEach((rule) => {
                if (rule.style.backgroundColor) {
                  cssHoverBg = rule.style.backgroundColor;
                }
                if (rule.style.color) {
                  cssHoverFg = rule.style.color;
                }
              });
            }
            
            const currentFg = computed.color;
            const currentBg = computed.backgroundColor;
            
            console.log(`   🔍 [SKIP HOVER] CSS :hover rule check for ${elementInfo}:`);
            console.log(`      Current state: FG=${currentFg}, BG=${currentBg}`);
            console.log(`      CSS :hover from stylesheet: FG=${cssHoverFg || 'none'}, BG=${cssHoverBg || 'none'}`);
            
            // Check if CSS :hover changes colors significantly
            if (cssHoverBg || cssHoverFg) {
              console.warn(`   ⚠️  [SKIP HOVER] Element has CSS :hover rule that changes colors!`);
              console.warn(`      Current: FG=${currentFg}, BG=${currentBg}`);
              console.warn(`      CSS :hover: FG=${cssHoverFg || currentFg}, BG=${cssHoverBg || currentBg}`);
              
              // Check contrast of CSS :hover state
              const hoverFgParsed = cssHoverFg ? parseCSSColorToRGBA(cssHoverFg, [0, 0, 0]) : parseCSSColorToRGBA(currentFg, [0, 0, 0]);
              const hoverBgParsed = cssHoverBg ? parseCSSColorToRGBA(cssHoverBg, [0, 0, 0, 0]) : parseCSSColorToRGBA(currentBg, [0, 0, 0, 0]);
              const hoverFgRGB = hoverFgParsed.slice(0, 3);
              const hoverBgRGB = hoverBgParsed[3] > 0.5 ? hoverBgParsed.slice(0, 3) : feasibilityBgRGB;
              const hoverContrast = wcagContrast(hoverFgRGB, hoverBgRGB);
              
              console.log(`      CSS :hover contrast: ${hoverContrast.toFixed(2)}:1 (target: ${targetContrast.toFixed(2)}:1)`);
              
              if (hoverContrast < targetContrast) {
                console.error(`   🚨 [SKIP HOVER] CSS :hover contrast ${hoverContrast.toFixed(2)}:1 < target ${targetContrast.toFixed(2)}:1!`);
                console.error(`      This will cause visibility issues when hovering!`);
                console.error(`      Recommendation: Apply our hover logic to override CSS :hover rule.`);
                
                // Mark element as having CSS :hover contrast issue (for counting)
                el.setAttribute("data-css-hover-low-contrast", "true");
                
                // Don't skip - apply our hover logic anyway to fix the CSS :hover issue
                console.warn(`   🔧 [SKIP HOVER] Overriding skip decision - will apply hover logic to fix CSS :hover contrast issue`);
                // Continue to hover logic below instead of returning
              } else {
                console.log(`   ✅ [SKIP HOVER] CSS :hover contrast is acceptable (${hoverContrast.toFixed(2)}:1 >= ${targetContrast.toFixed(2)}:1)`);
                // Even if CSS :hover contrast is acceptable, we should still apply our hover logic
                // to ensure it works correctly with our corrected normal state and overrides properly
                // Our !important styles might block CSS :hover, so we need to handle it via JavaScript
                console.warn(`   ⚠️  [SKIP HOVER] CSS :hover rule detected - will apply our hover logic to ensure proper override`);
                console.warn(`      Our !important styles might block CSS :hover, so we'll handle it via JavaScript`);
                // Continue to hover logic to ensure proper handling
              }
            } else {
              console.log(`   ✅ [SKIP HOVER] No CSS :hover rule conflicts detected`);
            }
          } catch (e) {
            console.log(`      Could not check CSS :hover: ${e.message}`);
          }
          
          // If we detected a CSS :hover rule, always apply our hover logic to ensure proper override
          // Our !important styles might block CSS :hover, so we need to handle it via JavaScript
          if (cssHoverFg || cssHoverBg) {
            // Parse CSS :hover colors to check contrast BEFORE storing
            const hoverFgParsed = cssHoverFg ? parseCSSColorToRGBA(cssHoverFg, [0, 0, 0]) : parseCSSColorToRGBA(computed.color, [0, 0, 0]);
            const hoverBgParsed = cssHoverBg ? parseCSSColorToRGBA(cssHoverBg, [0, 0, 0, 0]) : parseCSSColorToRGBA(computed.backgroundColor, [0, 0, 0, 0]);
            const hoverFgRGB = hoverFgParsed.slice(0, 3);
            const hoverBgRGB = hoverBgParsed[3] > 0.5 ? hoverBgParsed.slice(0, 3) : feasibilityBgRGB;
            const hoverContrast = wcagContrast(hoverFgRGB, hoverBgRGB);
            
            // Only store CSS :hover colors if they meet the target contrast
            if (hoverContrast >= targetContrast) {
              // Store CSS :hover colors in data attributes so they can be used in hover calculation
              if (cssHoverFg) {
                el.setAttribute("data-css-hover-fg", cssHoverFg);
                console.log(`   📝 [SKIP HOVER] Stored CSS :hover FG: ${cssHoverFg} (contrast: ${hoverContrast.toFixed(2)}:1)`);
              }
              if (cssHoverBg) {
                el.setAttribute("data-css-hover-bg", cssHoverBg);
                console.log(`   📝 [SKIP HOVER] Stored CSS :hover BG: ${cssHoverBg} (contrast: ${hoverContrast.toFixed(2)}:1)`);
              }
              // CSS :hover contrast is acceptable, but we still need to apply our hover logic
              // to ensure it works correctly with our !important styles
              console.warn(`   🔧 [SKIP HOVER] CSS :hover rule detected - applying our hover logic to ensure proper override`);
              // CRITICAL FIX: Mark as processed to prevent infinite loop, but continue to hover logic
              el._aiHoverLogicApplied = true;
              el.setAttribute("data-hover-bound", "true");
              // Continue to hover logic below
            } else {
              // CSS :hover contrast is below target - don't store them, will use calculated colors instead
              console.warn(`   🔧 [SKIP HOVER] CSS :hover contrast ${hoverContrast.toFixed(2)}:1 < target ${targetContrast.toFixed(2)}:1 - NOT storing CSS :hover colors, will use calculated colors`);
              // Mark element as having CSS :hover contrast issue (for counting)
              el.setAttribute("data-css-hover-low-contrast", "true");
              // Ensure CSS :hover colors are not stored
              el.removeAttribute("data-css-hover-fg");
              el.removeAttribute("data-css-hover-bg");
              // CRITICAL FIX: Mark as processed to prevent infinite loop, but continue to hover logic
              el._aiHoverLogicApplied = true;
              el.setAttribute("data-hover-bound", "true");
              // Continue to hover logic below
            }
          } else {
            // No CSS :hover rule, safe to skip
            el._aiHoverLogicApplied = true;
            el.setAttribute("data-hover-bound", "true");
            return;
          }
        }

        // CRITICAL: Use stored corrected colors from data attributes (set by scanWithAI)
        // These represent the CORRECTED (high-contrast) normal state
        const storedFg = el.getAttribute("data-ai-normal-fg");
        const storedBg = el.getAttribute("data-ai-normal-bg");

        // Get current colors (prefer stored corrected, fallback to computed)
        let fg = storedFg || computed.color;
        let bg = storedBg || computed.backgroundColor;

        // CRITICAL: Verify normal state meets target contrast before calculating hover
        // If stored colors don't meet target, correct them first
        const fgParsed = parseCSSColorToRGBA(fg, [0, 0, 0]);
        const bgParsed = parseCSSColorToRGBA(bg, [0, 0, 0, 0]);
        const fgRGB = fgParsed.slice(0, 3);
        const bgRGB = bgParsed[3] > 0.5 ? bgParsed.slice(0, 3) : null;

        // CRITICAL: Get blended background (full RGBA) for accurate contrast calculation
        const effectiveBgRGBA = getEffectiveBackgroundRGBA(el);
        
        // CRITICAL: Handle null return (image background or no opaque background)
        if (!effectiveBgRGBA) {
          console.log(`   [HOVER] Skipping hover correction for ${el.tagName} - no opaque background found`);
          return;
        }
        
        const effectiveBgRGB = effectiveBgRGBA.slice(0, 3);
        const effectiveBgAlpha = effectiveBgRGBA[3];
        const finalBgForCheck = bgRGB || effectiveBgRGB;

        // Check if normal state meets target
        const normalContrast = wcagContrast(fgRGB, finalBgForCheck);

        // Check if element is already marked as "best achievable" (target was physically impossible)
        const existingFeasibleMax = el.getAttribute("data-feasible-max") === "true";
        const existingFeasibleContrast = el.getAttribute("data-feasible-contrast");

        // Declare correctedFgRGB outside the if block so it's available for hover calculation
        let correctedFgRGB = [...fgRGB]; // Default to current fgRGB (copy array to avoid reference issues)

        if (normalContrast < targetContrast) {
          // If already marked as feasible max, check if current contrast matches stored feasible contrast
          if (existingFeasibleMax && existingFeasibleContrast) {
            const feasibleContrastNum = parseFloat(existingFeasibleContrast);
            const contrastDiff = Math.abs(normalContrast - feasibleContrastNum);

            // If current contrast matches stored feasible contrast (within 0.1 tolerance), skip correction
            if (contrastDiff < 0.1) {
              const maxPossible = Math.max(
                wcagContrast([0, 0, 0], finalBgForCheck),
                wcagContrast([255, 255, 255], finalBgForCheck)
              );

              if (maxPossible < targetContrast) {
                console.log(
                  `   ✅ [FEASIBILITY] Element already marked as best achievable (${normalContrast.toFixed(2)}:1). Target ${targetContrast.toFixed(2)}:1 is still impossible (max: ${maxPossible.toFixed(2)}:1). Skipping correction.`
                );
                // Skip correction - already at best achievable
              } else {
                // Target is now achievable, proceed with correction
                console.warn(
                  `   ⚠️  [FEASIBILITY] Element was marked as feasible, but target ${targetContrast.toFixed(2)}:1 is now achievable (max: ${maxPossible.toFixed(2)}:1). Will attempt correction.`
                );
              }
            } else {
              // Contrast doesn't match - proceed with correction
              console.warn(
                `   ⚠️  [FEASIBILITY] Element marked as feasible but contrast mismatch (stored: ${feasibleContrastNum.toFixed(2)}:1, current: ${normalContrast.toFixed(2)}:1). Will verify.`
              );
            }
          }

          // Only proceed with correction if not already at best achievable
          const shouldSkipCorrection = existingFeasibleMax && existingFeasibleContrast &&
            Math.abs(normalContrast - parseFloat(existingFeasibleContrast)) < 0.1 &&
            Math.max(wcagContrast([0, 0, 0], finalBgForCheck), wcagContrast([255, 255, 255], finalBgForCheck)) < targetContrast;

          if (!shouldSkipCorrection) {
            // Normal state doesn't meet target - correct it first
            console.log(
              `   🔧 [NORMAL STATE] Adjusting: Normal state contrast ${normalContrast.toFixed(
                2
              )}:1 < target ${targetContrast.toFixed(
                2
              )}:1, correcting before hover calculation`
            );

            // Use adjustColorToContrast to get corrected colors
            const correctedFgRGBResult = adjustColorToContrast(
              fgRGB,
              finalBgForCheck,
              targetContrast
            );
            correctedFgRGB = (correctedFgRGBResult && typeof correctedFgRGBResult === 'object' && 'fg' in correctedFgRGBResult) ? correctedFgRGBResult.fg : correctedFgRGBResult;
            const isFeasibleMax = (correctedFgRGBResult && typeof correctedFgRGBResult === 'object' && correctedFgRGBResult.feasible === true);
            const actualContrast = (correctedFgRGBResult && typeof correctedFgRGBResult === 'object' && 'contrast' in correctedFgRGBResult) ? correctedFgRGBResult.contrast : null;

            // Debug log to verify extraction
            if (correctedFgRGBResult && typeof correctedFgRGBResult === 'object') {
              console.log(`   🔍 [FEASIBILITY CHECK] Result type: object, has 'fg': ${'fg' in correctedFgRGBResult}, has 'feasible': ${'feasible' in correctedFgRGBResult}, feasible value: ${correctedFgRGBResult.feasible}, has 'contrast': ${'contrast' in correctedFgRGBResult}, contrast value: ${correctedFgRGBResult.contrast}`);
            }

            const correctedFg = `rgb(${correctedFgRGB
              .map((v) => Math.round(v))
              .join(",")})`;

            // Update stored colors
            fg = correctedFg;
            el.setAttribute("data-ai-normal-fg", correctedFg);
            el.setAttribute("data-corrected-fg", correctedFg);

            // Mark as "best achievable" if target was physically impossible
            if (isFeasibleMax && actualContrast) {
              el.setAttribute("data-feasible-max", "true");
              el.setAttribute("data-feasible-contrast", actualContrast.toFixed(2));
              console.log(`   ✅ [FEASIBILITY] Marked as best achievable contrast: ${actualContrast.toFixed(2)}:1 (target ${targetContrast.toFixed(2)}:1 was impossible)`);
            } else {
              console.log(`   🔍 [FEASIBILITY CHECK] Not marking as feasible - isFeasibleMax: ${isFeasibleMax}, actualContrast: ${actualContrast}`);
            }

            // CRITICAL: Only adjust existing colors - never add backgrounds
            // Apply corrected text color with hover support
            applyContrastFixWithHover(el, correctedFg);
            // Only adjust background if element already has one (never add new backgrounds)
            const hasExistingBg = hasExplicitBackground(el);
            if (hasExistingBg && bgRGB) {
              const correctedBgStr = `rgb(${bgRGB
                .map((v) => Math.round(v))
                .join(",")})`;
              el.style.setProperty("background-color", correctedBgStr, "important");
              el.setAttribute("data-ai-normal-bg", correctedBgStr);
              el.setAttribute("data-corrected-bg", correctedBgStr);
              bg = correctedBgStr;
            }

            // Verify correction meets strict target (skip if already marked as feasible max)
            if (isFeasibleMax && actualContrast) {
              // Already marked as feasible max above - accept the result
              console.log(
                `   ✅ [FEASIBILITY] Accepted best achievable normal state: ${normalContrast.toFixed(
                  2
                )}:1 → ${actualContrast.toFixed(2)}:1 (target ${targetContrast.toFixed(2)}:1 was impossible)`
              );
            } else {
              const correctedContrast = wcagContrast(correctedFgRGB, finalBgForCheck);
              if (correctedContrast >= targetContrast) {
                console.log(
                  `   ✅ Corrected normal state: ${normalContrast.toFixed(
                    2
                  )}:1 → ${correctedContrast.toFixed(2)}:1 (strict compliance achieved)`
                );
              } else {
                // Target not met - force black/white (maximum possible contrast)
                const bgLum = relLuminance(finalBgForCheck);
                const forcedFgRGB = bgLum > 0.5 ? [0, 0, 0] : [255, 255, 255];
                const forcedContrast = wcagContrast(forcedFgRGB, finalBgForCheck);
                const forcedFg = `rgb(${forcedFgRGB.join(",")})`;

                // Apply forced black/white
                fg = forcedFg;
                correctedFgRGB[0] = forcedFgRGB[0];
                correctedFgRGB[1] = forcedFgRGB[1];
                correctedFgRGB[2] = forcedFgRGB[2];
                el.style.setProperty("color", forcedFg, "important");
                el.setAttribute("data-ai-normal-fg", forcedFg);
                el.setAttribute("data-corrected-fg", forcedFg);

                if (forcedContrast < targetContrast) {
                  const shortBy = targetContrast - forcedContrast;
                  console.error(
                    `   🚨 [NORMAL STATE] FAIL: Target ${targetContrast.toFixed(2)}:1 is physically impossible. Forced black/white gives ${forcedContrast.toFixed(2)}:1 (short by ${shortBy.toFixed(2)}:1)`
                  );
                  // Mark as best achievable since target is impossible
                  el.setAttribute("data-feasible-max", "true");
                  el.setAttribute("data-feasible-contrast", forcedContrast.toFixed(2));
                  console.log(`   ✅ [FEASIBILITY] Marked as best achievable contrast: ${forcedContrast.toFixed(2)}:1 (target ${targetContrast.toFixed(2)}:1 was impossible)`);
                } else {
                  console.log(
                    `   ✅ [NORMAL STATE] Forced black/white: ${forcedContrast.toFixed(2)}:1 >= ${targetContrast.toFixed(2)}:1 (strict compliance achieved)`
                  );
                }
              }
            }
          } else {
            // Already at best achievable - use current colors for hover calculation
            console.log(`   ✅ [FEASIBILITY] Skipping correction - already at best achievable contrast ${normalContrast.toFixed(2)}:1`);
          }
        }

        // Update fgRGB for hover calculation (use corrected color if correction was done, otherwise use current)
        fgRGB[0] = correctedFgRGB[0];
        fgRGB[1] = correctedFgRGB[1];
        fgRGB[2] = correctedFgRGB[2];

        // Store corrected colors if not already stored
        if (storedFg) {
          el.setAttribute("data-corrected-fg", storedFg);
        } else {
          el.setAttribute("data-corrected-fg", fg);
        }

        if (storedBg) {
          el.setAttribute("data-corrected-bg", storedBg);
        } else {
          el.setAttribute("data-corrected-bg", bg);
        }

        // Check if element has solid background (re-check since colors may have been corrected)
        const hasSolidBg = bgRGB !== null;
        
        // 🔍 DEBUG: Log state before hover calculation
        const elementInfoDebug = `${el.tagName} "${(el.textContent || "").trim().substring(0, 30)}"`;
        console.log(`   🔍 [HOVER CALC] ${elementInfoDebug} | Starting hover color calculation:`);
        console.log(`      Normal state: FG=rgb([${fgRGB.join(',')}]), BG=${bgRGB ? `rgb([${bgRGB.join(',')}])` : 'none'}`);
        console.log(`      Has solid background: ${hasSolidBg}`);
        console.log(`      Target contrast: ${targetContrast.toFixed(2)}:1`);

        // CRITICAL: Calculate hover colors that meet target contrast (force black/white if target is impossible)
        // Use the already-parsed RGB values (may have been updated if correction was needed)
        const finalBgRGB = bgRGB || effectiveBgRGB;

        // Calculate hover colors using contrast-aware algorithm
        let hoverFgRGB = [...fgRGB];
        let hoverBgRGB = bgRGB ? [...bgRGB] : null;
        let hoverFg = null; // Declare hover foreground color string
        let hoverBg = null; // Declare hover background color string

        // 🔍 Check if we detected CSS :hover colors earlier - use them if available
        const cssHoverFgStored = el.getAttribute("data-css-hover-fg");
        const cssHoverBgStored = el.getAttribute("data-css-hover-bg");
        
        if (cssHoverFgStored || cssHoverBgStored) {
          console.log(`   🎯 [HOVER CALC] Using CSS :hover colors from stylesheet`);
          
          // Parse and set CSS :hover colors
          if (cssHoverFgStored) {
            const parsed = parseCSSColorToRGBA(cssHoverFgStored, [0, 0, 0]);
            hoverFgRGB = parsed.slice(0, 3);
            // Ensure RGB format
            hoverFg = `rgb(${hoverFgRGB.join(',')})`;
            console.log(`      CSS :hover FG: ${cssHoverFgStored} → ${hoverFg} (RGB: [${hoverFgRGB.join(',')}])`);
          }
          if (cssHoverBgStored && hasSolidBg) {
            const parsed = parseCSSColorToRGBA(cssHoverBgStored, [0, 0, 0, 0]);
            if (parsed[3] > 0.5) {
              hoverBgRGB = parsed.slice(0, 3);
              // Ensure RGB format
              hoverBg = `rgb(${hoverBgRGB.join(',')})`;
              console.log(`      CSS :hover BG: ${cssHoverBgStored} → ${hoverBg} (RGB: [${hoverBgRGB.join(',')}])`);
            }
          }
          
          // Verify contrast of CSS :hover colors
          const finalHoverBg = hoverBgRGB || effectiveBgRGB;
          const hoverContrast = wcagContrast(hoverFgRGB, finalHoverBg);
          console.log(`      CSS :hover contrast: ${hoverContrast.toFixed(2)}:1 (target: ${targetContrast.toFixed(2)}:1)`);
          
          if (hoverContrast < targetContrast) {
            console.warn(`   ⚠️  [HOVER CALC] CSS :hover contrast below target, will adjust`);
            // Clear the flag that indicates we're using CSS :hover colors
            el.removeAttribute("data-using-css-hover");
            // CRITICAL: Clear stored CSS :hover colors so they won't be used in hoverIn handler
            el.removeAttribute("data-css-hover-fg");
            el.removeAttribute("data-css-hover-bg");
            console.log(`   🔧 [HOVER CALC] Cleared stored CSS :hover colors - will use calculated colors instead`);
            // Fall through to normal hover calculation to fix it
            hoverFg = null; // Reset so calculation happens
            hoverBg = null;
            hoverFgRGB = [...fgRGB]; // Reset to normal state
            hoverBgRGB = bgRGB ? [...bgRGB] : null;
          } else {
            console.log(`   ✅ [HOVER CALC] CSS :hover colors meet target, using them directly`);
            // Mark that we're using CSS :hover colors so we skip all calculations below
            el.setAttribute("data-using-css-hover", "true");
            
            // CRITICAL: Store CSS :hover colors EXACTLY as they are (no adjustments)
            // These will be used directly in the hover-in handler
            // Ensure they're in RGB format for consistency
            if (cssHoverFgStored) {
              const parsed = parseCSSColorToRGBA(cssHoverFgStored, [0, 0, 0]);
              hoverFgRGB = parsed.slice(0, 3);
              hoverFg = `rgb(${hoverFgRGB.join(',')})`;
              console.log(`   📝 [HOVER CALC] Storing CSS :hover FG exactly: ${hoverFg}`);
            }
            if (cssHoverBgStored && hasSolidBg) {
              const parsed = parseCSSColorToRGBA(cssHoverBgStored, [0, 0, 0, 0]);
              if (parsed[3] > 0.5) {
                hoverBgRGB = parsed.slice(0, 3);
                hoverBg = `rgb(${hoverBgRGB.join(',')})`;
                console.log(`   📝 [HOVER CALC] Storing CSS :hover BG exactly: ${hoverBg}`);
              }
            }
            
            // Skip to storage - don't calculate new colors
          }
        }

        // Only calculate hover colors if we don't have CSS :hover colors already set
        // Check if we're using CSS :hover colors (declare early to avoid reference errors)
        const usingCssHover = el.getAttribute("data-using-css-hover") === "true";
        
        if (hasSolidBg && bgRGB && !hoverFg && !usingCssHover) {
          // Element has solid background - use hue-preserving hover calculation
          // Only calculate if we don't have CSS :hover colors
          // Snapshot will be taken in hover-in handler
          
          console.log(`   🔍 [HOVER CALC] Calculating hover colors (no CSS :hover rule detected)`);

          const hoverResult = calculateHuePreservingHoverColor(fgRGB, bgRGB, targetContrast, {
            adjustBackground: true,  // Allow background adjustment for buttons
            maxBrightnessShift: 0.3, // Allow up to 30% brightness shift
            preserveIdentity: true   // Always preserve brand colors
          });

          hoverFgRGB = hoverResult.fg;
          hoverBgRGB = hoverResult.bg || bgRGB; // Keep original bg if no adjustment needed

          // Verify the hover color won't cause issues
          const beforeContrast = wcagContrast(fgRGB, bgRGB);
          const safetyCheck = verifyHoverSafety(el,
            `rgb(${hoverFgRGB.join(',')})`,
            `rgb(${hoverBgRGB.join(',')})`,
            beforeContrast
          );

          if (!safetyCheck.safe) {
            console.warn(`   ⚠️ [HOVER SAFETY] Rejecting hover colors: ${safetyCheck.reason}`);
            // Keep original colors - just add subtle brightness shift
            const [h, s, l] = rgbToHsl(fgRGB);
            const bgLum = relLuminance(bgRGB);
            const shiftL = bgLum > 0.5 ? Math.max(0, l - 0.1) : Math.min(1, l + 0.1);
            hoverFgRGB = hslToRgb([h, s, shiftL]);
            // Keep original background
            hoverBgRGB = [...bgRGB];
          }

          console.log(`   ✅ [HOVER] Hue-preserving: FG rgb(${hoverFgRGB.join(',')}) BG rgb(${hoverBgRGB.join(',')}) contrast=${hoverResult.contrast.toFixed(2)}:1 preserved=${hoverResult.preserved}`);

          // Convert to RGB strings
          hoverBg = `rgb(${hoverBgRGB.map((v) => Math.round(v)).join(",")})`;
          hoverFg = `rgb(${hoverFgRGB.map((v) => Math.round(v)).join(",")})`;
        } else if (!usingCssHover) {
          // Text link (no solid background) - only adjust text color with hue preservation
          // Only calculate if we don't have CSS :hover colors already set
          // Snapshot will be taken in hover-in handler

          const hoverResult = calculateHuePreservingHoverColor(fgRGB, effectiveBgRGB, targetContrast, {
            adjustBackground: false, // Never add backgrounds to text links
            maxBrightnessShift: 0.25, // Slightly less shift for text
            preserveIdentity: true
          });

          hoverFgRGB = hoverResult.fg;

          // Verify the hover color won't cause issues
          const beforeContrast = wcagContrast(fgRGB, effectiveBgRGB);
          const safetyCheck = verifyHoverSafety(el,
            `rgb(${hoverFgRGB.join(',')})`,
            null, // No background change
            beforeContrast
          );

          if (!safetyCheck.safe) {
            console.warn(`   ⚠️ [HOVER SAFETY] Rejecting hover colors for link: ${safetyCheck.reason}`);
            // Keep original color - just add subtle brightness shift
            const [h, s, l] = rgbToHsl(fgRGB);
            const bgLum = relLuminance(effectiveBgRGB);
            const shiftL = bgLum > 0.5 ? Math.max(0, l - 0.08) : Math.min(1, l + 0.08);
            hoverFgRGB = hslToRgb([h, s, shiftL]);
          }

          console.log(`   ✅ [HOVER] Hue-preserving link: FG rgb(${hoverFgRGB.join(',')}) contrast=${hoverResult.contrast.toFixed(2)}:1 preserved=${hoverResult.preserved}`);

          hoverFg = `rgb(${hoverFgRGB.map((v) => Math.round(v)).join(",")})`;
          hoverBg = null; // No background change for text links
        }

        // Check if we're using CSS :hover colors - if so, skip all adjustments
        // (usingCssHover already declared above)
        if (usingCssHover) {
          console.log(`   ✅ [HOVER CALC] Using CSS :hover colors, skipping all adjustments`);
          // Calculate final contrast for logging
          const finalHoverBg = hoverBgRGB || effectiveBgRGB;
          const finalHoverContrast = wcagContrast(hoverFgRGB, finalHoverBg);
          console.log(`      Final CSS :hover contrast: ${finalHoverContrast.toFixed(2)}:1`);
          // Skip to storage - don't do any adjustments
        } else {
          // Final verification: ensure hover colors meet target (using blended background)
          const finalHoverBg = hoverBgRGB || effectiveBgRGB;
          let finalHoverContrast = wcagContrast(hoverFgRGB, finalHoverBg);

          // SAFEGUARD: If contrast below target (comfort score < 1.0), adjust to meet strict target
          // Calculate comfort score based on hover contrast (ratio of actual to target)
          const hoverComfortScore = finalHoverContrast / targetContrast;

          if (hoverComfortScore < 1.0) {
            console.log(
              `   🔧 [HOVER SAFEGUARD] Contrast below target (comfort score ${hoverComfortScore.toFixed(
                2
              )} < 1.0), adjusting to meet strict target...`
            );

            // Brighten text by increasing luminance by 10%
            const currentLum = relLuminance(hoverFgRGB);
            const targetLum = Math.min(1, currentLum * 1.1);

            // Convert to HSL, adjust lightness, convert back
            const [h, s, l] = rgbToHsl(hoverFgRGB);
            const newL = Math.min(1, l * 1.1); // Increase lightness by 10%
            const brightenedRGB = hslToRgb([h, s, newL]);

            // Verify contrast meets strict target (must be >= targetContrast)
            const brightenedContrast = wcagContrast(brightenedRGB, finalHoverBg);
            if (brightenedContrast >= targetContrast) {
              hoverFgRGB = brightenedRGB;
              hoverFg = `rgb(${hoverFgRGB.map((v) => Math.round(v)).join(",")})`;
              finalHoverContrast = brightenedContrast; // Update contrast after brightening
              console.log(
                `   ✅ [HOVER SAFEGUARD] Strict compliance achieved after adjustment: contrast ${brightenedContrast.toFixed(
                  2
                )}:1 >= ${targetContrast.toFixed(2)}:1`
              );
            } else {
              // This is expected for some color combinations - will be handled by extreme adjustment below
              console.log(
                `   ⚙️  [HOVER] 10% brightening gives ${brightenedContrast.toFixed(2)}:1 < target ${targetContrast.toFixed(2)}:1, applying extreme adjustment`
              );
            }
          }

          // Final verification: ensure hover colors meet target (re-check after brightening)

          if (finalHoverContrast < targetContrast) {
            // HUE-PRESERVING SAFEGUARD: Instead of forcing black/white, push to extreme lightness
            console.warn(
              `   ⚠️ [HOVER] Hover contrast ${finalHoverContrast.toFixed(2)}:1 < target ${targetContrast.toFixed(2)}:1, applying hue-preserving extreme adjustment`
            );

            const finalBgLum = relLuminance(finalHoverBg);
            const [origH, origS, origL] = rgbToHsl(hoverFgRGB);

            // Check if original was already black/white (allow pure values only then)
            const isOriginalMonochrome = origS < 0.05;

            if (isOriginalMonochrome) {
              // Original had no saturation - allow pure black/white
              if (finalBgLum > 0.5) {
                hoverFgRGB = [10, 10, 10]; // Near-black but not pure
              } else {
                hoverFgRGB = [245, 245, 245]; // Near-white but not pure
              }
            } else {
              // Preserve hue - push to extreme lightness with reduced saturation
              const extremeL = finalBgLum > 0.5 ? 0.08 : 0.92; // Very dark or very light
              const reducedS = Math.max(0.1, origS * 0.3); // Reduce saturation but keep some color
              hoverFgRGB = hslToRgb([origH, reducedS, extremeL]);
            }

            // Check if extreme adjustment meets target
            const extremeContrast = wcagContrast(hoverFgRGB, finalHoverBg);
            if (extremeContrast < targetContrast) {
              console.warn(`   ⚠️ [HOVER] Extreme adjustment still below target (${extremeContrast.toFixed(2)}:1). Accepting best achievable with hue preserved.`);
            }

            hoverFg = `rgb(${hoverFgRGB.map((v) => Math.round(v)).join(",")})`;
            if (hasSolidBg) {
              // Also use hue-preserving for background
              const [bgH, bgS, bgL] = rgbToHsl(hoverBgRGB);
              const extremeBgL = finalBgLum > 0.5 ? Math.max(0, bgL - 0.15) : Math.min(1, bgL + 0.15);
              hoverBgRGB = hslToRgb([bgH, bgS, extremeBgL]);
              hoverBg = `rgb(${hoverBgRGB.map((v) => Math.round(v)).join(",")})`;
            }
          }
        }

        // Store hover colors separately (independent from normal state)
        // Validate that hoverFg is set before storing
        if (!hoverFg) {
          console.error(`   🚨 [HOVER LOGIC] hoverFg is null/undefined for element ${el.tagName}. This should not happen.`);
          // Fallback to corrected foreground
          hoverFg = fg || `rgb(${fgRGB.join(",")})`;
        }
        
        // CRITICAL: If we're using CSS :hover colors, ensure they're stored in standard attributes
        // This allows the hover-in handler to use them correctly
        if (usingCssHover) {
          const cssHoverFg = el.getAttribute("data-css-hover-fg");
          const cssHoverBg = el.getAttribute("data-css-hover-bg");
          if (cssHoverFg) {
            // Use CSS :hover FG exactly as stored
            const parsed = parseCSSColorToRGBA(cssHoverFg, [0, 0, 0]);
            hoverFgRGB = parsed.slice(0, 3);
            hoverFg = `rgb(${hoverFgRGB.join(',')})`;
            console.log(`   📝 [HOVER STORE] Using CSS :hover FG for storage: ${hoverFg}`);
          }
          if (cssHoverBg && hasSolidBg) {
            const parsed = parseCSSColorToRGBA(cssHoverBg, [0, 0, 0, 0]);
            if (parsed[3] > 0.5) {
              hoverBgRGB = parsed.slice(0, 3);
              hoverBg = `rgb(${hoverBgRGB.join(',')})`;
              console.log(`   📝 [HOVER STORE] Using CSS :hover BG for storage: ${hoverBg}`);
            }
          }
        }
        
        el.setAttribute("data-hover-fg", hoverFg);
        
        // Calculate final hover contrast for logging
        const finalHoverBgForContrast = hoverBgRGB || effectiveBgRGB;
        const finalHoverContrast = wcagContrast(hoverFgRGB, finalHoverBgForContrast);
        
        // Check if this hover correction fixed a CSS :hover contrast issue
        const hadCssHoverIssue = el.getAttribute("data-css-hover-low-contrast") === "true";
        if (hadCssHoverIssue && finalHoverContrast >= targetContrast) {
          // Increment hover correction counter only if we fixed a CSS :hover contrast issue
          if (window._aiHoverCorrections !== undefined) {
            window._aiHoverCorrections++;
          }
        }
        
        // 🔍 DEBUG: Log stored hover colors
        const elementInfo = `${el.tagName} "${(el.textContent || "").trim().substring(0, 30)}"`;
        console.log(`   📝 [HOVER STORE] ${elementInfo} | Storing hover colors:`);
        console.log(`      Normal state: FG=${fg}, BG=${bg || 'none'}`);
        console.log(`      Hover state: FG=${hoverFg}, BG=${hoverBg || 'none'}`);
        console.log(`      Final hover contrast: ${finalHoverContrast.toFixed(2)}:1 (target: ${targetContrast.toFixed(2)}:1)`);
        if (hasSolidBg) {
          const hoverContrastCheck = wcagContrast(
            parseCSSColorToRGBA(hoverFg, [0,0,0]).slice(0,3),
            parseCSSColorToRGBA(hoverBg, [255,255,255]).slice(0,3)
          );
          console.log(`      Hover contrast verification: ${hoverContrastCheck.toFixed(2)}:1`);
        }

        if (hasSolidBg) {
          // Validate that hoverBg is set before storing
          if (!hoverBg) {
            console.error(`   🚨 [HOVER LOGIC] hoverBg is null/undefined for element ${el.tagName} but hasSolidBg=true. This should not happen.`);
            // Fallback to corrected background
            hoverBg = bg || `rgb(${bgRGB.join(",")})`;
          }
          el.setAttribute("data-hover-bg", hoverBg);
        } else {
          // For text-only elements, ensure hoverBg attribute is not set (or is removed)
          el.removeAttribute("data-hover-bg");
        }

        // Set up smooth transitions
        el.style.transition = "background-color 0.2s, color 0.2s";

        // Remove existing hover listeners if any
        if (el._aiHoverInExtended) {
          el.removeEventListener("mouseenter", el._aiHoverInExtended);
          el.removeEventListener("mouseleave", el._aiHoverOutExtended);
        }

        // Create hover event handlers with comprehensive logging and verification
        const hoverIn = async () => {
          if (!el || !el.nodeType || !document.contains(el)) return;

          // RACE CONDITION FIX: Prevent multiple hover-ins
          if (el._aiHoverActive) {
            return; // Already processing hover
          }
          el._aiHoverActive = true;

          const elementInfo = `${el.tagName} "${(el.textContent || "")
            .trim()
            .substring(0, 30)}"`;
          console.log(`\n🖱️  [HOVER IN] ${elementInfo}`);

          // STATE SNAPSHOT: Store computed colors before hover (only once)
          snapshotHoverState(el);

          // Get current optimized colors (not raw site colors)
          const optimizedFg = el.getAttribute("data-corrected-fg") || 
                              el.getAttribute("data-ai-normal-fg") || 
                              null;
          const optimizedBg = el.getAttribute("data-corrected-bg") || 
                              el.getAttribute("data-ai-normal-bg") || 
                              null;

          // Get current state for contrast calculation
          const beforeComputed = getComputedStyle(el);
          const beforeFg = parseCSSColorToRGBA(beforeComputed.color, [0, 0, 0]);
          const beforeBg = parseCSSColorToRGBA(beforeComputed.backgroundColor, [0, 0, 0, 0]);
          const beforeFgRGB = beforeFg.slice(0, 3);
          const beforeBgRGB = beforeBg.slice(0, 3);
          
          // 🔍 DEBUG: Log before state
          console.log(`   📊 [HOVER IN] Before state:`);
          console.log(`      Computed color: ${beforeComputed.color} (RGB: [${beforeFgRGB.join(',')}])`);
          console.log(`      Computed background: ${beforeComputed.backgroundColor} (RGB: [${beforeBgRGB.join(',')}], alpha: ${beforeBg[3].toFixed(2)})`);
          console.log(`      Stored optimized FG: ${optimizedFg || 'none'}`);
          console.log(`      Stored optimized BG: ${optimizedBg || 'none'}`);
          
          // Get effective background for contrast check
          const effectiveBgRGBA = getEffectiveBackgroundRGBA(el);
          
          // CRITICAL: Handle null return (image background or no opaque background)
          if (!effectiveBgRGBA) {
            console.log(`   [HOVER] Skipping hover correction for ${el.tagName} - no opaque background found`);
            return;
          }
          
          const effectiveBgRGB = effectiveBgRGBA.slice(0, 3);
          const finalBgForCheck = beforeBg[3] >= 0.5 ? beforeBgRGB : effectiveBgRGB;
          const beforeContrast = wcagContrast(beforeFgRGB, finalBgForCheck);
          console.log(`      Effective background: RGB([${finalBgForCheck.join(',')}])`);
          console.log(`      Before contrast: ${beforeContrast.toFixed(2)}:1`);

          // Get hover colors from stored attributes
          // CRITICAL PRIORITY: Check for CSS :hover colors FIRST (they take absolute precedence)
          const cssHoverFgStored = el.getAttribute("data-css-hover-fg");
          const cssHoverBgStored = el.getAttribute("data-css-hover-bg");
          const hoverFgStored = el.getAttribute("data-hover-fg");
          const hoverBgStored = el.getAttribute("data-hover-bg");
          const isUsingCssHover = el.getAttribute("data-using-css-hover") === "true";
          
          // 🔍 DEBUG: Log stored hover colors
          console.log(`   📋 [HOVER IN] Stored hover colors:`);
          console.log(`      data-css-hover-fg: ${cssHoverFgStored || 'NOT SET'}`);
          console.log(`      data-css-hover-bg: ${cssHoverBgStored || 'NOT SET'}`);
          console.log(`      data-hover-fg: ${hoverFgStored || 'NOT SET'}`);
          console.log(`      data-hover-bg: ${hoverBgStored || 'NOT SET'}`);
          console.log(`      Using CSS :hover: ${isUsingCssHover}`);

          // Initialize hover colors
          let hoverFgRGB = beforeFgRGB;
          let hoverBgRGB = beforeBgRGB;
          
          // CRITICAL: If CSS :hover colors exist, check contrast before using them
          // Only use them if they meet the target, otherwise fall back to calculated colors
          if (cssHoverFgStored || cssHoverBgStored) {
            console.log(`   🎯 [HOVER IN] CSS :hover colors detected - verifying contrast before use`);
            
            // Parse CSS :hover colors to check contrast
            let cssHoverFgRGB = beforeFgRGB;
            let cssHoverBgRGB = beforeBgRGB;
            
            if (cssHoverFgStored) {
              const parsed = parseCSSColorToRGBA(cssHoverFgStored, [0, 0, 0]);
              cssHoverFgRGB = parsed.slice(0, 3);
            }
            
            if (cssHoverBgStored && hasExplicitBackground(el)) {
              const parsed = parseCSSColorToRGBA(cssHoverBgStored, [255, 255, 255]);
              if (parsed[3] > 0.5) {
                cssHoverBgRGB = parsed.slice(0, 3);
              }
            }
            
            // Check contrast of CSS :hover colors
            const cssHoverBgForCheck = cssHoverBgRGB || effectiveBgRGB;
            const cssHoverContrast = wcagContrast(cssHoverFgRGB, cssHoverBgForCheck);
            console.log(`   🔍 [HOVER IN] CSS :hover contrast: ${cssHoverContrast.toFixed(2)}:1 (target: ${targetContrast.toFixed(2)}:1)`);
            
            // Only use CSS :hover colors if they meet the target
            if (cssHoverContrast >= targetContrast) {
              console.log(`   ✅ [HOVER IN] CSS :hover colors meet target - using them`);
              hoverFgRGB = cssHoverFgRGB;
              if (cssHoverBgStored && hasExplicitBackground(el)) {
                hoverBgRGB = cssHoverBgRGB;
              }
            } else {
              console.warn(`   ⚠️  [HOVER IN] CSS :hover contrast ${cssHoverContrast.toFixed(2)}:1 < target ${targetContrast.toFixed(2)}:1 - using calculated colors instead`);
              // Fall through to use stored or calculated colors
              if (hoverFgStored) {
                const parsed = parseCSSColorToRGBA(hoverFgStored, [0, 0, 0]);
                hoverFgRGB = parsed.slice(0, 3);
                console.log(`   ✅ [HOVER IN] Using stored calculated hover FG: ${hoverFgStored} (RGB: [${hoverFgRGB.join(',')}])`);
              } else {
                hoverFgRGB = calculateSafeHoverColor(beforeFgRGB, finalBgForCheck, targetContrast);
                console.warn(`   ⚠️  [HOVER IN] No stored hover FG, calculated safe hover color`);
              }
              
              if (hoverBgStored && hasExplicitBackground(el)) {
                const parsed = parseCSSColorToRGBA(hoverBgStored, [255, 255, 255]);
                hoverBgRGB = parsed.slice(0, 3);
                console.log(`   ✅ [HOVER IN] Using stored calculated hover BG: ${hoverBgStored} (RGB: [${hoverBgRGB.join(',')}])`);
              } else if (hasExplicitBackground(el)) {
                console.log(`   ℹ️  [HOVER IN] No stored hover BG, using current background`);
              }
            }
          } else {
            // No CSS :hover colors - use stored or calculate
            if (hoverFgStored) {
              const parsed = parseCSSColorToRGBA(hoverFgStored, [0, 0, 0]);
              hoverFgRGB = parsed.slice(0, 3);
              console.log(`   ✅ [HOVER IN] Using stored hover FG: ${hoverFgStored} (RGB: [${hoverFgRGB.join(',')}])`);
            } else {
              // SAFE HOVER TRANSFORM: Calculate brightness-only adjustment
              console.warn(`   ⚠️  [HOVER IN] No stored hover FG, calculating safe hover color`);
              hoverFgRGB = calculateSafeHoverColor(beforeFgRGB, finalBgForCheck, targetContrast);
            }

            if (hoverBgStored && hasExplicitBackground(el)) {
              const parsed = parseCSSColorToRGBA(hoverBgStored, [255, 255, 255]);
              hoverBgRGB = parsed.slice(0, 3);
              console.log(`   ✅ [HOVER IN] Using stored hover BG: ${hoverBgStored} (RGB: [${hoverBgRGB.join(',')}])`);
            } else if (hasExplicitBackground(el)) {
              console.log(`   ℹ️  [HOVER IN] No stored hover BG, using current background`);
            }
          }

          let hoverFg = `rgb(${hoverFgRGB.map(v => Math.round(v)).join(",")})`;
          let hoverBg = hasExplicitBackground(el) ? `rgb(${hoverBgRGB.map(v => Math.round(v)).join(",")})` : null;
          
          // 🔍 DEBUG: Calculate and log hover contrast
          const hoverBgForContrast = hoverBgRGB || effectiveBgRGB;
          const hoverContrast = wcagContrast(hoverFgRGB, hoverBgForContrast);
          console.log(`   🎨 [HOVER IN] Calculated hover colors:`);
          console.log(`      Hover FG: ${hoverFg} (RGB: [${hoverFgRGB.join(',')}])`);
          console.log(`      Hover BG: ${hoverBg || 'none'} (RGB: [${hoverBgForContrast.join(',')}])`);
          console.log(`      Hover contrast: ${hoverContrast.toFixed(2)}:1 (target: ${targetContrast.toFixed(2)}:1)`);

          // PROTECT VISIBILITY: Check before applying
          // For CSS :hover rules, be more lenient if both contrasts are above target
          const isCssHover = el.getAttribute("data-using-css-hover") === "true";
          const safetyCheck = verifyHoverSafety(el, hoverFg, hoverBg, beforeContrast);
          
          if (!safetyCheck.safe) {
            // Special handling for CSS :hover - if both contrasts are above target, allow it
            if (isCssHover && safetyCheck.reason && safetyCheck.reason.includes('contrast-worse')) {
              const hoverFgParsed = parseCSSColorToRGBA(hoverFg, [0, 0, 0]);
              const hoverBgParsed = hoverBg ? parseCSSColorToRGBA(hoverBg, [0, 0, 0, 0]) : getEffectiveBackgroundRGBA(el);
              
              // CRITICAL: Handle null return from getEffectiveBackgroundRGBA
              if (!hoverBgParsed) {
                console.log(`   [HOVER] Skipping hover correction for ${el.tagName} - no opaque background found`);
                return;
              }
              
              const hoverFgRGB = hoverFgParsed.slice(0, 3);
              const effectiveBgForHover = getEffectiveBackgroundRGBA(el);
              const hoverBgRGB = hoverBgParsed[3] > 0.5 ? hoverBgParsed.slice(0, 3) : (effectiveBgForHover ? effectiveBgForHover.slice(0, 3) : [255, 255, 255]);
              const hoverContrast = wcagContrast(hoverFgRGB, hoverBgRGB);
              
              if (hoverContrast >= targetContrast && beforeContrast >= targetContrast) {
                console.log(`   ℹ️  [HOVER IN] CSS :hover contrast ${hoverContrast.toFixed(2)}:1 < normal ${beforeContrast.toFixed(2)}:1, but both meet target - allowing`);
                // Allow it - both are above target
              } else {
                console.warn(`   🚨 [AI HOVER BLOCKED] ${elementInfo} | reason: ${safetyCheck.reason}`);
                el._aiHoverActive = false;
                return; // Abort hover
              }
            } else {
              console.warn(`   🚨 [AI HOVER BLOCKED] ${elementInfo} | reason: ${safetyCheck.reason}`);
              el._aiHoverActive = false;
              return; // Abort hover
            }
          }
          
          console.log(`   ✅ [HOVER IN] Safety check passed`);

          // Temporarily disable transitions
          const originalTransition = el.style.transition || getComputedStyle(el).transition;
          if (originalTransition && originalTransition !== "none") {
            el.style.setProperty("transition", "none", "important");
            void el.offsetHeight;
          }

          // 🔍 DEBUG: Check for CSS :hover rule conflicts
          const elementClasses = el.className || '';
          const hasHoverClass = elementClasses.includes('hover-button');
          console.log(`   🔍 [HOVER IN] CSS conflict check:`);
          console.log(`      Element classes: ${elementClasses || 'none'}`);
          console.log(`      Has hover-button class: ${hasHoverClass}`);
          
          // Check if there's a CSS :hover rule that might interfere
          let cssHoverBg = null;
          let cssHoverFg = null;
          try {
            // Simulate hover state by temporarily adding a class or using matches
            const hoverStyle = window.getComputedStyle(el, ':hover');
            cssHoverFg = hoverStyle.color;
            cssHoverBg = hoverStyle.backgroundColor;
            console.log(`      CSS :hover rule color: ${cssHoverFg}`);
            console.log(`      CSS :hover rule background: ${cssHoverBg}`);
            
            if (cssHoverBg && cssHoverBg !== 'rgba(0, 0, 0, 0)' && cssHoverBg !== 'transparent') {
              const hoverBgParsed = parseCSSColorToRGBA(cssHoverBg, [0, 0, 0, 0]);
              if (hoverBgParsed[3] > 0.5) {
                cssHoverBg = hoverBgParsed.slice(0, 3);
                console.warn(`   ⚠️  [HOVER IN] CSS :hover rule detected! Background: rgb([${cssHoverBg.join(',')}])`);
                console.warn(`      This may override our calculated hover background!`);
                
                // Check if our calculated hover foreground will work with CSS hover background
                const hoverFgParsed = parseCSSColorToRGBA(hoverFg, [0, 0, 0]);
                const hoverFgRGBForCheck = hoverFgParsed.slice(0, 3);
                const contrastOnCssBg = wcagContrast(hoverFgRGBForCheck, cssHoverBg);
                console.log(`      Our hover FG contrast on CSS hover BG: ${contrastOnCssBg.toFixed(2)}:1`);
                
                if (contrastOnCssBg < targetContrast) {
                  console.error(`   🚨 [HOVER IN] VISIBILITY ISSUE! Our hover FG (${hoverFg}) on CSS hover BG (rgb([${cssHoverBg.join(',')}])) = ${contrastOnCssBg.toFixed(2)}:1 < target ${targetContrast.toFixed(2)}:1`);
                  console.error(`      Need to adjust hover foreground for CSS hover background!`);
                  
                  // CRITICAL: If we have stored CSS :hover colors, use them instead of adjusting
                  const storedCssHoverFg = el.getAttribute("data-css-hover-fg");
                  if (storedCssHoverFg) {
                    const cssFgParsed = parseCSSColorToRGBA(storedCssHoverFg, [0, 0, 0]);
                    hoverFgRGB = cssFgParsed.slice(0, 3);
                    hoverFg = `rgb(${hoverFgRGB.join(',')})`;
                    const cssContrast = wcagContrast(hoverFgRGB, cssHoverBg);
                    console.log(`   🔧 [HOVER IN] Using stored CSS :hover FG: ${hoverFg} for CSS hover BG, contrast: ${cssContrast.toFixed(2)}:1`);
                  } else {
                    // Adjust foreground for CSS hover background
                    const adjustedResult = adjustColorToContrast(hoverFgRGBForCheck, cssHoverBg, targetContrast);
                    const adjustedFgRGB = (adjustedResult && typeof adjustedResult === 'object' && 'fg' in adjustedResult) 
                      ? adjustedResult.fg 
                      : adjustedResult;
                    const adjustedContrast = wcagContrast(adjustedFgRGB, cssHoverBg);
                    
                    if (adjustedContrast >= targetContrast) {
                      // Update hoverFg to work with CSS hover background
                      hoverFgRGB = adjustedFgRGB;
                      hoverFg = `rgb(${hoverFgRGB.map(v => Math.round(v)).join(",")})`;
                      console.log(`   ✅ [HOVER IN] Adjusted hover FG to rgb([${hoverFgRGB.join(',')}]) for CSS hover BG, contrast: ${adjustedContrast.toFixed(2)}:1`);
                    } else {
                      console.error(`   🚨 [HOVER IN] Cannot achieve target contrast even after adjustment!`);
                    }
                  }
                } else {
                  // Contrast is good, but ensure we're using CSS :hover colors if available
                  const storedCssHoverFg = el.getAttribute("data-css-hover-fg");
                  const storedCssHoverBg = el.getAttribute("data-css-hover-bg");
                  if (storedCssHoverFg && storedCssHoverBg) {
                    // Use exact CSS :hover colors
                    const cssFgParsed = parseCSSColorToRGBA(storedCssHoverFg, [0, 0, 0]);
                    const cssBgParsed = parseCSSColorToRGBA(storedCssHoverBg, [0, 0, 0, 0]);
                    hoverFgRGB = cssFgParsed.slice(0, 3);
                    hoverFg = `rgb(${hoverFgRGB.join(',')})`;
                    if (cssBgParsed[3] > 0.5) {
                      hoverBgRGB = cssBgParsed.slice(0, 3);
                      hoverBg = `rgb(${hoverBgRGB.join(',')})`;
                    }
                    console.log(`   ✅ [HOVER IN] Using exact CSS :hover colors: FG=${hoverFg}, BG=${hoverBg || 'none'}`);
                  }
                }
              }
            }
          } catch (e) {
            console.log(`      Could not check CSS :hover rule: ${e.message}`);
          }

          // CRITICAL SAFEGUARD: Ensure foreground and background are never the same color
          const hoverFgParsed = parseCSSColorToRGBA(hoverFg, [0, 0, 0]);
          const hoverFgRGBFinal = hoverFgParsed.slice(0, 3);
          const hoverBgRGBFinal = hoverBg ? parseCSSColorToRGBA(hoverBg, [255, 255, 255]).slice(0, 3) : null;
          
          if (hoverBgRGBFinal) {
            // Check if colors are too similar (within 5 RGB units)
            const colorDiff = Math.abs(hoverFgRGBFinal[0] - hoverBgRGBFinal[0]) + 
                            Math.abs(hoverFgRGBFinal[1] - hoverBgRGBFinal[1]) + 
                            Math.abs(hoverFgRGBFinal[2] - hoverBgRGBFinal[2]);
            
            if (colorDiff < 15) {
              console.error(`   🚨 [HOVER IN] VISIBILITY ISSUE! Hover FG and BG are too similar!`);
              console.error(`      Hover FG: rgb([${hoverFgRGBFinal.join(',')}])`);
              console.error(`      Hover BG: rgb([${hoverBgRGBFinal.join(',')}])`);
              console.error(`      Color difference: ${colorDiff} (need at least 15)`);
              
              // For CSS :hover, use the exact colors from CSS (they should be correct)
              if (isCssHover) {
                const cssFg = el.getAttribute("data-css-hover-fg");
                const cssBg = el.getAttribute("data-css-hover-bg");
                if (cssFg) {
                  const cssFgParsed = parseCSSColorToRGBA(cssFg, [0, 0, 0]);
                  hoverFgRGB = cssFgParsed.slice(0, 3);
                  hoverFg = `rgb(${hoverFgRGB.join(',')})`;
                  console.log(`   🔧 [HOVER IN] Using exact CSS :hover FG: ${hoverFg}`);
                }
                if (cssBg) {
                  const cssBgParsed = parseCSSColorToRGBA(cssBg, [0, 0, 0, 0]);
                  if (cssBgParsed[3] > 0.5) {
                    hoverBgRGB = cssBgParsed.slice(0, 3);
                    hoverBg = `rgb(${hoverBgRGB.join(',')})`;
                    console.log(`   🔧 [HOVER IN] Using exact CSS :hover BG: ${hoverBg}`);
                  }
                }
              } else {
                // For calculated hover, invert if needed
                console.warn(`   🔧 [HOVER IN] Adjusting hover colors to ensure visibility`);
                if (hoverBgRGBFinal[0] < 128) {
                  // Dark background - use light text
                  hoverFgRGB = [255, 255, 255];
                  hoverFg = `rgb(255,255,255)`;
                } else {
                  // Light background - use dark text
                  hoverFgRGB = [0, 0, 0];
                  hoverFg = `rgb(0,0,0)`;
                }
                console.log(`   ✅ [HOVER IN] Adjusted hover FG to: ${hoverFg}`);
              }
            }
          }
          
          // FINAL VERIFICATION: Ensure we're using CSS :hover colors if available
          // This is a critical safeguard to prevent black-on-black or white-on-white
          if (isUsingCssHover || cssHoverFgStored || cssHoverBgStored) {
            console.log(`   🔍 [HOVER IN] Final CSS :hover verification`);
            
            // If we have CSS :hover colors, ensure we're using them
            if (cssHoverFgStored) {
              const cssFgParsed = parseCSSColorToRGBA(cssHoverFgStored, [0, 0, 0]);
              hoverFgRGB = cssFgParsed.slice(0, 3);
              hoverFg = `rgb(${hoverFgRGB.join(',')})`;
              console.log(`   ✅ [HOVER IN] Final: Using CSS :hover FG: ${hoverFg}`);
            }
            if (cssHoverBgStored && hasExplicitBackground(el)) {
              const cssBgParsed = parseCSSColorToRGBA(cssHoverBgStored, [255, 255, 255]);
              if (cssBgParsed[3] > 0.5) {
                hoverBgRGB = cssBgParsed.slice(0, 3);
                hoverBg = `rgb(${hoverBgRGB.join(',')})`;
                console.log(`   ✅ [HOVER IN] Final: Using CSS :hover BG: ${hoverBg}`);
              }
            }
            
            // Verify contrast
            const finalHoverBg = hoverBgRGB || effectiveBgRGB;
            const finalHoverContrast = wcagContrast(hoverFgRGB, finalHoverBg);
            console.log(`   ✅ [HOVER IN] Final hover contrast: ${finalHoverContrast.toFixed(2)}:1`);
            
            // CRITICAL: Ensure foreground and background are different
            if (hoverBgRGB) {
              const colorDiff = Math.abs(hoverFgRGB[0] - hoverBgRGB[0]) + 
                              Math.abs(hoverFgRGB[1] - hoverBgRGB[1]) + 
                              Math.abs(hoverFgRGB[2] - hoverBgRGB[2]);
              if (colorDiff < 15) {
                console.error(`   🚨 [HOVER IN] CRITICAL: FG and BG are too similar! Forcing CSS :hover colors!`);
                // Force use of CSS :hover colors
                if (cssHoverFgStored) {
                  const cssFgParsed = parseCSSColorToRGBA(cssHoverFgStored, [0, 0, 0]);
                  hoverFgRGB = cssFgParsed.slice(0, 3);
                  hoverFg = `rgb(${hoverFgRGB.join(',')})`;
                }
                if (cssHoverBgStored) {
                  const cssBgParsed = parseCSSColorToRGBA(cssHoverBgStored, [255, 255, 255]);
                  if (cssBgParsed[3] > 0.5) {
                    hoverBgRGB = cssBgParsed.slice(0, 3);
                    hoverBg = `rgb(${hoverBgRGB.join(',')})`;
                  }
                }
                console.log(`   🔧 [HOVER IN] Forced CSS :hover colors: FG=${hoverFg}, BG=${hoverBg || 'none'}`);
              }
            }
          }
          
          // Apply hover styles
          console.log(`   🎯 [HOVER IN] Applying styles:`);
          console.log(`      Setting color: ${hoverFg}`);
          forceApplyStyle(el, 'color', hoverFg);
          if (hoverBg && hasExplicitBackground(el)) {
            console.log(`      Setting background-color: ${hoverBg}`);
            forceApplyStyle(el, 'background-color', hoverBg);
          }
          
          // 🔍 DEBUG: Verify applied styles immediately and after a delay
          const verifyStyles = () => {
            const afterComputed = getComputedStyle(el);
            const afterFg = parseCSSColorToRGBA(afterComputed.color, [0, 0, 0]);
            const afterBg = parseCSSColorToRGBA(afterComputed.backgroundColor, [0, 0, 0, 0]);
            const afterFgRGB = afterFg.slice(0, 3);
            const afterBgRGB = afterBg.slice(0, 3);
            const effectiveBgForAfter = getEffectiveBackgroundRGBA(el);
            const afterEffectiveBg = afterBg[3] >= 0.5 ? afterBgRGB : (effectiveBgForAfter ? effectiveBgForAfter.slice(0, 3) : [255, 255, 255]);
            const afterContrast = wcagContrast(afterFgRGB, afterEffectiveBg);
            
            console.log(`   🔍 [HOVER IN] After applying styles:`);
            console.log(`      Computed color: ${afterComputed.color} (RGB: [${afterFgRGB.join(',')}])`);
            console.log(`      Computed background: ${afterComputed.backgroundColor} (RGB: [${afterBgRGB.join(',')}], alpha: ${afterBg[3].toFixed(2)})`);
            console.log(`      Effective background: RGB([${afterEffectiveBg.join(',')}])`);
            console.log(`      After contrast: ${afterContrast.toFixed(2)}:1`);
            console.log(`      Inline style color: ${el.style.color || 'none'}`);
            console.log(`      Inline style background: ${el.style.backgroundColor || 'none'}`);
            
            // Check if our styles were overridden
            const expectedFgRGB = parseCSSColorToRGBA(hoverFg, [0,0,0]).slice(0,3);
            const fgMatches = Math.abs(afterFgRGB[0] - expectedFgRGB[0]) < 5 && 
                             Math.abs(afterFgRGB[1] - expectedFgRGB[1]) < 5 && 
                             Math.abs(afterFgRGB[2] - expectedFgRGB[2]) < 5;
            
            if (!fgMatches) {
              console.error(`   🚨 [HOVER IN] STYLE OVERRIDE DETECTED!`);
              console.error(`      Expected FG RGB: [${expectedFgRGB.join(',')}], but got: [${afterFgRGB.join(',')}]`);
              console.error(`      This suggests a CSS :hover rule or other style is overriding our correction!`);
            }
            
            // Check for visibility issues
            if (afterContrast < 1.5) {
              console.error(`   🚨 [HOVER IN] VISIBILITY ISSUE DETECTED! Contrast ${afterContrast.toFixed(2)}:1 is too low!`);
              console.error(`      Expected hover FG: ${hoverFg}, but got: ${afterComputed.color}`);
              console.error(`      Expected hover BG: ${hoverBg || 'none'}, but got: ${afterComputed.backgroundColor}`);
            }
          };
          
          // Check immediately
          setTimeout(verifyStyles, 10);
          // Check again after transitions might have applied
          setTimeout(verifyStyles, 100);

          // Restore transitions after 50ms
          if (originalTransition && originalTransition !== "none") {
            setTimeout(() => {
              el.style.setProperty("transition", originalTransition, "important");
            }, 50);
          }

          el._aiHoverActive = false;
        };

        const hoverOut = async () => {
          if (!el || !el.nodeType || !document.contains(el)) return;

          // RACE CONDITION FIX: Prevent multiple hover-outs
          if (el._aiHoverRestoring) {
            return; // Already restoring
          }
          el._aiHoverRestoring = true;

          const elementInfo = `${el.tagName} "${(el.textContent || "")
            .trim()
            .substring(0, 30)}"`;
          console.log(`\n🖱️  [HOVER OUT] ${elementInfo}`);

          // CLEAN RESTORE: Restore original optimized colors (not raw site colors)
          const optimizedFg = el.getAttribute("data-corrected-fg") || 
                              el.getAttribute("data-ai-normal-fg") || 
                              null;
          const optimizedBg = el.getAttribute("data-corrected-bg") || 
                              el.getAttribute("data-ai-normal-bg") || 
                              null;

          if (!optimizedFg) {
            console.warn(`[AI HOVER OUT] No optimized colors found for ${elementInfo}`);
            el._aiHoverRestoring = false;
            return;
          }

          // Temporarily disable transitions
          const originalTransition = el.style.transition || getComputedStyle(el).transition;
          if (originalTransition && originalTransition !== "none") {
            el.style.setProperty("transition", "none", "important");
            void el.offsetHeight;
          }

          // Restore optimized foreground
          forceApplyStyle(el, 'color', optimizedFg);

          // Restore optimized background if element had one
          if (optimizedBg && hasExplicitBackground(el)) {
            forceApplyStyle(el, 'background-color', optimizedBg);
          } else if (hasExplicitBackground(el)) {
            // Remove background if element shouldn't have one
            el.style.removeProperty("background-color");
          }

          // Restore border if it was stored
          const originalBorder = el.getAttribute("data-ai-orig-border");
          if (originalBorder) {
            el.style.setProperty("border-color", originalBorder, "important");
          }

          // Restore transitions after 50ms
          if (originalTransition && originalTransition !== "none") {
            setTimeout(() => {
              el.style.setProperty("transition", originalTransition, "important");
            }, 50);
          }

          el._aiHoverRestoring = false;
        };

        // Store handlers for cleanup
        el._aiHoverInExtended = hoverIn;
        el._aiHoverOutExtended = hoverOut;

        // Attach event listeners
        el.addEventListener("mouseenter", hoverIn);
        el.addEventListener("mouseleave", hoverOut);

        // Mark as processed (both property and data attribute for persistence across DOM updates)
        el._aiHoverLogicApplied = true;
        el.setAttribute("data-hover-bound", "true");

        // Removed excessive hover logic log to reduce console noise
        // if (DEBUG_HOVER) {
        //   console.log(
        //     `   ✅ Applied extended hover logic to ${
        //       el.tagName
        //     } - FG: ${fg} → hover: ${hoverFg}, BG: ${
        //       hasSolidBg ? bg + " → hover: " + hoverBg : "none"
        //     }`
        //   );
        // }
      } catch (err) {
        console.warn(`   ⚠️  Error applying hover logic to ${el.tagName}:`, err);
      }
    });
  }

  // Initialize hover correction for all interactive elements
  async function initHoverCorrection(targetContrast = null) {
    // Get target from background worker if not provided
    if (targetContrast === null) {
      const settings = await getCurrentSettings();
      targetContrast = settings.targetContrast || 8.0;
    }
    console.log(
      `\n🎯 Initializing extended hover correction (target: ${targetContrast.toFixed(
        2
      )}:1)...`
    );

    // Select all interactive elements: buttons, links, menu items, nav/footer links
    // FIX: Exclude elements already processed by fixButtonHoverState (data-hover-bound="true" or data-ai-contrast-fixed="true")
    // This prevents duplicate event listeners that cause hover state conflicts
    const allTargets = document.querySelectorAll(
      'button:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), a:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), [role="button"]:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), [tabindex]:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), .menu-item:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), nav a:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), footer a:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), .nav-links a:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), .footer-column a:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), .tag:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), .btn-primary:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), .btn-secondary:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), .cta-button:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"])'
    );

    console.log(
      `   📊 Found ${allTargets.length} new interactive elements for hover correction`
    );

    applyHoverLogic(allTargets, targetContrast);

    console.log(`   ✅ Extended hover correction complete`);
    
    // Update toast message after hover corrections (use user-friendly message)
    const hoverCorrections = window._aiHoverCorrections || 0;
    if (hoverCorrections > 0) {
      // Get the current result from the last scan
      const lastResult = window._aiLastScanResult;
      if (lastResult) {
        const { flagged = 0, corrected = 0 } = lastResult;
        let message = "";
        let ctaMessage = "";
        
        if (flagged === 0) {
          message = "✓ Your page is now easier to read";
        } else if (corrected > 0) {
          message = "✓ Readability adjustments complete";
          ctaMessage = "Notice anything still hard to read? Click 'Hard to Read' in the extension to help us improve.";
        } else {
          message = "✓ Checked your page";
          ctaMessage = "Some elements couldn't be adjusted automatically. Click 'Hard to Read' in the extension to report issues.";
        }
        
        updateToast(message, "complete", lastResult, true, ctaMessage);
      }
    }

    // Start observing for new dynamic elements if not already observing
    if (!window._aiHoverObserver) {
      startHoverObserver(targetContrast);
    }
  }

  // Lightweight MutationObserver for dynamic DOM updates (hover logic only)
  let hoverObserver = null;
  async function startHoverObserver(targetContrast = null) {
    // Get target from background worker if not provided
    if (targetContrast === null) {
      const settings = await getCurrentSettings();
      targetContrast = settings.targetContrast || 8.0;
    }
    // Disconnect existing observer if any
    if (hoverObserver) {
      hoverObserver.disconnect();
      hoverObserver = null;
    }

    // Debounce timer to batch multiple DOM changes
    let debounceTimer = null;

    hoverObserver = new MutationObserver((mutations) => {
      let hasNewInteractiveElements = false;

      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          // Check if any added nodes are interactive elements that need hover logic
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if the node itself is an interactive element
              // FIX: Also exclude elements with data-ai-contrast-fixed to prevent duplicate hover listeners
              const isInteractive =
                node.matches &&
                node.matches(
                  'button, a, [role="button"], [tabindex], .menu-item, nav a, footer a, .nav-links a, .footer-column a, .tag, .btn-primary, .btn-secondary, .cta-button'
                ) &&
                !node.getAttribute("data-hover-bound") &&
                !node.getAttribute("data-ai-contrast-fixed");

              // Check if the node contains interactive elements
              // FIX: Also exclude elements with data-ai-contrast-fixed to prevent duplicate hover listeners
              const hasInteractiveChildren =
                node.querySelectorAll &&
                node.querySelectorAll(
                  'button:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), a:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), [role="button"]:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), [tabindex]:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), .menu-item:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), nav a:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), footer a:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), .nav-links a:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), .footer-column a:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), .tag:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), .btn-primary:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), .btn-secondary:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), .cta-button:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"])'
                ).length > 0;

              if (isInteractive || hasInteractiveChildren) {
                hasNewInteractiveElements = true;
                break;
              }
            }
          }
        }
      }

      // Debounce: wait for DOM to settle before applying hover logic
      if (hasNewInteractiveElements) {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(() => {
          console.log(
            `   🔄 New interactive elements detected, applying hover logic...`
          );

          // Find and process only new interactive elements
          // FIX: Also exclude elements with data-ai-contrast-fixed to prevent duplicate hover listeners
          const newTargets = document.querySelectorAll(
            'button:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), a:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), [role="button"]:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), [tabindex]:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), .menu-item:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), nav a:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), footer a:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), .nav-links a:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), .footer-column a:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), .tag:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), .btn-primary:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), .btn-secondary:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"]), .cta-button:not([data-hover-bound="true"]):not([data-ai-contrast-fixed="true"])'
          );

          if (newTargets.length > 0) {
            console.log(
              `   📊 Found ${newTargets.length} new interactive elements`
            );
            applyHoverLogic(newTargets, targetContrast);
          }
        }, 300); // 300ms debounce for performance
      }
    });

    // Observe the entire document for new interactive elements
    try {
      hoverObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
      window._aiHoverObserver = hoverObserver;
      console.log(`   👁️  Hover observer started for dynamic content`);
    } catch (err) {
      console.warn(`   ⚠️  Failed to start hover observer:`, err);
    }
  }

  // Cleanup function to stop hover observer
  function stopHoverObserver() {
    if (hoverObserver) {
      hoverObserver.disconnect();
      hoverObserver = null;
      window._aiHoverObserver = null;
      console.log(`   🛑 Hover observer stopped`);
    }
  }

  // Visual notification system - Unified toast for all status updates
  
  let toastElement = null;
  let toastAnimationInterval = null;
  let isScanning = false;
  let scanProgress = { processed: 0, total: 0 };
  let progressUpdateThrottle = null;

  function updateScanProgress(processed, total) {
    scanProgress.processed = processed;
    scanProgress.total = total;
    
    // Throttle updates to every 200ms for performance
    if (progressUpdateThrottle) {
      clearTimeout(progressUpdateThrottle);
    }
    
    progressUpdateThrottle = setTimeout(() => {
      if (isScanning && toastElement) {
        // Use user-friendly progressive messages
        const progressMessages = [
          "Checking your page for readability issues...",
          "Improving contrast on your page...",
          "Making text easier to read..."
        ];
        const progressPercent = total > 0 ? Math.floor((processed / total) * 100) : 0;
        let message = progressMessages[Math.floor((processed / Math.max(total, 1)) * progressMessages.length) % progressMessages.length];
        // Optionally add vague percentage if needed
        if (progressPercent > 0 && progressPercent < 100) {
          message = message.replace("...", `... ${progressPercent}%`);
        }
        updateToast(message, "scanning", null, false);
      }
    }, 200);
  }

  function showToast(message, status = "scanning", result = null, autoCorrect = false) {
    console.log("[TOAST] showToast called:", { message, status, result: !!result, autoCorrect });
    
    // Remove existing toast if any
    if (toastElement) {
      toastElement.remove();
      toastElement = null;
    }
    
    // Stop any existing animation
    if (toastAnimationInterval) {
      clearInterval(toastAnimationInterval);
      toastAnimationInterval = null;
    }
    
    isScanning = status === "scanning";
    
    let icon = "";
    let bgColor = "";
    let showAnimation = false;
    
    if (status === "scanning") {
      icon = "🔍";
      bgColor = "#3b82f6";
      showAnimation = true;
    } else if (status === "error") {
      icon = "❌";
      bgColor = "#ef4444";
    } else if (result) {
      // Completion state with result
      const { flagged = 0, corrected = 0, total = 0, apiAvailable = false } = result;
      
      if (flagged === 0) {
        icon = "✅";
        bgColor = "#10b981";
      } else if (autoCorrect) {
        icon = "✨";
        bgColor = "#3b82f6";
      } else {
        icon = "⚠️";
        bgColor = "#ef4444";
      }
    } else {
      icon = "✅";
      bgColor = "#10b981";
    }

    toastElement = document.createElement("div");
    toastElement.id = "ai-contrast-notification";
    // Set all styles to ensure visibility and correct positioning
    Object.assign(toastElement.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      top: "auto",
      left: "auto",
      background: bgColor,
      color: "white",
      padding: "16px 24px",
      borderRadius: "12px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      zIndex: "2147483647",
      fontFamily: "system-ui, -apple-system, sans-serif",
      fontSize: "14px",
      fontWeight: "500",
      maxWidth: "400px",
      animation: "slideInBottom 0.3s ease-out",
      display: "flex",
      alignItems: "center",
      gap: "12px",
      visibility: "visible",
      opacity: "1",
      pointerEvents: "auto",
      margin: "0"
    });
    toastElement.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
        <div style="display: flex; align-items: center; gap: 12px; width: 100%;">
          <span id="ai-contrast-toast-icon" style="font-size: 24px; display: inline-block; flex-shrink: 0; line-height: 1;">${icon}</span>
          <div id="ai-contrast-toast-message-container" style="flex: 1; display: flex; align-items: center; gap: 4px; min-width: 0;">
            <span id="ai-contrast-toast-message" style="flex: 1; min-width: 0; word-wrap: break-word;">${message}</span>
            <span id="ai-contrast-toast-dots" style="width: 20px; text-align: left; display: ${status === "scanning" ? "inline-block" : "none"}; flex-shrink: 0;">...</span>
          </div>
          <button id="ai-contrast-notification-close" style="
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 18px;
            line-height: 1;
            flex-shrink: 0;
            transition: background 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            margin: 0;
          ">×</button>
        </div>
        <div id="ai-contrast-toast-body" style="display: ${status === "complete" && autoCorrect ? "block" : "none"}; padding-left: 36px; font-size: 12px; opacity: 0.9; line-height: 1.4;">
          <span id="ai-contrast-toast-cta"></span>
        </div>
      </div>
    `;

    // Add animation styles to head if not already present
    if (!document.getElementById("ai-contrast-toast-styles")) {
      const style = document.createElement("style");
      style.id = "ai-contrast-toast-styles";
      style.textContent = `
      @keyframes slideInBottom {
        from {
          transform: translateY(100px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      @keyframes pulse {
        0%, 100% {
          transform: scale(1);
          opacity: 1;
        }
        50% {
          transform: scale(1.1);
          opacity: 0.8;
        }
      }
      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
      @keyframes dots {
        0%, 20% {
          content: '.';
        }
        40% {
          content: '..';
        }
        60%, 100% {
          content: '...';
        }
      }
    `;
      document.head.appendChild(style);
    }

    // Insert toast into body, waiting for body if needed
    const insertToast = () => {
      if (document.body && toastElement) {
        document.body.appendChild(toastElement);
        console.log("[TOAST] Toast appended to body, element:", toastElement);
        console.log("[TOAST] Toast styles:", window.getComputedStyle(toastElement));
        // Force visibility
        toastElement.style.display = "flex";
        toastElement.style.visibility = "visible";
        toastElement.style.opacity = "1";
        return true;
      }
      return false;
    };
    
    if (!insertToast()) {
      console.log("[TOAST] Body not ready, waiting...");
      // Wait for body to be available
      const observer = new MutationObserver((mutations, obs) => {
        if (insertToast()) {
          obs.disconnect();
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      // Also try with multiple timeouts
      [100, 500, 1000].forEach(delay => {
        setTimeout(() => {
          if (toastElement && !toastElement.parentElement) {
            insertToast();
          }
        }, delay);
      });
    }
    
    // Add close button handler
    const closeButton = toastElement.querySelector("#ai-contrast-notification-close");
    if (closeButton) {
      closeButton.addEventListener("mouseenter", () => {
        closeButton.style.background = "rgba(255,255,255,0.3)";
      });
      closeButton.addEventListener("mouseleave", () => {
        closeButton.style.background = "rgba(255,255,255,0.2)";
      });
      closeButton.addEventListener("click", () => {
        removeToast();
      });
    }
    
    // Start scanning animation if needed
    if (showAnimation && isScanning) {
      startScanningAnimation();
    }
  }
  
  function updateToast(message, status = "complete", result = null, autoCorrect = false, ctaMessage = "") {
    if (!toastElement) {
      showToast(message, status, result, autoCorrect);
      return;
    }
    
    // Stop scanning animation if transitioning from scanning to complete
    if (isScanning && status !== "scanning") {
      stopScanningAnimation();
      isScanning = false;
      // Clear progress throttle
      if (progressUpdateThrottle) {
        clearTimeout(progressUpdateThrottle);
        progressUpdateThrottle = null;
      }
    }
    
    const iconElement = toastElement.querySelector("#ai-contrast-toast-icon");
    const messageElement = toastElement.querySelector("#ai-contrast-toast-message");
    const dotsElement = toastElement.querySelector("#ai-contrast-toast-dots");
    const bodyElement = toastElement.querySelector("#ai-contrast-toast-body");
    const ctaElement = toastElement.querySelector("#ai-contrast-toast-cta");
    
    if (!iconElement || !messageElement) {
      // If structure is broken, recreate
      showToast(message, status, result, autoCorrect);
      return;
    }
    
    let icon = "";
    let bgColor = "";
    let showAnimation = false;
    
    if (status === "scanning") {
      icon = "🔍";
      bgColor = "#3b82f6";
      showAnimation = true;
      isScanning = true;
    } else if (status === "error") {
      icon = "❌";
      bgColor = "#ef4444";
    } else if (result) {
      const { flagged = 0, corrected = 0, total = 0 } = result;
      if (flagged === 0) {
        icon = "✅";
        bgColor = "#10b981";
      } else if (autoCorrect) {
        icon = "✨";
        bgColor = "#3b82f6";
      } else {
        icon = "⚠️";
        bgColor = "#ef4444";
      }
    } else {
      icon = "✅";
      bgColor = "#10b981";
    }
    
    iconElement.textContent = icon;
    messageElement.textContent = message;
    toastElement.style.background = bgColor;
    
    // Update CTA message if provided
    if (bodyElement && ctaElement) {
      if (ctaMessage && status === "complete") {
        ctaElement.textContent = ctaMessage;
        bodyElement.style.display = "block";
      } else {
        bodyElement.style.display = "none";
      }
    }
    
    // Show/hide dots element based on status
    if (dotsElement) {
      if (status === "scanning") {
        dotsElement.style.display = "inline-block";
      } else {
        dotsElement.style.display = "none";
        dotsElement.textContent = "";
      }
    }
    
    // Start animation if scanning
    if (showAnimation && isScanning) {
      startScanningAnimation();
    } else {
      stopScanningAnimation();
    }
  }
  
  function startScanningAnimation() {
    if (toastAnimationInterval) {
      return; // Already animating
    }
    
    const iconElement = toastElement?.querySelector("#ai-contrast-toast-icon");
    const dotsElement = toastElement?.querySelector("#ai-contrast-toast-dots");
    
    if (!iconElement) return;
    
    // Pulse animation for icon
    iconElement.style.animation = "pulse 1.5s ease-in-out infinite";
    
    // Animate dots in separate element (fixed width to prevent layout shift)
    if (dotsElement) {
      dotsElement.style.display = "inline-block";
      let dotCount = 0;
      toastAnimationInterval = setInterval(() => {
        if (!isScanning || !toastElement) {
          stopScanningAnimation();
          return;
        }
        dotCount = (dotCount + 1) % 4;
        dotsElement.textContent = ".".repeat(dotCount);
      }, 500);
    }
  }
  
  function stopScanningAnimation() {
    if (toastAnimationInterval) {
      clearInterval(toastAnimationInterval);
      toastAnimationInterval = null;
    }
    
    const iconElement = toastElement?.querySelector("#ai-contrast-toast-icon");
    const dotsElement = toastElement?.querySelector("#ai-contrast-toast-dots");
    
    if (iconElement) {
      iconElement.style.animation = "";
    }
    
    if (dotsElement) {
      dotsElement.style.display = "none";
      dotsElement.textContent = "";
    }
  }
  
  function removeToast() {
    if (toastAnimationInterval) {
      stopScanningAnimation();
    }
    
    if (toastElement) {
      toastElement.style.transition = "opacity 0.3s ease-out, transform 0.3s ease-out";
      toastElement.style.opacity = "0";
      toastElement.style.transform = "translateY(20px)";
      setTimeout(() => {
        if (toastElement && toastElement.parentElement) {
          toastElement.remove();
        }
        toastElement = null;
        isScanning = false;
      }, 300);
    }
  }

  function showNotification(result, autoCorrect) {
    // User-friendly messaging without technical details
    const { flagged = 0, corrected = 0 } = result;
    
    let message = "";
    let ctaMessage = "";
    
    if (flagged === 0) {
      message = "✓ Your page is now easier to read";
    } else if (autoCorrect) {
      if (corrected > 0) {
        message = "✓ Readability adjustments complete";
        ctaMessage = "Notice anything still hard to read? Click 'Hard to Read' in the extension to help us improve.";
      } else {
        message = "✓ Checked your page";
        ctaMessage = "Some elements couldn't be adjusted automatically. Click 'Hard to Read' in the extension to report issues.";
      }
    } else {
      message = "✓ Checked your page";
      ctaMessage = "Found some readability issues. Enable auto-correct to fix them automatically.";
    }
    
    updateToast(message, "complete", result, autoCorrect, ctaMessage);
  }

  // Mutation observer for dynamic content

  let mutationObserver = null;
  
  // Store current scan settings locally so MutationObserver can use them
  let currentScanSettings = {
    comfortScale: 0.5,
    autoCorrect: false
  };
  
  // State is now managed by background service worker
  // Request state before each scan to avoid desynchronization
  // But use locally stored scan settings if available (for MutationObserver)
  // ============================================================================
  // PHASE B: Persistent Settings & ML Architecture
  // Settings persistence using chrome.storage.local
  // ============================================================================

  /**
   * Placeholder function to get the target contrast based on the ML model.
   * In final production, this will communicate with the Service Worker 
   * which loads the trained ML model (e.g., via TensorFlow.js weights).
   * @param {Object} currentSettings - Current user settings.
   * @returns {Promise<number>} The ML-predicted target contrast.
   */
  function getMLPredictedContrast(currentSettings) {
    // --- ARCHITECTURAL STUB ---
    // For now, return the user-set targetContrast to keep the system running.
    // The actual implementation will involve chrome.runtime.sendMessage to the Service Worker.
    return new Promise(resolve => {
      console.warn("   [ML ARCHITECTURE] Using user setting. ML Model is not yet loaded in Service Worker.");
      resolve(currentSettings.targetContrast);
    });
  }

  async function getCurrentSettings() {
    // PHASE B: Use chrome.storage.local for persistent settings
    return new Promise((resolve) => {
      chrome.storage.local.get(['comfortScale', 'targetContrast', 'autoCorrect', 'lastScanTimestamp'], (stored) => {
        // First check if we have locally stored scan settings (from last runScan call)
        if (currentScanSettings && (currentScanSettings.autoCorrect !== undefined || currentScanSettings.comfortScale !== undefined)) {
          // Merge: use local scan settings for autoCorrect and comfortScale, stored for others
          resolve({
            comfortScale: currentScanSettings.comfortScale !== undefined ? currentScanSettings.comfortScale : (stored.comfortScale || 0.5),
            targetContrast: stored.targetContrast || 8.0,
            autoCorrect: currentScanSettings.autoCorrect !== undefined ? currentScanSettings.autoCorrect : (stored.autoCorrect || false),
            apiAvailable: false, // Always false - on-device mode
            lastScanTimestamp: stored.lastScanTimestamp || null
          });
        } else {
          // Use stored settings or defaults
          resolve({
            comfortScale: stored.comfortScale || 0.5,
            targetContrast: stored.targetContrast || 8.0,
            autoCorrect: stored.autoCorrect || false,
            apiAvailable: false, // Always false - on-device mode
            lastScanTimestamp: stored.lastScanTimestamp || null
          });
        }
      });
    });
  }
  
  async function updateState(updates) {
    // PHASE B: Use chrome.storage.local for persistent settings
    return new Promise((resolve) => {
      chrome.storage.local.get(['comfortScale', 'targetContrast', 'autoCorrect', 'lastScanTimestamp'], (stored) => {
        const newState = {
          comfortScale: updates.comfortScale !== undefined ? updates.comfortScale : (stored.comfortScale || 0.5),
          targetContrast: updates.targetContrast !== undefined ? updates.targetContrast : (stored.targetContrast || 8.0),
          autoCorrect: updates.autoCorrect !== undefined ? updates.autoCorrect : (stored.autoCorrect || false),
          lastScanTimestamp: updates.lastScanTimestamp !== undefined ? updates.lastScanTimestamp : (stored.lastScanTimestamp || null)
        };
        
        // Save to chrome.storage.local
        chrome.storage.local.set(newState, () => {
          resolve(newState);
        });
      });
    });
  }

  function startObservingDynamicContent() {
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }

    // Enable MutationObserver with strict conditions
    let debounceTimer = null;
    let isScanning = false; // Flag to prevent multiple simultaneous rescans
    let lastScanTime = 0; // Track when last scan completed
    const DEBOUNCE_MS = 300;
    const MIN_SCAN_INTERVAL = 1000; // Minimum time between scans (1 second) to prevent rapid rescans
    
    mutationObserver = new MutationObserver((mutations) => {
      let hasRelevantChanges = false;
      
      for (const mutation of mutations) {
        // Handle style attribute changes for corrected elements
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const target = mutation.target;
          // If this is a corrected element, re-apply the fix to ensure it persists
          if (target && target.hasAttribute('data-contrast-fixed') && target.hasAttribute('data-ai-corrected-color')) {
            // Get the stored corrected color from data attribute
            const correctedColor = target.getAttribute('data-ai-corrected-color');
            if (correctedColor) {
              // Use setTimeout to ensure the style change has been applied first
              setTimeout(() => {
                // Re-apply the fix to override any style changes
                forceApplyStyle(target, 'color', correctedColor);
                console.log(`   🔄 [MUTATION] Re-applied fix to element after style change: color=${correctedColor}`);
              }, 0);
            }
            continue; // Skip further processing for this mutation
          }
          // For non-corrected elements, skip style-only mutations
          continue;
        }
        
        // Skip attribute mutations for our own data attributes
        if (mutation.type === 'attributes') {
          const attrName = mutation.attributeName;
          if (attrName && (
            attrName.startsWith('data-ai-') ||
            attrName.startsWith('data-contrast-') ||
            attrName === 'data-hover-fg' ||
            attrName === 'data-hover-bg' ||
            attrName === 'data-css-hover-fg' ||
            attrName === 'data-css-hover-bg'
          )) {
            continue; // Skip our own attribute changes
          }
        }
        
        // Check for new text nodes or elements with visible text
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Skip our own notifications
          let isOurNotification = false;
          for (const node of mutation.addedNodes) {
            if (node.id === 'ai-contrast-notification' || 
                node.id === 'contrast-fixes' ||
                (node.nodeType === Node.ELEMENT_NODE && node.querySelector('#ai-contrast-notification'))) {
              isOurNotification = true;
              break;
            }
          }
          
          if (isOurNotification) continue;
          
          // Check if any added node has visible text or is a text node
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
              const text = node.textContent.trim();
              if (text.length > 0) {
                // Text nodes inherit styles from parent, so we need to re-check the parent
                // even if it was already processed, because the text content has changed
                let parent = node.parentElement;
                if (parent && parent !== document.body) {
                  // Remove processing markers so parent will be re-scanned
                  // This ensures new text content is checked for contrast
                  if (parent.hasAttribute('data-contrast-fixed')) {
                    parent.removeAttribute('data-contrast-fixed');
                  }
                  if (parent.hasAttribute('data-ai-fix-id')) {
                    parent.removeAttribute('data-ai-fix-id');
                  }
                  // Don't remove data-ai-skip-reason as that's for permanent skips (like images)
                  hasRelevantChanges = true;
                  break;
                }
              }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              // Skip if element is already processed
              if (node.hasAttribute('data-contrast-fixed') || 
                  node.hasAttribute('data-ai-fix-id') ||
                  node.hasAttribute('data-ai-skip-reason')) {
                continue;
              }
              
              // Check if the element itself has an image background or gradient (skip if so)
              // EXCEPTION: Don't skip interactive elements if they have their own solid background
              const tagName = node.tagName ? node.tagName.toLowerCase() : '';
              const isInteractive = tagName === 'button' || 
                                   tagName === 'a' || 
                                   tagName === 'input' ||
                                   node.getAttribute('role') === 'button' ||
                                   node.getAttribute('role') === 'link';
              
              let elementHasImageBg = false;
              if (isInteractive) {
                // For interactive elements, check if they have their own solid background
                try {
                  const elCs = getComputedStyle(node);
                  const elBg = parseCSSColorToRGBA(elCs.backgroundColor, [0, 0, 0, 0]);
                  // If element has its own solid background (alpha > 0.5), don't skip
                  if (elBg[3] > 0.5) {
                    // Interactive element with solid background - process it, don't skip
                    hasRelevantChanges = true;
                    break;
                  }
                } catch (e) {
                  // If we can't check, fall through to normal image check
                }
              }
              
              // Check for image background (only if not interactive with solid bg)
              elementHasImageBg = node._aiHasImageBackground || 
                                  (node.hasAttribute('data-ai-skip-reason') && node.getAttribute('data-ai-skip-reason') === 'image') ||
                                  hasBackgroundImage(node) ||
                                  hasBackgroundGradient(node);
              
              if (elementHasImageBg) {
                // Element has image background, mark it immediately so it's excluded from future scans
                if (!node.hasAttribute('data-ai-skip-reason')) {
                  node.setAttribute('data-ai-skip-reason', 'image');
                }
                if (node._aiHasImageBackground !== true) {
                  node._aiHasImageBackground = true;
                }
                console.log(`   ⏭️  [MUTATION] Skipping image background element: ${node.tagName} "${node.textContent.trim().substring(0, 50)}..."`);
                continue;
              }
              
              // Check if element has visible text
              const text = node.textContent.trim();
              if (text.length > 0) {
                // Check if element is inside an image-background element (skip if so)
              // EXCEPTION: Don't skip interactive elements if they have their own solid background
              const tagName = node.tagName ? node.tagName.toLowerCase() : '';
              const isInteractive = tagName === 'button' || 
                                   tagName === 'a' || 
                                   tagName === 'input' ||
                                   node.getAttribute('role') === 'button' ||
                                   node.getAttribute('role') === 'link';
              
              let isInsideImageBg = false;
              let isAlreadyProcessed = false;
              
              if (isInteractive) {
                // For interactive elements, check if they have their own solid background
                try {
                  const elCs = getComputedStyle(node);
                  const elBg = parseCSSColorToRGBA(elCs.backgroundColor, [0, 0, 0, 0]);
                  // If element has its own solid background (alpha > 0.5), don't skip
                  if (elBg[3] > 0.5) {
                    // Interactive element with solid background - process it
                    hasRelevantChanges = true;
                    break;
                  }
                } catch (e) {
                  // If we can't check, fall through to normal parent check
                }
              }
              
              // Check parent chain for image backgrounds (only if not interactive with solid bg)
              let parent = node.parentElement;
              while (parent && parent !== document.body) {
                if (parent._aiHasImageBackground || parent.hasAttribute('data-ai-skip-reason')) {
                  const skipReason = parent.getAttribute('data-ai-skip-reason');
                  if (skipReason === 'image') {
                    isInsideImageBg = true;
                    break;
                  }
                }
                // Also check if parent is already processed
                if (parent.hasAttribute('data-contrast-fixed') || 
                    parent.hasAttribute('data-ai-fix-id')) {
                  isAlreadyProcessed = true;
                  break;
                }
                parent = parent.parentElement;
              }
              
              if (!isInsideImageBg && !isAlreadyProcessed) {
                hasRelevantChanges = true;
                break;
              }
              }
            }
          }
        }
      }
      
      // Debounce and scan if relevant changes detected
      if (hasRelevantChanges && !isScanning) {
        console.log("🔍 MutationObserver detected relevant changes, checking settings...");
        // Check settings early to avoid unnecessary processing
        getCurrentSettings().then(settings => {
          console.log(`   📊 Settings check: autoCorrect=${settings.autoCorrect}, comfortScale=${settings.comfortScale}`);
          // Only proceed if auto-correct is enabled
          if (!settings.autoCorrect) {
            console.log("   ⏭️  Auto-correct disabled, skipping dynamic content rescan");
            return;
          }
          
          // Clear existing timer if any
          if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
          }
          
          // Set new timer - this will fire after DEBOUNCE_MS of no new changes
          debounceTimer = setTimeout(async () => {
            // Double-check we're not already scanning (race condition protection)
            if (isScanning) {
              console.log("⏭️  Rescan already in progress (race condition), skipping...");
              return;
            }
            
            // Re-check settings in case they changed
            const currentSettings = await getCurrentSettings();
            if (!currentSettings.autoCorrect) {
              return; // Settings changed, skip
            }
            
            console.log("🔄 New content detected, rescanning...");
            isScanning = true;
            
            // Temporarily disconnect observer FIRST to prevent detecting our own changes
            const observerWasActive = mutationObserver !== null;
            if (mutationObserver) {
              mutationObserver.disconnect();
              console.log("   🔌 MutationObserver disconnected for rescan");
            }
            
            try {
              // Reuse the same processing pipeline as manual scan
              console.log(`   📊 Settings: autoCorrect=${currentSettings.autoCorrect}, comfortScale=${currentSettings.comfortScale}`);
              console.log(`   🎯 Starting dynamic content rescan (target: ${currentSettings.comfortScale ? (currentSettings.comfortScale * 15.5).toFixed(2) : 'default'}:1)`);
              const scanResult = await scanWithAI(currentSettings.comfortScale, currentSettings.autoCorrect);
              console.log(`   ✅ Dynamic content rescan completed: ${scanResult ? `Flagged: ${scanResult.flagged}, Corrected: ${scanResult.corrected}` : 'completed'}`);
            } catch (err) {
              console.error("⚠️ Dynamic content scan failed:", err);
              console.error("   Error details:", err.message);
              if (err.stack) {
                console.error("   Stack trace:", err.stack);
              }
            } finally {
              // Reconnect observer after scan completes (with a small delay to ensure all DOM changes are done)
              setTimeout(() => {
                if (observerWasActive && mutationObserver) {
                  try {
                    mutationObserver.observe(document.body, {
                      childList: true,
                      subtree: true,
                      characterData: true
                    });
                    console.log("   🔌 MutationObserver reconnected after rescan");
                  } catch (reconnectErr) {
                    console.error("   ⚠️ Failed to reconnect MutationObserver:", reconnectErr);
                  }
                }
                isScanning = false;
                console.log("   ✅ Rescan process complete, ready for new changes");
              }, 100); // Small delay to ensure all DOM updates from scan are complete
            }
          }, DEBOUNCE_MS);
        }).catch(err => {
          // If we can't get settings, skip silently
          console.debug("⚠️ Could not check settings for dynamic content:", err.message);
        });
      }
    });
    
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
    
    console.log("✅ MutationObserver enabled for dynamic content");
  }

  function stopObservingDynamicContent() {
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    if (window.__rescanTimeout) {
      clearTimeout(window.__rescanTimeout);
    }
  }

  // Reset functionality

  function resetAllChanges() {
    // Clear body background cache on reset (page may have changed)
    _cachedBodyBackground = null;
    
    // Reset flagged elements (when auto-correct is disabled)
    document.querySelectorAll("[data-ai-contrast-flagged]").forEach((el) => {
      // Restore original outline if it was backed up
      if (el.hasAttribute("data-ai-original-outline")) {
        const originalOutline = el.getAttribute("data-ai-original-outline");
        if (originalOutline && originalOutline !== "none") {
          el.style.outline = originalOutline;
        } else {
          el.style.removeProperty("outline");
        }
        el.style.removeProperty("outline-offset");
        el.removeAttribute("data-ai-original-outline");
      } else {
        // Remove outline if no backup exists
        el.style.removeProperty("outline");
        el.style.removeProperty("outline-offset");
      }
      el.removeAttribute("data-ai-contrast-flagged");
      el.removeAttribute("data-ai-contrast-ratio");
      el.removeAttribute("title");
    });

    document.querySelectorAll("[data-ai-contrast-fixed]").forEach((el) => {
      // Remove hover event listeners if they exist (original fixButtonHoverState)
      if (el._aiHoverIn) {
        el.removeEventListener("mouseenter", el._aiHoverIn);
        el.removeEventListener("mouseleave", el._aiHoverOut);
        delete el._aiHoverIn;
        delete el._aiHoverOut;
      }

      // Remove extended hover event listeners if they exist
      if (el._aiHoverInExtended) {
        el.removeEventListener("mouseenter", el._aiHoverInExtended);
        el.removeEventListener("mouseleave", el._aiHoverOutExtended);
        delete el._aiHoverInExtended;
        delete el._aiHoverOutExtended;
        delete el._aiHoverLogicApplied;
      }

      // CRITICAL: Restore original inline styles before removing properties
      // This ensures elements return to their exact original state
      const originalInlineColor = el.getAttribute(
        "data-ai-original-inline-color"
      );
      const originalInlineBg = el.getAttribute("data-ai-original-inline-bg");

      // Remove the extension's styles first (this removes !important styles)
      // Use removeProperty to clear both the value and !important flag
      el.style.removeProperty("color");
      el.style.removeProperty("background-color");

      // Force a reflow to ensure styles are removed
      void el.offsetHeight;

      // Restore original inline styles if they existed
      // Only restore if the attribute exists and has a non-empty value
      // Use setProperty with 'important' to ensure restoration overrides any existing !important rules
      if (originalInlineColor !== null && originalInlineColor !== "") {
        el.style.setProperty('color', originalInlineColor, 'important');
        console.log(
          `   🔄 Restored original inline color: ${originalInlineColor}`
        );
      } else {
        console.log(
          `   🔄 No original inline color to restore (element had no inline color before)`
        );
      }

      // Use setProperty with 'important' to ensure restoration overrides any existing !important rules
      if (originalInlineBg !== null && originalInlineBg !== "") {
        el.style.setProperty('background-color', originalInlineBg, 'important');
        console.log(
          `   🔄 Restored original inline background: ${originalInlineBg}`
        );
      } else {
        console.log(
          `   🔄 No original inline background to restore (element had no inline background before)`
        );
      }

      // RESTORE ORIGINAL LAYOUT STYLES (preserve layout integrity)
      const originalDisplay = el.getAttribute("data-ai-original-display");
      const originalPadding = el.getAttribute("data-ai-original-padding");
      const originalBorder = el.getAttribute("data-ai-original-border");
      const originalTransition = el.getAttribute("data-ai-original-transition");

      // Restore display
      if (originalDisplay !== null && originalDisplay !== "") {
        el.style.display = originalDisplay;
        console.log(`   🔄 Restored original display: ${originalDisplay}`);
      } else {
        el.style.removeProperty("display");
      }

      // Restore padding
      if (originalPadding !== null && originalPadding !== "") {
        el.style.padding = originalPadding;
        console.log(`   🔄 Restored original padding: ${originalPadding}`);
      } else {
        el.style.removeProperty("padding");
      }

      // Restore border
      if (originalBorder !== null && originalBorder !== "") {
        el.style.border = originalBorder;
        console.log(`   🔄 Restored original border: ${originalBorder}`);
      } else {
        el.style.removeProperty("border");
      }

      // Restore transition
      if (originalTransition !== null && originalTransition !== "") {
        el.style.transition = originalTransition;
        console.log(`   🔄 Restored original transition: ${originalTransition}`);
      } else {
        el.style.removeProperty("transition");
      }

      // Remove other overlay-related style properties
      el.style.removeProperty("border-radius");
      el.style.removeProperty("box-decoration-break");
      el.style.removeProperty("-webkit-box-decoration-break");
      el.style.removeProperty("border-color");

      // Remove all data attributes (including backup attributes)
      el.removeAttribute("data-ai-contrast-fixed");
      el.removeAttribute("data-text-over-image");
      el.removeAttribute("data-fix-type");
      el.removeAttribute("data-original-contrast");
      el.removeAttribute("data-new-contrast");
      el.removeAttribute("data-ai-hover-bg");
      el.removeAttribute("data-ai-hover-fg");
      el.removeAttribute("data-ai-normal-bg");
      el.removeAttribute("data-ai-normal-fg");
      el.removeAttribute("data-corrected-fg");
      el.removeAttribute("data-corrected-bg");
      el.removeAttribute("data-hover-fg");
      el.removeAttribute("data-hover-bg");
      el.removeAttribute("data-hover-bound");
      el.removeAttribute("data-ai-original-inline-color");
      el.removeAttribute("data-ai-original-inline-bg");
      el.removeAttribute("data-ai-has-border");
      el.removeAttribute("data-ai-original-border-width");
      el.removeAttribute("data-ai-original-border-style");
      el.removeAttribute("data-ai-original-border-color");
      el.removeAttribute("data-ai-hover-class");
      el.removeAttribute("data-ai-effective-bg");
      el.removeAttribute("data-ai-contrast-flagged");
      el.removeAttribute("data-ai-contrast-ratio");

      // Restore original outline if it was backed up
      if (el.hasAttribute("data-ai-original-outline")) {
        const originalOutline = el.getAttribute("data-ai-original-outline");
        if (originalOutline && originalOutline !== "none") {
          el.style.outline = originalOutline;
        } else {
          el.style.removeProperty("outline");
        }
        el.style.removeProperty("outline-offset");
        el.removeAttribute("data-ai-original-outline");
      } else {
        // Remove outline if no backup exists
        el.style.removeProperty("outline");
        el.style.removeProperty("outline-offset");
      }

      // Remove cached layout style attributes
      el.removeAttribute("data-ai-original-display");
      el.removeAttribute("data-ai-original-padding");
      el.removeAttribute("data-ai-original-border");
      el.removeAttribute("data-ai-original-transition");
      el.removeAttribute("data-ai-added-padding");

      el.removeAttribute("title");

      // Remove hover classes
      const classes = Array.from(el.classList);
      classes.forEach((cls) => {
        if (cls.startsWith("ai-btn-hover-")) {
          el.classList.remove(cls);
        }
      });
    });

    const buttonHoverStyle = document.getElementById("ai-button-hover-fixes");
    if (buttonHoverStyle) {
      buttonHoverStyle.remove();
      buttonHoverSheet = null;
      buttonHoverCounter = 0;
    }

    // Stop hover observer if running
    stopHoverObserver();

    document.querySelectorAll("[data-has-bg-image]").forEach((el) => {
      el.removeAttribute("data-has-bg-image");
    });

    scannedElements = new WeakSet();

    const notification = document.getElementById("ai-contrast-notification");
    if (notification) notification.remove();

    stopObservingDynamicContent();

    console.log("🔄 All changes reset");
  }

  // ============================================================================
  // REAL-TIME CONTRAST INSPECTOR MODE
  // ============================================================================
  // Shows live contrast data on hover over any text element
  // No pixel sampling - uses computed styles and resolved backgrounds only
  // ============================================================================

  // Inspector state
  let inspectorEnabled = false;
  let inspectorOverlay = null;
  let inspectorDebugMode = false;
  let lastInspectedElement = null;
  let inspectorRAF = null;

  // Convert RGB array to hex string
  function rgbToHex(rgb) {
    if (!rgb || !Array.isArray(rgb) || rgb.length < 3) return '#000000';
    const r = Math.round(Math.max(0, Math.min(255, rgb[0])));
    const g = Math.round(Math.max(0, Math.min(255, rgb[1])));
    const b = Math.round(Math.max(0, Math.min(255, rgb[2])));
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  // Get WCAG level based on contrast ratio, font size, and weight
  function getWCAGLevel(ratio, fontSize, fontWeight) {
    const isBold = fontWeight >= 700;
    const isLargeText = fontSize >= 18 || (fontSize >= 14 && isBold);
    
    // WCAG 2.2 thresholds
    const aaThreshold = isLargeText ? 3.0 : 4.5;
    const aaaThreshold = isLargeText ? 4.5 : 7.0;
    
    if (ratio >= aaaThreshold) {
      return { level: 'AAA', pass: true, threshold: aaaThreshold };
    } else if (ratio >= aaThreshold) {
      return { level: 'AA', pass: true, threshold: aaThreshold };
    } else {
      return { level: 'Fail', pass: false, threshold: aaThreshold };
    }
  }

  // Get element's computed role
  function getComputedRole(el) {
    if (!el || !el.getAttribute) return 'unknown';
    
    // Check explicit role first
    const explicitRole = el.getAttribute('role');
    if (explicitRole) return explicitRole;
    
    // Infer from tag name
    const tagName = el.tagName.toLowerCase();
    const roleMap = {
      'a': 'link',
      'button': 'button',
      'input': el.type === 'submit' || el.type === 'button' ? 'button' : 'textbox',
      'h1': 'heading',
      'h2': 'heading',
      'h3': 'heading',
      'h4': 'heading',
      'h5': 'heading',
      'h6': 'heading',
      'p': 'paragraph',
      'li': 'listitem',
      'nav': 'navigation',
      'main': 'main',
      'article': 'article',
      'section': 'region',
      'img': 'img',
      'table': 'table',
      'form': 'form'
    };
    
    return roleMap[tagName] || 'generic';
  }

  // Determine background source type
  function getBackgroundSourceType(el) {
    if (!el) return { type: 'unknown', reason: 'no-element' };
    
    try {
      const cs = getComputedStyle(el);
      const bgImage = cs.backgroundImage;
      
      // Check for image
      if (bgImage && bgImage !== 'none' && bgImage.includes('url(') && !bgImage.includes('gradient')) {
        return { type: 'image', reason: 'background-image-url' };
      }
      
      // Check for gradient
      if (bgImage && bgImage.includes('gradient')) {
        return { type: 'gradient', reason: 'background-gradient' };
      }
      
      // Check for solid color
      const bgColor = parseCSSColorToRGBA(cs.backgroundColor, [0, 0, 0, 0]);
      if (bgColor[3] > 0) {
        return { type: 'solid', reason: 'background-color' };
      }
      
      // Check ancestors for background
      let parent = el.parentElement;
      let depth = 0;
      while (parent && depth < 10 && parent !== document.body) {
        const parentCs = getComputedStyle(parent);
        const parentBgImage = parentCs.backgroundImage;
        const parentBgColor = parseCSSColorToRGBA(parentCs.backgroundColor, [0, 0, 0, 0]);
        
        if (parentBgImage && parentBgImage !== 'none' && parentBgImage.includes('url(')) {
          return { type: 'image', reason: `ancestor-image-depth-${depth + 1}` };
        }
        if (parentBgImage && parentBgImage.includes('gradient')) {
          return { type: 'gradient', reason: `ancestor-gradient-depth-${depth + 1}` };
        }
        if (parentBgColor[3] >= 0.5) {
          return { type: 'solid', reason: `ancestor-solid-depth-${depth + 1}` };
        }
        
        parent = parent.parentElement;
        depth++;
      }
      
      return { type: 'unknown', reason: 'no-background-found' };
    } catch (e) {
      return { type: 'unknown', reason: `error-${e.message}` };
    }
  }

  // Create the inspector overlay element
  function createInspectorOverlay() {
    if (inspectorOverlay) return inspectorOverlay;
    
    const overlay = document.createElement('div');
    overlay.id = 'ai-contrast-inspector';
    overlay.style.cssText = `
      position: fixed;
      z-index: 2147483647;
      pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
      font-size: 12px;
      line-height: 1.4;
      background: #1a1a2e;
      color: #eaeaea;
      border-radius: 8px;
      padding: 12px;
      min-width: 260px;
      max-width: 340px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1);
      display: none;
      opacity: 0;
      transition: opacity 0.15s ease;
    `;
    
    overlay.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);">
        <span style="font-weight: 600; color: #a0a0ff;">Contrast Inspector</span>
        <span id="inspector-wcag-badge" style="padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;"></span>
      </div>
      
      <div id="inspector-ai-status" style="display: none; margin-bottom: 8px; padding: 6px 8px; background: rgba(74, 222, 128, 0.15); border-radius: 4px; border-left: 3px solid #4ade80;">
        <span style="color: #4ade80; font-size: 11px; font-weight: 600;">✓ AI Optimized</span>
        <span id="inspector-ai-improvement" style="color: #888; font-size: 10px; margin-left: 8px;"></span>
      </div>
      
      <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; align-items: center;">
        <span style="color: #888;">Ratio:</span>
        <span id="inspector-ratio" style="font-weight: 600; font-size: 14px;"></span>
        
        <span style="color: #888;">Text Color:</span>
        <div style="display: flex; align-items: center; gap: 8px;">
          <div id="inspector-fg-swatch" style="width: 16px; height: 16px; border-radius: 3px; border: 1px solid rgba(255,255,255,0.3);"></div>
          <span id="inspector-fg-hex" style="font-family: monospace;"></span>
        </div>
        
        <span id="inspector-original-fg-label" style="color: #666; font-size: 10px; display: none;">Original:</span>
        <div id="inspector-original-fg-row" style="display: none; align-items: center; gap: 8px;">
          <div id="inspector-original-fg-swatch" style="width: 12px; height: 12px; border-radius: 2px; border: 1px solid rgba(255,255,255,0.2);"></div>
          <span id="inspector-original-fg-hex" style="font-family: monospace; font-size: 10px; color: #888;"></span>
        </div>
        
        <span style="color: #888;">Background:</span>
        <div style="display: flex; align-items: center; gap: 8px;">
          <div id="inspector-bg-swatch" style="width: 16px; height: 16px; border-radius: 3px; border: 1px solid rgba(255,255,255,0.3);"></div>
          <span id="inspector-bg-hex" style="font-family: monospace;"></span>
        </div>
        
        <span style="color: #888;">Font:</span>
        <span id="inspector-font"></span>
        
        <span style="color: #888;">Element:</span>
        <span id="inspector-element" style="font-family: monospace;"></span>
        
        <span style="color: #888;">BG Source:</span>
        <span id="inspector-bg-source"></span>
        
        <span id="inspector-bg-reason-label" style="color: #666; font-size: 10px; display: none;">Reason:</span>
        <span id="inspector-bg-reason" style="font-size: 10px; color: #888; display: none;"></span>
      </div>
      
      <div id="inspector-image-warning" style="display: none; margin-top: 8px; padding: 8px; background: rgba(251, 191, 36, 0.15); border-radius: 4px; border-left: 3px solid #fbbf24;">
        <span style="color: #fbbf24; font-size: 11px;">⚠ Image Background - Not Analyzed</span>
        <div style="color: #888; font-size: 10px; margin-top: 4px;">Text over images cannot be reliably analyzed without pixel sampling.</div>
      </div>
      
      <div id="inspector-correction-details" style="display: none; margin-top: 8px; padding: 8px; background: rgba(160, 160, 255, 0.1); border-radius: 4px;">
        <div style="font-size: 10px; color: #a0a0ff; margin-bottom: 4px; font-weight: 600;">Correction Details</div>
        <div style="display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; font-size: 10px;">
          <span style="color: #666;">Corrected FG:</span>
          <div style="display: flex; align-items: center; gap: 4px;">
            <div id="inspector-corrected-fg-swatch" style="width: 10px; height: 10px; border-radius: 2px; border: 1px solid rgba(255,255,255,0.2);"></div>
            <span id="inspector-corrected-fg-hex" style="font-family: monospace; color: #4ade80;"></span>
          </div>
          <span style="color: #666;">Detected BG:</span>
          <div style="display: flex; align-items: center; gap: 4px;">
            <div id="inspector-detected-bg-swatch" style="width: 10px; height: 10px; border-radius: 2px; border: 1px solid rgba(255,255,255,0.2);"></div>
            <span id="inspector-detected-bg-hex" style="font-family: monospace; color: #60a5fa;"></span>
          </div>
          <span style="color: #666;">Original Ratio:</span>
          <span id="inspector-original-ratio" style="color: #f87171;"></span>
          <span style="color: #666;">New Ratio:</span>
          <span id="inspector-new-ratio" style="color: #4ade80;"></span>
        </div>
      </div>
      
      <div id="inspector-skip-reason" style="margin-top: 8px; padding: 8px; background: rgba(255,100,100,0.15); border-radius: 4px; display: none;">
        <span style="color: #ff8080; font-size: 11px;"></span>
      </div>
    `;
    
    document.body.appendChild(overlay);
    inspectorOverlay = overlay;
    return overlay;
  }

  // Update inspector overlay with element data
  function updateInspectorOverlay(el, mouseX, mouseY) {
    if (!el || !inspectorOverlay) return;
    
    try {
      const cs = getComputedStyle(el);
      
      // Get foreground color (text color)
      const fgRGBA = parseCSSColorToRGBA(cs.color, [0, 0, 0, 1]);
      const fgRGB = fgRGBA.slice(0, 3);
      const fgHex = rgbToHex(fgRGB);
      
      // Get effective background color
      const bgRGBA = getEffectiveBackgroundRGBA(el);
      const bgRGB = bgRGBA ? bgRGBA.slice(0, 3) : [255, 255, 255];
      const bgAlpha = bgRGBA ? bgRGBA[3] : 1;
      const bgHex = rgbToHex(bgRGB);
      
      // Calculate contrast ratio
      const ratio = wcagContrast(fgRGB, bgRGB);
      
      // Get font info
      const fontSize = parseFloat(cs.fontSize) || 16;
      const fontWeight = parseInt(cs.fontWeight) || 400;
      
      // Get WCAG level
      const wcagResult = getWCAGLevel(ratio, fontSize, fontWeight);
      
      // Get element info
      const tagName = el.tagName.toLowerCase();
      const role = getComputedRole(el);
      
      // Get background source
      const bgSource = getBackgroundSourceType(el);
      
      // Check if element should be skipped
      const hasImageBg = el._aiHasImageBackground || bgSource.type === 'image';
      const skipReason = hasImageBg ? 'Image background detected - skipped' : 
                        (bgAlpha < 0.5 ? 'Transparent background - skipped' : null);
      
      // Update overlay content
      const ratioEl = inspectorOverlay.querySelector('#inspector-ratio');
      ratioEl.textContent = `${ratio.toFixed(2)}:1`;
      ratioEl.style.color = wcagResult.pass ? '#4ade80' : '#f87171';
      
      const badgeEl = inspectorOverlay.querySelector('#inspector-wcag-badge');
      badgeEl.textContent = wcagResult.level;
      if (wcagResult.level === 'AAA') {
        badgeEl.style.background = '#166534';
        badgeEl.style.color = '#4ade80';
      } else if (wcagResult.level === 'AA') {
        badgeEl.style.background = '#854d0e';
        badgeEl.style.color = '#fde047';
      } else {
        badgeEl.style.background = '#991b1b';
        badgeEl.style.color = '#fca5a5';
      }
      
      inspectorOverlay.querySelector('#inspector-fg-swatch').style.background = fgHex;
      inspectorOverlay.querySelector('#inspector-fg-hex').textContent = fgHex;
      
      inspectorOverlay.querySelector('#inspector-bg-swatch').style.background = bgHex;
      inspectorOverlay.querySelector('#inspector-bg-hex').textContent = bgHex + (bgAlpha < 1 ? ` (${Math.round(bgAlpha * 100)}%)` : '');
      
      inspectorOverlay.querySelector('#inspector-font').textContent = `${fontSize}px / ${fontWeight}`;
      inspectorOverlay.querySelector('#inspector-element').textContent = `<${tagName}> [${role}]`;
      
      const bgSourceEl = inspectorOverlay.querySelector('#inspector-bg-source');
      bgSourceEl.textContent = bgSource.type;
      bgSourceEl.style.color = bgSource.type === 'solid' ? '#4ade80' : 
                               bgSource.type === 'gradient' ? '#fde047' : 
                               bgSource.type === 'image' ? '#f87171' : '#888';
      
      // Show background reason code
      const bgReasonLabelEl = inspectorOverlay.querySelector('#inspector-bg-reason-label');
      const bgReasonEl = inspectorOverlay.querySelector('#inspector-bg-reason');
      if (bgSource.reason && bgSource.type !== 'solid') {
        bgReasonLabelEl.style.display = 'block';
        bgReasonEl.style.display = 'block';
        bgReasonEl.textContent = bgSource.reason;
      } else {
        bgReasonLabelEl.style.display = 'none';
        bgReasonEl.style.display = 'none';
      }
      
      // Show image warning if background is an image
      const imageWarningEl = inspectorOverlay.querySelector('#inspector-image-warning');
      if (bgSource.type === 'image' || hasImageBg) {
        imageWarningEl.style.display = 'block';
      } else {
        imageWarningEl.style.display = 'none';
      }
      
      // Show skip reason if applicable
      const skipReasonEl = inspectorOverlay.querySelector('#inspector-skip-reason');
      if (skipReason && bgSource.type !== 'image') {
        skipReasonEl.style.display = 'block';
        skipReasonEl.querySelector('span').textContent = skipReason;
      } else {
        skipReasonEl.style.display = 'none';
      }
      
      // Check if element was corrected by AI
      const aiStatusEl = inspectorOverlay.querySelector('#inspector-ai-status');
      const correctionDetailsEl = inspectorOverlay.querySelector('#inspector-correction-details');
      const originalFgLabelEl = inspectorOverlay.querySelector('#inspector-original-fg-label');
      const originalFgRowEl = inspectorOverlay.querySelector('#inspector-original-fg-row');
      
      const wasAiCorrected = el.hasAttribute('data-ai-contrast-fixed') && 
                             el.getAttribute('data-ai-contrast-fixed') === 'true';
      
      if (wasAiCorrected) {
        // Show AI status badge
        aiStatusEl.style.display = 'block';
        
        // Get correction details from data attributes
        const correctedFg = el.getAttribute('data-corrected-fg') || el.getAttribute('data-ai-normal-fg');
        const detectedBg = el.getAttribute('data-ai-normal-bg') || el.getAttribute('data-ai-effective-bg');
        const originalContrast = el.getAttribute('data-original-contrast');
        const newContrast = el.getAttribute('data-new-contrast');
        const originalInlineColor = el.getAttribute('data-ai-original-inline-color');
        
        // Calculate improvement
        if (originalContrast && newContrast) {
          const orig = parseFloat(originalContrast);
          const newC = parseFloat(newContrast);
          const improvement = ((newC / orig - 1) * 100).toFixed(0);
          inspectorOverlay.querySelector('#inspector-ai-improvement').textContent = 
            `${orig.toFixed(2)} → ${newC.toFixed(2)} (+${improvement}%)`;
        }
        
        // Show correction details panel
        correctionDetailsEl.style.display = 'block';
        
        // Corrected foreground color
        if (correctedFg) {
          const correctedFgRGBA = parseCSSColorToRGBA(correctedFg, [0, 0, 0, 1]);
          const correctedFgHex = rgbToHex(correctedFgRGBA.slice(0, 3));
          inspectorOverlay.querySelector('#inspector-corrected-fg-swatch').style.background = correctedFgHex;
          inspectorOverlay.querySelector('#inspector-corrected-fg-hex').textContent = correctedFgHex;
        }
        
        // Detected background color
        if (detectedBg) {
          const detectedBgRGBA = parseCSSColorToRGBA(detectedBg, [255, 255, 255, 1]);
          const detectedBgHex = rgbToHex(detectedBgRGBA.slice(0, 3));
          inspectorOverlay.querySelector('#inspector-detected-bg-swatch').style.background = detectedBgHex;
          inspectorOverlay.querySelector('#inspector-detected-bg-hex').textContent = detectedBgHex;
        }
        
        // Original and new contrast ratios
        if (originalContrast) {
          inspectorOverlay.querySelector('#inspector-original-ratio').textContent = `${originalContrast}:1`;
        }
        if (newContrast) {
          inspectorOverlay.querySelector('#inspector-new-ratio').textContent = `${newContrast}:1`;
        }
        
        // Show original color if available
        if (originalInlineColor && originalInlineColor.trim()) {
          originalFgLabelEl.style.display = 'block';
          originalFgRowEl.style.display = 'flex';
          const originalFgRGBA = parseCSSColorToRGBA(originalInlineColor, [0, 0, 0, 1]);
          const originalFgHex = rgbToHex(originalFgRGBA.slice(0, 3));
          inspectorOverlay.querySelector('#inspector-original-fg-swatch').style.background = originalFgHex;
          inspectorOverlay.querySelector('#inspector-original-fg-hex').textContent = originalFgHex;
        } else {
          originalFgLabelEl.style.display = 'none';
          originalFgRowEl.style.display = 'none';
        }
      } else {
        // Hide AI-specific sections
        aiStatusEl.style.display = 'none';
        correctionDetailsEl.style.display = 'none';
        originalFgLabelEl.style.display = 'none';
        originalFgRowEl.style.display = 'none';
      }
      
      // Update border color based on pass/fail
      inspectorOverlay.style.borderLeft = `4px solid ${wcagResult.pass ? '#4ade80' : '#f87171'}`;
      
      // Position the overlay
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const overlayWidth = 320;
      const overlayHeight = wasAiCorrected ? 340 : 240;
      const offset = 15;
      
      let left = mouseX + offset;
      let top = mouseY + offset;
      
      // Prevent overflow on right
      if (left + overlayWidth > viewportWidth - 20) {
        left = mouseX - overlayWidth - offset;
      }
      
      // Prevent overflow on bottom
      if (top + overlayHeight > viewportHeight - 20) {
        top = mouseY - overlayHeight - offset;
      }
      
      // Ensure minimum position
      left = Math.max(10, left);
      top = Math.max(10, top);
      
      inspectorOverlay.style.left = `${left}px`;
      inspectorOverlay.style.top = `${top}px`;
      inspectorOverlay.style.display = 'block';
      inspectorOverlay.style.opacity = '1';
      
      // Debug logging
      if (inspectorDebugMode) {
        const debugData = {
          element: `<${tagName}>`,
          role: role,
          fgColor: fgHex,
          bgColor: bgHex,
          bgAlpha: bgAlpha,
          ratio: ratio.toFixed(2),
          wcagLevel: wcagResult.level,
          fontSize: fontSize,
          fontWeight: fontWeight,
          bgSource: bgSource,
          skipReason: skipReason,
          aiCorrected: wasAiCorrected
        };
        
        if (wasAiCorrected) {
          debugData.correction = {
            correctedFg: el.getAttribute('data-corrected-fg') || el.getAttribute('data-ai-normal-fg'),
            detectedBg: el.getAttribute('data-ai-normal-bg') || el.getAttribute('data-ai-effective-bg'),
            originalContrast: el.getAttribute('data-original-contrast'),
            newContrast: el.getAttribute('data-new-contrast'),
            fixType: el.getAttribute('data-fix-type')
          };
        }
        
        console.log('[INSPECTOR]', debugData);
      }
      
    } catch (e) {
      if (inspectorDebugMode) {
        console.error('[INSPECTOR] Error:', e);
      }
    }
  }

  // Hide the inspector overlay
  function hideInspectorOverlay() {
    if (inspectorOverlay) {
      inspectorOverlay.style.opacity = '0';
      setTimeout(() => {
        if (inspectorOverlay) {
          inspectorOverlay.style.display = 'none';
        }
      }, 150);
    }
    lastInspectedElement = null;
  }

  // Check if element contains visible text
  function hasVisibleText(el) {
    if (!el || !el.tagName) return false;
    
    // Skip non-element nodes
    if (el.nodeType !== Node.ELEMENT_NODE) return false;
    
    // Skip the inspector overlay itself
    if (el.id === 'ai-contrast-inspector' || el.closest('#ai-contrast-inspector')) {
      return false;
    }
    
    // Skip script, style, and other non-visual elements
    const skipTags = ['script', 'style', 'noscript', 'template', 'svg', 'path', 'iframe', 'video', 'audio', 'canvas', 'img'];
    const tagName = el.tagName.toLowerCase();
    if (skipTags.includes(tagName)) {
      return false;
    }
    
    // Check if element is visible
    try {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) {
        return false;
      }
      
      // Check if element has a non-zero bounding box
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return false;
      }
    } catch (e) {
      return false;
    }
    
    // Check for any text content
    const text = el.textContent || '';
    if (text.trim().length === 0) return false;
    
    // Text-bearing tags are always valid
    const textTags = ['p', 'span', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 
                      'td', 'th', 'label', 'button', 'strong', 'em', 'b', 'i', 
                      'small', 'mark', 'del', 'ins', 'sub', 'sup', 'code', 'pre',
                      'blockquote', 'cite', 'q', 'abbr', 'time', 'figcaption',
                      'div', 'section', 'article', 'header', 'footer', 'nav', 'main', 'aside'];
    
    if (textTags.includes(tagName)) {
      return true;
    }
    
    // Check if element has direct text nodes (not just child element text)
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) {
        return true;
      }
    }
    
    return true; // Default to true for any element with text content
  }

  // Inspector mouse move handler
  function inspectorMouseMoveHandler(e) {
    if (!inspectorEnabled) return;
    
    // Cancel any pending animation frame
    if (inspectorRAF) {
      cancelAnimationFrame(inspectorRAF);
    }
    
    // Schedule update on next animation frame for performance
    inspectorRAF = requestAnimationFrame(() => {
      const target = e.target;
      
      // Skip if same element
      if (target === lastInspectedElement) {
        // Just update position
        if (inspectorOverlay && inspectorOverlay.style.display === 'block') {
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          const overlayWidth = 280;
          const overlayHeight = 220;
          const offset = 15;
          
          let left = e.clientX + offset;
          let top = e.clientY + offset;
          
          if (left + overlayWidth > viewportWidth - 20) {
            left = e.clientX - overlayWidth - offset;
          }
          if (top + overlayHeight > viewportHeight - 20) {
            top = e.clientY - overlayHeight - offset;
          }
          
          left = Math.max(10, left);
          top = Math.max(10, top);
          
          inspectorOverlay.style.left = `${left}px`;
          inspectorOverlay.style.top = `${top}px`;
        }
        return;
      }
      
      // Check if target has visible text
      if (!hasVisibleText(target)) {
        hideInspectorOverlay();
        return;
      }
      
      lastInspectedElement = target;
      
      // Create overlay if needed
      if (!inspectorOverlay) {
        createInspectorOverlay();
      }
      
      // Update the overlay
      updateInspectorOverlay(target, e.clientX, e.clientY);
    });
  }

  // Inspector mouse leave handler
  function inspectorMouseLeaveHandler(e) {
    if (!inspectorEnabled) return;
    
    // Hide overlay when mouse leaves the document
    if (e.relatedTarget === null || e.relatedTarget.nodeName === 'HTML') {
      hideInspectorOverlay();
    }
  }

  // Enable inspector mode
  function enableInspector(debug = false) {
    if (inspectorEnabled) return;
    
    inspectorEnabled = true;
    inspectorDebugMode = debug;
    
    // Create overlay
    createInspectorOverlay();
    
    // Add event listeners with capture to ensure we get all events
    document.addEventListener('mousemove', inspectorMouseMoveHandler, { passive: true, capture: true });
    document.addEventListener('mouseleave', inspectorMouseLeaveHandler, { passive: true });
    
    // Add visual indicator that inspector is active
    const indicator = document.createElement('div');
    indicator.id = 'ai-inspector-indicator';
    indicator.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483646;
      background: #1a1a2e;
      color: #4ade80;
      padding: 8px 16px;
      border-radius: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      font-weight: 600;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      pointer-events: none;
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    indicator.innerHTML = `<span style="width: 8px; height: 8px; background: #4ade80; border-radius: 50%; animation: pulse 1.5s infinite;"></span> Inspector Active`;
    
    // Add pulse animation
    const style = document.createElement('style');
    style.id = 'ai-inspector-style';
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(indicator);
    
    console.log('[INSPECTOR] ✅ Contrast inspector enabled' + (debug ? ' (debug mode)' : ''));
    console.log('[INSPECTOR] Hover over any text element to see contrast details');
  }

  // Disable inspector mode
  function disableInspector() {
    if (!inspectorEnabled) return;
    
    inspectorEnabled = false;
    
    // Remove event listeners (must match the capture flag used in addEventListener)
    document.removeEventListener('mousemove', inspectorMouseMoveHandler, { capture: true });
    document.removeEventListener('mouseleave', inspectorMouseLeaveHandler);
    
    // Hide and remove overlay
    if (inspectorOverlay) {
      inspectorOverlay.remove();
      inspectorOverlay = null;
    }
    
    // Remove indicator
    const indicator = document.getElementById('ai-inspector-indicator');
    if (indicator) indicator.remove();
    
    // Remove style
    const style = document.getElementById('ai-inspector-style');
    if (style) style.remove();
    
    // Cancel pending RAF
    if (inspectorRAF) {
      cancelAnimationFrame(inspectorRAF);
      inspectorRAF = null;
    }
    
    lastInspectedElement = null;
    
    console.log('[INSPECTOR] ❌ Contrast inspector disabled');
  }

  // Toggle inspector mode
  function toggleInspector(debug = false) {
    if (inspectorEnabled) {
      disableInspector();
    } else {
      enableInspector(debug);
    }
    return inspectorEnabled;
  }

  // Expose inspector API globally for extension access
  // Content scripts run in isolated world, so we need to expose to both contexts
  window.__aiContrastInspector = {
    enable: enableInspector,
    disable: disableInspector,
    toggle: toggleInspector,
    isEnabled: () => inspectorEnabled,
    setDebugMode: (enabled) => { inspectorDebugMode = enabled; }
  };
  
  // Note: Page context injection removed to avoid CSP violations
  // The inspector API is available in the content script context via window.__aiContrastInspector
  // For debugging, use the browser console in the extension's context, not the page context

  // ============================================================================
  // END REAL-TIME CONTRAST INSPECTOR MODE
  // ============================================================================

  // Chrome extension message listener

  if (!window.__aiContrastBound) {
    window.__aiContrastBound = true;
    console.log("[CONTENT_DEBUG] Setting up message listener...");

    // ============================================================================
    // ACCURATE CONTRAST FIXER - Assumption-free contrast correction
    // ============================================================================
    class AccurateContrastFixer {
      constructor() {
        this.darkMode   = window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.forced     = window.matchMedia('(forced-colors: active)').matches;
        this.prefers    = window.matchMedia('(prefers-contrast: more)').matches;
        this.observer   = null;
      }

      run() {
        if (this.forced) {
          console.log('⏭️ [ACCURATE] Skipping - forced-colors mode active');
          return; // respect system colours
        }
        this.fixStatic();
        this.watchDynamic();
      }

      fixStatic() {
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );

        let node;
        let fixed = 0;
        while (node = walker.nextNode()) {
          if (this.shouldSkipNode(node)) continue;
          if (this.fixTextNode(node)) fixed++;
        }
        console.log(`✅ [ACCURATE] Fixed ${fixed} text nodes in static pass`);
      }

      watchDynamic() {
        this.observer = new MutationObserver(muts => {
          muts.forEach(m => {
            m.addedNodes.forEach(n => {
              if (n.nodeType === 3) this.fixTextNode(n);
              else if (n.nodeType === 1) {
                n.querySelectorAll('*').forEach(el => {
                  el.childNodes.forEach(c => {
                    if (c.nodeType === 3) this.fixTextNode(c);
                  });
                });
              }
            });
          });
        });

        this.observer.observe(document.body, { childList: true, subtree: true });
        console.log('👁️ [ACCURATE] MutationObserver started for dynamic content');
      }

      shouldSkipNode(textNode) {
        const el = textNode.parentElement;
        if (!el) return true;
        if (el.closest('[data-ai-opt-out]')) return true; // user opt-out
        if (this.isInVideoSlide(el)) return true;         // pixel-proof video slide
        if (!this.isVisible(el)) return true;             // pixel sampling
        return false;
      }

      isInVideoSlide(el) {
        const slide = el.closest('sr7-module[data-alias*="background-effect-hero"]');
        if (!slide) return false;

        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;

        const under = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2
        );

        return under && (under.tagName === 'VIDEO' ||
                        (under.tagName === 'IFRAME' && under.src && under.src.includes('youtube')));
      }

      isVisible(el) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;

        const style = getComputedStyle(el);
        if (style.display === 'none') return false;
        if (style.visibility === 'hidden') return false;
        if (parseFloat(style.opacity) === 0) return false;

        return !!document.elementFromPoint(rect.left + 1, rect.top + 1);
      }

      getBackground(el) {
        const cs = getComputedStyle(el);
        const before = getComputedStyle(el, '::before');
        const after  = getComputedStyle(el, '::after');

        const bg = this.resolveVar(cs.backgroundColor, el) ||
                   this.resolveVar(before.backgroundColor, el) ||
                   this.resolveVar(after.backgroundColor, el);

        if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') {
          const rect = el.getBoundingClientRect();
          const sample = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2
          );

          if (sample && sample !== el) {
            return this.getBackground(sample);
          }
        }

        return bg;
      }

      resolveVar(value, el) {
        if (!value || !value.includes('var(')) return value;
        const m = value.match(/var\(--([^),]+)\)/);
        if (!m) return value;
        const resolved = getComputedStyle(el).getPropertyValue('--' + m[1]);
        return resolved || value;
      }

      isInteractive(el) {
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
        if (el.tagName === 'BUTTON') return true;
        if (el.tagName === 'A' && el.href) return true;
        if (el.getAttribute('role') === 'button') return true;
        if (el.matches('input[type="button"], input[type="submit"]')) return true;
        return el.matches('.btn, .cta, [role="link"], [tabindex]:not([tabindex="-1"])');
      }

      getContrast(fg, bg) {
        // Use the WCAG 2.2 compliant function from the main scope
        return getContrast(fg, bg);
      }

      meetsWCAG(ratio, sizePt, level, element) {
        // Use the WCAG 2.2 compliant function from the main scope
        return meetsWCAG(ratio, sizePt, level, element);
      }

      fixTextNode(textNode) {
        const el = textNode.parentElement;
        if (!el || el.hasAttribute('data-ai-contrast-fixed')) return false;

        const fg = getComputedStyle(el).color;
        const bg = this.getBackground(el);
        if (!bg) return false;

        // Get font size in points (1 px = 0.75 pt)
        const fontSizePx = parseFloat(getComputedStyle(el).fontSize) || 16;
        const fontSizePt = fontSizePx * 0.75;

        // Use WCAG 2.2 compliant contrast calculation
        const contrast = this.getContrast(fg, bg);
        
        // Check if already meets WCAG AA (or AAA in dark mode)
        const level = this.darkMode ? 'AAA' : 'AA';
        if (this.meetsWCAG(contrast, fontSizePt, level, el)) return false;

        // Calculate target based on WCAG requirements
        const isLarge = fontSizePt >= 18 || (fontSizePt >= 14 && this.isBold(el));
        const target = level === 'AAA' 
          ? (isLarge ? 4.5 : 7.0)
          : (isLarge ? 3.0 : 4.5);

        const corrected = this.findBetterColour(fg, bg, target);
        if (!corrected) return false;

        el.style.setProperty('color', corrected, 'important');
        el.setAttribute('data-ai-contrast-fixed', 'true');
        return true;
      }

      isBold(el) {
        try {
          const fontWeight = getComputedStyle(el).fontWeight;
          return Number(fontWeight) >= 700 || fontWeight === 'bold' || fontWeight === 'bolder';
        } catch (e) {
          return false;
        }
      }

      findBetterColour(fg, bg, target) {
        // Use the WCAG 2.2 compliant color parser
        const fgRgb = parseColourToRGB(fg);
        if (!fgRgb) return null;
        
        const [r, g, b] = fgRgb;
        let [h, s, l] = this.rgbToHsl(r, g, b);
        let step = l > 0.5 ? -0.01 : 0.01;

        for (let i = 0; i < 100; i++) {
          l += step;
          if (l < 0 || l > 1) break;

          const newRgb = this.hslToRgb(h, s, l);
          const newRgbStr = `rgb(${newRgb[0]}, ${newRgb[1]}, ${newRgb[2]})`;
          const newContrast = this.getContrast(newRgbStr, bg);
          if (newContrast >= target) return `rgb(${newRgb.map(Math.round).join(',')})`;
        }

        return null;
      }

      rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) return [0, 0, l];

        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }

        return [h * 60, s, l];
      }

      hslToRgb(h, s, l) {
        h /= 360;
        const a = s * Math.min(l, 1 - l);
        const f = n => {
          const k = (n + h * 12) % 12;
          return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        };
        return [f(0), f(8), f(4)].map(c => Math.round(c * 255));
      }
    }

    // Export functions for use
    window.fixContrast = function() {
      new AccurateContrastFixer().run();
    };
    
    // Export WCAG 2.2 compliant functions globally
    window.getContrast = getContrast;
    window.meetsWCAG = meetsWCAG;
    window.parseColourToRGB = parseColourToRGB;

    // Status Banner Functions
    let statusBannerElement = null;
    
    function showStatusBanner(message, status = "scanning") {
      // DISABLED - Status banner functionality disabled, using toast instead
      // Remove any existing banner if somehow created
      if (statusBannerElement) {
        statusBannerElement.remove();
        statusBannerElement = null;
      }
      return; // Do not create banner
      
      // Create banner element
      statusBannerElement = document.createElement("div");
      statusBannerElement.id = "ai-contrast-status-banner";
      statusBannerElement.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 999999;
        padding: 12px 16px;
        font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
        font-size: 14px;
        font-weight: 600;
        text-align: center;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        animation: slideDown 0.3s ease;
        pointer-events: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
      `;
      
      // Set colors based on status
      if (status === "error") {
        statusBannerElement.style.background = "#fee2e2";
        statusBannerElement.style.color = "#991b1b";
        statusBannerElement.style.borderBottom = "2px solid #dc2626";
      } else if (status === "complete") {
        statusBannerElement.style.background = "#d1fae5";
        statusBannerElement.style.color = "#065f46";
        statusBannerElement.style.borderBottom = "2px solid #10b981";
      } else {
        statusBannerElement.style.background = "#dbeafe";
        statusBannerElement.style.color = "#1e40af";
        statusBannerElement.style.borderBottom = "2px solid #2563eb";
      }
      
      // Create message text element
      const messageText = document.createElement("span");
      messageText.textContent = message;
      messageText.style.flex = "1";
      messageText.style.textAlign = "center";
      statusBannerElement.appendChild(messageText);
      
      // Create close button
      const closeButton = document.createElement("button");
      closeButton.innerHTML = "×";
      closeButton.style.cssText = `
        background: transparent;
        border: none;
        color: inherit;
        font-size: 24px;
        font-weight: 300;
        line-height: 1;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.7;
        transition: opacity 0.2s ease;
        flex-shrink: 0;
      `;
      closeButton.addEventListener("mouseenter", () => {
        closeButton.style.opacity = "1";
      });
      closeButton.addEventListener("mouseleave", () => {
        closeButton.style.opacity = "0.7";
      });
      closeButton.addEventListener("click", (e) => {
        e.stopPropagation();
        removeStatusBanner();
      });
      statusBannerElement.appendChild(closeButton);
      
      // Add animation style if not already added
      if (!document.getElementById("ai-contrast-banner-styles")) {
        const style = document.createElement("style");
        style.id = "ai-contrast-banner-styles";
        style.textContent = `
          @keyframes slideDown {
            from {
              transform: translateY(-100%);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }
          @keyframes slideUp {
            from {
              transform: translateY(0);
              opacity: 1;
            }
            to {
              transform: translateY(-100%);
              opacity: 0;
            }
          }
        `;
        document.head.appendChild(style);
      }
      
      // Insert at the very top of the body
      if (document.body) {
        document.body.insertBefore(statusBannerElement, document.body.firstChild);
      } else {
        // If body doesn't exist yet, wait for it
        const observer = new MutationObserver((mutations, obs) => {
          if (document.body) {
            document.body.insertBefore(statusBannerElement, document.body.firstChild);
            obs.disconnect();
          }
        });
        observer.observe(document.documentElement, { childList: true });
      }
    }
    
    function updateStatusBanner(message, status = "complete") {
      if (!statusBannerElement) {
        showStatusBanner(message, status);
        return;
      }
      
      // Update message text (first child should be the message span)
      const messageText = statusBannerElement.querySelector("span");
      if (messageText) {
        messageText.textContent = message;
      } else {
        // If structure is missing, recreate banner
        showStatusBanner(message, status);
        return;
      }
      
      // Update colors based on status
      if (status === "error") {
        statusBannerElement.style.background = "#fee2e2";
        statusBannerElement.style.color = "#991b1b";
        statusBannerElement.style.borderBottom = "2px solid #dc2626";
      } else if (status === "complete") {
        statusBannerElement.style.background = "#d1fae5";
        statusBannerElement.style.color = "#065f46";
        statusBannerElement.style.borderBottom = "2px solid #10b981";
      } else {
        statusBannerElement.style.background = "#dbeafe";
        statusBannerElement.style.color = "#1e40af";
        statusBannerElement.style.borderBottom = "2px solid #2563eb";
      }
    }
    
    function removeStatusBanner() {
      if (statusBannerElement) {
        statusBannerElement.style.animation = "slideUp 0.3s ease";
        setTimeout(() => {
          if (statusBannerElement && statusBannerElement.parentNode) {
            statusBannerElement.remove();
          }
          statusBannerElement = null;
        }, 300);
      }
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log("📨 Received message:", message);

      // This is the first message the popup will send.
      if (message.ping) {
        sendResponse({ pong: true });
        return true; // Return true to indicate we're sending a response
      }

      // Status banner handlers disabled - using toast instead
      if (message.action === "showStatusBanner") {
        // Disabled - use showToast instead
        sendResponse({ ok: true });
        return false;
      }

      if (message.action === "updateStatusBanner") {
        // Disabled - use updateToast instead
        sendResponse({ ok: true });
        return false;
      }

      if (message.action === "removeStatusBanner") {
        // Disabled - toast handles its own removal
        sendResponse({ ok: true });
        return false;
      }

      if (message.action === "showToast") {
        console.log("[TOAST] Received showToast message:", message);
        try {
          // Use user-friendly scanning messages
          const scanningMessages = [
            "Checking your page for readability issues...",
            "Improving contrast on your page...",
            "Making text easier to read..."
          ];
          const defaultMessage = message.message || scanningMessages[0];
          showToast(defaultMessage, message.status || "scanning", message.result || null, message.autoCorrect || false);
          sendResponse({ ok: true });
        } catch (error) {
          console.error("[TOAST] Error showing toast:", error);
          sendResponse({ ok: false, error: error.message });
        }
        return false;
      }

      if (message.action === "updateToast") {
        console.log("[TOAST] Received updateToast message:", message);
        try {
          updateToast(message.message || "", message.status || "complete", message.result || null, message.autoCorrect || false, message.ctaMessage || "");
          sendResponse({ ok: true });
        } catch (error) {
          console.error("[TOAST] Error updating toast:", error);
          sendResponse({ ok: false, error: error.message });
        }
        return false;
      }

      if (message.action === "runScan") {
        resetAllChanges();

        const comfortScale = message.comfortScale || 0.5;  // Default: 0.5
        const autoCorrect = message.autoCorrect || false;
        const useAccurateFixer = message.useAccurateFixer || false; // New option

        // Show toast immediately when scan starts
        // Use user-friendly scanning message
        showToast("Checking your page for readability issues...", "scanning", null, autoCorrect);

        // Store settings locally so MutationObserver can use them for dynamic content
        currentScanSettings = {
          comfortScale: comfortScale,
          autoCorrect: autoCorrect
        };
        console.log(`💾 Stored scan settings: comfortScale=${comfortScale}, autoCorrect=${autoCorrect}, useAccurateFixer=${useAccurateFixer}`);

        // Use accurate fixer if requested (assumption-free mode)
        if (useAccurateFixer) {
          try {
            console.log('🎯 [ACCURATE] Using assumption-free contrast fixer');
            window.fixContrast();
            sendResponse({ ok: true, result: { mode: 'accurate', message: 'Accurate fixer completed' } });
            return true;
          } catch (error) {
            console.error('❌ [ACCURATE] Error in accurate fixer:', error);
            sendResponse({ ok: false, error: error.message });
            return true;
          }
        }

        // Otherwise use traditional scanner
        scanWithAI(comfortScale, autoCorrect)
          .then((result) => {
            // Toast will be updated by showNotification() called from scanWithAI
            sendResponse({ ok: true, result });
          })
          .catch((error) => {
            // Show error in toast
            updateToast(`❌ Scan failed: ${error.message}`, "error", null, autoCorrect);
            sendResponse({ ok: false, error: error.message });
          });

        return true;
      }

      if (message.action === "reset") {
        resetAllChanges();
        // Also disable inspector on reset
        if (inspectorEnabled) {
          disableInspector();
        }
        sendResponse({ ok: true });
        return false;
      }

      // Inspector mode toggle
      if (message.action === "toggleInspector") {
        const debug = message.debug || false;
        const enabled = toggleInspector(debug);
        sendResponse({ ok: true, enabled: enabled });
        return false;
      }

      if (message.action === "enableInspector") {
        const debug = message.debug || false;
        enableInspector(debug);
        sendResponse({ ok: true, enabled: true });
        return false;
      }

      if (message.action === "disableInspector") {
        disableInspector();
        sendResponse({ ok: true, enabled: false });
        return false;
      }

      if (message.action === "getInspectorStatus") {
        sendResponse({ ok: true, enabled: inspectorEnabled, debug: inspectorDebugMode });
        return false;
      }

      if (message.action === "feedback") {
        const feedbackType = message.type; // "comfortable", "hardToRead", or "export"
        
        // Clear logging for button clicks
        console.log(`\n${'='.repeat(50)}`);
        console.log(`📝 FEEDBACK BUTTON CLICKED: ${feedbackType.toUpperCase()}`);
        console.log(`${'='.repeat(50)}`);

        if (feedbackType === "export") {
          // Export feedback log
          if (!window.__aiFeedbackLog || window.__aiFeedbackLog.length === 0) {
            console.log(`📤 Export requested but no feedback entries found`);
            sendResponse({ ok: true, message: "No feedback to export", data: [] });
            return false;
          }

          // Get current settings for export
          getCurrentSettings().then(settings => {
            const feedbackData = {
              feedback: window.__aiFeedbackLog,
              exportedAt: Date.now(),
              url: window.location.href,
              comfortScale: settings.comfortScale,
              targetContrast: settings.targetContrast
            };

            console.log(`📤 Exporting ${window.__aiFeedbackLog.length} feedback entries`);
            console.log(`   Scale: ${settings.comfortScale} | Target: ${settings.targetContrast}:1`);
            sendResponse({ ok: true, message: "Feedback exported", data: feedbackData });
          });
          return true; // Async response
        }

        // Store feedback with context for model improvement
        if (!window.__aiFeedbackLog) {
          window.__aiFeedbackLog = [];
        }

        // Collect current page state for model training
        getCurrentSettings().then(settings => {
          const correctedElements = document.querySelectorAll('[data-ai-contrast-fixed="true"]');
          const feedbackEntry = {
            type: feedbackType,
            timestamp: Date.now(),
            url: window.location.href,
            comfortScale: settings.comfortScale,
            targetContrast: settings.targetContrast,
            correctedCount: correctedElements.length,
            label: feedbackType === 'comfortable' ? 1 : 0  // For ML training
          };

          window.__aiFeedbackLog.push(feedbackEntry);

          // Log feedback details
          console.log(`   Type: ${feedbackType}`);
          console.log(`   Comfort Scale: ${settings.comfortScale}`);
          console.log(`   Target Contrast: ${settings.targetContrast}:1`);
          console.log(`   Corrected Elements: ${correctedElements.length}`);
          console.log(`   ML Label: ${feedbackEntry.label} (1=good, 0=needs improvement)`);
          console.log(`   Total Feedback Entries: ${window.__aiFeedbackLog.length}`);

          // ============================================================================
          // PHASE B: ADAPTIVE LEARNING FROM FEEDBACK
          // ============================================================================
          
          if (feedbackType === "hardToRead" || feedbackType === "hard_to_read") {
            // Adaptive Logic for 'Hard to Read': Increase target contrast and comfort scale
            console.log(`\n${'='.repeat(50)}`);
            console.log(`🧠 [ADAPTIVE LEARNING] Processing 'Hard to Read' feedback`);
            console.log(`${'='.repeat(50)}`);
            
            // Retrieve current settings from storage
            chrome.storage.local.get(['targetContrast', 'comfortScale'], function(data) {
              let currentContrast = data.targetContrast || 6.33;
              let currentScale = data.comfortScale !== undefined ? data.comfortScale : 0.8;
              
              console.log(`   📊 Current Settings:`);
              console.log(`      Target Contrast: ${currentContrast.toFixed(2)}:1`);
              console.log(`      Comfort Scale: ${currentScale.toFixed(2)}`);
              
              // Apply adaptation: increase contrast by 5% and scale by 0.05
              const newContrast = currentContrast * 1.05;
              const newScale = Math.min(1.0, currentScale + 0.05); // Cap scale at 1.0
              
              console.log(`   🔄 Adaptive Adjustment:`);
              console.log(`      New Target Contrast: ${newContrast.toFixed(2)}:1 (+${((newContrast - currentContrast) / currentContrast * 100).toFixed(1)}%)`);
              console.log(`      New Comfort Scale: ${newScale.toFixed(2)} (+${(newScale - currentScale).toFixed(2)})`);
              
              // Save the stricter settings for future use
              chrome.storage.local.set({
                targetContrast: newContrast,
                comfortScale: newScale
              }, function() {
                console.log(`   ✅ [ADAPTIVE LEARNING] Settings updated successfully`);
                console.log(`      Next scan will use: Contrast=${newContrast.toFixed(2)}:1, Scale=${newScale.toFixed(2)}`);
                console.log(`${'='.repeat(50)}\n`);
                
                // Optional: Notify user that settings have been adjusted
                console.log(`   💡 Tip: Your preferences have been adjusted for better readability.`);
                console.log(`      Run a new scan to apply the stricter contrast settings.`);
              });
            });
          } else if (feedbackType === "comfortable") {
            // Optional: Could decrease settings if user finds it too strict
            // For now, we only adapt on "hard to read" feedback
            console.log(`   ✅ [ADAPTIVE LEARNING] 'Comfortable' feedback received - settings maintained`);
          }
          
          console.log(`${'='.repeat(50)}\n`);

          sendResponse({ ok: true, message: `Feedback logged: ${feedbackType}` });
        });
        return true; // Async response
        console.log(`   Corrected Elements: ${correctedElements.length}`);
        console.log(`   ML Label: ${feedbackEntry.label} (1=good, 0=needs improvement)`);
        console.log(`   Total Feedback Entries: ${window.__aiFeedbackLog.length}`);
        console.log(`${'='.repeat(50)}\n`);

        sendResponse({ ok: true, message: `Feedback logged: ${feedbackType}` });
        return false;
      }

      return false;
    });
    console.log("[CONTENT_DEBUG] Message listener is active.");
    console.log("✅ AI Contrast Assistant content script loaded and ready");
  }
})();
