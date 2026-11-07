import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'admin.html', 'admin.css', 'styles.css', 'lessons.css', 'pro.css', 'ideas.css', 'team.css', 'mobile-nav.css', 'account.css', 'manifest.webmanifest', 'sw.js', 'assets']) {
  await cp(resolve(root, file), resolve(output, file), { recursive: true });
}
await build({ entryPoints: [resolve(root, 'app.js'), resolve(root, 'admin.js')], bundle: true, format: 'esm', target: 'es2022', minify: true, outdir: output });
console.log('Built Dediko static site in dist/');
