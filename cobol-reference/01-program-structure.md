# COBOL Program Structure Reference

## Overview for Transpiler Development

A COBOL program consists of exactly **four divisions** in a fixed order. Each division serves a specific purpose and contains specific types of declarations.

```
IDENTIFICATION DIVISION.    <- Program metadata
ENVIRONMENT DIVISION.       <- External dependencies
DATA DIVISION.              <- All data declarations
PROCEDURE DIVISION.         <- Executable code
```

---

## 1. IDENTIFICATION DIVISION

The simplest division - contains program metadata. Required in every program.

### Syntax Structure

```cobol
       IDENTIFICATION DIVISION.
       PROGRAM-ID. program-name [IS INITIAL|COMMON|RECURSIVE].
      *---------------------------------------------------------
      * Optional paragraphs (rarely used in modern COBOL):
      *---------------------------------------------------------
       AUTHOR. author-name.
       INSTALLATION. installation-name.
       DATE-WRITTEN. date.
       DATE-COMPILED. date.
       SECURITY. security-info.
```

### Transpiler Considerations

| Element | Parse Priority | Scala Mapping |
|---------|---------------|---------------|
| PROGRAM-ID | **Critical** | Object/Class name |
| AUTHOR | Low | Comment/annotation |
| DATE-WRITTEN | Low | Comment |
| INITIAL | Medium | Fresh state on each call |
| RECURSIVE | Medium | Allow recursive calls |

### Real Enterprise Example

```cobol
       IDENTIFICATION DIVISION.
       PROGRAM-ID. ACCT2100.
      *================================================================
      * PROGRAM: ACCT2100 - DAILY ACCOUNT BALANCE PROCESSOR
      * AUTHOR:  MAINFRAME TEAM
      * DATE:    2019-03-15
      * PURPOSE: PROCESS DAILY TRANSACTIONS AND UPDATE BALANCES
      *          FOR ALL ACTIVE CHECKING AND SAVINGS ACCOUNTS
      *================================================================
       AUTHOR. CORE BANKING DEVELOPMENT TEAM.
       DATE-WRITTEN. 2019-03-15.
       DATE-COMPILED.
```

---

## 2. ENVIRONMENT DIVISION

Describes the external environment - files, special hardware, character sets.

### Structure

```cobol
       ENVIRONMENT DIVISION.

       CONFIGURATION SECTION.
       SOURCE-COMPUTER. computer-name [WITH DEBUGGING MODE].
       OBJECT-COMPUTER. computer-name
           [MEMORY SIZE integer WORDS|CHARACTERS|MODULES]
           [PROGRAM COLLATING SEQUENCE IS alphabet-name].
       SPECIAL-NAMES.
           special-name-entries.

       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT file-entries.
       I-O-CONTROL.
           i-o-control-entries.
```

### SPECIAL-NAMES Paragraph

Maps environment-specific names to COBOL names.

```cobol
       SPECIAL-NAMES.
           DECIMAL-POINT IS COMMA.
           CURRENCY SIGN IS "EUR" WITH PICTURE SYMBOL "E".
           CLASS VALID-ACCOUNT IS "0" THRU "9" "A" THRU "Z".
           SYMBOLIC CHARACTERS
               TAB-CHAR IS 10
               NEWLINE IS 11.
           ENVIRONMENT-NAME "ENV_VAR" IS WS-ENV-VALUE.
```

### FILE-CONTROL Paragraph (Critical for Transpiler)

```cobol
       FILE-CONTROL.
      *--- Sequential File ---
           SELECT TRANSACTION-FILE
               ASSIGN TO TRANSIN
               ORGANIZATION IS SEQUENTIAL
               ACCESS MODE IS SEQUENTIAL
               FILE STATUS IS WS-TRANS-STATUS.

      *--- Indexed File (VSAM KSDS) ---
           SELECT ACCOUNT-MASTER
               ASSIGN TO ACCTMAST
               ORGANIZATION IS INDEXED
               ACCESS MODE IS DYNAMIC
               RECORD KEY IS ACCT-KEY
               ALTERNATE RECORD KEY IS ACCT-SSN WITH DUPLICATES
               FILE STATUS IS WS-ACCT-STATUS.

      *--- Relative File (VSAM RRDS) ---
           SELECT DAILY-SUMMARY
               ASSIGN TO DLYSUM
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-REL-KEY
               FILE STATUS IS WS-SUM-STATUS.

      *--- Line Sequential (Text File) ---
           SELECT REPORT-FILE
               ASSIGN TO RPTOUT
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-RPT-STATUS.
```

