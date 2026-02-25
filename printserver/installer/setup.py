"""
Eco-Thrift Print Server -- Windows Installer

Bundled as setup.exe by PyInstaller.  Run this on each workstation.

What it does:
  1. Copies ecothrift-printserver.exe to %LOCALAPPDATA%/EcoThrift/PrintServer/
  2. Removes any old installation first (clean overwrite)
  3. Optionally registers the server to auto-start on Windows login
     (via HKCU registry Run key -- no admin rights needed)
  4. Optionally creates a Desktop shortcut

No admin rights required.
"""

# ---------------------------------------------------------------------------
# Crash logger — must come before ALL other imports.
# When frozen with --noconsole any unhandled exception is invisible.
# Write it to a log file next to the exe so we can diagnose startup failures.
# ---------------------------------------------------------------------------
import sys as _sys
import traceback as _traceback

def _setup_crash_log() -> None:
    import pathlib, builtins
    if getattr(_sys, "frozen", False):
        log_path = pathlib.Path(_sys.executable).parent / "setup-crash.log"
    else:
        log_path = pathlib.Path(__file__).parent / "setup-crash.log"

    _orig_excepthook = _sys.excepthook

    def _hook(exc_type, exc_val, exc_tb):
        with builtins.open(log_path, "a", encoding="utf-8") as f:
            f.write("=" * 60 + "\n")
            _traceback.print_exception(exc_type, exc_val, exc_tb, file=f)
        _orig_excepthook(exc_type, exc_val, exc_tb)

    _sys.excepthook = _hook

    # Also redirect stdout/stderr if they are None (--noconsole mode)
    if _sys.stdout is None or _sys.stderr is None:
        _f = builtins.open(log_path, "a", encoding="utf-8", buffering=1)
        if _sys.stdout is None:
            _sys.stdout = _f  # type: ignore[assignment]
        if _sys.stderr is None:
            _sys.stderr = _f  # type: ignore[assignment]

_setup_crash_log()

import os
import shutil
import sys
import tkinter as tk
import winreg
from pathlib import Path
from tkinter import messagebox, ttk

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
INSTALL_DIR = Path(os.environ["LOCALAPPDATA"]) / "EcoThrift" / "PrintServer"
EXE_NAME = "ecothrift-printserver.exe"
REGISTRY_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
REGISTRY_VALUE = "EcoThriftPrintServer"

# When frozen by PyInstaller, the server exe is either:
#  (a) bundled inside this setup.exe via --add-data (extracted to _MEIPASS), or
#  (b) sitting next to this setup.exe on disk.
# Try _MEIPASS first, then fall back to same directory.
if getattr(sys, "frozen", False):
    _meipass = getattr(sys, "_MEIPASS", None)
    if _meipass and (Path(_meipass) / EXE_NAME).exists():
        SOURCE_EXE = Path(_meipass) / EXE_NAME
    else:
        SOURCE_EXE = Path(sys.executable).parent / EXE_NAME
else:
    SOURCE_EXE = Path(__file__).resolve().parent.parent / "dist" / EXE_NAME


# ---------------------------------------------------------------------------
# Installer logic (runs in background thread to keep UI responsive)
# ---------------------------------------------------------------------------

def _kill_port_8888() -> None:
    """Kill any process listening on port 8888 (handles python.exe dev server)."""
    import subprocess as _sp
    result = _sp.run(['netstat', '-ano'], capture_output=True, text=True)
    seen: set[str] = set()
    for line in result.stdout.splitlines():
        if ':8888 ' in line and 'LISTENING' in line:
            parts = line.split()
            pid = parts[-1] if parts else ""
            if pid and pid not in seen:
                seen.add(pid)
                _sp.run(['taskkill', '/F', '/PID', pid], capture_output=True)


