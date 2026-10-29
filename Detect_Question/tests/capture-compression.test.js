'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

test('real browser crop preserves color/aspect ratio within USB image budget', async () => {
  const candidates = [process.env.QA_BROWSER_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'];
  const executable = candidates.find(candidate => candidate && fs.existsSync(candidate));
  assert.ok(executable, 'Chrome/Edge is required for the real canvas check');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-compression-'));
  try {
    const source = pathToFileURL(path.resolve(__dirname, '../src/content/ui/CaptureSelectionOverlay.js')).href;
    const page = path.join(directory, 'check.html');
    fs.writeFileSync(page, `<!doctype html><meta charset="utf-8"><pre id="result">pending</pre><script src="${source}"></script><script>
    (async () => {
      const canvas = document.createElement('canvas'); canvas.width = 2400; canvas.height = 1600;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#e02020'; ctx.fillRect(0, 0, 300, 1600);
      ctx.fillStyle = '#111'; ctx.font = '28px sans-serif';
      for (let i = 0; i < 35; i++) ctx.fillText('Câu hỏi 123: AX=0x67FE; chọn đáp án A, B, C hoặc D.', 340, 60 + i * 43);
      const encoded = await CaptureSelectionOverlay.crop(canvas.toDataURL('image/png'), { left: 0, top: 0, width: innerWidth, height: innerHeight });
      const image = new Image(); image.src = encoded; await image.decode();
      const sample = document.createElement('canvas'); sample.width = image.naturalWidth; sample.height = image.naturalHeight;
      const draw = sample.getContext('2d'); draw.drawImage(image, 0, 0);
      document.getElementById('result').textContent = JSON.stringify({ mime: encoded.slice(0, 23), bytes: atob(encoded.split(',')[1]).length, width: image.naturalWidth, height: image.naturalHeight, color: [...draw.getImageData(10, 10, 1, 1).data] });
    })().catch(error => document.getElementById('result').textContent = JSON.stringify({error: error.message}));
    </script>`, 'utf8');
    const { stdout } = await promisify(execFile)(executable, ['--headless', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--user-data-dir=' + path.join(directory, 'profile'), '--virtual-time-budget=8000', '--dump-dom', pathToFileURL(page).href], { windowsHide: true, timeout: 25000, maxBuffer: 1024 * 1024 });
    const match = stdout.match(/<pre id="result">([^<]+)<\/pre>/);
    assert.ok(match, 'Browser did not report a canvas result');
    const result = JSON.parse(match[1]);
    assert.equal(result.error, undefined);
    assert.match(result.mime, /^data:image\/jpeg;base64,/);
    assert.ok(result.bytes <= 512 * 1024);
    assert.ok(result.width <= 1800 && result.width >= 1024);
    assert.ok(Math.abs(result.width / result.height - 1.5) < .01);
    assert.ok(result.color[0] > result.color[1] * 2, 'Colored diagram became grayscale');
    console.log(JSON.stringify({ imageBytes: result.bytes, dimensions: result.width + 'x' + result.height }));
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});
