const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const failures = [];

function fail(message) {
    failures.push(message);
}

function walk(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const target = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) {
            fail('Symlink tidak diizinkan dalam artefak Pages: ' + path.relative(root, target));
            return [];
        }
        return entry.isDirectory() ? walk(target) : [target];
    });
}

if (!fs.existsSync(dist) || !fs.statSync(dist).isDirectory()) {
    throw new Error('Folder dist tidak ditemukan.');
}

const files = walk(dist);
const totalBytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
if (totalBytes >= 10 * 1024 * 1024 * 1024) {
    fail('Ukuran artefak Pages harus di bawah 10 GB.');
}

const required = [
    'index.html',
    'assets/app.css',
    'assets/mbg-core.js',
    'assets/mbg-archive.js',
    'assets/vendor/jspdf-4.2.1.umd.min.js',
    'assets/vendor/html2canvas-1.4.1.min.js',
    'assets/fontawesome/css/all.min.css'
];

for (const relative of required) {
    if (!fs.existsSync(path.join(dist, relative))) {
        fail('Aset wajib tidak ditemukan: dist/' + relative);
    }
}

const htmlPath = path.join(dist, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const cssPath = path.join(dist, 'assets', 'app.css');
const css = fs.readFileSync(cssPath, 'utf8');

if (/<base\b/i.test(html)) {
    fail('Tag <base> dapat merusak path project-site GitHub Pages.');
}

const cspTag = html.match(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/i)?.[0] || '';
for (const directive of ["default-src 'self'", "connect-src 'self'", "object-src 'none'", "base-uri 'none'"]) {
    if (!cspTag.includes(directive)) fail('CSP wajib tidak lengkap: ' + directive);
}

if (!/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html)) {
    fail('Meta robots noindex wajib dipertahankan untuk aplikasi operasional.');
}

function checkReference(reference, baseDirectory, sourceLabel) {
    const value = String(reference || '').trim();
    if (!value || value.startsWith('#') || value.includes('${')) return;
    if (/^(?:data:|blob:|mailto:|tel:)/i.test(value)) return;
    if (/^(?:javascript:|https?:|\/\/)/i.test(value)) {
        fail(sourceLabel + ' memakai referensi nonlokal/tidak aman: ' + value);
        return;
    }
    if (value.startsWith('/')) {
        fail(sourceLabel + ' memakai path absolut yang rusak di project Pages: ' + value);
        return;
    }

    const clean = value.split(/[?#]/, 1)[0];
    let decoded = clean;
    try { decoded = decodeURIComponent(clean); } catch (error) {}
    const target = path.resolve(baseDirectory, decoded);
    const relativeToDist = path.relative(dist, target);
    if (relativeToDist.startsWith('..') || path.isAbsolute(relativeToDist)) {
        fail(sourceLabel + ' keluar dari folder dist: ' + value);
    } else if (!fs.existsSync(target)) {
        fail(sourceLabel + ' merujuk aset yang tidak ditemukan: ' + value);
    }
}

const attributePattern = /\b(?:src|href|poster|action)\s*=\s*(["'])(.*?)\1/gi;
for (const match of html.matchAll(attributePattern)) {
    checkReference(match[2], dist, 'dist/index.html');
}

const cssUrlPattern = /url\(\s*(["']?)(.*?)\1\s*\)/gi;
for (const match of css.matchAll(cssUrlPattern)) {
    checkReference(match[2], path.dirname(cssPath), 'dist/assets/app.css');
}

for (const filename of [
    'signature-agung.png',
    'signature-putri.png',
    'signature-sabrina.png',
    'signature-krisna.png'
]) {
    if (fs.existsSync(path.join(dist, filename)) || html.includes(filename)) {
        fail('Tanda tangan tidak boleh masuk artefak publik: ' + filename);
    }
}

const authoredSources = [
    html,
    fs.readFileSync(path.join(dist, 'assets', 'mbg-core.js'), 'utf8'),
    fs.readFileSync(path.join(dist, 'assets', 'mbg-archive.js'), 'utf8')
].join('\n');

const secretPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
    /\bAIza[0-9A-Za-z_-]{30,}\b/,
    /\bsk-[A-Za-z0-9]{20,}\b/
];

if (secretPatterns.some(pattern => pattern.test(authoredSources))) {
    fail('Pola kredensial atau private key ditemukan di artefak.');
}

if (/askijagakarsa\.chatgpt\.site/i.test(authoredSources)) {
    fail('Artefak masih terikat ke domain chatgpt.site lama.');
}

if (failures.length) {
    console.error('Validasi GitHub Pages gagal:');
    failures.forEach(message => console.error('- ' + message));
    process.exit(1);
}

console.log('Validasi GitHub Pages lolos.');
console.log('- File artefak: ' + files.length);
console.log('- Ukuran artefak: ' + (totalBytes / 1024 / 1024).toFixed(2) + ' MB');
console.log('- Seluruh path aset relatif dan tersedia.');
console.log('- Tidak ada tanda tangan atau pola kredensial dalam paket publik.');
