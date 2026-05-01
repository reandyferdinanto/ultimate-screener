const fs = require('fs');
const path = 'c:\\reandy\\ultimate-screener\\app\\app\\search\\page.tsx';
let code = fs.readFileSync(path, 'utf8');

const targetStr = `                    <div className="command-group chart-controls panel" style={{ display: 'flex', gap: '16px', padding: '16px', flexDirection: 'column' }}>
                        <div className="toggle-group" style={{ display: 'flex', gap: '8px' }}>
                            <button className={\`toggle-item \${chartType === 'candle' ? 'active' : ''}\`} onClick={() => setChartType('candle')}>CANDLE</button>
                            <button className={\`toggle-item \${chartType === 'line' ? 'active' : ''}\`} onClick={() => setChartType('line')}>LINE</button>
                        </div>

                        <div className="indicator-matrix" style={{ display: 'flex', gap: '8px' }}>
                            <button className={\`matrix-btn trend \${showEMA9 ? 'active' : ''}\`} onClick={() => setShowEMA9(!showEMA9)}>E9</button>
                            <button className={\`matrix-btn trend \${showEMA20 ? 'active' : ''}\`} onClick={() => setShowEMA20(!showEMA20)}>E20</button>
                            <button className={\`matrix-btn trend \${showEMA60 ? 'active' : ''}\`} onClick={() => setShowEMA60(!showEMA60)}>E60</button>
                            <button className={\`matrix-btn trend \${showEMA200 ? 'active' : ''}\`} onClick={() => setShowEMA200(!showEMA200)}>E200</button>
                            <button className={\`matrix-btn vol \${showSqueezeDeluxe ? 'active' : ''}\`} onClick={() => setShowSqueezeDeluxe(!showSqueezeDeluxe)}>SQZ DLX</button>
                        </div>
                    </div>`;

const newStr = `                    <div className="command-group chart-controls panel" style={{ display: 'flex', gap: '16px', padding: '16px', flexDirection: 'column' }}>
                        <div className="chart-type-toggle">
                            <button className={\`\${chartType === 'candle' ? 'active' : ''}\`} onClick={() => setChartType('candle')}>CANDLE</button>
                            <button className={\`\${chartType === 'line' ? 'active' : ''}\`} onClick={() => setChartType('line')}>LINE</button>
                        </div>

                        <div className="indicator-matrix">
                            <button className={\`matrix-btn trend \${showEMA9 ? 'active' : ''}\`} onClick={() => setShowEMA9(!showEMA9)}>E9</button>
                            <button className={\`matrix-btn trend \${showEMA20 ? 'active' : ''}\`} onClick={() => setShowEMA20(!showEMA20)}>E20</button>
                            <button className={\`matrix-btn trend \${showEMA60 ? 'active' : ''}\`} onClick={() => setShowEMA60(!showEMA60)}>E60</button>
                            <button className={\`matrix-btn trend \${showEMA200 ? 'active' : ''}\`} onClick={() => setShowEMA200(!showEMA200)}>E200</button>
                            <button className={\`matrix-btn vol \${showSqueezeDeluxe ? 'active' : ''}\`} onClick={() => setShowSqueezeDeluxe(!showSqueezeDeluxe)}>SQZ DLX</button>
                        </div>
                    </div>`;

if (code.includes(targetStr)) {
    fs.writeFileSync(path, code.replace(targetStr, newStr));
    console.log('updated controls css classes');
} else {
    console.log('could not find target string');
}
