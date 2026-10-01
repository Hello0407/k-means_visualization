"use strict";

((app) => {
  const { MIN, MAX, PAD, SVG_W, SVG_H, ERASER_RADIUS } = app.config;
  const { worldToSvg } = app.coordinates;
  const { paletteAt } = app.palette;
  const { nearestCluster, distance } = app.kmeans;
  const format = (value) => Number(value).toFixed(2).replace("-0.00", "0.00");

  function getDistanceRows(state) {
    const point = state.points[state.activePointIndex];
    const nearest = nearestCluster(point, state.centers);
    return state.centers.map((center, index) => ({
      center, index, d: distance(point, center), nearest: index === nearest,
    }));
  }

  function createPlotRenderer(plot) {
    const defs = svgElement("defs");
    const marker = svgElement("marker", {
      id: "arrowHead", markerWidth: 12, markerHeight: 12, refX: 9, refY: 4,
      orient: "auto", markerUnits: "strokeWidth",
    });
    marker.appendChild(svgElement("path", { d: "M0,0 L0,8 L10,4 z", fill: "#334155" }));
    defs.appendChild(marker);
    const grid = svgElement("g", { "data-layer": "grid" });
    const scene = svgElement("g", { "data-layer": "scene" });
    const preview = svgElement("g", { "data-layer": "preview", "pointer-events": "none" });
    renderGrid(grid);
    plot.replaceChildren(defs, grid, scene, preview);

    return Object.freeze({
      renderScene(state) {
        const fragment = document.createDocumentFragment();
        renderSlideTitle(fragment, state);
        renderAssignedLinks(fragment, state);
        renderDistanceLines(fragment, state);
        renderMoveArrows(fragment, state);
        renderPoints(fragment, state);
        renderCenters(fragment, state);
        scene.replaceChildren(fragment);
      },
      renderPreview(state, ui) {
        const fragment = document.createDocumentFragment();
        renderHoverPreview(fragment, state, ui);
        preview.replaceChildren(fragment);
      },
    });
  }

  function svgElement(tag, attrs = {}) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);

    Object.entries(attrs).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });

    return element;
  }

  function renderGrid(layer) {
    for (let tick = MIN; tick <= MAX; tick++) {
      const verticalStart = worldToSvg({ x: tick, y: MIN });
      const verticalEnd = worldToSvg({ x: tick, y: MAX });
      const horizontalStart = worldToSvg({ x: MIN, y: tick });
      const horizontalEnd = worldToSvg({ x: MAX, y: tick });

      const isAxis = tick === 0;
      const stroke = isAxis ? "#64748b" : "#e2e8f0";
      const width = isAxis ? 1.5 : 1;

      layer.appendChild(
        svgElement("line", {
          x1: verticalStart.x,
          y1: verticalStart.y,
          x2: verticalEnd.x,
          y2: verticalEnd.y,
          stroke,
          "stroke-width": width,
        })
      );

      layer.appendChild(
        svgElement("line", {
          x1: horizontalStart.x,
          y1: horizontalStart.y,
          x2: horizontalEnd.x,
          y2: horizontalEnd.y,
          stroke,
          "stroke-width": width,
        })
      );

      if (tick !== 0) {
        const axis = worldToSvg({ x: 0, y: 0 });

        const xText = svgElement("text", {
          x: verticalStart.x - 4,
          y: axis.y + 18,
          "font-size": 10,
          "text-anchor": "middle",
          fill: "#94a3b8",
        });
        xText.textContent = tick;
        layer.appendChild(xText);

        const yText = svgElement("text", {
          x: axis.x + 10,
          y: horizontalStart.y + 4,
          "font-size": 10,
          fill: "#94a3b8",
        });
        yText.textContent = tick;
        layer.appendChild(yText);
      }
    }
  }

  function renderSlideTitle(layer, state) {
    let text = "";

    if (!state.points.length) {
      text = "Плоскость пустая: сначала нужно поставить точки";
    } else if (state.centers.length < state.k) {
      text = `Нужно поставить центроиды: ${state.centers.length} из ${state.k}`;
    } else if (state.phase === "overview") {
      text = "Общая плоскость: видим все точки и центроиды";
    } else if (state.phase === "focus") {
      text = `Фокус на одной точке: рассматриваем P${state.points[state.activePointIndex].id}`;
    } else if (state.phase === "measure") {
      text = `Считаем расстояния от P${state.points[state.activePointIndex].id} до каждого центроида`;
    } else if (state.phase === "assign") {
      text = `Выбираем минимальное расстояние и красим P${state.points[state.activePointIndex].id}`;
    } else if (state.phase === "centroid") {
      text = `Пересчитываем новый центр C${state.activeClusterIndex + 1}'`;
    } else if (state.phase === "move") {
      text = "Двигаем старые центроиды в новые позиции";
    } else {
      text = "Алгоритм сошёлся";
    }

    layer.appendChild(
      svgElement("rect", {
        x: 22,
        y: 18,
        width: 580,
        height: 38,
        rx: 19,
        fill: "white",
        stroke: "#e2e8f0",
        "stroke-width": 1,
      })
    );

    const label = svgElement("text", {
      x: 42,
      y: 43,
      "font-size": 14,
      "font-weight": 900,
      fill: "#0f172a",
    });

    label.textContent = text;
    layer.appendChild(label);
  }

  function renderAssignedLinks(layer, state) {
    if (state.phase === "focus" || state.phase === "measure") return;
    if (state.centers.length < state.k) return;

    state.points.forEach((point, pointIndex) => {
      const cluster = state.assignments[pointIndex];

      if (cluster === null) return;

      const p = worldToSvg(point);
      const c = worldToSvg(state.centers[cluster]);

      layer.appendChild(
        svgElement("line", {
          x1: p.x,
          y1: p.y,
          x2: c.x,
          y2: c.y,
          stroke: paletteAt(cluster).center,
          "stroke-width": 1.4,
          "stroke-dasharray": "3 5",
          opacity: 0.24,
        })
      );
    });
  }

  function renderDistanceLines(layer, state) {
    if (state.phase !== "measure" && state.phase !== "assign") return;
    if (state.centers.length < state.k) return;

    const activePoint = state.points[state.activePointIndex];
    const p = worldToSvg(activePoint);
    const rows = getDistanceRows(state);

    rows.forEach((row) => {
      const c = worldToSvg(row.center);
      const color =
        state.phase === "assign" && row.nearest
          ? paletteAt(row.index).center
          : "#94a3b8";

      const strong = state.phase === "assign" && row.nearest;
      const midX = (p.x + c.x) / 2;
      const midY = (p.y + c.y) / 2;

      layer.appendChild(
        svgElement("line", {
          x1: p.x,
          y1: p.y,
          x2: c.x,
          y2: c.y,
          stroke: color,
          "stroke-width": strong ? 4 : 2,
          "stroke-dasharray": strong ? "" : "8 7",
          opacity: strong ? 0.95 : 0.75,
        })
      );

      layer.appendChild(
        svgElement("rect", {
          x: midX - 36,
          y: midY - 14,
          width: 72,
          height: 26,
          rx: 13,
          fill: "white",
          stroke: color,
          "stroke-width": 1.5,
        })
      );

      const label = svgElement("text", {
        x: midX,
        y: midY + 4,
        "text-anchor": "middle",
        "font-size": 12,
        "font-weight": 900,
        fill: color,
      });

      label.textContent = `d=${format(row.d)}`;
      layer.appendChild(label);

      if (strong) {
        const minLabel = svgElement("text", {
          x: midX,
          y: midY + 28,
          "text-anchor": "middle",
          "font-size": 12,
          "font-weight": 900,
          fill: paletteAt(row.index).center,
        });

        minLabel.textContent = "минимум";
        layer.appendChild(minLabel);
      }
    });
  }

  function renderMoveArrows(layer, state) {
    if (state.phase !== "centroid" && state.phase !== "move") return;
    if (!state.oldCenters || !state.nextCenters) return;

    if (state.phase === "centroid") {
      const clusterIndex = state.activeClusterIndex;
      const oldCenter = state.oldCenters[clusterIndex];
      const newCenter = state.nextCenters[clusterIndex];
      const oldSvg = worldToSvg(oldCenter);
      const newSvg = worldToSvg(newCenter);
      const color = paletteAt(clusterIndex).center;
      const members = state.points.filter((_, index) => state.assignments[index] === clusterIndex);

      members.forEach((point) => {
        const p = worldToSvg(point);

        layer.appendChild(
          svgElement("line", {
            x1: p.x,
            y1: p.y,
            x2: newSvg.x,
            y2: newSvg.y,
            stroke: color,
            "stroke-width": 1.5,
            "stroke-dasharray": "4 5",
            opacity: 0.36,
          })
        );
      });

      layer.appendChild(
        svgElement("line", {
          x1: oldSvg.x,
          y1: oldSvg.y,
          x2: newSvg.x,
          y2: newSvg.y,
          stroke: color,
          "stroke-width": 4,
          "stroke-dasharray": "9 6",
          "marker-end": "url(#arrowHead)",
        })
      );

      drawNewCenter(layer, newSvg, clusterIndex);
      return;
    }

    state.oldCenters.forEach((oldCenter, index) => {
      const newCenter = state.nextCenters[index];
      const oldSvg = worldToSvg(oldCenter);
      const newSvg = worldToSvg(newCenter);
      const color = paletteAt(index).center;

      layer.appendChild(
        svgElement("line", {
          x1: oldSvg.x,
          y1: oldSvg.y,
          x2: newSvg.x,
          y2: newSvg.y,
          stroke: color,
          "stroke-width": 4,
          "stroke-dasharray": "9 6",
          "marker-end": "url(#arrowHead)",
        })
      );

      drawNewCenter(layer, newSvg, index);
    });
  }

  function drawNewCenter(layer, svg, index) {
    layer.appendChild(
      svgElement("circle", {
        cx: svg.x,
        cy: svg.y,
        r: 18,
        fill: "white",
        stroke: paletteAt(index).center,
        "stroke-width": 4,
      })
    );

    const text = svgElement("text", {
      x: svg.x,
      y: svg.y + 5,
      "text-anchor": "middle",
      "font-size": 12,
      "font-weight": 900,
      fill: paletteAt(index).center,
    });

    text.textContent = `C${index + 1}'`;
    layer.appendChild(text);
  }

  function renderHoverPreview(layer, state, ui) {
    if (!ui.hoverWorld) return;

    const hoverSvg = worldToSvg(ui.hoverWorld);

    if (ui.clickMode === "erase") {
      const rx = (ERASER_RADIUS / (MAX - MIN)) * (SVG_W - 2 * PAD);
      const ry = (ERASER_RADIUS / (MAX - MIN)) * (SVG_H - 2 * PAD);

      layer.appendChild(
        svgElement("ellipse", {
          cx: hoverSvg.x,
          cy: hoverSvg.y,
          rx,
          ry,
          fill: "rgba(239, 68, 68, 0.10)",
          stroke: "#ef4444",
          "stroke-width": 2,
          "stroke-dasharray": "6 5",
        })
      );
    }

    if (ui.clickMode === "center" && state.centers.length < state.k) {
      const nextIndex = state.centers.length;
      const color = paletteAt(nextIndex).center;

      layer.appendChild(
        svgElement("rect", {
          x: hoverSvg.x - 14,
          y: hoverSvg.y - 14,
          width: 28,
          height: 28,
          rx: 7,
          fill: color,
          stroke: "white",
          "stroke-width": 3,
          opacity: 0.55,
          transform: `rotate(45 ${hoverSvg.x} ${hoverSvg.y})`,
        })
      );

      const label = svgElement("text", {
        x: hoverSvg.x,
        y: hoverSvg.y + 5,
        "text-anchor": "middle",
        "font-size": 12,
        "font-weight": 900,
        fill: "white",
        opacity: 0.85,
      });

      label.textContent = `C${nextIndex + 1}`;
      layer.appendChild(label);
    }
  }

  function renderPoints(layer, state) {
    const focusMode =
      state.phase === "focus" ||
      state.phase === "measure" ||
      state.phase === "assign";

    state.points.forEach((point, index) => {
      const svg = worldToSvg(point);
      const cluster = state.assignments[index];
      const active = focusMode && index === state.activePointIndex;

      let fill = cluster === null ? "#cbd5e1" : paletteAt(cluster).point;
      let stroke = cluster === null ? "#64748b" : paletteAt(cluster).center;
      let opacity = 1;
      let radius = 9.5;

      if (focusMode && !active) {
        opacity = 0.13;
        radius = 6;
      }

      if (active) {
        stroke = "#0f172a";
        radius = state.phase === "assign" ? 14 : 12;
      }

      if (active && state.phase === "assign") {
        const nearest = nearestCluster(point, state.centers);
        fill = paletteAt(nearest).point;
        stroke = paletteAt(nearest).center;
      }

      if (active) {
        layer.appendChild(
          svgElement("circle", {
            cx: svg.x,
            cy: svg.y,
            r: 24,
            fill: "none",
            stroke: "#0f172a",
            "stroke-width": 3,
            opacity: 0.95,
          })
        );
      }

      layer.appendChild(
        svgElement("circle", {
          cx: svg.x,
          cy: svg.y,
          r: radius,
          fill,
          stroke,
          "stroke-width": active ? 3 : 2,
          opacity,
        })
      );

      if (!focusMode || active) {
        const text = svgElement("text", {
          x: svg.x + 13,
          y: svg.y - 11,
          "font-size": active ? 13 : 11,
          "font-weight": 900,
          fill: active ? "#0f172a" : "#334155",
          opacity,
        });

        text.textContent = `P${point.id}`;
        layer.appendChild(text);
      }
    });
  }

  function renderCenters(layer, state) {
    const visibleCenters =
      (state.phase === "centroid" || state.phase === "move") && state.oldCenters
        ? state.oldCenters
        : state.centers;

    visibleCenters.forEach((center, index) => {
      const svg = worldToSvg(center);
      const color = paletteAt(index).center;

      layer.appendChild(
        svgElement("rect", {
          x: svg.x - 14,
          y: svg.y - 14,
          width: 28,
          height: 28,
          rx: 7,
          fill: color,
          stroke: "white",
          "stroke-width": 3,
          transform: `rotate(45 ${svg.x} ${svg.y})`,
        })
      );

      const label = svgElement("text", {
        x: svg.x,
        y: svg.y + 5,
        "text-anchor": "middle",
        "font-size": 12,
        "font-weight": 900,
        fill: "white",
      });

      label.textContent = center.id;
      layer.appendChild(label);

      const coords = svgElement("text", {
        x: svg.x + 18,
        y: svg.y + 25,
        "font-size": 11,
        "font-weight": 800,
        fill: color,
      });

      coords.textContent = `(${format(center.x)}, ${format(center.y)})`;
      layer.appendChild(coords);
    });
  }

  app.plot = Object.freeze({ createPlotRenderer });
})(window.KMeans);
