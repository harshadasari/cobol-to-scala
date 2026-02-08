# COBOL File Handling Reference

## Overview

COBOL has robust file handling built into the language. Understanding file organizations and I/O statements is essential for transpilation.

---

## File Organizations

### 1. Sequential Files

Records stored and accessed in order.

```cobol
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT TRANS-FILE
               ASSIGN TO TRANSIN
               ORGANIZATION IS SEQUENTIAL
               ACCESS MODE IS SEQUENTIAL
               FILE STATUS IS WS-TRANS-STATUS.

       DATA DIVISION.
       FILE SECTION.
       FD  TRANS-FILE
           RECORDING MODE IS F
           BLOCK CONTAINS 0 RECORDS
           RECORD CONTAINS 200 CHARACTERS.
       01  TRANS-RECORD.
           05  TRANS-TYPE      PIC X(02).
           05  TRANS-ACCOUNT   PIC 9(10).
           05  TRANS-AMOUNT    PIC S9(11)V99 COMP-3.
           05  TRANS-DATA      PIC X(181).
```

### 2. Indexed Files (VSAM KSDS)

Keyed access with primary and alternate keys.

```cobol
       FILE-CONTROL.
           SELECT ACCOUNT-MASTER
               ASSIGN TO ACCTMAST
               ORGANIZATION IS INDEXED
               ACCESS MODE IS DYNAMIC
               RECORD KEY IS AM-ACCOUNT-KEY
               ALTERNATE RECORD KEY IS AM-CUSTOMER-ID
                   WITH DUPLICATES
               ALTERNATE RECORD KEY IS AM-SSN
               FILE STATUS IS WS-ACCT-STATUS.

       FD  ACCOUNT-MASTER
           RECORD CONTAINS 500 CHARACTERS.
       01  ACCOUNT-RECORD.
           05  AM-ACCOUNT-KEY      PIC X(12).
           05  AM-CUSTOMER-ID      PIC 9(10).
           05  AM-SSN              PIC 9(09).
           05  AM-ACCOUNT-DATA     PIC X(469).
```

### 3. Relative Files (VSAM RRDS)

Access by relative record number.

```cobol
       FILE-CONTROL.
           SELECT DAILY-SLOTS
               ASSIGN TO DAYSLOTS
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-SLOT-NUMBER
               FILE STATUS IS WS-SLOT-STATUS.

       WORKING-STORAGE SECTION.
       01  WS-SLOT-NUMBER          PIC 9(08) COMP.
```

### 4. Line Sequential (Text Files)

For text files with line terminators.

```cobol
       FILE-CONTROL.
           SELECT REPORT-FILE
               ASSIGN TO RPTFILE
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-RPT-STATUS.

       FD  REPORT-FILE.
       01  REPORT-LINE             PIC X(132).
```

---

## FD (File Description) Entry

### Complete FD Syntax

```cobol
       FD  file-name
           [EXTERNAL | GLOBAL]
           [BLOCK CONTAINS integer-1 [TO integer-2]
               RECORDS | CHARACTERS]
           [RECORD CONTAINS integer-3 [TO integer-4] CHARACTERS]
           [RECORD IS VARYING IN SIZE
               FROM integer-5 TO integer-6 CHARACTERS
               DEPENDING ON data-name]
           [RECORDING MODE IS {F | V | U | S}]
           [LABEL RECORDS ARE {STANDARD | OMITTED}]
           [VALUE OF FILE-ID IS data-name | literal]
           [DATA RECORDS ARE record-name-1 [record-name-2]...]
           [LINAGE IS integer LINES
               WITH FOOTING AT integer
               LINES AT TOP integer
               LINES AT BOTTOM integer]
           [CODE-SET IS alphabet-name].

       01  record-description.
```

### FD Clauses Explained

| Clause | Purpose | Example |
|--------|---------|---------|
| BLOCK CONTAINS | Records per block | `BLOCK CONTAINS 0` (system decides) |
| RECORD CONTAINS | Fixed record length | `RECORD CONTAINS 200 CHARACTERS` |
| RECORD VARYING | Variable length | `RECORD VARYING 50 TO 500` |
| RECORDING MODE F | Fixed length | Standard batch files |
| RECORDING MODE V | Variable length | With RDW |
| RECORDING MODE U | Undefined | Load modules |
| RECORDING MODE S | Spanned | Very long records |

