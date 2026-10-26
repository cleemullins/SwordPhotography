"""Drive the edelkrone SliderPLUS v5 (Motor Module V3) with an Xbox controller.

Left stick left/right moves the carriage; the further you push, the faster it
goes, up to MAX_SPEED. Let go of the stick and the slider stops.

Stop:   B button, Ctrl+C, or the stop button on the slider.
Quit:   B button or Ctrl+C (the slider is stopped before disconnecting).

The slider also stops if the controller disconnects. The controller only
sends a report when something changes, so a stick held still is not a sign
of a lost controller; Windows notices a lost Bluetooth link after a few
seconds. If the program itself stops responding, the slider stops on its
own about 1.5 s after the last command.

The controller is read through XInput when Windows offers it there, otherwise
as a raw Bluetooth HID device. On this PC Windows has done both on different
days: when it runs the controller as an XInput gamepad, raw HID reads get
nothing; when it doesn't, XInput reports no controller.

    python xbox_slider.py                    drive the slider
    python xbox_slider.py --controller-only  just print the stick, no slider
"""
import ctypes
import sys
import threading
import time
from ctypes import wintypes

MAC = "C4:DE:E2:EA:5A:E8"   # Motor Module V3 on the SliderPLUS v5
MAX_SPEED = 0.3             # fraction of the slider's maximum joystick speed
INVERT = True             # True if pushing right moves the carriage the wrong way
DEADZONE = 7849             # left-stick deadzone (of 32767), XInput's recommended value
INTERVAL = 0.1              # the SDK wants a joystick command about every 100 ms

XBOX_VID = 0x045E
XBOX_BT_PIDS = (0x02E0, 0x02FD, 0x0B13, 0x0B20, 0x0B22)  # Xbox One S / Series controllers over Bluetooth
BUTTON_B = 0x02             # in byte 14 of the Bluetooth input report


# --- Raw HID access (Windows SetupAPI + hid.dll) ---------------------------

class _GUID(ctypes.Structure):
    _fields_ = [("d1", wintypes.DWORD), ("d2", wintypes.WORD), ("d3", wintypes.WORD), ("d4", ctypes.c_ubyte * 8)]


class _InterfaceData(ctypes.Structure):
    _fields_ = [("cbSize", wintypes.DWORD), ("guid", _GUID), ("flags", wintypes.DWORD), ("reserved", ctypes.c_void_p)]


class _HidAttributes(ctypes.Structure):
    _fields_ = [("Size", wintypes.ULONG), ("VendorID", wintypes.USHORT),
                ("ProductID", wintypes.USHORT), ("Version", wintypes.USHORT)]


_setupapi = ctypes.WinDLL("setupapi", use_last_error=True)
_hid = ctypes.WinDLL("hid")
_k32 = ctypes.WinDLL("kernel32", use_last_error=True)
_setupapi.SetupDiGetClassDevsW.restype = ctypes.c_void_p
_setupapi.SetupDiGetClassDevsW.argtypes = [ctypes.POINTER(_GUID), wintypes.LPCWSTR, wintypes.HWND, wintypes.DWORD]
_setupapi.SetupDiEnumDeviceInterfaces.argtypes = [
    ctypes.c_void_p, ctypes.c_void_p, ctypes.POINTER(_GUID), wintypes.DWORD, ctypes.POINTER(_InterfaceData)]
_setupapi.SetupDiGetDeviceInterfaceDetailW.argtypes = [
    ctypes.c_void_p, ctypes.POINTER(_InterfaceData), ctypes.c_void_p, wintypes.DWORD,
    ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p]
_setupapi.SetupDiDestroyDeviceInfoList.argtypes = [ctypes.c_void_p]
_k32.CreateFileW.restype = wintypes.HANDLE
_k32.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p,
                             wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
_k32.CloseHandle.argtypes = [wintypes.HANDLE]
_INVALID_HANDLE = wintypes.HANDLE(-1).value


