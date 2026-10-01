"use strict";

const iframe = document.getElementById("application");
iframe.addEventListener("load", async () => {
  const browser = iframe.contentWindow;
  const app = browser.KMeans;
  const doc = browser.document;
  const results = [];
  const errors = [];
  browser.addEventListener("error", (event) => errors.push(event.message));
  const assert = (condition, message = "Assertion failed") => { if (!condition) throw new Error(message); };
  const equal = (actual, expected) => assert(JSON.stringify(actual) === JSON.stringify(expected), `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
  const frame = () => new Promise((resolve) => browser.requestAnimationFrame(() => browser.requestAnimationFrame(resolve)));
  const button = (id) => doc.getElementById(id);
  const plot = button("plot");
  const scene = () => plot.querySelector('[data-layer="scene"]');
  const pointLabels = () => [...scene().querySelectorAll("text")].filter((item) => /^P\d+$/.test(item.textContent));
  const centerLabels = () => [...scene().querySelectorAll("text")].filter((item) => /^C\d+$/.test(item.textContent));
  async function click(id) { button(id).click(); await frame(); }
  async function test(name, run) {
    try { await run(); results.push({ name, passed: true }); }
    catch (error) { results.push({ name, passed: false, error: error.stack || String(error) }); }
  }
  function readyStore() {
    const store = app.store.createStore();
    for (const x of [-4, -2, 2, 4]) store.dispatch({ type: "add-point", point: { x, y: 0 } });
    for (const x of [-5, 5]) store.dispatch({ type: "add-center", point: { x, y: 0 } });
    return store;
  }
  function deepFreeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.freeze(value);
      Object.values(value).forEach(deepFreeze);
    }
    return value;
  }
  function plotEvent(type, point, extra = {}) {
    const svgPoint = plot.createSVGPoint();
    Object.assign(svgPoint, app.coordinates.worldToSvg(point));
    const screen = svgPoint.matrixTransform(plot.getScreenCTM());
    const EventClass = type.startsWith("pointer") ? browser.PointerEvent : browser.MouseEvent;
    plot.dispatchEvent(new EventClass(type, { bubbles: true, clientX: screen.x, clientY: screen.y, ...extra }));
  }

  await test("Расстояния, ближайший центр и равные расстояния", () => {
    near(app.kmeans.distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
    equal(app.kmeans.nearestCluster({ x: 0, y: 0 }, [{ x: -1, y: 0 }, { x: 1, y: 0 }]), 0);
    equal(app.kmeans.nearestCluster({ x: 0, y: 0 }, []), -1);
  });
  await test("Средние координаты и сохранение пустого кластера", () => {
    const centers = [{ id: "C1", x: 0, y: 0 }, { id: "C2", x: 5, y: 5 }];
    const next = app.kmeans.recomputeCenters([{ x: 1, y: 3 }, { x: 3, y: 5 }], centers, [0, 0]);
    equal(next, [{ id: "C1", x: 2, y: 4, empty: false }, { id: "C2", x: 5, y: 5, empty: true }]);
    equal(centers[0], { id: "C1", x: 0, y: 0 });
  });
  await test("Неподготовленные данные не запускают алгоритм и не засоряют историю", () => {
    const store = app.store.createStore();
    assert(!store.dispatch({ type: "advance" }));
    assert(!store.dispatch({ type: "random-centers" }));
    assert(!store.dispatch({ type: "clear-points" }));
    assert(!store.canUndo());
    store.dispatch({ type: "add-point", point: { x: 0, y: 0 } });
    const state = store.getState();
    assert(!store.dispatch({ type: "advance" }));
    assert(store.getState() === state);
  });
  await test("Полный цикл сохраняет фазы и сходится к ожидаемым центрам", () => {
    const store = readyStore();
    for (const phase of ["focus", "measure", "assign", "overview"]) {
      store.dispatch({ type: "advance" });
      equal(store.getState().phase, phase);
    }
    const seen = new Set();
    for (let steps = 0; app.simulation.canAdvance(store.getState()) && steps < 300; steps++) {
      deepFreeze(store.getState());
      store.dispatch({ type: "advance" });
      seen.add(store.getState().phase);
    }
    const state = store.getState();
    equal(state.phase, "done");
    equal(state.iteration, 2);
    equal(state.assignments, [0, 0, 1, 1]);
    equal(state.centers, [{ id: "C1", x: -3, y: 0 }, { id: "C2", x: 3, y: 0 }]);
    assert(seen.has("centroid") && seen.has("move"));
    assert(!store.dispatch({ type: "advance" }));
  });
  await test("Изменение данных сбрасывает расчёт; шаг назад возвращает точный снимок", () => {
    const store = readyStore();
    for (let i = 0; i < 3; i++) store.dispatch({ type: "advance" });
    const previous = store.getState();
    store.dispatch({ type: "add-burst", point: { x: 0, y: 0 } });
    equal(store.getState().points.length, 10);
    equal(store.getState().assignments, Array(10).fill(null));
    equal(store.getState().iteration, 1);
    store.undo();
    assert(store.getState() === previous);
    equal(store.getState().assignments, [0, null, null, null]);
  });
  await test("Один жест ластика отменяется одним шагом", () => {
    const store = readyStore();
    const before = store.getState();
    store.beginTransaction();
    store.dispatch({ type: "erase", point: { x: -4, y: 0 } });
    store.dispatch({ type: "erase", point: { x: -5, y: 0 } });
    store.dispatch({ type: "erase", point: { x: 4, y: 0 } });
    store.commitTransaction();
    equal(store.getState().points.length, 2);
    equal(store.getState().centers[0].id, "C1");
    equal(store.getState().phase, "need-centers");
    store.undo();
    assert(store.getState() === before);
  });
  await test("Пустой жест ластика не создаёт шаг истории; история ограничена", () => {
    const store = app.store.createStore({ historyLimit: 2 });
    store.beginTransaction();
    store.dispatch({ type: "erase", point: { x: 1, y: 1 } });
    store.commitTransaction();
    assert(!store.canUndo());
    for (let x = 0; x < 3; x++) store.dispatch({ type: "add-point", point: { x, y: 0 } });
    assert(store.undo());
    assert(store.undo());
    assert(!store.undo());
    equal(store.getState().points.length, 1);
  });
  await test("Изменение k сохраняет точки, обрезает центры и отменяется", () => {
    const store = readyStore();
    const before = store.getState();
    store.dispatch({ type: "set-k", value: "1" });
    assert(store.getState().points === before.points);
    equal(store.getState().centers.length, 1);
    store.undo();
    assert(store.getState() === before);
    store.dispatch({ type: "set-k", value: "3" });
    equal(store.getState().phase, "need-centers");
    assert(!store.dispatch({ type: "set-k", value: "invalid" }));
    equal(app.data.normalizeK(-5), 1);
    equal(app.data.normalizeK(1e20), app.config.DEFAULT_K);
    equal(app.data.normalizeK(1000), 1000);
  });
  await test("Генерация и случайные центры: границы, уникальные ID, k больше числа точек", () => {
    const store = app.store.createStore({ random: () => 0.25 });
    store.dispatch({ type: "generate" });
    equal(store.getState().points.length, 12);
    equal(new Set(store.getState().points.map((p) => p.id)).size, 12);
    assert(store.getState().points.every((p) => Math.abs(p.x) <= 6 && Math.abs(p.y) <= 6));
    store.dispatch({ type: "clear-points" });
    store.dispatch({ type: "add-point", point: { x: 2, y: 3 } });
    store.dispatch({ type: "set-k", value: 4 });
    store.dispatch({ type: "random-centers" });
    equal(store.getState().centers.length, 4);
    for (let step = 0; app.simulation.canAdvance(store.getState()) && step < 300; step++) store.dispatch({ type: "advance" });
    equal(store.getState().phase, "done");
  });
  await test("Автопоказ использует один таймер и освобождает его при остановке", () => {
    let callback;
    let starts = 0;
    let stops = 0;
    let ticks = 0;
    const timers = { setInterval(fn) { callback = fn; starts++; return 0; }, clearInterval(id) { equal(id, 0); stops++; } };
    const playback = app.playback.createPlayback(() => ++ticks < 2, timers);
    playback.start(); playback.start();
    equal(starts, 1);
    callback(); assert(playback.isPlaying());
    callback(); assert(!playback.isPlaying());
    playback.stop(); equal(stops, 1);
    playback.start(); playback.stop(); equal(stops, 2);
  });
  await test("Все прежние кнопки и начальный интерфейс доступны", () => {
    equal(doc.querySelectorAll("button").length, 11);
    assert(button("backBtn").disabled);
    equal(pointLabels().length, 0);
    assert(scene().textContent.includes("Плоскость пустая"));
  });
  await test("Реальные кнопки: генерация, центры, шаги, откат, очистка", async () => {
    await click("autoPointsBtn"); equal(pointLabels().length, 12);
    await click("randomCentersBtn"); equal(centerLabels().length, 2);
    await click("nextBtn"); assert(scene().textContent.includes("Фокус"));
    await click("nextBtn"); assert(scene().textContent.includes("Считаем расстояния"));
    await click("nextBtn"); assert(scene().textContent.includes("минимум"));
    await click("backBtn"); assert(scene().textContent.includes("Считаем расстояния"));
    await click("clearCentersBtn"); equal(centerLabels().length, 0); equal(pointLabels().length, 12);
    await click("clearPointsBtn"); equal(pointLabels().length, 0);
    await click("backBtn"); equal(pointLabels().length, 12);
    await click("clearPointsBtn");
  });
  await test("Ручное добавление точек, группы и центров", async () => {
    plotEvent("click", { x: -2, y: 1 }); await frame(); equal(pointLabels().length, 1);
    await click("burstModeBtn"); plotEvent("click", { x: 2, y: -1 }); await frame(); equal(pointLabels().length, 7);
    await click("centerModeBtn");
    plotEvent("click", { x: -3, y: 2 }); plotEvent("click", { x: 3, y: -2 }); await frame(); equal(centerLabels().length, 2);
    plotEvent("click", { x: 0, y: 0 }); await frame(); equal(centerLabels().length, 2);
    await click("backBtn"); equal(centerLabels().length, 1);
  });
  await test("Перемещение курсора сохраняет DOM сетки, точек и легенды", async () => {
    const grid = plot.querySelector('[data-layer="grid"]').firstChild;
    const sceneNode = scene().firstChild;
    const legendNode = button("legend").firstChild;
    plotEvent("pointermove", { x: 1, y: 1 }); await frame();
    assert(grid === plot.querySelector('[data-layer="grid"]').firstChild);
    assert(sceneNode === scene().firstChild);
    assert(legendNode === button("legend").firstChild);
    assert(plot.querySelector('[data-layer="preview"]').children.length > 0);
    await click("nextBtn");
    assert(grid === plot.querySelector('[data-layer="grid"]').firstChild);
  });
  await test("Координаты клика учитывают масштаб и поля SVG", () => {
    const point = { x: 3.2, y: -2.4 };
    const svgPoint = plot.createSVGPoint();
    Object.assign(svgPoint, app.coordinates.worldToSvg(point));
    const screen = svgPoint.matrixTransform(plot.getScreenCTM());
    const actual = app.coordinates.eventToWorld(plot, { clientX: screen.x, clientY: screen.y });
    assert(Math.abs(actual.x - point.x) < 1e-5 && Math.abs(actual.y - point.y) < 1e-5);
  });
  await test("Пауза, откат и изменение данных выключают автопоказ", async () => {
    await click("randomCentersBtn");
    await click("playBtn"); equal(button("playBtn").textContent, "Пауза");
    await click("nextBtn"); equal(button("playBtn").textContent, "Пауза");
    await click("playBtn"); equal(button("playBtn").textContent, "Авто-показ");
    await click("playBtn"); await click("backBtn"); equal(button("playBtn").textContent, "Авто-показ");
    await click("randomCentersBtn"); await click("playBtn"); await click("clearPointsBtn");
    equal(button("playBtn").textContent, "Авто-показ");
    await click("playBtn"); equal(button("playBtn").textContent, "Авто-показ");
  });
  await test("Контроллер освобождает обработчики при уничтожении", async () => {
    const fixture = doc.querySelector(".app").cloneNode(true);
    doc.body.appendChild(fixture);
    const controller = app.controller.createController(fixture);
    controller.destroy(); controller.destroy();
    fixture.querySelector("#autoPointsBtn").click(); await frame();
    assert(!fixture.querySelector('[data-layer="scene"]').textContent.includes("P1"));
    fixture.remove();
  });
  await test("Нет ошибок JavaScript при работе интерфейса", () => equal(errors, []));
  window.__testResult = { passed: results.filter((r) => r.passed).length, failed: results.filter((r) => !r.passed).length, results };
  document.getElementById("results").textContent = JSON.stringify(window.__testResult, null, 2);
  document.title = window.__testResult.failed ? "FAIL" : "PASS";
});
