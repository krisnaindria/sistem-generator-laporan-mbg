'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const rendererFixturePath = '/tests/fixtures/badge-visual.html';
const baselineFixturePath = '/tests/fixtures/badge-baseline-ab.html';
const controlPrefix = '/badge-baseline-ab/control';
const candidatePrefix = '/badge-baseline-ab/candidate';
const distRoot = path.resolve(repositoryRoot, 'dist');
const fixtureRoot = path.resolve(repositoryRoot, 'tests', 'fixtures');
const productionHtmlPath = path.join(distRoot, 'index.html');
const requestedPort = Number.parseInt(process.env.MBG_BADGE_AB_PORT || '4173', 10);

if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) {
    throw new Error('MBG_BADGE_AB_PORT harus berupa nomor port 1-65535.');
}

const contentTypes = new Map([
    ['.css', 'text/css; charset=utf-8'],
    ['.html', 'text/html; charset=utf-8'],
    ['.ico', 'image/x-icon'],
    ['.jpeg', 'image/jpeg'],
    ['.jpg', 'image/jpeg'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.png', 'image/png'],
    ['.svg', 'image/svg+xml; charset=utf-8'],
    ['.webp', 'image/webp'],
    ['.woff2', 'font/woff2']
]);

const badgeBaselineCandidateHeadInjection = `
    <!-- Eksperimen lokal A/B baseline badge; tidak terdapat pada dist produksi. -->
    <style id="badge-baseline-ab-candidate">
        .badge-export-content {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: inherit !important;
            max-width: 100% !important;
            line-height: inherit !important;
            white-space: nowrap !important;
            box-sizing: border-box !important;
            transform: translateY(-4.5px) !important;
        }
    </style>
`;

const badgeBaselineCandidateBodyInjection = `
    <script id="badge-baseline-ab-hook">
        (() => {
            const installBadgeBaselineCandidate = () => {
                const originalHtml2Canvas = window.html2canvas;
                if (
                    typeof originalHtml2Canvas !== 'function'
                    || originalHtml2Canvas.__badgeBaselineCandidate
                ) return;

                const wrappedHtml2Canvas = (element, options = {}) => {
                    const upstreamOnclone = options.onclone;
                    return originalHtml2Canvas(element, {
                        ...options,
                        onclone: async (clonedDocument, clonedElement) => {
                            if (typeof upstreamOnclone === 'function') {
                                await upstreamOnclone(clonedDocument, clonedElement);
                            }

                            clonedDocument
                                .querySelectorAll('.a4-page .report-badge, .a4-page .pdf-badge')
                                .forEach((badge) => {
                                    const onlyElement = badge.childElementCount === 1
                                        ? badge.firstElementChild
                                        : null;
                                    if (
                                        onlyElement?.classList.contains('badge-export-content')
                                        && badge.childNodes.length === 1
                                    ) return;

                                    const content = clonedDocument.createElement('span');
                                    content.className = 'badge-export-content';
                                    while (badge.firstChild) content.appendChild(badge.firstChild);
                                    badge.appendChild(content);
                                });
                        }
                    });
                };

                wrappedHtml2Canvas.__badgeBaselineCandidate = true;
                window.html2canvas = wrappedHtml2Canvas;
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', installBadgeBaselineCandidate, { once: true });
            } else {
                installBadgeBaselineCandidate();
            }
        })();
    <\/script>
`;

const productionHtml = fs.readFileSync(productionHtmlPath, 'utf8');
const candidateHtml = productionHtml
    .replace(
        /<title>[^<]*<\/title>/,
        '<title>B — Uji Baseline Badge Clone | Sistem Generator Laporan MBG</title>'
    )
    .replace('</head>', `${badgeBaselineCandidateHeadInjection}</head>`)
    .replace('</body>', `${badgeBaselineCandidateBodyInjection}</body>`);

if (
    candidateHtml === productionHtml
    || !candidateHtml.includes('badge-baseline-ab-candidate')
    || !candidateHtml.includes('badge-baseline-ab-hook')
    || !candidateHtml.includes('<title>B — Uji Baseline Badge Clone')
) {
    throw new Error('Gagal menyiapkan kandidat A/B baseline badge dari dist/index.html.');
}

const isInside = (filePath, root) => filePath === root || filePath.startsWith(`${root}${path.sep}`);

const sendBuffer = (request, response, statusCode, body, contentType) => {
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
    response.writeHead(statusCode, {
        'Cache-Control': 'no-store',
        'Content-Length': payload.length,
        'Content-Type': contentType
    });
    response.end(request.method === 'HEAD' ? undefined : payload);
};

const sendFile = (request, response, filePath, allowedRoot) => {
    if (!isInside(filePath, allowedRoot)) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
    }

    fs.stat(filePath, (statError, stats) => {
        if (statError || !stats.isFile()) {
            response.writeHead(404);
            response.end('Not Found');
            return;
        }

        response.writeHead(200, {
            'Cache-Control': 'no-store',
            'Content-Length': stats.size,
            'Content-Type': contentTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream'
        });
        if (request.method === 'HEAD') {
            response.end();
            return;
        }

        const stream = fs.createReadStream(filePath);
        stream.on('error', () => response.destroy());
        stream.pipe(response);
    });
};

