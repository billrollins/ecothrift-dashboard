import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const dir = path.dirname(fileURLToPath(import.meta.url));
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const base = process.env.CC_BASE || 'http://localhost:5173';
const logs = [];
const report = { logs, errors: [] };

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--window-size=1440,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 800, deviceScaleFactor: 1 });
let collect = false;
page.on('console', (msg) => {
  if (collect && msg.type() === 'error') logs.push(`console.error: ${msg.text()}`);
});
page.on('pageerror', (err) => {
  if (collect) logs.push(`pageerror: ${err.message}`);
});
page.on('requestfailed', (req) => {
  if (collect) logs.push(`requestfailed: ${req.method()} ${req.url()} ${req.failure()?.errorText || ''}`);
});
page.on('response', (res) => {
  if (collect && res.status() >= 400 && !res.url().includes('favicon')) {
    logs.push(`http ${res.status()}: ${res.url()}`);
  }
});

async function shot(name) {
  const file = path.join(dir, name);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1440, height: 800 } });
  report[name] = file;
  return file;
}

function gate(ins) {
  if (!ins) return ins;
  if (ins.label === 'nudge-dialog') return ins;
  if (ins.pageScroll) report.errors.push(`${ins.label}: page scroll`);
  if (ins.rawKeys?.length) report.errors.push(`${ins.label}: raw keys ${ins.rawKeys.join(', ')}`);
  if (ins.wraps?.length) report.errors.push(`${ins.label}: wrap ${ins.wraps.join(' | ')}`);
  return ins;
}

async function inspect(label) {
  return gate(await page.evaluate((label) => {
    const pageEl = document.querySelector('.cc-page');
    const raw = (document.body.innerText || '').match(/\b[a-z]+[._][a-z0-9._]+\b/g) || [];
    const links = [...document.querySelectorAll('.cc-page a, .cc-page-dialog a, [role="dialog"] a')].map((a) => ({
      text: a.textContent,
      color: getComputedStyle(a).color,
    }));
    const wraps = [...document.querySelectorAll('.cc-page .nowrap, .cc-page h1, .cc-page h2, .cc-page .row, .cc-page .badge, .cc-page .tile .n, .cc-page .tile .d')].filter((el) => {
      return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
    }).map((el) => el.textContent?.slice(0, 80));
    const pageScroll = document.documentElement.scrollHeight > document.documentElement.clientHeight + 2
      || document.body.scrollHeight > document.body.clientHeight + 2
      || (pageEl && pageEl.scrollHeight > pageEl.clientHeight + 2);
    const schedule = document.querySelector('.schedule .scroll');
    const routines = document.querySelector('.routines .scroll');
    return {
      label,
      title: document.title,
      url: location.href,
      hasPage: Boolean(pageEl),
      rawKeys: [...new Set(raw)].filter((k) => k.includes('.') || k.includes('_')).slice(0, 20),
      greenLinks: links.filter((l) => l.color.includes('46, 125, 50') || l.color.includes('46,125,50')),
      wraps,
      pageScroll,
      scheduleOverflow: schedule ? schedule.scrollHeight > schedule.clientHeight + 2 : false,
      routinesOverflow: routines ? routines.scrollHeight > routines.clientHeight + 2 : false,
      times: [...document.querySelectorAll('.schedule .time')].map((el) => el.textContent),
      owners: [...document.querySelectorAll('.routines .owner')].map((el) => el.textContent?.trim()),
      jobTimes: [...document.querySelectorAll('.routines .time')].map((el) => el.textContent?.trim()),
      issues: [...document.querySelectorAll('.issues .row .nowrap, .issues .row span:nth-child(2)')].map((el) => el.textContent),
      summary: document.querySelector('.schedule h2 .sum')?.textContent || '',
      notToday: document.querySelector('.not-today')?.textContent || '',
      dialog: document.querySelector('[role="dialog"] h2, [role="dialog"] .MuiDialogTitle-root')?.textContent || '',
    };
  }, label));
}

async function openRowMenu(selector) {
  const opened = await page.evaluate((selector) => {
    const btn = document.querySelector(selector);
    btn?.click();
    return Boolean(btn);
  }, selector);
  if (!opened) return false;
  await page.waitForSelector('.MuiMenu-paper, [role="menu"]', { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 200));
  return true;
}

async function clickMenuItem(text) {
  const clicked = await page.evaluate((text) => {
    const item = [...document.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent.trim() === text);
    item?.click();
    return Boolean(item);
  }, text);
  return clicked;
}

async function gotoQa(qs = '') {
  await page.goto(`${base}/admin/retail-qa${qs}`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('.cc-page .band', { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 500));
}

async function closeUi() {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 200));
}

