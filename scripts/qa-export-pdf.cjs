const { chromium } = require('playwright-core');
const fs = require('node:fs');

(async () => {
  fs.mkdirSync('qa-output', { recursive: true });

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 }
  });
  const page = await context.newPage();

  page.on('console', message => {
    if (message.type() === 'error') {
      console.error('Browser console:', message.text());
    }
  });

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() =>
    typeof window.generatePDF === 'function' &&
    document.querySelectorAll('.a4-page').length === 9
  );

  await page.evaluate(() => {
    window.confirmValidationBeforeExport = () => true;

    const qaPanel = document.createElement('div');
    qaPanel.id = 'qaBadgeMatrix';
    qaPanel.style.cssText = [
      'position:absolute',
      'left:12mm',
      'right:12mm',
      'bottom:8mm',
      'z-index:100',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'gap:8px',
      'padding:8px',
      'background:#ffffff',
      'border:1px solid #cbd5e1',
      'border-radius:8px'
    ].join(';');
    qaPanel.innerHTML = [
      '<span class="pdf-badge bg-purple-600 text-white">TERTINGGI</span>',
      '<span class="pdf-badge bg-blue-600 text-white">KONSUMSI BAIK</span>',
      '<span class="pdf-badge bg-emerald-800 text-white">HABIS 100% (ZERO WASTE)</span>',
      '<span class="report-badge report-badge-compact text-[8px] bg-emerald-200 text-emerald-950 px-2 rounded"><i class="fa-solid fa-circle-check"></i> QC Passed</span>',
      '<span class="report-badge report-badge-header text-[9px] bg-purple-600 text-white px-3 rounded-lg gap-1"><i class="fa-solid fa-lock"></i><span>23 SEPTEMBER 2026</span></span>'
    ].join('');
    document.getElementById('page-1').appendChild(qaPanel);
  });

  const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
  await page.evaluate(() => window.generatePDF());
  const download = await downloadPromise;
  await download.saveAs('qa-output/badge-hotfix-verification.pdf');

  const metrics = await page.locator('#qaBadgeMatrix > span').evaluateAll(elements =>
    elements.map(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        text: element.textContent.trim(),
        display: style.display,
        height: rect.height,
        lineHeight: style.lineHeight,
        paddingTop: style.paddingTop,
        paddingBottom: style.paddingBottom
      };
    })
  );
  fs.writeFileSync('qa-output/badge-metrics.json', JSON.stringify(metrics, null, 2));

  await browser.close();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
