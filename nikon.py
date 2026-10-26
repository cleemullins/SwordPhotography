"""Small client for the Nikon camera MCP server, plus NEF preview extraction.

    python nikon.py capture            take a picture, print its path
    python nikon.py preview FILE.nef   save the NEF's largest embedded JPEG next to it

The server address and bearer token come from the environment:

    NIKON_MCP_URL     default http://127.0.0.1:50507/mcp
    NIKON_MCP_TOKEN   required
"""
import json
import os
import sys
import time
import urllib.request

URL = os.environ.get("NIKON_MCP_URL", "http://127.0.0.1:50507/mcp")


def _token():
    token = os.environ.get("NIKON_MCP_TOKEN")
    if not token:
        raise SystemExit("set NIKON_MCP_TOKEN to the Nikon MCP server's bearer token")
    return token


def call(tool, arguments=None):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                       "params": {"name": tool, "arguments": arguments or {}}}).encode()
    request = urllib.request.Request(URL, data=body, headers={
        "Authorization": f"Bearer {_token()}",
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(request, timeout=60) as response:
        reply = json.loads(response.read())
    if "error" in reply:
        raise RuntimeError(f"{tool}: {reply['error']}")
    return reply["result"]["structuredContent"]


def capture(timeout=30.0):
    """Takes a picture and returns the path of the saved file."""
    before = call("nikon_camera_get_state")["state"].get("lastCapturedImagePath")
    result = call("nikon_camera_capture")
    if not result.get("ok"):
        raise RuntimeError(f"capture refused: {result}")
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        time.sleep(0.5)
        state = call("nikon_camera_get_state")["state"]
        path = state.get("lastCapturedImagePath")
        if path and path != before and state.get("statusMessage", "").startswith("Saved"):
            return path
    raise TimeoutError(f"no saved image within {timeout:.0f} s; last state: {state}")


def _jpeg_end(data, start):
    """Returns the index just past the JPEG starting at `start`, or None if it is malformed."""
    i = start + 2
    while i + 4 <= len(data):
        if data[i] != 0xFF:
            return None
        marker = data[i + 1]
        if marker == 0xD9:
            return i + 2
        if 0xD0 <= marker <= 0xD7 or marker == 0x01:
            i += 2
            continue
        length = int.from_bytes(data[i + 2:i + 4], "big")
        i += 2 + length
        if marker == 0xDA:
            # Entropy-coded data: ends at a marker other than FF00 or RSTn.
            while i + 1 < len(data):
                if data[i] == 0xFF and data[i + 1] not in (0x00, *range(0xD0, 0xD8)):
                    break
                i += 1
    return None


def preview(nef_path, out_path=None):
    """Saves the largest JPEG embedded in a NEF file and returns its path."""
    data = open(nef_path, "rb").read()
    best = b""
    start = data.find(b"\xff\xd8\xff")
    while start != -1:
        end = _jpeg_end(data, start)
        if end and end - start > len(best):
            best = data[start:end]
        start = data.find(b"\xff\xd8\xff", (end or start + 3))
    if not best:
        raise ValueError(f"no embedded JPEG in {nef_path}")
    out_path = out_path or nef_path.rsplit(".", 1)[0] + "_preview.jpg"
    with open(out_path, "wb") as f:
        f.write(best)
    return out_path


if __name__ == "__main__":
    if sys.argv[1:2] == ["capture"]:
        print(capture())
    elif sys.argv[1:2] == ["preview"]:
        print(preview(sys.argv[2]))
    else:
        print(__doc__)
