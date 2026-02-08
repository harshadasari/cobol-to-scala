/**
 * enum-gen.js
 * Generate Scala 3 enums from COBOL Level 88 conditions
 */

import { toPascalCase, toCamelCase } from './case-class-gen.js';

/**
 * Group Level 88 conditions by their parent field
 * @param {Array} dataItems - Array of data items from the AST
 * @returns {Map} Map of parent field name to array of level 88 items
 */
export function groupLevel88sByParent(dataItems) {
  const groups = new Map();

  function processItem(item, parent = null) {
    if (item.level === 88 && parent) {
      const parentName = parent.name;
      if (!groups.has(parentName)) {
        groups.set(parentName, {
          parent: parent,
          conditions: []
        });
      }
      groups.get(parentName).conditions.push(item);
    }

    if (item.children) {
      for (const child of item.children) {
        processItem(child, item);
      }
    }
  }

  for (const item of dataItems) {
    processItem(item);
  }

  return groups;
}

/**
 * Infer the value type from level 88 values
 */
function inferValueType(values) {
  if (!values || values.length === 0) return 'String';

  const firstValue = values[0];

  // Check if all values are single characters
  const allSingleChar = values.every(v =>
    (typeof v === 'string' && v.length === 1) ||
    (typeof v === 'object' && v.value && v.value.length === 1)
  );

  if (allSingleChar) return 'Char';

  // Check if all values are numeric
  const allNumeric = values.every(v => {
    const val = typeof v === 'object' ? v.value : v;
    return !isNaN(Number(val));
  });

  if (allNumeric) {
    const maxVal = Math.max(...values.map(v => {
      const val = typeof v === 'object' ? v.value : v;
      return Math.abs(Number(val));
    }));
    if (maxVal <= 2147483647) return 'Int';
    return 'Long';
  }

  return 'String';
}

/**
 * Format a value for Scala based on its type
 */
function formatValue(value, valueType) {
  const val = typeof value === 'object' ? value.value : value;

  switch (valueType) {
    case 'Char':
      return `'${val}'`;
    case 'Int':
    case 'Long':
      return val.toString();
    case 'String':
    default:
      return `"${val}"`;
  }
}

/**
 * Generate a Scala 3 enum from a field and its Level 88 conditions
 * @param {Object} field - The parent field definition
 * @param {Array} level88s - Array of Level 88 condition items
 * @param {number} indent - Indentation level
 * @returns {string} Generated Scala enum code
 */
export function generateEnum(field, level88s, indent = 0) {
  if (!level88s || level88s.length === 0) {
    return '';
  }

  const enumName = toPascalCase(field.name);
  const indentStr = '  '.repeat(indent);
  const lines = [];

  // Collect all values to infer type
  const allValues = level88s.flatMap(item => {
    if (Array.isArray(item.values)) {
      return item.values;
    }
    return item.value ? [item.value] : [];
  });

  const valueType = inferValueType(allValues);
  const valueParam = valueType === 'Char' ? 'code' : 'value';

  // Generate enum definition
  lines.push(`${indentStr}enum ${enumName}(val ${valueParam}: ${valueType}):`);

  // Generate enum cases
  for (const condition of level88s) {
    const caseName = toPascalCase(condition.name);
    const values = Array.isArray(condition.values) ? condition.values : [condition.value];

    if (values.length === 1) {
      // Single value
      const formattedValue = formatValue(values[0], valueType);
      lines.push(`${indentStr}  case ${caseName} extends ${enumName}(${formattedValue})`);
    } else {
      // Multiple values - use the first as the primary value
      const formattedValue = formatValue(values[0], valueType);
      lines.push(`${indentStr}  case ${caseName} extends ${enumName}(${formattedValue})`);
    }
  }

  // Generate companion object with fromCode/fromValue method
  lines.push('');
  lines.push(`${indentStr}object ${enumName}:`);

  const methodName = valueType === 'Char' ? 'fromCode' : 'fromValue';
  lines.push(`${indentStr}  def ${methodName}(${valueParam}: ${valueType}): Option[${enumName}] =`);

  // Handle multiple values per condition
  const hasMultipleValues = level88s.some(c =>
    (Array.isArray(c.values) && c.values.length > 1)
  );

  if (hasMultipleValues) {
    lines.push(`${indentStr}    ${valueParam} match`);
    for (const condition of level88s) {
      const caseName = toPascalCase(condition.name);
      const values = Array.isArray(condition.values) ? condition.values : [condition.value];

      if (values.length === 1) {
        const formattedValue = formatValue(values[0], valueType);
        lines.push(`${indentStr}      case ${formattedValue} => Some(${caseName})`);
      } else {
        const formattedValues = values.map(v => formatValue(v, valueType)).join(' | ');
        lines.push(`${indentStr}      case ${formattedValues} => Some(${caseName})`);
      }
    }
    lines.push(`${indentStr}      case _ => None`);
  } else {
    lines.push(`${indentStr}    values.find(_.${valueParam} == ${valueParam})`);
  }

  lines.push(`${indentStr}end ${enumName}`);

  return lines.join('\n');
}

/**
 * Generate all enums from a list of data items
 * @param {Array} dataItems - Array of data items from the AST
 * @param {number} indent - Indentation level
 * @returns {string} Generated Scala enum code for all enums
 */
export function generateAllEnums(dataItems, indent = 0) {
  const groups = groupLevel88sByParent(dataItems);
  const enums = [];

  for (const [parentName, { parent, conditions }] of groups) {
    const enumCode = generateEnum(parent, conditions, indent);
    if (enumCode) {
      enums.push(enumCode);
    }
  }

  return enums.join('\n\n');
}

export default {
  groupLevel88sByParent,
  generateEnum,
  generateAllEnums
};
