/**
 * case-class-gen.js
 * Generate Scala 3 case classes from COBOL record definitions
 */

import {
  getPicPattern,
  occursCount,
  hasOccurs,
  elementaryByteLength,
  itemByteLength,
  scalaBaseType,
} from './layout.js';

/**
 * Convert COBOL record name to PascalCase
 * CUSTOMER-RECORD -> CustomerRecord
 */
export function toPascalCase(cobolName) {
  if (!cobolName) return '';
  return cobolName
    .toLowerCase()
    .split(/[-_]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Convert COBOL field name to camelCase
 * CUST-ID -> custId
 */
export function toCamelCase(cobolName) {
  if (!cobolName) return '';
  const pascal = toPascalCase(cobolName);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Map COBOL PIC clause to Scala type
 */
export function mapCobolTypeToScala(dataItem) {
  const baseType = scalaBaseType(dataItem);
  if (hasOccurs(dataItem) && occursCount(dataItem) > 1) {
    return `Vector[${baseType}]`;
  }
  return baseType;
}

/**
 * Calculate total field length in bytes (including all OCCURS elements)
 */
export function calculateFieldLength(dataItem) {
  return itemByteLength(dataItem);
}

/**
 * Generate a case class from a COBOL data item (record)
 */
export function generateCaseClass(dataItem, indent = 0) {
  const { name, children } = dataItem;

  if (!name || !children || children.length === 0) {
    return '';
  }

  const className = toPascalCase(name);
  const indentStr = '  '.repeat(indent);
  const lines = [];

  // Generate nested case classes first
  const nestedClasses = [];
  for (const child of children) {
    if (child.children && child.children.length > 0 && !child.children.every(c => c.level === 88)) {
      nestedClasses.push(generateCaseClass(child, indent));
    }
  }

  // Generate field definitions
  const fields = [];
  const usedNames = new Set();
  let fillerIndex = 0;
  let totalLength = 0;

  for (const child of children) {
    // Skip level 88 conditions (handled by enum generator)
    if (child.level === 88) continue;

    // REDEFINES entries overlay storage that is already accounted for by
    // the redefined field; emitting them as extra constructor parameters
    // would corrupt offsets, so they are skipped with a marker comment.
    if (child.redefines) {
      fields.push({
        skipped: true,
        comment: `// REDEFINES ${child.redefines}: ${child.name} shares the same storage (not generated)`
      });
      continue;
    }

    // FILLER fields must still occupy bytes but need unique Scala names
    let fieldName = toCamelCase(child.name);
    if (child.isFiller || !fieldName) {
      fillerIndex += 1;
      fieldName = `filler${fillerIndex}`;
    }
    while (usedNames.has(fieldName)) {
      fillerIndex += 1;
      fieldName = `${fieldName}${fillerIndex}`;
    }
    usedNames.add(fieldName);

    const count = occursCount(child);
    const isTable = hasOccurs(child) && count > 1;

    // Check if this is a group item (has children that aren't just 88 levels)
    const hasRealChildren = child.children &&
      child.children.some(c => c.level !== 88);

    let fieldType;
    if (hasRealChildren) {
      fieldType = toPascalCase(child.name);
      if (isTable) {
        fieldType = `Vector[${fieldType}]`;
      }
    } else {
      fieldType = mapCobolTypeToScala(child);
    }

    // Length of one occurrence; totalLength accumulates all occurrences
    const elementLength = hasRealChildren
      ? itemByteLength({ ...child, occurs: null })
      : elementaryByteLength(child);
    totalLength += elementLength * count;

    fields.push({
      name: fieldName,
      type: fieldType,
      cobolName: child.name,
      length: elementLength,
      occurs: count,
      isTable,
      isGroup: hasRealChildren,
      decimalDigits: child.pic?.decimalDigits || 0
    });
  }

  const realFields = fields.filter(f => !f.skipped);

  // Build case class definition
  lines.push(`${indentStr}case class ${className}(`);

  realFields.forEach((field, index) => {
    const comma = index < realFields.length - 1 ? ',' : '';
    lines.push(`${indentStr}  ${field.name}: ${field.type}${comma}`);
  });

  lines.push(`${indentStr})`);

  // Surface skipped REDEFINES entries so nothing disappears silently
  for (const field of fields) {
    if (field.skipped) {
      lines.push(`${indentStr}${field.comment}`);
    }
  }

  // Generate companion object
  lines.push('');
  lines.push(`${indentStr}object ${className}:`);
  lines.push(`${indentStr}  val recordLength: Int = ${totalLength}`);
  lines.push('');

  // Generate parse method
  lines.push(`${indentStr}  def parse(bytes: Array[Byte]): ${className} =`);
  lines.push(`${indentStr}    var offset = 0`);

  for (const field of realFields) {
    if (field.isTable && field.isGroup) {
      const innerType = field.type.replace('Vector[', '').replace(']', '');
      lines.push(`${indentStr}    val ${field.name} = (0 until ${field.occurs}).map { _ =>`);
      lines.push(`${indentStr}      val elem = ${innerType}.parse(bytes.slice(offset, offset + ${innerType}.recordLength))`);
      lines.push(`${indentStr}      offset += ${innerType}.recordLength`);
      lines.push(`${indentStr}      elem`);
      lines.push(`${indentStr}    }.toVector`);
    } else if (field.isTable) {
      const innerType = field.type.replace('Vector[', '').replace(']', '');
      lines.push(`${indentStr}    val ${field.name} = (0 until ${field.occurs}).map { _ =>`);
      lines.push(`${indentStr}      val elem = ${primitiveParseExpr(innerType, field)}`);
      lines.push(`${indentStr}      offset += ${field.length}`);
      lines.push(`${indentStr}      elem`);
      lines.push(`${indentStr}    }.toVector`);
    } else if (field.isGroup) {
      lines.push(`${indentStr}    val ${field.name} = ${field.type}.parse(bytes.slice(offset, offset + ${field.type}.recordLength))`);
      lines.push(`${indentStr}    offset += ${field.type}.recordLength`);
    } else {
      lines.push(`${indentStr}    val ${field.name} = ${primitiveParseExpr(field.type, field)}`);
      lines.push(`${indentStr}    offset += ${field.length}`);
    }
  }

  lines.push(`${indentStr}    ${className}(${realFields.map(f => f.name).join(', ')})`);
  lines.push('');

  // Generate format method
  lines.push(`${indentStr}  def format(record: ${className}): Array[Byte] =`);
  lines.push(`${indentStr}    val buffer = new Array[Byte](recordLength)`);
  lines.push(`${indentStr}    var offset = 0`);

  for (const field of realFields) {
    if (field.isTable && field.isGroup) {
      const innerType = field.type.replace('Vector[', '').replace(']', '');
      lines.push(`${indentStr}    record.${field.name}.foreach { elem =>`);
      lines.push(`${indentStr}      val elemBytes = ${innerType}.format(elem)`);
      lines.push(`${indentStr}      System.arraycopy(elemBytes, 0, buffer, offset, ${innerType}.recordLength)`);
      lines.push(`${indentStr}      offset += ${innerType}.recordLength`);
      lines.push(`${indentStr}    }`);
    } else if (field.isTable) {
      const innerType = field.type.replace('Vector[', '').replace(']', '');
      lines.push(`${indentStr}    record.${field.name}.foreach { elem =>`);
      lines.push(`${indentStr}      val elemBytes = ${primitiveFormatExpr(innerType, field, 'elem')}`);
      lines.push(`${indentStr}      System.arraycopy(elemBytes, 0, buffer, offset, ${field.length})`);
      lines.push(`${indentStr}      offset += ${field.length}`);
      lines.push(`${indentStr}    }`);
    } else if (field.isGroup) {
      lines.push(`${indentStr}    val ${field.name}Bytes = ${field.type}.format(record.${field.name})`);
      lines.push(`${indentStr}    System.arraycopy(${field.name}Bytes, 0, buffer, offset, ${field.type}.recordLength)`);
      lines.push(`${indentStr}    offset += ${field.type}.recordLength`);
    } else {
      lines.push(`${indentStr}    val ${field.name}Bytes = ${primitiveFormatExpr(field.type, field, `record.${field.name}`)}`);
      lines.push(`${indentStr}    System.arraycopy(${field.name}Bytes, 0, buffer, offset, ${field.length})`);
      lines.push(`${indentStr}    offset += ${field.length}`);
    }
  }

  lines.push(`${indentStr}    buffer`);
  lines.push(`${indentStr}end ${className}`);

  // Prepend nested classes
  if (nestedClasses.length > 0) {
    return nestedClasses.join('\n\n') + '\n\n' + lines.join('\n');
  }

  return lines.join('\n');
}

/**
 * Scala expression that decodes one primitive value from `bytes` at `offset`.
 * DISPLAY numerics with an implied decimal (PIC 9(5)V99) carry no decimal
 * point in the stored bytes, so the value is rescaled after reading.
 */
function primitiveParseExpr(scalaType, field) {
  const slice = `new String(bytes.slice(offset, offset + ${field.length})).trim`;
  switch (scalaType) {
    case 'Int':
      return `${slice}.toIntOption.getOrElse(0)`;
    case 'Long':
      return `${slice}.toLongOption.getOrElse(0L)`;
    case 'Float':
      return `${slice}.toFloatOption.getOrElse(0.0f)`;
    case 'Double':
      return `${slice}.toDoubleOption.getOrElse(0.0)`;
    case 'BigDecimal':
      if (field.decimalDigits > 0) {
        return `BigDecimal(${slice}.replaceAll("[^0-9+-]", "") match { case "" => "0"; case s => s }) / BigDecimal(10).pow(${field.decimalDigits})`;
      }
      return `BigDecimal(${slice} match { case "" => "0"; case s => s })`;
    default:
      return slice;
  }
}

/**
 * Scala expression producing the fixed-width byte encoding of one value.
 */
function primitiveFormatExpr(scalaType, field, valueExpr) {
  switch (scalaType) {
    case 'Int':
    case 'Long':
      return `${valueExpr}.toString.reverse.padTo(${field.length}, '0').reverse.take(${field.length}).getBytes`;
    case 'Float':
    case 'Double':
      return `${valueExpr}.toString.reverse.padTo(${field.length}, '0').reverse.take(${field.length}).getBytes`;
    case 'BigDecimal':
      if (field.decimalDigits > 0) {
        return `(${valueExpr} * BigDecimal(10).pow(${field.decimalDigits})).toBigInt.toString.reverse.padTo(${field.length}, '0').reverse.take(${field.length}).getBytes`;
      }
      return `${valueExpr}.toBigInt.toString.reverse.padTo(${field.length}, '0').reverse.take(${field.length}).getBytes`;
    default:
      return `${valueExpr}.padTo(${field.length}, ' ').take(${field.length}).getBytes`;
  }
}

export default {
  toPascalCase,
  toCamelCase,
  mapCobolTypeToScala,
  calculateFieldLength,
  generateCaseClass
};
