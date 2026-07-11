/**
 * generator/cics-gen.js
 *
 * Phase 4 (online systems) stretch goal: turn a program's classified EXEC
 * CICS commands (`parser/cics-parser.js#parseAllCicsCommands`) into a Scala 3
 * *service-endpoint skeleton* - a scaffold a human then fills in, not a
 * working translation.
 *
 * ## Honesty rule (see docs/CAPABILITY_AUDIT_AND_ROADMAP.md, "coverage
 * honesty")
 *
 * Every generated method that could plausibly be mistaken for real behavior
 * has a body of exactly `???`, immediately preceded by a comment carrying
 * the original `EXEC CICS ...` command(s) it stands in for - so nobody who
 * reads the output can mistake it for a translation. Repository-interface
 * members are left properly *abstract* (no `= ???`, just a signature) -
 * arguably more honest still, since Scala's own type system then forces an
 * implementation to exist before anything can run. Every command this
 * generator saw but didn't turn into a method (HANDLE CONDITION, ABEND,
 * ASSIGN, GETMAIN, ...) is still surfaced as a comment - never silently
 * dropped.
 *
 * ## What gets generated, per program
 *
 * - One `SEND MAP`/`RECEIVE MAP` pair sharing the same `MAP(...)` name
 *   becomes one request/response case class (named from the BMS map via
 *   `bmsToRecordLayout` when `options.bmsMaps` supplies that map; a single
 *   opaque `raw: String` field otherwise - see `buildMapDto`) plus a
 *   `receiveXxx`/`sendXxx` method pair.
 * - Each distinct `LINK`/`XCTL` target program becomes a method call stub
 *   (`LINK` returns the (possibly-updated) COMMAREA bytes; `XCTL` returns
 *   `Nothing`, since control never returns to the caller).
 * - Each distinct `FILE`/`DATASET` name touched by `READ`/`WRITE`/
 *   `REWRITE`/`DELETE` becomes an abstract repository trait with exactly the
 *   operations the program actually used (never a fabricated full CRUD
 *   surface).
 * - `RETURN` commands become a single documented state-machine comment
 *   block (never code): pseudo-conversational continuation (`RETURN
 *   TRANSID(...)`) is fundamentally a "the next invocation of this program
 *   is the next state" control-flow shape that doesn't correspond to any
 *   single Scala construct, so it's named and left for a human design
 *   decision rather than faked.
 * - Everything else this parser saw (`HANDLE CONDITION`/`ABEND`, `IGNORE
 *   CONDITION`, `ASSIGN`, `ADDRESS`, `GETMAIN`/`FREEMAIN`, `START`/
 *   `RETRIEVE`, `SYNCPOINT`, transient-data/temp-storage queue ops, and any
 *   `UNKNOWN` command) is listed under "other CICS commands observed" so the
 *   skeleton is a complete inventory of the program's CICS surface even
 *   where it isn't a complete translation of it.
 */

import { parseAllCicsCommands } from '../parser/cics-parser.js';
import { bmsToRecordLayout } from '../parser/bms-parser.js';
import { toPascalCase, toCamelCase } from './case-class-gen.js';

// ---------------------------------------------------------------------
// Scala-type inference for a BMS PICIN/PICOUT clause (scaffold-level
// heuristic - not layout.js's full PIC parser, see file header).
// ---------------------------------------------------------------------

function picDigitCount(cleaned) {
  let total = 0;
  const re = /9(\((\d+)\))?/g;
  let m;
  while ((m = re.exec(cleaned))) {
    total += m[2] ? parseInt(m[2], 10) : 1;
  }
  return total;
}

function scalaTypeForPicture(pic) {
  if (!pic) return 'String';
  const cleaned = pic.replace(/\s+/g, '').toUpperCase();
  const isPlainNumeric = /^[S9V()0-9]+$/.test(cleaned) && /9/.test(cleaned);
  if (!isPlainNumeric) return 'String'; // alphanumeric or edited-numeric -> treat as display text
  if (cleaned.includes('V')) return 'BigDecimal';
  return picDigitCount(cleaned) <= 9 ? 'Int' : 'Long';
}

