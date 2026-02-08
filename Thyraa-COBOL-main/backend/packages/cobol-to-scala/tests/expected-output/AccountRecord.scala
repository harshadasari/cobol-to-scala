package com.bank.accounts

import com.thyraa.cobol.runtime.*

enum AcctStatus(val code: String):
  case Open extends AcctStatus("OP")
  case Frozen extends AcctStatus("FR")
  case Closed extends AcctStatus("CL")
  case Dormant extends AcctStatus("DO")

object AcctStatus:
  def fromCode(code: String): Option[AcctStatus] =
    AcctStatus.values.find(_.code == code)

enum AcctType(val code: String):
  case Checking extends AcctType("CHK")
  case Savings extends AcctType("SAV")
  case MoneyMkt extends AcctType("MMK")

object AcctType:
  def fromCode(code: String): Option[AcctType] =
    AcctType.values.find(_.code == code)

case class AcctKey(
  acctBranch: Int,
  acctNumber: Long
)

case class AcctHolder(
  acctFirstName: String,
  acctLastName: String,
  acctMiddleInit: String
)

case class AcctContact(
  acctPhone: Long,
  acctEmail: String
)

case class AcctFinancial(
  acctBalance: BigDecimal,
  acctAvailable: BigDecimal,
  acctPending: BigDecimal,
  acctInterest: BigDecimal
)

case class AcctDates(
  acctOpenDate: Int,
  acctLastTrans: Int,
  acctCloseDate: Int
)

case class AcctHistory(
  histMonth: Int,
  histBalance: BigDecimal,
  histTransCnt: Int
)

case class AccountRecord(
  acctKey: AcctKey,
  acctHolder: AcctHolder,
  acctContact: AcctContact,
  acctFinancial: AcctFinancial,
  acctStatus: AcctStatus,
  acctType: AcctType,
  acctDates: AcctDates,
  acctHistory: Vector[AcctHistory]
)

object AccountRecord:
  val recordLength: Int = 354  // Calculated from PIC clauses

  def parse(bytes: Array[Byte]): AccountRecord = ???
  def format(record: AccountRecord): Array[Byte] = ???