### Transpiler Considerations for FILE-CONTROL

| Clause | Meaning | Scala Mapping Considerations |
|--------|---------|------------------------------|
| `SELECT name` | Logical file name | Variable/stream name |
| `ASSIGN TO` | Physical file/DD name | File path or resource |
| `ORGANIZATION` | File structure | Different I/O strategies |
| `ACCESS MODE` | How records are accessed | Iterator vs random access |
| `RECORD KEY` | Primary key for indexed | Map/index key type |
| `ALTERNATE KEY` | Secondary indexes | Secondary maps |
| `FILE STATUS` | 2-byte status code | Try/Either result |

### File Status Codes (Important for Error Handling)

```
00 - Successful completion
02 - Duplicate key (non-unique alternate)
10 - End of file
21 - Sequence error
22 - Duplicate key
23 - Record not found
24 - Disk full
30 - Permanent I/O error
35 - File not found
39 - File attribute conflict
41 - File already open
42 - File not open
43 - No previous READ for REWRITE/DELETE
44 - Record length error
46 - No valid next record
47 - READ on file not open for input
48 - WRITE on file not open for output
49 - REWRITE/DELETE on file not open I-O
```

---

## 3. DATA DIVISION

The heart of COBOL data definition. See `02-data-division.md` for deep dive.

### Structure Overview

```cobol
       DATA DIVISION.

       FILE SECTION.
      * FD entries for each SELECT in FILE-CONTROL

       WORKING-STORAGE SECTION.
      * Program variables that persist across calls

       LOCAL-STORAGE SECTION.
      * Variables reinitialized on each program invocation

       LINKAGE SECTION.
      * Parameters passed from calling program

       REPORT SECTION.
      * Report Writer definitions (if used)

       SCREEN SECTION.
      * Screen definitions for ACCEPT/DISPLAY (rare in batch)
```

### Section Purposes

| Section | Lifetime | Use Case |
|---------|----------|----------|
| FILE SECTION | File I/O | Record layouts |
| WORKING-STORAGE | Program run | Persistent variables |
| LOCAL-STORAGE | Per invocation | Re-initialized each call |
| LINKAGE | Call duration | Inter-program communication |

---

## 4. PROCEDURE DIVISION

Contains all executable code. See `04-procedure-division.md` for detailed coverage.

### Structure

```cobol
       PROCEDURE DIVISION [USING param1 param2...]
                          [RETURNING return-item].

       section-name SECTION.
       paragraph-name.
           statements...

       another-paragraph.
           statements...

       another-section SECTION.
           ...
```

### Basic Structure Example

```cobol
       PROCEDURE DIVISION.

       0000-MAIN-PROCESS SECTION.
       0000-MAIN.
           PERFORM 1000-INITIALIZE
           PERFORM 2000-PROCESS-RECORDS UNTIL END-OF-FILE
           PERFORM 9000-TERMINATE
           STOP RUN.
       0000-EXIT.
           EXIT.

       1000-INITIALIZE SECTION.
       1000-INIT.
           OPEN INPUT  TRANSACTION-FILE
           OPEN OUTPUT REPORT-FILE
           OPEN I-O    ACCOUNT-MASTER
           MOVE "N" TO WS-EOF-FLAG
           PERFORM 1100-READ-TRANSACTION.
       1000-EXIT.
           EXIT.
```

---

## Complete Minimal Program Example

