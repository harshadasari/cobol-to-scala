package com.cobol2scala.parser

import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers

class CopybookParserSpec extends AnyFunSuite with Matchers:

  test("parse simple record"):
    val source =
      """       01  CUSTOMER-RECORD.
        |           05  CUST-ID         PIC 9(10).
        |           05  CUST-NAME       PIC X(50).
        |""".stripMargin

    val result = CopybookParser.parse(source)

    result.isRight should be (true)
    val copybook = result.toOption.get

    copybook.records.length should be (1)

    val record = copybook.records.head
    record.level should be (1)
    record.name should be (Some("CUSTOMER-RECORD"))
    record.children.length should be (2)

  test("parse PIC clause correctly"):
    val source =
      """       01  TEST-RECORD.
        |           05  ALPHA-FIELD     PIC X(25).
        |           05  NUM-FIELD       PIC 9(10).
        |           05  SIGNED-DEC      PIC S9(11)V99.
        |""".stripMargin

    val result = CopybookParser.parse(source)
    result.isRight should be (true)

    val record = result.toOption.get.records.head
    val fields = record.children

    fields(0).pic.get.dataType should be (PicType.Alphanumeric)
    fields(0).pic.get.totalDigits should be (25)

    fields(1).pic.get.dataType should be (PicType.Numeric)
    fields(1).pic.get.totalDigits should be (10)

    fields(2).pic.get.signed should be (true)
    fields(2).pic.get.decimalDigits should be (2)

  test("parse COMP-3 usage"):
    val source =
      """       01  MONEY-RECORD.
        |           05  BALANCE     PIC S9(11)V99 COMP-3.
        |""".stripMargin

    val result = CopybookParser.parse(source)
    result.isRight should be (true)

    val field = result.toOption.get.records.head.children.head
    field.usage should be (Usage.Comp3)

  test("parse level 88 conditions"):
    val source =
      """       01  STATUS-RECORD.
        |           05  STATUS-CODE     PIC X(01).
        |               88  ACTIVE          VALUE "A".
        |               88  INACTIVE        VALUE "I".
        |               88  CLOSED          VALUE "C".
        |""".stripMargin

    val result = CopybookParser.parse(source)
    result.isRight should be (true)

    val field = result.toOption.get.records.head.children.head
    field.conditions.length should be (3)
    field.conditions.map(_.name) should be (List("ACTIVE", "INACTIVE", "CLOSED"))

  test("parse nested groups"):
    val source =
      """       01  PERSON-RECORD.
        |           05  PERSON-NAME.
        |               10  FIRST-NAME     PIC X(20).
        |               10  LAST-NAME      PIC X(30).
        |           05  PERSON-ADDRESS.
        |               10  STREET         PIC X(50).
        |               10  CITY           PIC X(30).
        |               10  STATE          PIC X(02).
        |""".stripMargin

    val result = CopybookParser.parse(source)
    result.isRight should be (true)

    val record = result.toOption.get.records.head
    record.children.length should be (2)

    val nameGroup = record.children(0)
    nameGroup.name should be (Some("PERSON-NAME"))
    nameGroup.isGroup should be (true)
    nameGroup.children.length should be (2)

    val addressGroup = record.children(1)
    addressGroup.children.length should be (3)

  test("parse OCCURS clause"):
    val source =
      """       01  CONTACT-RECORD.
        |           05  PHONE-COUNT     PIC 9(02).
        |           05  PHONES OCCURS 5 TIMES.
        |               10  PHONE-TYPE  PIC X(01).
        |               10  PHONE-NUM   PIC 9(10).
        |""".stripMargin

    val result = CopybookParser.parse(source)
    result.isRight should be (true)

    val phones = result.toOption.get.records.head.children(1)
    phones.occurs should be (Some(OccursClause(5, None, None, Nil, Nil)))

  test("parse REDEFINES clause"):
    val source =
      """       01  DATE-RECORD.
        |           05  DATE-NUMERIC   PIC 9(08).
        |           05  DATE-PARTS REDEFINES DATE-NUMERIC.
        |               10  D-YEAR     PIC 9(04).
        |               10  D-MONTH    PIC 9(02).
        |               10  D-DAY      PIC 9(02).
        |""".stripMargin

    val result = CopybookParser.parse(source)
    result.isRight should be (true)

    val record = result.toOption.get.records.head
    val dateParts = record.children(1)
    dateParts.redefines should be (Some("DATE-NUMERIC"))

  test("parse level 77 independent item"):
    val source =
      """       77  WS-COUNTER          PIC 9(08) VALUE 0.
        |       77  WS-TEMP             PIC X(100).
        |       01  DATA-RECORD.
        |           05  FIELD-A         PIC X(10).
        |""".stripMargin

    val result = CopybookParser.parse(source)
    result.isRight should be (true)

    val records = result.toOption.get.records
    records.length should be (3)
    records(0).level should be (77)
    records(1).level should be (77)
    records(2).level should be (1)
