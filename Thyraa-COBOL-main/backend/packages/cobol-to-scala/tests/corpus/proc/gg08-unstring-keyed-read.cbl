      * gg08: fresh combination - UNSTRING applied to a field that was
      * fetched via a KEYED (RANDOM access) RELATIVE-file READ, rather
      * than from a literal or a plain sequentially-read field. Checks
      * that a record's delimited-text field, addressed by RELATIVE KEY,
      * round-trips correctly through UNSTRING once it's in the FD record
      * area (this exercises the keyed READ codegen path, generateKeyedReadStatement,
      * feeding directly into UNSTRING's own tokenizer).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. GG08UNSRD.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "GG08REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-TEXT    PIC X(15).
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       01  WS-F1           PIC X(5).
       01  WS-F2           PIC X(5).
       01  WS-F3           PIC X(5).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO WS-RKEY.
           MOVE "AAA,BB,C" TO REC-TEXT.
           WRITE REL-REC.
           DISPLAY "WRITE1 ST=" WS-STATUS.

           MOVE 2 TO WS-RKEY.
           MOVE "XX,YYYY,Z" TO REC-TEXT.
           WRITE REL-REC.
           DISPLAY "WRITE2 ST=" WS-STATUS.
           CLOSE REL-FILE.

           OPEN I-O REL-FILE.
           MOVE 2 TO WS-RKEY.
           READ REL-FILE.
           DISPLAY "READ ST=" WS-STATUS " TEXT=[" REC-TEXT "]".

           MOVE SPACES TO WS-F1.
           MOVE SPACES TO WS-F2.
           MOVE SPACES TO WS-F3.
           UNSTRING REC-TEXT DELIMITED BY ","
               INTO WS-F1, WS-F2, WS-F3
           END-UNSTRING.
           DISPLAY "UNSTRING-KEY2 F1=[" WS-F1 "] F2=[" WS-F2
               "] F3=[" WS-F3 "]".

           MOVE 1 TO WS-RKEY.
           READ REL-FILE.
           DISPLAY "READ ST=" WS-STATUS " TEXT=[" REC-TEXT "]".

           MOVE SPACES TO WS-F1.
           MOVE SPACES TO WS-F2.
           MOVE SPACES TO WS-F3.
           UNSTRING REC-TEXT DELIMITED BY ","
               INTO WS-F1, WS-F2, WS-F3
           END-UNSTRING.
           DISPLAY "UNSTRING-KEY1 F1=[" WS-F1 "] F2=[" WS-F2
               "] F3=[" WS-F3 "]".

           CLOSE REL-FILE.
           STOP RUN.
