import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

type DocPage = {
  docName: string;
  fileName: string;
  page: number;
  text: string;
};

type LoadedDocs = {
  pages: DocPage[];
  loadedAt: number;
};

let cache: LoadedDocs | null = null;

function simplify(input: string) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickDocsFromRoot(rootDir: string) {
  const entries = fs.readdirSync(rootDir);
  const pdfs = entries.filter((f) => f.toLowerCase().endsWith('.pdf'));
  const scored = pdfs
    .map((f) => {
      const s = simplify(f);
      const scoreRegimento = s.includes('regimento') ? 3 : 0;
      const scoreConvencao = s.includes('convencao') || s.includes('conven') ? 3 : 0;
      return { fileName: f, scoreRegimento, scoreConvencao, s };
    })
    .sort((a, b) => {
      const aScore = Math.max(a.scoreRegimento, a.scoreConvencao);
      const bScore = Math.max(b.scoreRegimento, b.scoreConvencao);
      if (aScore !== bScore) return bScore - aScore;
      return a.fileName.localeCompare(b.fileName);
    });

  const reg = scored.find((x) => x.scoreRegimento > 0)?.fileName;
  const conv = scored.find((x) => x.scoreConvencao > 0 && x.fileName !== reg)?.fileName;

  const picked = [
    reg ? { fileName: reg, docName: 'Regimento Interno' } : null,
    conv ? { fileName: conv, docName: 'Convenção do Condomínio' } : null,
  ].filter(Boolean) as { fileName: string; docName: string }[];

  if (picked.length) return picked;
  return pdfs.slice(0, 2).map((fileName, i) => ({ fileName, docName: i === 0 ? 'Documento 1' : 'Documento 2' }));
}

async function loadDocPagesFromFile(rootDir: string, docName: string, fileName: string): Promise<DocPage[]> {
  const fullPath = path.join(rootDir, fileName);
  const buf = fs.readFileSync(fullPath);
  const mod: any = await import('pdf-parse');
  const PDFParse = mod?.PDFParse as any;
  if (!PDFParse) return [];

  const parser = new PDFParse({ data: buf });
  try {
    const textResult: any = await parser.getText();
    const pages = Array.isArray(textResult?.pages) ? textResult.pages : [];
    return pages
      .map((p: any) => ({
        docName,
        fileName,
        page: Number(p?.num ?? 0) || 0,
        text: String(p?.text ?? '').trim(),
      }))
      .filter((p: DocPage) => p.page > 0 && p.text && p.text.length > 20);
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

export async function loadCondoDocsPages() {
  const ttlMs = 15 * 60 * 1000;
  if (cache && Date.now() - cache.loadedAt < ttlMs) return cache.pages;

  try {
    const indexPath = fileURLToPath(new URL('./condoDocs.index.json', import.meta.url));
    if (fs.existsSync(indexPath)) {
      const raw = fs.readFileSync(indexPath, 'utf8');
      const parsed: any = JSON.parse(raw);
      const pages = Array.isArray(parsed?.pages) ? parsed.pages : [];
      const normalized: DocPage[] = pages
        .map((p: any) => ({
          docName: String(p?.docName ?? '').trim(),
          fileName: String(p?.fileName ?? '').trim(),
          page: Number(p?.page ?? 0) || 0,
          text: String(p?.text ?? '').trim(),
        }))
        .filter((p) => p.docName && p.fileName && p.page > 0 && p.text && p.text.length > 20);
      cache = { pages: normalized, loadedAt: Date.now() };
      return normalized;
    }
  } catch {
  }

  const rootDir = process.cwd();

  const docs = pickDocsFromRoot(rootDir);
  const pages: DocPage[] = [];
  for (const d of docs) {
    const p = await loadDocPagesFromFile(rootDir, d.docName, d.fileName);
    pages.push(...p);
  }
  cache = { pages, loadedAt: Date.now() };
  return pages;
}

function tokenizeQuery(q: string) {
  const s = simplify(q);
  if (!s) return [];
  const tokens = s.split(' ').filter((t) => t.length >= 3);
  return Array.from(new Set(tokens));
}

function scoreText(text: string, tokens: string[]) {
  const s = simplify(text);
  if (!s) return 0;
  let score = 0;
  for (const t of tokens) {
    const idx = s.indexOf(t);
    if (idx === -1) continue;
    score += 2;
    const re = new RegExp(`\\b${t}\\b`, 'g');
    const matches = s.match(re);
    if (matches) score += Math.min(6, matches.length);
  }
  return score;
}

function buildSnippet(pageText: string, tokens: string[]) {
  const original = String(pageText || '').replace(/\s+/g, ' ').trim();
  if (!original) return '';
  const lowered = simplify(pageText);
  let bestIdx = -1;
  for (const t of tokens) {
    const idx = lowered.indexOf(t);
    if (idx !== -1) {
      bestIdx = idx;
      break;
    }
  }
  if (bestIdx === -1) return original.slice(0, 240);
  const start = Math.max(0, bestIdx - 120);
  const end = Math.min(original.length, start + 280);
  const snip = original.slice(start, end);
  return snip;
}

export async function searchCondoDocs(question: string, limit = 6) {
  const pages = await loadCondoDocsPages();
  const tokens = tokenizeQuery(question);
  if (!tokens.length) return [];
  const scored = pages
    .map((p) => ({
      page: p,
      score: scoreText(p.text, tokens),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));

  return scored.map((s) => ({
    docName: s.page.docName,
    fileName: s.page.fileName,
    page: s.page.page,
    snippet: buildSnippet(s.page.text, tokens),
    score: s.score,
  }));
}

