/**
 * PHA OAuth Helper - Background Service Worker
 *
 * Handles OAuth flow by:
 * 1. Opening Huawei OAuth page in new tab
 * 2. User completes login on Huawei page
 * 3. Huawei returns a page containing hms://redirect_url?code=xxx
 *    (in <a> link, <script> tag, or network request)
 * 4. We extract the code from DOM or network requests
 *    (browser doesn't support hms:// protocol, so no actual redirect)
 * 5. Return code to the requesting page
 */

// Store pending OAuth requests: tabId -> { sourceTabId, resolve, reject }
const pendingOAuth = new Map();

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PHA_OAUTH_START') {
    console.log('[PHA Extension] Received OAuth start request');
    handleOAuthStart(message, sender)
      .then(result => {
        console.log('[PHA Extension] OAuth completed:', result);
        sendResponse(result);
      })
      .catch(error => {
        console.error('[PHA Extension] OAuth error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }

  if (message.type === 'PHA_CODE_CAPTURED') {
    console.log('[PHA Extension] Code captured from injected script:', message.code?.slice(0, 10));
    handleCodeCaptured(sender.tab?.id, message.code);
  }
});

/**
 * Handle OAuth start request
 */
async function handleOAuthStart(message, sender) {
  const { authUrl } = message;
  const sourceTabId = sender.tab?.id;

  if (!authUrl) {
    throw new Error('Missing authUrl');
  }

  console.log('[PHA Extension] Opening OAuth URL:', authUrl.slice(0, 100));

  // Create new tab for OAuth
  const tab = await chrome.tabs.create({
    url: authUrl,
    active: true
  });

  // Create promise that will resolve when code is captured
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingOAuth.delete(tab.id);
      reject(new Error('OAuth timeout after 3 minutes'));
    }, 180000);

    pendingOAuth.set(tab.id, {
      sourceTabId,
      resolve: (code) => {
        clearTimeout(timeoutId);
        pendingOAuth.delete(tab.id);
        resolve({ success: true, code });
      },
      reject: (error) => {
        clearTimeout(timeoutId);
        pendingOAuth.delete(tab.id);
        reject(error);
      }
    });

    // Start monitoring this tab
    startMonitoring(tab.id);
  });
}

/**
 * Start monitoring a tab for OAuth code
 */
function startMonitoring(tabId) {
  // Inject monitoring script when page loads
  chrome.tabs.onUpdated.addListener(function listener(updatedTabId, changeInfo, tab) {
    if (updatedTabId !== tabId) return;

    if (changeInfo.status === 'complete') {
      injectMonitoringScript(tabId);
    }

    // Check URL for code
    if (tab.url) {
      const code = extractCodeFromUrl(tab.url);
      if (code) {
        console.log('[PHA Extension] Found code in tab URL');
        handleCodeCaptured(tabId, code);
        chrome.tabs.onUpdated.removeListener(listener);
      }
    }
  });
}

/**
 * Inject script to monitor for hms:// redirects
 */
async function injectMonitoringScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: monitorForHmsRedirect,
      world: 'MAIN' // Run in page context to intercept redirects
    });
    console.log('[PHA Extension] Monitoring script injected into tab', tabId);
  } catch (e) {
    console.log('[PHA Extension] Could not inject script:', e.message);
  }
}

/**
 * Script injected into OAuth page to extract code from hms:// URLs
 *
 * After user completes OAuth, Huawei's page contains hms://redirect_url?code=xxx
 * This can appear in:
 * - <a href="hms://..."> links in DOM
 * - <script> tags that try to redirect
 * - Dynamically added elements
 *
 * We extract the code since browser doesn't support hms:// protocol.
 * This runs in the page's context (MAIN world)
 */
