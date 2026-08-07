/**
 * Local Print Service - communicates with the local print server on localhost:8888.
 *
 * Printer assignment is stored on the print server itself (settings.json),
 * not in localStorage. When no printer_name is provided in a request the
 * server falls back to its saved assignment for that role.
 */

export interface HealthResponse {
  status: string;
  version: string;
  printers_available: number;
}

export interface PrinterInfo {
  name: string;
  status: string;
  is_default: boolean;
}

export interface LocalPrintRequest {
  text: string;
  qr_data: string;
  printer_name?: string;
  include_text?: boolean;
  product_title?: string;
  product_brand?: string;
  product_model?: string;
  /** Lime/colored stock: black price band, green price text; title/QR black on paper. */
  green_label_stock?: boolean;
}

export interface LocalPrintResponse {
  success: boolean;
  message: string;
  output?: string;
  error?: string;
}

export interface LocalPrintBatchResponse {
  success: boolean;
  message: string;
  requested: number;
  printed: number;
  failed: number;
  errors: string[];
}

/** Ready-to-print raster × N copies; matches `ImageCopiesPrintRequest` in `printserver/models.py`. */
export interface ImageCopiesRequest {
  image_base64: string;
  copies: number;
  printer_name?: string;
  dpi?: number;
  doc_name?: string;
}

/** PDF × N copies; matches `PdfCopiesPrintRequest` in `printserver/models.py`. */
export interface PdfCopiesRequest {
  pdf_base64: string;
  copies: number;
  printer_name?: string;
  doc_name?: string;
}

/** Persisted on the print server (`settings.json`); matches `PrinterSettings` in `printserver/models.py`. */
export type LabelSizePreset = '3x2' | '1.5x1';

export interface PrinterSettings {
  label_printer: string | null;
  receipt_printer: string | null;
  label_size_preset: LabelSizePreset;
}

class LocalPrintService {
  private baseUrl = 'http://127.0.0.1:8888';
  private timeout = 5000;
  // Print jobs on PDF/virtual printers block until the save dialog is dismissed.
  private printTimeout = 120_000;

  private async request<T>(path: string, options?: RequestInit, timeoutMs?: number): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs ?? this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });
      if (!response.ok) {
        throw new Error(`Print server request failed (${response.status}).`);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Print server request timed out.');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ---------------------------------------------------------------------------
  // Health & discovery
  // ---------------------------------------------------------------------------

  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(`${this.baseUrl}/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  async getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health');
  }

  async listPrinters(): Promise<PrinterInfo[]> {
    return this.request<PrinterInfo[]>('/printers');
  }

  // ---------------------------------------------------------------------------
  // Settings (stored on the print server, not in localStorage)
  // ---------------------------------------------------------------------------

  async getSettings(): Promise<PrinterSettings> {
    return this.request<PrinterSettings>('/settings');
  }

  async updateSettings(settings: PrinterSettings): Promise<PrinterSettings> {
    return this.request<PrinterSettings>('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  // ---------------------------------------------------------------------------
  // Printing - printer_name is optional; server uses its saved setting
  // ---------------------------------------------------------------------------

  async printLabel(request: LocalPrintRequest): Promise<LocalPrintResponse> {
    return this.request<LocalPrintResponse>('/print/label', {
      method: 'POST',
      body: JSON.stringify(request),
    }, this.printTimeout);
  }

  /**
   * One HTTP call for a whole batch of labels. Throws when the print server
   * predates `/print/labels` (older installed exe) so callers can fall back
   * to per-label printing.
   */
  async printLabelBatch(labels: LocalPrintRequest[]): Promise<LocalPrintBatchResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.printTimeout);
    try {
      const response = await fetch(`${this.baseUrl}/print/labels`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labels }),
      });
      if (!response.ok) {
        throw new Error(`Batch label endpoint unavailable (${response.status})`);
      }
      return (await response.json()) as LocalPrintBatchResponse;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Print a pre-rendered raster N times (Label Studio templates).
   * Throws when the installed print server predates `/print/image-copies`
   * so callers can show an "update the print server" message.
   */
  async printImageCopies(request: ImageCopiesRequest): Promise<LocalPrintResponse> {
    return this.requireEndpoint<LocalPrintResponse>('/print/image-copies', request);
  }

  /** Print a PDF N times (Label Studio PDF labels). Throws on old print servers. */
  async printPdfCopies(request: PdfCopiesRequest): Promise<LocalPrintResponse> {
    return this.requireEndpoint<LocalPrintResponse>('/print/pdf-copies', request);
  }

  /** POST that treats 404 (endpoint missing on old exe) as a hard error. */
  private async requireEndpoint<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.printTimeout);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? 'This print server does not support custom labels yet - update it from Admin → Settings.'
            : `Print request failed (${response.status})`,
        );
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Print timed out - check the printer queue and try fewer copies.');
      }
      if (error instanceof TypeError) {
        throw new Error('Local print server is unavailable - start it or open Admin Settings.');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async printTest(): Promise<LocalPrintResponse> {
    return this.request<LocalPrintResponse>('/print/test', {
      method: 'POST',
      body: JSON.stringify({}),
    }, this.printTimeout);
  }

  async printReceipt(
    receiptData: Record<string, unknown>,
    openDrawer = false,
    printerName?: string,
  ): Promise<LocalPrintResponse> {
    return this.request<LocalPrintResponse>('/print/receipt', {
      method: 'POST',
      body: JSON.stringify({
        receipt_data: receiptData,
        open_drawer: openDrawer,
        ...(printerName && { printer_name: printerName }),
      }),
    }, this.printTimeout);
  }

  async printTestReceipt(printerName?: string): Promise<LocalPrintResponse> {
    return this.request<LocalPrintResponse>('/print/test-receipt', {
      method: 'POST',
      body: JSON.stringify(printerName ? { printer_name: printerName } : {}),
    }, this.printTimeout);
  }

  // ---------------------------------------------------------------------------
  // Cash drawer
  // ---------------------------------------------------------------------------

  async openCashDrawer(): Promise<LocalPrintResponse> {
    return this.request<LocalPrintResponse>('/drawer/control', {
      method: 'POST',
      body: JSON.stringify({ action: 'open' }),
    }, this.printTimeout);
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  formatManifestRowForPrint(row: {
    sku: string;
    title: string;
    product_title?: string;
    brand?: string | null;
    model?: string | null;
    unit_price?: string | number | null;
  }): LocalPrintRequest {
    let priceText = '$-';
    const p = row.unit_price;
    if (p != null && p !== '') {
      if (typeof p === 'number' && !Number.isNaN(p)) {
        priceText = `$${p.toFixed(2)}`;
      } else {
        const s = String(p).trim();
        priceText = s.startsWith('$') ? s : `$${s}`;
      }
    }
    return {
      text: priceText,
      qr_data: row.sku,
      product_title: row.product_title || row.title,
      product_brand: row.brand?.trim() || undefined,
      product_model: row.model?.trim() || undefined,
      include_text: true,
    };
  }
}

export const localPrintService = new LocalPrintService();
