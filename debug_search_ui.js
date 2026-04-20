
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  console.log("Navigating to http://localhost:3000/search...");
  try {
    const response = await page.goto('http://localhost:3000/search', { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log("Response Status:", response.status());
    
    // Take immediate screenshot to see what's there
    await page.screenshot({ path: 'search_initial.png' });
    console.log("Initial screenshot saved.");

    // Check for the button after a short wait
    await page.waitForTimeout(5000);
    const sqzBtn = page.locator('button:has-text("SQZ_DELUXE")');
    const isVisible = await sqzBtn.isVisible();
    console.log("SQZ_DELUXE button visible?", isVisible);
    
    if (isVisible) {
        await sqzBtn.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'search_after_click.png' });
    }
    
  } catch (err) {
    console.error("Error during verification:", err);
    await page.screenshot({ path: 'search_error.png' });
  } finally {
    await browser.close();
  }
})();
