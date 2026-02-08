# COBOL Copybooks Reference

## What Are Copybooks?

Copybooks are reusable code fragments stored in separate files and included at compile time. They are COBOL's equivalent of header files or includes.

### Key Characteristics

- **File Extension**: Usually `.cpy`, `.cbl`, `.copy`, or no extension
- **Location**: Stored in copybook libraries (PDS on mainframe, directories elsewhere)
- **Inclusion**: Via COPY statement
- **Processing**: Text substitution at compile time (preprocessor)

---

## COPY Statement Syntax

### Basic COPY

```cobol
       COPY copybook-name.

      *Examples:
       COPY CUSTMAST.
       COPY TRANREC.
       COPY WSCOMMON.
```

### COPY with Library

```cobol
       COPY copybook-name OF library-name.
       COPY copybook-name IN library-name.

      *Examples:
       COPY CUSTMAST OF COPYLIB.
       COPY TRANREC IN PRODCOPY.
```

### COPY with REPLACING

```cobol
       COPY copybook-name REPLACING
           ==original-text== BY ==replacement-text==
           identifier-1 BY identifier-2.

      *Examples:
       COPY ACCOUNT REPLACING
           ==:PREFIX:== BY ==WS-==
           ==:TAG:== BY ==ACCT==.

       COPY DATEUTIL REPLACING
           WS-DATE BY WS-TRANS-DATE
           WS-YEAR BY WS-TRANS-YEAR.
```

---

## Common Copybook Patterns

### Pattern 1: Record Layout Copybook

**CUSTMAST.cpy** - Customer Master File Layout

```cobol
      *================================================================
      * COPYBOOK: CUSTMAST
      * PURPOSE:  CUSTOMER MASTER FILE RECORD LAYOUT
      * USED BY:  CUST0100, CUST0200, CUST0300, BATCH001
      * UPDATED:  2024-01-15
      *================================================================
       01  CUSTOMER-MASTER-RECORD.
           05  CM-KEY.
               10  CM-REGION-CODE      PIC X(02).
               10  CM-CUSTOMER-ID      PIC 9(10).
           05  CM-PERSONAL-INFO.
               10  CM-LAST-NAME        PIC X(30).
               10  CM-FIRST-NAME       PIC X(20).
               10  CM-MIDDLE-INIT      PIC X(01).
               10  CM-NAME-SUFFIX      PIC X(04).
               10  CM-SSN              PIC 9(09).
               10  CM-DOB              PIC 9(08).
               10  CM-GENDER           PIC X(01).
                   88  CM-MALE             VALUE "M".
                   88  CM-FEMALE           VALUE "F".
                   88  CM-OTHER            VALUE "O".
           05  CM-CONTACT-INFO.
               10  CM-ADDRESS-LINE-1   PIC X(40).
               10  CM-ADDRESS-LINE-2   PIC X(40).
               10  CM-CITY             PIC X(30).
               10  CM-STATE            PIC X(02).
               10  CM-ZIP-CODE         PIC X(10).
               10  CM-COUNTRY          PIC X(03).
               10  CM-HOME-PHONE       PIC X(15).
               10  CM-WORK-PHONE       PIC X(15).
               10  CM-MOBILE-PHONE     PIC X(15).
               10  CM-EMAIL            PIC X(60).
           05  CM-ACCOUNT-INFO.
               10  CM-CUSTOMER-TYPE    PIC X(02).
                   88  CM-RETAIL           VALUE "RT".
                   88  CM-COMMERCIAL       VALUE "CM".
                   88  CM-PRIVATE-BANK     VALUE "PB".
               10  CM-OPEN-DATE        PIC 9(08).
               10  CM-STATUS           PIC X(01).
                   88  CM-ACTIVE           VALUE "A".
                   88  CM-INACTIVE         VALUE "I".
                   88  CM-CLOSED           VALUE "C".
               10  CM-CREDIT-SCORE     PIC 9(03).
               10  CM-RISK-RATING      PIC X(01).
               10  CM-RELATIONSHIP-MGR PIC X(08).
           05  CM-TIMESTAMPS.
               10  CM-CREATE-TIMESTAMP PIC X(26).
               10  CM-UPDATE-TIMESTAMP PIC X(26).
           05  FILLER                  PIC X(50).
```

