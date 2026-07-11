# Verification Toolchain Status

Generated: 2026-07-11 (sandboxed Ubuntu 24.04.4 LTS container, kernel 6.18.5, x86_64)

Summary: **both GnuCOBOL (`cobc`) and Scala CLI (`scala-cli`) are installed system-wide and
verified working**, including COMP-3 packed-decimal handling in COBOL and case-class /
`Array[Byte]` manipulation in Scala 3.

## 1. GnuCOBOL — STATUS: OK

- Installed via `apt-get install -y gnucobol4` (Ubuntu `universe` repo, no PPAs needed).
- Package: `gnucobol4 4.0~early~20200606-6.1build1` (pulls in `libcob5t64`, `libcob5-dev`,
  `libgmp-dev`, `libgmpxx4ldbl`).
- Binary: `/usr/bin/cobc`
- Version:
  ```
  $ cobc --version
  cobc (GnuCOBOL) 4.0-early-dev.0
  Built     Mar 31 2024 06:15:26
  Packaged  Jun 06 2020 20:56:36 UTC
  C version "13.2.0"
  ```

### Install commands used

```bash
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y gnucobol4
```

(`gnucobol` (v5) and `gnucobol3` are also available candidates in the same repo if a
different major version is ever needed; no source build or manual binary download was
required.)

### Verified: compile + run hello world

`hello.cob`:
```cobol
       IDENTIFICATION DIVISION.
       PROGRAM-ID. HELLO.
       PROCEDURE DIVISION.
           DISPLAY "HELLO, WORLD!".
           STOP RUN.
```

Invocation:
```bash
cobc -x -o hello hello.cob
./hello
# => HELLO, WORLD!
```

### Verified: COMP-3 (packed decimal) MOVE + DISPLAY

`comp3test.cob`:
```cobol
       IDENTIFICATION DIVISION.
       PROGRAM-ID. COMP3TEST.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-AMOUNT       PIC S9(7)V99 COMP-3.
       01  WS-DISPLAY-AMT  PIC ---9,999,999.99.
       PROCEDURE DIVISION.
           MOVE 12345.67 TO WS-AMOUNT.
           MOVE WS-AMOUNT TO WS-DISPLAY-AMT.
           DISPLAY "COMP-3 VALUE: " WS-DISPLAY-AMT.
           DISPLAY "RAW MOVE TEST: " WS-AMOUNT.
           STOP RUN.
```

Invocation:
```bash
cobc -x -o comp3test comp3test.cob
./comp3test
# => COMP-3 VALUE:    0,012,345.67
# => RAW MOVE TEST: +0012345.67
```

Both compiled and ran with exit code 0. `cobc -x` produces a native executable
(`-free` flag is also available for free-format source; fixed-format columns work as
shown above without it).

## 2. Scala CLI — STATUS: OK (installed via non-standard path, see caveat)

- Version: **Scala CLI 1.9.1**, default Scala version **3.7.3**, running on the
  pre-installed JDK (OpenJDK 21.0.10, `/usr/bin/java`).
- Launcher: `/usr/local/bin/scala-cli` (shell wrapper)
- Payload: `/usr/local/lib/scala-cli/cliBootstrapped-1.9.1.jar` (~110 MB fat/assembly jar,
  `Main-Class: scala.cli.ScalaCli`)

### Caveat: how it was installed and why

The task's suggested install paths (GitHub releases for scala-cli itself, and
`cs-x86_64-pc-linux.gz` / coursier releases) were **not reachable**. This sandbox's
egress proxy gates `github.com` / `api.github.com` per-repository ("GitHub access to
this repository is not enabled for this session. Use add_repo to request access.",
same for the `releases/latest/download/...` asset redirect). `get.sdkman.io` was also
blocked outright (403 at the proxy/CONNECT level). `search.maven.org` was blocked too.

However, **Maven Central (`repo1.maven.org`) was directly reachable** (not proxied /
gated — confirmed 200 OK on directory listings and file downloads). VirtusLab publishes
an official self-contained "bootstrapped" assembly jar of scala-cli straight to Maven
Central at:

```
org.virtuslab.scala-cli:cliBootstrapped_3   (artifact dir: cliBootstrapped)
```

This is the same artifact family Coursier/scala-cli's own installer channels resolve
from — it's not an unofficial repackaging. It was downloaded and its SHA1 checksum
verified against the one published alongside it on Maven Central:

```bash
mkdir -p /usr/local/lib/scala-cli
curl -fSL -o /usr/local/lib/scala-cli/cliBootstrapped-1.9.1.jar \
  "https://repo1.maven.org/maven2/org/virtuslab/scala-cli/cliBootstrapped/1.9.1/cliBootstrapped-1.9.1.jar"

# checksum verification
curl -sS "https://repo1.maven.org/maven2/org/virtuslab/scala-cli/cliBootstrapped/1.9.1/cliBootstrapped-1.9.1.jar.sha1"
sha1sum /usr/local/lib/scala-cli/cliBootstrapped-1.9.1.jar
# both: 9091116d5708b3c8daee006c4ef8929c3b45af00  (match)
```

