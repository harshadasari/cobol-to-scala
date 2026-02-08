package com.thyraa.cobol.runtime

import java.sql.*
import scala.util.{Try, Using, Success, Failure}
import scala.collection.mutable

/**
 * SQL result abstraction modeling COBOL SQLCODE behavior.
 */
case class SqlResult[T](value: Option[T], sqlCode: Int, sqlState: String):
  def isSuccess: Boolean = sqlCode == 0
  def isNotFound: Boolean = sqlCode == 100
  def isError: Boolean = sqlCode < 0
  def isWarning: Boolean = sqlCode > 0 && sqlCode < 100

  def getOrElse(default: => T): T = value.getOrElse(default)

  def map[U](f: T => U): SqlResult[U] =
    SqlResult(value.map(f), sqlCode, sqlState)

  def flatMap[U](f: T => SqlResult[U]): SqlResult[U] =
    value match
      case Some(v) => f(v)
      case None => SqlResult(None, sqlCode, sqlState)

object SqlResult:
  def success[T](value: T): SqlResult[T] = SqlResult(Some(value), 0, "00000")
  def notFound[T]: SqlResult[T] = SqlResult(None, 100, "02000")
  def error[T](code: Int, state: String): SqlResult[T] = SqlResult(None, code, state)
  def warning[T](value: T, code: Int, state: String): SqlResult[T] = SqlResult(Some(value), code, state)

  def fromSqlException[T](e: SQLException): SqlResult[T] =
    SqlResult(None, e.getErrorCode, Option(e.getSQLState).getOrElse("HY000"))

/**
 * Cursor abstraction for COBOL DECLARE CURSOR / OPEN / FETCH / CLOSE pattern.
 */
class CobolCursor[T](
  connection: Connection,
  sql: String,
  rowMapper: ResultSet => T
):
  private var statement: Option[PreparedStatement] = None
  private var resultSet: Option[ResultSet] = None
  private var sqlCode: Int = 0
  private var sqlState: String = "00000"
  private var isOpen: Boolean = false
  private var rowCount: Int = 0

  /**
   * Open the cursor with optional parameters.
   */
  def open(params: Any*): Unit =
    try
      close() // Close if already open
      val ps = connection.prepareStatement(
        sql,
        ResultSet.TYPE_FORWARD_ONLY,
        ResultSet.CONCUR_READ_ONLY
      )
      setParameters(ps, params)
      val rs = ps.executeQuery()
      statement = Some(ps)
      resultSet = Some(rs)
      isOpen = true
      sqlCode = 0
      sqlState = "00000"
      rowCount = 0
    catch
      case e: SQLException =>
        sqlCode = e.getErrorCode
        sqlState = Option(e.getSQLState).getOrElse("HY000")
        isOpen = false

  /**
   * Fetch next row from cursor.
   */
  def fetch(): SqlResult[T] =
    if !isOpen then
      sqlCode = -501 // Cursor not open
      sqlState = "24000"
      SqlResult.error(-501, "24000")
    else
      resultSet match
        case None =>
          sqlCode = -502
          sqlState = "24000"
          SqlResult.error(-502, "24000")
        case Some(rs) =>
          try
            if rs.next() then
              rowCount += 1
              sqlCode = 0
              sqlState = "00000"
              SqlResult.success(rowMapper(rs))
            else
              sqlCode = 100 // Not found / end of cursor
              sqlState = "02000"
              SqlResult.notFound
          catch
            case e: SQLException =>
              sqlCode = e.getErrorCode
              sqlState = Option(e.getSQLState).getOrElse("HY000")
              SqlResult.fromSqlException(e)

  /**
   * Close the cursor.
   */
  def close(): Unit =
    try
      resultSet.foreach(_.close())
      statement.foreach(_.close())
    catch
      case _: SQLException => // Ignore close errors
    finally
      resultSet = None
      statement = None
      isOpen = false

  /**
   * Get current SQLCODE.
   */
  def getSqlCode: Int = sqlCode

  /**
   * Get current SQLSTATE.
   */
  def getSqlState: String = sqlState

  /**
   * Get row count fetched so far.
   */
  def getRowCount: Int = rowCount

  /**
   * Check if cursor is open.
   */
  def isCursorOpen: Boolean = isOpen

  private def setParameters(ps: PreparedStatement, params: Seq[Any]): Unit =
    params.zipWithIndex.foreach { (param, idx) =>
      val paramIdx = idx + 1
      param match
        case null => ps.setNull(paramIdx, Types.NULL)
        case s: String => ps.setString(paramIdx, s)
        case i: Int => ps.setInt(paramIdx, i)
        case l: Long => ps.setLong(paramIdx, l)
        case d: Double => ps.setDouble(paramIdx, d)
        case f: Float => ps.setFloat(paramIdx, f)
        case bd: BigDecimal => ps.setBigDecimal(paramIdx, bd.bigDecimal)
        case jbd: java.math.BigDecimal => ps.setBigDecimal(paramIdx, jbd)
        case b: Boolean => ps.setBoolean(paramIdx, b)
        case bytes: Array[Byte] => ps.setBytes(paramIdx, bytes)
        case date: java.sql.Date => ps.setDate(paramIdx, date)
        case time: java.sql.Time => ps.setTime(paramIdx, time)
        case ts: java.sql.Timestamp => ps.setTimestamp(paramIdx, ts)
        case other => ps.setObject(paramIdx, other)
    }

