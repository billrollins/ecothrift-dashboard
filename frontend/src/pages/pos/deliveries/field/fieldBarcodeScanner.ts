import { BarcodeFormat, DecodeHintType } from '@zxing/library';

export type ScannerMode = 'live' | 'unavailable';

export type ScannerCapabilityEnv = {
  isSecureContext: boolean;
  hasMediaDevices: boolean;
};

/** Trim whitespace from a decoded payload. */
export function normalizeScannedCode(raw: string | null | undefined): string {
  return (raw || '').trim();
}

/**
 * Pull a SKU/id out of common QR payloads (plain text, URL, JSON).
 * Load verification compares this to the expected item SKU.
 */
export function extractSkuFromScannedPayload(raw: string | null | undefined): string {
  const trimmed = normalizeScannedCode(raw);
  if (!trimmed) return '';

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        for (const key of ['sku', 'SKU', 'code', 'id', 'item_sku']) {
          if (typeof obj[key] === 'string' && obj[key].trim()) {
            return normalizeScannedCode(obj[key]);
          }
        }
      }
    } catch {
      // Not JSON - keep parsing as text/URL.
    }
  }

  try {
    const url = new URL(trimmed);
    for (const key of ['sku', 'code', 'id']) {
      const value = url.searchParams.get(key);
      if (value?.trim()) return normalizeScannedCode(value);
    }
    const pathPart = url.pathname.split('/').filter(Boolean).pop();
    if (pathPart) {
      const decoded = normalizeScannedCode(decodeURIComponent(pathPart));
      // Skip bare filenames like index.html; keep SKU-like path segments.
      if (decoded && !/\.(html?|php|aspx?)$/i.test(decoded)) return decoded;
    }
  } catch {
    // Not a URL.
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[lines.length - 1] || trimmed;
}

/**
 * Live scanning requires a secure context (HTTPS / localhost) and media devices.
 */
export function resolveScannerMode(env: ScannerCapabilityEnv): ScannerMode {
  if (env.isSecureContext && env.hasMediaDevices) return 'live';
  return 'unavailable';
}

export function readScannerCapabilityEnv(
  win: Window | undefined = typeof window !== 'undefined' ? window : undefined,
  nav: Navigator | undefined = typeof navigator !== 'undefined' ? navigator : undefined,
): ScannerCapabilityEnv {
  return {
    isSecureContext: Boolean(win?.isSecureContext),
    hasMediaDevices: Boolean(nav?.mediaDevices?.getUserMedia),
  };
}

/** Eco Field load labels are QR codes carrying the item SKU. */
export function createScanHints(): Map<DecodeHintType, unknown> {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.CHARACTER_SET, 'UTF-8');
  return hints;
}

export function supportsNativeQrDetector(
  win: Window | undefined = typeof window !== 'undefined' ? window : undefined,
): boolean {
  return typeof win !== 'undefined' && typeof (win as Window & { BarcodeDetector?: unknown }).BarcodeDetector === 'function';
}

/** Suppress identical camera frames / double-fires within a short window. */
export class ScanDedupe {
  private lastCode = '';
  private lastAt = 0;

  constructor(private readonly windowMs = 1500) {}

  shouldAccept(code: string, now = Date.now()): boolean {
    const normalized = normalizeScannedCode(code);
    if (!normalized) return false;
    if (normalized === this.lastCode && now - this.lastAt < this.windowMs) {
      return false;
    }
    this.lastCode = normalized;
    this.lastAt = now;
    return true;
  }

  /** Allow the same code again after a successful server acceptance (qty > 1). */
  clear() {
    this.lastCode = '';
    this.lastAt = 0;
  }
}

export function cameraErrorMessage(err: unknown): string {
  const name =
    err && typeof err === 'object' && 'name' in err ? String((err as { name?: string }).name) : '';
  const message =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message?: string }).message)
      : '';

  if (name === 'NotAllowedError' || /permission|notallowed/i.test(message)) {
    return 'Camera permission blocked. Allow camera access, then tap Scan again.';
  }
  if (name === 'NotFoundError' || /not found|no camera/i.test(message)) {
    return 'No camera found on this device. Type the SKU instead.';
  }
  if (name === 'NotReadableError' || /readable|in use/i.test(message)) {
    return 'Camera is busy. Close other apps using the camera and try again.';
  }
  if (/secure|https|getusermedia/i.test(message)) {
    return 'Live camera needs HTTPS. Restart with start_mobile_dashboard.bat and open its https URL.';
  }
  return message || 'Could not start the camera.';
}

export type ScanMismatchInfo = {
  scannedCode: string;
  expectedSku: string;
  expectedDescription: string;
  foundSource: string;
  foundSku: string;
  foundDescription: string;
  foundCustomerName: string;
  detail: string;
};

function readResponseData(err: unknown): Record<string, unknown> | null {
  if (
    err &&
    typeof err === 'object' &&
    'response' in err &&
    err.response &&
    typeof err.response === 'object' &&
    'data' in err.response &&
    err.response.data &&
    typeof err.response.data === 'object'
  ) {
    return err.response.data as Record<string, unknown>;
  }
  return null;
}

/** Structured mismatch from POST .../scan/ (HTTP 409 SCAN_MISMATCH). */
export function extractScanMismatch(err: unknown): ScanMismatchInfo | null {
  const data = readResponseData(err);
  if (!data || data.code !== 'SCAN_MISMATCH') return null;
  const found =
    data.found && typeof data.found === 'object'
      ? (data.found as Record<string, unknown>)
      : {};
  const scannedCode = typeof data.scanned_code === 'string' ? data.scanned_code.trim() : '';
  if (!scannedCode) return null;
  return {
    scannedCode,
    expectedSku: typeof data.expected_sku === 'string' ? data.expected_sku : '',
    expectedDescription:
      typeof data.expected_description === 'string' ? data.expected_description : '',
    foundSource: typeof found.source === 'string' ? found.source : 'unknown',
    foundSku: typeof found.sku === 'string' ? found.sku : scannedCode,
    foundDescription: typeof found.description === 'string' ? found.description : '',
    foundCustomerName: typeof found.customer_name === 'string' ? found.customer_name : '',
    detail: typeof data.detail === 'string' ? data.detail : 'Scan does not match expected SKU',
  };
}

export function describeScanMismatch(info: ScanMismatchInfo): string {
  if (info.foundSource === 'run_item' && info.foundDescription) {
    const who = info.foundCustomerName ? ` for ${info.foundCustomerName}` : '';
    return `That QR is ${info.foundDescription} (${info.foundSku})${who}.`;
  }
  if (info.foundSource === 'inventory' && info.foundDescription) {
    return `That QR is inventory item ${info.foundDescription} (${info.foundSku}).`;
  }
  if (info.foundDescription) {
    return `That QR reads as ${info.foundDescription} (${info.foundSku}).`;
  }
  return `That QR code is ${info.scannedCode} - not found as another delivery item.`;
}

export function extractScanErrorDetail(err: unknown): string {
  const mismatch = extractScanMismatch(err);
  if (mismatch) return describeScanMismatch(mismatch);
  const data = readResponseData(err);
  if (data && typeof data.detail === 'string' && data.detail.trim()) {
    return data.detail.trim();
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Scan failed';
}

export async function waitForVideoFrames(
  video: HTMLVideoElement,
  timeoutMs = 6000,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  throw new Error('Camera started but no video frames arrived. Close and try Scan again.');
}