### Multiple Record Types

```cobol
       FD  TRANSACTION-FILE
           RECORD CONTAINS 100 TO 500 CHARACTERS.

       01  TRANS-HEADER-REC.
           05  TH-RECORD-TYPE      PIC X(02) VALUE "HD".
           05  TH-FILE-DATE        PIC 9(08).
           05  FILLER              PIC X(90).

       01  TRANS-DETAIL-REC.
           05  TD-RECORD-TYPE      PIC X(02) VALUE "DT".
           05  TD-ACCOUNT          PIC 9(10).
           05  TD-AMOUNT           PIC S9(11)V99 COMP-3.
           05  TD-DESCRIPTION      PIC X(80).
           05  FILLER              PIC X(400).

       01  TRANS-TRAILER-REC.
           05  TT-RECORD-TYPE      PIC X(02) VALUE "TR".
           05  TT-RECORD-COUNT     PIC 9(09).
           05  TT-TOTAL-AMOUNT     PIC S9(15)V99 COMP-3.
           05  FILLER              PIC X(80).
```

---

## File I/O Statements

### OPEN Statement

```cobol
      *--- Open modes ---
           OPEN INPUT file-name
           OPEN OUTPUT file-name
           OPEN I-O file-name
           OPEN EXTEND file-name

      *--- Multiple files ---
           OPEN INPUT  TRANS-FILE
                       LOOKUP-FILE
                OUTPUT REPORT-FILE
                       ERROR-FILE
                I-O    MASTER-FILE

      *--- Check file status after OPEN ---
           OPEN INPUT TRANS-FILE
           IF WS-TRANS-STATUS NOT = "00"
               DISPLAY "ERROR OPENING TRANS-FILE: " WS-TRANS-STATUS
               PERFORM 9000-ABORT
           END-IF
```

### CLOSE Statement

```cobol
           CLOSE file-name
           CLOSE file-name WITH LOCK
           CLOSE file-name WITH NO REWIND

      *--- Multiple files ---
           CLOSE TRANS-FILE
                 MASTER-FILE
                 REPORT-FILE
                 ERROR-FILE
```

### READ Statement (Sequential)

```cobol
      *--- Basic sequential read ---
           READ TRANS-FILE
               AT END
                   SET END-OF-FILE TO TRUE
               NOT AT END
                   ADD 1 TO WS-RECORD-COUNT
           END-READ

      *--- Read INTO (copies to working storage) ---
           READ TRANS-FILE INTO WS-TRANS-WORK
               AT END
                   SET END-OF-FILE TO TRUE
           END-READ

      *--- Read with INVALID KEY (for indexed files) ---
           READ MASTER-FILE
               INVALID KEY
                   SET RECORD-NOT-FOUND TO TRUE
               NOT INVALID KEY
                   PERFORM 2000-PROCESS-RECORD
           END-READ
```

### READ Statement (Random/Dynamic)

```cobol
      *--- Read by key (indexed file) ---
           MOVE "1234567890" TO AM-ACCOUNT-KEY
           READ ACCOUNT-MASTER
               INVALID KEY
                   PERFORM 2500-KEY-NOT-FOUND
               NOT INVALID KEY
                   PERFORM 2100-PROCESS-ACCOUNT
           END-READ

      *--- Read by alternate key ---
           MOVE WS-SEARCH-SSN TO AM-SSN
           READ ACCOUNT-MASTER KEY IS AM-SSN
               INVALID KEY
                   SET NOT-FOUND TO TRUE
           END-READ

      *--- Read next (sequential after random) ---
           READ ACCOUNT-MASTER NEXT
               AT END
                   SET END-OF-FILE TO TRUE
           END-READ

      *--- Read previous ---
           READ ACCOUNT-MASTER PREVIOUS
               AT END
                   SET BEGIN-OF-FILE TO TRUE
           END-READ
```

### WRITE Statement

