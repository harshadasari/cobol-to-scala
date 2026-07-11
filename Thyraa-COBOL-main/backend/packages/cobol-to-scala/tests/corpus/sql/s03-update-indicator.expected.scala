var sqlCode: Int = 0
{
  val (code, rowsAffected) = SqlRuntime.runUpdate(sql"UPDATE EMP SET SALARY = ${if wsSalaryInd < 0 then None else Some(wsSalary)} WHERE EMP-ID = ${wsEmpId}".update.run, xa)
  sqlCode = code
}
