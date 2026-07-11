       IDENTIFICATION DIVISION.
       PROGRAM-ID. CUSTUPD.
       ENVIRONMENT DIVISION.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-RESP                 PIC S9(8) COMP.
       01 CUST-RECORD.
           05 CUST-NO             PIC 9(6).
           05 CUST-NAME           PIC X(30).
       01 AUDIT-COMMAREA.
           05 AUDIT-CUSTNO        PIC 9(6).
           05 AUDIT-ACTION        PIC X(10).
       01 UPDMAP-AREA.
           05 CUSTNOL             PIC S9(4) COMP.
           05 CUSTNOF             PIC X.
           05 CUSTNOI             PIC 9(6).
           05 CUSTNAML            PIC S9(4) COMP.
           05 CUSTNAMF            PIC X.
           05 CUSTNAMI            PIC X(30).
           05 CUSTNAMO            PIC X(30).
       PROCEDURE DIVISION.
       MAIN-PARA.
           EXEC CICS HANDLE CONDITION
               ERROR(ERROR-PARA)
               NOTFND(NOTFND-PARA)
           END-EXEC.
           EXEC CICS RECEIVE MAP('UPDMAP') MAPSET('CUSTSET')
               INTO(UPDMAP-AREA)
           END-EXEC.
           MOVE CUSTNOI TO CUST-NO.
           EXEC CICS READ FILE('CUSTFILE')
               INTO(CUST-RECORD)
               RIDFLD(CUSTNOI)
               UPDATE
               RESP(WS-RESP)
           END-EXEC.
           MOVE CUSTNAMI TO CUST-NAME.
           EXEC CICS REWRITE FILE('CUSTFILE')
               FROM(CUST-RECORD)
               RESP(WS-RESP)
           END-EXEC.
           MOVE CUST-NO TO AUDIT-CUSTNO.
           MOVE 'UPDATE' TO AUDIT-ACTION.
           EXEC CICS LINK PROGRAM('AUDITLOG')
               COMMAREA(AUDIT-COMMAREA)
               LENGTH(16)
           END-EXEC.
           MOVE CUST-NAME TO CUSTNAMO.
           EXEC CICS SEND MAP('UPDMAP') MAPSET('CUSTSET')
               FROM(UPDMAP-AREA)
               ERASE
           END-EXEC.
           EXEC CICS RETURN
           END-EXEC.
       ERROR-PARA.
           EXEC CICS ABEND ABCODE('CUER')
           END-EXEC.
       NOTFND-PARA.
           MOVE 'RECORD NOT FOUND' TO CUSTNAMO.
           EXEC CICS SEND MAP('UPDMAP') MAPSET('CUSTSET')
               FROM(UPDMAP-AREA)
               ERASE
           END-EXEC.
           EXEC CICS RETURN
           END-EXEC.
       XFER-PARA.
           EXEC CICS XCTL PROGRAM('CUSTLIST') COMMAREA(AUDIT-COMMAREA)
               LENGTH(16)
           END-EXEC.
