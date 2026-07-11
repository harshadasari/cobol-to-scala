/**
 * case-class-gen.js
 * Generate Scala 3 case classes from COBOL record definitions
 *
 * === Phase 1: byte-level record I/O design notes ===
 *
 * `parse`/`format` on every generated companion object now do real byte-level
 * decoding/encoding via `CobolCodecs` (see runtime/CobolCodecs.scala), instead
 * of the earlier display-string placeholder logic. Dispatch is by
 * USAGE/PICTURE (see `classifyCodec` below):
 *   - COMP-3 / COMPUTATIONAL-3 / PACKED-DECIMAL -> CobolCodecs.packedDecode/packedEncode
 *   - COMP / COMP-4 / COMP-5 / BINARY           -> CobolCodecs.binaryDecode/binaryEncode
 *     (COMP-5 passes `endianness = "LITTLE"` - it is host-native, verified
 *     little-endian on x86_64 GnuCOBOL; every other binary USAGE passes
 *     "BIG" - see `isComp5Usage`/`classifyCodec` and
 *     tests/oracle/codec-refutation.md)
 *   - DISPLAY numeric (signed or unsigned)      -> CobolCodecs.zonedDecode/zonedEncode
 *     (unsigned fields just pass `signed = false`, so both share one code path)
 *   - PIC X/A (and edited numerics, which are also just displayable
 *     characters) -> a charset-aware string decode driven by the generator
 *     option `charset: 'ascii' | 'ebcdic'` (default `'ascii'`). `'ascii'`
 *     mode maps each byte 0-255 to/from the same-valued Unicode code point
 *     (ISO-8859-1/Latin-1), matching the `codePage: 'ASCII'` convention
 *     `generator/codecs.js`/`CobolCodecs.scala` already use elsewhere (a
 *     lossless 1:1 byte<->char mapping, not a strict 7-bit interpretation) so
 *     any byte value round-trips exactly. `'ebcdic'` mode uses
 *     `CobolCodecs.ebcdicToString`/`stringToEbcdic` (cp037). COMP-1/COMP-2
 *     (Float/Double) are unchanged from the previous display-string
 *     placeholder logic - no byte-level float codec exists yet in
 *     `CobolCodecs`, and they are out of this phase's explicit scope.
 *
 * Runtime inclusion: generated files reference `CobolCodecs.*` unqualified.
 * `scala-generator.js` is responsible for making that name resolve - by
 * default (`embedRuntime: true`, the default in DEFAULT_OPTIONS there) it
 * inlines the full `object CobolCodecs: ...` source (read from
 * runtime/CobolCodecs.scala at module load, package line stripped) directly
 * into the generated file, so a single `scala-cli run Foo.scala` is
 * self-contained. Passing `embedRuntime: false` instead emits
 * `import com.thyraa.cobol.runtime.CobolCodecs`, for callers who compile the
 * runtime once and share it across many generated files/classpaths. This
 * generator (case-class-gen.js) does not care which mode is active - it just
 * emits unqualified `CobolCodecs.xxx(...)` calls either way.
 *
 * REDEFINES: `B REDEFINES A` no longer disappears silently. Storage-wise B
 * still contributes zero additional bytes (A's storage already paid for the
 * region), but the case class gains a `lazy val b: BType = BType.parse(<A's
 * region bytes>)` member. The chosen design recomputes A's bytes on demand by
 * calling the class's own already-correct `format(this)` and slicing out A's
 * byte range (`offset`/`length` are both known at *generation* time, since
 * every field's byte layout is static) - this avoids adding a hidden
 * constructor parameter (which would change the case class's equality/
 * toString/apply signature) at the cost of one redundant `format()` call the
 * first time `.b` is accessed (memoized after that, since it's a `lazy val`).
 * REDEFINES views are read-only derived accessors: `format()` only ever
 * serializes the primary (non-redefines) fields, exactly as before.
 *
 * OCCURS ... DEPENDING ON: left at the existing fixed-max-count behavior
 * (layout.js already sizes tables at their max for a stable, fixed
 * `recordLength`). Making `parse` honor the live counter field would require
 * either (a) shrinking the parsed Vector while still advancing by the fixed
 * max width (fine for parse, but then `format` cannot reproduce the original
 * trailing/padding bytes for that field without itself retaining raw bytes,
 * which reintroduces the same "hidden state" problem REDEFINES's design
 * deliberately avoids), or (b) shrinking the physical record length
 * dynamically, which would break the fixed `recordLength`/offset invariants
 * every other field relies on. Both destabilize round-trip byte-fidelity, so
 * generated code for such fields carries a `// TODO(ODO):` marker instead of
 * a fix.
 */