async function clickText(selector, text) {
  const clicked = await page.evaluate((selector, text) => {
    const el = [...document.querySelectorAll(selector)].find((node) => node.textContent.trim() === text);
    if (!el) return false;
    el.click();
    return true;
  }, selector, text);
  return clicked;
}

async function clickSel(selector) {
  await page.$eval(selector, (el) => el.click());
}

async function step(name, fn) {
  try {
    await fn();
  } catch (err) {
    report.errors.push(`${name}: ${err.message}`);
    await shot(`error-${name.replace(/[^\w.-]+/g, '-')}.png`).catch(() => {});
  }
}

await page.goto(`${base}/login`, { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForSelector('input[type="email"]');
await page.type('input[type="email"]', 'cc-preview@local.test');
await page.type('input[type="password"]', 'CcPreview-1440');
await Promise.all([
  page.click('button[type="submit"]'),
  page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {}),
]);
await page.waitForFunction(() => !location.pathname.includes('/login'), { timeout: 20000 });

await gotoQa('?fixture=problem');
collect = true;
report.A = await inspect('A');
await shot('A.png');
await shot('01-schedule-times.png');
await shot('02-tiles.png');

await step('12-before', async () => {
  const late = await page.$('.schedule .row.s-warn');
  if (late) await late.hover();
  await new Promise((r) => setTimeout(r, 200));
  report.callinBefore = await inspect('callin-before');
  await shot('12-callin-before.png');
});

await step('12-after', async () => {
  const opened = await openRowMenu('.schedule .row.s-warn .act');
  if (!opened) throw new Error('Called in control not found');
  const clicked = await clickMenuItem('Called in');
  if (!clicked) throw new Error('Called in menu item not found');
  await new Promise((r) => setTimeout(r, 500));
  report.callinAfter = await inspect('callin-after');
  await shot('12-callin-after.png');
});

await step('12-undo', async () => {
  const undone = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Undo');
    btn?.click();
    return Boolean(btn);
  });
  report.callinUndo = await inspect('callin-undo');
  if (undone) await shot('12-callin-undo.png');
});

await step('13-nudge', async () => {
  await closeUi();
  await gotoQa('?fixture=problem');
  const opened = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.issues .act, .routines .act')].find((b) => /Nudge/.test(b.textContent || ''));
    btn?.click();
    return Boolean(btn);
  });
  if (!opened) throw new Error('Nudge not found');
  await page.waitForSelector('.MuiMenu-paper, [role="menu"], .nudge-pop', { timeout: 8000 });
  await clickMenuItem('Nudge');
  await page.waitForSelector('.nudge-pop', { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 250));
  await shot('13-nudge.png');
  await clickText('button', 'Copy');
  await new Promise((r) => setTimeout(r, 300));
  await closeUi();
  await shot('13-nudge-stamped.png');
});

await step('09-score', async () => {
  await closeUi();
  await clickSel('.hero');
  await page.waitForSelector('.score-cols', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 250));
  await shot('09-score-week.png');
  const value = await page.$eval('.score-scope select', (el) => {
    const opt = [...el.options].find((o) => o.value && o.value !== 'week');
    return opt ? opt.value : '';
  }).catch(() => '');
  if (value) {
    await page.select('.score-scope select', value);
    await new Promise((r) => setTimeout(r, 250));
    await shot('09-score-day.png');
  }
  await closeUi();
});

await step('10-week', async () => {
  const opened = await clickText('a', 'Week view');
  if (!opened) throw new Error('Week view not found');
  await page.waitForSelector('.week-grid, .week-filters', { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 300));
  await shot('10-week-view.png');
  await closeUi();
});

await gotoQa('');
report.B = await inspect('B');
await shot('B.png');
await shot('03-summary.png');
await shot('07-projection.png');

await step('04-05-owners', async () => {
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.routines .name')].find((node) => /Retail open/.test(node.textContent || ''));
    el?.scrollIntoView({ block: 'center' });
  });
  await new Promise((r) => setTimeout(r, 200));
  report.owners = await inspect('owners');
  await shot('04-scheduled-owner.png');
  await shot('05-due-times.png');
});

await shot('06-issues.png');

await step('08-dots', async () => {
  const badges = await page.$$('button.badge');
  if (!badges[2]) throw new Error('Section checks badge missing');
  await badges[2].evaluate((el) => el.click());
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 300));
  report.C = await inspect('C');
  await shot('C.png');
  await shot('08-section-dots.png');
  await closeUi();
});

await step('14-walk', async () => {
  const badges = await page.$$('button.badge');
  if (!badges[0]) throw new Error('Spot walks badge missing');
  await badges[0].evaluate((el) => el.click());
  await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 300));
  await page.hover('.walk-now, [title="No section is ready"]');
  await new Promise((r) => setTimeout(r, 200));
  await shot('14-walk-gate.png');
  await closeUi();
});

