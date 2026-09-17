import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const dir = process.cwd();
const chrome = process.env.CC_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const base = process.env.CC_BASE || 'http://localhost:5173';
const userDataDir = process.env.CC_USER_DATA;
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

function livePath(raw) {
  const href = raw.includes('://') ? raw : `${base}${raw.startsWith('/') ? raw : `/${raw}`}`;
  const url = new URL(href);
  if (url.searchParams.has('fixture')) {
    throw new Error(`Live capture only; refused ${href}`);
  }
  return url.toString();
}

const targets = (process.argv.slice(2).length ? process.argv.slice(2) : ['/admin/retail-qa']).map(livePath);

if (!userDataDir) {
  throw new Error('CC_USER_DATA must point at a Chrome profile that is already logged in.');
}

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  userDataDir,
  args: ['--window-size=1440,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 800, deviceScaleFactor: 1 });

try {
  for (const href of targets) {
    await page.goto(href, { waitUntil: 'networkidle0', timeout: 30000 });
    if (new URL(page.url()).pathname.includes('/login')) {
      throw new Error(`Not logged in. Open ${base} in the CC_USER_DATA profile, then rerun.`);
    }
    await page.waitForSelector('.cc-page .band', { timeout: 20000 });
    const slug = new URL(href).pathname.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'page';
    const shotPath = path.join(dir, `${stamp}-${slug}.png`);
    const jsonPath = path.join(dir, `${stamp}-${slug}.json`);
    await page.screenshot({ path: shotPath, clip: { x: 0, y: 0, width: 1440, height: 800 } });
    const day = new URL(page.url()).searchParams.get('day');
    const payload = await page.evaluate(async (date) => {
      const qs = date ? `?date=${encodeURIComponent(date)}` : '';
      const res = await fetch(`/api/routines/qa/today/${qs}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`qa/today ${res.status}`);
      return res.json();
    }, day);
    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
    console.log(JSON.stringify({ shot: shotPath, payload: jsonPath, url: page.url() }));
  }
} finally {
  await browser.close();
}
