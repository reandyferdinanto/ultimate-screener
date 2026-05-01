const fs = require('fs');
const path = 'c:\\reandy\\ultimate-screener\\app\\app\\search\\page.tsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Fix timeframe selector
code = code.replace(
    /<div className="timeframe-pill">/g,
    '<div className="timeframe-selector">'
);
code = code.replace(
    /className={`pill-item/g,
    'className={`tf-pill'
);

// 2. Fix wrapper height
code = code.replace(
    /<div className="chart-wrapper main-viz panel" style={{ padding: 0 }}>/g,
    '<div className="chart-wrapper main-viz panel" style={{ padding: 0, height: "auto", overflow: "visible" }}>'
);

fs.writeFileSync(path, code);
console.log('Fixed page.tsx');
