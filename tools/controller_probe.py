# Read-only probe of the Xbox controller: XInput DLL variants, then raw HID reads.
# Run it, then move the left stick and press buttons for 30 s. On this PC XInput
# reported 1167 (not connected) everywhere while raw HID delivered reports; see
# docs/HOW_IT_WORKS.md.
import ctypes
import threading
import time
from ctypes import wintypes


class GP(ctypes.Structure):
    _fields_ = [("wButtons", wintypes.WORD), ("bLT", ctypes.c_ubyte), ("bRT", ctypes.c_ubyte),
                ("lx", ctypes.c_short), ("ly", ctypes.c_short), ("rx", ctypes.c_short), ("ry", ctypes.c_short)]


class ST(ctypes.Structure):
    _fields_ = [("pkt", wintypes.DWORD), ("gp", GP)]


print("--- XInput DLLs")
for dll in ("xinput1_4", "xinput1_3", "xinput9_1_0"):
    try:
        x = ctypes.WinDLL(dll)
    except OSError as e:
        print(f"{dll}: not loadable ({e})")
        continue
    results = []
    for i in range(4):
        s = ST()
        results.append(x.XInputGetState(i, ctypes.byref(s)))
    print(f"{dll}: {results}  (0 = connected, 1167 = not connected)")

print("--- raw HID")
setupapi = ctypes.WinDLL("setupapi", use_last_error=True)
hid = ctypes.WinDLL("hid")
k32 = ctypes.WinDLL("kernel32", use_last_error=True)


class GUID(ctypes.Structure):
    _fields_ = [("d1", wintypes.DWORD), ("d2", wintypes.WORD), ("d3", wintypes.WORD), ("d4", ctypes.c_ubyte * 8)]


class SP_DEVICE_INTERFACE_DATA(ctypes.Structure):
    _fields_ = [("cbSize", wintypes.DWORD), ("guid", GUID), ("flags", wintypes.DWORD), ("reserved", ctypes.c_void_p)]


class HIDD_ATTRIBUTES(ctypes.Structure):
    _fields_ = [("Size", wintypes.ULONG), ("VendorID", wintypes.USHORT), ("ProductID", wintypes.USHORT), ("Version", wintypes.USHORT)]


setupapi.SetupDiGetClassDevsW.restype = ctypes.c_void_p
setupapi.SetupDiGetClassDevsW.argtypes = [ctypes.POINTER(GUID), wintypes.LPCWSTR, wintypes.HWND, wintypes.DWORD]
setupapi.SetupDiEnumDeviceInterfaces.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.POINTER(GUID), wintypes.DWORD, ctypes.POINTER(SP_DEVICE_INTERFACE_DATA)]
setupapi.SetupDiGetDeviceInterfaceDetailW.argtypes = [ctypes.c_void_p, ctypes.POINTER(SP_DEVICE_INTERFACE_DATA), ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p]
k32.CreateFileW.restype = wintypes.HANDLE
k32.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
INVALID = wintypes.HANDLE(-1).value

g = GUID()
hid.HidD_GetHidGuid(ctypes.byref(g))
devs = setupapi.SetupDiGetClassDevsW(ctypes.byref(g), None, None, 0x12)  # PRESENT | DEVICEINTERFACE
idx = 0
paths = []
while True:
    d = SP_DEVICE_INTERFACE_DATA(cbSize=ctypes.sizeof(SP_DEVICE_INTERFACE_DATA))
    if not setupapi.SetupDiEnumDeviceInterfaces(devs, None, ctypes.byref(g), idx, ctypes.byref(d)):
        break
    idx += 1
    need = wintypes.DWORD()
    setupapi.SetupDiGetDeviceInterfaceDetailW(devs, ctypes.byref(d), None, 0, ctypes.byref(need), None)
    buf = ctypes.create_string_buffer(need.value)
    ctypes.cast(buf, ctypes.POINTER(wintypes.DWORD))[0] = 8  # cbSize on x64
    if setupapi.SetupDiGetDeviceInterfaceDetailW(devs, ctypes.byref(d), buf, need, None, None):
        paths.append(ctypes.wstring_at(ctypes.addressof(buf) + 4))

for path in paths:
    if "045e" not in path.lower():
        continue
    h = k32.CreateFileW(path, 0xC0000000, 3, None, 3, 0, None)  # read/write, share read/write
    if h == INVALID:
        h = k32.CreateFileW(path, 0x80000000, 3, None, 3, 0, None)
    if h == INVALID:
        print(f"{path}\n   cannot open (error {ctypes.get_last_error()})")
        continue
    a = HIDD_ATTRIBUTES(Size=ctypes.sizeof(HIDD_ATTRIBUTES))
    hid.HidD_GetAttributes(h, ctypes.byref(a))
    print(f"{path}\n   opened  VID {a.VendorID:04x} PID {a.ProductID:04x}")
    reports = []

    def reader():
        b = ctypes.create_string_buffer(64)
        n = wintypes.DWORD()
        end = time.monotonic() + 30
        while time.monotonic() < end and len(reports) < 8:
            if k32.ReadFile(h, b, 64, ctypes.byref(n), None):
                reports.append(b.raw[: n.value].hex(" "))
            else:
                reports.append(f"ReadFile error {ctypes.get_last_error()}")
                return

    t = threading.Thread(target=reader, daemon=True)
    t.start()
    print("   MOVE THE LEFT STICK / PRESS BUTTONS NOW (30 s) ...", flush=True)
    t.join(31)
    print(f"   reports in 30 s: {len(reports)}")
    for r in reports:
        print(f"     {r}")
