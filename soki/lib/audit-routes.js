#!/usr/bin/env node
// Auto-derive route checklist from server.js header comments.
// Convention: each handler is preceded by `// METHOD /path[ — note]`.
// Run: node soki/lib/audit-routes.js
// Output: markdown checklist piped to stdout (paste into MEMORY.md or use as drift check).

const fs = require('fs');
const path = require('path');

const SERVER = path.resolve(__dirname, '..', 'server.js');
const ROUTE_RE = /^\s*\/\/\s*(GET|POST|PATCH|PUT|DELETE)\s+(\/\S+)(?:\s+—\s+(.*))?$/gm;

const src = fs.readFileSync(SERVER, 'utf8');
const routes = [];
let m;
while ((m = ROUTE_RE.exec(src)) !== null) {
  routes.push({ method: m[1], path: m[2], note: m[3] || '' });
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(routes, null, 2));
  process.exit(0);
}

console.log(`# Routes — auto-derived from server.js (${routes.length} found)`);
console.log('');
for (const r of routes) {
  const note = r.note ? ` — ${r.note}` : '';
  console.log(`- [x] \`${r.method} ${r.path}\`${note}`);
}
