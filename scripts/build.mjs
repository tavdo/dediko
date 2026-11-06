import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'model.js', 'assets']) {
  await cp(resolve(root, file), resolve(output, file), { recursive: true });
}
console.log('Built Dediko static site in dist/');
