/*********************************************************************
 * 0.  API  –  one line to replace your current scanner
 *********************************************************************/
export function fixContrast() {
  new AccurateContrastFixer().run();
}

/*********************************************************************
 * 1.  ACCURATE CONTRAST FIXER
 *********************************************************************/
class AccurateContrastFixer {
  constructor() {
    this.darkMode   = window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.forced     = window.matchMedia('(forced-colors: active)').matches;
    this.prefers    = window.matchMedia('(prefers-contrast: more)').matches;
    this.observer   = null;
  }

  run() {
    if (this.forced) return; // respect system colours
    this.fixStatic();
    this.watchDynamic();
  }

  /* --------------------------------------------------------------- */
  /* 2.  STATIC PASS  –  everything that exists now                 */
  /* --------------------------------------------------------------- */
  fixStatic() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while (node = walker.nextNode()) {
      if (this.shouldSkipNode(node)) continue;
      this.fixTextNode(node);
    }
  }

  /* --------------------------------------------------------------- */
  /* 3.  DYNAMIC WATCHER  –  future additions                       */
  /* --------------------------------------------------------------- */
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
  }

  /* --------------------------------------------------------------- */
  /* 4.  SKIP RULES  –  never guess, always ask                     */
  /* --------------------------------------------------------------- */
  shouldSkipNode(textNode) {
    const el = textNode.parentElement;
    if (!el) return true;
    if (el.closest('[data-ai-opt-out]')) return true; // user opt-out
    if (this.isInVideoSlide(el)) return true;         // pixel-proof video slide
    if (!this.isVisible(el)) return true;             // pixel sampling
    return false;
  }

  /* --------------------------------------------------------------- */
  /* 5.  VIDEO SLIDE  –  pixel sampling, no z-index magic           */
  /* --------------------------------------------------------------- */
  isInVideoSlide(el) {
    // Slider Revolution container – we **sample** the pixel under the text
    const slide = el.closest('sr7-module[data-alias*="background-effect-hero"]');
    if (!slide) return false;

    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;

    const under = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );

    // if the sampled element is a video or iframe we skip
    return under && (under.tagName === 'VIDEO' ||
                    (under.tagName === 'IFRAME' && under.src && under.src.includes('youtube')));
  }

  /* --------------------------------------------------------------- */
  /* 6.  VISIBLE  –  pixel sampling, no opacity guess               */
  /* --------------------------------------------------------------- */
  isVisible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    const style = getComputedStyle(el);
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity) === 0) return false;

    // sample one pixel – if nothing is returned, element is off-screen
    return !!document.elementFromPoint(rect.left + 1, rect.top + 1);
  }

  /* --------------------------------------------------------------- */
  /* 7.  BACKGROUND  –  real colour under the text                  */
  /* --------------------------------------------------------------- */
  getBackground(el) {
    // include pseudo-elements and CSS variables
    const cs = getComputedStyle(el);
    const before = getComputedStyle(el, '::before');
    const after  = getComputedStyle(el, '::after');

    // resolve CSS vars recursively
    const bg = this.resolveVar(cs.backgroundColor, el) ||
               this.resolveVar(before.backgroundColor, el) ||
               this.resolveVar(after.backgroundColor, el);

    // sample the pixel if still transparent
    if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') {
      const rect = el.getBoundingClientRect();
      const sample = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
      );

      if (sample && sample !== el) {
        return this.getBackground(sample); // climb up
      }
    }

    return bg;
  }

  resolveVar(value, el) {
    if (!value || !value.includes('var(')) return value;

    // crude but works for single-level vars
    const m = value.match(/var\(--([^),]+)\)/);
    if (!m) return value;

    const resolved = getComputedStyle(el).getPropertyValue('--' + m[1]);
    return resolved || value;
  }

  /* --------------------------------------------------------------- */
  /* 8.  INTERACTIVE  –  role / href / disabled, not tag name       */
  /* --------------------------------------------------------------- */
  isInteractive(el) {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    if (el.tagName === 'BUTTON') return true;
    if (el.tagName === 'A' && el.href) return true;
    if (el.getAttribute('role') === 'button') return true;
    if (el.matches('input[type="button"], input[type="submit"]')) return true;
    return el.matches('.btn, .cta, [role="link"], [tabindex]:not([tabindex="-1"])');
  }

  /* --------------------------------------------------------------- */
  /* 9.  CONTRAST  –  WCAG 2.1  (relative luminance)               */
  /* --------------------------------------------------------------- */
  getContrast(fg, bg) {
    const fgRgb = this.parseRgb(fg);
    const bgRgb = this.parseRgb(bg);
    if (!fgRgb || !bgRgb) return 21;

    const l1 = this.luminance(fgRgb);
    const l2 = this.luminance(bgRgb);
    const lighter = Math.max(l1, l2);
    const darker  = Math.min(l1, l2);

    return (lighter + 0.05) / (darker + 0.05);
  }

  luminance([r, g, b]) {
    const [rs, gs, bs] = [r, g, b].map(c => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }

  parseRgb(str) {
    const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m ? [+m[1], +m[2], +m[3]] : null;
  }

  /* --------------------------------------------------------------- */
  /* 10.  FIX  –  only normal state; hover is left to CSS           */
  /* --------------------------------------------------------------- */
  fixTextNode(textNode) {
    const el = textNode.parentElement;
    if (el.hasAttribute('data-ai-contrast-fixed')) return;

    const fg = getComputedStyle(el).color;
    const bg = this.getBackground(el);
    if (!bg) return;

    const contrast = this.getContrast(fg, bg);
    if (contrast >= 6.33) return; // already good

    const target = this.darkMode ? 7 : 6.33;
    const corrected = this.findBetterColour(fg, bg, target);
    if (!corrected) return;

    // apply normal state only – hover is untouched
    el.style.setProperty('color', corrected, 'important');
    el.setAttribute('data-ai-contrast-fixed', 'true');
  }

  findBetterColour(fg, bg, target) {
    // quick HSL walk: lighten/darken until contrast OK, keep hue
    const [r, g, b] = this.parseRgb(fg);
    let [h, s, l] = this.rgbToHsl(r, g, b);
    let step = l > 0.5 ? -0.01 : 0.01;

    for (let i = 0; i < 100; i++) {
      l += step;
      if (l < 0 || l > 1) break;

      const newRgb = this.hslToRgb(h, s, l);
      const newContrast = this.getContrast(newRgb, bg);
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


