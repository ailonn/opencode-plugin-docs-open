#!/usr/bin/env python3
"""TUI drive client for the opencode_tui_driver daemon (manual acceptance).

The daemon (opencode_tui_driver.py, state-dir protocol) exposes a JSONL
command interface: commands appended to <state-dir>/cmd.jsonl, answers
(matched by `id`) in <state-dir>/result.jsonl. This is a minimal blocking
client for the acceptance protocol in
qa/crash-cases/d2a-custom-renderer-crash.md (D13, C1-C7):

  tui-drive.py --state-dir DIR [--log FILE] <command> [args]

Commands:
  screen                 print the terminal grid (0-based line numbers)
  find T                 locate text on the grid ({x, y} or none)
  find-all T             all occurrences on the grid
  click X Y [BUTTON]     mouse click (button 0 = left, the default)
  wheel DELTA [X Y]      scroll (positive delta = up, one notch per unit)
  hover X Y              move the mouse, no button
  attr X Y               cell attributes {underline, bold, reverse, fg}
  text T                 send text to the focused input (bracketed paste)
  text-file F            send the file's content as text (multi-line, quoting-safe)
  keys NAME...           send named keys (e.g. escape, enter)
  send-raw HEX           send raw bytes (hex string) to the PTY
  wait-quiet [MS]        wait until the grid is stable (default 2000)
  wait-marker T [MS]     wait until T appears on the grid (default 60000)
  state                  daemon/child liveness
  log                    print the fake xdg-open log (--log)
"""
import argparse
import json
import os
import sys
import time


def make_client(state_dir):
    # Unique per process (millisecond timestamp): a fixed counter would
    # collide with the previous invocation's ids in result.jsonl and return
    # its stale answer instead of waiting for this command's.
    counter = [int(time.time() * 1000)]

    def cmd(payload, timeout=60):
        counter[0] += 1
        payload = dict(payload)
        payload.setdefault("id", str(counter[0]))
        with open(state_dir + "/cmd.jsonl", "a") as f:
            f.write(json.dumps(payload) + "\n")
        end = time.time() + timeout
        while time.time() < end:
            try:
                with open(state_dir + "/result.jsonl") as f:
                    for line in f:
                        try:
                            r = json.loads(line)
                        except Exception:
                            continue
                        if r.get("id") == payload["id"]:
                            return r
            except FileNotFoundError:
                pass
            time.sleep(0.2)
        return {"ok": False, "error": "timeout"}

    return cmd


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--state-dir", default="/tmp/opencode/docs-accept/d",
                    help="the daemon's state dir (default: %(default)s)")
    ap.add_argument("--log", default="/tmp/opencode/docs-accept/xdg.log",
                    help="fake xdg-open log for the `log` command (default: %(default)s)")
    ap.add_argument("command")
    ap.add_argument("args", nargs="*")
    a = ap.parse_args()
    cmd = make_client(a.state_dir)
    c, args = a.command, a.args

    if c == "screen":
        r = cmd({"cmd": "screen"})
        for i, line in enumerate(r.get("lines", r.get("screen", []))):
            print(f"{i:2d} {line.rstrip()}")
    elif c == "find":
        print(cmd({"cmd": "find", "text": args[0]}))
    elif c == "find-all":
        print(cmd({"cmd": "find-all", "text": args[0]}))
    elif c == "wheel":
        delta = int(args[0])
        x = int(args[1]) if len(args) > 1 else 5
        y = int(args[2]) if len(args) > 2 else 5
        print(cmd({"cmd": "wheel", "delta": delta, "x": x, "y": y}))
    elif c == "click":
        x, y = (int(v) for v in args[0:2])
        button = int(args[2]) if len(args) > 2 else 0
        print(cmd({"cmd": "click", "x": x, "y": y, "button": button}))
    elif c == "hover":
        x, y = (int(v) for v in args[0:2])
        print(cmd({"cmd": "hover", "x": x, "y": y}))
    elif c == "attr":
        x, y = (int(v) for v in args[0:2])
        print(cmd({"cmd": "attr", "x": x, "y": y}))
    elif c == "text":
        print(cmd({"cmd": "send-text", "text": args[0]}))
    elif c == "text-file":
        print(cmd({"cmd": "send-text", "text": open(args[0]).read()}))
    elif c == "keys":
        print(cmd({"cmd": "send-keys", "names": args}))
    elif c == "send-raw":
        print(cmd({"cmd": "send-raw", "hex": args[0]}))
    elif c == "wait-quiet":
        ms = int(args[0]) if args else 2000
        print(cmd({"cmd": "wait-quiet", "ms": ms}, timeout=180))
    elif c == "wait-marker":
        ms = int(args[1]) if len(args) > 1 else 60000
        print(cmd({"cmd": "wait-marker", "text": args[0], "ms": ms}, timeout=180))
    elif c == "state":
        print(cmd({"cmd": "state"}))
    elif c == "log":
        print(open(a.log).read() if os.path.exists(a.log) else "(vide)")
    else:
        ap.error(f"unknown command {c!r}")


if __name__ == "__main__":
    main()
