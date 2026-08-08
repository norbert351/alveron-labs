import { chromium } from 'playwright-core';

async function main() {
  const t0 = Date.now();
  console.log('launching...');
  const b = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-extensions'],
  });
  console.log('launched in', Date.now() - t0, 'ms');
  const page = await b.newPage();
  console.log('goto...');
  await page.goto('https://example.com', { timeout: 20000, waitUntil: 'domcontentloaded' });
  console.log('loaded in', Date.now() - t0, 'ms, title:', await page.title());
  await b.close();
  console.log('done');
}
main().catch((e) => {
  console.log('ERR', String(e).slice(0, 300));
  process.exit(1);
});
