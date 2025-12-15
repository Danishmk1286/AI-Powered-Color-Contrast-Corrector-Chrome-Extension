// --------------------------------------------------------------------------
// AI Contrast Assistant - Popup Controller (Updated)
// --------------------------------------------------------------------------

// Profile Selection Elements
const profileSelectionView = document.getElementById("profileSelectionView");
const mainView = document.getElementById("mainView");
const btnBackToProfiles = document.getElementById("btnBackToProfiles");
const profileItems = document.querySelectorAll(".profile-item");

// Main Extension Elements
const btnScan = document.getElementById("btnScan");
const btnReset = document.getElementById("btnReset");
const comfortSlider = document.getElementById("comfortScale");
const comfortValue = document.getElementById("comfortValue");
const autoCorrectToggle = document.getElementById("autoCorrect");
const status = document.getElementById("status");
const feedbackStatus = document.getElementById("feedbackStatus");
const loadingOverlay = document.getElementById("loadingOverlay");

// Profile Management
const PROFILE_STORAGE_KEY = "userProfile";

// Content Script Detection Constants
const CONTENT_SCRIPT_PING_DELAY_MS = 200;
const CONTENT_SCRIPT_MAX_RETRIES = 5;

// --------------------------------------------------------------------------
// PROFILE SELECTION LOGIC
// --------------------------------------------------------------------------

async function initializeProfileView() {
  try {
    const result = await chrome.storage.local.get([PROFILE_STORAGE_KEY]);
    const selectedProfile = result[PROFILE_STORAGE_KEY];
    if (selectedProfile) {
      showMainView();
    } else {
      showProfileSelection();
    }
  } catch (error) {
    console.error("Error checking profile:", error);
    showProfileSelection();
  }
}

function showProfileSelection() {
  profileSelectionView.style.display = "block";
  mainView.style.display = "none";
  profileSelectionView.classList.add("view-visible");
  mainView.classList.remove("view-visible");
  mainView.classList.add("view-hidden");
}

function showMainView() {
  profileSelectionView.style.display = "none";
  mainView.style.display = "block";
  profileSelectionView.classList.remove("view-visible");
  profileSelectionView.classList.add("view-hidden");
  mainView.classList.remove("view-hidden");
  mainView.classList.add("view-visible");
  // The content script will be injected on-demand by user actions (scan/reset).
  // Set a ready status by default.
  status.textContent = "✅ Ready to scan";
  status.style.color = "#10b981";
}

// --------------------------------------------------------------------------
// PROFILE SELECTION
// --------------------------------------------------------------------------

async function selectProfile(profileId) {
  console.log("[HOVER] Profile selected:", profileId);
  if (profileId === "low_vision") {
    try {
      await chrome.storage.local.set({ [PROFILE_STORAGE_KEY]: profileId });
      console.log("Profile selected:", profileId);
      showMainView();
    } catch (error) {
      console.error("[UI] Error saving profile:", error);
      console.error("[UI] Stack trace:", error.stack);
      console.error("Error saving profile:", error);
    }
  } else {
    console.log("Profile not yet available:", profileId);
  }
}

async function goBackToProfiles() {
  try {
    await chrome.storage.local.remove([PROFILE_STORAGE_KEY]);
    console.log("Profile selection cleared");
    showProfileSelection();
  } catch (error) {
    console.error("Error clearing profile:", error);
    showProfileSelection();
  }
}

if (profileItems && profileItems.length > 0) {
  profileItems.forEach((item) => {
    item.addEventListener("click", () => {
      if (!item.disabled) {
        const profileId = item.getAttribute("data-profile");
        selectProfile(profileId);
      }
    });
  });
}

if (btnBackToProfiles) {
  btnBackToProfiles.addEventListener("click", goBackToProfiles);
}

// --------------------------------------------------------------------------
// COMFORT SCALE DISPLAY
// --------------------------------------------------------------------------

