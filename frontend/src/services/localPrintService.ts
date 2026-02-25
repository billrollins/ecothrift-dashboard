/**
 * Local Print Service — communicates with the local print server on localhost:8888.
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
}

export interface LocalPrintResponse {
  success: boolean;
  message: string;
  output?: string;
  error?: string;
}

export interface PrinterSettings {
  label_printer: string | null;
  receipt_printer: string | null;
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
      return await response.json();
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
  // Printing — printer_name is optional; server uses its saved setting
  // ---------------------------------------------------------------------------

  async printLabel(request: LocalPrintRequest): Promise<LocalPrintResponse> {
    return this.request<LocalPrintResponse>('/print/label', {
      method: 'POST',
      body: JSON.stringify(request),
    }, this.printTimeout);
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
  }): LocalPrintRequest {
    return {
      text: `$${row.title}`,
      qr_data: row.sku,
      product_title: row.product_title || row.title,
      include_text: true,
    };
  }
}

export const localPrintService = new LocalPrintService();
