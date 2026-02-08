      *----------------------------------------------------------------*
      * TRANSACTION RECORD LAYOUT                                     *
      * Used for daily transaction processing                         *
      *----------------------------------------------------------------*
       01  TRANSACTION-RECORD.
           05  TRANS-ID                PIC X(20).
           05  TRANS-DATE              PIC 9(08).
           05  TRANS-TIME              PIC 9(06).
           05  TRANS-TYPE              PIC X(02).
               88  TRANS-DEPOSIT           VALUE "DP".
               88  TRANS-WITHDRAWAL        VALUE "WD".
               88  TRANS-TRANSFER          VALUE "TR".
               88  TRANS-PAYMENT           VALUE "PY".
               88  TRANS-FEE               VALUE "FE".
           05  TRANS-AMOUNT            PIC S9(13)V99 COMP-3.
           05  TRANS-FROM-ACCOUNT      PIC 9(10).
           05  TRANS-TO-ACCOUNT        PIC 9(10).
           05  TRANS-DESCRIPTION       PIC X(50).
           05  TRANS-STATUS            PIC X(01).
               88  TRANS-PENDING           VALUE "P".
               88  TRANS-COMPLETED         VALUE "C".
               88  TRANS-FAILED            VALUE "F".
               88  TRANS-REVERSED          VALUE "R".
           05  TRANS-REFERENCE         PIC X(30).
