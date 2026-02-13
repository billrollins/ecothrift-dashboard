/**
 * Local Print Service — communicates with the local print server on localhost:8888.
 */

interface HealthResponse {
  status: string;
  version: string;
  printers_available: number;
}

interface PrinterInfo {
  name: string;
  status: string;
  is_default: boolean;
}

interface LocalPrintRequest {
  text: string;
  qr_data: string;
  printer_name?: string;
  include_text?: boolean;
  product_title?: string;
}

interface LocalPrintResponse {
  success: boolean;
  message: string;
  output?: string;
  error?: string;
}

interface PrinterSettings {
  labelPrinter: string;
  receiptPrinter: string;
}

class LocalPrintService {
  private baseUrl = 'http://127.0.0.1:8888';
  private timeout = 5000;

  private get printerSettings(): PrinterSettings {
    try {
      const stored = localStorage.getItem('printerSettings');
      if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return { labelPrinter: 'Green Label', receiptPrinter: 'POS Printer' };
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

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

  // Health & discovery
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

  // Printing
  async printLabel(request: LocalPrintRequest): Promise<LocalPrintResponse> {
    const printerName = request.printer_name || this.printerSettings.labelPrinter;
    return this.request<LocalPrintResponse>('/print/label', {
      method: 'POST',
      body: JSON.stringify({ ...request, printer_name: printerName }),
    });
  }

  async printTest(): Promise<LocalPrintResponse> {
    return this.request<LocalPrintResponse>('/print/test', {
      method: 'POST',
      body: JSON.stringify({ printer_name: this.printerSettings.labelPrinter }),
    });
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
        printer_name: printerName || this.printerSettings.receiptPrinter,
      }),
    });
  }

  async printTestReceipt(printerName?: string): Promise<LocalPrintResponse> {
    return this.request<LocalPrintResponse>('/print/test-receipt', {
      method: 'POST',
      body: JSON.stringify({
        printer_name: printerName || this.printerSettings.receiptPrinter,
      }),
    });
  }

  // Cash drawer
  async openCashDrawer(): Promise<LocalPrintResponse> {
    return this.request<LocalPrintResponse>('/drawer/control', {
      method: 'POST',
      body: JSON.stringify({
        action: 'open',
        printer_name: this.printerSettings.receiptPrinter,
      }),
    });
  }

  // Utility
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
export type { HealthResponse, PrinterInfo, LocalPrintRequest, LocalPrintResponse, PrinterSettings };
