"use strict";

((app) => {
  const BASE_PALETTE = [
    {
      name: "C1",
      point: "#38bdf8",
      center: "#0284c7",
      soft: "rgba(56, 189, 248, 0.12)",
      text: "#0369a1",
    },
    {
      name: "C2",
      point: "#fb7185",
      center: "#e11d48",
      soft: "rgba(251, 113, 133, 0.12)",
      text: "#be123c",
    },
    {
      name: "C3",
      point: "#a78bfa",
      center: "#7c3aed",
      soft: "rgba(167, 139, 250, 0.13)",
      text: "#6d28d9",
    },
  ];

  function paletteAt(index) {
    if (BASE_PALETTE[index]) {
      return BASE_PALETTE[index];
    }

    const hue = Math.round((index * 137.508) % 360);

    return {
      name: `C${index + 1}`,
      point: `hsl(${hue} 82% 68%)`,
      center: `hsl(${hue} 76% 44%)`,
      soft: `hsl(${hue} 82% 68% / 0.14)`,
      text: `hsl(${hue} 76% 34%)`,
    };
  }

  app.palette = Object.freeze({ paletteAt });
})(window.KMeans);