comfortSlider.addEventListener("input", () => {
  const value = parseFloat(comfortSlider.value);
  comfortValue.textContent = value.toFixed(1);
  // Improved progressive function for better visual variation across comfort scale
  // Lower scales (0.1-0.3): Much lighter, more readable colors (3.5-4.5:1) - minimal darkening
  // Medium scales (0.4-0.6): Moderate colors (5.0-7.0:1) - balanced adjustment
  // High scales (0.7-0.9): Strong contrast (8.0-10.0:1) - more aggressive darkening
  // Maximum (1.0): Maximum contrast (11.0:1) - darkest colors
  // This ensures visible differences in text appearance across scale levels
  let target;
  if (value <= 0.3) {
    // Low sensitivity: Minimal darkening, preserve brand colors
    target = 3.5 + value * 3.33;
  } else if (value <= 0.6) {
    // Medium sensitivity: Balanced adjustment
    target = 3.0 + value * 6.67;
  } else if (value <= 0.9) {
    // High sensitivity: Strong contrast
    target = 2.0 + value * 8.89;
  } else {
    // Maximum sensitivity: Darkest colors for maximum contrast
    target = 11.0;
  }
  const targetDisplay = document.getElementById("targetContrast");
  if (targetDisplay) {
    targetDisplay.textContent = `Target: ${target.toFixed(2)}:1`;
  }
});

/**
 * A promise-based function to ensure the content script is ready.
 * It will ping the script, inject it if necessary, and retry.
 * Resolves when the script is ready, rejects on failure.
 */
function ensureContentScriptReady() {
  return new Promise((resolve, reject) => {
    const MAX_RETRIES = 5;
    const INITIAL_DELAY = 200;
    console.log("[POPUP_DEBUG] Starting ensureContentScriptReady.");

    const attempt = (retryCount) => {
      console.log(`[POPUP_DEBUG] Attempt #${retryCount + 1}`);
      if (retryCount >= MAX_RETRIES) {
        console.error("[POPUP_DEBUG] Max retries reached. Rejecting.");
        return reject(
          //
          new Error("Content script not responding after all retries.")
        );
      }

      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (!tab || chrome.runtime.lastError) {
          return reject(new Error("Unable to get active tab."));
          console.error("[POPUP_DEBUG] Could not get active tab.");
        }

        // Don't inject on special browser pages
        const url = tab.url || "";
        if (
          url.startsWith("chrome://") ||
          url.startsWith("edge://") ||
          url.startsWith("about:")
        ) {
          console.error("[POPUP_DEBUG] Invalid page for injection.");
          return reject(new Error("Cannot run on this page."));
        }

        console.log("[POPUP_DEBUG] Sending ping to content script...");
        chrome.tabs.sendMessage(tab.id, { ping: true }, (response) => {
          if (response && response.pong) {
            console.log("[POPUP] Content script is ready (pong received).");
            return resolve(true);
          }

          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message;
            console.warn(
              `[POPUP] Ping failed (attempt ${retryCount + 1}): ${errorMsg}`
            );

            // If no receiving end, inject the script.
            if (errorMsg.includes("Could not establish connection")) {
              console.log(
                "[POPUP_DEBUG] No receiving end. Injecting content script..."
              );
              chrome.scripting
                .executeScript({
                  target: { tabId: tab.id },
                  files: ["content.js"],
                })
                .then(() => {
                  console.log(
                    "[POPUP_DEBUG] Injection successful. Retrying ping..."
                  );
                  // Wait a moment for the script to initialize before retrying
                  setTimeout(() => attempt(retryCount + 1), 100);
                })
                .catch((injectionError) => {
                  console.error(
                    "[POPUP_DEBUG] Injection failed.",
                    injectionError
                  );
                  reject(
                    new Error(
                      `Script injection failed: ${injectionError.message}`
                    )
                  );
                });
            } else {
              // Other error, retry with backoff
              console.warn(
                "[POPUP_DEBUG] Other error, retrying with backoff..."
              );
              const delay = INITIAL_DELAY * Math.pow(2, retryCount);
              setTimeout(() => attempt(retryCount + 1), delay);
            }
          } else {
            // No error but no response, retry.
            console.warn("[POPUP_DEBUG] No response and no error. Retrying...");
            const delay = INITIAL_DELAY * Math.pow(2, retryCount);
            setTimeout(() => attempt(retryCount + 1), delay);
          }
        });
      });
    };

    attempt(0);
  });
}
// --------------------------------------------------------------------------
// SCAN PAGE
// --------------------------------------------------------------------------