```cobol
      *--- Sequential write ---
           WRITE REPORT-LINE

      *--- Write FROM (from working storage) ---
           WRITE REPORT-LINE FROM WS-DETAIL-LINE

      *--- Indexed file write ---
           WRITE ACCOUNT-RECORD
               INVALID KEY
                   PERFORM 2600-DUPLICATE-KEY
           END-WRITE

      *--- Write with ADVANCING (reports) ---
           WRITE REPORT-LINE AFTER ADVANCING 1 LINE
           WRITE REPORT-LINE AFTER ADVANCING 2 LINES
           WRITE REPORT-LINE AFTER ADVANCING PAGE
           WRITE REPORT-LINE BEFORE ADVANCING 1 LINE
```

### REWRITE Statement

```cobol
      *--- Update record (requires prior READ) ---
           READ MASTER-FILE
               INVALID KEY
                   SET NOT-FOUND TO TRUE
           END-READ

           IF FOUND
               MOVE WS-NEW-BALANCE TO MR-BALANCE
               MOVE WS-CURRENT-DATE TO MR-LAST-UPDATE
               REWRITE MASTER-RECORD
                   INVALID KEY
                       PERFORM 2700-REWRITE-ERROR
               END-REWRITE
           END-IF
```

### DELETE Statement

```cobol
      *--- Delete record (requires prior READ for sequential) ---
           READ MASTER-FILE
           DELETE MASTER-FILE
               INVALID KEY
                   PERFORM 2800-DELETE-ERROR
           END-DELETE

      *--- Delete by key (random access) ---
           MOVE "1234567890" TO MR-KEY
           DELETE MASTER-FILE
               INVALID KEY
                   SET NOT-FOUND TO TRUE
           END-DELETE
```

### START Statement (Positioning)

```cobol
      *--- Position for sequential reading from a point ---
           MOVE "5000000000" TO AM-ACCOUNT-KEY
           START ACCOUNT-MASTER KEY >= AM-ACCOUNT-KEY
               INVALID KEY
                   SET NOT-FOUND TO TRUE
               NOT INVALID KEY
                   PERFORM 2000-READ-SEQUENTIAL
           END-START

      *--- Start with alternate key ---
           START ACCOUNT-MASTER KEY >= AM-SSN
               INVALID KEY
                   PERFORM 2900-KEY-NOT-FOUND
           END-START
```

---

## Complete File Processing Examples

### Example 1: Sequential File Processing

```cobol
       IDENTIFICATION DIVISION.
       PROGRAM-ID. SEQPROC.

       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT INPUT-FILE ASSIGN TO INFILE
               FILE STATUS IS WS-IN-STATUS.
           SELECT OUTPUT-FILE ASSIGN TO OUTFILE
               FILE STATUS IS WS-OUT-STATUS.
           SELECT ERROR-FILE ASSIGN TO ERRFILE
               FILE STATUS IS WS-ERR-STATUS.

       DATA DIVISION.
       FILE SECTION.
       FD  INPUT-FILE
           RECORDING MODE IS F
           RECORD CONTAINS 200 CHARACTERS.
       01  INPUT-RECORD            PIC X(200).

       FD  OUTPUT-FILE
           RECORDING MODE IS F
           RECORD CONTAINS 200 CHARACTERS.
       01  OUTPUT-RECORD           PIC X(200).

       FD  ERROR-FILE
           RECORDING MODE IS F
           RECORD CONTAINS 250 CHARACTERS.
       01  ERROR-RECORD            PIC X(250).

       WORKING-STORAGE SECTION.
       01  WS-FILE-STATUS.
           05  WS-IN-STATUS        PIC XX.
           05  WS-OUT-STATUS       PIC XX.
           05  WS-ERR-STATUS       PIC XX.

       01  WS-FLAGS.
           05  WS-EOF              PIC X VALUE "N".
               88  END-OF-FILE         VALUE "Y".

       01  WS-COUNTERS.
           05  WS-READ-CNT         PIC 9(09) VALUE 0.
           05  WS-WRITE-CNT        PIC 9(09) VALUE 0.
           05  WS-ERROR-CNT        PIC 9(09) VALUE 0.

       PROCEDURE DIVISION.
       0000-MAIN.
           PERFORM 1000-OPEN-FILES
           PERFORM 1100-READ-INPUT
           PERFORM 2000-PROCESS UNTIL END-OF-FILE
           PERFORM 9000-CLOSE-FILES
           STOP RUN.

       1000-OPEN-FILES.
           OPEN INPUT  INPUT-FILE
           OPEN OUTPUT OUTPUT-FILE
                       ERROR-FILE
           IF WS-IN-STATUS NOT = "00"
               DISPLAY "OPEN ERROR INPUT: " WS-IN-STATUS
               MOVE 16 TO RETURN-CODE
               STOP RUN
           END-IF.

       1100-READ-INPUT.
           READ INPUT-FILE
               AT END
                   SET END-OF-FILE TO TRUE
               NOT AT END
                   ADD 1 TO WS-READ-CNT
           END-READ.

       2000-PROCESS.
           EVALUATE TRUE
               WHEN INPUT-RECORD(1:2) = "VL"
                   PERFORM 2100-VALID-RECORD
               WHEN OTHER
                   PERFORM 2200-ERROR-RECORD
           END-EVALUATE
           PERFORM 1100-READ-INPUT.

       2100-VALID-RECORD.
           WRITE OUTPUT-RECORD FROM INPUT-RECORD
           ADD 1 TO WS-WRITE-CNT.

       2200-ERROR-RECORD.
           MOVE INPUT-RECORD TO ERROR-RECORD(1:200)
           MOVE "INVALID TYPE" TO ERROR-RECORD(201:50)
           WRITE ERROR-RECORD
           ADD 1 TO WS-ERROR-CNT.

       9000-CLOSE-FILES.
           DISPLAY "RECORDS READ:    " WS-READ-CNT
           DISPLAY "RECORDS WRITTEN: " WS-WRITE-CNT
           DISPLAY "RECORDS ERRORS:  " WS-ERROR-CNT
           CLOSE INPUT-FILE OUTPUT-FILE ERROR-FILE.
```