function monitorForHmsRedirect() {
  if (window.__phaMonitorInstalled) return;
  window.__phaMonitorInstalled = true;

  console.log('[PHA] Installing redirect monitor...');

  const codePattern = /[?&]code=([^&]+)/;

  function sendCode(code) {
    console.log('[PHA] Sending code to extension...');
    // Send via custom event that content script can catch
    window.dispatchEvent(new CustomEvent('__pha_code_captured', {
      detail: { code }
    }));
  }

  function checkUrl(url) {
    if (!url) return null;
    const match = url.match(codePattern);
    return match ? decodeURIComponent(match[1]) : null;
  }

  // Monitor link clicks
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link?.href?.startsWith('hms://')) {
      const code = checkUrl(link.href);
      if (code) {
        e.preventDefault();
        sendCode(code);
      }
    }
  }, true);

  // Monitor DOM for hms:// links
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;

        // Check if it's an hms:// link
        if (node.tagName === 'A' && node.href?.startsWith('hms://')) {
          const code = checkUrl(node.href);
          if (code) {
            console.log('[PHA] Found hms:// link in DOM');
            sendCode(code);
          }
        }

        // Check child links
        if (node.querySelectorAll) {
          const links = node.querySelectorAll('a[href^="hms://"]');
          for (const link of links) {
            const code = checkUrl(link.href);
            if (code) {
              console.log('[PHA] Found hms:// link in added node');
              sendCode(code);
            }
          }
        }

        // Check scripts for hms:// URLs
        if (node.tagName === 'SCRIPT') {
          const text = node.textContent || '';
          const match = text.match(/hms:\/\/redirect_url\?[^"'\s]*code=([^"'\s&]+)/);
          if (match) {
            console.log('[PHA] Found code in script');
            sendCode(decodeURIComponent(match[1]));
          }
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // Also check current page for existing hms:// links
  const existingLinks = document.querySelectorAll('a[href^="hms://"]');
  for (const link of existingLinks) {
    const code = checkUrl(link.href);
    if (code) {
      console.log('[PHA] Found existing hms:// link');
      sendCode(code);
      break;
    }
  }

  console.log('[PHA] Redirect monitor installed');
}

/**
 * Also inject a content script to relay events from page to extension
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete' && pendingOAuth.has(tabId)) {
    // Inject relay script in ISOLATED world
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        window.addEventListener('__pha_code_captured', (e) => {
          chrome.runtime.sendMessage({
            type: 'PHA_CODE_CAPTURED',
            code: e.detail.code
          });
        });
      },
      world: 'ISOLATED'
    }).catch(() => {});
  }
});

/**
 * Monitor network requests for OAuth code
 */
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!pendingOAuth.has(details.tabId)) return;

    const code = extractCodeFromUrl(details.url);
    if (code) {
      console.log('[PHA Extension] Found code in network request:', details.url.slice(0, 50));
      handleCodeCaptured(details.tabId, code);
    }
  },
  { urls: ['<all_urls>'] }
);

/**
 * Monitor navigation errors (catches hms:// redirect attempts)
 * When browser tries to navigate to hms:// it will fail, but we can catch it
 */
chrome.webNavigation.onErrorOccurred.addListener((details) => {
  if (!pendingOAuth.has(details.tabId)) return;

  // Check if the failed URL contains our code
  const code = extractCodeFromUrl(details.url);
  if (code) {
    console.log('[PHA Extension] Found code in failed navigation:', details.url.slice(0, 50));
    handleCodeCaptured(details.tabId, code);
  }
});

/**
 * Also monitor successful navigations
 */
chrome.webNavigation.onCommitted.addListener((details) => {
  if (!pendingOAuth.has(details.tabId)) return;

  const code = extractCodeFromUrl(details.url);
  if (code) {
    console.log('[PHA Extension] Found code in navigation:', details.url.slice(0, 50));
    handleCodeCaptured(details.tabId, code);
  }
});

/**
 * Extract authorization code from URL
 */
function extractCodeFromUrl(url) {
  if (!url) return null;

  try {
    // Handle hms:// URLs
    if (url.startsWith('hms://')) {
      const match = url.match(/[?&]code=([^&]+)/);
      return match ? decodeURIComponent(match[1]) : null;
    }

    // Handle regular URLs
    const urlObj = new URL(url);
    const code = urlObj.searchParams.get('code');
    return code || null;
  } catch {
    // Try regex for malformed URLs
    const match = url.match(/[?&]code=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }
}

/**
 * Handle code captured from any source
 */
function handleCodeCaptured(tabId, code) {
  const pending = pendingOAuth.get(tabId);
  if (!pending) {
    console.log('[PHA Extension] No pending OAuth for tab', tabId);
    return;
  }

  console.log('[PHA Extension] Code captured for tab', tabId);

  // Close the OAuth tab
  chrome.tabs.remove(tabId).catch(() => {});

  // Resolve the promise
  pending.resolve(code);
}

/**
 * Clean up if OAuth tab is closed manually
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  const pending = pendingOAuth.get(tabId);
  if (pending) {
    pending.reject(new Error('OAuth tab closed by user'));
  }
});

console.log('[PHA Extension] Background service worker started');