def _hid_paths():
    guid = _GUID()
    _hid.HidD_GetHidGuid(ctypes.byref(guid))
    devs = _setupapi.SetupDiGetClassDevsW(ctypes.byref(guid), None, None, 0x12)  # PRESENT | DEVICEINTERFACE
    try:
        index = 0
        while True:
            data = _InterfaceData(cbSize=ctypes.sizeof(_InterfaceData))
            if not _setupapi.SetupDiEnumDeviceInterfaces(devs, None, ctypes.byref(guid), index, ctypes.byref(data)):
                return
            index += 1
            need = wintypes.DWORD()
            _setupapi.SetupDiGetDeviceInterfaceDetailW(devs, ctypes.byref(data), None, 0, ctypes.byref(need), None)
            buf = ctypes.create_string_buffer(need.value)
            ctypes.cast(buf, ctypes.POINTER(wintypes.DWORD))[0] = 8  # cbSize of the detail struct on 64-bit
            if _setupapi.SetupDiGetDeviceInterfaceDetailW(devs, ctypes.byref(data), buf, need, None, None):
                yield ctypes.wstring_at(ctypes.addressof(buf) + 4)
    finally:
        _setupapi.SetupDiDestroyDeviceInfoList(devs)


def _open_xbox_controller():
    """Returns a handle to the first Xbox Bluetooth controller found, or None."""
    for path in _hid_paths():
        if "045e" not in path.lower():
            continue
        handle = _k32.CreateFileW(path, 0x80000000, 3, None, 3, 0, None)  # GENERIC_READ, share read/write
        if handle == _INVALID_HANDLE:
            continue
        attrs = _HidAttributes(Size=ctypes.sizeof(_HidAttributes))
        _hid.HidD_GetAttributes(handle, ctypes.byref(attrs))
        if attrs.VendorID == XBOX_VID and attrs.ProductID in XBOX_BT_PIDS:
            return handle
        _k32.CloseHandle(handle)
    return None


class HidController:
    """Reads the controller's raw Bluetooth HID reports on a background thread.

    The controller only sends a report when something changes, so `age()`
    says how long ago the last one arrived.
    """

    def __init__(self, handle):
        self._handle = handle
        self._lock = threading.Lock()
        self._stick_x = 0
        self._b = False
        self._last = time.monotonic()
        self.connected = True
        threading.Thread(target=self._read_loop, daemon=True).start()

    def _read_loop(self):
        buf = ctypes.create_string_buffer(64)
        count = wintypes.DWORD()
        while True:
            if not _k32.ReadFile(self._handle, buf, 64, ctypes.byref(count), None):
                self.connected = False
                return
            report = buf.raw[: count.value]
            # Bluetooth report 0x01: left stick X is a little-endian 0..65535 at bytes 1-2, centre 32768.
            if len(report) >= 16 and report[0] == 0x01:
                with self._lock:
                    self._stick_x = int.from_bytes(report[1:3], "little") - 32768
                    self._b = bool(report[14] & BUTTON_B)
                    self._last = time.monotonic()

    def state(self):
        """Returns (stick_x, b_pressed, seconds_since_last_report)."""
        with self._lock:
            return self._stick_x, self._b, time.monotonic() - self._last

    def close(self):
        _k32.CloseHandle(self._handle)


# --- XInput -----------------------------------------------------------------

class _XInputGamepad(ctypes.Structure):
    _fields_ = [("wButtons", wintypes.WORD), ("bLeftTrigger", ctypes.c_ubyte),
                ("bRightTrigger", ctypes.c_ubyte), ("sThumbLX", ctypes.c_short),
                ("sThumbLY", ctypes.c_short), ("sThumbRX", ctypes.c_short), ("sThumbRY", ctypes.c_short)]


class _XInputState(ctypes.Structure):
    _fields_ = [("dwPacketNumber", wintypes.DWORD), ("Gamepad", _XInputGamepad)]


_xinput = ctypes.WinDLL("xinput1_4")
XINPUT_BUTTON_B = 0x2000


