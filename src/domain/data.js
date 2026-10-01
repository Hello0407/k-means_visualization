"use strict";

((app) => {
  const { MIN, MAX, DEFAULT_K, BURST_SIZE } = app.config;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function normalizeK(value, fallback = DEFAULT_K) {
    const number = Math.trunc(Number(value));
    return Number.isSafeInteger(number)
      ? Math.max(number, 1)
      : fallback;
  }

  function generateRandomPoints(k, random = Math.random) {
    const points = [];
    for (let index = 0; index < k; index++) {
      const angle = (Math.PI * 2 * index) / k - Math.PI / 2;
      const anchor = { x: Math.cos(angle) * 4, y: Math.sin(angle) * 4 };
      for (let i = 0; i < BURST_SIZE; i++) {
        points.push({
          id: points.length + 1,
          x: clamp(anchor.x + (random() - 0.5) * 2.1, MIN + 0.4, MAX - 0.4),
          y: clamp(anchor.y + (random() - 0.5) * 2.1, MIN + 0.4, MAX - 0.4),
        });
      }
    }
    return points;
  }

  function randomCenters(points, k, random = Math.random) {
    const shuffled = [...points];
    // Fisher–Yates: uniform shuffle without a random sort comparator.
    for (let index = shuffled.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    return Array.from({ length: k }, (_, index) => {
      const point = shuffled[index];
      const angle = (Math.PI * 2 * index) / k - Math.PI / 2;
      return {
        id: `C${index + 1}`,
        x: point ? clamp(point.x + (random() - 0.5) * 2.4, MIN + 0.5, MAX - 0.5) : Math.cos(angle) * 3.8,
        y: point ? clamp(point.y + (random() - 0.5) * 2.4, MIN + 0.5, MAX - 0.5) : Math.sin(angle) * 3.8,
      };
    });
  }

  function nextPointId(points) {
    return points.reduce((max, point) => Math.max(max, point.id), 0) + 1;
  }

  function createBurst(center, firstId, random = Math.random) {
    return Array.from({ length: BURST_SIZE }, (_, index) => ({
      id: firstId + index,
      x: clamp(center.x + (random() - 0.5) * 1.4, MIN, MAX),
      y: clamp(center.y + (random() - 0.5) * 1.4, MIN, MAX),
    }));
  }

  app.data = Object.freeze({ clamp, normalizeK, generateRandomPoints, randomCenters, nextPointId, createBurst });
})(window.KMeans);
