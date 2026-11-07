const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const examples = path.join(__dirname, '..', 'client-side whip whep examples');

function checkModule(source, name) {
  // Parse only: these examples need browser WebRTC APIs to execute.
  const result = spawnSync(process.execPath, ['--check', '--input-type=module'], {
    input: source,
    encoding: 'utf8',
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${name}: ${result.stderr}`);
}

for (const filename of ['whip.html', 'whep.html']) {
  test(`${filename} has valid inline JavaScript modules`, () => {
    const html = fs.readFileSync(path.join(examples, filename), 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*\btype\s*=\s*["']module["'][^>]*>([\s\S]*?)<\/script\s*>/gi)];
    assert.ok(scripts.length > 0, `${filename} must include its startup module`);
    for (const [index, script] of scripts.entries()) {
      checkModule(script[1], `${filename} module ${index + 1}`);
    }
  });
}

for (const filename of ['WHIPClient.js', 'WHEPClient.js', 'negotiateConnectionWithClientOffer.js']) {
  test(`${filename} is a valid JavaScript module`, () => {
    checkModule(fs.readFileSync(path.join(examples, filename), 'utf8'), filename);
  });
}
