import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { build } from 'esbuild';

try { process.loadEnvFile('.env.local'); } catch { /* Public site still works without a backend. */ }
process.env.APP_ORIGIN = `http://localhost:${Number(process.env.PORT) || 5173}`;

const root = resolve(import.meta.dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path.startsWith('/api/') && path !== '/api/ideas') {
      const routes = { account: '../api/account.js', auth: '../api/auth.js', push: '../api/push.js', config: '../api/config.js' };
      const route = routes[path.split('/')[2]];
      if (!route) { res.writeHead(404); res.end(); return; }
      const handlers = await import(route);
      if (!handlers[req.method]) { res.writeHead(405); res.end(); return; }
      const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers, ...(!['GET','HEAD'].includes(req.method) ? { body: req, duplex: 'half' } : {}) });
      const response = await handlers[req.method](request);
      for (const [key, value] of response.headers) if (key !== 'set-cookie') res.setHeader(key, value);
      const cookies = response.headers.getSetCookie(); if (cookies.length) res.setHeader('Set-Cookie', cookies);
      res.statusCode = response.status; res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    if(path==='/api/ideas'){
      const [{createIdeasHandler},{localIdeasStore}]=await Promise.all([import('../api/ideas.js'),import('../server/local-ideas-store.js')]);
      const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});
      const response=await createIdeasHandler(localIdeasStore)(request);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if (path === '/app.js') {
      const result = await build({ entryPoints:[resolve(root,'app.js')], bundle:true, format:'esm', target:'es2022', write:false });
      res.writeHead(200, { 'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-cache' }); res.end(result.outputFiles[0].contents); return;
    }
    if(!['/','/index.html','/styles.css','/lessons.css','/pro.css','/ideas.css','/team.css','/mobile-nav.css','/account.css','/sw.js','/manifest.webmanifest','/model.js','/lessons.js','/pro.js','/ideas.js'].includes(path)&&!path.startsWith('/assets/')){res.writeHead(404);res.end('Not found');return;}
    const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    if (!file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(Number(process.env.PORT) || 5173, '127.0.0.1', () => console.log(`Dediko is ready: http://localhost:${server.address().port}`));
