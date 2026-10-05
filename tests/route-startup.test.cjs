const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const test = require('node:test');

// Uses the installed Express version; no HTTP server or WebSocket is opened.
const express = require(process.env.EXPRESS_MODULE || 'express');
const sourcePath = process.env.WHIP_SOURCE || path.join(__dirname, '..', 'whip.js');
const source = fs.readFileSync(sourcePath, 'utf8');

function loadServer(env = {}, tls = false) {
    let app;
    const listens = [];
    class FakeServer extends EventEmitter {
        listen(port, callback) { listens.push(port); callback(); }
    }
    class FakeHttpsServer extends FakeServer {}
    class FakeWebSocketServer extends EventEmitter {}
    const modules = {
        express: () => (app = express()),
        fs: { readFileSync() {
            if (!tls) throw new Error('No test certificate');
            return 'test certificate';
        } },
        http: { createServer: () => new FakeServer() },
        https: { Server: FakeHttpsServer, createServer: () => new FakeHttpsServer() },
        ws: { Server: FakeWebSocketServer },
        crypto: require('node:crypto'),
        path,
    };
    const context = {
        require(name) {
            if (!(name in modules)) throw new Error('Unexpected dependency: ' + name);
            return modules[name];
        },
        process: { env },
        console: { log() {}, error() {} },
        fetch() { throw new Error('No external requests permitted in this test'); },
        setTimeout() { throw new Error('No media callbacks permitted in this test'); },
    };
    const run = vm.runInThisContext(
        '(function(require, process, console, globalThis, setTimeout) {\n' + source + '\n})',
        { filename: sourcePath },
    );
    run(context.require, context.process, context.console, { fetch: context.fetch }, context.setTimeout);
    return { app, listens };
}

function dispatch(app, method, url, host = 'localhost') {
    return new Promise((resolve, reject) => {
        const headers = {};
        const req = { method, url, headers: { host }, httpVersionMajor: 1, httpVersionMinor: 1 };
        const res = {
            statusCode: 200,
            setHeader(name, value) { headers[name.toLowerCase()] = value; },
            getHeader(name) { return headers[name.toLowerCase()]; },
            removeHeader(name) { delete headers[name.toLowerCase()]; },
            end(body) { resolve({ status: this.statusCode, headers, body: body?.toString() || '' }); },
        };
        app.handle(req, res, (error) => reject(error || new Error('No route matched')));
    });
}

test('server registers its routes and reaches HTTP startup', () => {
    const { listens } = loadServer();
    assert.deepEqual(listens, [80]);
});

test('TLS and explicit port selection remain intact', () => {
    assert.deepEqual(loadServer({}, true).listens, [443]);
    assert.deepEqual(loadServer({ PORT: '8443' }).listens, ['8443']);
});

test('all eight catch-all routes match root and nested paths', () => {
    const { app } = loadServer();
    const router = app._router || app.router;
    const routes = router.stack.filter((layer) => layer.route);
    assert.equal(routes.length, 8);
    for (const layer of routes) {
        for (const pathname of ['/', '/room', '/room/nested', '/room/', '/room%20one']) {
            assert.equal(layer.match(pathname), true, pathname);
        }
    }
});

test('OPTIONS includes CORS, method and ICE headers on root and nested paths', async () => {
    const { app } = loadServer();
    for (const pathname of ['/', '/room/nested']) {
        const response = await dispatch(app, 'OPTIONS', pathname);
        assert.equal(response.status, 200);
        assert.equal(response.headers['access-control-allow-origin'], '*');
        assert.equal(response.headers['accept-patch'], 'application/trickle-ice-sdpfrag');
        assert.match(response.headers['access-control-allow-methods'], /POST/);
        assert.equal(response.headers.link.length, 3);
    }
});

test('GET redirects retain root, nested and query-string coverage', async () => {
    const { app } = loadServer();
    for (const pathname of ['/', '/room/nested', '/room?push=test']) {
        const response = await dispatch(app, 'GET', pathname);
        assert.equal(response.status, 301);
        assert.equal(response.headers.location, 'https://vdo.ninja/whip');
    }
});

test('WHEP viewing link remains available for ordinary nested paths', async () => {
    const { app } = loadServer();
    const response = await dispatch(app, 'GET', '/room/nested', 'whep.vdo.ninja');
    assert.equal(response.status, 200);
    assert.match(response.body, /https:\/\/vdo\.ninja\/\?whep=room\/nested/);
});

test('PUT remains rejected on root and nested paths', async () => {
    const { app } = loadServer();
    for (const pathname of ['/', '/room/nested']) {
        const response = await dispatch(app, 'PUT', pathname);
        assert.equal(response.status, 405);
    }
});

// A capture preserves Express's legacy percent-decoding validation.
test('malformed path escapes retain URIError status 400', async () => {
    const { app } = loadServer();
    const router = app._router || app.router;
    const routes = router.stack.filter((layer) => layer.route);
    for (const layer of routes) {
        assert.equal(layer.match('/room%25name'), true);
        for (const pathname of ['/%', '/%ZZ', '/%C3']) {
            assert.throws(() => layer.match(pathname), { name: 'URIError', status: 400 });
        }
    }
    for (const pathname of ['/%', '/%ZZ', '/%C3']) {
        await assert.rejects(dispatch(app, 'GET', pathname), { name: 'URIError', status: 400 });
    }
});
