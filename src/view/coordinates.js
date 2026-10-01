"use strict";

((app) => {
  const { SVG_W, SVG_H, PAD, MIN, MAX } = app.config;
  const { clamp } = app.data;

  function worldToSvg(point) {
    return {
      x: PAD + ((point.x - MIN) / (MAX - MIN)) * (SVG_W - 2 * PAD),
      y: SVG_H - PAD - ((point.y - MIN) / (MAX - MIN)) * (SVG_H - 2 * PAD),
    };
  }

  function svgToWorld(point) {
    return {
      x: clamp(MIN + ((point.x - PAD) / (SVG_W - 2 * PAD)) * (MAX - MIN), MIN, MAX),
      y: clamp(MIN + ((SVG_H - PAD - point.y) / (SVG_H - 2 * PAD)) * (MAX - MIN), MIN, MAX),
    };
  }

  function eventToWorld(plot, event) {
    const matrix = plot.getScreenCTM();
    if (!matrix) return null;
    const point = plot.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    // Account for SVG viewBox letterboxing at every responsive breakpoint.
    return svgToWorld(point.matrixTransform(matrix.inverse()));
  }

  app.coordinates = Object.freeze({ worldToSvg, svgToWorld, eventToWorld });
})(window.KMeans);
