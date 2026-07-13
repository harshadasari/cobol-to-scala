       IDENTIFICATION DIVISION.
       PROGRAM-ID. I03COPYPROC.
      *
      * Adversarial (round 20): COPY statement used INSIDE the
      * PROCEDURE DIVISION (a copybook holding a whole paragraph's
      * statements), not the DATA DIVISION shape every prior COPY
      * corpus program (u09/u10) exercises.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-COUNTER PIC 9(3) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "MAIN-START".
           COPY I03PROCPARA.
           DISPLAY "MAIN-END COUNTER=" WS-COUNTER.
           STOP RUN.
