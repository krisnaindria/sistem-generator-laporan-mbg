'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const fixturePath = '/tests/fixtures/badge-visual.html';
const requestedPort = Number.parseInt(process.env.MBG_BADGE_AB_PORT || '4173', 10);

if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) {
    throw new Error('MBG_BADGE_AB_PORT harus berupa nomor port 1-65535.');
}

const contentTypes = new Map([
    ['.css', 'text/css; charset=utf-8'],
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.png', 'image/png'],
    ['.svg', 'image/svg+xml; charset=utf-8'],
    ['.woff2', 'font/woff2']
]);

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
        response.writeHead(302, { Location: fixturePath });
        response.end();
        return;
    }

    if (pathname !== fixturePath && !pathname.startsWith('/dist/')) {
        response.writeHead(404);
        response.end('Not Found');
        return;
    }

    const filePath = path.resolve(repositoryRoot, `.${pathname}`);
    const allowedRoots = [
        path.resolve(repositoryRoot, 'dist'),
        path.resolve(repositoryRoot, 'tests', 'fixtures')
    ];
    const isAllowed = allowedRoots.some(root => filePath === root || filePath.startsWith(`${root}${path.sep}`));

    if (!isAllowed) {
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
});

server.listen(requestedPort, '127.0.0.1', () => {
    console.log(`A/B badge fixture: http://127.0.0.1:${requestedPort}${fixturePath}`);
    console.log('Tekan Ctrl+C untuk menghentikan server lokal.');
});

const shutdown = () => server.close(() => process.exit(0));
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
