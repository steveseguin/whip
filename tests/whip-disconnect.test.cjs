const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'client-side whip whep examples', 'WHIPClient.js'), 'utf8');
const flush = () => new Promise((resolve) => setImmediate(resolve));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function createClient(fetch) {
  const media = deferred();
  const tracks = ['audio', 'video'].map((kind) => ({
    kind,
    stopped: false,
    stop() { this.stopped = true; },
    applyConstraints() { return Promise.resolve(); },
  }));
  const stream = { getTracks: () => tracks };
  const video = { srcObject: null };
  const peers = [];
  const errors = [];
  class PeerConnection {
    constructor() { this.connectionState = 'new'; this.transceivers = []; peers.push(this); }
    addEventListener() {}
    addTransceiver(track) {
      if (this.connectionState === 'closed') throw new Error('Connection is closed');
      this.transceivers.push(track);
      return { sender: { track } };
    }
    close() { this.connectionState = 'closed'; }
  }
  // Isolate the browser dependencies. These tests do not perform signaling or use devices.
  const context = {
    RTCPeerConnection: PeerConnection,
    navigator: { mediaDevices: { getUserMedia: () => media.promise } },
    console: { log() {}, error(error) { errors.push(error); } },
    fetch,
  };
  vm.runInNewContext(source
    .replace(/^import .*;\r?\n/, '')
    .replace('export default class WHIPClient', 'class WHIPClient')
    + '\nthis.WHIPClient = WHIPClient;', context);
  return { client: new context.WHIPClient('https://example.test/whip', video), media, tracks, stream, video, peer: peers[0], errors };
}

test('normal startup attaches both local media tracks', async () => {
  const state = createClient(async () => ({}));
  state.media.resolve(state.stream);
  await flush();
  assert.equal(state.video.srcObject, state.stream);
  assert.equal(state.peer.transceivers.length, 2);
  assert.ok(state.tracks.every((track) => !track.stopped));
});

test('disconnect stops local capture before a pending DELETE completes', async () => {
  const remote = deferred();
  const state = createClient(() => remote.promise);
  state.media.resolve(state.stream);
  await flush();
  const disconnect = state.client.disconnectStream();
  try {
    assert.equal(state.peer.connectionState, 'closed');
    assert.ok(state.tracks.every((track) => track.stopped));
  } finally {
    remote.resolve({});
    await disconnect;
  }
});

test('a failed DELETE still stops the camera, microphone and peer connection', async () => {
  const state = createClient(async () => { throw new Error('Network unavailable'); });
  state.media.resolve(state.stream);
  await flush();
  await assert.rejects(state.client.disconnectStream(), /Network unavailable/);
  assert.equal(state.peer.connectionState, 'closed');
  assert.ok(state.tracks.every((track) => track.stopped));
});

test('media granted after disconnect is stopped instead of attached', async () => {
  const state = createClient(async () => ({}));
  await state.client.disconnectStream();
  state.media.resolve(state.stream);
  await flush();
  assert.ok(state.tracks.every((track) => track.stopped));
  assert.equal(state.peer.transceivers.length, 0);
  assert.equal(state.video.srcObject, null);
  assert.equal(state.errors.length, 0);
});

test('disconnect between media acquisition and preview attachment does not revive capture', async () => {
  const state = createClient(async () => ({}));
  const disconnect = state.media.promise.then(() => state.client.disconnectStream());
  state.media.resolve(state.stream);
  await disconnect;
  await flush();
  assert.ok(state.tracks.every((track) => track.stopped));
  assert.equal(state.video.srcObject, null);
});

test('repeated disconnect clears its own preview and keeps capture stopped', async () => {
  const state = createClient(async () => ({}));
  state.media.resolve(state.stream);
  await flush();
  await state.client.disconnectStream();
  await state.client.disconnectStream();
  assert.equal(state.video.srcObject, null);
  assert.equal(state.peer.connectionState, 'closed');
  assert.ok(state.tracks.every((track) => track.stopped));
});

test('disconnect does not clear a replacement stream on a reused preview', async () => {
  const state = createClient(async () => ({}));
  state.media.resolve(state.stream);
  await flush();
  const replacement = {};
  state.video.srcObject = replacement;
  await state.client.disconnectStream();
  assert.equal(state.video.srcObject, replacement);
});
