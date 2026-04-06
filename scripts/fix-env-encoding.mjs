import { readFileSync, writeFileSync } from 'node:fs';

const inputPath = '.env';
const outputPath = '.env.local';

const buf = readFileSync(inputPath);

const withoutNulls = Buffer.from([...buf].filter((b) => b !== 0));
const text = withoutNulls.toString('utf8');

const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().concat('\n');

writeFileSync(outputPath, normalized, { encoding: 'utf8' });
