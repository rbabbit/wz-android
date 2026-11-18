/* First-party layout only. Upstream renderer attribution: NOTICE.txt and LICENSE. */
(function () {
  "use strict";
  const compatibility = document.getElementById("compatibility");
  const panel = document.getElementById("replayBattlefieldPanel");
  const stage = panel.querySelector(".replay-battlefield-stage");
  const layout = panel.querySelector(".replay-battlefield-layout");
  const heading = panel.querySelector(".replay-battlefield-heading");
  const footer = panel.querySelector(".replay-battlefield-footer");
  const mapControls = panel.querySelector(".replay-battlefield-map-controls");
  const controls = document.createElement("div");
  controls.id = "replayCameraToolbar";
  controls.setAttribute("aria-label", "Replay camera controls");
  controls.append(document.getElementById("replayBattlefieldViewMode").closest("label"));
  controls.append(document.getElementById("replayBattlefieldTileQuality").closest("label"));
  controls.append(mapControls);
  panel.append(controls, footer);
  compatibility.append(heading);
  compatibility.append(layout.querySelector(".replay-battlefield-sidebar"));
  compatibility.append(document.getElementById("replayBattlefieldFullscreen"));
  compatibility.append(document.getElementById("replayBattlefieldStatus"));
  document.body.append(panel);
  panel.hidden = false;

  const overlay = document.createElement("div");
  overlay.id = "replayLoadOverlay";
  overlay.setAttribute("role", "status");
  const status = document.getElementById("replayStatus");
  status.textContent = "Loading replay…";
  const retry = document.createElement("button");
  retry.id = "replayRetry";
  retry.type = "button";
  retry.textContent = "TRY AGAIN";
  retry.hidden = true;
  overlay.append(status, retry);
  stage.append(overlay);
  function sync() {
    const error = status.classList.contains("replay-status-error");
    overlay.hidden = !status.textContent.trim();
    retry.hidden = !error;
  }
  new MutationObserver(sync).observe(status, { childList: true, subtree: true, attributes: true });
  sync();
  window.addEventListener("error", event => {
    if (event.target instanceof HTMLImageElement) return;
    status.textContent = "The replay could not be opened. Please try again.";
    status.classList.add("replay-status-error");
    sync();
  });
  window.HubReplay = { report: () => ({ version: 95, ready: false, loading: true, status: status.textContent }) };
})();
