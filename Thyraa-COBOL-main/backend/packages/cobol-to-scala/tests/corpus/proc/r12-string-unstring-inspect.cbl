       IDENTIFICATION DIVISION.
       PROGRAM-ID. R12STRUNS.
      *
      * Adversarial: STRING with an explicit non-1 starting POINTER,
      * continued across a SECOND STRING statement that resumes from
      * wherever the first left the pointer (mid-field concatenation
      * across two statements, not just one). UNSTRING with per-field
      * COUNT IN clauses (including a field that receives zero
      * characters because two delimiters are adjacent) alongside
      * TALLYING IN. INSPECT TALLYING FOR LEADING and REPLACING
      * LEADING (only the leading run is affected, not later
      * occurrences of the same character).
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-BUF              PIC X(20) VALUE SPACES.
       01  WS-PTR              PIC 9(2)  VALUE 5.
       01  WS-CSV2             PIC X(20) VALUE 'AA,,CCCCC'.
       01  WS-F1               PIC X(5).
       01  WS-C1               PIC 9(2).
       01  WS-F2               PIC X(5).
       01  WS-C2               PIC 9(2).
       01  WS-F3               PIC X(5).
       01  WS-C3               PIC 9(2).
       01  WS-TALLY            PIC 9(2)  VALUE 0.
       01  WS-WORD2            PIC X(10) VALUE 'SSSAMPLESS'.
       01  WS-LEADCOUNT        PIC 9(2)  VALUE 0.
       PROCEDURE DIVISION.
       0000-MAIN.
           STRING 'AB' DELIMITED BY SIZE INTO WS-BUF
               WITH POINTER WS-PTR
           END-STRING
           STRING 'CDE' DELIMITED BY SIZE INTO WS-BUF
               WITH POINTER WS-PTR
           END-STRING
           DISPLAY 'BUF=' WS-BUF
           DISPLAY 'PTR=' WS-PTR
      *
           UNSTRING WS-CSV2 DELIMITED BY ','
               INTO WS-F1 COUNT IN WS-C1
                    WS-F2 COUNT IN WS-C2
                    WS-F3 COUNT IN WS-C3
               TALLYING IN WS-TALLY
           END-UNSTRING
           DISPLAY 'F1=' WS-F1 ' C1=' WS-C1
           DISPLAY 'F2=' WS-F2 ' C2=' WS-C2
           DISPLAY 'F3=' WS-F3 ' C3=' WS-C3
           DISPLAY 'TALLY=' WS-TALLY
      *
           INSPECT WS-WORD2 TALLYING WS-LEADCOUNT FOR LEADING 'S'
           DISPLAY 'LEADCOUNT=' WS-LEADCOUNT
      *
           INSPECT WS-WORD2 REPLACING LEADING 'S' BY 'Z'
           DISPLAY 'WORD2-AFTER=' WS-WORD2
           STOP RUN.
