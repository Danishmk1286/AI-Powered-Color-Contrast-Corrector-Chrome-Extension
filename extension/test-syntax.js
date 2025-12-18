// Test file to check syntax
(function () {
  console.log("Testing syntax");
  
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
  
  console.log("Syntax test passed");
})();