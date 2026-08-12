import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';

const root = process.cwd();
const docsRoot = resolve(root, 'docs');
const rootDocuments = ['AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md', 'README.md', 'apps/web/DESIGN.md'];

function markdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return extname(entry.name) === '.md' ? [path] : [];
  });
}

function hasRequiredFrontmatter(content: string): boolean {
  const match = /^---\n([\s\S]*?)\n---\n/u.exec(content);
  if (!match?.[1]) return false;
  return ['summary:', 'read_when:', 'title:'].every((field) => match[1]?.includes(field));
}

function internalLinks(content: string): string[] {
  return [...content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu)]
    .map((match) => match[1]?.trim())
    .filter((target): target is string => Boolean(target))
    .filter((target) => !/^(?:https?:|mailto:|#)/u.test(target));
}

const documents = [...markdownFiles(docsRoot), ...rootDocuments.map((path) => resolve(root, path)).filter(existsSync)];
const errors: string[] = [];

for (const document of documents) {
  const content = readFileSync(document, 'utf8');
  const isDocPage = document.startsWith(`${docsRoot}/`);
  const basename = document.slice(document.lastIndexOf('/') + 1);
  if (isDocPage && !['README.md', 'codemap.md'].includes(basename) && !hasRequiredFrontmatter(content)) {
    errors.push(`${document}: required frontmatter is missing`);
  }
  for (const target of internalLinks(content)) {
    const withoutAnchor = target.split('#', 1)[0];
    if (!withoutAnchor) continue;
    const cleanTarget = decodeURIComponent(withoutAnchor.replace(/^<|>$/gu, ''));
    const resolved = cleanTarget.startsWith('/') ? resolve(root, cleanTarget.slice(1)) : resolve(dirname(document), cleanTarget);
    if (!existsSync(resolved)) errors.push(`${document}: broken link ${target}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  console.log(`Documentation scan passed (${documents.length} Markdown files).`);
}
