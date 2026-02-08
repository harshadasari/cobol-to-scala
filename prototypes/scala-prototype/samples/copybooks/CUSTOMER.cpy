      *----------------------------------------------------------------*
      * CUSTOMER RECORD LAYOUT                                        *
      * Used for customer master file processing                      *
      *----------------------------------------------------------------*
       01  CUSTOMER-RECORD.
           05  CUST-ID                 PIC 9(10).
           05  CUST-NAME.
               10  CUST-FIRST-NAME     PIC X(25).
               10  CUST-MIDDLE-INIT    PIC X(01).
               10  CUST-LAST-NAME      PIC X(30).
           05  CUST-ADDRESS.
               10  CUST-STREET         PIC X(50).
               10  CUST-CITY           PIC X(30).
               10  CUST-STATE          PIC X(02).
               10  CUST-ZIP.
                   15  CUST-ZIP-5      PIC 9(05).
                   15  CUST-ZIP-4      PIC 9(04).
           05  CUST-PHONE              PIC 9(10).
           05  CUST-EMAIL              PIC X(50).
           05  CUST-BALANCE            PIC S9(11)V99 COMP-3.
           05  CUST-CREDIT-LIMIT       PIC S9(9)V99 COMP-3.
           05  CUST-ACCOUNT-TYPE       PIC X(01).
               88  ACCT-CHECKING           VALUE "C".
               88  ACCT-SAVINGS            VALUE "S".
               88  ACCT-MONEY-MARKET       VALUE "M".
               88  ACCT-VALID              VALUE "C" "S" "M".
           05  CUST-STATUS             PIC X(01).
               88  STATUS-ACTIVE           VALUE "A".
               88  STATUS-INACTIVE         VALUE "I".
               88  STATUS-CLOSED           VALUE "C".
               88  STATUS-SUSPENDED        VALUE "S".
           05  CUST-OPEN-DATE          PIC 9(08).
           05  CUST-LAST-ACTIVITY      PIC 9(08).
           05  CUST-TRANSACTION-COUNT  PIC 9(06) COMP.