### Example 2: Indexed File Master Update

```cobol
       IDENTIFICATION DIVISION.
       PROGRAM-ID. MASTUPD.

       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT TRANS-FILE ASSIGN TO TRANSIN
               FILE STATUS IS WS-TRANS-ST.

           SELECT MASTER-FILE ASSIGN TO MASTFILE
               ORGANIZATION IS INDEXED
               ACCESS MODE IS DYNAMIC
               RECORD KEY IS MAST-KEY
               FILE STATUS IS WS-MAST-ST.

       DATA DIVISION.
       FILE SECTION.
       FD  TRANS-FILE
           RECORD CONTAINS 100 CHARACTERS.
       01  TRANS-RECORD.
           05  TR-TYPE             PIC X(01).
               88  TR-ADD              VALUE "A".
               88  TR-UPDATE           VALUE "U".
               88  TR-DELETE           VALUE "D".
           05  TR-KEY              PIC X(10).
           05  TR-DATA             PIC X(89).

       FD  MASTER-FILE
           RECORD CONTAINS 500 CHARACTERS.
       01  MASTER-RECORD.
           05  MAST-KEY            PIC X(10).
           05  MAST-DATA           PIC X(490).

       WORKING-STORAGE SECTION.
       01  WS-FILE-STATUS.
           05  WS-TRANS-ST         PIC XX.
           05  WS-MAST-ST          PIC XX.

       01  WS-EOF                  PIC X VALUE "N".
           88  END-OF-TRANS            VALUE "Y".

       01  WS-COUNTERS.
           05  WS-ADDS             PIC 9(07) VALUE 0.
           05  WS-UPDATES          PIC 9(07) VALUE 0.
           05  WS-DELETES          PIC 9(07) VALUE 0.
           05  WS-ERRORS           PIC 9(07) VALUE 0.

       PROCEDURE DIVISION.
       0000-MAIN.
           OPEN INPUT TRANS-FILE
           OPEN I-O   MASTER-FILE
           PERFORM 1000-READ-TRANS
           PERFORM 2000-PROCESS UNTIL END-OF-TRANS
           CLOSE TRANS-FILE MASTER-FILE
           PERFORM 9000-DISPLAY-STATS
           STOP RUN.

       1000-READ-TRANS.
           READ TRANS-FILE
               AT END SET END-OF-TRANS TO TRUE
           END-READ.

       2000-PROCESS.
           EVALUATE TRUE
               WHEN TR-ADD
                   PERFORM 2100-ADD-RECORD
               WHEN TR-UPDATE
                   PERFORM 2200-UPDATE-RECORD
               WHEN TR-DELETE
                   PERFORM 2300-DELETE-RECORD
               WHEN OTHER
                   ADD 1 TO WS-ERRORS
           END-EVALUATE
           PERFORM 1000-READ-TRANS.

       2100-ADD-RECORD.
           MOVE TR-KEY TO MAST-KEY
           MOVE TR-DATA TO MAST-DATA(1:89)
           WRITE MASTER-RECORD
               INVALID KEY
                   ADD 1 TO WS-ERRORS
               NOT INVALID KEY
                   ADD 1 TO WS-ADDS
           END-WRITE.

       2200-UPDATE-RECORD.
           MOVE TR-KEY TO MAST-KEY
           READ MASTER-FILE
               INVALID KEY
                   ADD 1 TO WS-ERRORS
               NOT INVALID KEY
                   MOVE TR-DATA TO MAST-DATA(1:89)
                   REWRITE MASTER-RECORD
                   ADD 1 TO WS-UPDATES
           END-READ.

       2300-DELETE-RECORD.
           MOVE TR-KEY TO MAST-KEY
           DELETE MASTER-FILE
               INVALID KEY
                   ADD 1 TO WS-ERRORS
               NOT INVALID KEY
                   ADD 1 TO WS-DELETES
           END-DELETE.

       9000-DISPLAY-STATS.
           DISPLAY "ADDS:    " WS-ADDS
           DISPLAY "UPDATES: " WS-UPDATES
           DISPLAY "DELETES: " WS-DELETES
           DISPLAY "ERRORS:  " WS-ERRORS.
```

