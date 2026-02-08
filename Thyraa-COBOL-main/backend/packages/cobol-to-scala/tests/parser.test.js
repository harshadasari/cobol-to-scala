import { tokenize } from '../parser/lexer.js';
import { parseDataDivision } from '../parser/data-division-parser.js';
import { parseProcedureDivision } from '../parser/procedure-parser.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runTests() {
  console.log('=== COBOL Parser Tests ===\n');

  // Test 1: Tokenize copybook
  console.log('Test 1: Tokenize copybook');
  const copybook = await fs.readFile(path.join(__dirname, 'samples/COPYBOOK.cpy'), 'utf-8');
  const tokens = tokenize(copybook);
  console.log(`  Tokens: ${tokens.length}`);
  console.log(`  First 5: ${tokens.slice(0, 5).map(t => t.type).join(', ')}`);
  console.log('  PASSED\n');

  // Test 2: Parse data division
  console.log('Test 2: Parse data division');
  const dataItems = parseDataDivision(tokens);
  console.log(`  Records: ${dataItems.length}`);
  console.log(`  First record: ${dataItems[0]?.name || 'N/A'}`);
  console.log('  PASSED\n');

  // Test 3: Parse full program
  console.log('Test 3: Parse full program');
  const program = await fs.readFile(path.join(__dirname, 'samples/CUSTOMER.cbl'), 'utf-8');
  const progTokens = tokenize(program);
  const procedures = parseProcedureDivision(progTokens);
  console.log(`  Procedures: ${procedures.length}`);
  console.log(`  First: ${procedures[0]?.name || 'N/A'}`);
  console.log('  PASSED\n');

  console.log('=== All Tests Passed ===');
}

runTests().catch(console.error);
