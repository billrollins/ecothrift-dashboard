"""Wi-Fi time clock helper for the store PC (D23, ``{master}/standards/time-clock.md``). Standard library only.

Every 60 seconds it pings every address on the PC's own subnet once (one small UDP packet each, so the PC learns who
is there), reads the PC's own neighbour table, and tells Dash "seen" or "not seen" for each **registered** phone.
The Google Fiber router has no device-list API, so this is the only view of the network it uses.

Customers use this Wi-Fi. So the neighbour table is read into memory, matched against the registered addresses
(``GET /api/hr/wifi-clock/phones/``) and dropped at once: only ``{user id: true|false}`` is ever sent, and nothing
about any device (address, IP, count by device) is written to the log. The log has times, counts of registered
phones seen, and errors.

Env (user env vars on the PC, never in git): ``WIFI_CLOCK_TOKEN`` (device token; Dash keeps only its sha256) and
``WIFI_CLOCK_URL`` (default ``https://dash.ecothrift.us``). Optional ``WIFI_CLOCK_SUBNET`` (``192.168.1.0/24``) when
the PC's own /24 is not right.

    pythonw scripts/wifi_clock/helper.py           # run forever, no window (Windows: started at sign-in by install.ps1)
    python  scripts/wifi_clock/helper.py --once    # one check, prints what it would send (ids only)
"""
from __future__ import annotations

import ipaddress
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOG = ROOT / 'workspace' / 'wifi_clock' / 'helper.log'
LOG_MAX_BYTES = 512_000
INTERVAL = 60
PHONES_EVERY = 600  # refresh the registered list every 10 minutes
SETTLE_SECONDS = 3  # wait for ARP replies after the sweep
SEEN_STATES = {'reachable', 'permanent'}  # Delay / Probe / Stale are not proof it is here now
NO_WINDOW = 0x08000000  # CREATE_NO_WINDOW


def log(line: str) -> None:
    try:
        LOG.parent.mkdir(parents=True, exist_ok=True)
        if LOG.exists() and LOG.stat().st_size > LOG_MAX_BYTES:
            LOG.replace(LOG.with_suffix('.old.log'))
        with LOG.open('a', encoding='utf-8') as fh:
            fh.write(f'{datetime.now():%Y-%m-%d %H:%M:%S} {line}\n')
    except OSError:
        pass


def normalize_mac(raw: str) -> str:
    hexes = ''.join(ch for ch in (raw or '').lower() if ch in '0123456789abcdef')
    return ':'.join(hexes[i:i + 2] for i in range(0, 12, 2)) if len(hexes) == 12 else ''


def filter_seen(neighbours, registered: dict[int, str]) -> dict[int, bool]:
    """The only output: ``{user id: seen}`` for registered phones. ``neighbours`` is (mac, state) pairs from the
    table; every other device is dropped here and never leaves this function."""
    wanted = {normalize_mac(mac): pk for pk, mac in registered.items() if normalize_mac(mac)}
    seen = {pk: False for pk in registered}
    for mac, state in neighbours:
        pk = wanted.get(normalize_mac(mac))
        if pk is not None and (state or '').strip().lower() in SEEN_STATES:
            seen[pk] = True
    return seen


# ── The network (Windows) ─────────────────────────────────────────────────────

def own_subnet() -> ipaddress.IPv4Network:
    override = os.environ.get('WIFI_CLOCK_SUBNET', '').strip()
    if override:
        return ipaddress.ip_network(override, strict=False)
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.connect(('192.0.2.1', 9))  # no packet is sent; it picks the interface with the default route
        local = sock.getsockname()[0]
    return ipaddress.ip_network(f'{local}/24', strict=False)


def sweep(net: ipaddress.IPv4Network) -> None:
    """One 1-byte UDP packet to the discard port of each address, so the PC resolves (ARPs) every host."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        for host in net.hosts():
            try:
                sock.sendto(b'\0', (str(host), 9))
            except OSError:
                continue


def read_neighbours() -> list[tuple[str, str]]:
    """(mac, state) for every IPv4 neighbour, in memory only."""
    cmd = ['powershell', '-NoProfile', '-NonInteractive', '-Command',
           'Get-NetNeighbor -AddressFamily IPv4 | ForEach-Object { "$($_.LinkLayerAddress) $($_.State)" }']
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=30,
                         creationflags=NO_WINDOW if sys.platform == 'win32' else 0).stdout
    rows = []
    for line in out.splitlines():
        parts = line.split()
        if len(parts) == 2:
            rows.append((parts[0], parts[1]))
    return rows


# ── Dash ──────────────────────────────────────────────────────────────────────

def _call(method: str, path: str, body: dict | None = None) -> dict:
    base = (os.environ.get('WIFI_CLOCK_URL') or 'https://dash.ecothrift.us').rstrip('/')
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method, headers={
        'X-Device-Token': os.environ.get('WIFI_CLOCK_TOKEN', ''), 'Content-Type': 'application/json',
        'User-Agent': 'ecothrift-wifi-clock/1',
    })
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read() or b'{}')


def fetch_phones() -> dict[int, str]:
    return {int(row['id']): row['mac'] for row in _call('GET', '/api/hr/wifi-clock/phones/').get('phones') or []}


def check(registered: dict[int, str]) -> dict[int, bool]:
    sweep(own_subnet())
    time.sleep(SETTLE_SECONDS)
    return filter_seen(read_neighbours(), registered)


def main(argv: list[str]) -> int:
    if not os.environ.get('WIFI_CLOCK_TOKEN'):
        log('WIFI_CLOCK_TOKEN is not set; stopping.')
        print('WIFI_CLOCK_TOKEN is not set.', file=sys.stderr)
        return 2
    once = '--once' in argv
    registered: dict[int, str] = {}
    last_phones = 0.0
    log('started')
    while True:
        started = time.monotonic()
        try:
            if not registered or started - last_phones >= PHONES_EVERY:
                registered = fetch_phones()
                last_phones = started
            if registered:
                seen = check(registered)
                result = _call('POST', '/api/hr/wifi-clock/heartbeat/', {'seen': {str(k): v for k, v in seen.items()}})
                line = f'phones {len(seen)}, seen {sum(seen.values())}, processed {result.get("processed")}'
                if once:
                    print(json.dumps({'seen': seen}))
            else:
                line = 'no registered phones'
            log(line)
        except urllib.error.HTTPError as exc:
            log(f'Dash said {exc.code}')
            if exc.code == 403:
                registered = {}
        except Exception as exc:  # keep running: the next minute tries again
            log(f'error: {type(exc).__name__}')
        if once:
            return 0
        time.sleep(max(1.0, INTERVAL - (time.monotonic() - started)))


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
