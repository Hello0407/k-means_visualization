"use strict";

((app) => {
  function createController(root = document) {
    const elements = app.controls.getElements(root);
    const plot = elements.plot;
    const store = app.store.createStore();
    const view = app.plot.createPlotRenderer(plot);
    const controls = app.controls.createControlsRenderer(elements);
    const ui = { clickMode: "point", hoverWorld: null };
    const events = new AbortController();
    let frame = null;
    let sceneDirty = true;
    let controlsDirty = true;
    let erasingPointer = null;
    let disposed = false;

    const playback = app.playback.createPlayback(() => {
      store.dispatch({ type: "advance" });
      return app.simulation.canAdvance(store.getState());
    });

    function renderFrame() {
      frame = null;
      const state = store.getState();
      if (sceneDirty) view.renderScene(state);
      if (controlsDirty) controls.render(state, ui, store.canUndo(), playback.isPlaying());
      view.renderPreview(state, ui);
      sceneDirty = false;
      controlsDirty = false;
    }

    function scheduleRender(scene = false, buttons = false) {
      if (disposed) return;
      sceneDirty ||= scene;
      controlsDirty ||= buttons;
      if (frame === null) frame = requestAnimationFrame(renderFrame);
    }

    const unsubscribe = store.subscribe((state) => {
      if (!app.simulation.canAdvance(state)) playback.stop();
      scheduleRender(true, true);
    });

    function on(target, type, handler) {
      target.addEventListener(type, handler, { signal: events.signal });
    }

    function finishErasing(event) {
      if (erasingPointer === null || (event && event.pointerId !== erasingPointer)) return;
      const pointer = erasingPointer;
      erasingPointer = null;
      store.commitTransaction();
      if (plot.hasPointerCapture(pointer)) plot.releasePointerCapture(pointer);
    }

    function dispatch(action) {
      finishErasing();
      if (action.type !== "advance") playback.stop();
      store.dispatch(action);
      scheduleRender(false, true);
    }

    const actions = {
      autoPointsBtn: "generate",
      nextBtn: "advance",
      randomCentersBtn: "random-centers",
      clearCentersBtn: "clear-centers",
      clearPointsBtn: "clear-points",
    };
    for (const [id, type] of Object.entries(actions)) {
      on(elements[id], "click", () => {
        if (type === "clear-points") ui.hoverWorld = null;
        dispatch({ type });
      });
    }
    on(elements.backBtn, "click", () => {
      finishErasing();
      playback.stop();
      ui.hoverWorld = null;
      store.undo();
      scheduleRender(false, true);
    });
    on(elements.playBtn, "click", () => {
      finishErasing();
      if (playback.isPlaying()) playback.stop();
      else if (app.simulation.canAdvance(store.getState())) playback.start();
      scheduleRender(false, true);
    });
    on(elements.kInput, "change", (event) => dispatch({ type: "set-k", value: event.target.value }));
    for (const mode of ["point", "burst", "center", "erase"]) {
      on(elements[`${mode}ModeBtn`], "click", () => {
        finishErasing();
        ui.clickMode = mode;
        scheduleRender(false, true);
      });
    }

    on(plot, "pointermove", (event) => {
      if (erasingPointer !== null && event.pointerId !== erasingPointer) return;
      ui.hoverWorld = app.coordinates.eventToWorld(plot, event);
      if (erasingPointer !== null) store.dispatch({ type: "erase", point: ui.hoverWorld });
      if (ui.clickMode === "erase" || ui.clickMode === "center") scheduleRender();
    });
    on(plot, "pointerdown", (event) => {
      if (ui.clickMode !== "erase" || event.button !== 0 || erasingPointer !== null) return;
      event.preventDefault();
      playback.stop();
      erasingPointer = event.pointerId;
      ui.hoverWorld = app.coordinates.eventToWorld(plot, event);
      plot.setPointerCapture(event.pointerId);
      store.beginTransaction();
      store.dispatch({ type: "erase", point: ui.hoverWorld });
      scheduleRender(false, true);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) on(plot, type, finishErasing);
    on(plot, "pointerleave", () => {
      ui.hoverWorld = null;
      scheduleRender();
    });
    on(window, "blur", () => {
      finishErasing();
      playback.stop();
      ui.hoverWorld = null;
      scheduleRender(false, true);
    });
    on(plot, "click", (event) => {
      const types = { point: "add-point", burst: "add-burst", center: "add-center" };
      const type = types[ui.clickMode];
      if (type) dispatch({ type, point: app.coordinates.eventToWorld(plot, event) });
    });

    renderFrame();
    return Object.freeze({
      destroy() {
        if (disposed) return;
        finishErasing();
        disposed = true;
        playback.stop();
        unsubscribe();
        events.abort();
        if (frame !== null) cancelAnimationFrame(frame);
      },
    });
  }

  app.controller = Object.freeze({ createController });
})(window.KMeans);
