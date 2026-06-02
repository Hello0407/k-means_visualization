const SVG_W = 820;
const SVG_H = 590;
const PAD = 48;
const MIN = -6;
const MAX = 6;

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

const DEFAULT_POINTS = [
  { id: 1, x: -4.8, y: 2.9 },
  { id: 2, x: -4.2, y: 2.1 },
  { id: 3, x: -3.5, y: 3.4 },
  { id: 4, x: -3.8, y: 1.1 },
  { id: 5, x: -2.8, y: 2.4 },
  { id: 6, x: -5.0, y: 1.4 },
  { id: 7, x: 2.7, y: -1.8 },
  { id: 8, x: 3.5, y: -2.7 },
  { id: 9, x: 4.7, y: -1.4 },
  { id: 10, x: 4.0, y: -3.3 },
  { id: 11, x: 2.9, y: -3.5 },
  { id: 12, x: 5.0, y: -2.4 },
];

const THREE_CLUSTER_POINTS = [
  { id: 1, x: -4.7, y: 2.9 },
  { id: 2, x: -4.1, y: 2.0 },
  { id: 3, x: -3.3, y: 3.1 },
  { id: 4, x: -3.8, y: 1.2 },
  { id: 5, x: 0.1, y: 4.4 },
  { id: 6, x: 0.9, y: 3.5 },
  { id: 7, x: -0.8, y: 3.7 },
  { id: 8, x: 0.4, y: 2.8 },
  { id: 9, x: 3.0, y: -2.2 },
  { id: 10, x: 4.1, y: -3.1 },
  { id: 11, x: 5.0, y: -1.9 },
  { id: 12, x: 3.3, y: -3.8 },
];

let state = {
  k: 2,
  points: [],
  centers: [],
  assignments: [],
  phase: "empty",
  iteration: 1,
  activePointIndex: 0,
  activeClusterIndex: 0,
  oldCenters: null,
  nextCenters: null,
  playing: false,
  clickMode: "point",
  eraserRadius: 0.75,
  hoverWorld: null,
  story: [
    "Плоскость пока пустая. Сначала поставьте точки, затем задайте центроиды вручную или случайно.",
  ],
};

let playTimer = null;
let isErasing = false;
let ignoreNextPlotClick = false;
let eraseSession = {
  points: 0,
  centers: 0,
  snapshot: null,
};
const undoStack = [];
const MAX_UNDO_STEPS = 80;

const plot = document.getElementById("plot");
const kInput = document.getElementById("kInput");
const autoPointsBtn = document.getElementById("autoPointsBtn");
const backBtn = document.getElementById("backBtn");
const nextBtn = document.getElementById("nextBtn");
const playBtn = document.getElementById("playBtn");
const randomCentersBtn = document.getElementById("randomCentersBtn");
const clearCentersBtn = document.getElementById("clearCentersBtn");
const clearPointsBtn = document.getElementById("clearPointsBtn");
const newPointsBtn = document.getElementById("newPointsBtn");

const pointModeBtn = document.getElementById("pointModeBtn");
const burstModeBtn = document.getElementById("burstModeBtn");
const centerModeBtn = document.getElementById("centerModeBtn");
const eraseModeBtn = document.getElementById("eraseModeBtn");

const inspector = document.getElementById("inspector");
const logBox = document.getElementById("logBox");
const legend = document.getElementById("legend");
const currentStageText = document.getElementById("currentStageText");

const iterationBox = document.getElementById("iterationBox");
const assignedBox = document.getElementById("assignedBox");
const phaseTitle = document.getElementById("phaseTitle");
const phaseDescription = document.getElementById("phaseDescription");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function format(value) {
  return Number(value).toFixed(2).replace("-0.00", "0.00");
}

function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function worldToSvg(point) {
  const x = PAD + ((point.x - MIN) / (MAX - MIN)) * (SVG_W - 2 * PAD);
  const y = SVG_H - PAD - ((point.y - MIN) / (MAX - MIN)) * (SVG_H - 2 * PAD);

  return { x, y };
}

function svgToWorld(point) {
  const x = MIN + ((point.x - PAD) / (SVG_W - 2 * PAD)) * (MAX - MIN);
  const y = MIN + ((SVG_H - PAD - point.y) / (SVG_H - 2 * PAD)) * (MAX - MIN);

  return {
    x: clamp(x, MIN, MAX),
    y: clamp(y, MIN, MAX),
  };
}

function eventToWorld(event) {
  const rect = plot.getBoundingClientRect();

  const svgPoint = {
    x: ((event.clientX - rect.left) / rect.width) * SVG_W,
    y: ((event.clientY - rect.top) / rect.height) * SVG_H,
  };

  return svgToWorld(svgPoint);
}

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

function getPreparedPoints(k) {
  if (k === 2) return DEFAULT_POINTS.map((point) => ({ ...point }));
  if (k === 3) return THREE_CLUSTER_POINTS.map((point) => ({ ...point }));
  return generateRandomPoints(k);
}