```cobol
       IDENTIFICATION DIVISION.
       PROGRAM-ID. MINIMAL.

       ENVIRONMENT DIVISION.

       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-MESSAGE    PIC X(20) VALUE "HELLO COBOL".

       PROCEDURE DIVISION.
           DISPLAY WS-MESSAGE
           STOP RUN.
```

---

## Complete Enterprise Program Skeleton

```cobol
       IDENTIFICATION DIVISION.
       PROGRAM-ID. BATCH001.
      *================================================================
      * BATCH TRANSACTION PROCESSOR
      *================================================================

       ENVIRONMENT DIVISION.
       CONFIGURATION SECTION.
       SOURCE-COMPUTER. IBM-ZOS.
       OBJECT-COMPUTER. IBM-ZOS.
       SPECIAL-NAMES.
           DECIMAL-POINT IS COMMA.

       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT TRANS-FILE ASSIGN TO TRANSIN
               FILE STATUS IS WS-TRANS-STATUS.
           SELECT MASTER-FILE ASSIGN TO MASTERIN
               ORGANIZATION IS INDEXED
               ACCESS MODE IS DYNAMIC
               RECORD KEY IS MAST-KEY
               FILE STATUS IS WS-MAST-STATUS.
           SELECT REPORT-FILE ASSIGN TO RPTOUT
               FILE STATUS IS WS-RPT-STATUS.
           SELECT ERROR-FILE ASSIGN TO ERROUT
               FILE STATUS IS WS-ERR-STATUS.

       DATA DIVISION.

       FILE SECTION.
       FD  TRANS-FILE
           RECORDING MODE IS F
           BLOCK CONTAINS 0 RECORDS
           RECORD CONTAINS 200 CHARACTERS.
       01  TRANS-RECORD.
           05  TRANS-TYPE          PIC X(02).
           05  TRANS-ACCOUNT       PIC 9(10).
           05  TRANS-AMOUNT        PIC S9(13)V99 COMP-3.
           05  TRANS-DATE          PIC 9(08).
           05  FILLER              PIC X(172).

       FD  MASTER-FILE
           RECORD CONTAINS 500 CHARACTERS.
       01  MASTER-RECORD.
           05  MAST-KEY            PIC X(10).
           05  MAST-DATA           PIC X(490).

       FD  REPORT-FILE
           RECORDING MODE IS F
           RECORD CONTAINS 133 CHARACTERS.
       01  REPORT-RECORD           PIC X(133).

       FD  ERROR-FILE
           RECORDING MODE IS F
           RECORD CONTAINS 200 CHARACTERS.
       01  ERROR-RECORD            PIC X(200).

       WORKING-STORAGE SECTION.
      *--- File Status Fields ---
       01  WS-FILE-STATUS.
           05  WS-TRANS-STATUS     PIC XX.
           05  WS-MAST-STATUS      PIC XX.
           05  WS-RPT-STATUS       PIC XX.
           05  WS-ERR-STATUS       PIC XX.

      *--- Control Flags ---
       01  WS-FLAGS.
           05  WS-EOF-FLAG         PIC X VALUE "N".
               88  END-OF-FILE     VALUE "Y".
               88  NOT-END-OF-FILE VALUE "N".
           05  WS-ERROR-FLAG       PIC X VALUE "N".
               88  ERROR-FOUND     VALUE "Y".
               88  NO-ERROR        VALUE "N".

      *--- Counters ---
       01  WS-COUNTERS.
           05  WS-TRANS-READ       PIC 9(09) VALUE 0.
           05  WS-TRANS-PROCESSED  PIC 9(09) VALUE 0.
           05  WS-TRANS-ERRORS     PIC 9(09) VALUE 0.

      *--- Working Areas ---
       01  WS-WORK-AREAS.
           05  WS-CURRENT-DATE.
               10  WS-CURR-YYYY    PIC 9(04).
               10  WS-CURR-MM      PIC 9(02).
               10  WS-CURR-DD      PIC 9(02).

       PROCEDURE DIVISION.
      *================================================================
       0000-MAIN SECTION.
      *================================================================
           PERFORM 1000-INITIALIZE
           PERFORM 2000-PROCESS UNTIL END-OF-FILE
           PERFORM 9000-TERMINATE
           STOP RUN.

      *================================================================
       1000-INITIALIZE SECTION.
      *================================================================
           MOVE FUNCTION CURRENT-DATE(1:8) TO WS-CURRENT-DATE
           OPEN INPUT  TRANS-FILE
           OPEN I-O    MASTER-FILE
           OPEN OUTPUT REPORT-FILE
           OPEN OUTPUT ERROR-FILE

           IF WS-TRANS-STATUS NOT = "00"
               DISPLAY "ERROR OPENING TRANS-FILE: " WS-TRANS-STATUS
               MOVE 12 TO RETURN-CODE
               STOP RUN
           END-IF

           PERFORM 1100-READ-TRANS.

       1100-READ-TRANS.
           READ TRANS-FILE
               AT END
                   SET END-OF-FILE TO TRUE
               NOT AT END
                   ADD 1 TO WS-TRANS-READ
           END-READ.

      *================================================================
       2000-PROCESS SECTION.
      *================================================================
           SET NO-ERROR TO TRUE
           EVALUATE TRANS-TYPE
               WHEN "DP"
                   PERFORM 2100-PROCESS-DEPOSIT
               WHEN "WD"
                   PERFORM 2200-PROCESS-WITHDRAWAL
               WHEN "XF"
                   PERFORM 2300-PROCESS-TRANSFER
               WHEN OTHER
                   PERFORM 2900-HANDLE-INVALID-TYPE
           END-EVALUATE

           IF NO-ERROR
               ADD 1 TO WS-TRANS-PROCESSED
           ELSE
               ADD 1 TO WS-TRANS-ERRORS
           END-IF

           PERFORM 1100-READ-TRANS.

       2100-PROCESS-DEPOSIT.
           CONTINUE.

       2200-PROCESS-WITHDRAWAL.
           CONTINUE.

       2300-PROCESS-TRANSFER.
           CONTINUE.

       2900-HANDLE-INVALID-TYPE.
           SET ERROR-FOUND TO TRUE
           MOVE TRANS-RECORD TO ERROR-RECORD
           WRITE ERROR-RECORD.

      *================================================================
       9000-TERMINATE SECTION.
      *================================================================
           DISPLAY "RECORDS READ:      " WS-TRANS-READ
           DISPLAY "RECORDS PROCESSED: " WS-TRANS-PROCESSED
           DISPLAY "RECORDS IN ERROR:  " WS-TRANS-ERRORS

           CLOSE TRANS-FILE
                 MASTER-FILE
                 REPORT-FILE
                 ERROR-FILE

           IF WS-TRANS-ERRORS > 0
               MOVE 4 TO RETURN-CODE
           ELSE
               MOVE 0 TO RETURN-CODE
           END-IF.
```

---

## Key Parsing Considerations

### Column Positions (Traditional Fixed Format)

```
Columns 1-6:   Sequence numbers (ignored)
Column 7:      Indicator (* = comment, - = continuation, D = debug)
Columns 8-11:  Area A (divisions, sections, paragraphs, 01/77 levels)
Columns 12-72: Area B (statements, subordinate levels)
Columns 73-80: Identification (ignored)
```

### Free Format (COBOL 2002+)

```cobol
>>SOURCE FORMAT IS FREE
program-id. modern-program.
data division.
working-storage section.
01 my-variable pic x(10).
```

### Statement Terminators

- **Explicit**: Period (.) ends all statements
- **Scope Terminators**: END-IF, END-EVALUATE, END-PERFORM, END-READ, etc.
- Modern COBOL prefers scope terminators with single period at paragraph end

### Reserved Words to Track

COBOL has 300+ reserved words. Key categories:
- Division/Section names
- Verbs (MOVE, COMPUTE, PERFORM, etc.)
- Clauses (PIC, VALUE, OCCURS, etc.)
- Figurative constants (SPACES, ZEROS, HIGH-VALUES, LOW-VALUES)