### Pattern 2: Working Storage Copybook

**WSCOMMON.cpy** - Common Working Storage Items

```cobol
      *================================================================
      * COPYBOOK: WSCOMMON
      * PURPOSE:  COMMON WORKING STORAGE DEFINITIONS
      *================================================================
      *--- FILE STATUS AREAS ---
       01  WS-FILE-STATUS-AREA.
           05  WS-FS-INPUT             PIC XX VALUE SPACES.
           05  WS-FS-OUTPUT            PIC XX VALUE SPACES.
           05  WS-FS-MASTER            PIC XX VALUE SPACES.
           05  WS-FS-REPORT            PIC XX VALUE SPACES.
           05  WS-FS-ERROR             PIC XX VALUE SPACES.

      *--- COMMON FLAGS ---
       01  WS-FLAGS.
           05  WS-EOF-FLAG             PIC X(01) VALUE "N".
               88  END-OF-FILE             VALUE "Y".
               88  NOT-END-OF-FILE         VALUE "N".
           05  WS-ERROR-FLAG           PIC X(01) VALUE "N".
               88  ERRORS-FOUND            VALUE "Y".
               88  NO-ERRORS               VALUE "N".
           05  WS-FIRST-TIME           PIC X(01) VALUE "Y".
               88  IS-FIRST-TIME           VALUE "Y".
               88  NOT-FIRST-TIME          VALUE "N".

      *--- COMMON COUNTERS ---
       01  WS-COUNTERS.
           05  WS-RECORDS-READ         PIC 9(09) COMP VALUE 0.
           05  WS-RECORDS-WRITTEN      PIC 9(09) COMP VALUE 0.
           05  WS-RECORDS-UPDATED      PIC 9(09) COMP VALUE 0.
           05  WS-RECORDS-DELETED      PIC 9(09) COMP VALUE 0.
           05  WS-RECORDS-ERRORS       PIC 9(09) COMP VALUE 0.

      *--- DATE/TIME WORK AREAS ---
       01  WS-DATE-TIME-AREAS.
           05  WS-CURRENT-DATE.
               10  WS-CURR-YYYY        PIC 9(04).
               10  WS-CURR-MM          PIC 9(02).
               10  WS-CURR-DD          PIC 9(02).
           05  WS-CURRENT-DATE-N REDEFINES WS-CURRENT-DATE
                                       PIC 9(08).
           05  WS-CURRENT-TIME.
               10  WS-CURR-HH          PIC 9(02).
               10  WS-CURR-MI          PIC 9(02).
               10  WS-CURR-SS          PIC 9(02).
               10  WS-CURR-HS          PIC 9(02).

      *--- RETURN CODES ---
       01  WS-RETURN-CODES.
           05  WS-RETURN-CODE          PIC S9(04) COMP VALUE 0.
           05  WS-ABEND-CODE           PIC X(04) VALUE SPACES.
           05  WS-SQL-CODE             PIC S9(09) COMP VALUE 0.
```

### Pattern 3: Parameterized Copybook (with REPLACING)

**DTLLINE.cpy** - Detail Line Template

```cobol
      *================================================================
      * COPYBOOK: DTLLINE
      * PURPOSE:  REPORT DETAIL LINE TEMPLATE
      * USAGE:    COPY DTLLINE REPLACING ==:PFX:== BY ==RPT-==.
      *================================================================
       01  :PFX:DETAIL-LINE.
           05  FILLER                  PIC X(01) VALUE SPACE.
           05  :PFX:ACCOUNT-NO         PIC X(12).
           05  FILLER                  PIC X(02) VALUE SPACES.
           05  :PFX:CUSTOMER-NAME      PIC X(30).
           05  FILLER                  PIC X(02) VALUE SPACES.
           05  :PFX:BALANCE            PIC $$$,$$$,$$9.99-.
           05  FILLER                  PIC X(02) VALUE SPACES.
           05  :PFX:STATUS             PIC X(08).
           05  FILLER                  PIC X(02) VALUE SPACES.
           05  :PFX:LAST-ACTIVITY      PIC X(10).
           05  FILLER                  PIC X(47) VALUE SPACES.
```

