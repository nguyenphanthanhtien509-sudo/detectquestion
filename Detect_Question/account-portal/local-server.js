const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = Number(process.env.ACCOUNT_PORTAL_PORT || 4173);
const root = __dirname;
const envPath = path.resolve(root, '..', '.env');

function readEnv(file) {
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return values;
}
const settings = readEnv(envPath);
if (!settings.SUPABASE_URL || !settings.SUPABASE_ANON_KEY) throw new Error('SUPABASE_URL và SUPABASE_ANON_KEY phải có trong .env.');

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const send = (response, code, content, type) => response.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }).end(content);
http.createServer((request, response) => {
  const url = new URL(request.url, `http://${HOST}:${PORT}`);
  if (url.pathname === '/config.js') return send(response, 200, `window.LICENSE_PORTAL_CONFIG=${JSON.stringify({ supabaseUrl: settings.SUPABASE_URL, supabaseAnonKey: settings.SUPABASE_ANON_KEY })};`, mime['.js']);
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const filename = path.resolve(root, `.${requested}`);
  if (!filename.startsWith(`${root}${path.sep}`) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) return send(response, 404, 'Not found', 'text/plain; charset=utf-8');
  return send(response, 200, fs.readFileSync(filename), mime[path.extname(filename)] || 'application/octet-stream');
}).listen(PORT, HOST, () => console.log(`Account portal: http://${HOST}:${PORT}`));
