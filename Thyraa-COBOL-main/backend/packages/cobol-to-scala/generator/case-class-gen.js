/**
 * case-class-gen.js
 * Generate Scala 3 case classes from COBOL record definitions
 */

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
  const { picture, usage, occurs } = dataItem;

  let baseType = 'String';

  if (usage) {
    const usageUpper = usage.toUpperCase();
    if (usageUpper === 'COMP-1') {
      baseType = 'Float';
    } else if (usageUpper === 'COMP-2') {
      baseType = 'Double';
    } else if (usageUpper === 'COMP-3' || usageUpper === 'PACKED-DECIMAL') {
      baseType = 'BigDecimal';
    }
  }

  if (picture) {
    const pic = picture.toUpperCase();

    // Alphanumeric: PIC X(n) or PIC A(n)
    if (/^[AX](\(\d+\))?$/.test(pic) || /^X+$/.test(pic) || /^A+$/.test(pic)) {
      baseType = 'String';
    }
    // Signed decimal: PIC S9(n)V9(m) or similar
    else if (/S?9.*V9/.test(pic) || /S?9.*V/.test(pic)) {
      baseType = 'BigDecimal';
    }
    // Numeric with decimal: PIC 9(n)V9(m)
    else if (/9.*V/.test(pic)) {
      baseType = 'BigDecimal';
    }
    // Pure numeric: PIC 9(n) or PIC 9999
    else if (/^S?9+$/.test(pic) || /^S?9\(\d+\)$/.test(pic)) {
      const match = pic.match(/9\((\d+)\)/);
      const digits = match ? parseInt(match[1], 10) : pic.replace(/S/g, '').length;

      if (digits <= 9) {
        baseType = 'Int';
      } else {
        baseType = 'Long';
      }
    }
  }

  // Handle OCCURS - wrap in Vector
  if (occurs && occurs > 1) {
    return `Vector[${baseType}]`;
  }

  return baseType;
}

/**
 * Calculate field length from PIC clause
 */
export function calculateFieldLength(dataItem) {
  const { picture, usage } = dataItem;

  if (!picture) return 0;

  const pic = picture.toUpperCase();
  let length = 0;

  // Count characters considering (n) notation
  const expanded = pic.replace(/([X9AVS])\((\d+)\)/g, (_, char, count) => {
    return char.repeat(parseInt(count, 10));
  });

  // Remove sign indicators and decimal points for counting
  const countable = expanded.replace(/[SV]/g, '');
  length = countable.length;

  // COMP-3 packed decimal uses fewer bytes
  if (usage && usage.toUpperCase() === 'COMP-3') {
    length = Math.ceil((length + 1) / 2);
  }

  return length;
}

/**
 * Generate a case class from a COBOL data item (record)
 */