btnScan.addEventListener("click", async () => {
  // Use current UI values (which are loaded from saved settings)
  const comfortScale = parseFloat(comfortSlider.value);
  const autoCorrect = autoCorrectToggle.checked;
  
  // Ensure settings are saved before scanning
  await saveSettings();
  
  status.textContent = "🔄 Running AI contrast scan...";
  btnScan.disabled = true;
  
  // Show loading overlay immediately
  if (loadingOverlay) {
    loadingOverlay.classList.add("active");
  }

  try {
    // Step 1: Ensure the content script is ready before sending the command.
    await ensureContentScriptReady();

    // Step 2: Get the active tab and send the runScan message.
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    
    // Send message to show toast with scanning state (user-friendly message)
    chrome.tabs.sendMessage(
      tab.id,
      { action: "showToast", status: "scanning", message: "Checking your page for readability issues..." },
      () => {
        // Ignore errors - toast might not be injectable on some pages
        if (chrome.runtime.lastError) {
          console.log("Could not show toast:", chrome.runtime.lastError.message);
        }
      }
    );
    
    chrome.tabs.sendMessage(
      tab.id,
      { action: "runScan", comfortScale, autoCorrect },
      (res) => {
        // Hide loading overlay
        if (loadingOverlay) {
          loadingOverlay.classList.remove("active");
        }
        
        // Update toast with final results (user-friendly messages)
        let toastMessage = "";
        let toastStatus = "complete";
        let result = null;
        let ctaMessage = "";
        
        if (chrome.runtime.lastError) {
          status.textContent = `❌ Error: ${chrome.runtime.lastError.message}`;
          status.style.color = "#ef4444";
          toastMessage = `❌ Error: ${chrome.runtime.lastError.message}`;
          toastStatus = "error";
        } else if (res?.ok && res.result) {
          result = res.result;
          const { flagged = 0, corrected = 0, total = 0 } = res.result;
          if (flagged === 0) {
            status.textContent = `✅ All elements meet the threshold!`;
            toastMessage = "✓ Your page is now easier to read";
          } else if (autoCorrect) {
            status.textContent = `✨ Readability adjustments complete`;
            if (corrected > 0) {
              toastMessage = "✓ Readability adjustments complete";
              ctaMessage = "Notice anything still hard to read? Click 'Hard to Read' in the extension to help us improve.";
              btnReset.style.display = "block";
            } else {
              toastMessage = "✓ Checked your page";
              ctaMessage = "Some elements couldn't be adjusted automatically. Click 'Hard to Read' in the extension to report issues.";
            }
          } else {
            status.textContent = `⚠️ Found readability issues`;
            toastMessage = "✓ Checked your page";
            ctaMessage = "Found some readability issues. Enable auto-correct to fix them automatically.";
          }
          status.style.color = "#10b981";
        } else {
          status.textContent = `❌ Scan failed: ${
            res?.error || "Unknown error"
          }`;
          status.style.color = "#ef4444";
          toastMessage = `❌ Scan failed: ${res?.error || "Unknown error"}`;
          toastStatus = "error";
        }
        
        // Update toast with final results
        chrome.tabs.sendMessage(
          tab.id,
          { action: "updateToast", status: toastStatus, message: toastMessage, result: result, autoCorrect: autoCorrect, ctaMessage: ctaMessage },
          () => {
            if (chrome.runtime.lastError) {
              console.log("Could not update toast:", chrome.runtime.lastError.message);
            }
          }
        );
      }
    );
  } catch (error) {
    // Hide loading overlay on error
    if (loadingOverlay) {
      loadingOverlay.classList.remove("active");
    }
    
    btnScan.disabled = false;
    status.textContent = "❌ Error: " + error.message;
    status.style.color = "#ef4444";
    
    // Try to show error in toast
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      chrome.tabs.sendMessage(
        tab.id,
        { action: "updateToast", status: "error", message: `❌ Error: ${error.message}` },
        () => {
          if (chrome.runtime.lastError) {
            console.log("Could not show error toast:", chrome.runtime.lastError.message);
          }
        }
      );
    } catch (e) {
      // Ignore toast errors
    }
  } finally {
    // Re-enable the button after a short delay to prevent spamming
    setTimeout(() => {
      btnScan.disabled = false;
    }, 1000);
  }
});