Wrapper installed to `/usr/local/bin/scala-cli`:
```bash
#!/bin/sh
exec java -jar /usr/local/lib/scala-cli/cliBootstrapped-1.9.1.jar "$@"
```
```bash
chmod +x /usr/local/bin/scala-cli
```

coursier's own `cs` launcher was **not** installed (its GitHub release binary and
`get.sdkman.io` mirror were both blocked as above); it was not needed since
`cliBootstrapped` already bundles everything scala-cli needs, including its own
internal use of coursier for resolving the Scala compiler/stdlib from Maven Central on
first run.

### Verified: compile + run hello world (Scala 3)

`Hello.scala`:
```scala
//> using scala 3.7.3

@main def hello(): Unit =
  println("Hello, World!")
```

Invocation:
```bash
scala-cli run Hello.scala
# => Hello, World!
```

### Verified: case class + Array[Byte] manipulation

`BytesTest.scala`:
```scala
//> using scala 3.7.3

case class PackedField(name: String, bytes: Array[Byte]):
  def hex: String = bytes.map(b => f"${b}%02x").mkString(" ")
  def asUnsignedInts: Array[Int] = bytes.map(b => b & 0xff)

@main def bytesTest(): Unit =
  val original = Array[Byte](0x12, 0x34, 0x56.toByte, 0x7f, 0xab.toByte)
  val field = PackedField("comp3-like", original)
  println(s"name=${field.name}")
  println(s"hex=${field.hex}")
  println(s"unsigned=${field.asUnsignedInts.mkString(",")}")
  val flipped = field.copy(bytes = field.bytes.map(b => (b ^ 0xFF).toByte))
  println(s"flipped hex=${flipped.hex}")
  assert(field.bytes.sameElements(original))
  assert(!flipped.bytes.sameElements(original))
  println("OK: case class + Array[Byte] manipulation verified")
```

Invocation:
```bash
scala-cli run BytesTest.scala
# => name=comp3-like
# => hex=12 34 56 7f ab
# => unsigned=18,52,86,127,171
# => flipped hex=ed cb a9 80 54
# => OK: case class + Array[Byte] manipulation verified
```

Both exited 0. First run resolves and caches the Scala 3.7.3 compiler/stdlib from Maven
Central (a few seconds); subsequent runs are fast (~3s wall time) since the compiler
server (Bloop) and dependency cache are reused.

### Minor cosmetic noise (not an error)

Every `java`/`scala-cli` invocation prints one line to stderr:
```
Picked up JAVA_TOOL_OPTIONS: -Djavax.net.ssl.trustStore=... -Dhttps.proxyHost=127.0.0.1 ...
```
This is the container's pre-configured JVM proxy/truststore injection (see
`/root/.ccr/README.md`) surfacing because `JAVA_TOOL_OPTIONS` is set globally; it is
harmless and can be ignored or filtered (`2>&1 | grep -v 'Picked up JAVA_TOOL_OPTIONS'`).

## 3. What failed and exact errors

| Attempted | Result | Exact error |
|---|---|---|
| `curl -L https://github.com/...` (any path, e.g. release asset download, `api.github.com`) | Blocked (session-level GitHub allowlist, not a network/TLS issue) | `{"message":"GitHub access to this repository is not enabled for this session. Use add_repo to request access.","documentation_url":"https://docs.anthropic.com/en/docs/claude-code/github-actions"}` (HTTP 403 for API/release paths; HTTP 400 `Request path could not be canonicalized` for bare `https://github.com`) |
| `curl -L https://get.sdkman.io` | Blocked at proxy CONNECT level | `HTTP/1.1 403 Forbidden` / curl: `(56) CONNECT tunnel failed, response 403` |
| `curl https://search.maven.org` | Blocked at proxy CONNECT level | same as above: `403` / CONNECT tunnel failed |
| `apt-get update` against `ppa.launchpadcontent.net` (deadsnakes, ondrej/php — pre-existing repos unrelated to this task) | Blocked at proxy | `Invalid response from proxy: HTTP/1.1 403 Forbidden` — cosmetic warning only, did not block `apt-get update`/`install` for the Ubuntu archive/security/universe repos actually needed |

None of the above blocked the final goal: GnuCOBOL came from Ubuntu's own `universe`
repo (fully allowed), and scala-cli's runtime jar came from Maven Central
(`repo1.maven.org`, fully allowed), so no source builds or workarounds beyond "use the
mirror that is actually reachable" were needed.

## Quick reference: working invocations

```bash
# COBOL
cobc -x -o <prog> <prog>.cob && ./<prog>

# Scala 3
scala-cli run <script>.scala
```
