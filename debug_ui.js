const { chromium } = require('playwright');

async function main() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
        console.log("Navigating to search page...");
        await page.goto('http://localhost:3000/search?symbol=GOTO.JK', { waitUntil: 'networkidle' });
        await page.screenshot({ path: 'debug_search.png', fullPage: true });
        const content = await page.content();
        console.log("Page title:", await page.title());
        console.log("Body length:", content.length);
        // Check for any panel headers
        const panels = await page.$$eval('.panel-header', nodes => nodes.map(n => n.innerText));
        console.log("Panels found:", panels);
    } catch (e) {
        console.log("Error:", e.message);
    }
    await browser.close();
}
main();
