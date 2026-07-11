// WHENEVER NOT FOUND GO TO 9999-NOT-FOUND (applies to subsequent statements)

var wsCustName: String = ""
var sqlCode: Int = 0
{
  val (code, row) = SqlRuntime.runOption(sql"SELECT CUST-NAME FROM CUSTOMER WHERE CUST-ID = ${wsCustId}".query[String].option, xa)
  sqlCode = code
  row match
    case Some(v) => wsCustName = v
    case None => ()
}
if sqlCode == 100 then return `9999NotFound`() // WHENEVER NOT FOUND GOTO 9999-NOT-FOUND
