# PHA OAuth Helper - Browser Extension

This Chrome extension helps PHA complete Huawei Health OAuth authorization when the server is deployed remotely (not on localhost).

## Why is this needed?

Huawei Health OAuth uses a custom URL scheme (`hms://redirect_url`) for the callback, which cannot be captured by a regular web server. When running PHA locally, we use Chrome DevTools Protocol (CDP) to automate the browser and capture the authorization code. However, when PHA is deployed on a remote server, CDP cannot control your local browser.

This extension bridges that gap by:
1. Opening the OAuth page in your browser
2. Waiting for you to complete login
3. Extracting the authorization code from Huawei's response
   (Huawei returns `hms://redirect_url?code=xxx` in DOM/script,
   which browsers can't handle, so we extract it directly)
4. Sending the code back to the PHA web page

## Installation

### Method 1: Load Unpacked (Development)

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `browser-extension` folder from this repository

### Method 2: Chrome Web Store (Coming Soon)

We plan to publish this extension to the Chrome Web Store for easier installation.

## Usage

1. Install the extension
2. Open your PHA web interface (e.g., `http://your-server:8000`)
3. Click the "Connect Huawei Health" button
4. The extension will automatically:
   - Open the Huawei OAuth page in a new tab
   - Wait for you to log in and authorize
   - Capture the authorization code
   - Close the OAuth tab
   - Complete the authentication

## Permissions

The extension requires these permissions:

- `tabs` - To open and manage the OAuth tab
- `scripting` - To inject monitoring scripts into the OAuth page
- `webNavigation` - To monitor page navigation
- `webRequest` - To monitor network requests for the authorization code
- `<all_urls>` - To work with any PHA server URL and the Huawei OAuth pages

## Privacy

This extension:
- Only activates when you click "Connect Huawei Health" in PHA
- Only communicates with your PHA server
- Does not collect or transmit any personal data
- Does not track your browsing activity

## Troubleshooting

### Extension not detected

If PHA shows "Please install PHA browser extension":
1. Make sure the extension is installed and enabled
2. Refresh the PHA page
3. Check that the extension has permission for the PHA site

### OAuth timeout

If authentication times out:
1. Make sure you complete the Huawei login within 3 minutes
2. Check that popups are not blocked
3. Try disabling other extensions that might interfere

### Code not captured

If the OAuth page stays open after authorization:
1. Check the browser console for errors
2. Make sure the extension has permission for the Huawei OAuth domain
3. Try reinstalling the extension
