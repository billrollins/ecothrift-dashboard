import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * The bookmark bug (owner 2026-10-20): Add to Home Screen from any ecothrift.us page must install Thrift+ Member, not make a
 * Safari bookmark. The member app's manifest and iPhone tags used to be put in the head only on /scan; the public site
 * (frontend-public) now carries them on every page, with start_url /scan. These read the two files as they are.
 */
const ROOT = join(__dirname, '../../../../..');
const publicHtml = readFileSync(join(ROOT, 'frontend-public/index.html'), 'utf8');
const manifest = JSON.parse(readFileSync(join(ROOT, 'frontend/public/scan/manifest.webmanifest'), 'utf8'));

const tag = (html: string, pattern: RegExp) => html.match(pattern)?.[0] ?? '';

describe('the member app installs from every public page', () => {
  it('the public site head links the member manifest and the iPhone tags', () => {
    expect(publicHtml).toMatch(/<link rel="manifest" href="\/scan\/manifest\.webmanifest"/);
    expect(publicHtml).toMatch(/<link rel="apple-touch-icon" href="\/scan\/icons\/apple-touch-icon\.png"/);
    expect(publicHtml).toMatch(/<meta name="apple-mobile-web-app-title" content="Thrift\+ Member"/);
    expect(publicHtml).toMatch(/<meta name="apple-mobile-web-app-capable" content="yes"/);
    expect(publicHtml).toMatch(/<meta name="mobile-web-app-capable" content="yes"/);
    // One touch icon only: a second, the old site icon, would win on some iPhones.
    expect(publicHtml.match(/rel="apple-touch-icon"/g)).toHaveLength(1);
  });

  it('uses the same files the scanner puts in its own head', () => {
    const installApp = readFileSync(join(__dirname, 'installApp.ts'), 'utf8');
    expect(installApp).toContain("manifest: '/scan/manifest.webmanifest'");
    expect(installApp).toContain("icon: '/scan/icons/apple-touch-icon.png'");
    expect(installApp).toContain("title: 'Thrift+ Member'");
    expect(tag(publicHtml, /<meta name="theme-color"[^>]*>/)).not.toBe(''); // the site keeps its own colour
  });

  it('the manifest opens the app on /scan, full screen, for the whole site', () => {
    expect(manifest.start_url).toBe('/scan');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.name).toBe('Thrift+ Member');
    for (const icon of manifest.icons as Array<{ src: string }>) {
      expect(existsSync(join(ROOT, 'frontend/public', icon.src))).toBe(true);
    }
    expect(existsSync(join(ROOT, 'frontend/public/scan/icons/apple-touch-icon.png'))).toBe(true);
  });
});