def do_install(auto_start: bool, log: "callable[[str], None]") -> bool:
    try:
        # 1. Stop any running instance (by name and by port to catch dev server)
        log("Stopping existing instance (if running)...")
        os.system("taskkill /F /IM ecothrift-printserver.exe >nul 2>&1")
        _kill_port_8888()

        # 2. Remove old install
        if INSTALL_DIR.exists():
            log(f"Removing old installation at {INSTALL_DIR} ...")
            shutil.rmtree(INSTALL_DIR, ignore_errors=True)

        # 3. Create install directory
        log(f"Creating {INSTALL_DIR} ...")
        INSTALL_DIR.mkdir(parents=True, exist_ok=True)

        # 4. Copy exe
        if not SOURCE_EXE.exists():
            log(f"ERROR: server exe not found at {SOURCE_EXE}")
            return False
        dest = INSTALL_DIR / EXE_NAME
        log(f"Copying {EXE_NAME} ...")
        shutil.copy2(SOURCE_EXE, dest)

        # 5. Auto-start registry
        if auto_start:
            log("Registering auto-start in Windows registry (HKCU)...")
            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER, REGISTRY_KEY, 0, winreg.KEY_SET_VALUE
            ) as key:
                winreg.SetValueEx(key, REGISTRY_VALUE, 0, winreg.REG_SZ, str(dest))
            log("  Auto-start registered.")
        else:
            # Remove any existing auto-start entry
            try:
                with winreg.OpenKey(
                    winreg.HKEY_CURRENT_USER, REGISTRY_KEY, 0, winreg.KEY_SET_VALUE
                ) as key:
                    winreg.DeleteValue(key, REGISTRY_VALUE)
                log("Removed previous auto-start entry.")
            except FileNotFoundError:
                pass

        # 6. Launch the server now
        log("Starting print server...")
        import subprocess
        subprocess.Popen([str(dest)], creationflags=subprocess.CREATE_NO_WINDOW)

        # 7. Wait briefly then open the management page in the default browser
        import time, webbrowser, threading
        def _open_browser():
            time.sleep(2)
            webbrowser.open("http://127.0.0.1:8888/manage")
        threading.Thread(target=_open_browser, daemon=True).start()

        log("Done!")
        return True

    except Exception as exc:
        log(f"ERROR: {exc}")
        return False


def do_uninstall(log: "callable[[str], None]") -> bool:
    try:
        log("Stopping print server...")
        os.system("taskkill /F /IM ecothrift-printserver.exe >nul 2>&1")

        log("Removing auto-start registry entry...")
        try:
            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER, REGISTRY_KEY, 0, winreg.KEY_SET_VALUE
            ) as key:
                winreg.DeleteValue(key, REGISTRY_VALUE)
        except FileNotFoundError:
            pass

        if INSTALL_DIR.exists():
            log(f"Removing {INSTALL_DIR} ...")
            shutil.rmtree(INSTALL_DIR, ignore_errors=True)

        log("Uninstalled.")
        return True
    except Exception as exc:
        log(f"ERROR: {exc}")
        return False


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------

class InstallerApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Eco-Thrift Print Server Setup")
        self.resizable(False, False)
        self.geometry("520x440")
        self.configure(bg="#1e1e1e")
        self._build_ui()
        self._detect_existing()

    # ---------- UI construction ----------

    def _lbl(self, parent: tk.Widget, text: str, **kw) -> tk.Label:
        props = {"bg": "#1e1e1e", "fg": "#e0e0e0", "font": ("Segoe UI", 10)}
        props.update(kw)
        return tk.Label(parent, text=text, **props)

    def _build_ui(self) -> None:
        pad = {"padx": 20, "pady": 6}

        # Header
        tk.Label(self, text="Eco-Thrift Print Server", bg="#1e1e1e", fg="#4caf50",
                 font=("Segoe UI", 15, "bold")).pack(pady=(20, 2))
        self._lbl(self, "Windows Installer", font=("Segoe UI", 10)).pack()

        ttk.Separator(self, orient="horizontal").pack(fill="x", padx=20, pady=14)

        # Install path
        self._lbl(self, f"Install location:  {INSTALL_DIR}",
                  fg="#aaaaaa", font=("Segoe UI", 9)).pack(**pad)

        # Existing status
        self._status_var = tk.StringVar(value="")
        self._lbl_status = self._lbl(self, "", fg="#ffa726", font=("Segoe UI", 9))
        self._lbl_status.pack()
        self._lbl_status.config(textvariable=self._status_var)

        # Auto-start checkbox
        self._auto_start = tk.BooleanVar(value=True)
        tk.Checkbutton(
            self, text="Start print server automatically when Windows starts",
            variable=self._auto_start,
            bg="#1e1e1e", fg="#e0e0e0", selectcolor="#333",
            activebackground="#1e1e1e", activeforeground="#e0e0e0",
            font=("Segoe UI", 10),
        ).pack(padx=20, pady=(10, 4), anchor="w")

        # Buttons
        btn_frame = tk.Frame(self, bg="#1e1e1e")
        btn_frame.pack(padx=20, pady=10, fill="x")

        btn_style = {"font": ("Segoe UI", 10, "bold"), "bd": 0, "cursor": "hand2",
                     "padx": 16, "pady": 8, "width": 14}
        self._install_btn = tk.Button(
            btn_frame, text="Install",
            bg="#4caf50", fg="white",
            activebackground="#66bb6a",
            command=self._on_install, **btn_style,
        )
        self._install_btn.pack(side="left", padx=(0, 8))

        self._uninstall_btn = tk.Button(
            btn_frame, text="Uninstall",
            bg="#ef5350", fg="white",
            activebackground="#e57373",
            command=self._on_uninstall, **btn_style,
        )
        self._uninstall_btn.pack(side="left")

        ttk.Separator(self, orient="horizontal").pack(fill="x", padx=20, pady=10)

        # Log output
        self._lbl(self, "Installation log:", font=("Segoe UI", 9),
                  fg="#aaaaaa").pack(padx=20, anchor="w")
        log_frame = tk.Frame(self, bg="#111")
        log_frame.pack(padx=20, pady=(4, 16), fill="both", expand=True)
        self._log_text = tk.Text(
            log_frame, bg="#111", fg="#b0b0b0",
            font=("Consolas", 9), bd=0, state="disabled",
            height=8,
        )
        self._log_text.pack(fill="both", expand=True, padx=4, pady=4)

    # ---------- detect existing ----------

    def _detect_existing(self) -> None:
        if (INSTALL_DIR / EXE_NAME).exists():
            self._status_var.set(f"Existing installation detected at {INSTALL_DIR}")
            self._install_btn.config(text="Reinstall / Update")
        else:
            self._status_var.set("")

    # ---------- log ----------

    def _log(self, msg: str) -> None:
        self._log_text.config(state="normal")
        self._log_text.insert("end", f"  {msg}\n")
        self._log_text.see("end")
        self._log_text.config(state="disabled")
        self.update_idletasks()

    # ---------- button handlers ----------

    def _on_install(self) -> None:
        self._install_btn.config(state="disabled")
        self._uninstall_btn.config(state="disabled")
        auto = self._auto_start.get()
        ok = do_install(auto, self._log)
        if ok:
            messagebox.showinfo(
                "Installation Complete",
                "Eco-Thrift Print Server has been installed.\n\n"
                f"Location: {INSTALL_DIR / EXE_NAME}\n\n"
                "The server is running. Open http://127.0.0.1:8888 in your browser "
                "to select printers.",
            )
        else:
            messagebox.showerror("Installation Failed",
                                 "See the log for details.")
        self._install_btn.config(state="normal")
        self._uninstall_btn.config(state="normal")
        self._detect_existing()

    def _on_uninstall(self) -> None:
        if not messagebox.askyesno("Confirm Uninstall",
                                   "Remove Eco-Thrift Print Server from this machine?"):
            return
        self._install_btn.config(state="disabled")
        self._uninstall_btn.config(state="disabled")
        ok = do_uninstall(self._log)
        if ok:
            messagebox.showinfo("Uninstalled",
                                "Eco-Thrift Print Server has been removed.")
        self._install_btn.config(state="normal")
        self._uninstall_btn.config(state="normal")
        self._detect_existing()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--uninstall", action="store_true")
    args, _ = parser.parse_known_args()

    if args.uninstall:
        # Headless uninstall — called by the /manage/uninstall endpoint
        def _noop_log(msg: str) -> None:
            pass
        do_uninstall(_noop_log)
    else:
        app = InstallerApp()
        app.mainloop()