/**
 * Connection manager for COBOL DB2 style database access.
 */
object CobolDb:
  private var connection: Option[Connection] = None
  private var sqlCode: Int = 0
  private var sqlState: String = "00000"
  private var sqlErrm: String = ""

  /**
   * Connect to database.
   */
  def connect(url: String, user: String, password: String): Unit =
    try
      disconnect() // Close any existing connection
      connection = Some(DriverManager.getConnection(url, user, password))
      sqlCode = 0
      sqlState = "00000"
      sqlErrm = ""
    catch
      case e: SQLException =>
        sqlCode = e.getErrorCode
        sqlState = Option(e.getSQLState).getOrElse("HY000")
        sqlErrm = Option(e.getMessage).getOrElse("")
        connection = None

  /**
   * Connect with properties.
   */
  def connect(url: String, props: java.util.Properties): Unit =
    try
      disconnect()
      connection = Some(DriverManager.getConnection(url, props))
      sqlCode = 0
      sqlState = "00000"
      sqlErrm = ""
    catch
      case e: SQLException =>
        sqlCode = e.getErrorCode
        sqlState = Option(e.getSQLState).getOrElse("HY000")
        sqlErrm = Option(e.getMessage).getOrElse("")
        connection = None

  /**
   * Set an existing connection.
   */
  def setConnection(conn: Connection): Unit =
    disconnect()
    connection = Some(conn)
    sqlCode = 0
    sqlState = "00000"

  /**
   * Disconnect from database.
   */
  def disconnect(): Unit =
    try
      connection.foreach(_.close())
    catch
      case _: SQLException => // Ignore close errors
    finally
      connection = None

  /**
   * Get current connection.
   */
  def getConnection: Option[Connection] = connection

  /**
   * Execute a query and map single result (SELECT INTO style).
   */
  def executeQuery[T](sql: String, params: Seq[Any], mapper: ResultSet => T): SqlResult[T] =
    connection match
      case None =>
        sqlCode = -805 // No connection
        sqlState = "08003"
        SqlResult.error(-805, "08003")
      case Some(conn) =>
        var ps: PreparedStatement = null
        var rs: ResultSet = null
        try
          ps = conn.prepareStatement(sql)
          setParameters(ps, params)
          rs = ps.executeQuery()
          if rs.next() then
            val result = mapper(rs)
            if rs.next() then
              // Multiple rows - warning
              sqlCode = 1
              sqlState = "01000"
              SqlResult.warning(result, 1, "01000")
            else
              sqlCode = 0
              sqlState = "00000"
              SqlResult.success(result)
          else
            sqlCode = 100
            sqlState = "02000"
            SqlResult.notFound
        catch
          case e: SQLException =>
            sqlCode = e.getErrorCode
            sqlState = Option(e.getSQLState).getOrElse("HY000")
            sqlErrm = Option(e.getMessage).getOrElse("")
            SqlResult.fromSqlException(e)
        finally
          if rs != null then Try(rs.close())
          if ps != null then Try(ps.close())

  /**
   * Execute an update statement (INSERT, UPDATE, DELETE).
   */
  def executeUpdate(sql: String, params: Seq[Any]): SqlResult[Int] =
    connection match
      case None =>
        sqlCode = -805
        sqlState = "08003"
        SqlResult.error(-805, "08003")
      case Some(conn) =>
        var ps: PreparedStatement = null
        try
          ps = conn.prepareStatement(sql)
          setParameters(ps, params)
          val rowCount = ps.executeUpdate()
          if rowCount == 0 then
            sqlCode = 100
            sqlState = "02000"
            SqlResult.notFound
          else
            sqlCode = 0
            sqlState = "00000"
            SqlResult.success(rowCount)
        catch
          case e: SQLException =>
            sqlCode = e.getErrorCode
            sqlState = Option(e.getSQLState).getOrElse("HY000")
            sqlErrm = Option(e.getMessage).getOrElse("")
            SqlResult.fromSqlException(e)
        finally
          if ps != null then Try(ps.close())

  /**
   * Convenience for SELECT INTO pattern.
   */
  def selectInto[T](sql: String, params: Seq[Any], mapper: ResultSet => T): SqlResult[T] =
    executeQuery(sql, params, mapper)

  /**
   * Execute multiple statements in a batch.
   */
  def executeBatch(sql: String, paramsList: Seq[Seq[Any]]): SqlResult[Array[Int]] =
    connection match
      case None =>
        sqlCode = -805
        sqlState = "08003"
        SqlResult.error(-805, "08003")
      case Some(conn) =>
        var ps: PreparedStatement = null
        try
          ps = conn.prepareStatement(sql)
          for params <- paramsList do
            setParameters(ps, params)
            ps.addBatch()
          val results = ps.executeBatch()
          sqlCode = 0
          sqlState = "00000"
          SqlResult.success(results)
        catch
          case e: SQLException =>
            sqlCode = e.getErrorCode
            sqlState = Option(e.getSQLState).getOrElse("HY000")
            sqlErrm = Option(e.getMessage).getOrElse("")
            SqlResult.fromSqlException(e)
        finally
          if ps != null then Try(ps.close())

  /**
   * Commit current transaction.
   */
  def commit(): Unit =
    try
      connection.foreach(_.commit())
      sqlCode = 0
      sqlState = "00000"
    catch
      case e: SQLException =>
        sqlCode = e.getErrorCode
        sqlState = Option(e.getSQLState).getOrElse("HY000")
        sqlErrm = Option(e.getMessage).getOrElse("")

  /**
   * Rollback current transaction.
   */
  def rollback(): Unit =
    try
      connection.foreach(_.rollback())
      sqlCode = 0
      sqlState = "00000"
    catch
      case e: SQLException =>
        sqlCode = e.getErrorCode
        sqlState = Option(e.getSQLState).getOrElse("HY000")
        sqlErrm = Option(e.getMessage).getOrElse("")

  /**
   * Set auto-commit mode.
   */
  def setAutoCommit(auto: Boolean): Unit =
    try
      connection.foreach(_.setAutoCommit(auto))
    catch
      case _: SQLException => // Ignore

  /**
   * Get current SQLCODE.
   */
  def getSqlCode: Int = sqlCode

  /**
   * Get current SQLSTATE.
   */
  def getSqlState: String = sqlState

  /**
   * Get current SQLERRM (error message).
   */
  def getSqlErrm: String = sqlErrm

  /**
   * Create a cursor for the given SQL.
   */
  def cursor[T](sql: String, mapper: ResultSet => T): Option[CobolCursor[T]] =
    connection.map(conn => new CobolCursor(conn, sql, mapper))

  private def setParameters(ps: PreparedStatement, params: Seq[Any]): Unit =
    params.zipWithIndex.foreach { (param, idx) =>
      val paramIdx = idx + 1
      param match
        case null => ps.setNull(paramIdx, Types.NULL)
        case s: String => ps.setString(paramIdx, s)
        case i: Int => ps.setInt(paramIdx, i)
        case l: Long => ps.setLong(paramIdx, l)
        case d: Double => ps.setDouble(paramIdx, d)
        case f: Float => ps.setFloat(paramIdx, f)
        case bd: BigDecimal => ps.setBigDecimal(paramIdx, bd.bigDecimal)
        case jbd: java.math.BigDecimal => ps.setBigDecimal(paramIdx, jbd)
        case b: Boolean => ps.setBoolean(paramIdx, b)
        case bytes: Array[Byte] => ps.setBytes(paramIdx, bytes)
        case date: java.sql.Date => ps.setDate(paramIdx, date)
        case time: java.sql.Time => ps.setTime(paramIdx, time)
        case ts: java.sql.Timestamp => ps.setTimestamp(paramIdx, ts)
        case other => ps.setObject(paramIdx, other)
    }

/**
 * SQL Communication Area abstraction (SQLCA).
 */
case class SqlCa(
  sqlCode: Int = 0,
  sqlState: String = "00000",
  sqlErrm: String = "",
  sqlErrd: Array[Int] = Array.fill(6)(0),
  sqlWarn: String = "        "
):
  def isSuccess: Boolean = sqlCode == 0
  def isNotFound: Boolean = sqlCode == 100
  def isError: Boolean = sqlCode < 0
  def isWarning: Boolean = sqlCode > 0 && sqlCode < 100
  def rowCount: Int = sqlErrd(2) // Third element typically contains row count

object SqlCa:
  def success: SqlCa = SqlCa()
  def notFound: SqlCa = SqlCa(sqlCode = 100, sqlState = "02000")
  def error(code: Int, state: String, message: String): SqlCa =
    SqlCa(sqlCode = code, sqlState = state, sqlErrm = message)

  def fromException(e: SQLException): SqlCa =
    SqlCa(
      sqlCode = e.getErrorCode,
      sqlState = Option(e.getSQLState).getOrElse("HY000"),
      sqlErrm = Option(e.getMessage).getOrElse("")
    )
