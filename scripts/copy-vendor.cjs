const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const distAssets = path.join(root, 'dist', 'assets');

function copy(source, destination) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
}

copy(
    path.join(root, 'node_modules', 'jspdf', 'dist', 'jspdf.umd.min.js'),
    path.join(distAssets, 'vendor', 'jspdf-4.2.1.umd.min.js')
);
copy(
    path.join(root, 'node_modules', 'html2canvas', 'dist', 'html2canvas.min.js'),
    path.join(distAssets, 'vendor', 'html2canvas-1.4.1.min.js')
);
copy(
    path.join(root, 'node_modules', '@fortawesome', 'fontawesome-free', 'css', 'all.min.css'),
    path.join(distAssets, 'fontawesome', 'css', 'all.min.css')
);
fs.cpSync(
    path.join(root, 'node_modules', '@fortawesome', 'fontawesome-free', 'webfonts'),
    path.join(distAssets, 'fontawesome', 'webfonts'),
    { recursive: true }
);

for (const weight of [300, 400, 500, 600, 700, 800]) {
    copy(
        path.join(root, 'node_modules', '@fontsource', 'plus-jakarta-sans', 'files', `plus-jakarta-sans-latin-${weight}-normal.woff2`),
        path.join(distAssets, 'fonts', `plus-jakarta-sans-latin-${weight}-normal.woff2`)
    );
}
