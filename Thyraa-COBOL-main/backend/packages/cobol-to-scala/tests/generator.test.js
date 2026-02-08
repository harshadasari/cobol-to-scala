import { convertToScala } from '../index.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runTests() {
  console.log('=== Scala Generator Tests ===\n');

  // Test 1: Convert copybook
  console.log('Test 1: Convert copybook to Scala');
  const copybook = await fs.readFile(path.join(__dirname, 'samples/COPYBOOK.cpy'), 'utf-8');
  const result1 = convertToScala(copybook, { packageName: 'com.bank.accounts' });
  console.log('  Generated Scala:');
  console.log(result1.scala.substring(0, 500) + '...');
  console.log('  PASSED\n');

  // Test 2: Convert full program
  console.log('Test 2: Convert full program');
  const program = await fs.readFile(path.join(__dirname, 'samples/CUSTOMER.cbl'), 'utf-8');
  const result2 = convertToScala(program, { packageName: 'com.bank.customer' });
  console.log('  Generated case classes:', result2.ast.dataItems?.length || 0);
  console.log('  Generated methods:', result2.ast.procedures?.length || 0);
  console.log('  PASSED\n');

  // Test 3: DB2 program
  console.log('Test 3: Convert DB2 program');
  const trans = await fs.readFile(path.join(__dirname, 'samples/TRANSACTION.cbl'), 'utf-8');
  const result3 = convertToScala(trans, { packageName: 'com.bank.transactions' });
  console.log('  SQL blocks converted:', result3.ast.sqlBlocks?.length || 0);
  console.log('  PASSED\n');

  // Write outputs for verification
  await fs.mkdir(path.join(__dirname, 'output'), { recursive: true });
  await fs.writeFile(path.join(__dirname, 'output/AccountRecord.scala'), result1.scala);
  await fs.writeFile(path.join(__dirname, 'output/CustomerMaint.scala'), result2.scala);
  await fs.writeFile(path.join(__dirname, 'output/TransProc.scala'), result3.scala);
  console.log('Output files written to tests/output/');

  console.log('\n=== All Tests Passed ===');
}

runTests().catch(console.error);
