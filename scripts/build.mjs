import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'styles.css', 'lessons.css', 'pro.css', 'ideas.css', 'team.css', 'app.js', 'model.js', 'lessons.js', 'pro.js', 'ideas.js', 'assets']) {
  await cp(resolve(root, file), resolve(output, file), { recursive: true });
}
console.log('Built Dediko static site in dist/');
