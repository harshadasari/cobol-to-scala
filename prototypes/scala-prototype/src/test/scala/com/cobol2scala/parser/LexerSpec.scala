package com.cobol2scala.parser

import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers

class LexerSpec extends AnyFunSuite with Matchers:

  test("tokenize simple data item"):
    val source =
      """       01  CUSTOMER-ID            PIC 9(10).
        |""".stripMargin

    val tokens = Lexer.tokenize(source)

    tokens.map(_.value) should contain allOf (
      Token.LevelNumber(1),
      Token.Identifier("CUSTOMER-ID"),
      Token.PIC,
      Token.Period
    )

  test("tokenize multiple data items"):
    val source =
      """       01  CUSTOMER-RECORD.
        |           05  CUST-ID         PIC 9(10).
        |           05  CUST-NAME       PIC X(50).
        |""".stripMargin

    val tokens = Lexer.tokenize(source)
    val levelNumbers = tokens.collect { case Located(Token.LevelNumber(n), _, _) => n }

    levelNumbers should be (List(1, 5, 5))

  test("tokenize COMP-3 usage"):
    val source =
      """       05  BALANCE      PIC S9(11)V99 COMP-3.
        |""".stripMargin

    val tokens = Lexer.tokenize(source)

    tokens.map(_.value) should contain (Token.COMP_3)

  test("tokenize level 88 conditions"):
    val source =
      """       05  STATUS           PIC X(01).
        |           88  ACTIVE           VALUE "A".
        |           88  INACTIVE         VALUE "I".
        |""".stripMargin

    val tokens = Lexer.tokenize(source)
    val levelNumbers = tokens.collect { case Located(Token.LevelNumber(n), _, _) => n }

    levelNumbers should be (List(5, 88, 88))

  test("skip comment lines"):
    val source =
      """      *----------------------------------------------------------------*
        |      * This is a comment                                              *
        |      *----------------------------------------------------------------*
        |       01  DATA-ITEM           PIC X(10).
        |""".stripMargin

    val tokens = Lexer.tokenize(source)
    val levels = tokens.collect { case Located(Token.LevelNumber(n), _, _) => n }

    levels should be (List(1))

  test("handle continuation lines"):
    val source =
      """       01  LONG-VALUE          PIC X(100) VALUE "THIS IS A V
        |      -    "ERY LONG STRING".
        |""".stripMargin

    val tokens = Lexer.tokenize(source)

    // Should successfully tokenize despite continuation
    tokens should not be empty

  test("tokenize OCCURS clause"):
    val source =
      """       05  PHONE-NUMBERS OCCURS 5 TIMES.
        |           10  PHONE-TYPE     PIC X(01).
        |           10  PHONE-NUM      PIC 9(10).
        |""".stripMargin

    val tokens = Lexer.tokenize(source)

    tokens.map(_.value) should contain allOf (
      Token.OCCURS,
      Token.TIMES
    )

  test("tokenize REDEFINES clause"):
    val source =
      """       05  DATE-NUMERIC       PIC 9(08).
        |       05  DATE-PARTS REDEFINES DATE-NUMERIC.
        |           10  DATE-YEAR      PIC 9(04).
        |           10  DATE-MONTH     PIC 9(02).
        |           10  DATE-DAY       PIC 9(02).
        |""".stripMargin

    val tokens = Lexer.tokenize(source)

    tokens.map(_.value) should contain (Token.REDEFINES)