---

## File Status Codes Reference

### Standard File Status Codes

| Code | Category | Meaning |
|------|----------|---------|
| 00 | Success | Operation successful |
| 02 | Success | Duplicate alternate key |
| 04 | Success | Record length mismatch |
| 05 | Success | Optional file not present (OPEN) |
| 07 | Success | Non-reel media close |
| 10 | End | End of file on READ |
| 14 | End | Relative record number too large |
| 21 | Invalid Key | Sequence error |
| 22 | Invalid Key | Duplicate primary key |
| 23 | Invalid Key | Record not found |
| 24 | Invalid Key | Boundary violation |
| 30 | Permanent | I/O error |
| 34 | Permanent | Boundary violation (sequential) |
| 35 | Permanent | File not found |
| 37 | Permanent | Open mode not supported |
| 38 | Permanent | File locked |
| 39 | Permanent | Attribute conflict |
| 41 | Logic | File already open |
| 42 | Logic | File not open |
| 43 | Logic | No READ before REWRITE/DELETE |
| 44 | Logic | Record length error |
| 46 | Logic | No valid next record |
| 47 | Logic | READ not permitted |
| 48 | Logic | WRITE not permitted |
| 49 | Logic | REWRITE/DELETE not permitted |

### Extended VSAM Codes (IBM)

The second two characters of a VSAM extended status:

```
First char = x'9' indicates VSAM-specific
Second two chars:
  00 = No error
  04 = Read past end of file
  08 = Duplicate key
  0C = Out of sequence
  10 = Record not found
  14 = Record already exists
  18 = File not found
  ...
```

---

## Transpiler Considerations

### File Mapping to Scala

| COBOL | Scala Consideration |
|-------|---------------------|
| Sequential file | Iterator, Stream, BufferedReader |
| Indexed file | Map/TreeMap with persistence layer |
| Relative file | Array with index |
| File status | Either[FileError, Result] |
| BLOCK CONTAINS | Buffer size |
| RECORDING MODE V | Record length prefix |

### State Management

```
COBOL maintains implicit state:
- Current record position
- Current record content
- Lock status
- Read/write mode

Transpilation must make this explicit in Scala.
```

### Error Handling Pattern

```scala
// Potential Scala pattern
sealed trait FileStatus
case object Success extends FileStatus
case object EndOfFile extends FileStatus
case class InvalidKey(code: String) extends FileStatus
case class IOError(code: String, message: String) extends FileStatus

def readRecord(): Either[FileStatus, Record] = ...
```
