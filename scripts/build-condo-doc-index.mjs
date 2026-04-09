import fs from 'fs';
import path from 'path';
import { PDFParse } from 'pdf-parse';

function simplify(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickDocsFromRoot(rootDir) {
  const entries = fs.readdirSync(rootDir);
  const pdfs = entries.filter((f) => f.toLowerCase().endsWith('.pdf'));
  const scored = pdfs
    .map((f) => {
      const s = simplify(f);
      const scoreRegimento = s.includes('regimento') ? 3 : 0;
      const scoreConvencao = s.includes('convencao') || s.includes('conven') ? 3 : 0;
      return { fileName: f, scoreRegimento, scoreConvencao };
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
  ].filter(Boolean);

  if (picked.length) return picked;
  return pdfs.slice(0, 2).map((fileName, i) => ({ fileName, docName: i === 0 ? 'Documento 1' : 'Documento 2' }));
}

async function parsePdfPages(rootDir, docName, fileName) {
  const fullPath = path.join(rootDir, fileName);
  const buf = fs.readFileSync(fullPath);
  const parser = new PDFParse({ data: buf });
  try {
    const textResult = await parser.getText();
    const pages = Array.isArray(textResult?.pages) ? textResult.pages : [];
    return pages
      .map((p) => ({
        docName,
        fileName,
        page: Number(p?.num ?? 0) || 0,
        text: String(p?.text ?? '').trim(),
      }))
      .filter((p) => p.page > 0 && p.text && p.text.length > 20);
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function main() {
  const rootDir = process.cwd();
  const outPath = path.join(rootDir, 'lib', 'condoDocs.index.json');

  const docs = pickDocsFromRoot(rootDir);
  if (!docs.length) {
    console.log('No PDFs found in project root, skipping condoDocs index.');
    return;
  }

  const pages = [];
  for (const d of docs) {
    console.log('Indexing', d.fileName);
    const p = await parsePdfPages(rootDir, d.docName, d.fileName);
    pages.push(...p);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ pages, generatedAt: new Date().toISOString() }), 'utf8');
  console.log('Wrote', outPath, 'pages:', pages.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
