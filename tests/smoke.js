// Headless-Chrome smoke test via raw CDP (no puppeteer dependency).
// Usage: node tests/smoke.js
// Exits non-zero on any failed assertion; fails on page console errors.
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 9342;
const FILE = 'file://' + path.resolve(__dirname, '..', 'index.html');
let failures = 0;
const pageErrors = [];
function check(name, cond, extra) {
  console.log((cond ? 'ok - ' : 'FAIL - ') + name + (cond ? '' : ' :: ' + (extra || '')));
  if (!cond) failures++;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function poll(fn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (await fn()) return true; } catch (e) { /* retry */ }
    await wait(200);
  }
  return false;
}

(async () => {
  const chrome = spawn('/opt/meta-chromium/chrome', [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--remote-debugging-port=' + PORT, '--user-data-dir=/tmp/pantry-smoke-' + process.pid,
    'about:blank',
  ], { stdio: 'ignore' });
  let targets = [];
  for (let i = 0; i < 50 && targets.length === 0; i++) {
    await wait(200);
    try {
      targets = JSON.parse(await new Promise((res, rej) => {
        http.get('http://127.0.0.1:' + PORT + '/json/list', (r) => {
          let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(d));
        }).on('error', rej);
      }));
    } catch (e) { /* retry */ }
  }
  if (!targets.length) { console.log('FAIL - chrome did not start'); process.exit(2); }
  const wsUrl = targets[0].webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);
  await new Promise((res) => { ws.onopen = res; });
  let seq = 0; const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      pageErrors.push(JSON.stringify(msg.params.args));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push(JSON.stringify(msg.params.exceptionDetails).slice(0, 300));
    }
  };
  const send = (method, params) => new Promise((res) => {
    const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: FILE });
  await wait(1500);
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return { error: JSON.stringify(r.result.exceptionDetails).slice(0, 300) };
    return r.result ? r.result.result.value : undefined;
  };
  const iso = (plusDays) => {
    const d = new Date(Date.now() + plusDays * 86400000);
    return d.toISOString().slice(0, 10);
  };

  check('page title contains Pantry', (await ev('document.title'))?.includes('Pantry'));
  check('empty state visible on fresh profile', (await ev(`!document.getElementById('emptyState').hidden`)) === true);
  check('stats start at 0', (await ev(`document.getElementById('statTotal').textContent`)) === '0');

  // Add a healthy item via the real form.
  await ev(`document.getElementById('itemName').value = 'Test Rice'`);
  await ev(`document.getElementById('formQty').value = '5'`);
  await ev(`document.getElementById('formLowAt').value = '1'`);
  await ev(`document.getElementById('saveBtn').click()`);
  check('1 card after adding item', await poll(async () =>
    (await ev(`document.querySelectorAll('.card').length`)) === 1, 3000));
  check('stat total becomes 1', (await ev(`document.getElementById('statTotal').textContent`)) === '1');
  check('empty state hidden after add', (await ev(`document.getElementById('emptyState').hidden`)) === true);

  // Stepper + increases quantity.
  await ev(`document.querySelector('.card button[data-act="plus"]').click()`);
  check('qty stepper raises qty to 6 kg', await poll(async () =>
    (await ev(`document.querySelector('.card .qty').textContent`))?.includes('6 kg'), 3000));

  // Add a low + expired item: LOW and EXPIRED badges, enters shopping list.
  await ev(`document.getElementById('itemName').value = 'Test Milk'`);
  await ev(`document.getElementById('formQty').value = '1'`);
  await ev(`document.getElementById('formLowAt').value = '2'`);
  await ev(`document.getElementById('formExpiry').value = '${iso(-1)}'`);
  await ev(`document.getElementById('saveBtn').click()`);
  check('2 cards after second add', await poll(async () =>
    (await ev(`document.querySelectorAll('.card').length`)) === 2, 3000));
  check('LOW badge present', (await ev(`document.body.innerText.includes('LOW')`)) === true);
  check('EXPIRED badge present', (await ev(`document.body.innerText.includes('EXPIRED')`)) === true);
  check('shopping list has 1 entry (only the low+expired item)', await poll(async () =>
    (await ev(`document.querySelectorAll('#shopList li').length`)) === 1, 3000));

  // Add a soon-expiring item (3 days out).
  await ev(`document.getElementById('itemName').value = 'Test Dal'`);
  await ev(`document.getElementById('formQty').value = '5'`);
  await ev(`document.getElementById('formLowAt').value = '1'`);
  await ev(`document.getElementById('formExpiry').value = '${iso(3)}'`);
  await ev(`document.getElementById('saveBtn').click()`);
  check('3 cards after third add', await poll(async () =>
    (await ev(`document.querySelectorAll('.card').length`)) === 3, 3000));
  check('EXPIRING SOON badge present', (await ev(`document.body.innerText.includes('EXPIRING SOON')`)) === true);
  check('stat expired = 1, soon = 1', (await ev(`document.getElementById('statExpired').textContent`)) === '1' &&
    (await ev(`document.getElementById('statSoon').textContent`)) === '1');

  // Search filter narrows to the milk card, then clearing restores all.
  await ev(`document.getElementById('searchInput').value = 'Milk'; document.getElementById('searchInput').dispatchEvent(new Event('input', {bubbles:true}))`);
  check('search narrows to 1 card', await poll(async () =>
    (await ev(`document.querySelectorAll('.card').length`)) === 1, 3000));
  await ev(`document.getElementById('searchInput').value = ''; document.getElementById('searchInput').dispatchEvent(new Event('input', {bubbles:true}))`);
  check('clearing search restores 3 cards', await poll(async () =>
    (await ev(`document.querySelectorAll('.card').length`)) === 3, 3000));

  // Language toggle + Bengali digits.
  await ev(`document.getElementById('langBtn').click()`);
  check('html lang switches to bn', (await ev(`document.documentElement.lang`)) === 'bn');
  check('lang button now reads English', (await ev(`document.getElementById('langBtn').textContent`)) === 'English');
  check('stat total uses Bengali digits', /[\u09e6-\u09ef]/.test(String(await ev(`document.getElementById('statTotal').textContent`))), String(await ev(`document.getElementById('statTotal').textContent`)));

  // Sample loader + persistence across reload.
  await ev(`window.__pantry.addSample()`);
  check('sample adds 5 items (total 8)', await poll(async () =>
    (await ev(`document.querySelectorAll('.card').length`)) === 8, 3000));
  check('sample note visible', (await ev(`!document.getElementById('sampleNote').hidden`)) === true);
  await send('Page.navigate', { url: FILE });
  await wait(1500);
  check('items persist after reload', await poll(async () =>
    (await ev(`document.querySelectorAll('.card').length`)) === 8, 3000));

  // Typed-DELETE erase clears everything.
  await ev(`document.getElementById('eraseInput').value = 'DELETE'`);
  await ev(`document.getElementById('eraseBtn').click()`);
  check('erase clears all items', await poll(async () =>
    (await ev(`document.querySelectorAll('.card').length`)) === 0, 3000));
  check('empty state visible after erase', (await ev(`!document.getElementById('emptyState').hidden`)) === true);

  // 390px mobile check via emulation.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await wait(600);
  const overflow = await ev(`document.documentElement.scrollWidth > 390 + 5`);
  check('390px viewport: no horizontal overflow', overflow === false, 'scrollWidth exceeded');
  check('no page console/exception errors', pageErrors.length === 0, pageErrors.join(' | '));

  ws.close(); chrome.kill();
  console.log(failures === 0 ? 'SMOKE GREEN' : 'SMOKE FAILURES: ' + failures);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('SMOKE HARNESS ERROR', e); process.exit(2); });
