/**
 * index.js
 * Export all Scala code generators for COBOL to Scala conversion
 */

// Main generator
export {
  generateScala,
  generateScalaMultiple,
  formatScalaCode,
  extractProgramName
} from './scala-generator.js';

// Case class generator
export {
  toPascalCase,
  toCamelCase,
  mapCobolTypeToScala,
  calculateFieldLength,
  generateCaseClass
} from './case-class-gen.js';

// Enum generator
export {
  groupLevel88sByParent,
  generateEnum,
  generateAllEnums
} from './enum-gen.js';

// Method generator
export {
  toMethodName,
  generateMethod,
  generatePerformThruMethod,
  generateAllMethods
} from './method-gen.js';

// Expression generator
export {
  convertArithmeticExpression,
  convertCondition,
  generateExpression,
  generateCompute,
  generateMove,
  generateMoveCorresponding,
  generateIf,
  generateEvaluate,
  generateString,
  generateUnstring,
  generateInspect
} from './expression-gen.js';

// File I/O generator
export {
  generateOpen,
  generateClose,
  generateRead,
  generateWrite,
  generateRewrite,
  generateDelete as generateFileDelete,
  generateStart,
  generateFileIO,
  generateFileIOWithResource,
  generateFileStatusCheck
} from './file-io-gen.js';

// SQL generator
export {
  generateSql,
  generateSelect,
  generateInsert,
  generateUpdate,
  generateDelete as generateSqlDelete,
  generateDeclareCursor,
  generateOpenCursor,
  generateFetch,
  generateCloseCursor,
  generateSqlcodeHandling,
  generateWhenever,
  generateCommit,
  generateRollback,
  generateDoobieImports,
  generateTransactorSetup,
  wrapInTry
} from './sql-gen.js';

// Default export with all generators
import scalaGenerator from './scala-generator.js';
import caseClassGen from './case-class-gen.js';
import enumGen from './enum-gen.js';
import methodGen from './method-gen.js';
import expressionGen from './expression-gen.js';
import fileIOGen from './file-io-gen.js';
import sqlGen from './sql-gen.js';

export default {
  // Main entry point
  generateScala: scalaGenerator.generateScala,
  generateScalaMultiple: scalaGenerator.generateScalaMultiple,
  formatScalaCode: scalaGenerator.formatScalaCode,

  // Sub-generators
  caseClass: caseClassGen,
  enum: enumGen,
  method: methodGen,
  expression: expressionGen,
  fileIO: fileIOGen,
  sql: sqlGen
};