def _xinput_slot():
    """Returns the first XInput slot (0-3) with a controller, or None."""
    for slot in range(4):
        if _xinput.XInputGetState(slot, ctypes.byref(_XInputState())) == 0:
            return slot
    return None


class XInputController:
    """Reads the controller through XInput, polled on each call to state()."""

    def __init__(self, slot):
        self._slot = slot
        self._packet = None
        self._last = time.monotonic()
        self.connected = True

    def state(self):
        """Returns (stick_x, b_pressed, seconds_since_the_input_last_changed)."""
        s = _XInputState()
        if _xinput.XInputGetState(self._slot, ctypes.byref(s)) != 0:
            self.connected = False
            return 0, False, time.monotonic() - self._last
        if s.dwPacketNumber != self._packet:
            self._packet = s.dwPacketNumber
            self._last = time.monotonic()
        pad = s.Gamepad
        return pad.sThumbLX, bool(pad.wButtons & XINPUT_BUTTON_B), time.monotonic() - self._last

    def close(self):
        pass


# --- Controller to slider ---------------------------------------------------

def stick_to_speed(x):
    """Maps the stick value (-32768..32767) to a slide speed in [-MAX_SPEED, MAX_SPEED]."""
    if abs(x) < DEADZONE:
        return 0.0
    # Rescale past the deadzone to 0..1, then square it for finer control near centre.
    amount = min(1.0, (abs(x) - DEADZONE) / (32767 - DEADZONE))
    speed = amount * amount * MAX_SPEED
    if x < 0:
        speed = -speed
    return -speed if INVERT else speed


def wait_for_controller():
    """XInput when Windows offers the controller there; raw Bluetooth HID otherwise.

    When Windows runs the controller as an XInput gamepad, its xinputhid driver
    takes the input and raw HID readers receive nothing, so XInput comes first.
    """
    print("waiting for the Xbox controller (press its Xbox button to wake it) ...")
    while True:
        slot = _xinput_slot()
        if slot is not None:
            print(f"controller found (XInput slot {slot})")
            return XInputController(slot)
        handle = _open_xbox_controller()
        if handle is not None:
            print("controller found (raw Bluetooth HID)")
            return HidController(handle)
        time.sleep(0.5)


def controller_only():
    pad = wait_for_controller()
    print("move the left stick; B or Ctrl+C to quit")
    try:
        while pad.connected:
            x, b, age = pad.state()
            if b:
                return
            print(f"stick x {x:+6d}  ->  slide speed {stick_to_speed(x):+.2f}   last report {age:4.1f} s ago",
                  flush=True)
            time.sleep(0.5)
        print("\ncontroller lost")
    finally:
        pad.close()


def drive():
    import edelkrone

    pad = wait_for_controller()
    print(f"connecting to the slider {MAC} ...")
    device = edelkrone.connect(mac=MAC)
    try:
        if not device.move.wait_until_idle(timeout=10):
            print("slider is not idle; not driving it")
            return
        print(f"connected at {device.status.pose.slide_cm} cm, max speed {MAX_SPEED:.0%}")
        print("left stick moves the slider; B or Ctrl+C to stop and quit")
        moving = False
        while True:
            if not pad.connected:
                print("\ncontroller lost: stopping")
                return
            x, b, _ = pad.state()
            if b:
                print("\nB pressed: stopping")
                return
            speed = stick_to_speed(x)
            if speed != 0.0:
                device.move.joystick(slide=speed)
                moving = True
            elif moving:
                # A zero speed stops the axis at once.
                device.move.joystick(slide=0.0)
                moving = False
            print(f"\rspeed {speed:+.2f}   at {device.status.pose.slide_cm} cm   ", end="", flush=True)
            time.sleep(INTERVAL)
    finally:
        device.move.stop()
        print(f"\nstopped at {device.status.pose.slide_cm} cm")
        device.disconnect()
        pad.close()


if __name__ == "__main__":
    try:
        if "--controller-only" in sys.argv:
            controller_only()
        else:
            drive()
    except KeyboardInterrupt:
        print("\nCtrl+C: stopped")
