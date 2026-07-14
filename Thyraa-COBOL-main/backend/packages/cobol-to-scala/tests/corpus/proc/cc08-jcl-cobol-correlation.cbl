      * cc08: companion COBOL program to cc08-jcl-cobol-correlation.jcl
      * - PGM=CC08COB, using the SAME DD names the JCL declares
      * (INFILE/OUTFILE) as its own ASSIGN targets, the ordinary
      * mainframe convention. Probes whether this engine's JCL parser
      * (parser/jcl-parser.js) and its main COBOL generator
      * (convertToScala()) are correlated AT ALL - does the generated
      * Scala resolve "INFILE" against the JCL's own DSN
      * (PROD.CUSTOMER.MASTER), or are these two parsers/pipelines
      * completely independent, each seeing only its own source file?
       IDENTIFICATION DIVISION.
       PROGRAM-ID. CC08COB.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IN-FILE ASSIGN TO INFILE
               ORGANIZATION IS LINE SEQUENTIAL.
           SELECT OUT-FILE ASSIGN TO OUTFILE
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  IN-FILE.
       01  IN-REC             PIC X(20).
       FD  OUT-FILE.
       01  OUT-REC            PIC X(20).
       WORKING-STORAGE SECTION.
       01  WS-EOF             PIC X VALUE "N".
       PROCEDURE DIVISION.
       MAIN-LOGIC.
           DISPLAY "ASSIGN-NAME-USED=INFILE/OUTFILE".
           STOP RUN.