// direction preference when a base field has both an input and an output
// variant (differing PICIN/PICOUT): the output (SEND-side, typically the
// edited/display picture) wins the DTO's single field type - see file header.
function directionRank(direction) {
  if (direction === 'both') return 2;
  if (direction === 'output') return 1;
  return 0;
}

/**
 * Build the request/response DTO (a case-class name + field list) for one
 * BMS map. Falls back to a single opaque `raw: String` field when no BMS
 * source was supplied for this map name (`options.bmsMaps` lookup miss) -
 * documented, not silent: the fallback case class's only field is literally
 * named `raw`.
 */
function buildMapDto(mapName, bmsMap) {
  const className = `${toPascalCase(mapName)}Map`;

  if (!bmsMap) {
    return { className, fields: [{ name: 'raw', type: 'String' }], fromBms: false };
  }

  const layout = bmsToRecordLayout(bmsMap);
  const byBase = new Map();
  for (const f of layout.fields) {
    if (f.kind !== 'data') continue;
    const existing = byBase.get(f.baseName);
    if (!existing || directionRank(f.direction) > directionRank(existing.direction)) {
      byBase.set(f.baseName, f);
    }
  }

  const fields = [...byBase.values()].map((f) => ({
    name: toCamelCase(f.baseName),
    type: scalaTypeForPicture(f.picture),
  }));

  if (fields.length === 0) {
    return { className, fields: [{ name: 'raw', type: 'String' }], fromBms: false };
  }

  return { className, fields, fromBms: true };
}

// ---------------------------------------------------------------------
// Grouping: classified commands -> the buckets the skeleton is built from
// ---------------------------------------------------------------------

function groupCommands(commands) {
  const mapGroups = new Map(); // mapName -> {mapset, receives: Set<raw>, sends: Set<raw>}
  const linkGroups = new Map(); // programName -> Set<raw>
  const xctlGroups = new Map(); // programName -> Set<raw>
  const fileGroups = new Map(); // fileName -> {read, write, rewrite, delete: Set<raw>}
  const returns = [];
  const other = [];

  for (const cmd of commands) {
    if (cmd.command === 'RECEIVE MAP' || cmd.command === 'SEND MAP') {
      const mapName = cmd.options.MAP || 'UNNAMEDMAP';
      const entry = mapGroups.get(mapName) || {
        mapset: cmd.options.MAPSET || null,
        receives: new Set(),
        sends: new Set(),
      };
      if (!entry.mapset && cmd.options.MAPSET) entry.mapset = cmd.options.MAPSET;
      (cmd.command === 'RECEIVE MAP' ? entry.receives : entry.sends).add(cmd.raw);
      mapGroups.set(mapName, entry);
      continue;
    }

    if (cmd.command === 'LINK') {
      const target = cmd.options.PROGRAM || 'UNKNOWN-PROGRAM';
      const set = linkGroups.get(target) || new Set();
      set.add(cmd.raw);
      linkGroups.set(target, set);
      continue;
    }

    if (cmd.command === 'XCTL') {
      const target = cmd.options.PROGRAM || 'UNKNOWN-PROGRAM';
      const set = xctlGroups.get(target) || new Set();
      set.add(cmd.raw);
      xctlGroups.set(target, set);
      continue;
    }

    if (['READ', 'WRITE', 'REWRITE', 'DELETE'].includes(cmd.command)) {
      const fileName = cmd.options.FILE || cmd.options.DATASET || 'UNKNOWN-FILE';
      const entry = fileGroups.get(fileName) || {
        read: new Set(), write: new Set(), rewrite: new Set(), delete: new Set(),
      };
      entry[cmd.command.toLowerCase()].add(cmd.raw);
      fileGroups.set(fileName, entry);
      continue;
    }

    if (cmd.command === 'RETURN') {
      returns.push(cmd);
      continue;
    }

    other.push(cmd);
  }

  return { mapGroups, linkGroups, xctlGroups, fileGroups, returns, other };
}

