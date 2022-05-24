// Register initial google doc info upon tab loading complete
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  console.log(`A new tab is updated - tab id: ${tab.id}`);
  if (changeInfo.status === "complete") {
    const commitedUrl = tab.url;
    const sessionId = tab.sessionId;

    try {
      const googleDocId = getGoogleDocIdFromUrl(commitedUrl);
      if (googleDocId != "") {
        console.log(`Google Doc ID is ${googleDocId}`);
        bootstrapGoogleDocInfo(googleDocId, tabId, sessionId, commitedUrl);
        registerColorRequestListener(tabId);
      }
    } catch (error) {
      console.error(`Failed to get google doc ID - Error: ${error}`);
    }
  }
});

// Remove google page info when the tab is closed
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  const toDelete = getObjectKey(tabId);

  chrome.storage.local.get(null, (items) => {
    const keys = Object.keys(items);
    for (let idx = 0; idx < keys.length; idx++) {
      const key = keys[idx]
      const val = items[keys[idx]];

      if (key === toDelete) {
        chrome.storage.local.remove(key);
        console.log(`Tab ${tabId} is closed. Removed color info for Google Doc ${key}`);
        return;
      }
    }
  })
})

const KEY_PREFIX = "google_doc_tab"
const getObjectKey = tabId => `${KEY_PREFIX}:${tabId}`;

// bootstrap google doc info
const bootstrapGoogleDocInfo = (docId, tabId, sessionId, commitedUrl) => {
  chrome.storage.local.get(docId, items => {
    const docInfo = items[docId];
    if (docInfo != null) {
      console.log(`Google Doc ${docId} is already bootstrapped`);
      return;
    }
    const key = getObjectKey(tabId);
    chrome.storage.local.set({
      [key]: {
        docId,
        sessionId,
        tabId,
        url: commitedUrl,
        recentColorsFg: [],
        recentColorsBg: [],
        allColorsFg: [],
        allColorsBg: [],
      }
    });

    console.log(`Google Doc ${docId} on tab ${tabId} bootstrap complete`);
  });
}

// Get google doc ID from URL:
// e.g. https://docs.google.com/document/d/1XVamix3pBdF4MKv3nGOiqlbeQnKig9UyNtHEpk0OL9I/edit 
//      -> "1XVamix3pBdF4MKv3nGOiqlbeQnKig9UyNtHEpk0OL9I"
const getGoogleDocIdFromUrl = url => {
  const u = new URL(url);
  if (u.host != "docs.google.com") {
    console.log("Not a google doc url");
    return "";
  }
  const components = u.pathname.split("/")
  if (components.length >= 4) {
    if (components[1] === "document" && components[2] === "d") {
      return components[3];
    }
  }
  return "";
}

const foregroundColorRegex = /"ts_fgc":"(#[A-Fa-f0-9]{6}|[A-Fa-f0-9]{3}$)"/gm;
const backgroundColorRegex = /"ts_bgc":"(#[A-Fa-f0-9]{6}|[A-Fa-f0-9]{3}$)"/gm;

const getForegroundColor = (command) => {
  return getFirstRegexMatch(foregroundColorRegex, command);
}

const getBackgroundColor = (command) => {
 return getFirstRegexMatch(backgroundColorRegex, command);
}

const getFirstRegexMatch = (regex, str) => {
  const match = str.matchAll(regex);
  if (match != null) {
    const firstMatch = match.next();
    if (firstMatch === null || (firstMatch.value === undefined && firstMatch.done === true)) {
      return null;
    }
    return firstMatch.value[1];
  }
  return null;
}

const NUM_RECENT_COLORS_LIMIT = 20;

const registerColorRequestListener = (tabId) => {
  chrome.webRequest.onBeforeRequest.addListener(details => {
    const url = new URL(details.url);
    const components = url.pathname.split("/")
    if (details.method === "POST" && components[components.length - 1] === "save") {
      console.log("requestn sent! ", details);
      console.log(details.requestBody.formData);

      const commands = details.requestBody.formData.bundles;
      if (commands != null && commands != undefined) {
        const cmd = commands[0];
        const fgc = getForegroundColor(cmd);
        const bgc = getBackgroundColor(cmd);

        if (fgc != null) {
          saveRecentColor(tabId, FG_COLOR, fgc);
        }
        if (bgc != null) {
          saveRecentColor(tabId, BG_COLOR, bgc);
        }
      }
    }
  }, {
    urls: ["*://docs.google.com/document/d*"]
  }, [
    "requestBody"
  ]);
}


const FG_COLOR = "fgc";
const BG_COLOR = "bgc";

const saveRecentColor = (tabId, fgOrBg, color) => {
  const key = getObjectKey(tabId);
  chrome.storage.local.get(key, (res) => {
    if (res === null) {
      console.error(`Couldn't find saved doc info for key ${key}`)
      return;
    }

    const data = res[key];
    let recentColors = fgOrBg === FG_COLOR ? data.recentColorsFg : data.recentColorsBg;
    if (recentColors === null) {
      recentColors = [];
    }
    // Don't duplicate save
    if (recentColors.includes(color)) {
      return;
    }

    let newColors = [...recentColors];
    newColors.unshift(color);
    if (newColors.length > NUM_RECENT_COLORS_LIMIT) {
      newColors = newColors.slice(0, NUM_RECENT_COLORS_LIMIT);
    }

    const newData = fgOrBg === FG_COLOR ? {
      ...data,
      recentColorsFg: newColors,
    } : {
      ...data,
      recentColorsBg: newColors,
    };

    chrome.storage.local.set({ [key]: newData });
    console.log(`Saved recent color ${color} to ${fgOrBg} for doc ${newData.docId}. New colors list: ${newColors}`);
  });
}