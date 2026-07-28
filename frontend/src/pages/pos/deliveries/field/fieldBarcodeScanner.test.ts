import { describe, expect, it } from 'vitest';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import {
  ScanDedupe,
  cameraErrorMessage,
  createScanHints,
  describeScanMismatch,
  extractScanErrorDetail,
  extractScanMismatch,
  extractSkuFromScannedPayload,
  normalizeScannedCode,
  resolveScannerMode,
} from './fieldBarcodeScanner';

describe('fieldBarcodeScanner', () => {
  it('normalizes scanned codes', () => {
    expect(normalizeScannedCode('  ABC-123  ')).toBe('ABC-123');
    expect(normalizeScannedCode('')).toBe('');
    expect(normalizeScannedCode(null)).toBe('');
  });

  it('extracts SKU from plain, URL, and JSON QR payloads', () => {
    expect(extractSkuFromScannedPayload('  WHR-WASH-01  ')).toBe('WHR-WASH-01');
    expect(extractSkuFromScannedPayload('https://ecothrift.example/i?sku=GE-DRY-22')).toBe(
      'GE-DRY-22',
    );
    expect(extractSkuFromScannedPayload('https://ecothrift.example/items/SOF-210')).toBe('SOF-210');
    expect(extractSkuFromScannedPayload('{"sku":"TBL-88","qty":1}')).toBe('TBL-88');
    expect(extractSkuFromScannedPayload('Label\nFRI-RF-11')).toBe('FRI-RF-11');
  });

  it('configures QR-only decode hints', () => {
    const hints = createScanHints();
    expect(hints.get(DecodeHintType.POSSIBLE_FORMATS)).toEqual([BarcodeFormat.QR_CODE]);
    expect(hints.get(DecodeHintType.TRY_HARDER)).toBe(true);
  });

  it('selects live mode only in secure contexts with media devices', () => {
    expect(
      resolveScannerMode({ isSecureContext: true, hasMediaDevices: true }),
    ).toBe('live');
    expect(
      resolveScannerMode({ isSecureContext: false, hasMediaDevices: true }),
    ).toBe('unavailable');
    expect(
      resolveScannerMode({ isSecureContext: true, hasMediaDevices: false }),
    ).toBe('unavailable');
  });

  it('suppresses duplicate decodes inside the debounce window', () => {
    const dedupe = new ScanDedupe(1000);
    expect(dedupe.shouldAccept('SKU1', 1000)).toBe(true);
    expect(dedupe.shouldAccept('SKU1', 1500)).toBe(false);
    expect(dedupe.shouldAccept('SKU2', 1500)).toBe(true);
    expect(dedupe.shouldAccept('SKU1', 2100)).toBe(true);
    dedupe.clear();
    expect(dedupe.shouldAccept('SKU2', 2101)).toBe(true);
  });

  it('maps camera and API errors for the driver', () => {
    expect(cameraErrorMessage({ name: 'NotAllowedError', message: 'denied' })).toMatch(
      /permission/i,
    );
    expect(cameraErrorMessage({ name: 'NotFoundError', message: 'missing' })).toMatch(/no camera/i);
    expect(
      extractScanErrorDetail({
        response: { data: { detail: 'Scan does not match expected SKU WHR-WASH-01' } },
      }),
    ).toBe('Scan does not match expected SKU WHR-WASH-01');
    expect(extractScanErrorDetail(new Error('network'))).toBe('network');
    expect(extractScanErrorDetail({})).toBe('Scan failed');
  });

  it('parses SCAN_MISMATCH lookup payload for the driver decision UI', () => {
    const err = {
      response: {
        data: {
          detail: 'Scan does not match expected SKU WHR-WASH-01',
          code: 'SCAN_MISMATCH',
          scanned_code: 'GE-DRY-22',
          expected_sku: 'WHR-WASH-01',
          expected_description: 'Whirlpool washer',
          found: {
            source: 'run_item',
            sku: 'GE-DRY-22',
            description: 'GE electric dryer',
            customer_name: 'Jordan',
          },
        },
      },
    };
    const info = extractScanMismatch(err);
    expect(info?.scannedCode).toBe('GE-DRY-22');
    expect(info?.foundDescription).toBe('GE electric dryer');
    expect(describeScanMismatch(info!)).toMatch(/GE electric dryer/);
    expect(describeScanMismatch(info!)).toMatch(/Jordan/);
    expect(extractScanErrorDetail(err)).toMatch(/GE electric dryer/);
  });
});