// --------------------------------------------------------------------------
// RESET CHANGES
// --------------------------------------------------------------------------

btnReset.addEventListener("click", async () => {
  status.textContent = "🔄 Resetting all changes...";
  btnReset.disabled = true;

  try {
    await ensureContentScriptReady(); // Ensure script is ready before sending message.

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    chrome.tabs.sendMessage(tab.id, { action: "reset" }, (res) => {
      btnReset.disabled = false;
      if (chrome.runtime.lastError) {
        status.style.color = "#ef4444";
        status.textContent = "❌ Content script not loaded.";
        return;
      }

      if (res?.ok) {
        status.textContent = "✅ All changes reset successfully.";
        status.style.color = "#10b981";
        btnReset.style.display = "none";
      } else {
        status.textContent = "✅ Reset complete.";
        status.style.color = "#10b981";
        btnReset.style.display = "none";
      }
    });
  } catch (error) {
    btnReset.disabled = false;
    status.textContent = "❌ Error: " + error.message;
    status.style.color = "#ef4444";
  }
});

// --------------------------------------------------------------------------
// FEEDBACK BUTTONS
// --------------------------------------------------------------------------

async function sendFeedback(type, msg, emoji) {
  feedbackStatus.textContent = `${emoji} ${msg}`;

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (type === "comfortable" || type === "hardToRead") {
      chrome.tabs.sendMessage(tab.id, { action: "feedback", type }, (res) => {
        if (chrome.runtime.lastError) {
          console.log(
            "Could not send feedback to content script:",
            chrome.runtime.lastError.message
          );
        } else if (res?.ok) {
          console.log("Feedback sent successfully");
        }
      });
    }
  } catch (error) {
    console.error("Error sending feedback:", error);
  }

  setTimeout(() => (feedbackStatus.textContent = ""), 3000);
}

document.getElementById("btnComfortable").addEventListener("click", () => {
  sendFeedback("comfortable", "Feedback saved: Comfortable", "✅");
});

document.getElementById("btnHardToRead").addEventListener("click", () => {
  sendFeedback("hardToRead", "Feedback saved: Hard to read", "⚠️");
});

document
  .getElementById("btnExportFeedback")
  .addEventListener("click", async () => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      chrome.tabs.sendMessage(
        tab.id,
        { action: "feedback", type: "export" },
        (res) => {
          if (chrome.runtime.lastError) {
            feedbackStatus.textContent = "⚠️ Could not export feedback";
            feedbackStatus.style.color = "#ef4444";
          } else {
            feedbackStatus.textContent = "📤 Feedback exported";
            feedbackStatus.style.color = "#10b981";
          }
          setTimeout(() => (feedbackStatus.textContent = ""), 3000);
        }
      );
    } catch (error) {
      feedbackStatus.textContent = "❌ Error exporting feedback";
      feedbackStatus.style.color = "#ef4444";
      setTimeout(() => (feedbackStatus.textContent = ""), 3000);
    }
  });

// --------------------------------------------------------------------------
// PHASE A: PERSISTENT SETTINGS STORAGE
// --------------------------------------------------------------------------

