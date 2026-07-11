#!/usr/bin/env bash
# demo/convert-demo.sh
#
# End-to-end demo of the COBOL-to-Scala conversion engine's core claim:
# "the generated Scala behaves the same as the real COBOL compiler."
#
# Steps:
#   1. Take demo/demoacct.cbl (a small program that COPYs its record layout
#      from demo/copybooks/CUSTOMER.cpy and uses a COMP-3 packed-decimal
#      money field + COMPUTE ROUNDED).
#   2. Convert it to Scala via the engine's convertToScala(), driven through
#      plain `node` (demo/convert.mjs) - exactly how any other caller of the
#      package would use it.
#   3. Show the generated Scala.
#   4. Compile + run the COBOL with cobc (GnuCOBOL) - the "compiler oracle".
#   5. Compile + run the generated Scala with scala-cli.
#   6. Diff the two programs' stdout and print EQUIVALENT or DIVERGED.
#
# See demo/README.md for prerequisites and troubleshooting.
#
# Usage:
#   demo/convert-demo.sh                 # uses demo/demoacct.cbl (default)
#   demo/convert-demo.sh path/to/x.cbl   # convert/run a different program
#                                        # (no copybook dir is passed in this
#                                        # form, since only demoacct.cbl ships
#                                        # with one in this repo)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENGINE_DIR="${REPO_ROOT}/Thyraa-COBOL-main/backend/packages/cobol-to-scala"

COBOL_SOURCE="${1:-${SCRIPT_DIR}/demoacct.cbl}"
COPYBOOKS_DIR="${SCRIPT_DIR}/copybooks"

BOLD=$'\033[1m'
GREEN=$'\033[32m'
RED=$'\033[31m'
RESET=$'\033[0m'

section() { printf '\n%s=== %s ===%s\n' "${BOLD}" "$1" "${RESET}"; }
fail() { printf '%s%s%s\n' "${RED}" "$1" "${RESET}" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 0. Prerequisite checks
# ---------------------------------------------------------------------------
section "Checking prerequisites"

MISSING=()
command -v cobc >/dev/null 2>&1 || MISSING+=("cobc (GnuCOBOL)")
command -v scala-cli >/dev/null 2>&1 || MISSING+=("scala-cli")
command -v node >/dev/null 2>&1 || MISSING+=("node")

if [ "${#MISSING[@]}" -gt 0 ]; then
  fail "Missing required tool(s): ${MISSING[*]}. See demo/README.md for install instructions."
fi

[ -f "${COBOL_SOURCE}" ] || fail "COBOL source not found: ${COBOL_SOURCE}"
[ -f "${ENGINE_DIR}/index.js" ] || fail "Engine not found at ${ENGINE_DIR} - is this a full checkout?"

echo "cobc:      $(cobc --version 2>&1 | head -1)"
echo "scala-cli: $(scala-cli --version 2>&1 | grep -v 'JAVA_TOOL_OPTIONS' | head -1)"
echo "node:      $(node --version)"
echo "source:    ${COBOL_SOURCE}"

SCRATCH_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cobol-to-scala-demo.XXXXXX")"
cleanup() { rm -rf "${SCRATCH_DIR}"; }
trap cleanup EXIT

BASE_NAME="$(basename "${COBOL_SOURCE}" .cbl)"
BASE_NAME="$(basename "${BASE_NAME}" .cob)"

# ---------------------------------------------------------------------------
# 1. Convert COBOL -> Scala via the engine (plain node, no test framework)
# ---------------------------------------------------------------------------
section "Converting ${COBOL_SOURCE} to Scala (engine: convertToScala)"

GENERATED_SCALA="${SCRATCH_DIR}/Generated.scala"
CONVERT_INFO="$(node "${SCRIPT_DIR}/convert.mjs" "${COBOL_SOURCE}" "${COPYBOOKS_DIR}" "${GENERATED_SCALA}" 2>&1 >/dev/null)" \
  || fail "Conversion failed. convert.mjs output:
${CONVERT_INFO}"

echo "convert.mjs summary: ${CONVERT_INFO}"

# ---------------------------------------------------------------------------
# 2. Show the generated Scala
# ---------------------------------------------------------------------------
section "Generated Scala (${GENERATED_SCALA})"
cat "${GENERATED_SCALA}"

# ---------------------------------------------------------------------------
# 3. Compile + run the COBOL with cobc (the compiler oracle)
# ---------------------------------------------------------------------------
section "Compiling + running with cobc (GnuCOBOL)"

COBOL_EXE="${SCRATCH_DIR}/${BASE_NAME}_cobol"
if ! cobc -x -I "${COPYBOOKS_DIR}" -o "${COBOL_EXE}" "${COBOL_SOURCE}" 2>"${SCRATCH_DIR}/cobc.err"; then
  cat "${SCRATCH_DIR}/cobc.err" >&2
  fail "cobc compile failed."
fi

COBOL_OUTPUT="$("${COBOL_EXE}")"
echo "--- cobc stdout ---"
echo "${COBOL_OUTPUT}"

# ---------------------------------------------------------------------------
# 4. Compile + run the generated Scala with scala-cli
# ---------------------------------------------------------------------------
section "Compiling + running with scala-cli"

if ! SCALA_OUTPUT="$(cd "${SCRATCH_DIR}" && scala-cli run "$(basename "${GENERATED_SCALA}")" 2>"${SCRATCH_DIR}/scala.err")"; then
  grep -v 'Picked up JAVA_TOOL_OPTIONS' "${SCRATCH_DIR}/scala.err" >&2 || true
  fail "scala-cli run failed."
fi

echo "--- scala-cli stdout ---"
echo "${SCALA_OUTPUT}"

# ---------------------------------------------------------------------------
# 5. Diff and verdict
# ---------------------------------------------------------------------------
section "Diff: cobc vs generated Scala"

# Normalize trailing whitespace/newlines the same way tests/oracle/harness.js
# does, so a trivial formatting difference doesn't register as a divergence.
normalize() { printf '%s' "$1" | sed -e 's/[ \t]*$//' -e '$a\'; }

COBOL_NORM="$(normalize "${COBOL_OUTPUT}")"
SCALA_NORM="$(normalize "${SCALA_OUTPUT}")"

if [ "${COBOL_NORM}" = "${SCALA_NORM}" ]; then
  echo "(no differences)"
  printf '\n%s%sEQUIVALENT%s - generated Scala output matches real GnuCOBOL output exactly.\n' "${BOLD}" "${GREEN}" "${RESET}"
  exit 0
else
  diff <(printf '%s\n' "${COBOL_NORM}") <(printf '%s\n' "${SCALA_NORM}") || true
  printf '\n%s%sDIVERGED%s - generated Scala output does not match real GnuCOBOL output. See diff above.\n' "${BOLD}" "${RED}" "${RESET}"
  exit 1
fi
