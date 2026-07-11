#!/usr/bin/env node
// demo/convert.mjs
//
// Thin CLI wrapper around the engine's convertToScala() so
// demo/convert-demo.sh can drive real conversion through plain node,
// exactly the way any other caller of the package would.
//
// Usage:
//   node convert.mjs <source.cbl> <copybooks-dir> <output.scala>
//
// Reads every file in <copybooks-dir> (any extension) as a candidate
// copybook keyed by its basename, calls convertToScala(source, {
// copybooks, generateMain: true }), and writes the generated Scala to
// <output.scala>. Prints a one-line JSON summary (copybooks expanded/
// missing, generated object name) to stderr so the shell driver can show
// it without polluting the Scala file.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [, , sourcePath, copybooksDir, outPath] = process.argv;

if (!sourcePath || !copybooksDir || !outPath) {
  console.error('usage: node convert.mjs <source.cbl> <copybooks-dir> <output.scala>');
  process.exit(2);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const enginePath = path.join(
  __dirname,
  '..',
  'Thyraa-COBOL-main',
  'backend',
  'packages',
  'cobol-to-scala',
  'index.js'
);

const { convertToScala } = await import(pathToFileURL(enginePath).href);

const source = fs.readFileSync(sourcePath, 'utf8');

const copybooks = {};
if (fs.existsSync(copybooksDir)) {
  for (const entry of fs.readdirSync(copybooksDir)) {
    const full = path.join(copybooksDir, entry);
    if (fs.statSync(full).isFile()) {
      copybooks[entry] = fs.readFileSync(full, 'utf8');
    }
  }
}

const result = convertToScala(source, {
  copybooks,
  generateMain: true,
  charset: 'ascii',
  embedRuntime: true,
});

fs.writeFileSync(outPath, result.scala, 'utf8');

console.error(
  JSON.stringify({
    objectName: result.objectName,
    filename: result.filename,
    copybooksExpanded: result.copybooks?.expanded ?? [],
    copybooksMissing: result.copybooks?.missing ?? [],
  })
);