function generateRandomPoints(k) {
  const anchors = Array.from({ length: k }, (_, index) => {
    const angle = (Math.PI * 2 * index) / k - Math.PI / 2;

    return {
      x: Math.cos(angle) * 4,
      y: Math.sin(angle) * 4,
    };
  });

  const result = [];
  let id = 1;

  for (const anchor of anchors) {
    for (let i = 0; i < 6; i++) {
      result.push({
        id,
        x: clamp(anchor.x + (Math.random() - 0.5) * 2.1, MIN + 0.4, MAX - 0.4),
        y: clamp(anchor.y + (Math.random() - 0.5) * 2.1, MIN + 0.4, MAX - 0.4),
      });

      id++;
    }
  }

  return result;
}

function randomCenters(points, k) {
  const shuffled = [...points].sort(() => Math.random() - 0.5);
  const result = [];

  for (let index = 0; index < k; index++) {
    const point = shuffled[index];

    if (point) {
      result.push({
        id: `C${index + 1}`,
        x: clamp(point.x + (Math.random() - 0.5) * 2.4, MIN + 0.5, MAX - 0.5),
        y: clamp(point.y + (Math.random() - 0.5) * 2.4, MIN + 0.5, MAX - 0.5),
      });
    } else {
      const angle = (Math.PI * 2 * index) / k - Math.PI / 2;

      result.push({
        id: `C${index + 1}`,
        x: Math.cos(angle) * 3.8,
        y: Math.sin(angle) * 3.8,
      });
    }
  }

  return result;
}

function getNextPointId() {
  if (!state.points.length) return 1;
  return Math.max(...state.points.map((point) => point.id)) + 1;
}

function createClusteredPointsAround(center, count) {
  const nextId = getNextPointId();

  return Array.from({ length: count }, (_, index) => ({
    id: nextId + index,
    x: clamp(center.x + (Math.random() - 0.5) * 1.4, MIN, MAX),
    y: clamp(center.y + (Math.random() - 0.5) * 1.4, MIN, MAX),
  }));
}