**Usage in program:**

```cobol
       COPY DTLLINE REPLACING ==:PFX:== BY ==RPT-==.
       COPY DTLLINE REPLACING ==:PFX:== BY ==HDR-==.
```

### Pattern 4: SQLCA Copybook (DB2)

**SQLCA.cpy** - SQL Communication Area

```cobol
      *================================================================
      * SQL COMMUNICATION AREA
      *================================================================
       01  SQLCA.
           05  SQLCAID        PIC X(8) VALUE "SQLCA   ".
           05  SQLCABC        PIC S9(9) COMP-5 VALUE 136.
           05  SQLCODE        PIC S9(9) COMP-5 VALUE 0.
           05  SQLERRM.
               49 SQLERRML    PIC S9(4) COMP-5.
               49 SQLERRMC    PIC X(70).
           05  SQLERRP        PIC X(8).
           05  SQLERRD OCCURS 6 TIMES PIC S9(9) COMP-5.
           05  SQLWARN.
               10 SQLWARN0    PIC X.
               10 SQLWARN1    PIC X.
               10 SQLWARN2    PIC X.
               10 SQLWARN3    PIC X.
               10 SQLWARN4    PIC X.
               10 SQLWARN5    PIC X.
               10 SQLWARN6    PIC X.
               10 SQLWARN7    PIC X.
               10 SQLWARN8    PIC X.
               10 SQLWARN9    PIC X.
               10 SQLWARNA    PIC X.
           05  SQLSTATE       PIC X(5).
```

### Pattern 5: DCLGEN Copybook (DB2 Table Declaration)

**DCLACCT.cpy** - Generated from DB2 Table

```cobol
      *================================================================
      * DCLGEN TABLE(BANKDB.ACCOUNTS)
      *        LIBRARY(COPYLIB.DCLGEN)
      *        LANGUAGE(COBOL)
      *        STRUCTURE(DCL-ACCOUNTS)
      *================================================================
           EXEC SQL DECLARE BANKDB.ACCOUNTS TABLE
           ( ACCOUNT_ID              CHAR(12) NOT NULL,
             CUSTOMER_ID             DECIMAL(10, 0) NOT NULL,
             ACCOUNT_TYPE            CHAR(2) NOT NULL,
             ACCOUNT_STATUS          CHAR(1) NOT NULL,
             CURRENT_BALANCE         DECIMAL(13, 2) NOT NULL,
             AVAILABLE_BALANCE       DECIMAL(13, 2) NOT NULL,
             OPEN_DATE               DATE NOT NULL,
             CLOSE_DATE              DATE,
             LAST_ACTIVITY_DATE      DATE,
             INTEREST_RATE           DECIMAL(5, 4),
             OVERDRAFT_LIMIT         DECIMAL(11, 2),
             CREATE_TIMESTAMP        TIMESTAMP NOT NULL,
             UPDATE_TIMESTAMP        TIMESTAMP NOT NULL
           ) END-EXEC.

      *--- COBOL DECLARATION FOR TABLE BANKDB.ACCOUNTS ---
       01  DCL-ACCOUNTS.
           10 DCL-ACCOUNT-ID          PIC X(12).
           10 DCL-CUSTOMER-ID         PIC S9(10) COMP-3.
           10 DCL-ACCOUNT-TYPE        PIC X(2).
           10 DCL-ACCOUNT-STATUS      PIC X(1).
           10 DCL-CURRENT-BALANCE     PIC S9(11)V9(2) COMP-3.
           10 DCL-AVAILABLE-BALANCE   PIC S9(11)V9(2) COMP-3.
           10 DCL-OPEN-DATE           PIC X(10).
           10 DCL-CLOSE-DATE          PIC X(10).
           10 DCL-LAST-ACTIVITY-DATE  PIC X(10).
           10 DCL-INTEREST-RATE       PIC S9(1)V9(4) COMP-3.
           10 DCL-OVERDRAFT-LIMIT     PIC S9(9)V9(2) COMP-3.
           10 DCL-CREATE-TIMESTAMP    PIC X(26).
           10 DCL-UPDATE-TIMESTAMP    PIC X(26).

      *--- INDICATOR VARIABLES ---
       01  DCL-ACCOUNTS-IND.
           10 DCL-ACCOUNT-ID-I        PIC S9(4) COMP.
           10 DCL-CUSTOMER-ID-I       PIC S9(4) COMP.
           10 DCL-ACCOUNT-TYPE-I      PIC S9(4) COMP.
           10 DCL-ACCOUNT-STATUS-I    PIC S9(4) COMP.
           10 DCL-CURRENT-BALANCE-I   PIC S9(4) COMP.
           10 DCL-AVAILABLE-BALANCE-I PIC S9(4) COMP.
           10 DCL-OPEN-DATE-I         PIC S9(4) COMP.
           10 DCL-CLOSE-DATE-I        PIC S9(4) COMP.
           10 DCL-LAST-ACTIVITY-I     PIC S9(4) COMP.
           10 DCL-INTEREST-RATE-I     PIC S9(4) COMP.
           10 DCL-OVERDRAFT-LIMIT-I   PIC S9(4) COMP.
           10 DCL-CREATE-TIMESTAMP-I  PIC S9(4) COMP.
           10 DCL-UPDATE-TIMESTAMP-I  PIC S9(4) COMP.
```

