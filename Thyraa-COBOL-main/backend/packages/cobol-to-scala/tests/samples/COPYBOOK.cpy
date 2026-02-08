      ******************************************************************
      * CUSTOMER ACCOUNT COPYBOOK
      ******************************************************************
       01  ACCOUNT-RECORD.
           05  ACCT-KEY.
               10  ACCT-BRANCH      PIC 9(04).
               10  ACCT-NUMBER      PIC 9(10).
           05  ACCT-HOLDER.
               10  ACCT-FIRST-NAME  PIC X(25).
               10  ACCT-LAST-NAME   PIC X(35).
               10  ACCT-MIDDLE-INIT PIC X(01).
           05  ACCT-CONTACT.
               10  ACCT-PHONE       PIC 9(10).
               10  ACCT-EMAIL       PIC X(50).
           05  ACCT-FINANCIAL.
               10  ACCT-BALANCE     PIC S9(13)V99 COMP-3.
               10  ACCT-AVAILABLE   PIC S9(13)V99 COMP-3.
               10  ACCT-PENDING     PIC S9(11)V99 COMP-3.
               10  ACCT-INTEREST    PIC S9(03)V9(04) COMP-3.
           05  ACCT-STATUS          PIC X(02).
               88  ACCT-OPEN            VALUE 'OP'.
               88  ACCT-FROZEN          VALUE 'FR'.
               88  ACCT-CLOSED          VALUE 'CL'.
               88  ACCT-DORMANT         VALUE 'DO'.
           05  ACCT-TYPE            PIC X(03).
               88  ACCT-CHECKING        VALUE 'CHK'.
               88  ACCT-SAVINGS         VALUE 'SAV'.
               88  ACCT-MONEY-MKT       VALUE 'MMK'.
           05  ACCT-DATES.
               10  ACCT-OPEN-DATE   PIC 9(08).
               10  ACCT-LAST-TRANS  PIC 9(08).
               10  ACCT-CLOSE-DATE  PIC 9(08).
           05  ACCT-HISTORY OCCURS 12 TIMES.
               10  HIST-MONTH       PIC 9(02).
               10  HIST-BALANCE     PIC S9(13)V99 COMP-3.
               10  HIST-TRANS-CNT   PIC 9(05).