// ---------------------------------------------------------------------
// Emission helpers
// ---------------------------------------------------------------------

function emitRawComments(lines, indent, raws) {
  for (const raw of raws) {
    lines.push(`${indent}// EXEC CICS ${raw}`);
  }
}

function emitMapSection(lines, mapGroups, bmsMaps) {
  if (mapGroups.size === 0) return;
  lines.push('  // ---- SEND MAP / RECEIVE MAP -> request/response DTOs ----');
  for (const [mapName, entry] of mapGroups) {
    const bmsMap = bmsMaps[mapName.toUpperCase()] || null;
    const dto = buildMapDto(mapName, bmsMap);
    const note = dto.fromBms
      ? `// DTO derived from BMS map '${mapName}' via bmsToRecordLayout`
      : `// no BMS source supplied for map '${mapName}' - opaque placeholder DTO`;
    lines.push(`  ${note}`);
    lines.push(`  case class ${dto.className}(`);
    dto.fields.forEach((f, idx) => {
      const comma = idx < dto.fields.length - 1 ? ',' : '';
      lines.push(`    ${f.name}: ${f.type}${comma}`);
    });
    lines.push('  )');
    lines.push('');

    if (entry.receives.size > 0) {
      lines.push(`  def receive${toPascalCase(mapName)}(): ${dto.className} =`);
      emitRawComments(lines, '    ', entry.receives);
      lines.push('    ???');
      lines.push('');
    }
    if (entry.sends.size > 0) {
      lines.push(`  def send${toPascalCase(mapName)}(map: ${dto.className}): Unit =`);
      emitRawComments(lines, '    ', entry.sends);
      lines.push('    ???');
      lines.push('');
    }
  }
}

function emitLinkXctlSection(lines, linkGroups, xctlGroups) {
  if (linkGroups.size === 0 && xctlGroups.size === 0) return;
  lines.push('  // ---- LINK / XCTL -> calls to other CICS programs/services ----');
  for (const [target, raws] of linkGroups) {
    lines.push(`  def link${toPascalCase(target)}(commarea: Array[Byte]): Array[Byte] =`);
    emitRawComments(lines, '    ', raws);
    lines.push('    ???');
    lines.push('');
  }
  for (const [target, raws] of xctlGroups) {
    // XCTL transfers control permanently - it never returns to the caller.
    lines.push(`  def xctl${toPascalCase(target)}(commarea: Array[Byte]): Nothing =`);
    emitRawComments(lines, '    ', raws);
    lines.push('    ???');
    lines.push('');
  }
}

function emitFileSection(lines, fileGroups) {
  if (fileGroups.size === 0) return;
  lines.push('  // ---- READ / WRITE / REWRITE / DELETE -> repository-interface stubs ----');
  for (const [fileName, ops] of fileGroups) {
    lines.push(`  trait ${toPascalCase(fileName)}Repository:`);
    if (ops.read.size > 0) {
      emitRawComments(lines, '    ', ops.read);
      lines.push('    def read(ridfld: String): Array[Byte]');
    }
    if (ops.write.size > 0) {
      emitRawComments(lines, '    ', ops.write);
      lines.push('    def write(ridfld: String, data: Array[Byte]): Unit');
    }
    if (ops.rewrite.size > 0) {
      emitRawComments(lines, '    ', ops.rewrite);
      lines.push('    def rewrite(data: Array[Byte]): Unit');
    }
    if (ops.delete.size > 0) {
      emitRawComments(lines, '    ', ops.delete);
      lines.push('    def delete(ridfld: String): Unit');
    }
    lines.push('');
  }
}

