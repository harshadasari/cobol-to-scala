package com.example.test

import scala.util.{Try, Success, Failure}

// Data structures
case class Filler(
  filler: String
)

object Filler:
  val recordLength: Int = 0

  def parse(bytes: Array[Byte]): Filler =
    var offset = 0
    val filler = new String(bytes.slice(offset, offset + 0)).trim
    offset += 0
    Filler(filler)

  def format(record: Filler): Array[Byte] =
    val buffer = new Array[Byte](recordLength)
    var offset = 0
    val fillerBytes = record.filler.padTo(0, ' ').take(0).getBytes
    System.arraycopy(fillerBytes, 0, buffer, offset, 0)
    offset += 0
    buffer
end Filler

case class CustId(
  filler: Filler
)

object CustId:
  val recordLength: Int = 0

  def parse(bytes: Array[Byte]): CustId =
    var offset = 0
    val filler = Filler.parse(bytes.slice(offset, offset + Filler.recordLength))
    offset += Filler.recordLength
    CustId(filler)

  def format(record: CustId): Array[Byte] =
    val buffer = new Array[Byte](recordLength)
    var offset = 0
    val fillerBytes = Filler.format(record.filler)
    System.arraycopy(fillerBytes, 0, buffer, offset, Filler.recordLength)
    offset += Filler.recordLength
    buffer
end CustId

case class CustBalance(
  filler: String
)

object CustBalance:
  val recordLength: Int = 0

  def parse(bytes: Array[Byte]): CustBalance =
    var offset = 0
    val filler = new String(bytes.slice(offset, offset + 0)).trim
    offset += 0
    CustBalance(filler)

  def format(record: CustBalance): Array[Byte] =
    val buffer = new Array[Byte](recordLength)
    var offset = 0
    val fillerBytes = record.filler.padTo(0, ' ').take(0).getBytes
    System.arraycopy(fillerBytes, 0, buffer, offset, 0)
    offset += 0
    buffer
end CustBalance

case class CustomerRecord(
  custId: CustId,
  custName: String,
  custBalance: CustBalance,
  custStatus: String
)

object CustomerRecord:
  val recordLength: Int = 0

  def parse(bytes: Array[Byte]): CustomerRecord =
    var offset = 0
    val custId = CustId.parse(bytes.slice(offset, offset + CustId.recordLength))
    offset += CustId.recordLength
    val custName = new String(bytes.slice(offset, offset + 0)).trim
    offset += 0
    val custBalance = CustBalance.parse(bytes.slice(offset, offset + CustBalance.recordLength))
    offset += CustBalance.recordLength
    val custStatus = new String(bytes.slice(offset, offset + 0)).trim
    offset += 0
    CustomerRecord(custId, custName, custBalance, custStatus)

  def format(record: CustomerRecord): Array[Byte] =
    val buffer = new Array[Byte](recordLength)
    var offset = 0
    val custIdBytes = CustId.format(record.custId)
    System.arraycopy(custIdBytes, 0, buffer, offset, CustId.recordLength)
    offset += CustId.recordLength
    val custNameBytes = record.custName.padTo(0, ' ').take(0).getBytes
    System.arraycopy(custNameBytes, 0, buffer, offset, 0)
    offset += 0
    val custBalanceBytes = CustBalance.format(record.custBalance)
    System.arraycopy(custBalanceBytes, 0, buffer, offset, CustBalance.recordLength)
    offset += CustBalance.recordLength
    val custStatusBytes = record.custStatus.padTo(0, ' ').take(0).getBytes
    System.arraycopy(custStatusBytes, 0, buffer, offset, 0)
    offset += 0
    buffer
end CustomerRecord

case class WsTotal(
  filler: String
)

object WsTotal:
  val recordLength: Int = 0

  def parse(bytes: Array[Byte]): WsTotal =
    var offset = 0
    val filler = new String(bytes.slice(offset, offset + 0)).trim
    offset += 0
    WsTotal(filler)

  def format(record: WsTotal): Array[Byte] =
    val buffer = new Array[Byte](recordLength)
    var offset = 0
    val fillerBytes = record.filler.padTo(0, ' ').take(0).getBytes
    System.arraycopy(fillerBytes, 0, buffer, offset, 0)
    offset += 0
    buffer
end WsTotal

case class WsCount(
  filler: String,
  filler: String
)

object WsCount:
  val recordLength: Int = 0

  def parse(bytes: Array[Byte]): WsCount =
    var offset = 0
    val filler = new String(bytes.slice(offset, offset + 0)).trim
    offset += 0
    val filler = new String(bytes.slice(offset, offset + 0)).trim
    offset += 0
    WsCount(filler, filler)

  def format(record: WsCount): Array[Byte] =
    val buffer = new Array[Byte](recordLength)
    var offset = 0
    val fillerBytes = record.filler.padTo(0, ' ').take(0).getBytes
    System.arraycopy(fillerBytes, 0, buffer, offset, 0)
    offset += 0
    val fillerBytes = record.filler.padTo(0, ' ').take(0).getBytes
    System.arraycopy(fillerBytes, 0, buffer, offset, 0)
    offset += 0
    buffer
end WsCount

object SimpleTest:

  // Procedures
  def mainProcess() =
    println("Starting Customer Processing")
    wsTotal = [object Object]
    wsCount = [object Object]
    processCustomer()
    println("Total: " + wsTotal)
    println("Count: " + wsCount)
    sys.exit(0)

  def processCustomer() =
    wsCount = wsCount + [object Object]
    wsTotal = wsTotal + [object Object]

  @main def run(): Unit =
    mainProcess()
end SimpleTest