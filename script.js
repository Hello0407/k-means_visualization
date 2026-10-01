"use strict";

// Entry point: all state and subscriptions belong to this application instance.
(() => {
  const application = window.KMeans.controller.createController();
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) application.destroy();
  });
})();
