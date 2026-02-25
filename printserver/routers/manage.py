"""Management endpoints + single-page UI for the installed print server."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from config import CHANGELOG, UPDATE_CHECK_URL, VERSION
from services import settings_store

router = APIRouter(prefix="/manage", tags=["manage"])

_START_TIME = time.time()

# ---------------------------------------------------------------------------
# Registry helpers (Windows only; gracefully no-op on other platforms)
# ---------------------------------------------------------------------------
_REG_KEY   = r"Software\Microsoft\Windows\CurrentVersion\Run"
_REG_VALUE = "EcoThriftPrintServer"


def _exe_path() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable)
    return Path(__file__).resolve().parent.parent / "dist" / "ecothrift-printserver.exe"


def _autostart_enabled() -> bool:
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _REG_KEY) as key:
            val, _ = winreg.QueryValueEx(key, _REG_VALUE)
            return bool(val)
    except Exception:
        return False


def _set_autostart(enabled: bool) -> None:
    import winreg
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _REG_KEY, 0, winreg.KEY_SET_VALUE) as key:
        if enabled:
            winreg.SetValueEx(key, _REG_VALUE, 0, winreg.REG_SZ, str(_exe_path()))
        else:
            try:
                winreg.DeleteValue(key, _REG_VALUE)
            except FileNotFoundError:
                pass


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class AutostartRequest(BaseModel):
    enabled: bool


class UpdateUrlRequest(BaseModel):
    url: str


class StatusResponse(BaseModel):
    version: str
    autostart: bool
    uptime_seconds: int
    install_dir: str
    update_check_url: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.get("/status", response_model=StatusResponse)
async def manage_status():
    effective_url = settings_store.get("update_check_url") or UPDATE_CHECK_URL
    return StatusResponse(
        version=VERSION,
        autostart=_autostart_enabled(),
        uptime_seconds=int(time.time() - _START_TIME),
        install_dir=str(_exe_path().parent),
        update_check_url=effective_url,
    )


@router.post("/autostart")
async def set_autostart(body: AutostartRequest) -> dict[str, Any]:
    try:
        _set_autostart(body.enabled)
        return {"ok": True, "enabled": body.enabled}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@router.post("/update-url")
async def set_update_url(body: UpdateUrlRequest) -> dict[str, Any]:
    try:
        settings_store.update({"update_check_url": body.url.strip()})
        return {"ok": True, "url": body.url.strip()}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@router.get("/check-update")
async def check_update() -> dict[str, Any]:
    """Proxy the version-check request server-side to avoid browser CORS restrictions."""
    import urllib.request
    import json as _json

    url = settings_store.get("update_check_url") or UPDATE_CHECK_URL
    try:
        req = urllib.request.Request(url, headers={"User-Agent": f"EcoThriftPrintServer/{VERSION}"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = _json.loads(resp.read().decode())
        return {"ok": True, **data}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "available": False}


@router.post("/uninstall")
async def uninstall() -> dict[str, Any]:
    install_dir = str(_exe_path().parent)

    # 1. Remove auto-start registry entry
    try:
        _set_autostart(False)
    except Exception:
        pass

    # 2. Launch a detached cmd process to delete the install dir after we exit.
    #    The timeout gives the server process time to stop cleanly first.
    subprocess.Popen(
        ["cmd", "/c", f'timeout /t 3 /nobreak >nul && rd /s /q "{install_dir}"'],
        creationflags=subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS,
    )

    # 3. Stop this server after the response is sent.
    def _stop():
        time.sleep(0.5)
        os.kill(os.getpid(), signal.SIGTERM)

    threading.Thread(target=_stop, daemon=True).start()
    return {"ok": True}


@router.get("", response_class=HTMLResponse, include_in_schema=False)
@router.get("/", response_class=HTMLResponse, include_in_schema=False)
async def manage_page():
    effective_url = settings_store.get("update_check_url") or UPDATE_CHECK_URL
    html = _MANAGE_HTML.replace("{{VERSION}}", VERSION)
    html = html.replace("{{CHANGELOG}}", CHANGELOG.replace("`", "&#96;").replace("<", "&lt;").replace(">", "&gt;"))
    html = html.replace("{{UPDATE_URL}}", effective_url)
    return html


# ---------------------------------------------------------------------------
# Management page HTML
# ---------------------------------------------------------------------------
_MANAGE_HTML = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Eco-Thrift Print Server — Manage</title>
<style>
  :root { --bg:#121212; --surface:#1e1e1e; --border:#333; --text:#e0e0e0;
          --muted:#999; --accent:#4caf50; --accent-hover:#66bb6a;
          --error:#ef5350; --warn:#ffa726; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
         background:var(--bg); color:var(--text); min-height:100vh;
         display:flex; justify-content:center; padding:40px 16px; }
  .container { width:100%; max-width:560px; }
  h1 { font-size:1.5rem; font-weight:600; margin-bottom:2px; }
  .subtitle { color:var(--muted); font-size:0.85rem; margin-bottom:6px; }
  nav { display:flex; gap:16px; margin-bottom:28px; border-bottom:1px solid var(--border); padding-bottom:12px; }
  nav a { color:var(--muted); text-decoration:none; font-size:0.9rem; }
  nav a:hover { color:var(--text); }
  .card { background:var(--surface); border:1px solid var(--border);
          border-radius:10px; padding:24px; margin-bottom:16px; }
  .card h2 { font-size:1rem; font-weight:600; margin-bottom:16px; }
  .row { display:flex; align-items:center; justify-content:space-between;
         padding:10px 0; border-bottom:1px solid var(--border); }
  .row:last-child { border-bottom:none; }
  .row-label { font-size:0.85rem; color:var(--muted); flex-shrink:0; margin-right:12px; }
  .row-value { font-size:0.9rem; font-weight:500; text-align:right; word-break:break-all; }
  .dot { display:inline-block; width:9px; height:9px; border-radius:50%;
         background:var(--accent); margin-right:6px; }
  .dot.off { background:var(--error); }
  .toggle { position:relative; width:42px; height:24px; }
  .toggle input { opacity:0; width:0; height:0; }
  .slider { position:absolute; inset:0; background:#555; border-radius:24px;
             cursor:pointer; transition:.2s; }
  .slider:before { content:""; position:absolute; width:18px; height:18px;
                   left:3px; bottom:3px; background:#fff; border-radius:50%;
                   transition:.2s; }
  input:checked + .slider { background:var(--accent); }
  input:checked + .slider:before { transform:translateX(18px); }
  .toggle-state { font-size:0.8rem; color:var(--muted); min-width:52px; }
  button { padding:9px 18px; border:none; border-radius:6px; font-size:0.875rem;
           cursor:pointer; font-weight:500; transition:background 0.15s; }
  .btn-primary { background:var(--accent); color:#fff; }
  .btn-primary:hover { background:var(--accent-hover); }
  .btn-danger { background:#b71c1c; color:#fff; }
  .btn-danger:hover { background:var(--error); }
  .btn-secondary { background:var(--border); color:var(--text); }
  .btn-secondary:hover { background:#444; }
  .btn-row { display:flex; gap:8px; margin-top:16px; flex-wrap:wrap; align-items:center; }
  .badge { display:inline-block; padding:2px 8px; border-radius:4px;
           font-size:0.78rem; font-weight:600; }
  .badge.ok { background:#1b5e20; color:#a5d6a7; }
  .badge.update { background:#e65100; color:#ffcc80; }
  .badge.unknown { background:#333; color:#999; }
  .changelog { max-height:280px; overflow-y:auto; font-size:0.82rem;
               line-height:1.6; color:var(--muted); white-space:pre-wrap;
               font-family:"Consolas","Courier New",monospace;
               background:var(--bg); border-radius:6px; padding:12px; }
  .url-row { display:flex; gap:8px; align-items:center; margin-top:12px; }
  .url-input { flex:1; background:#111; border:1px solid var(--border);
               color:var(--text); border-radius:6px; padding:7px 10px;
               font-size:0.82rem; font-family:"Consolas","Courier New",monospace; }
  .url-input:focus { outline:none; border-color:var(--accent); }
  .toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
           padding:10px 24px; border-radius:6px; font-size:0.9rem; z-index:100;
           opacity:0; transition:opacity 0.3s; pointer-events:none; }
  .toast.show { opacity:1; }
  .toast.success { background:var(--accent); color:#fff; }
  .toast.error { background:var(--error); color:#fff; }
  .overlay { position:fixed; inset:0; background:rgba(0,0,0,.6);
             display:none; align-items:center; justify-content:center; z-index:200; }
  .overlay.show { display:flex; }
  .modal { background:var(--surface); border:1px solid var(--border);
           border-radius:10px; padding:28px; max-width:380px; width:90%; }
  .modal h3 { margin-bottom:10px; }
  .modal p { color:var(--muted); font-size:0.88rem; margin-bottom:20px; }
  .modal .btn-row { margin-top:0; }
  .done-screen { position:fixed; inset:0; background:var(--bg);
                 display:flex; flex-direction:column; align-items:center;
                 justify-content:center; gap:16px; }
  .done-screen h2 { font-size:1.4rem; color:var(--text); }
  .done-screen p { color:var(--muted); font-size:0.9rem; }
</style>
</head>
<body>
<div class="container">
  <h1>Eco-Thrift Print Server</h1>
  <p class="subtitle">v{{VERSION}} &mdash; Management</p>
  <nav>
    <a href="/">&#9112; Printer Config</a>
    <a href="/manage" style="color:var(--text);font-weight:600">&#9881; Manage</a>
    <a href="/docs">&#128196; API Docs</a>
  </nav>

  <!-- Status -->
  <div class="card">
    <h2>Status</h2>
    <div class="row">
      <span class="row-label">Server</span>
      <span class="row-value"><span class="dot" id="runDot"></span><span id="runText">Checking...</span></span>
    </div>
    <div class="row">
      <span class="row-label">Version installed</span>
      <span class="row-value" id="versionVal">—</span>
    </div>
    <div class="row">
      <span class="row-label">Uptime</span>
      <span class="row-value" id="uptimeVal">—</span>
    </div>
    <div class="row">
      <span class="row-label">Install directory</span>
      <span class="row-value" style="font-size:0.78rem;" id="installDir">—</span>
    </div>
    <div class="row">
      <span class="row-label">Start on Windows login</span>
      <span class="row-value" style="display:flex;align-items:center;gap:10px;">
        <label class="toggle">
          <input type="checkbox" id="autostartToggle" onchange="setAutostart(this.checked)">
          <span class="slider"></span>
        </label>
        <span class="toggle-state" id="autostartLabel">—</span>
      </span>
    </div>
  </div>

  <!-- Latest version -->
  <div class="card" id="updateCard">
    <h2>Latest Version</h2>
    <div class="row">
      <span class="row-label">Installed</span>
      <span class="row-value" id="curVer">v{{VERSION}}</span>
    </div>
    <div class="row">
      <span class="row-label">Available</span>
      <span class="row-value" id="latestVer"><span class="badge unknown">Checking...</span></span>
    </div>
    <div class="row" id="updateNotes" style="display:none">
      <span class="row-label">Release notes</span>
      <span class="row-value" id="notesText" style="font-size:0.82rem;color:var(--muted);"></span>
    </div>
    <div class="btn-row">
      <button class="btn-secondary" onclick="checkLatest()">Check for Updates</button>
      <a id="downloadLink" href="#" style="display:none">
        <button class="btn-primary">Download Update</button>
      </a>
    </div>
    <div style="margin-top:16px;">
      <div style="font-size:0.78rem;color:var(--muted);margin-bottom:6px;">Update check URL (override for local dev):</div>
      <div class="url-row">
        <input class="url-input" type="text" id="updateUrlInput" value="{{UPDATE_URL}}" placeholder="https://dash.ecothrift.us/api/..." />
        <button class="btn-secondary" style="padding:7px 14px;font-size:0.82rem;" onclick="saveUpdateUrl()">Save</button>
      </div>
    </div>
  </div>

  <!-- Changelog -->
  <div class="card">
    <h2>Changelog</h2>
    <div class="changelog" id="changelog">{{CHANGELOG}}</div>
  </div>

  <!-- Danger zone -->
  <div class="card">
    <h2>Danger Zone</h2>
    <p style="font-size:0.85rem;color:var(--muted);margin-bottom:14px;">
      Uninstalling removes the server from this machine, clears the auto-start
      entry, and stops the service immediately.
    </p>
    <button class="btn-danger" onclick="confirmUninstall()">Uninstall Print Server</button>
  </div>
</div>

<!-- Confirm modal -->
<div class="overlay" id="uninstallOverlay">
  <div class="modal">
    <h3>Confirm Uninstall</h3>
    <p>This will stop the server, remove all files from the install directory,
       and delete the auto-start entry. Are you sure?</p>
    <div class="btn-row">
      <button class="btn-danger" onclick="doUninstall()">Yes, Uninstall</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const UPDATE_URL = "{{UPDATE_URL}}";

function toast(msg, type = "success") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast show " + type;
  setTimeout(() => el.className = "toast", 3000);
}

function fmtUptime(s) {
  if (s < 60) return s + "s";
  if (s < 3600) return Math.floor(s/60) + "m " + (s%60) + "s";
  return Math.floor(s/3600) + "h " + Math.floor((s%3600)/60) + "m";
}

async function loadStatus() {
  try {
    const r = await fetch("/manage/status");
    const d = await r.json();
    document.getElementById("runDot").className = "dot";
    document.getElementById("runText").textContent = "Running";
    document.getElementById("versionVal").textContent = "v" + d.version;
    document.getElementById("uptimeVal").textContent = fmtUptime(d.uptime_seconds);
    document.getElementById("installDir").textContent = d.install_dir;
    const toggle = document.getElementById("autostartToggle");
    toggle.checked = d.autostart;
    document.getElementById("autostartLabel").textContent = d.autostart ? "Enabled" : "Disabled";
    document.getElementById("autostartLabel").style.color = d.autostart ? "var(--accent)" : "var(--muted)";
    // Sync the URL field with whatever the server reports as effective URL
    if (d.update_check_url) {
      document.getElementById("updateUrlInput").value = d.update_check_url;
    }
  } catch {
    document.getElementById("runDot").className = "dot off";
    document.getElementById("runText").textContent = "Unreachable";
  }
  // Auto-check for updates every time status loads
  checkLatest();
}

async function setAutostart(enabled) {
  try {
    const r = await fetch("/manage/autostart", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({enabled}),
    });
    const d = await r.json();
    if (d.ok) {
      toast(enabled ? "Auto-start enabled" : "Auto-start disabled");
      document.getElementById("autostartLabel").textContent = enabled ? "Enabled" : "Disabled";
      document.getElementById("autostartLabel").style.color = enabled ? "var(--accent)" : "var(--muted)";
    } else {
      toast(d.error || "Failed", "error");
      document.getElementById("autostartToggle").checked = !enabled;
    }
  } catch { toast("Request failed", "error"); }
}

async function saveUpdateUrl() {
  const url = document.getElementById("updateUrlInput").value.trim();
  try {
    const r = await fetch("/manage/update-url", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({url}),
    });
    const d = await r.json();
    if (d.ok) { toast("URL saved — rechecking..."); setTimeout(checkLatest, 500); }
    else toast(d.error || "Failed", "error");
  } catch { toast("Request failed", "error"); }
}

async function checkLatest() {
  document.getElementById("latestVer").innerHTML = '<span class="badge unknown">Checking...</span>';
  try {
    // Use the server-side proxy to avoid CORS restrictions
    const r = await fetch("/manage/check-update");
    const d = await r.json();
    if (!d.ok || !d.available) {
      const msg = d.error ? "Unreachable" : "No release found";
      document.getElementById("latestVer").innerHTML = `<span class="badge unknown">${msg}</span>`;
      return;
    }
    const latest = d.version;
    const current = "{{VERSION}}";
    const isNewer = latest !== current;
    document.getElementById("latestVer").innerHTML = isNewer
      ? `<span class="badge update">v${latest} available</span>`
      : `<span class="badge ok">v${latest} — up to date</span>`;
    if (d.release_notes) {
      document.getElementById("updateNotes").style.display = "";
      document.getElementById("notesText").textContent = d.release_notes;
    }
    const dlUrl = d.download_url || d.s3_file_info?.url;
    if (isNewer && dlUrl) {
      const link = document.getElementById("downloadLink");
      link.href = dlUrl;
      link.style.display = "";
    }
  } catch(e) {
    document.getElementById("latestVer").innerHTML = '<span class="badge unknown">Check failed</span>';
  }
}

function confirmUninstall() {
  document.getElementById("uninstallOverlay").className = "overlay show";
}
function closeModal() {
  document.getElementById("uninstallOverlay").className = "overlay";
}
async function doUninstall() {
  closeModal();
  try {
    await fetch("/manage/uninstall", {method: "POST"});
    // Replace the whole page with a clean done screen
    document.body.innerHTML = `
      <div class="done-screen">
        <h2>&#10003; Uninstalled</h2>
        <p>Eco-Thrift Print Server has been removed from this machine.</p>
        <p style="margin-top:8px;font-size:0.82rem;">The server has stopped. You can close this window.</p>
      </div>`;
  } catch {
    toast("Uninstall request failed — the server may still be running.", "error");
  }
}

// Load status on page open; auto-refresh uptime every 30s
loadStatus();
setInterval(() => {
  fetch("/manage/status").then(r => r.json()).then(d => {
    document.getElementById("uptimeVal").textContent = fmtUptime(d.uptime_seconds);
  }).catch(() => {});
}, 30000);
</script>
</body>
</html>
"""
