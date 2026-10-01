"use strict";

// One namespace keeps classic scripts usable even when index.html is opened directly.
window.KMeans = Object.create(null);
window.KMeans.config = Object.freeze({
  SVG_W: 820,
  SVG_H: 590,
  PAD: 48,
  MIN: -6,
  MAX: 6,
  DEFAULT_K: 2,
  CONVERGENCE_TOLERANCE: 0.04,
  HISTORY_LIMIT: 80,
  PLAY_INTERVAL: 1000,
  ERASER_RADIUS: 0.75,
  BURST_SIZE: 6,
});
