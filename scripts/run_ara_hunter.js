const { execSync } = require('child_process');

async function run() {
    while (true) {
        console.log(`[${new Date().toISOString()}] Starting ARA Hunter Scan...`);
        try {
            execSync('node scripts/ara_hunter_scanner.js', { stdio: 'inherit' });
            console.log(`[${new Date().toISOString()}] Scan completed. Waiting 5 minutes...`);
        } catch (e) {
            console.error(`[${new Date().toISOString()}] Scan failed:`, e.message);
        }
        await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
    }
}

run();
