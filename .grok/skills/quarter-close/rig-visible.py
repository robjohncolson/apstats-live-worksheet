"""rig-visible.py: is the Schoology rig Edge page visible? READ-ONLY.

    python .grok/skills/quarter-close/rig-visible.py

Reads http://127.0.0.1:9223/json, takes the first page target, and evaluates
document.visibilityState (nothing else, no navigation, no input).
Prints "visible", "hidden", or "rig not running". Exit 0 visible, 1 hidden, 2 not running.
A hidden page makes the final stop with "grid rendered no columns / no student row".
"""
import json
import sys
from urllib.request import urlopen

import websocket  # websocket-client, the same library tools/cdp/edge.py uses

PORT = 9223


def first_page_target():
    try:
        targets = json.loads(urlopen("http://127.0.0.1:%d/json" % PORT, timeout=3).read())
    except Exception:
        return None
    pages = [t for t in targets if t.get("type") == "page" and t.get("webSocketDebuggerUrl")]
    return pages[0] if pages else None


def visibility_of(target):
    ws = websocket.create_connection(target["webSocketDebuggerUrl"], timeout=10)
    try:
        ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate",
                            "params": {"expression": "document.visibilityState"}}))
        while True:
            reply = json.loads(ws.recv())
            if reply.get("id") == 1:
                return reply["result"]["result"].get("value")
    finally:
        ws.close()


def main():
    target = first_page_target()
    if target is None:
        print("rig not running")
        return 2
    state = visibility_of(target)
    print("visible" if state == "visible" else "hidden (%s)" % state)
    return 0 if state == "visible" else 1


if __name__ == "__main__":
    sys.exit(main())
