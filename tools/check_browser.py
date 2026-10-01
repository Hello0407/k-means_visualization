"""Run tests in installed Edge/Chrome. Requires Python and websocket-client."""
from __future__ import annotations

import functools
import http.server
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time
import urllib.request

import websocket

ROOT = Path(__file__).resolve().parent.parent


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def main():
    candidates = [
        os.environ.get("BROWSER_PATH", ""),
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    ]
    browser = next((path for path in candidates if path and Path(path).is_file()), None)
    if not browser:
        raise SystemExit("Set BROWSER_PATH to an installed Chromium browser.")
    artifacts = ROOT / ".test-artifacts"
    artifacts.mkdir(exist_ok=True)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    profile = tempfile.mkdtemp(prefix="browser-", dir=artifacts)
    process = subprocess.Popen([
        browser, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
        "--remote-debugging-port=0", "--remote-allow-origins=http://localhost",
        f"--user-data-dir={profile}", "about:blank",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    connection = None
    message_id = 0
    try:
        deadline = time.monotonic() + 25
        port_file = Path(profile) / "DevToolsActivePort"
        while not port_file.exists():
            if process.poll() is not None or time.monotonic() > deadline:
                raise RuntimeError("Browser did not start")
            time.sleep(0.1)
        port = port_file.read_text().splitlines()[0]
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/json") as response:
            page = next(page for page in json.load(response) if page["type"] == "page")
        connection = websocket.create_connection(page["webSocketDebuggerUrl"], origin="http://localhost", timeout=10)

        def command(method, params=None):
            nonlocal message_id
            message_id += 1
            connection.send(json.dumps({"id": message_id, "method": method, "params": params or {}}))
            while True:
                response = json.loads(connection.recv())
                if response.get("id") == message_id:
                    if "error" in response:
                        raise RuntimeError(response["error"])
                    return response.get("result", {})

        def evaluate(expression):
            response = command("Runtime.evaluate", {"expression": expression, "returnByValue": True, "awaitPromise": True})
            if "exceptionDetails" in response:
                raise RuntimeError(response["exceptionDetails"])
            return response["result"].get("value")

        command("Page.navigate", {"url": f"http://127.0.0.1:{server.server_port}/tests/index.html"})
        deadline = time.monotonic() + 40
        result = None
        while not result:
            result = evaluate("window.__testResult || null")
            if time.monotonic() > deadline:
                raise RuntimeError("Tests timed out")
            time.sleep(0.1)
        print(json.dumps(result, ensure_ascii=True, indent=2))
        (artifacts / "results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        if result["failed"]:
            raise SystemExit(1)

        # A separate page verifies real pointer capture, responsive coordinates, and file:// startup.
        command("Page.navigate", {"url": (ROOT / "index.html").as_uri()})
        deadline = time.monotonic() + 10
        while not evaluate("!!document.querySelector('[data-layer=scene]')"):
            if time.monotonic() > deadline:
                raise RuntimeError("file:// startup failed")
            time.sleep(0.1)
        evaluate("document.getElementById('pointModeBtn').click()")

        def settle():
            evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")

        def location(x, y):
            return evaluate(f"""(() => {{
                const plot = document.getElementById('plot');
                const p = plot.createSVGPoint();
                Object.assign(p, KMeans.coordinates.worldToSvg({{x: {x}, y: {y}}}));
                const screen = p.matrixTransform(plot.getScreenCTM());
                return {{x: screen.x, y: screen.y}};
            }})()""")

        def mouse(kind, point, pressed=False):
            command("Input.dispatchMouseEvent", {"type": kind, **point, "button": "left" if pressed or kind != "mouseMoved" else "none", "buttons": 1 if pressed else 0, "clickCount": 1})

        for width in [1440, 390]:
            command("Emulation.setDeviceMetricsOverride", {"width": width, "height": 1000, "deviceScaleFactor": 1, "mobile": False})
            evaluate("document.getElementById('clearPointsBtn').click(); document.getElementById('pointModeBtn').click()")
            settle()
            for x in [-2, 2]:
                point = location(x, 0)
                mouse("mousePressed", point, True)
                mouse("mouseReleased", point)
            settle()
            count = evaluate("document.querySelector('[data-layer=scene]').querySelectorAll('circle').length")
            assert count == 2, f"Point placement failed at width {width}: {count}"
            evaluate("document.getElementById('eraseModeBtn').click()")
            settle()
            start, end = location(-2, 0), location(2, 0)
            mouse("mousePressed", start, True)
            mouse("mouseMoved", end, True)
            mouse("mouseReleased", end)
            settle()
            assert evaluate("document.querySelector('[data-layer=scene]').querySelectorAll('circle').length") == 0
            evaluate("document.getElementById('backBtn').click()")
            settle()
            assert evaluate("document.querySelector('[data-layer=scene]').querySelectorAll('circle').length") == 2
            print(f"PASS: file://, real eraser drag and single undo at {width}px")
        print("All browser checks passed.")
    finally:
        if connection:
            try:
                connection.send(json.dumps({"id": message_id + 1, "method": "Browser.close"}))
                connection.close()
            except Exception:
                pass
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.terminate()
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
