const fs = require('fs');
const path = require('path');

// Import the conversion module (adjust path from examples/basic-conversion)
const cobol2scala = require('../../Thyraa-COBOL-main/backend/packages/cobol-to-scala/index.js');

// Read the sample COBOL file
const cobolSource = fs.readFileSync(path.join(__dirname, 'sample-program.cobol'), 'utf8');

console.log('='.repeat(70));
console.log('COBOL-TO-SCALA CONVERSION EXAMPLE');
console.log('='.repeat(70));
console.log('\n📥 INPUT COBOL:\n');
console.log(cobolSource);
console.log('\n' + '='.repeat(70));

try {
  console.log('\n🔄 Converting...\n');

  const result = cobol2scala.convertToScala(cobolSource, {
    packageName: 'com.example.demo',
    generateMain: true,
    includeComments: true
  });

  console.log('✅ CONVERSION SUCCESSFUL!\n');
  console.log('='.repeat(70));
  console.log('📤 OUTPUT SCALA:\n');
  console.log(result.scala);
  console.log('\n' + '='.repeat(70));

  // Write output to file
  const outputPath = path.join(__dirname, 'generated-output.scala');
  fs.writeFileSync(outputPath, result.scala);
  console.log(`\n💾 Saved to: ${outputPath}`);

  // Show summary
  console.log('\n📊 CONVERSION SUMMARY:');
  console.log(`   - Package: ${result.metadata?.packageName || 'com.example.demo'}`);
  console.log(`   - Program: ${result.metadata?.programName || 'SIMPLE-TEST'}`);
  console.log(`   - Lines generated: ${result.scala.split('\n').length}`);

  if (result.warnings && result.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    result.warnings.forEach(w => console.log(`   - ${w}`));
  }

  console.log('\n✨ Example conversion completed successfully!');
  console.log('\n💡 Next steps:');
  console.log('   1. Review the generated Scala code');
  console.log('   2. Try the web UI: http://localhost:5173/convert');
  console.log('   3. Check out other examples in the examples/ folder\n');

} catch (error) {
  console.error('\n❌ CONVERSION FAILED!\n');
  console.error('Error:', error.message);
  console.error('\nStack trace:');
  console.error(error.stack);
  console.error('\n💡 Tip: Make sure you ran npm install in the backend directory\n');
  process.exit(1);
}
