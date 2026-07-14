      * Adversarial (round 25): a RECURSIVE program's own self-CALL has
      * always, in every prior corpus program (j10/k01/k04/k12/l04/l10-l12/
      * m01-m14), passed the EXACT same number of USING arguments as its own
      * top-level PROCEDURE DIVISION USING clause declares. This checks a
      * RECURSIVE program declaring TWO LINKAGE parameters but self-CALLing
      * with only ONE argument (real COBOL allows a CALL to supply fewer
      * arguments than the callee's own USING list as long as the callee
      * never references the omitted trailing parameter - PROCEDURE DIVISION
      * USING's own trailing parameters are then simply never bound for that
      * activation). Checks whether the recursive-entry getter/setter-
      * closure convention (built assuming every parameter always gets a
      * real argument) tolerates a shorter argument list without crashing -
      * real COBOL only requires the CALLEE never *reference* an omitted
      * trailing parameter (referencing one is undefined behavior - a real
      * SIGSEGV under installed GnuCOBOL, confirmed separately - so this
      * probe deliberately never touches LS-TAG at any recursion depth,
      * isolating the "fewer arguments than declared" shape on its own from
      * that unrelated undefined-behavior trap).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. O08MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N   PIC 9(2) VALUE 2.
       01 WS-TAG PIC X(3) VALUE "TOP".
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "O08SUB" USING WS-N, WS-TAG.
           DISPLAY "MAIN N=" WS-N " TAG=" WS-TAG.
           STOP RUN.
       END PROGRAM O08MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. O08SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-NEXT PIC 9(2).
       LINKAGE SECTION.
       01 LS-N   PIC 9(2).
       01 LS-TAG PIC X(3).
       PROCEDURE DIVISION USING LS-N, LS-TAG.
       MAIN-PARA.
           DISPLAY "ENTER N=" LS-N.
           IF LS-N > 0
               COMPUTE WS-NEXT = LS-N - 1
               CALL "O08SUB" USING WS-NEXT
           END-IF.
           DISPLAY "EXIT  N=" LS-N.
           GOBACK.
       END PROGRAM O08SUB.
