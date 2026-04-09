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

type EmbeddingCache = {
  pages: DocPage[];
  vectors: number[][];
  loadedAt: number;
};

let embeddingCache: EmbeddingCache | null = null;

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

function prepareForEmbedding(text: string) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  return cleaned.length > 5000 ? cleaned.slice(0, 5000) : cleaned;
}

function dot(a: number[], b: number[]) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function norm(a: number[]) {
  return Math.sqrt(dot(a, a));
}

function cosineSim(a: number[], b: number[]) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  return dot(a, b) / (na * nb);
}

async function embedTextsOpenAi(inputs: string[]) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return null;
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: inputs,
    }),
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok) return null;
  const data = Array.isArray(json?.data) ? json.data : [];
  const vectors = data.map((d: any) => d?.embedding).filter((v: any) => Array.isArray(v)) as number[][];
  if (vectors.length !== inputs.length) return null;
  return vectors;
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

async function loadEmbeddings(pages: DocPage[]) {
  const ttlMs = 60 * 60 * 1000;
  if (embeddingCache && Date.now() - embeddingCache.loadedAt < ttlMs) {
    if (embeddingCache.pages.length === pages.length) return embeddingCache;
  }

  const inputs = pages.map((p) => prepareForEmbedding(p.text));
  const vectors = await embedTextsOpenAi(inputs);
  if (!vectors) return null;
  embeddingCache = { pages, vectors, loadedAt: Date.now() };
  return embeddingCache;
}

function tokenizeQuery(q: string) {
  const s = simplify(q);
  if (!s) return [];
  const stop = new Set([
    'como',
    'qual',
    'quais',
    'que',
    'o',
    'a',
    'os',
    'as',
    'de',
    'da',
    'do',
    'das',
    'dos',
    'no',
    'na',
    'nos',
    'nas',
    'para',
    'por',
    'com',
    'sem',
    'um',
    'uma',
    'sobre',
    'pode',
    'posso',
    'permitido',
    'proibido',
    'regra',
    'regras',
  ]);
  const tokens = s
    .split(' ')
    .filter((t) => t.length >= 3 && !stop.has(t));
  return Array.from(new Set(tokens)).slice(0, 16);
}

function mustTermsFromQuestion(question: string) {
  const s = simplify(question);
  const terms: string[] = [];
  const add = (t: string) => {
    const tt = simplify(t);
    if (tt && !terms.includes(tt)) terms.push(tt);
  };

  if (s.includes('assembleia') || s.includes('assembleias')) {
    add('assembleia');
    add('assembleias');
  }
  if (s.includes('3 1') || s.includes('3.1') || s.includes('item 3 1')) add('3 1');

  if (s.includes('piscina')) add('piscina');
  if (s.includes('visitante') || s.includes('convidad')) add('visitante');
  if (s.includes('obra') || s.includes('reforma')) {
    add('obra');
    add('reforma');
  }
  if (s.includes('agua') || s.includes('água') || s.includes('hidrom') || s.includes('hidr')) {
    add('agua');
    add('xli');
    add('art 4');
  }
  if (s.includes('barulho') || s.includes('som') || s.includes('silencio')) add('barulho');
  if (s.includes('pet') || s.includes('cachorro') || s.includes('gato')) add('pet');
  if (s.includes('vaga') || s.includes('garagem')) add('vaga');
  if (s.includes('multa')) add('multa');
  if (s.includes('portaria')) add('portaria');
  if (s.includes('churrasqueira')) add('churrasqueira');
  if (s.includes('salao') || s.includes('salão')) add('salao');
  if (s.includes('assembleia') || s.includes('assembleia')) add('assembleia');

  return terms;
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
  const must = mustTermsFromQuestion(question);

  const emb = await loadEmbeddings(pages);
  if (emb) {
    const qVecs = await embedTextsOpenAi([prepareForEmbedding(question)]);
    const qVec = qVecs?.[0];
    if (qVec) {
      const scored = emb.pages
        .map((p, idx) => {
          const sim = cosineSim(qVec, emb.vectors[idx]);
          const lex = scoreText(p.text, tokens);
          const score = sim * 0.85 + Math.min(1, lex / 20) * 0.15;
          return { page: p, score, sim, lex, simplified: simplify(p.text) };
        })
        .filter((x) => (must.length ? must.some((t) => x.simplified.includes(t)) : true))
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.max(1, limit));

      const finalScored = scored.length
        ? scored
        : emb.pages
            .map((p, idx) => {
              const sim = cosineSim(qVec, emb.vectors[idx]);
              const lex = scoreText(p.text, tokens);
              const score = sim * 0.85 + Math.min(1, lex / 20) * 0.15;
              return { page: p, score, sim, lex };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, Math.max(1, limit));

      return finalScored.map((s: any) => ({
        docName: s.page.docName,
        fileName: s.page.fileName,
        page: s.page.page,
        snippet: buildSnippet(s.page.text, tokens),
        score: s.score,
        context: prepareForEmbedding(s.page.text),
      }));
    }
  }

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
    context: prepareForEmbedding(s.page.text),
  }));
}
