// Extract test to isolate the issue
(function () {
  // Previous function ends here
  function adjustColorToContrast(fgRGB, bgRGB, targetRatio, options = {}) {
    // ... simplified implementation
    return fgRGB;
  }

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
  
  console.log("Extract test passed");
})();