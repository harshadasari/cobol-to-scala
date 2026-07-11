var sqlCode: Int = 0
{
  val (code, rowsAffected) = SqlRuntime.runUpdate(sql"INSERT INTO CUSTOMER ( CUST_ID , CUST_NAME ) VALUES ( ${wsNewId} , ${wsNewName} )".update.run, xa)
  sqlCode = code
}
