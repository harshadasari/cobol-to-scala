       IDENTIFICATION DIVISION.
       PROGRAM-ID. DEMOACCT.
      *****************************************************************
      * Demo program for the COBOL-to-Scala oracle-verified conversion
      * engine (see demo/README.md at the repo root).
      *
      * Deliberately small, but exercises several real-world-shaped
      * features in one program:
      *   - COPY (record layout lives in copybooks/CUSTOMER.cpy, exactly
      *     the "shared layout" shape virtually all production COBOL uses)
      *   - COMP-3 packed-decimal money fields (byte-level codec, not a
      *     display-string placeholder)
      *   - COMPUTE ROUNDED with a non-integer PIC V999 rate field
      *   - DISPLAY formatting of signed/edited numerics
      *
      * The engine's test suite (Thyraa-COBOL-main/backend/packages/
      * cobol-to-scala/tests/) verifies constructs like these against a
      * 48-program corpus and real GnuCOBOL output; this program is not
      * part of that corpus, it is a standalone, from-scratch example a
      * new reader can follow end-to-end.
      *****************************************************************
       DATA DIVISION.
       WORKING-STORAGE SECTION.
           COPY CUSTOMER.
       01  WS-INTEREST-RATE     PIC V999       VALUE 0.025.
       01  WS-INTEREST-AMT      PIC S9(7)V99   COMP-3.
       01  WS-NEW-BALANCE       PIC S9(7)V99   COMP-3.
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 10042 TO CUST-ID
           MOVE 'JANE DOE' TO CUST-NAME
           MOVE 1500.00 TO CUST-BALANCE

           COMPUTE WS-INTEREST-AMT ROUNDED =
               CUST-BALANCE * WS-INTEREST-RATE
           COMPUTE WS-NEW-BALANCE = CUST-BALANCE + WS-INTEREST-AMT

           DISPLAY 'CUSTOMER ID:      ' CUST-ID
           DISPLAY 'CUSTOMER NAME:    ' CUST-NAME
           DISPLAY 'STARTING BALANCE: ' CUST-BALANCE
           DISPLAY 'INTEREST EARNED:  ' WS-INTEREST-AMT
           DISPLAY 'NEW BALANCE:      ' WS-NEW-BALANCE

           STOP RUN.