### Pattern 6: CICS Communication Area

**DFHAID.cpy** - Attention Identifier Constants

```cobol
      *================================================================
      * DFHAID - ATTENTION IDENTIFIER BYTE
      *================================================================
       01  DFHAID.
           02  DFHNULL   PIC X VALUE IS ' '.
           02  DFHENTER  PIC X VALUE IS QUOTE.
           02  DFHCLEAR  PIC X VALUE IS '_'.
           02  DFHCLRP   PIC X VALUE IS '.'.
           02  DFHPEN    PIC X VALUE IS '='.
           02  DFHOPID   PIC X VALUE IS 'W'.
           02  DFHMSRE   PIC X VALUE IS 'X'.
           02  DFHSTRF   PIC X VALUE IS 'h'.
           02  DFHTRIG   PIC X VALUE IS '"'.
           02  DFHPA1    PIC X VALUE IS '%'.
           02  DFHPA2    PIC X VALUE IS '>'.
           02  DFHPA3    PIC X VALUE IS ','.
           02  DFHPF1    PIC X VALUE IS '1'.
           02  DFHPF2    PIC X VALUE IS '2'.
           02  DFHPF3    PIC X VALUE IS '3'.
           02  DFHPF4    PIC X VALUE IS '4'.
           02  DFHPF5    PIC X VALUE IS '5'.
           02  DFHPF6    PIC X VALUE IS '6'.
           02  DFHPF7    PIC X VALUE IS '7'.
           02  DFHPF8    PIC X VALUE IS '8'.
           02  DFHPF9    PIC X VALUE IS '9'.
           02  DFHPF10   PIC X VALUE IS ':'.
           02  DFHPF11   PIC X VALUE IS '#'.
           02  DFHPF12   PIC X VALUE IS '@'.
           02  DFHPF13   PIC X VALUE IS 'A'.
           02  DFHPF14   PIC X VALUE IS 'B'.
           02  DFHPF15   PIC X VALUE IS 'C'.
           02  DFHPF16   PIC X VALUE IS 'D'.
           02  DFHPF17   PIC X VALUE IS 'E'.
           02  DFHPF18   PIC X VALUE IS 'F'.
           02  DFHPF19   PIC X VALUE IS 'G'.
           02  DFHPF20   PIC X VALUE IS 'H'.
           02  DFHPF21   PIC X VALUE IS 'I'.
           02  DFHPF22   PIC X VALUE IS '['.
           02  DFHPF23   PIC X VALUE IS '.'.
           02  DFHPF24   PIC X VALUE IS '<'.
```

