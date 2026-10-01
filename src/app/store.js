"use strict";

((app) => {
  const { HISTORY_LIMIT, ERASER_RADIUS, MIN, MAX } = app.config;
  const { resetSimulation, createSimulation, advance } = app.simulation;
  const { clamp, normalizeK, generateRandomPoints, randomCenters, nextPointId, createBurst } = app.data;
  const { squaredDistance } = app.kmeans;
  const renumber = (centers) => centers.map((center, index) => ({ ...center, id: `C${index + 1}` }));

  function reduce(state, action, random) {
    switch (action.type) {
      case "advance":
        return advance(state);
      case "generate":
        return resetSimulation({ ...state, points: generateRandomPoints(state.k, random), centers: [] });
      case "random-centers":
        return state.points.length
          ? resetSimulation({ ...state, centers: randomCenters(state.points, state.k, random) }) : state;
      case "clear-centers":
        return state.centers.length ? resetSimulation({ ...state, centers: [] }) : state;
      case "clear-points":
        return state.points.length || state.centers.length ? createSimulation(state.k) : state;
      case "set-k": {
        const k = normalizeK(action.value, state.k);
        return k === state.k ? state : resetSimulation({ ...state, k, centers: state.centers.slice(0, k) });
      }
      case "add-point":
      case "add-burst":
      case "add-center":
      case "erase": {
        if (!action.point || !Number.isFinite(action.point.x) || !Number.isFinite(action.point.y)) return state;
        const point = { x: clamp(action.point.x, MIN, MAX), y: clamp(action.point.y, MIN, MAX) };
        if (action.type === "add-point") {
          return resetSimulation({ ...state, points: [...state.points, { id: nextPointId(state.points), ...point }] });
        }
        if (action.type === "add-burst") {
          return resetSimulation({ ...state, points: [...state.points, ...createBurst(point, nextPointId(state.points), random)] });
        }
        if (action.type === "add-center") {
          return state.centers.length >= state.k ? state : resetSimulation({
            ...state, centers: [...state.centers, { id: `C${state.centers.length + 1}`, ...point }],
          });
        }
        const points = state.points.filter((item) => squaredDistance(item, point) > ERASER_RADIUS ** 2);
        const centers = state.centers.filter((item) => squaredDistance(item, point) > ERASER_RADIUS ** 2);
        if (points.length === state.points.length && centers.length === state.centers.length) return state;
        return resetSimulation({ ...state, points, centers: renumber(centers) });
      }
      default:
        throw new Error(`Unknown action: ${action.type}`);
    }
  }

  function createStore({ random = Math.random, historyLimit = HISTORY_LIMIT } = {}) {
    let state = createSimulation();
    let transactionStart = null;
    const history = [];
    const listeners = new Set();
    const notify = () => listeners.forEach((listener) => listener(state));

    function remember(previous) {
      history.push(previous);
      if (history.length > historyLimit) history.shift();
    }

    function commitTransaction() {
      if (transactionStart === null) return;
      const previous = transactionStart;
      transactionStart = null;
      if (state !== previous) {
        remember(previous);
        notify();
      }
    }

    return Object.freeze({
      // Consumers only read snapshots. All writes go through dispatch/undo.
      getState: () => state,
      canUndo: () => history.length > 0,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      dispatch(action) {
        const next = reduce(state, action, random);
        if (next === state) return false;
        if (transactionStart === null) remember(state);
        state = next;
        notify();
        return true;
      },
      beginTransaction() {
        if (transactionStart === null) transactionStart = state;
      },
      commitTransaction,
      undo() {
        commitTransaction();
        if (!history.length) return false;
        state = history.pop();
        notify();
        return true;
      },
    });
  }

  app.store = Object.freeze({ createStore });
})(window.KMeans);
