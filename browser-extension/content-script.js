/**
 * PHA OAuth Helper - Content Script
 *
 * Bridges communication between PHA web page and the extension.
 * Injected into pages matching localhost/127.0.0.1 and https sites.
 */

// Listen for messages from the PHA web page
window.addEventListener('message', async (event) => {
  // Only accept messages from the same window
  if (event.source !== window) return;

  const message = event.data;

  // Handle OAuth start request from PHA frontend
  if (message?.type === 'PHA_OAUTH_START') {
    console.log('[PHA Content Script] Received OAuth start request');

    try {
      // Forward to background script
      const response = await chrome.runtime.sendMessage(message);

      // Send response back to page
      window.postMessage({
        type: 'PHA_OAUTH_RESULT',
        ...response
      }, '*');

      console.log('[PHA Content Script] OAuth result sent to page');
    } catch (error) {
      console.error('[PHA Content Script] Error:', error);
      window.postMessage({
        type: 'PHA_OAUTH_RESULT',
        success: false,
        error: error.message
      }, '*');
    }
  }

  // Handle extension check request
  if (message?.type === 'PHA_CHECK_EXTENSION') {
    window.postMessage({
      type: 'PHA_EXTENSION_STATUS',
      installed: true,
      version: chrome.runtime.getManifest().version
    }, '*');
  }
});

// Notify page that extension is available
window.postMessage({
  type: 'PHA_EXTENSION_READY',
  version: chrome.runtime.getManifest().version
}, '*');

console.log('[PHA Content Script] Loaded');