function emitReturnSection(lines, returns) {
  if (returns.length === 0) return;
  const withTransid = returns.filter((r) => r.options.TRANSID !== undefined);

  lines.push('  // ---- RETURN TRANSID -> pseudo-conversational state machine ----');
  if (withTransid.length > 0) {
    lines.push('  // This program uses CICS pseudo-conversational continuation: each');
    lines.push('  // RETURN TRANSID(...) below hands control back to CICS, which re-invokes');
    lines.push('  // this program from the top the next time the transaction ID runs (the');
    lines.push('  // next terminal input). There is no single Scala construct for this - a');
    lines.push('  // faithful port models it as an explicit state machine keyed by a');
    lines.push('  // discriminator persisted in the COMMAREA, not as a normal method call.');
  } else {
    lines.push('  // Every RETURN below is single-shot (no TRANSID): it ends this program\'s');
    lines.push('  // logical unit of work with no continuation to model.');
  }
  for (const r of returns) {
    lines.push(`  // ${r.paragraph || '(no paragraph)'}: EXEC CICS ${r.raw}`);
  }
  lines.push('');
}

function emitOtherSection(lines, other) {
  if (other.length === 0) return;
  lines.push('  // ---- Other CICS commands observed (not modeled as methods - see raw text) ----');
  for (const cmd of other) {
    lines.push(`  // ${cmd.paragraph || '(no paragraph)'} [${cmd.command}]: EXEC CICS ${cmd.raw}`);
  }
  lines.push('');
}

// ---------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------

/**
 * Generate a Scala 3 service-endpoint skeleton for one parsed COBOL/CICS
 * program.
 *
 * @param {object} program - the return value of `parser/index.js`'s
 *   `parseCobol(source)` (must have `.program.programId` and `.procedures`;
 *   this is exactly what `parseAllCicsCommands` consumes).
 * @param {object} [options]
 * @param {Record<string, object>} [options.bmsMaps] - BMS map objects
 *   (`parser/bms-parser.js#parseBms(...).mapsets[i].maps[j]` shape), keyed by
 *   map name, upper-cased. Supplying the map a program's `SEND MAP`/
 *   `RECEIVE MAP` refers to lets the generated request/response case class
 *   be derived from the real symbolic map instead of the opaque fallback.
 * @returns {string} a self-contained `.scala` source (includes a
 *   `//> using scala "3.3.1"` directive for `scala-cli`).
 */
export function generateCicsSkeleton(program, options = {}) {
  const bmsMaps = options.bmsMaps || {};
  const commands = parseAllCicsCommands(program);
  const programId = program?.program?.programId || 'UNKNOWNPROGRAM';
  const traitName = `${toPascalCase(programId)}Service`;

  const { mapGroups, linkGroups, xctlGroups, fileGroups, returns, other } = groupCommands(commands);

  const lines = [];
  lines.push('//> using scala "3.3.1"');
  lines.push('');
  lines.push(`// AUTO-GENERATED CICS service skeleton for program ${programId}.`);
  lines.push('// Scaffolding only: every method body below is `???`; the comment directly');
  lines.push('// above it carries the original EXEC CICS command(s) it stands in for. This');
  lines.push('// is honest scaffolding, not a translation - see');
  lines.push('// docs/CAPABILITY_AUDIT_AND_ROADMAP.md, Phase 4.');
  lines.push('');
  lines.push(`trait ${traitName}:`);
  lines.push('');

  emitMapSection(lines, mapGroups, bmsMaps);
  emitLinkXctlSection(lines, linkGroups, xctlGroups);
  emitFileSection(lines, fileGroups);
  emitReturnSection(lines, returns);
  emitOtherSection(lines, other);

  lines.push(`end ${traitName}`);
  lines.push('');

  return lines.join('\n');
}

export default { generateCicsSkeleton };
