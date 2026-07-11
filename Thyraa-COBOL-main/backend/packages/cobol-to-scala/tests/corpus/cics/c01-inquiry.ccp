       IDENTIFICATION DIVISION.
       PROGRAM-ID. CUSTINQ.
       ENVIRONMENT DIVISION.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-RESP                 PIC S9(8) COMP.
       01 WS-COMMAREA.
           05 WS-CA-CUSTNO        PIC 9(6).
       01 CUST-RECORD.
           05 CUST-NO             PIC 9(6).
           05 CUST-NAME           PIC X(30).
       01 CUSTMAP-AREA.
           05 CUSTNOL             PIC S9(4) COMP.
           05 CUSTNOF             PIC X.
           05 CUSTNOI             PIC 9(6).
           05 CUSTNAML            PIC S9(4) COMP.
           05 CUSTNAMF            PIC X.
           05 CUSTNAMO            PIC X(30).
           05 ERRMSGL             PIC S9(4) COMP.
           05 ERRMSGF             PIC X.
           05 ERRMSGO             PIC X(40).
       PROCEDURE DIVISION.
       MAIN-PARA.
           EXEC CICS HANDLE CONDITION
               ERROR(ERROR-PARA)
               NOTFND(NOTFND-PARA)
           END-EXEC.
           EXEC CICS RECEIVE MAP('CUSTMAP') MAPSET('CUSTSET')
               INTO(CUSTMAP-AREA)
           END-EXEC.
           MOVE CUSTNOI TO CUST-NO.
           EXEC CICS READ FILE('CUSTFILE')
               INTO(CUST-RECORD)
               RIDFLD(CUSTNOI)
               RESP(WS-RESP)
           END-EXEC.
           IF WS-RESP = 0
               MOVE CUST-NAME TO CUSTNAMO
               EXEC CICS SEND MAP('CUSTMAP') MAPSET('CUSTSET')
                   FROM(CUSTMAP-AREA)
                   ERASE
               END-EXEC
           ELSE
               MOVE 'CUSTOMER NOT FOUND' TO ERRMSGO
               EXEC CICS SEND MAP('CUSTMAP') MAPSET('CUSTSET')
                   FROM(CUSTMAP-AREA)
                   ERASE
               END-EXEC
           END-IF.
           EXEC CICS RETURN TRANSID('CINQ')
               COMMAREA(WS-COMMAREA)
               LENGTH(6)
           END-EXEC.
           GOBACK.
       ERROR-PARA.
           MOVE 'SYSTEM ERROR' TO ERRMSGO.
           EXEC CICS SEND MAP('CUSTMAP') MAPSET('CUSTSET')
               FROM(CUSTMAP-AREA)
               ERASE
           END-EXEC.
           EXEC CICS RETURN
           END-EXEC.
       NOTFND-PARA.
           MOVE 'RECORD NOT FOUND' TO ERRMSGO.
           EXEC CICS SEND MAP('CUSTMAP') MAPSET('CUSTSET')
               FROM(CUSTMAP-AREA)
               ERASE
           END-EXEC.
           EXEC CICS RETURN
           END-EXEC.
