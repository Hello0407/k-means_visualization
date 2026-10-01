"use strict";

((app) => {
  const { paletteAt } = app.palette;

  function getElements(root) {
    const ids = ["plot", "kInput", "legend", "autoPointsBtn", "backBtn", "nextBtn", "playBtn",
      "randomCentersBtn", "clearCentersBtn", "clearPointsBtn", "pointModeBtn", "burstModeBtn", "centerModeBtn", "eraseModeBtn"];
    return Object.fromEntries(ids.map((id) => {
      const element = root.querySelector(`#${id}`);
      if (!element) throw new Error(`Required element #${id} is missing`);
      return [id, element];
    }));
  }

  function createControlsRenderer(elements) {
    let legendK = null;

    function renderLegend(k) {
      if (legendK === k) return;
      const fragment = document.createDocumentFragment();
      const gray = document.createElement("span");
      gray.className = "legend-item";
      gray.style.background = "#e2e8f0";
      gray.style.color = "#334155";
      gray.textContent = "серый = ещё не назначена";
      fragment.appendChild(gray);
      for (let index = 0; index < k; index++) {
        const palette = paletteAt(index);
        const item = document.createElement("span");
        item.className = "legend-item";
        item.style.background = palette.soft;
        item.style.color = palette.text;
        item.textContent = palette.name;
        fragment.appendChild(item);
      }
      elements.legend.replaceChildren(fragment);
      legendK = k;
    }

    return Object.freeze({
      render(state, ui, canUndo, playing) {
        elements.kInput.value = state.k;
        elements.backBtn.disabled = !canUndo;
        elements.playBtn.textContent = playing ? "Пауза" : "Авто-показ";
        elements.playBtn.setAttribute("aria-pressed", String(playing));
        for (const mode of ["point", "burst", "center", "erase"]) {
          const button = elements[`${mode}ModeBtn`];
          button.classList.toggle("active", ui.clickMode === mode);
          button.setAttribute("aria-pressed", String(ui.clickMode === mode));
        }
        renderLegend(state.k);
      },
    });
  }

  app.controls = Object.freeze({ getElements, createControlsRenderer });
})(window.KMeans);
