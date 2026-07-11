      *****************************************************************
      * CUSTOMER.cpy - shared customer-account record layout.
      * Demo copybook for the COBOL-to-Scala oracle-verified engine.
      * Deliberately includes a COMP-3 (packed-decimal) money field so the
      * demo exercises byte-level codec generation, not just DISPLAY data.
      *****************************************************************
       01  CUSTOMER-RECORD.
           05  CUST-ID          PIC 9(5).
           05  CUST-NAME        PIC X(20).
           05  CUST-BALANCE     PIC S9(7)V99 COMP-3.
