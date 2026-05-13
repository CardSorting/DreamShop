/**
 * Options Page Logic
 */

const elements = {
  enableOverlay: document.querySelector("#enableOverlay"),
  enableContextMenu: document.querySelector("#enableContextMenu"),
  filenameFormat: document.querySelector("#filenameFormat"),
  saveButton: document.querySelector("#saveButton"),
  statusMessage: document.querySelector("#statusMessage")
};

// Load settings
document.addEventListener("DOMContentLoaded", async () => {
  const settings = await chrome.storage.local.get({
    enableOverlay: true,
    enableContextMenu: true,
    filenameFormat: "timestamp"
  });

  elements.enableOverlay.checked = settings.enableOverlay;
  elements.enableContextMenu.checked = settings.enableContextMenu;
  elements.filenameFormat.value = settings.filenameFormat;
});

// Save settings
elements.saveButton.addEventListener("click", async () => {
  const settings = {
    enableOverlay: elements.enableOverlay.checked,
    enableContextMenu: elements.enableContextMenu.checked,
    filenameFormat: elements.filenameFormat.value
  };

  await chrome.storage.local.set(settings);

  // Update context menu if changed
  if (!settings.enableContextMenu) {
    chrome.contextMenus.removeAll();
  } else {
    // Background script usually handles creation, but we can nudge it
    chrome.runtime.sendMessage({ action: "refresh-context-menu" });
  }

  showStatus("Settings saved successfully.");
});

function showStatus(msg) {
  elements.statusMessage.textContent = msg;
  elements.statusMessage.classList.add("visible");
  setTimeout(() => {
    elements.statusMessage.classList.remove("visible");
  }, 2000);
}
