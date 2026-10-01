import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.join(root, 'computer-requirements.html');
const [html, requirementsText, coursesText] = await Promise.all([
  fs.readFile(htmlPath, 'utf8'),
  fs.readFile(path.join(root, 'data', 'requirements.json'), 'utf8'),
  fs.readFile(path.join(root, 'data', 'courses.json'), 'utf8')
]);

const fallback = JSON.stringify({
  requirements: JSON.parse(requirementsText),
  courses: JSON.parse(coursesText)
});
const next = html.replace(
  /(<script type="application\/json" id="fallback-data">)[\s\S]*?(<\/script>)/,
  (_, open, close) => open + fallback + close
);

if (next === html) throw new Error('Could not find the fallback-data block.');
await fs.writeFile(htmlPath, next);
