// Reports locations and categories only, never credential values.
import { readFileSync, readdirSync, statSync, appendFileSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function detectCredentials(source) {
  const rules = [
    ['API/DB credential', /\b[\w$]*(?:api[_-]?key|secret|token|password)[\w$]*["']?\s*[:=]\s*["'`]([^"'`\r\n]+)["'`]/gi],
    ['Database connection', /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s"'`<>]+/gi],
  ];
  const findings = [];
  for (const [rule, pattern] of rules) {
    for (const match of source.matchAll(pattern)) {
      if (match[1] && /^(?:\$\{|process\.env\.|env\.)/.test(match[1])) continue;
      findings.push({ rule, line: source.slice(0, match.index).split('\n').length,
        demo: match[1] === 'DEMO_ONLY_OOPSLA_PUBLIC_KEY_NOT_VALID' });
    }
  }
  return findings;
}

function filesAt(path) {
  if (statSync(path).isDirectory()) {
    return readdirSync(path).flatMap(name => filesAt(resolve(path, name)));
  }
  return /\.(?:html|[cm]?js|tsx?|json)$/i.test(extname(path)) ? [path] : [];
}

export function audit(root = process.cwd()) {
  const findings = [];
  for (const [path, fixture] of [
    ['oops_la_book_store_uxui_fixed.html', false],
    ['src', false],
    ['dist', false],
    ['tests/fixtures/security-demo', true],
  ]) {
    for (const file of filesAt(resolve(root, path))) {
      for (const hit of detectCredentials(readFileSync(file, 'utf8'))) {
        const name = relative(root, file).replaceAll('\\', '/');
        const intentionalDemo = hit.demo && ['oops_la_book_store_uxui_fixed.html', 'dist/index.html'].includes(name);
        findings.push({ file: name, fixture, ...hit, intentionalDemo });
      }
    }
  }
  return findings;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = audit();
  for (const hit of findings) {
    const severity = hit.fixture || hit.intentionalDemo ? 'warning' : 'error';
    console.log(`::${severity} file=${hit.file},line=${hit.line}::${hit.rule} literal detected (value redacted). ${hit.fixture ? 'Intentional fixture retained.' : hit.intentionalDemo ? 'Owner-approved public dummy key for F12 demo; no privileges.' : 'Remove credential from production source/build; see docs/ci/security-ci-validation.md.'}`);
  }
  const fixture = findings.filter(hit => hit.fixture).length;
  const demo = findings.filter(hit => hit.intentionalDemo).length;
  const production = findings.filter(hit => !hit.fixture && !hit.intentionalDemo).length;
  const summary = `Credential alerts: ${fixture} fixture finding(s), ${demo} approved dummy-key finding(s), ${production} unexpected production finding(s). Values redacted.\n`;
  console.log(summary.trim());
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  if (!fixture) console.error('::error::Expected security fixture credentials were not detected; check positive control.');
  if (production || !fixture) process.exitCode = 1;
}
