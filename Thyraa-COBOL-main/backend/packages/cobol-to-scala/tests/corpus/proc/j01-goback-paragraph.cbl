      * Adversarial (round 21): a paragraph literally named GOBACK - the
      * SAME bug class round-20 finding 1 fixed for EXIT/CONTINUE
      * (a reserved-word token that isn't tokenized as IDENTIFIER, so
      * parseProcedureDivision's "paragraph name expected" check falls
      * through to dispatching it as the STATEMENT instead), but for a
      * DIFFERENT reserved word round-20's narrow
      * PARAGRAPH_NAME_RESERVED_WORDS = {EXIT, CONTINUE} allowlist does
      * NOT cover. Verified against installed GnuCOBOL first (several
      * other candidates - NEXT, END, STOP, ELSE, THEN, RUN, CALL, SORT,
      * MERGE, READ, WRITE, OPEN, CLOSE, MOVE, ADD, SET, IF, PERFORM,
      * DELETE, UNLOCK, CANCEL, ENTRY, ALTER, TERMINATE, INITIATE,
      * GENERATE - all correctly produce a cobc syntax error when used
      * bare as a bogus bareword paragraph name, so they are not
      * reachable this way; ROLLBACK compiles but is correctly treated
      * as an ordinary paragraph name by cobc, not a statement, since a
      * bare ROLLBACK with no active SQL transaction is apparently just
      * a no-op token cobc accepts as a name). GOBACK is a true zero-
      * operand statement (like EXIT/CONTINUE) that cobc's own parser
      * greedily consumes as soon as "GOBACK." appears where a paragraph
      * name was expected: real cobc's own oracle for this program is a
      * BLANK stdout - the whole implicit first paragraph becomes just
      * the GOBACK statement, and the ADD/DISPLAY/STOP RUN after it
      * never run at all (confirmed reproducible: verified twice).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. J01GOBACK.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-X PIC 9(3) VALUE 0.
       PROCEDURE DIVISION.
       GOBACK.
           ADD 1 TO WS-X.
           DISPLAY "X=" WS-X.
           STOP RUN.
