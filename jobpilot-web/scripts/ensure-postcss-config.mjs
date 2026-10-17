// OneDrive can turn synced files into cloud placeholders that Node reports as symlinks.
// Angular only picks up .postcssrc.json when it is a regular file, and without it Tailwind
// never runs and the app renders unstyled. Rewriting the file restores a regular file.
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const FILE = '.postcssrc.json';
const entry = readdirSync('.', { withFileTypes: true }).find((e) => e.name === FILE);

if (entry && !entry.isFile()) {
  const content = readFileSync(FILE, 'utf8');
  rmSync(FILE);
  writeFileSync(FILE, content);
  console.log(`Restored ${FILE} as a regular file so Tailwind CSS is applied.`);
}
