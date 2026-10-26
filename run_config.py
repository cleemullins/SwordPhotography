"""Settings for "Create a run": the Nikon MCP token and the last run's answers.

    python run_config.py show
        JSON: whether the token is stored (never the token itself) and the
        saved defaults for start, stop and interval.
    python run_config.py set-token
        Reads the token from stdin and stores it in the user environment
        variable NIKON_MCP_TOKEN, which nikon.py reads when it needs it.
    python run_config.py plan START STOP INTERVAL
        Checks a run against the slider's travel and prints its stops as JSON.
    python run_config.py save START STOP INTERVAL
        Remembers these answers as the defaults for the next run.
    python run_config.py slider-status
        Connects to the slider (nothing moves) and prints JSON: whether it reports
        itself calibrated, where it is, and the rail ends in use.
    python run_config.py set-ends RIGHT_CM LEFT_CM
        Stores the slide_cm read at the far right and far left ends of the rail in
        slider_calibration.json, and prints how far they moved since the last time.

Defaults are kept in run_defaults.json and the rail ends in slider_calibration.json,
both next to this file and not committed.
"""
import json
import os
import sys
from datetime import datetime

import slider_goto
import slider_scan

DEFAULTS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "run_defaults.json")
TOKEN_VAR = "NIKON_MCP_TOKEN"
SECONDS_PER_SHOT = 8        # rough: move at 10%, settle 1 s, capture and save


def user_env(name):
    """Reads a variable from the Windows user environment (HKCU\\Environment)."""
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
            return winreg.QueryValueEx(key, name)[0]
    except FileNotFoundError:
        return None


def set_user_env(name, value):
    """Stores a variable in the Windows user environment and tells running programs."""
    import ctypes
    import winreg
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment", 0, winreg.KEY_SET_VALUE) as key:
        winreg.SetValueEx(key, name, 0, winreg.REG_SZ, value)
    # WM_SETTINGCHANGE so newly started programs pick it up without a sign-out.
    ctypes.windll.user32.SendMessageTimeoutW(0xFFFF, 0x001A, 0, "Environment", 0x0002, 5000, None)


def load_defaults():
    try:
        with open(DEFAULTS_PATH) as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def plan(start, stop, interval):
    stops = slider_scan.plan_stops(start, stop, interval)
    low = slider_goto.RIGHT_END_CM + slider_goto.MARGIN_CM
    high = slider_goto.LEFT_END_CM - slider_goto.MARGIN_CM
    reach = (slider_scan.inch_for_cm(high), slider_scan.inch_for_cm(low))
    outside = [s for s in stops if not low <= slider_scan.cm_for_inch(s) <= high]
    return {
        "ok": not outside,
        "start": start, "stop": stop, "interval": interval,
        "shots": len(stops),
        "stops_inch": stops,
        "stops_cm": [round(slider_scan.cm_for_inch(s), 3) for s in stops],
        "reachable_inch": [round(reach[0], 2), round(reach[1], 2)],
        "outside_travel": outside,
        "includes_gray_card": slider_scan.GRAY_CARD_INCH in stops,
        "estimated_minutes": round(len(stops) * SECONDS_PER_SHOT / 60 + 0.5, 1),
    }


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else "show"
    if command == "show":
        print(json.dumps({"token_set": bool(os.environ.get(TOKEN_VAR) or user_env(TOKEN_VAR)),
                          "defaults": load_defaults()}))
    elif command == "set-token":
        token = sys.stdin.readline().strip()
        if not token:
            raise SystemExit("no token on stdin")
        set_user_env(TOKEN_VAR, token)
        print(f"stored in user environment variable {TOKEN_VAR}")
    elif command in ("plan", "save"):
        start, stop, interval = (float(v) for v in sys.argv[2:5])
        if command == "plan":
            print(json.dumps(plan(start, stop, interval)))
        else:
            with open(DEFAULTS_PATH, "w") as f:
                json.dump({"start": start, "stop": stop, "interval": interval}, f, indent=2)
            print(f"saved defaults to {DEFAULTS_PATH}")
    elif command == "slider-status":
        import edelkrone
        device = edelkrone.connect(mac=slider_goto.MAC)
        try:
            status = device.status
            print(json.dumps({
                "is_calibrated": status.is_calibrated,
                "activity": status.activity.value if status.activity else None,
                "slide_cm": status.pose.slide_cm,
                "battery_percent": status.battery_percent,
                "right_end_cm": slider_goto.RIGHT_END_CM,
                "left_end_cm": slider_goto.LEFT_END_CM,
                "ends_from_file": os.path.exists(slider_goto.CALIBRATION_PATH),
            }))
        finally:
            device.disconnect()
    elif command == "set-ends":
        right, left = float(sys.argv[2]), float(sys.argv[3])
        if left <= right:
            raise SystemExit("the left end must read higher than the right end (right = lower slide_cm)")
        previous_travel = slider_goto.LEFT_END_CM - slider_goto.RIGHT_END_CM
        with open(slider_goto.CALIBRATION_PATH, "w") as f:
            json.dump({"right_end_cm": right, "left_end_cm": left,
                       "measured": datetime.now().isoformat(timespec="seconds")}, f, indent=2)
        print(json.dumps({
            "right_end_cm": right, "left_end_cm": left,
            "travel_cm": round(left - right, 3),
            "travel_change_cm": round((left - right) - previous_travel, 3),
            "right_end_moved_cm": round(right - slider_goto.RIGHT_END_CM, 3),
            "ruler_offset_cm": round(right - slider_goto.MEASURED_RIGHT_END_CM, 3),
        }))
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
