      * nn06 (round 38): MERGE with TWO keys, mixed ASCENDING/DESCENDING -
      * every prior MERGE corpus program (g12/h05/i06/j02/dd03) uses exactly
      * ONE ascending key; this probes generateMerge's multi-key comparator
      * codegen (shared with SORT's, per its own doc comment) for the
      * mixed-direction case specifically in the MERGE (not SORT) statement.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. NN06MERGE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT MERGE-FILE ASSIGN TO "NN06MERGEWORK".
           SELECT IN-FILE-1 ASSIGN TO "NN06IN1"
               ORGANIZATION IS LINE SEQUENTIAL.
           SELECT IN-FILE-2 ASSIGN TO "NN06IN2"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       SD  MERGE-FILE.
       01  MERGE-REC.
           05  M-KEY1  PIC 9(2).
           05  M-KEY2  PIC 9(2).
           05  M-VAL   PIC X(5).
       FD  IN-FILE-1.
       01  IN-REC-1.
           05  I1-KEY1 PIC 9(2).
           05  I1-KEY2 PIC 9(2).
           05  I1-VAL  PIC X(5).
       FD  IN-FILE-2.
       01  IN-REC-2.
           05  I2-KEY1 PIC 9(2).
           05  I2-KEY2 PIC 9(2).
           05  I2-VAL  PIC X(5).
       WORKING-STORAGE SECTION.
       01  WS-EOF PIC X VALUE "N".
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT IN-FILE-1.
           WRITE IN-REC-1 FROM "1005AAAAA".
           WRITE IN-REC-1 FROM "1001BBBBB".
           WRITE IN-REC-1 FROM "2003CCCCC".
           CLOSE IN-FILE-1.
           OPEN OUTPUT IN-FILE-2.
           WRITE IN-REC-2 FROM "1009DDDDD".
           WRITE IN-REC-2 FROM "2007EEEEE".
           WRITE IN-REC-2 FROM "0501FFFFF".
           CLOSE IN-FILE-2.
           MERGE MERGE-FILE
               ASCENDING KEY M-KEY1
               DESCENDING KEY M-KEY2
               USING IN-FILE-1 IN-FILE-2
               OUTPUT PROCEDURE IS EMIT-PARA.
           STOP RUN.
       EMIT-PARA.
           PERFORM UNTIL WS-EOF = "Y"
               RETURN MERGE-FILE AT END MOVE "Y" TO WS-EOF
               NOT AT END
                   DISPLAY "MERGED=" M-KEY1 " " M-KEY2 " " M-VAL
           END-PERFORM.
