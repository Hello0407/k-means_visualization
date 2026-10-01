"use strict";

((app) => {
  function squaredDistance(a, b) {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  }

  function distance(a, b) {
    return Math.sqrt(squaredDistance(a, b));
  }

  function nearestCluster(point, centers) {
    let bestIndex = -1;
    let bestDistance = Infinity;
    centers.forEach((center, index) => {
      const candidate = squaredDistance(point, center);
      if (candidate < bestDistance) {
        bestIndex = index;
        bestDistance = candidate;
      }
    });
    return bestIndex;
  }

  // Accumulate once per point instead of filtering the entire dataset for each cluster.
  function recomputeCenters(points, centers, assignments) {
    const sums = centers.map(() => ({ x: 0, y: 0, count: 0 }));
    points.forEach((point, index) => {
      const sum = sums[assignments[index]];
      if (!sum) return;
      sum.x += point.x;
      sum.y += point.y;
      sum.count++;
    });
    return centers.map((center, index) => {
      const sum = sums[index];
      return sum.count
        ? { id: center.id, x: sum.x / sum.count, y: sum.y / sum.count, empty: false }
        : { ...center, empty: true };
    });
  }

  function maxCenterShift(centers, nextCenters) {
    return centers.reduce((max, center, index) =>
      Math.max(max, distance(center, nextCenters[index])), 0);
  }

  app.kmeans = Object.freeze({ distance, squaredDistance, nearestCluster, recomputeCenters, maxCenterShift });
})(window.KMeans);