/**
 * Load saved settings from chrome.storage.local and populate UI
 * Uses research paper defaults if no settings found
 */
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['comfortScale', 'targetContrast', 'autoCorrect']);
    
    // Research paper defaults: comfortScale: 0.8, targetContrast: 6.33
    const comfortScale = result.comfortScale !== undefined ? result.comfortScale : 0.8;
    const autoCorrect = result.autoCorrect !== undefined ? result.autoCorrect : true;
    
    // Populate UI fields
    if (comfortSlider) {
      comfortSlider.value = comfortScale;
      comfortValue.textContent = comfortScale.toFixed(1);
      
      // Calculate and display target contrast
      let target;
      if (comfortScale <= 0.3) {
        target = 3.5 + comfortScale * 3.33;
      } else if (comfortScale <= 0.6) {
        target = 3.0 + comfortScale * 6.67;
      } else if (comfortScale <= 0.9) {
        target = Math.min(2.0 + comfortScale * 8.89, 7.0);
      } else {
        target = 7.0;
      }
      
      const targetDisplay = document.getElementById("targetContrast");
      if (targetDisplay) {
        targetDisplay.textContent = `Target: ${target.toFixed(2)}:1`;
      }
    }
    
    if (autoCorrectToggle) {
      autoCorrectToggle.checked = autoCorrect;
    }
    
    console.log(`[POPUP] Settings loaded: comfortScale=${comfortScale}, autoCorrect=${autoCorrect}`);
  } catch (error) {
    console.error("[POPUP] Error loading settings:", error);
    // Use defaults on error
    if (comfortSlider) comfortSlider.value = 0.8;
    if (autoCorrectToggle) autoCorrectToggle.checked = true;
  }
}

/**
 * Save current UI settings to chrome.storage.local
 */
async function saveSettings() {
  try {
    const comfortScale = parseFloat(comfortSlider.value);
    const autoCorrect = autoCorrectToggle.checked;
    
    // Calculate target contrast from comfort scale
    let targetContrast;
    if (comfortScale <= 0.3) {
      targetContrast = 3.5 + comfortScale * 3.33;
    } else if (comfortScale <= 0.6) {
      targetContrast = 3.0 + comfortScale * 6.67;
    } else if (comfortScale <= 0.9) {
      targetContrast = Math.min(2.0 + comfortScale * 8.89, 7.0);
    } else {
      targetContrast = 7.0;
    }
    
    await chrome.storage.local.set({
      comfortScale: comfortScale,
      targetContrast: targetContrast,
      autoCorrect: autoCorrect
    });
    
    console.log(`[POPUP] Settings saved: comfortScale=${comfortScale}, targetContrast=${targetContrast.toFixed(2)}, autoCorrect=${autoCorrect}`);
  } catch (error) {
    console.error("[POPUP] Error saving settings:", error);
  }
}

// Save settings when comfort slider changes
comfortSlider.addEventListener("input", () => {
  const value = parseFloat(comfortSlider.value);
  comfortValue.textContent = value.toFixed(1);
  // Improved progressive function for better visual variation across comfort scale
  // Lower scales (0.1-0.3): Much lighter, more readable colors (3.5-4.5:1) - minimal darkening
  // Medium scales (0.4-0.6): Moderate colors (5.0-7.0:1) - balanced adjustment
  // High scales (0.7-0.9): Strong contrast (8.0-10.0:1) - more aggressive darkening
  // Maximum (1.0): Maximum contrast (11.0:1) - darkest colors
  // This ensures visible differences in text appearance across scale levels
  let target;
  if (value <= 0.3) {
    // Low sensitivity: Minimal darkening, preserve brand colors
    target = 3.5 + value * 3.33;
  } else if (value <= 0.6) {
    // Medium sensitivity: Balanced adjustment
    target = 3.0 + value * 6.67;
  } else if (value <= 0.9) {
    // High sensitivity: Strong contrast
    target = Math.min(2.0 + value * 8.89, 7.0);
  } else {
    // Maximum sensitivity: Capped at WCAG AAA standard (7.0:1)
    target = 7.0;
  }
  const targetDisplay = document.getElementById("targetContrast");
  if (targetDisplay) {
    targetDisplay.textContent = `Target: ${target.toFixed(2)}:1`;
  }
  
  // Save settings when slider changes
  saveSettings();
});

// Save settings when auto-correct toggle changes
autoCorrectToggle.addEventListener("change", () => {
  saveSettings();
});

// --------------------------------------------------------------------------
// INITIALIZATION
// --------------------------------------------------------------------------

window.addEventListener("DOMContentLoaded", async () => {
  await initializeProfileView();
  // Load saved settings after profile view is initialized
  await loadSettings();
});