---

## Transpiler Considerations for Copybooks

### 1. Resolution Strategy

```
1. Parse COPY statement
2. Locate copybook file in library paths
3. Apply REPLACING substitutions (text-based)
4. Inline the result into the AST
5. Continue parsing
```

### 2. Handling REPLACING

REPLACING is a **text substitution**, not AST manipulation:

```cobol
       COPY RECORD REPLACING ==WS-== BY ==TX-==.
```

This replaces all occurrences of "WS-" with "TX-" in the copybook text before parsing.

### 3. Pseudo-Text Delimiters

Text between `==` and `==` is pseudo-text:

```cobol
       COPY LAYOUT REPLACING
           ==ACCOUNT-RECORD== BY ==SAVINGS-ACCOUNT==
           ==PIC X(10)== BY ==PIC X(20)==
           ==05== BY ==10==.
```

### 4. Circular Reference Detection

Copybooks can COPY other copybooks. Detect cycles:

```
A.cpy -> COPY B -> B.cpy -> COPY C -> C.cpy -> COPY A (ERROR!)
```

### 5. Copybook Dependency Graph

Build a dependency graph for:
- Incremental compilation
- Impact analysis
- Understanding program structure

```
Program BATCH001
    ├── COPY WSCOMMON
    ├── COPY CUSTMAST
    │   └── COPY DTEUTIL
    ├── COPY TRANREC
    └── COPY SQLCA
```

### 6. Multiple Inclusion

Same copybook may be included multiple times with different REPLACING:

```cobol
       COPY AMOUNT-FIELD REPLACING ==:NAME:== BY ==DEBIT==.
       COPY AMOUNT-FIELD REPLACING ==:NAME:== BY ==CREDIT==.
       COPY AMOUNT-FIELD REPLACING ==:NAME:== BY ==TOTAL==.
```

### 7. COPY in Different Divisions

COPY can appear in any division:

```cobol
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           COPY FILESEL.              *> File SELECT statements

       DATA DIVISION.
       FILE SECTION.
           COPY FDREC.                *> FD and record layouts

       WORKING-STORAGE SECTION.
           COPY WSCOMMON.             *> Working storage

       LINKAGE SECTION.
           COPY LKPARMS.              *> Linkage parameters

       PROCEDURE DIVISION.
           COPY INITPROC.             *> Initialization code
           PERFORM 1000-PROCESS.
           COPY TERMPROC.             *> Termination code
```

---

## Enterprise Copybook Organization

### Typical Library Structure

```
COPYLIB (Production copybooks)
├── FILE-LAYOUTS/
│   ├── CUSTMAST.cpy
│   ├── ACCTMAST.cpy
│   ├── TRANFILE.cpy
│   └── POLMAST.cpy
├── WORKING-STORAGE/
│   ├── WSCOMMON.cpy
│   ├── WSDATE.cpy
│   ├── WSERROR.cpy
│   └── WSFLAGS.cpy
├── DB2-DCLGEN/
│   ├── DCLCUST.cpy
│   ├── DCLACCT.cpy
│   └── DCLTRAN.cpy
├── CICS/
│   ├── DFHAID.cpy
│   ├── DFHBMSCA.cpy
│   └── MAPSETS/
├── REPORT-LINES/
│   ├── RPTHDRS.cpy
│   ├── RPTDTL.cpy
│   └── RPTFTRS.cpy
└── COMMON/
    ├── SQLCA.cpy
    ├── ERRCODES.cpy
    └── LITERALS.cpy
```

### Naming Conventions

| Prefix | Meaning | Example |
|--------|---------|---------|
| DCL | DCLGEN (DB2) | DCLCUST |
| FD | File Description | FDTRANS |
| WS | Working Storage | WSCOMM |
| LK | Linkage Section | LKPARM |
| RP | Report Lines | RPTHDR |
| MP | Map (CICS BMS) | MPINQ01 |