import {
  getPicPattern,
  occursCount,
  hasOccurs,
  elementaryByteLength,
  itemByteLength,
  syncPadBytes,
  scalaBaseType,
  picDigits,
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
 * Find every uppercased PascalCase name that would be used as a case-class
 * name more than once across the given top-level item lists (WORKING-STORAGE
 * 01s, FILE SECTION records, ...) - counting BOTH top-level records and every
 * nested group/REDEFINES-group reachable from them (generateCaseClass gives
 * every one of those its own `case class`/`object`). COBOL's flat data-name
 * namespace allows two *different* 01-records to each declare a same-named
 * nested group (disambiguated in real COBOL only via OF/IN qualification -
 * e.g. two records each with their own `05 DTL-GROUP`), which otherwise
 * collides as `case class DtlGroup` defined twice in the same generated file
 * ("DtlGroup is already defined as class DtlGroup"). Names appearing exactly
 * once keep their plain PascalCase(name) (matching every previously-generated
 * program byte-for-byte); only genuinely colliding names get a parent-path-
 * qualified name (see resolveClassName) - so this only changes output for the
 * specific programs that actually have the collision.
 */
export function collectAmbiguousGroupClassNames(itemLists) {
  const counts = new Map();

  function walk(list) {
    for (const item of list || []) {
      if (!item || !item.name) continue;
      const realChildren = (item.children || []).filter(c => c.level !== 88);
      if (realChildren.length === 0) continue;
      const simple = toPascalCase(item.name);
      counts.set(simple, (counts.get(simple) || 0) + 1);
      walk(realChildren);
    }
  }

  for (const list of itemLists) walk(list);

  const ambiguous = new Set();
  for (const [name, count] of counts) {
    if (count > 1) ambiguous.add(name);
  }
  return ambiguous;
}

/**
 * Resolve the actual case-class name to use for `name`, given the shared
 * ambiguity set (collectAmbiguousGroupClassNames) and this item's immediate
 * parent's OWN already-resolved class name. Unique names are untouched;
 * colliding ones are qualified by their parent's class name (e.g. `DtlGroup`
 * nested under both `WsA` and `WsB` becomes `WsADtlGroup`/`WsBDtlGroup`) -
 * this is exactly the "disambiguate nested class names by parent path" fix.
 * Falls back to the plain name if there's no parent (top-level records are
 * never ambiguous with each other - COBOL 01-level names in the same section
 * must already be unique) or no ambiguity set was supplied.
 */
export function resolveClassName(name, context = {}) {
  const simple = toPascalCase(name);
  const ambiguousNames = context.ambiguousNames;
  if (ambiguousNames && ambiguousNames.has(simple) && context.parentClassName) {
    return `${context.parentClassName}${simple}`;
  }
  return simple;
}

const BINARY_USAGES = new Set([
  'COMP', 'COMP-4', 'COMP-5', 'COMPUTATIONAL', 'COMPUTATIONAL-4', 'COMPUTATIONAL-5', 'BINARY',
]);

const COMP5_USAGES = new Set(['COMP-5', 'COMPUTATIONAL-5']);

function isPackedUsage(usage) {
  return usage === 'COMP-3' || usage === 'COMPUTATIONAL-3' || usage === 'PACKED-DECIMAL';
}

function isBinaryUsage(usage) {
  return BINARY_USAGES.has(usage);
}

/**
 * COMP-5 is stored in the host's native byte order (little-endian on the
 * x86_64 GnuCOBOL build this was compiler-verified against - see
 * tests/oracle/codec-refutation.md), unlike plain COMP/COMP-4/BINARY, which
 * are big-endian per GnuCOBOL's `binary-byteorder: big-endian` dialect
 * default. This determines the `endianness` argument passed to
 * CobolCodecs.binaryEncode/binaryDecode.
 */
function isComp5Usage(usage) {
  return COMP5_USAGES.has(usage);
}

function isFloatUsage(usage) {
  return usage === 'COMP-1' || usage === 'COMPUTATIONAL-1' || usage === 'COMP-2' || usage === 'COMPUTATIONAL-2';
}

/**
 * Classify the PIC's display category (alphanumeric/alphabetic/edited/numeric)
 * the same way layout.js's scalaBaseType does internally, so an elementary
 * item's byte-level codec matches the type mapping exactly. Duplicated here
 * (rather than exported from layout.js) to avoid touching that file's
 * already-tested scalaBaseType/picStorageLength internals.
 */
function picDataTypeOf(item) {
  const pic = item.pic && typeof item.pic === 'object' ? item.pic : null;
  if (pic?.dataType) return pic.dataType;
  const pattern = getPicPattern(item);
  if (/[XA]/.test(pattern)) return 'alphanumeric';
  if (/[Z*+$,]|CR$|DB$/.test(pattern)) return 'edited';
  return pattern ? 'numeric' : 'alphanumeric';
}

/**
 * Classify an elementary (non-group) DataItem into the codec it needs plus
 * every parameter that codec's Scala call requires (digits/scale/sign/codePage).
 * `options.charset` ('ascii' | 'ebcdic', default 'ascii') selects the
 * codePage used for both PIC X/A string fields and DISPLAY numeric zoned
 * fields (a COBOL file's records are conventionally all one charset).
 */
function classifyCodec(item, options = {}) {
  const usage = (item.usage || 'DISPLAY').toUpperCase();
  const digits = picDigits(item);
  const decimalDigits = item.pic?.decimalDigits || 0;
  const signed = !!(item.pic && item.pic.signed);
  const signLeading = !!(item.sign && item.sign.leading);
  const signSeparate = !!(item.sign && item.sign.separate);
  const codePage = (options.charset || 'ascii').toLowerCase() === 'ebcdic' ? 'EBCDIC' : 'ASCII';

  let codecKind;
  if (isPackedUsage(usage)) {
    codecKind = 'packed';
  } else if (isBinaryUsage(usage)) {
    codecKind = 'binary';
  } else if (isFloatUsage(usage)) {
    codecKind = 'legacy'; // Float/Double - no byte-level codec yet, out of Phase-1 scope
  } else {
    codecKind = picDataTypeOf(item) === 'numeric' ? 'zoned' : 'string';
  }

  // Only meaningful for codecKind === 'binary': COMP-5 is host-native
  // (little-endian on x86_64), plain COMP/COMP-4/BINARY are big-endian.
  const endianness = isComp5Usage(usage) ? 'LITTLE' : 'BIG';

  return { codecKind, digits, decimalDigits, signed, signLeading, signSeparate, codePage, endianness };
}

/**
 * Generate a case class from a COBOL data item (record)
 *
 * @param {object} dataItem
 * @param {number} [indent]
 * @param {object} [options]
 * @param {'ascii'|'ebcdic'} [options.charset='ascii'] - charset used to decode/encode
 *   PIC X/A string fields and the codePage passed to zoned-decimal codecs.
 * @param {object} [context] - `{ ambiguousNames: Set<string>, parentClassName: string|null }`,
 *   see resolveClassName/collectAmbiguousGroupClassNames - only needed when
 *   this program's data division has two different records sharing a
 *   same-named nested group; omit for the (overwhelmingly common) unique case.
 */
export function generateCaseClass(dataItem, indent = 0, options = {}, context = {}) {
  const { name, children } = dataItem;

  if (!name || !children || children.length === 0) {
    return '';
  }

  const ctx = { ambiguousNames: context.ambiguousNames || new Set(), parentClassName: context.parentClassName || null };
  const className = resolveClassName(name, ctx);
  const childContext = { ambiguousNames: ctx.ambiguousNames, parentClassName: className };
  const indentStr = '  '.repeat(indent);
  const lines = [];

  // Generate nested case classes first (includes groups that are only ever
  // referenced via a REDEFINES lazy view - they still need their own class).
  const nestedClasses = [];
  for (const child of children) {
    if (child.children && child.children.length > 0 && !child.children.every(c => c.level === 88)) {
      nestedClasses.push(generateCaseClass(child, indent, options, childContext));
    }
  }

  // Generate field definitions
  const fields = [];
  const usedNames = new Set();
  let fillerIndex = 0;
  let totalLength = 0; // also serves as the running byte offset of the next real field

  for (const child of children) {
    // Skip level 88 conditions (handled by enum generator)
    if (child.level === 88) continue;

    if (child.redefines) {
      // B REDEFINES A: shares A's storage, so it never advances totalLength/
      // offset. Look up A (or, for a chained redefine, whatever A's own
      // REDEFINES resolved to) among the fields already collected so its
      // offset can be reused.
      const target = fields.find(
        f => !f.skipped && f.cobolName && f.cobolName.toUpperCase() === child.redefines.toUpperCase()
      );

      if (!target) {
        fields.push({
          skipped: true,
          comment: `// REDEFINES ${child.redefines}: ${child.name} target field not found (not generated)`
        });
        continue;
      }

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
      const hasRealChildren = child.children && child.children.some(c => c.level !== 88);

      let fieldType;
      if (hasRealChildren) {
        fieldType = resolveClassName(child.name, childContext);
        if (isTable) fieldType = `Vector[${fieldType}]`;
      } else {
        fieldType = mapCobolTypeToScala(child);
      }

      // B's own per-occurrence width (may be <= A's size; COBOL only
      // requires the redefining item not exceed the redefined item's size).
      const elementLength = hasRealChildren
        ? itemByteLength({ ...child, occurs: null })
        : elementaryByteLength(child);

      fields.push({
        redefine: true,
        name: fieldName,
        type: fieldType,
        cobolName: child.name,
        offset: target.offset,
        length: elementLength * count,
        elementLength,
        occurs: count,
        isTable,
        isGroup: hasRealChildren,
        ...(!hasRealChildren ? classifyCodec(child, options) : {}),
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
      fieldType = resolveClassName(child.name, childContext);
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

    // round-14 finding 4: SYNCHRONIZED/SYNC alignment padding (layout.js's
    // syncPadBytes - a no-op for anything but a SYNC binary/COMP item) goes
    // immediately BEFORE this field, advancing the running offset first -
    // parse/format both need to skip exactly this many bytes ahead of the
    // field's own bytes (see the padBefore consumers below).
    const padBefore = syncPadBytes(child, totalLength);
    totalLength += padBefore;

    const fieldOffset = totalLength;
    totalLength += elementLength * count;

    // OCCURS ... DEPENDING ON: see file header. Kept at the fixed max count;
    // just flagged so it shows up as a visible work item in generated code.
    const occursClause = child.occurs && typeof child.occurs === 'object' ? child.occurs : null;
    const dependingOn = occursClause?.dependingOn || null;

    fields.push({
      name: fieldName,
      type: fieldType,
      cobolName: child.name,
      length: elementLength,
      offset: fieldOffset,
      padBefore,
      occurs: count,
      isTable,
      isGroup: hasRealChildren,
      dependingOn,
      decimalDigits: child.pic?.decimalDigits || 0,
      ...(!hasRealChildren ? classifyCodec(child, options) : {}),
    });
  }

  const realFields = fields.filter(f => !f.skipped && !f.redefine);
  const redefineFields = fields.filter(f => f.redefine);
  const notFoundRedefines = fields.filter(f => f.skipped);

  // Build case class definition
  lines.push(`${indentStr}case class ${className}(`);

  realFields.forEach((field, index) => {
    const comma = index < realFields.length - 1 ? ',' : '';
    lines.push(`${indentStr}  ${field.name}: ${field.type}${comma}`);
  });

  lines.push(`${indentStr})${redefineFields.length > 0 ? ':' : ''}`);

  // REDEFINES lazy alternate views (see file header for the design).
  for (const rf of redefineFields) {
    for (const line of redefineLazyValLines(rf, className, indentStr)) {
      lines.push(line);
    }
  }

  // Surface REDEFINES entries whose target could not be resolved
  for (const field of notFoundRedefines) {
    lines.push(`${indentStr}${field.comment}`);
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
    if (field.padBefore) {
      // round-14 finding 4: SYNCHRONIZED/SYNC alignment padding - skip these
      // bytes (never any field's own data) before reading the field itself.
      lines.push(`${indentStr}    offset += ${field.padBefore} // SYNC alignment padding`);
    }
    if (field.dependingOn) {
      lines.push(
        `${indentStr}    // TODO(ODO): '${field.name}' is OCCURS ... DEPENDING ON ${field.dependingOn} - ` +
        `parsing the fixed max count (${field.occurs}) for round-trip stability; dynamic length not implemented`
      );
    }
    if (field.isTable && field.isGroup) {
      const innerType = field.type.replace('Vector[', '').replace(']', '');
      lines.push(`${indentStr}    val ${field.name} = (0 until ${field.occurs}).map { _ =>`);
      lines.push(`${indentStr}      val elem = ${innerType}.parse(bytes.slice(offset, offset + ${innerType}.recordLength))`);
      lines.push(`${indentStr}      offset += ${innerType}.recordLength`);
      lines.push(`${indentStr}      elem`);
      lines.push(`${indentStr}    }.toVector`);
    } else if (field.isTable) {
      const innerType = field.type.replace('Vector[', '').replace(']', '');
      const elementField = { ...field, type: innerType };
      lines.push(`${indentStr}    val ${field.name} = (0 until ${field.occurs}).map { _ =>`);
      lines.push(`${indentStr}      val elem = ${decodeFieldExpr(elementField, `bytes.slice(offset, offset + ${field.length})`)}`);
      lines.push(`${indentStr}      offset += ${field.length}`);
      lines.push(`${indentStr}      elem`);
      lines.push(`${indentStr}    }.toVector`);
    } else if (field.isGroup) {
      lines.push(`${indentStr}    val ${field.name} = ${field.type}.parse(bytes.slice(offset, offset + ${field.type}.recordLength))`);
      lines.push(`${indentStr}    offset += ${field.type}.recordLength`);
    } else {
      lines.push(`${indentStr}    val ${field.name} = ${decodeFieldExpr(field, `bytes.slice(offset, offset + ${field.length})`)}`);
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
    if (field.padBefore) {
      // round-14 finding 4: leave these bytes at the buffer's own default
      // zero-fill (`new Array[Byte](recordLength)` above is already all
      // 0x00) - matching cobc's own observed SYNC pad-byte value exactly -
      // by simply advancing past them without writing anything.
      lines.push(`${indentStr}    offset += ${field.padBefore} // SYNC alignment padding`);
    }
    if (field.isTable && field.isGroup) {
      const innerType = field.type.replace('Vector[', '').replace(']', '');
      lines.push(`${indentStr}    record.${field.name}.foreach { elem =>`);
      lines.push(`${indentStr}      val elemBytes = ${innerType}.format(elem)`);
      lines.push(`${indentStr}      System.arraycopy(elemBytes, 0, buffer, offset, ${innerType}.recordLength)`);
      lines.push(`${indentStr}      offset += ${innerType}.recordLength`);
      lines.push(`${indentStr}    }`);
    } else if (field.isTable) {
      const innerType = field.type.replace('Vector[', '').replace(']', '');
      const elementField = { ...field, type: innerType };
      lines.push(`${indentStr}    record.${field.name}.foreach { elem =>`);
      lines.push(`${indentStr}      val elemBytes = ${encodeFieldExpr(elementField, 'elem')}`);
      lines.push(`${indentStr}      System.arraycopy(elemBytes, 0, buffer, offset, ${field.length})`);
      lines.push(`${indentStr}      offset += ${field.length}`);
      lines.push(`${indentStr}    }`);
    } else if (field.isGroup) {
      lines.push(`${indentStr}    val ${field.name}Bytes = ${field.type}.format(record.${field.name})`);
      lines.push(`${indentStr}    System.arraycopy(${field.name}Bytes, 0, buffer, offset, ${field.type}.recordLength)`);
      lines.push(`${indentStr}    offset += ${field.type}.recordLength`);
    } else {
      lines.push(`${indentStr}    val ${field.name}Bytes = ${encodeFieldExpr(field, `record.${field.name}`)}`);
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
 * Emit the body lines (already indented) of a `lazy val` REDEFINES view for
 * one field. `region` recomputes the redefined bytes via the class's own
 * `format(this)` rather than storing raw bytes anywhere (see file header).
 */
function redefineLazyValLines(rf, className, indentStr) {
  const bodyIndent = `${indentStr}  `;
  const region = `${className}.format(this).slice(${rf.offset}, ${rf.offset + rf.length})`;

  if (rf.isGroup && !rf.isTable) {
    return [`${bodyIndent}lazy val ${rf.name}: ${rf.type} = ${rf.type}.parse(${region})`];
  }

  if (rf.isGroup && rf.isTable) {
    const innerType = rf.type.replace('Vector[', '').replace(']', '');
    return [
      `${bodyIndent}lazy val ${rf.name}: ${rf.type} =`,
      `${bodyIndent}  val region = ${region}`,
      `${bodyIndent}  (0 until ${rf.occurs}).map { i =>`,
      `${bodyIndent}    ${innerType}.parse(region.slice(i * ${innerType}.recordLength, (i + 1) * ${innerType}.recordLength))`,
      `${bodyIndent}  }.toVector`,
    ];
  }

  if (!rf.isGroup && rf.isTable) {
    const innerType = rf.type.replace('Vector[', '').replace(']', '');
    const elementField = { ...rf, type: innerType };
    return [
      `${bodyIndent}lazy val ${rf.name}: ${rf.type} =`,
      `${bodyIndent}  val region = ${region}`,
      `${bodyIndent}  (0 until ${rf.occurs}).map { i =>`,
      `${bodyIndent}    ${decodeFieldExpr(elementField, `region.slice(i * ${rf.elementLength}, (i + 1) * ${rf.elementLength})`)}`,
      `${bodyIndent}  }.toVector`,
    ];
  }

  // Elementary, single occurrence
  return [`${bodyIndent}lazy val ${rf.name}: ${rf.type} = ${decodeFieldExpr(rf, region)}`];
}

/**
 * Scala expression that decodes one elementary value given an already-sliced
 * `bytesExpr` (an Array[Byte] expression of exactly this field's width).
 */
function decodeFieldExpr(field, bytesExpr) {
  switch (field.codecKind) {
    case 'packed':
      return `CobolCodecs.packedDecode(${bytesExpr}, scale = ${field.decimalDigits})`;

    case 'binary': {
      const decoded = `CobolCodecs.binaryDecode(${bytesExpr}, endianness = "${field.endianness}")`;
      if (field.type === 'BigDecimal') return `BigDecimal(BigInt(${decoded}), ${field.decimalDigits})`;
      if (field.type === 'Int') return `${decoded}.toInt`;
      return decoded; // Long
    }

    case 'zoned': {
      const decoded =
        `CobolCodecs.zonedDecode(${bytesExpr}, scale = ${field.decimalDigits}, signed = ${field.signed}, ` +
        `signLeading = ${field.signLeading}, signSeparate = ${field.signSeparate}, codePage = "${field.codePage}")`;
      if (field.type === 'Int') return `${decoded}.toIntExact`;
      if (field.type === 'Long') return `${decoded}.toLongExact`;
      return decoded; // BigDecimal
    }

    case 'string':
      return field.codePage === 'EBCDIC'
        ? `CobolCodecs.ebcdicToString(${bytesExpr})`
        : `new String(${bytesExpr}, java.nio.charset.StandardCharsets.ISO_8859_1)`;

    default:
      return legacyDecodeExpr(field.type, bytesExpr);
  }
}

/**
 * Scala expression producing the fixed-width byte encoding of one elementary value.
 */
function encodeFieldExpr(field, valueExpr) {
  switch (field.codecKind) {
    case 'packed':
      return `CobolCodecs.packedEncode(${valueExpr}, ${field.digits}, scale = ${field.decimalDigits}, signed = ${field.signed})`;

    case 'binary': {
      let longExpr;
      if (field.type === 'BigDecimal') {
        longExpr = `${valueExpr}.setScale(${field.decimalDigits}, BigDecimal.RoundingMode.HALF_UP).bigDecimal.unscaledValue().longValueExact()`;
      } else if (field.type === 'Int') {
        longExpr = `${valueExpr}.toLong`;
      } else {
        longExpr = valueExpr; // already Long
      }
      return `CobolCodecs.binaryEncode(${longExpr}, ${field.length}, endianness = "${field.endianness}")`;
    }

    case 'zoned': {
      const bd = field.type === 'BigDecimal' ? valueExpr : `BigDecimal(${valueExpr})`;
      return (
        `CobolCodecs.zonedEncode(${bd}, ${field.digits}, scale = ${field.decimalDigits}, signed = ${field.signed}, ` +
        `signLeading = ${field.signLeading}, signSeparate = ${field.signSeparate}, codePage = "${field.codePage}")`
      );
    }

    case 'string':
      return field.codePage === 'EBCDIC'
        ? `CobolCodecs.stringToEbcdic(${valueExpr}, Some(${field.length}))`
        : `${valueExpr}.padTo(${field.length}, ' ').take(${field.length}).getBytes(java.nio.charset.StandardCharsets.ISO_8859_1)`;

    default:
      return legacyEncodeExpr(field.type, field, valueExpr);
  }
}

/**
 * Unchanged pre-Phase-1 display-string decode, kept only for COMP-1/COMP-2
 * (Float/Double), which have no byte-level codec yet.
 */
function legacyDecodeExpr(scalaType, bytesExpr) {
  const slice = `new String(${bytesExpr}).trim`;
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
      return `BigDecimal(${slice} match { case "" => "0"; case s => s })`;
    default:
      return slice;
  }
}

/**
 * Unchanged pre-Phase-1 display-string encode, kept only for COMP-1/COMP-2.
 */
function legacyEncodeExpr(scalaType, field, valueExpr) {
  switch (scalaType) {
    case 'Int':
    case 'Long':
      return `${valueExpr}.toString.reverse.padTo(${field.length}, '0').reverse.take(${field.length}).getBytes`;
    case 'Float':
    case 'Double':
      return `${valueExpr}.toString.reverse.padTo(${field.length}, '0').reverse.take(${field.length}).getBytes`;
    case 'BigDecimal':
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
  collectAmbiguousGroupClassNames,
  resolveClassName,
  generateCaseClass
};
