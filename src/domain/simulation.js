"use strict";

((app) => {
  const { DEFAULT_K, CONVERGENCE_TOLERANCE } = app.config;
  const { nearestCluster, recomputeCenters, maxCenterShift } = app.kmeans;

  function resetSimulation(state) {
    return {
      ...state,
      assignments: Array(state.points.length).fill(null),
      phase: !state.points.length ? "empty" : state.centers.length < state.k ? "need-centers" : "overview",
      iteration: 1,
      activePointIndex: 0,
      activeClusterIndex: 0,
      oldCenters: null,
      nextCenters: null,
    };
  }

  function createSimulation(k = DEFAULT_K) {
    return resetSimulation({ k: app.data.normalizeK(k), points: [], centers: [] });
  }

  function canAdvance(state) {
    return state.points.length > 0 && state.centers.length === state.k && state.phase !== "done";
  }

  // Each transition returns a new snapshot; unchanged arrays are shared with history.
  // The algorithm has no knowledge of DOM, timers, pointer modes or undo.
  function advance(state) {
    if (!canAdvance(state)) return state;
    switch (state.phase) {
      case "empty":
      case "need-centers":
        return { ...state, phase: "overview" };
      case "overview":
        return { ...state, phase: "focus" };
      case "focus":
        return { ...state, phase: "measure" };
      case "measure": {
        const assignments = [...state.assignments];
        assignments[state.activePointIndex] = nearestCluster(state.points[state.activePointIndex], state.centers);
        return { ...state, assignments, phase: "assign" };
      }
      case "assign":
        if (state.activePointIndex < state.points.length - 1) {
          return { ...state, activePointIndex: state.activePointIndex + 1, phase: "overview" };
        }
        return {
          ...state,
          oldCenters: state.centers,
          nextCenters: recomputeCenters(state.points, state.centers, state.assignments),
          activeClusterIndex: 0,
          phase: "centroid",
        };
      case "centroid":
        return state.activeClusterIndex < state.k - 1
          ? { ...state, activeClusterIndex: state.activeClusterIndex + 1 }
          : { ...state, phase: "move" };
      case "move": {
        const shift = maxCenterShift(state.centers, state.nextCenters);
        const moved = {
          ...state,
          centers: state.nextCenters.map(({ id, x, y }) => ({ id, x, y })),
          oldCenters: null,
          nextCenters: null,
        };
        if (shift < CONVERGENCE_TOLERANCE) return { ...moved, phase: "done" };
        return { ...resetSimulation(moved), iteration: state.iteration + 1 };
      }
      default:
        throw new Error(`Unknown simulation phase: ${state.phase}`);
    }
  }

  app.simulation = Object.freeze({ createSimulation, resetSimulation, canAdvance, advance });
})(window.KMeans);