const resolveProductionRoute = (pathname, prefix) => {
    if (pathname === prefix) return { redirect: `${prefix}/index.html` };

    const prefixWithSlash = `${prefix}/`;
    if (!pathname.startsWith(prefixWithSlash)) return null;

    const relativePath = pathname.slice(prefixWithSlash.length) || 'index.html';
    const filePath = path.resolve(distRoot, relativePath);
    if (!isInside(filePath, distRoot)) return { forbidden: true };

    return { filePath, isIndex: relativePath === 'index.html' };
};

const server = http.createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' });
        response.end('Method Not Allowed');
        return;
    }

    let pathname;
    try {
        const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
        pathname = decodeURIComponent(requestUrl.pathname);
    } catch (error) {
        response.writeHead(400);
        response.end('Bad Request');
        return;
    }

    if (pathname === '/') {
        response.writeHead(302, { Location: rendererFixturePath });
        response.end();
        return;
    }

    const controlRoute = resolveProductionRoute(pathname, controlPrefix);
    const candidateRoute = resolveProductionRoute(pathname, candidatePrefix);
    const productionRoute = controlRoute || candidateRoute;

    if (productionRoute) {
        if (productionRoute.redirect) {
            response.writeHead(302, { Location: productionRoute.redirect });
            response.end();
            return;
        }
        if (productionRoute.forbidden) {
            response.writeHead(403);
            response.end('Forbidden');
            return;
        }
        if (candidateRoute?.isIndex) {
            sendBuffer(request, response, 200, candidateHtml, 'text/html; charset=utf-8');
            return;
        }

        sendFile(request, response, productionRoute.filePath, distRoot);
        return;
    }

    if (pathname === rendererFixturePath || pathname === baselineFixturePath) {
        sendFile(request, response, path.resolve(repositoryRoot, `.${pathname}`), fixtureRoot);
        return;
    }

    if (pathname.startsWith('/dist/')) {
        sendFile(request, response, path.resolve(repositoryRoot, `.${pathname}`), distRoot);
        return;
    }

    response.writeHead(404);
    response.end('Not Found');
});

server.listen(requestedPort, '127.0.0.1', () => {
    console.log(`A/B renderer badge: http://127.0.0.1:${requestedPort}${rendererFixturePath}`);
    console.log(`A/B baseline badge produksi: http://127.0.0.1:${requestedPort}${baselineFixturePath}`);
    console.log('Tekan Ctrl+C untuk menghentikan server lokal.');
});

const shutdown = () => server.close(() => process.exit(0));
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
