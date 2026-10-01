"use strict";

((app) => {
  function createPlayback(onTick, timers = window) {
    let timer = null;
    function stop() {
      if (timer === null) return;
      timers.clearInterval(timer);
      timer = null;
    }
    return Object.freeze({
      isPlaying: () => timer !== null,
      start() {
        if (timer !== null) return;
        timer = timers.setInterval(() => {
          if (onTick() === false) stop();
        }, app.config.PLAY_INTERVAL);
      },
      stop,
    });
  }

  app.playback = Object.freeze({ createPlayback });
})(window.KMeans);
