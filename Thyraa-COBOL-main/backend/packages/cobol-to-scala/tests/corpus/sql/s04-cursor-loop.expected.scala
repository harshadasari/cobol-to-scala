// DECLARE CURSOR DEPT-CURSOR (row type inferred from its FETCH ... INTO host-variable list)
def deptCursorQuery: doobie.Query0[(String, Int)] = sql"SELECT DEPT-NAME , DEPT-ID FROM DEPT WHERE ACTIVE = 1".query[(String, Int)]

// OPEN DEPT-CURSOR - materialized-List cursor translation (see file header for the stream-vs-list tradeoff)
var sqlCode: Int = 0
var deptCursorIter: Iterator[(String, Int)] = Iterator.empty
{
  val (code, rows) = SqlRuntime.runList(deptCursorQuery.to[List], xa)
  sqlCode = code
  deptCursorIter = rows.iterator
}

var wsDeptName: String = ""
var wsDeptId: Int = 0
{
  val next = deptCursorIter.nextOption()
  next match
    case Some((v0, v1)) =>
      wsDeptName = v0; wsDeptId = v1
      sqlCode = 0
    case None => sqlCode = 100 // NOT FOUND
}

// CLOSE DEPT-CURSOR (entire result set was already pulled client-side at OPEN - nothing server-side to release)
deptCursorIter = Iterator.empty
sqlCode = 0
