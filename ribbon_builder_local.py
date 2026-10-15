# -*- coding: utf-8 -*-
"""
Ribbon Builder 로컬 실행기

브라우저로 "다운로드"한 파일에는 Windows가 '인터넷에서 받음' 표시를 붙이고,
엑셀은 그런 .xlam/.xlsm의 매크로를 조용히 막는다. 웹 페이지(github.io든 file://든)에서는
이 표시를 막을 방법이 없다.

이 프로그램은 ribbon-editor.html을 이 PC(127.0.0.1)에서 열어 주고, "저장하기"를 누르면
브라우저 다운로드 대신 이 프로그램이 파일을 직접 쓴다. 그래서 표시가 붙지 않는다.
  - .xlam → 엑셀 추가 기능 폴더(%APPDATA%\\Microsoft\\AddIns)
  - 그 밖(.xlsm/.xlsx/.xlsb) → 다운로드 폴더

이 PC 안에서만 열리고(127.0.0.1), Ribbon Builder 페이지에서 보낸 저장 요청만 받는다.
"""
import http.server
import json
import os
import re
import socket
import sys
import urllib.parse
import webbrowser

PORT = 8790
ORIGIN = f"http://127.0.0.1:{PORT}"
HERE = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.join(HERE, "ribbon-editor.html")
ADDINS = os.path.join(os.environ.get("APPDATA", HERE), "Microsoft", "AddIns")
DOWNLOADS = os.path.join(os.path.expanduser("~"), "Downloads")
MAX_BYTES = 50 * 1024 * 1024
ALLOWED_EXT = {".xlam", ".xlsm", ".xlsx", ".xlsb"}


def safe_name(raw: str) -> str:
    name = os.path.basename(raw.replace("\\", "/"))
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip(" .")
    if os.path.splitext(name)[1].lower() not in ALLOWED_EXT:
        raise ValueError("엑셀 파일(.xlam/.xlsm/.xlsx/.xlsb)만 저장할 수 있습니다.")
    return name


def free_path(folder: str, name: str) -> str:
    base, ext = os.path.splitext(name)
    path = os.path.join(folder, name)
    n = 2
    while os.path.exists(path):
        path = os.path.join(folder, f"{base} ({n}){ext}")
        n += 1
    return path


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # 콘솔을 조용히
        pass

    def _send(self, code: int, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, data: dict) -> None:
        self._send(code, json.dumps(data, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path in ("/", "/index.html", "/ribbon-editor.html"):
            try:
                with open(HTML, "rb") as f:
                    self._send(200, f.read(), "text/html; charset=utf-8")
            except OSError:
                self._send(404, "ribbon-editor.html을 찾지 못했습니다. 이 프로그램과 같은 폴더에 두세요.".encode("utf-8"), "text/plain; charset=utf-8")
        elif path == "/api/ping":
            self._json(200, {"ok": True, "addins": ADDINS, "downloads": DOWNLOADS})
        else:
            self._send(404, b"not found", "text/plain")

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        if url.path != "/api/save":
            return self._json(404, {"ok": False, "error": "not found"})
        # 다른 사이트가 이 PC의 도우미로 파일을 써 넣지 못하게: 같은 출처 + 전용 헤더만 받는다.
        if self.headers.get("Origin") != ORIGIN or self.headers.get("X-Ribbon-Builder") != "1":
            return self._json(403, {"ok": False, "error": "Ribbon Builder 페이지에서만 저장할 수 있습니다."})
        try:
            name = safe_name(urllib.parse.parse_qs(url.query).get("name", [""])[0])
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_BYTES:
                raise ValueError("파일 크기가 올바르지 않습니다.")
            data = self.rfile.read(length)
            folder = ADDINS if name.lower().endswith(".xlam") else DOWNLOADS
            os.makedirs(folder, exist_ok=True)
            path = free_path(folder, name)
            with open(path, "wb") as f:
                f.write(data)
            print(f"저장: {path}")
            self._json(200, {"ok": True, "path": path, "folder": folder})
        except Exception as e:  # noqa: BLE001 — 사용자에게 이유를 그대로 보여 준다
            self._json(400, {"ok": False, "error": str(e)})


def main() -> None:
    url = ORIGIN + "/"
    with socket.socket() as s:
        busy = s.connect_ex(("127.0.0.1", PORT)) == 0
    if busy:
        print("이미 실행 중입니다. 브라우저만 엽니다:", url)
        webbrowser.open(url)
        return
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print("Ribbon Builder 로컬 실행기")
    print("  주소:", url)
    print("  .xlam 저장 위치:", ADDINS)
    print("  그 밖의 파일 저장 위치:", DOWNLOADS)
    print("이 창을 닫으면 종료됩니다.")
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
