var wsCustName: String = ""
var wsCustBalance: BigDecimal = BigDecimal(0)
var sqlCode: Int = 0
{
  val (code, row) = SqlRuntime.runOption(sql"SELECT CUST-NAME , CUST-BALANCE FROM CUSTOMER WHERE CUST-ID = ${wsCustId}".query[(String, BigDecimal)].option, xa)
  sqlCode = code
  row match
    case Some((v0, v1)) =>
      wsCustName = v0; wsCustBalance = v1
    case None => ()
}