function nearestCluster(point, centers) {
  let bestIndex = 0;
  let bestDistance = Infinity;

  centers.forEach((center, index) => {
    const currentDistance = distance(point, center);

    if (currentDistance < bestDistance) {
      bestDistance = currentDistance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function recomputeCenters() {
  return state.centers.map((center, clusterIndex) => {
    const members = state.points.filter(
      (_, pointIndex) => state.assignments[pointIndex] === clusterIndex
    );

    if (members.length === 0) {
      return { ...center, empty: true };
    }

    return {
      id: center.id,
      x: mean(members.map((point) => point.x)),
      y: mean(members.map((point) => point.y)),
      empty: false,
    };
  });
}

function renumberCenters() {
  state.centers = state.centers.map((center, index) => ({
    ...center,
    id: `C${index + 1}`,
  }));
}

function getAssignedCount() {
  return state.assignments.filter((value) => value !== null).length;
}

function getActivePoint() {
  if (!state.points.length) return null;
  return state.points[state.activePointIndex] || state.points[0];
}

function getDistanceRows() {
  const activePoint = getActivePoint();

  if (!activePoint || state.centers.length < state.k) {
    return [];
  }

  return state.centers.map((center, index) => {
    const dx = activePoint.x - center.x;
    const dy = activePoint.y - center.y;
    const d = Math.sqrt(dx ** 2 + dy ** 2);
    const nearest = index === nearestCluster(activePoint, state.centers);

    return {
      index,
      center,
      dx,
      dy,
      d,
      nearest,
    };
  });
}

function getClusterMembers(clusterIndex) {
  return state.points.filter((_, index) => state.assignments[index] === clusterIndex);
}

function getMaxShift() {
  if (!state.nextCenters) return 0;

  return Math.max(
    ...state.centers.map((center, index) => distance(center, state.nextCenters[index]))
  );
}

function getBasePhase() {
  if (!state.points.length) return "empty";
  if (state.centers.length < state.k) return "need-centers";
  return "overview";
}

function log(message) {
  state.story = [message, ...state.story].slice(0, 6);
}

function cloneState() {
  return JSON.parse(JSON.stringify(state));
}

function statesAreEqual(a, b) {
  const comparableA = { ...a, playing: false, hoverWorld: null };
  const comparableB = { ...b, playing: false, hoverWorld: null };

  return JSON.stringify(comparableA) === JSON.stringify(comparableB);
}

function updateUndoUi() {
  backBtn.disabled = undoStack.length === 0;
}

function saveUndoSnapshot(snapshot) {
  if (statesAreEqual(snapshot, state)) return;

  undoStack.push(snapshot);

  if (undoStack.length > MAX_UNDO_STEPS) {
    undoStack.shift();
  }

  updateUndoUi();
}

function runWithUndo(action) {
  const snapshot = cloneState();

  action();
  saveUndoSnapshot(snapshot);
}

function undoLastStep() {
  const previousState = undoStack.pop();

  if (!previousState) return;

  stopAutoPlay();
  state = previousState;
  state.playing = false;
  state.hoverWorld = null;

  render();
}

function stopAutoPlay() {
  state.playing = false;
  playBtn.textContent = "Авто-показ";

  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
}

function clearAlgorithmProgress() {
  state.assignments = Array(state.points.length).fill(null);
  state.phase = getBasePhase();
  state.iteration = 1;
  state.activePointIndex = 0;
  state.activeClusterIndex = 0;
  state.oldCenters = null;
  state.nextCenters = null;

  stopAutoPlay();
}

function resetAlgorithmAfterDataChange(message) {
  clearAlgorithmProgress();

  if (message) {
    log(message);
  }

  render();
}

function setClickMode(mode) {
  state.clickMode = mode;
  render();
}

function startAutoPlay() {
  if (playTimer) return;

  state.playing = true;
  playBtn.textContent = "Пауза";

  playTimer = setInterval(() => {
    runWithUndo(advance);
  }, 1000);
}

function toggleAutoPlay() {
  if (state.playing) {
    stopAutoPlay();
  } else {
    startAutoPlay();
  }
}

function advance() {
  if (!state.points.length) {
    state.phase = "empty";
    log("Сначала нужно поставить точки на плоскость.");
    stopAutoPlay();
    render();
    return;
  }

  if (state.centers.length < state.k) {
    state.phase = "need-centers";
    log(`Сначала поставьте ${state.k} центроидов вручную или нажмите «Случайные центроиды». Сейчас поставлено ${state.centers.length} из ${state.k}.`);
    stopAutoPlay();
    render();
    return;
  }

  if (state.phase === "empty" || state.phase === "need-centers") {
    state.phase = "overview";
    render();
    return;
  }

  if (state.phase === "done") {
    stopAutoPlay();
    return;
  }

  const activePoint = getActivePoint();

  if (state.phase === "overview") {
    state.phase = "focus";
    log(`Берём точку P${activePoint.id}. Сейчас убираем лишнее внимание и смотрим только на неё и центроиды.`);
    render();
    return;
  }

  if (state.phase === "focus") {
    state.phase = "measure";
    log(`Для P${activePoint.id} считаем расстояния до каждого центроида.`);
    render();
    return;
  }

  if (state.phase === "measure") {
    const cluster = nearestCluster(activePoint, state.centers);

    state.assignments[state.activePointIndex] = cluster;
    state.phase = "assign";

    log(`У P${activePoint.id} минимальное расстояние до ${state.centers[cluster].id}. Поэтому точка получает цвет этого центроида.`);
    render();
    return;
  }

  if (state.phase === "assign") {
    if (state.activePointIndex < state.points.length - 1) {
      state.activePointIndex++;
      state.phase = "overview";

      log(`Возвращаемся на общую плоскость. Предыдущая точка уже окрашена, теперь готовим P${getActivePoint().id}.`);
      render();
      return;
    }

    state.oldCenters = state.centers.map((center) => ({ ...center }));
    state.nextCenters = recomputeCenters();
    state.activeClusterIndex = 0;
    state.phase = "centroid";

    log("Все точки получили цвета. Теперь объясняем, как пересчитываются новые центроиды.");
    render();
    return;
  }

  if (state.phase === "centroid") {
    if (state.activeClusterIndex < state.k - 1) {
      state.activeClusterIndex++;
      log(`Теперь пересчитываем ${state.centers[state.activeClusterIndex].id}: берём среднее всех точек этого цвета.`);
      render();
      return;
    }

    state.phase = "move";
    log("Новые центроиды посчитаны. Теперь показываем, куда переезжают старые центры.");
    render();
    return;
  }

  if (state.phase === "move") {
    const shift = getMaxShift();

    state.centers = state.nextCenters.map((center, index) => ({
      id: `C${index + 1}`,
      x: center.x,
      y: center.y,
    }));

    state.oldCenters = null;
    state.nextCenters = null;

    if (shift < 0.04) {
      state.phase = "done";
      stopAutoPlay();

      log("Центроиды почти не сдвинулись. Алгоритм дошёл до устойчивого результата.");
      render();
      return;
    }

    state.assignments = Array(state.points.length).fill(null);
    state.activePointIndex = 0;
    state.activeClusterIndex = 0;
    state.iteration++;
    state.phase = "overview";

    log(`Начинаем итерацию ${state.iteration}: снова будем по одной точке проверять расстояния до новых центров.`);
    render();
  }
}

function svgElement(tag, attrs = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);

  Object.entries(attrs).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });

  return element;
}

function render() {
  kInput.value = state.k;
  updateModeUi();
  updateUndoUi();
  renderCurrentStage();
  renderLegend();
  renderSvg();
}

function renderCurrentStage() {
  if (!currentStageText) return;

  const activePoint = getActivePoint();

  if (!state.points.length) {
    currentStageText.textContent = "Подготовка: поставьте точки";
    return;
  }

  if (state.centers.length < state.k) {
    currentStageText.textContent =
      `Подготовка: поставьте центроиды (${state.centers.length}/${state.k})`;
    return;
  }

  if (state.phase === "overview") {
    currentStageText.textContent = "Шаг 1 из 5: общая плоскость";
    return;
  }

  if (state.phase === "focus") {
    currentStageText.textContent = `Шаг 2 из 5: фокус на P${activePoint.id}`;
    return;
  }

  if (state.phase === "measure") {
    currentStageText.textContent = `Шаг 2 из 5: считаем расстояния для P${activePoint.id}`;
    return;
  }

  if (state.phase === "assign") {
    currentStageText.textContent = `Шаг 2 из 5: выбираем минимум для P${activePoint.id}`;
    return;
  }

  if (state.phase === "centroid") {
    currentStageText.textContent =
      `Шаг 3 из 5: пересчитываем C${state.activeClusterIndex + 1}`;
    return;
  }

  if (state.phase === "move") {
    currentStageText.textContent = "Шаг 4 из 5: движение центроидов";
    return;
  }

  currentStageText.textContent = "Шаг 5 из 5: сходимость";
}

function updateModeUi() {
  pointModeBtn.classList.remove("active");
  burstModeBtn.classList.remove("active");
  centerModeBtn.classList.remove("active");
  eraseModeBtn.classList.remove("active");

  if (state.clickMode === "point") {
    pointModeBtn.classList.add("active");
  }

  if (state.clickMode === "burst") {
    burstModeBtn.classList.add("active");
  }

  if (state.clickMode === "center") {
    centerModeBtn.classList.add("active");
  }

  if (state.clickMode === "erase") {
    eraseModeBtn.classList.add("active");
  }

}

function renderLegend() {
  legend.innerHTML = "";

  const gray = document.createElement("span");
  gray.className = "legend-item";
  gray.style.background = "#e2e8f0";
  gray.style.color = "#334155";
  gray.textContent = "серый = ещё не назначена";
  legend.appendChild(gray);

  for (let i = 0; i < state.k; i++) {
    const item = document.createElement("span");
    item.className = "legend-item";
    item.style.background = paletteAt(i).soft;
    item.style.color = paletteAt(i).text;
    item.textContent = paletteAt(i).name;
    legend.appendChild(item);
  }
}

function renderState() {
  iterationBox.textContent = state.iteration;
  assignedBox.textContent = `${getAssignedCount()}/${state.points.length}`;

  const activePoint = getActivePoint();

  if (!state.points.length) {
    phaseTitle.textContent = "Плоскость пока пустая";
    phaseDescription.textContent =
      "Нажмите «Поставить точки автоматически» или добавьте точки вручную.";
    return;
  }

  if (state.centers.length < state.k) {
    phaseTitle.textContent = `Нужно поставить центроиды (${state.centers.length}/${state.k})`;
    phaseDescription.textContent =
      "Выберите режим «Поставить центроид» и кликните по плоскости, либо нажмите кнопку случайной инициализации.";
    return;
  }

  if (state.phase === "overview") {
    phaseTitle.textContent = "Общая плоскость";
    phaseDescription.textContent =
      `Видны все точки. Следующей подробно разберём точку P${activePoint.id}.`;
  } else if (state.phase === "focus") {
    phaseTitle.textContent = `Фокус на P${activePoint.id}`;
    phaseDescription.textContent =
      "Оставляем в центре внимания только активную точку и центроиды.";
  } else if (state.phase === "measure") {
    phaseTitle.textContent = `Считаем расстояния для P${activePoint.id}`;
    phaseDescription.textContent =
      "От этой точки проводятся линии ко всем центроидам. Так алгоритм проверяет, какой центр ближе.";
  } else if (state.phase === "assign") {
    phaseTitle.textContent = `Выбираем минимум для P${activePoint.id}`;
    phaseDescription.textContent =
      "Минимальное расстояние выделено. Точка получает цвет ближайшего центроида.";
  } else if (state.phase === "centroid") {
    phaseTitle.textContent = `Пересчитываем C${state.activeClusterIndex + 1}`;
    phaseDescription.textContent =
      "Новый центроид считается как среднее координат всех точек своего цвета.";
  } else if (state.phase === "move") {
    phaseTitle.textContent = "Двигаем центроиды";
    phaseDescription.textContent =
      "Старые центры переходят в новые позиции. Потом алгоритм начнёт новую итерацию.";
  } else {
    phaseTitle.textContent = "Алгоритм сошёлся";
    phaseDescription.textContent =
      "Центроиды почти не двигаются, значит результат стабилизировался.";
  }
}

function renderTimeline() {
  const ids = {
    measure: "stepMeasure",
    assign: "stepAssign",
    centroid: "stepCentroid",
    move: "stepMove",
    done: "stepDone",
  };

  Object.values(ids).forEach((id) => {
    document.getElementById(id).className = "timeline-step";
  });

  if (!state.points.length || state.centers.length < state.k) {
    document.getElementById(ids.measure).classList.add("active");
    return;
  }

  if (state.phase === "overview") {
    document.getElementById(ids.measure).classList.add("active");
  }

  if (state.phase === "focus" || state.phase === "measure" || state.phase === "assign") {
    document.getElementById(ids.assign).classList.add("active");
  }

  if (state.phase === "centroid") {
    document.getElementById(ids.centroid).classList.add("active");
  }

  if (state.phase === "move") {
    document.getElementById(ids.move).classList.add("active");
  }

  if (state.phase === "done") {
    document.getElementById(ids.done).classList.add("active");
  }

  if (getAssignedCount() > 0) {
    document.getElementById(ids.measure).classList.add("done");
    document.getElementById(ids.assign).classList.add("done");
  }

  if (state.phase === "move" || state.phase === "done") {
    document.getElementById(ids.centroid).classList.add("done");
  }

  if (state.phase === "done") {
    document.getElementById(ids.move).classList.add("done");
  }
}

function renderInspector() {
  const activePoint = getActivePoint();

  if (!state.points.length) {
    inspector.innerHTML = `
      <div class="inspector-title">Начало работы</div>
      <div class="inspector-big">Сначала поставьте точки</div>
      <p class="inspector-text">
        Точки — это данные, которые алгоритм k-средних будет разбивать на кластеры.
      </p>
      <div class="slide-note">
        Нажмите «Поставить точки автоматически» или добавьте точки вручную.
      </div>
    `;
    return;
  }

  if (state.centers.length < state.k) {
    inspector.innerHTML = `
      <div class="inspector-title">Подготовка центроидов</div>
      <div class="inspector-big">Поставлено ${state.centers.length} из ${state.k}</div>
      <p class="inspector-text">
        Сейчас нужно задать начальные центроиды. Это важный этап алгоритма:
        именно от начального положения центров зависит траектория вычислений.
      </p>
      <div class="slide-note">
        Выберите режим «Поставить центроид» и кликните по плоскости,
        либо нажмите «Случайные центроиды».
      </div>
    `;
    return;
  }

  if (state.phase === "overview") {
    inspector.innerHTML = `
      <div class="inspector-title">Общая плоскость</div>
      <div class="inspector-big">Следующая точка: P${activePoint.id}</div>
      <p class="inspector-text">
        Сейчас мы видим всю картину. Серые точки ещё не имеют кластера.
        Цветные центроиды — это текущие центры кластеров.
      </p>
      <div class="slide-note">
        Следующий шаг откроет отдельный учебный слайд только для точки P${activePoint.id}.
      </div>
    `;
    return;
  }

  if (state.phase === "focus") {
    inspector.innerHTML = `
      <div class="inspector-title">Фокус-слайд</div>
      <div class="inspector-big">Разбираем P${activePoint.id}</div>
      <p class="inspector-text">
        Чтобы новичку было проще, остальные точки приглушены.
        Сейчас важно понять только одно: к какому центроиду ближе точка P${activePoint.id}.
      </p>
      <div class="slide-note">
        На следующем шаге появятся расстояния от P${activePoint.id} до каждого центроида.
      </div>
    `;
    return;
  }

  if (state.phase === "measure" || state.phase === "assign") {
    const rows = getDistanceRows();

    inspector.innerHTML = `
      <div class="inspector-title">Активная точка</div>
      <div class="inspector-big">P${activePoint.id} = (${format(activePoint.x)}, ${format(activePoint.y)})</div>
      <p class="inspector-text">
        Считаем расстояние от этой точки до каждого центроида.
        Потом выбираем самое маленькое.
      </p>
      <h3 style="margin-top: 18px;">Таблица расстояний</h3>
    `;

    rows.forEach((row) => {
      const card = document.createElement("div");
      card.className = row.nearest ? "distance-card best" : "distance-card";
      card.style.background = row.nearest && state.phase === "assign"
        ? paletteAt(row.index).soft
        : "white";
      card.style.borderColor = row.nearest && state.phase === "assign"
        ? paletteAt(row.index).center
        : "#e2e8f0";

      card.innerHTML = `
        <div class="distance-row">
          <div class="distance-name">d(P${activePoint.id}, ${row.center.id})</div>
          <div class="distance-value" style="color: ${
            row.nearest && state.phase === "assign" ? paletteAt(row.index).center : "#475569"
          };">
            ${format(row.d)}
          </div>
        </div>

        <div class="distance-formula">
          √((${format(activePoint.x)} − ${format(row.center.x)})² +
          (${format(activePoint.y)} − ${format(row.center.y)})²)
        </div>
      `;

      if (state.phase === "assign" && row.nearest) {
        const label = document.createElement("div");
        label.className = "best-label";
        label.style.color = paletteAt(row.index).text;
        label.textContent = `это минимум → точка получает цвет ${row.center.id}`;
        card.appendChild(label);
      }

      inspector.appendChild(card);
    });

    return;
  }

  if (state.phase === "centroid" && state.nextCenters) {
    const clusterIndex = state.activeClusterIndex;
    const center = state.nextCenters[clusterIndex];
    const members = getClusterMembers(clusterIndex);
    const xList = members.map((point) => format(point.x)).join(" + ");
    const yList = members.map((point) => format(point.y)).join(" + ");
    const color = paletteAt(clusterIndex).center;

    inspector.innerHTML = `
      <div class="inspector-title">Новый центроид</div>
      <div class="inspector-big" style="color: ${color};">
        C${clusterIndex + 1}' = (${format(center.x)}, ${format(center.y)})
      </div>
      <p class="inspector-text">
        Новый центр считается как среднее координат точек этого кластера.
      </p>

      <div class="member-list">
        ${members
          .map(
            (point) => `
              <span class="member" style="background: ${paletteAt(clusterIndex).soft}; color: ${color};">
                P${point.id}
              </span>
            `
          )
          .join("")}
      </div>

      <div class="formula">
        x' = (${xList || "нет точек"}) / ${members.length || 1} = ${format(center.x)}<br>
        y' = (${yList || "нет точек"}) / ${members.length || 1} = ${format(center.y)}
      </div>
    `;
    return;
  }

  if (state.phase === "move" && state.nextCenters) {
    let html = `
      <div class="inspector-title">Сдвиг центроидов</div>
      <div class="inspector-big">max shift = ${format(getMaxShift())}</div>
      <p class="inspector-text">
        Старые центры переходят в новые позиции. После этого начнётся новая итерация.
      </p>
    `;

    state.centers.forEach((center, index) => {
      html += `
        <div class="formula">
          <b style="color: ${paletteAt(index).center};">${center.id}</b><br>
          (${format(center.x)}, ${format(center.y)}) →
          (${format(state.nextCenters[index].x)}, ${format(state.nextCenters[index].y)})
        </div>
      `;
    });

    inspector.innerHTML = html;
    return;
  }

  inspector.innerHTML = `
    <div class="inspector-title">Готово</div>
    <div class="inspector-big" style="color: #047857;">Кластеры стабилизировались</div>
    <p class="inspector-text">
      Можно заново поставить точки или центроиды и сравнить другую траекторию алгоритма.
    </p>
  `;
}

function renderLog() {
  logBox.innerHTML = "";

  state.story.forEach((item) => {
    const div = document.createElement("div");
    div.className = "log-item";
    div.textContent = item;
    logBox.appendChild(div);
  });
}

function renderSvg() {
  plot.innerHTML = "";

  const defs = svgElement("defs");
  defs.innerHTML = `
    <marker id="arrowHead" markerWidth="12" markerHeight="12" refX="9" refY="4" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,8 L10,4 z" fill="#334155"></path>
    </marker>
  `;
  plot.appendChild(defs);

  renderGrid();
  renderSlideTitle();
  renderAssignedLinks();
  renderDistanceLines();
  renderMoveArrows();
  renderHoverPreview();
  renderPoints();
  renderCenters();
}

function renderGrid() {
  for (let tick = MIN; tick <= MAX; tick++) {
    const verticalStart = worldToSvg({ x: tick, y: MIN });
    const verticalEnd = worldToSvg({ x: tick, y: MAX });
    const horizontalStart = worldToSvg({ x: MIN, y: tick });
    const horizontalEnd = worldToSvg({ x: MAX, y: tick });

    const isAxis = tick === 0;
    const stroke = isAxis ? "#64748b" : "#e2e8f0";
    const width = isAxis ? 1.5 : 1;

    plot.appendChild(
      svgElement("line", {
        x1: verticalStart.x,
        y1: verticalStart.y,
        x2: verticalEnd.x,
        y2: verticalEnd.y,
        stroke,
        "stroke-width": width,
      })
    );

    plot.appendChild(
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
      plot.appendChild(xText);

      const yText = svgElement("text", {
        x: axis.x + 10,
        y: horizontalStart.y + 4,
        "font-size": 10,
        fill: "#94a3b8",
      });
      yText.textContent = tick;
      plot.appendChild(yText);
    }
  }
}

function renderSlideTitle() {
  let text = "";

  if (!state.points.length) {
    text = "Плоскость пустая: сначала нужно поставить точки";
  } else if (state.centers.length < state.k) {
    text = `Нужно поставить центроиды: ${state.centers.length} из ${state.k}`;
  } else if (state.phase === "overview") {
    text = "Общая плоскость: видим все точки и центроиды";
  } else if (state.phase === "focus") {
    text = `Фокус на одной точке: рассматриваем P${getActivePoint().id}`;
  } else if (state.phase === "measure") {
    text = `Считаем расстояния от P${getActivePoint().id} до каждого центроида`;
  } else if (state.phase === "assign") {
    text = `Выбираем минимальное расстояние и красим P${getActivePoint().id}`;
  } else if (state.phase === "centroid") {
    text = `Пересчитываем новый центр C${state.activeClusterIndex + 1}'`;
  } else if (state.phase === "move") {
    text = "Двигаем старые центроиды в новые позиции";
  } else {
    text = "Алгоритм сошёлся";
  }

  plot.appendChild(
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
  plot.appendChild(label);
}

function renderAssignedLinks() {
  if (state.phase === "focus" || state.phase === "measure") return;
  if (state.centers.length < state.k) return;

  state.points.forEach((point, pointIndex) => {
    const cluster = state.assignments[pointIndex];

    if (cluster === null) return;

    const p = worldToSvg(point);
    const c = worldToSvg(state.centers[cluster]);

    plot.appendChild(
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

function renderDistanceLines() {
  if (state.phase !== "measure" && state.phase !== "assign") return;
  if (state.centers.length < state.k) return;

  const activePoint = getActivePoint();
  const p = worldToSvg(activePoint);
  const rows = getDistanceRows();

  rows.forEach((row) => {
    const c = worldToSvg(row.center);
    const color =
      state.phase === "assign" && row.nearest
        ? paletteAt(row.index).center
        : "#94a3b8";

    const strong = state.phase === "assign" && row.nearest;
    const midX = (p.x + c.x) / 2;
    const midY = (p.y + c.y) / 2;

    plot.appendChild(
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

    plot.appendChild(
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
    plot.appendChild(label);

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
      plot.appendChild(minLabel);
    }
  });
}

function renderMoveArrows() {
  if (state.phase !== "centroid" && state.phase !== "move") return;
  if (!state.oldCenters || !state.nextCenters) return;

  if (state.phase === "centroid") {
    const clusterIndex = state.activeClusterIndex;
    const oldCenter = state.oldCenters[clusterIndex];
    const newCenter = state.nextCenters[clusterIndex];
    const oldSvg = worldToSvg(oldCenter);
    const newSvg = worldToSvg(newCenter);
    const color = paletteAt(clusterIndex).center;
    const members = getClusterMembers(clusterIndex);

    members.forEach((point) => {
      const p = worldToSvg(point);

      plot.appendChild(
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

    plot.appendChild(
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

    drawNewCenter(newSvg, clusterIndex);
    return;
  }

  state.oldCenters.forEach((oldCenter, index) => {
    const newCenter = state.nextCenters[index];
    const oldSvg = worldToSvg(oldCenter);
    const newSvg = worldToSvg(newCenter);
    const color = paletteAt(index).center;

    plot.appendChild(
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

    drawNewCenter(newSvg, index);
  });
}

function drawNewCenter(svg, index) {
  plot.appendChild(
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
  plot.appendChild(text);
}

function renderHoverPreview() {
  if (!state.hoverWorld) return;

  const hoverSvg = worldToSvg(state.hoverWorld);

  if (state.clickMode === "erase") {
    const rx = (state.eraserRadius / (MAX - MIN)) * (SVG_W - 2 * PAD);
    const ry = (state.eraserRadius / (MAX - MIN)) * (SVG_H - 2 * PAD);

    plot.appendChild(
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

  if (state.clickMode === "center" && state.centers.length < state.k) {
    const nextIndex = state.centers.length;
    const color = paletteAt(nextIndex).center;

    plot.appendChild(
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
    plot.appendChild(label);
  }
}

function renderPoints() {
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
      plot.appendChild(
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

    plot.appendChild(
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
      plot.appendChild(text);
    }
  });
}

function renderCenters() {
  const visibleCenters =
    (state.phase === "centroid" || state.phase === "move") && state.oldCenters
      ? state.oldCenters
      : state.centers;

  visibleCenters.forEach((center, index) => {
    const svg = worldToSvg(center);
    const color = paletteAt(index).center;

    plot.appendChild(
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
    plot.appendChild(label);

    const coords = svgElement("text", {
      x: svg.x + 18,
      y: svg.y + 25,
      "font-size": 11,
      "font-weight": 800,
      fill: color,
    });

    coords.textContent = `(${format(center.x)}, ${format(center.y)})`;
    plot.appendChild(coords);
  });
}

function placeCenter(worldPoint) {
  if (state.centers.length >= state.k) {
    log(`Уже поставлено ${state.k} из ${state.k} центроидов. Если хотите заново, нажмите «Очистить центроиды».`);
    render();
    return;
  }

  const nextIndex = state.centers.length;

  state.centers = [
    ...state.centers,
    {
      id: `C${nextIndex + 1}`,
      x: worldPoint.x,
      y: worldPoint.y,
    },
  ];

  resetAlgorithmAfterDataChange(
    `Поставлен C${nextIndex + 1}. Сейчас центроидов ${state.centers.length} из ${state.k}.`
  );
}

function eraseAt(worldPoint) {
  const beforePoints = state.points.length;
  const beforeCenters = state.centers.length;

  state.points = state.points.filter(
    (point) => distance(point, worldPoint) > state.eraserRadius
  );

  state.centers = state.centers.filter(
    (center) => distance(center, worldPoint) > state.eraserRadius
  );

  renumberCenters();

  const removedPoints = beforePoints - state.points.length;
  const removedCenters = beforeCenters - state.centers.length;

  if (removedPoints > 0 || removedCenters > 0) {
    clearAlgorithmProgress();
  }

  return {
    removedPoints,
    removedCenters,
  };
}

autoPointsBtn.addEventListener("click", () => runWithUndo(() => {
  state.points = generateRandomPoints(state.k);
  state.centers = [];
  state.assignments = Array(state.points.length).fill(null);
  state.phase = "need-centers";
  state.iteration = 1;
  state.activePointIndex = 0;
  state.activeClusterIndex = 0;
  state.oldCenters = null;
  state.nextCenters = null;

  stopAutoPlay();

  state.story = [
    "Точки автоматически поставлены. Теперь поставьте центроиды вручную или нажмите «Случайные центроиды».",
  ];

  render();
}));

backBtn.addEventListener("click", undoLastStep);
nextBtn.addEventListener("click", () => runWithUndo(advance));
playBtn.addEventListener("click", toggleAutoPlay);

randomCentersBtn.addEventListener("click", () => runWithUndo(() => {
  if (!state.points.length) {
    log("Сначала нужно поставить точки, а потом уже выбирать случайные центроиды.");
    render();
    return;
  }

  state.centers = randomCenters(state.points, state.k);

  resetAlgorithmAfterDataChange(
    "Центроиды выбраны случайно. Теперь можно запускать алгоритм."
  );
}));

clearCentersBtn.addEventListener("click", () => runWithUndo(() => {
  if (!state.centers.length) {
    log("Центроиды уже очищены.");
    render();
    return;
  }

  state.centers = [];

  resetAlgorithmAfterDataChange(
    "Все центроиды удалены. Точки остались на плоскости."
  );
}));

clearPointsBtn.addEventListener("click", () => runWithUndo(() => {
  state.points = [];
  state.centers = [];
  state.assignments = [];
  state.phase = "empty";
  state.iteration = 1;
  state.activePointIndex = 0;
  state.activeClusterIndex = 0;
  state.oldCenters = null;
  state.nextCenters = null;
  state.hoverWorld = null;

  stopAutoPlay();

  state.story = [
    "Все точки очищены. Центроиды тоже удалены, потому что без точек алгоритм запускать нельзя.",
  ];

  render();
}));

if (newPointsBtn) {
newPointsBtn.addEventListener("click", () => runWithUndo(() => {
  state.points = generateRandomPoints(state.k);
  state.centers = [];
  state.assignments = Array(state.points.length).fill(null);
  state.phase = "need-centers";
  state.iteration = 1;
  state.activePointIndex = 0;
  state.activeClusterIndex = 0;
  state.oldCenters = null;
  state.nextCenters = null;

  stopAutoPlay();

  state.story = [
    "Создан новый случайный набор точек. Центроиды очищены: задайте их заново.",
  ];

  render();
}));
}

pointModeBtn.addEventListener("click", () => setClickMode("point"));
burstModeBtn.addEventListener("click", () => setClickMode("burst"));
centerModeBtn.addEventListener("click", () => setClickMode("center"));
eraseModeBtn.addEventListener("click", () => setClickMode("erase"));

kInput.addEventListener("change", (event) => runWithUndo(() => {
  const parsedValue = Number.parseInt(event.target.value, 10);
  const nextK = Math.max(Number.isFinite(parsedValue) ? parsedValue : 2, 1);
  const previousK = state.k;

  event.target.value = nextK;
  state.k = nextK;

  if (state.centers.length > nextK) {
    state.centers = state.centers.slice(0, nextK);
    renumberCenters();
  }

  clearAlgorithmProgress();

  if (nextK > previousK) {
    log(`Количество кластеров увеличено до k = ${nextK}. Точки остались. Теперь нужно добавить недостающие центроиды.`);
  } else if (nextK < previousK) {
    log(`Количество кластеров уменьшено до k = ${nextK}. Точки остались, лишние центроиды удалены.`);
  } else {
    log(`Количество кластеров осталось k = ${nextK}.`);
  }

  render();
}));

plot.addEventListener("mousemove", (event) => {
  const worldPoint = eventToWorld(event);
  state.hoverWorld = worldPoint;

  if (state.clickMode === "erase" && isErasing) {
    const removed = eraseAt(worldPoint);

    eraseSession.points += removed.removedPoints;
    eraseSession.centers += removed.removedCenters;

    render();
    return;
  }

  if (state.clickMode === "erase" || state.clickMode === "center") {
    render();
  }
});

plot.addEventListener("mousedown", (event) => {
  if (state.clickMode !== "erase") return;

  event.preventDefault();

  isErasing = true;
  ignoreNextPlotClick = true;
  eraseSession = {
    points: 0,
    centers: 0,
    snapshot: cloneState(),
  };

  const worldPoint = eventToWorld(event);
  state.hoverWorld = worldPoint;

  const removed = eraseAt(worldPoint);

  eraseSession.points += removed.removedPoints;
  eraseSession.centers += removed.removedCenters;

  render();
});

document.addEventListener("mouseup", () => {
  if (!isErasing) return;

  isErasing = false;

  if (eraseSession.points > 0 || eraseSession.centers > 0) {
    saveUndoSnapshot(eraseSession.snapshot);

    const parts = [];

    if (eraseSession.points > 0) {
      parts.push(`${eraseSession.points} ${eraseSession.points === 1 ? "точку" : eraseSession.points < 5 ? "точки" : "точек"}`);
    }

    if (eraseSession.centers > 0) {
      parts.push(`${eraseSession.centers} ${eraseSession.centers === 1 ? "центроид" : eraseSession.centers < 5 ? "центроида" : "центроидов"}`);
    }

    log(`Ластик удалил: ${parts.join(" и ")}.`);
  } else {
    log("Ластик ничего не удалил: в выбранном радиусе не было точек или центроидов.");
  }

  eraseSession = {
    points: 0,
    centers: 0,
    snapshot: null,
  };

  render();
});

plot.addEventListener("mouseleave", () => {
  state.hoverWorld = null;

  if (state.clickMode === "erase" || state.clickMode === "center") {
    render();
  }
});

plot.addEventListener("click", (event) => {
  if (ignoreNextPlotClick) {
    ignoreNextPlotClick = false;
    return;
  }

  runWithUndo(() => {
  const worldPoint = eventToWorld(event);

  if (state.clickMode === "point") {
    state.points = [
      ...state.points,
      {
        id: getNextPointId(),
        x: worldPoint.x,
        y: worldPoint.y,
      },
    ];

    resetAlgorithmAfterDataChange(
      "Добавлена новая точка вручную. Алгоритм сброшен и готов к новому запуску."
    );

    return;
  }

  if (state.clickMode === "burst") {
    state.points = [...state.points, ...createClusteredPointsAround(worldPoint, 6)];

    resetAlgorithmAfterDataChange(
      "Добавлена группа из 6 точек. Алгоритм сброшен и готов к новому запуску."
    );

    return;
  }

  if (state.clickMode === "center") {
    placeCenter(worldPoint);
    return;
  }
  });
});

render();
