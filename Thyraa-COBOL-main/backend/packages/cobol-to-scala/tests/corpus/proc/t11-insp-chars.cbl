       IDENTIFICATION DIVISION.
       PROGRAM-ID. T11INSPCHAR.
      * Round-6 attack: INSPECT ... REPLACING CHARACTERS BY - a
      * distinct sub-form from the plain/ALL/LEADING literal-run
      * REPLACING already covered by prior corpus (q04's BEFORE/AFTER
      * INITIAL tests TALLYING/REPLACING generally, but never the
      * CHARACTERS BY single-character-class form, which replaces every
      * character not otherwise excluded).
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TEXT             PIC X(15) VALUE "AB12CD34EF5600".
       01  WS-TEXT2            PIC X(15) VALUE "HELLO WORLD ZZZ".
       PROCEDURE DIVISION.
       MAIN-PARA.
           INSPECT WS-TEXT REPLACING CHARACTERS BY "0"
               BEFORE INITIAL "Z".
           DISPLAY "R1=[" WS-TEXT "]".
           INSPECT WS-TEXT2 REPLACING CHARACTERS BY "*"
               AFTER INITIAL " ".
           DISPLAY "R2=[" WS-TEXT2 "]".
           STOP RUN.
