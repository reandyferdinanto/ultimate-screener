const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Navigate to the app (using port 3004 as discovered)
  await page.goto('http://localhost:3004/search?symbol=LAND.JK');
  
  // Wait for the chart to load - looking for a canvas element within the chart container
  await page.waitForSelector('.tv-lightweight-charts-chart', { timeout: 30000 });
  
  // Wait a bit more for the technical overlays to render
  await page.waitForTimeout(5000);
  
  // Take a screenshot
  const screenshotPath = path.join(process.cwd(), 'land-chart-check.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  
  console.log(`Screenshot saved to ${screenshotPath}`);
  
  // Check for conviction report text in the page
  const reportExists = await page.isVisible('text=CONVICTION_REPORT');
  console.log(`Conviction report visible: ${reportExists}`);

  await browser.close();
})();
