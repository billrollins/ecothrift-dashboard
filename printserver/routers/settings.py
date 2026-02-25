from fastapi import APIRouter
from fastapi.responses import HTMLResponse

from config import VERSION
from models import PrinterSettings
from services import settings_store

router = APIRouter(tags=["settings"])


@router.get("/settings", response_model=PrinterSettings)
async def get_settings():
    data = settings_store.get_all()
    return PrinterSettings(**data)


@router.put("/settings", response_model=PrinterSettings)
async def update_settings(body: PrinterSettings):
    updated = settings_store.update(body.model_dump(exclude_none=False))
    return PrinterSettings(**updated)


@router.get("/", response_class=HTMLResponse, include_in_schema=False)
async def settings_page():
    return _SETTINGS_HTML.replace("{{VERSION}}", VERSION)


_SETTINGS_HTML = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Eco-Thrift Print Server</title>
<style>
  :root { --bg: #121212; --surface: #1e1e1e; --border: #333; --text: #e0e0e0;
          --muted: #999; --accent: #4caf50; --accent-hover: #66bb6a;
          --error: #ef5350; --warn: #ffa726; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         background: var(--bg); color: var(--text); min-height: 100vh;
         display: flex; justify-content: center; padding: 40px 16px; }
  .container { width: 100%; max-width: 520px; }
  h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 4px; }
  .version { color: var(--muted); font-size: 0.85rem; margin-bottom: 24px; }
  .card { background: var(--surface); border: 1px solid var(--border);
          border-radius: 10px; padding: 24px; margin-bottom: 16px; }
  .card h2 { font-size: 1rem; font-weight: 600; margin-bottom: 16px; }
  label { display: block; font-size: 0.85rem; color: var(--muted); margin-bottom: 6px; }
  select { width: 100%; padding: 10px 12px; background: var(--bg); color: var(--text);
           border: 1px solid var(--border); border-radius: 6px; font-size: 0.95rem;
           margin-bottom: 16px; appearance: auto; }
  select:focus { outline: none; border-color: var(--accent); }
  .btn-row { display: flex; gap: 8px; margin-top: 8px; }
  button { padding: 10px 20px; border: none; border-radius: 6px; font-size: 0.9rem;
           cursor: pointer; font-weight: 500; transition: background 0.15s; }
  .btn-primary { background: var(--accent); color: #fff; flex: 1; }
  .btn-primary:hover { background: var(--accent-hover); }
  .btn-secondary { background: var(--border); color: var(--text); }
  .btn-secondary:hover { background: #444; }
  .btn-primary:disabled, .btn-secondary:disabled { opacity: 0.5; cursor: default; }
  .status-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; }
  .dot.ok { background: var(--accent); }
  .dot.warn { background: var(--warn); }
  .dot.err { background: var(--error); }
  .status-text { font-size: 0.85rem; color: var(--muted); }
  .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
           padding: 10px 24px; border-radius: 6px; font-size: 0.9rem; z-index: 100;
           opacity: 0; transition: opacity 0.3s; pointer-events: none; }
  .toast.show { opacity: 1; }
  .toast.success { background: var(--accent); color: #fff; }
  .toast.error { background: var(--error); color: #fff; }
  .printer-status { font-size: 0.75rem; color: var(--muted); margin-top: -12px;
                    margin-bottom: 16px; padding-left: 2px; }
</style>
</head>
<body>
<div class="container">
  <h1>Eco-Thrift Print Server</h1>
  <p class="version">v{{VERSION}}</p>

  <div class="status-bar">
    <div class="dot" id="statusDot"></div>
    <span class="status-text" id="statusText">Checking...</span>
  </div>

  <div class="card">
    <h2>Printer Assignment</h2>

    <label for="labelPrinter">Label Printer</label>
    <select id="labelPrinter"><option value="">Loading...</option></select>
    <div class="printer-status" id="labelStatus"></div>

    <label for="receiptPrinter">Receipt Printer</label>
    <select id="receiptPrinter"><option value="">Loading...</option></select>
    <div class="printer-status" id="receiptStatus"></div>

    <div class="btn-row">
      <button class="btn-primary" id="saveBtn" disabled>Save</button>
    </div>
  </div>

  <div class="card">
    <h2>Test Print</h2>
    <div class="btn-row">
      <button class="btn-secondary" id="testLabel" disabled>Test Label</button>
      <button class="btn-secondary" id="testReceipt" disabled>Test Receipt</button>
      <button class="btn-secondary" id="testDrawer" disabled>Open Drawer</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const BASE = "";
let printers = [];
let settings = {};

function toast(msg, type = "success") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast show " + type;
  setTimeout(() => el.className = "toast", 2500);
}

function setStatus(ok, text) {
  const dot = document.getElementById("statusDot");
  const span = document.getElementById("statusText");
  dot.className = "dot " + (ok ? "ok" : "err");
  span.textContent = text;
}

function populateSelect(id, statusId, selected) {
  const sel = document.getElementById(id);
  sel.innerHTML = '<option value="">(not set)</option>';
  for (const p of printers) {
    const opt = document.createElement("option");
    opt.value = p.name;
    opt.textContent = p.name + (p.is_default ? " (default)" : "");
    if (p.name === selected) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.disabled = false;
  // show status of selected printer
  updatePrinterStatus(id, statusId);
  sel.addEventListener("change", () => updatePrinterStatus(id, statusId));
}

function updatePrinterStatus(selectId, statusId) {
  const name = document.getElementById(selectId).value;
  const el = document.getElementById(statusId);
  if (!name) { el.textContent = ""; return; }
  const p = printers.find(x => x.name === name);
  el.textContent = p ? "Status: " + p.status : "";
}

async function load() {
  try {
    const [pRes, sRes] = await Promise.all([
      fetch(BASE + "/printers"),
      fetch(BASE + "/settings"),
    ]);
    printers = await pRes.json();
    settings = await sRes.json();
    setStatus(true, printers.length + " printer(s) found");
    populateSelect("labelPrinter", "labelStatus", settings.label_printer);
    populateSelect("receiptPrinter", "receiptStatus", settings.receipt_printer);
    document.getElementById("saveBtn").disabled = false;
    document.getElementById("testLabel").disabled = false;
    document.getElementById("testReceipt").disabled = false;
    document.getElementById("testDrawer").disabled = false;
  } catch {
    setStatus(false, "Failed to load printers");
  }
}

document.getElementById("saveBtn").addEventListener("click", async () => {
  const body = {
    label_printer: document.getElementById("labelPrinter").value || null,
    receipt_printer: document.getElementById("receiptPrinter").value || null,
  };
  try {
    const res = await fetch(BASE + "/settings", {
      method: "PUT", headers: {"Content-Type": "application/json"},
      body: JSON.stringify(body),
    });
    if (res.ok) { settings = await res.json(); toast("Settings saved"); }
    else toast("Save failed", "error");
  } catch { toast("Save failed", "error"); }
});

document.getElementById("testLabel").addEventListener("click", async () => {
  try {
    const res = await fetch(BASE + "/print/test", { method: "POST",
      headers: {"Content-Type": "application/json"}, body: "{}" });
    const data = await res.json();
    toast(data.success ? "Test label sent" : data.error || data.message, data.success ? "success" : "error");
  } catch { toast("Request failed", "error"); }
});

document.getElementById("testReceipt").addEventListener("click", async () => {
  try {
    const res = await fetch(BASE + "/print/test-receipt", { method: "POST",
      headers: {"Content-Type": "application/json"}, body: "{}" });
    const data = await res.json();
    toast(data.success ? "Test receipt sent" : data.error || data.message, data.success ? "success" : "error");
  } catch { toast("Request failed", "error"); }
});

document.getElementById("testDrawer").addEventListener("click", async () => {
  try {
    const res = await fetch(BASE + "/drawer/control", { method: "POST",
      headers: {"Content-Type": "application/json"}, body: JSON.stringify({action: "open"}) });
    const data = await res.json();
    toast(data.success ? "Drawer opened" : data.error || data.message, data.success ? "success" : "error");
  } catch { toast("Request failed", "error"); }
});

load();
</script>
</body>
</html>
"""
