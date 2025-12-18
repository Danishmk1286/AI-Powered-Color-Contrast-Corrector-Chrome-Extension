/**
 * @fileoverview Background service worker for the AI Contrast Assistant.
 *
 * This script handles extension lifecycle events and manages all persistent state.
 * All state is stored here to prevent desynchronization between content scripts.
 */

console.log("[BACKGROUND] Service worker started.");

// ML model state (Service Worker-owned). No model is loaded in this build.
// This is intentionally kept out of persisted storage to avoid state migrations.
let mlModelLoaded = false;

// Default state values
const DEFAULT_STATE = {
  comfortScale: 0.5,
  targetContrast: 8.0, // 4.5 + 0.5 * 6.5 = 8.0
  autoCorrect: false,
  apiAvailable: null,
  modelReady: null,
  lastScanTimestamp: null
};

// Initialize state on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log(
      "[BACKGROUND] First-time installation. Setting default configuration."
    );
    // Set default configuration for the user on first install.
    chrome.storage.local.set({
      contrastAssistantConfig: {
        comfortScale: DEFAULT_STATE.comfortScale,
        autoCorrect: DEFAULT_STATE.autoCorrect,
      },
      contrastFeedbackLog: [], // Initialize feedback log
      contrastState: DEFAULT_STATE
    });
  } else if (details.reason === "update") {
    console.log(
      `[BACKGROUND] Extension updated from version ${
        details.previousVersion
      } to ${chrome.runtime.getManifest().version}.`
    );
    // Ensure state exists after update
    chrome.storage.local.get(['contrastState'], (result) => {
      if (!result.contrastState) {
        chrome.storage.local.set({ contrastState: DEFAULT_STATE });
      }
    });
  }
});

// Message handler for state management
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getMLModelStatus") {
    sendResponse({ ok: true, loaded: mlModelLoaded });
    return false;
  }

  if (message.action === "getCurrentSettings") {
    // Return all state in one object
    chrome.storage.local.get(['contrastState', 'contrastAssistantConfig'], (result) => {
      const state = result.contrastState || DEFAULT_STATE;
      const config = result.contrastAssistantConfig || {};
      
      // Calculate targetContrast from comfortScale if not set
      const comfortScale = config.comfortScale !== undefined ? config.comfortScale : state.comfortScale;
      const targetContrast = 4.5 + comfortScale * 6.5;
      
      const settings = {
        comfortScale: comfortScale,
        targetContrast: targetContrast,
        autoCorrect: config.autoCorrect !== undefined ? config.autoCorrect : state.autoCorrect,
        apiAvailable: state.apiAvailable,
        modelReady: state.modelReady,
        lastScanTimestamp: state.lastScanTimestamp
      };
      
      sendResponse({ ok: true, settings: settings });
    });
    return true; // Async response
  }
  
  if (message.action === "updateState") {
    // Update specific state fields
    chrome.storage.local.get(['contrastState'], (result) => {
      const currentState = result.contrastState || DEFAULT_STATE;
      const updatedState = { ...currentState, ...message.updates };
      
      // Recalculate targetContrast if comfortScale changed
      if (message.updates.comfortScale !== undefined) {
        updatedState.targetContrast = 4.5 + message.updates.comfortScale * 6.5;
      }
      
      chrome.storage.local.set({ contrastState: updatedState }, () => {
        sendResponse({ ok: true, state: updatedState });
      });
    });
    return true; // Async response
  }
  
  return false;
});