await step('11-banner', async () => {
  await gotoQa('?day=2026-09-15');
  await page.waitForSelector('.not-today', { timeout: 8000 });
  report.notToday = await inspect('not-today');
  await shot('11-not-today.png');
});

await step('18-closed', async () => {
  await gotoQa('?day=2026-09-14');
  report.closed = await inspect('closed');
  await shot('18-closed-day.png');
});

await gotoQa('?fixture=scroll');
report.D = await inspect('D');
await shot('D.png');

await step('item-1-hard', async () => {
  await gotoQa('?fixture=hard');
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.routines .name')].find((node) => /Retail open/.test(node.textContent || ''));
    el?.scrollIntoView({ block: 'center' });
  });
  await new Promise((r) => setTimeout(r, 200));
  report.hard = await inspect('hard');
  await shot('item-1-hard.png');
});

await step('item-2-nudge-align', async () => {
  await gotoQa('?fixture=hard');
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.routines .name')].find((node) => /Retail open/.test(node.textContent || ''));
    el?.scrollIntoView({ block: 'center' });
  });
  report.nudgeAlign = await inspect('nudge-align');
  await shot('item-2-nudge-align.png');
});

await step('item-3-scheduled', async () => {
  await gotoQa('?fixture=scheduled');
  report.scheduled = await inspect('scheduled');
  await shot('item-3-scheduled-owners.png');
});

await step('item-4-thursday', async () => {
  await gotoQa('?fixture=thursday');
  report.thursday = await inspect('thursday');
  await shot('item-4-thursday.png');
});

await step('item-5-menus', async () => {
  await gotoQa('?fixture=problem');
  if (!await openRowMenu('.schedule .row.s-warn .act')) throw new Error('Late menu not found');
  await shot('item-5-menu-late.png');
  await closeUi();
  if (!await openRowMenu('.schedule .rows .row:not(.s-warn) .act')) throw new Error('In menu not found');
  await shot('item-5-menu-in.png');
  await closeUi();
  await gotoQa('?fixture=scheduled');
  if (!await openRowMenu('.schedule .rows .act')) throw new Error('Expected menu not found');
  await shot('item-5-menu-expected.png');
  await closeUi();
  await gotoQa('?fixture=callin');
  const callinMenu = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.schedule .rows .act')].find((b) => /Clear call-in|Called in/.test(b.textContent || ''));
    btn?.click();
    return Boolean(btn);
  });
  if (!callinMenu) throw new Error('Clear call-in menu not found');
  await page.waitForSelector('.MuiMenu-paper, [role="menu"]', { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 200));
  await shot('item-5-menu-callin.png');
  await closeUi();
  await gotoQa('?fixture=left');
  report.left = await inspect('left');
  await shot('item-5-left.png');
  await gotoQa('?fixture=added');
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.schedule .name')].find((node) => /Pat/.test(node.textContent || ''));
    el?.scrollIntoView({ block: 'center' });
  });
  await new Promise((r) => setTimeout(r, 200));
  report.added = await inspect('added');
  await shot('item-5-added.png');
  const addOpened = await clickText('button', '+ Add person');
  if (addOpened) {
    await page.waitForSelector('.MuiPopover-paper, [role="presentation"]', { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 200));
    await shot('item-5-add-person.png');
    await closeUi();
  }
});

await step('item-6-dialog', async () => {
  await gotoQa('?fixture=nudge');
  await page.waitForFunction(() => /You were nudged/i.test(document.body.innerText), { timeout: 10000 });
  report.nudgeDialog = await inspect('nudge-dialog');
  await shot('item-6-blocking-dialog.png');
  await closeUi();
});

const gateId = process.env.GATE_RUN || '';
if (gateId) {
  await step('14-refusal', async () => {
    await page.goto(`${base}/routines/run/${gateId}`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForFunction(() => /Owner check/i.test(document.body.innerText), { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 400));
    await shot('14-refusal.png');
  });
}

fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
await browser.close();
if (logs.length) report.errors.push(...logs);
console.log(JSON.stringify({
  logs,
  errors: report.errors,
  A: report.A,
  B: report.B,
  C: report.C,
  D: report.D,
  hard: report.hard,
  scheduled: report.scheduled,
  thursday: report.thursday,
  left: report.left,
  added: report.added,
  nudgeDialog: report.nudgeDialog,
  owners: report.owners,
  notToday: report.notToday,
  closed: report.closed,
  callin: { before: report.callinBefore, after: report.callinAfter, undo: report.callinUndo },
}, null, 2));