export function generateCaseClass(dataItem, indent = 0) {
  const { name, children, level } = dataItem;

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
  let totalLength = 0;

  for (const child of children) {
    // Skip level 88 conditions (handled by enum generator)
    if (child.level === 88) continue;

    const fieldName = toCamelCase(child.name);
    let fieldType;

    // Check if this is a group item (has children that aren't just 88 levels)
    const hasRealChildren = child.children &&
      child.children.some(c => c.level !== 88);

    if (hasRealChildren) {
      fieldType = toPascalCase(child.name);
      if (child.occurs && child.occurs > 1) {
        fieldType = `Vector[${fieldType}]`;
      }
    } else {
      fieldType = mapCobolTypeToScala(child);
    }

    const fieldLength = calculateFieldLength(child);
    totalLength += fieldLength * (child.occurs || 1);

    fields.push({
      name: fieldName,
      type: fieldType,
      cobolName: child.name,
      length: fieldLength,
      occurs: child.occurs
    });
  }

  // Build case class definition
  lines.push(`${indentStr}case class ${className}(`);

  const fieldDefs = fields.map((field, index) => {
    const comma = index < fields.length - 1 ? ',' : '';
    return `${indentStr}  ${field.name}: ${field.type}${comma}`;
  });

  lines.push(...fieldDefs);
  lines.push(`${indentStr})`);

  // Generate companion object
  lines.push('');
  lines.push(`${indentStr}object ${className}:`);
  lines.push(`${indentStr}  val recordLength: Int = ${totalLength}`);
  lines.push('');

  // Generate parse method
  lines.push(`${indentStr}  def parse(bytes: Array[Byte]): ${className} =`);
  lines.push(`${indentStr}    var offset = 0`);

  for (const field of fields) {
    if (field.type === 'String') {
      lines.push(`${indentStr}    val ${field.name} = new String(bytes.slice(offset, offset + ${field.length})).trim`);
      lines.push(`${indentStr}    offset += ${field.length}`);
    } else if (field.type === 'Int') {
      lines.push(`${indentStr}    val ${field.name} = new String(bytes.slice(offset, offset + ${field.length})).trim.toIntOption.getOrElse(0)`);
      lines.push(`${indentStr}    offset += ${field.length}`);
    } else if (field.type === 'Long') {
      lines.push(`${indentStr}    val ${field.name} = new String(bytes.slice(offset, offset + ${field.length})).trim.toLongOption.getOrElse(0L)`);
      lines.push(`${indentStr}    offset += ${field.length}`);
    } else if (field.type === 'BigDecimal') {
      lines.push(`${indentStr}    val ${field.name} = BigDecimal(new String(bytes.slice(offset, offset + ${field.length})).trim)`);
      lines.push(`${indentStr}    offset += ${field.length}`);
    } else if (field.type.startsWith('Vector[')) {
      const innerType = field.type.replace('Vector[', '').replace(']', '');
      lines.push(`${indentStr}    val ${field.name} = (0 until ${field.occurs}).map { _ =>`);
      lines.push(`${indentStr}      val elem = ${innerType}.parse(bytes.slice(offset, offset + ${innerType}.recordLength))`);
      lines.push(`${indentStr}      offset += ${innerType}.recordLength`);
      lines.push(`${indentStr}      elem`);
      lines.push(`${indentStr}    }.toVector`);
    } else {
      // Nested case class
      lines.push(`${indentStr}    val ${field.name} = ${field.type}.parse(bytes.slice(offset, offset + ${field.type}.recordLength))`);
      lines.push(`${indentStr}    offset += ${field.type}.recordLength`);
    }
  }

  lines.push(`${indentStr}    ${className}(${fields.map(f => f.name).join(', ')})`);
  lines.push('');

  // Generate format method
  lines.push(`${indentStr}  def format(record: ${className}): Array[Byte] =`);
  lines.push(`${indentStr}    val buffer = new Array[Byte](recordLength)`);
  lines.push(`${indentStr}    var offset = 0`);

  for (const field of fields) {
    if (field.type === 'String') {
      lines.push(`${indentStr}    val ${field.name}Bytes = record.${field.name}.padTo(${field.length}, ' ').take(${field.length}).getBytes`);
      lines.push(`${indentStr}    System.arraycopy(${field.name}Bytes, 0, buffer, offset, ${field.length})`);
      lines.push(`${indentStr}    offset += ${field.length}`);
    } else if (field.type === 'Int' || field.type === 'Long') {
      lines.push(`${indentStr}    val ${field.name}Str = record.${field.name}.toString.reverse.padTo(${field.length}, '0').reverse.take(${field.length})`);
      lines.push(`${indentStr}    System.arraycopy(${field.name}Str.getBytes, 0, buffer, offset, ${field.length})`);
      lines.push(`${indentStr}    offset += ${field.length}`);
    } else if (field.type === 'BigDecimal') {
      lines.push(`${indentStr}    val ${field.name}Str = record.${field.name}.toString.reverse.padTo(${field.length}, '0').reverse.take(${field.length})`);
      lines.push(`${indentStr}    System.arraycopy(${field.name}Str.getBytes, 0, buffer, offset, ${field.length})`);
      lines.push(`${indentStr}    offset += ${field.length}`);
    } else if (field.type.startsWith('Vector[')) {
      const innerType = field.type.replace('Vector[', '').replace(']', '');
      lines.push(`${indentStr}    record.${field.name}.foreach { elem =>`);
      lines.push(`${indentStr}      val elemBytes = ${innerType}.format(elem)`);
      lines.push(`${indentStr}      System.arraycopy(elemBytes, 0, buffer, offset, ${innerType}.recordLength)`);
      lines.push(`${indentStr}      offset += ${innerType}.recordLength`);
      lines.push(`${indentStr}    }`);
    } else {
      lines.push(`${indentStr}    val ${field.name}Bytes = ${field.type}.format(record.${field.name})`);
      lines.push(`${indentStr}    System.arraycopy(${field.name}Bytes, 0, buffer, offset, ${field.type}.recordLength)`);
      lines.push(`${indentStr}    offset += ${field.type}.recordLength`);
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

export default {
  toPascalCase,
  toCamelCase,
  mapCobolTypeToScala,
  calculateFieldLength,
  generateCaseClass
};
