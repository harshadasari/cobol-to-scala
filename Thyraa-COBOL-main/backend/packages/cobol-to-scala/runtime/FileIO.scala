package com.thyraa.cobol.runtime

import java.io.*
import java.nio.file.{Files, Paths, StandardOpenOption}
import scala.util.{Try, Using, Success, Failure}
import scala.collection.mutable

/**
 * Sequential file abstraction for COBOL file I/O.
 * Supports fixed-length record format.
 */
class CobolSequentialFile[T](
  path: String,
  recordLength: Int,
  parser: Array[Byte] => T,
  formatter: T => Array[Byte]
):
  private var inputStream: Option[BufferedInputStream] = None
  private var outputStream: Option[BufferedOutputStream] = None
  private var fileStatus: String = FileStatus.Success
  private var endOfFile: Boolean = false
  private var openMode: String = ""

  /**
   * Open file for input (reading).
   */
  def openInput(): Unit =
    try
      val file = new File(path)
      if !file.exists() then
        fileStatus = FileStatus.FileNotFound
      else
        inputStream = Some(new BufferedInputStream(new FileInputStream(file)))
        openMode = "INPUT"
        fileStatus = FileStatus.Success
        endOfFile = false
    catch
      case e: FileNotFoundException =>
        fileStatus = FileStatus.FileNotFound
      case e: Exception =>
        fileStatus = "90" // General I/O error

  /**
   * Open file for output (writing, creates or overwrites).
   */
  def openOutput(): Unit =
    try
      val file = new File(path)
      file.getParentFile match
        case null => // No parent directory
        case parent => parent.mkdirs()
      outputStream = Some(new BufferedOutputStream(new FileOutputStream(file, false)))
      openMode = "OUTPUT"
      fileStatus = FileStatus.Success
    catch
      case e: Exception =>
        fileStatus = "90"

  /**
   * Open file for extend (appending).
   */
  def openExtend(): Unit =
    try
      val file = new File(path)
      file.getParentFile match
        case null =>
        case parent => parent.mkdirs()
      outputStream = Some(new BufferedOutputStream(new FileOutputStream(file, true)))
      openMode = "EXTEND"
      fileStatus = FileStatus.Success
    catch
      case e: Exception =>
        fileStatus = "90"

  /**
   * Open file for I/O (reading and writing).
   */
  def openIO(): Unit =
    try
      val file = new File(path)
      if !file.exists() then
        fileStatus = FileStatus.FileNotFound
      else
        val raf = new RandomAccessFile(file, "rw")
        inputStream = Some(new BufferedInputStream(new FileInputStream(file)))
        outputStream = Some(new BufferedOutputStream(new FileOutputStream(file, true)))
        openMode = "I-O"
        fileStatus = FileStatus.Success
        endOfFile = false
    catch
      case e: FileNotFoundException =>
        fileStatus = FileStatus.FileNotFound
      case e: Exception =>
        fileStatus = "90"

  /**
   * Close the file.
   */
  def close(): Unit =
    try
      inputStream.foreach(_.close())
      outputStream.foreach(_.close())
      inputStream = None
      outputStream = None
      openMode = ""
      fileStatus = FileStatus.Success
    catch
      case e: Exception =>
        fileStatus = "90"

  /**
   * Read next record from file.
   * Returns None at end of file.
   */
  def read(): Option[T] =
    inputStream match
      case None =>
        fileStatus = "47" // File not open for read
        None
      case Some(is) =>
        try
          val buffer = new Array[Byte](recordLength)
          val bytesRead = is.read(buffer)
          if bytesRead == -1 then
            endOfFile = true
            fileStatus = FileStatus.AtEnd
            None
          else if bytesRead < recordLength then
            // Partial record at end - pad with spaces
            for i <- bytesRead until recordLength do
              buffer(i) = ' '.toByte
            fileStatus = FileStatus.Success
            Some(parser(buffer))
          else
            fileStatus = FileStatus.Success
            Some(parser(buffer))
        catch
          case e: Exception =>
            fileStatus = "90"
            None

  /**
   * Write a record to file.
   */
  def write(record: T): Unit =
    outputStream match
      case None =>
        fileStatus = "48" // File not open for write
      case Some(os) =>
        try
          val bytes = formatter(record)
          val paddedBytes = if bytes.length < recordLength then
            bytes ++ Array.fill(recordLength - bytes.length)(' '.toByte)
          else
            bytes.take(recordLength)
          os.write(paddedBytes)
          fileStatus = FileStatus.Success
        catch
          case e: Exception =>
            fileStatus = "90"

  /**
   * Rewrite the current record (requires prior read in I-O mode).
   */
  def rewrite(record: T): Unit =
    if openMode != "I-O" then
      fileStatus = "49" // REWRITE without proper open
    else
      write(record)

  /**
   * Get current file status code.
   */
  def status: String = fileStatus

  /**
   * Check if at end of file.
   */
  def atEnd: Boolean = endOfFile

  /**
   * Flush output buffer.
   */
  def flush(): Unit =
    outputStream.foreach(_.flush())

/**
 * Indexed file abstraction (VSAM KSDS style).
 * Uses an in-memory index backed by a sequential file.
 */
class CobolIndexedFile[K, T](
  path: String,
  recordLength: Int,
  keyExtractor: T => K,
  parser: Array[Byte] => T,
  formatter: T => Array[Byte]
)(using ord: Ordering[K]):
  private var fileStatus: String = FileStatus.Success
  private var isOpen: Boolean = false
  private var index: mutable.TreeMap[K, Long] = mutable.TreeMap.empty
  private var records: mutable.TreeMap[K, T] = mutable.TreeMap.empty
  private var currentIterator: Option[Iterator[(K, T)]] = None
  private var currentKey: Option[K] = None

  /**
   * Open file for input/output operations.
   */
  def openInputOutput(): Unit =
    try
      val file = new File(path)
      if file.exists() then
        // Load existing records into memory
        val is = new BufferedInputStream(new FileInputStream(file))
        try
          var position = 0L
          val buffer = new Array[Byte](recordLength)
          var bytesRead = is.read(buffer)
          while bytesRead != -1 do
            if bytesRead == recordLength then
              val record = parser(buffer)
              val key = keyExtractor(record)
              records.put(key, record)
              index.put(key, position)
            position += recordLength
            bytesRead = is.read(buffer)
          end while
        finally
          is.close()
      else
        file.getParentFile match
          case null =>
          case parent => parent.mkdirs()
        file.createNewFile()
      isOpen = true
      fileStatus = FileStatus.Success
    catch
      case e: Exception =>
        fileStatus = "90"

  /**
   * Open file for input only.
   */
  def openInput(): Unit =
    try
      val file = new File(path)
      if !file.exists() then
        fileStatus = FileStatus.FileNotFound
      else
        openInputOutput()
    catch
      case e: Exception =>
        fileStatus = "90"

  /**
   * Close the file and persist changes.
   */
  def close(): Unit =
    if isOpen then
      try
        // Write all records back to file
        val os = new BufferedOutputStream(new FileOutputStream(path, false))
        try
          for (key, record) <- records.toSeq.sortBy(_._1) do
            val bytes = formatter(record)
            val paddedBytes = if bytes.length < recordLength then
              bytes ++ Array.fill(recordLength - bytes.length)(' '.toByte)
            else
              bytes.take(recordLength)
            os.write(paddedBytes)
        finally
          os.close()
        isOpen = false
        records.clear()
        index.clear()
        currentIterator = None
        fileStatus = FileStatus.Success
      catch
        case e: Exception =>
          fileStatus = "90"

  /**
   * Read record by key.
   */
  def read(key: K): Option[T] =
    if !isOpen then
      fileStatus = "47"
      None
    else
      records.get(key) match
        case Some(record) =>
          currentKey = Some(key)
          fileStatus = FileStatus.Success
          Some(record)
        case None =>
          fileStatus = FileStatus.KeyNotFound
          None

  /**
   * Write a new record.
   */
  def write(record: T): Unit =
    if !isOpen then
      fileStatus = "48"
    else
      val key = keyExtractor(record)
      if records.contains(key) then
        fileStatus = FileStatus.DuplicateKey
      else
        records.put(key, record)
        index.put(key, records.size * recordLength)
        fileStatus = FileStatus.Success

  /**
   * Rewrite (update) existing record.
   */
  def rewrite(record: T): Unit =
    if !isOpen then
      fileStatus = "49"
    else
      val key = keyExtractor(record)
      if !records.contains(key) then
        fileStatus = FileStatus.KeyNotFound
      else
        records.put(key, record)
        fileStatus = FileStatus.Success

  /**
   * Delete record by key.
   */
  def delete(key: K): Unit =
    if !isOpen then
      fileStatus = "49"
    else if !records.contains(key) then
      fileStatus = FileStatus.KeyNotFound
    else
      records.remove(key)
      index.remove(key)
      fileStatus = FileStatus.Success

  /**
   * Position for sequential access starting at key.
   * @param operator: "=" (equal), ">=" (not less than), ">" (greater than)
   */
  def start(key: K, operator: String = "="): Boolean =
    if !isOpen then
      fileStatus = "47"
      false
    else
      val filtered = operator match
        case "=" | "EQUAL" =>
          records.from(key).takeWhile((k, _) => ord.equiv(k, key))
        case ">=" | "NOT LESS" | "NOT <" =>
          records.from(key)
        case ">" | "GREATER" =>
          records.from(key).dropWhile((k, _) => ord.lteq(k, key))
        case "<=" | "NOT GREATER" | "NOT >" =>
          records.to(key)
        case "<" | "LESS" =>
          records.until(key)
        case _ =>
          records.from(key)

      if filtered.isEmpty then
        fileStatus = FileStatus.KeyNotFound
        currentIterator = None
        false
      else
        currentIterator = Some(filtered.iterator)
        fileStatus = FileStatus.Success
        true

  /**
   * Read next record in sequence.
   */
  def readNext(): Option[T] =
    currentIterator match
      case None =>
        // If no START was issued, iterate from beginning
        currentIterator = Some(records.iterator)
        readNext()
      case Some(iter) =>
        if iter.hasNext then
          val (key, record) = iter.next()
          currentKey = Some(key)
          fileStatus = FileStatus.Success
          Some(record)
        else
          fileStatus = FileStatus.AtEnd
          None

  /**
   * Get current file status code.
   */
  def status: String = fileStatus

/**
 * File status codes following COBOL conventions.
 */
object FileStatus:
  val Success = "00"
  val AtEnd = "10"
  val DuplicateKey = "22"
  val KeyNotFound = "23"
  val BoundaryViolation = "34"
  val FileNotFound = "35"
  val OpenError = "39"
  val LogicError = "41"
  val AlreadyOpen = "42"
  val NotOpen = "46"
  val ReadNotOpen = "47"
  val WriteNotOpen = "48"
  val RewriteNotOpen = "49"
  val RecordLocked = "51"
  val IoError = "90"
  val UnknownError = "99"

  /**
   * Check if status indicates success.
   */
  def isSuccess(status: String): Boolean =
    status == Success || status == AtEnd

  /**
   * Get description for status code.
   */
  def description(status: String): String =
    status match
      case "00" => "Successful completion"
      case "10" => "End of file reached"
      case "22" => "Duplicate key"
      case "23" => "Record not found"
      case "34" => "Boundary violation"
      case "35" => "File not found"
      case "39" => "File attributes conflict"
      case "41" => "File already open"
      case "42" => "File not open"
      case "46" => "Read attempted on file not open"
      case "47" => "Read attempted on file not open for input"
      case "48" => "Write attempted on file not open for output"
      case "49" => "Rewrite/Delete attempted improperly"
      case "51" => "Record locked by another user"
      case "90" => "General I/O error"
      case _ => s"Unknown status: $status"

/**
 * Line sequential file for text-based records.
 */
class CobolLineSequentialFile[T](
  path: String,
  parser: String => T,
  formatter: T => String
):
  private var reader: Option[BufferedReader] = None
  private var writer: Option[PrintWriter] = None
  private var fileStatus: String = FileStatus.Success
  private var endOfFile: Boolean = false

  def openInput(): Unit =
    try
      val file = new File(path)
      if !file.exists() then
        fileStatus = FileStatus.FileNotFound
      else
        reader = Some(new BufferedReader(new FileReader(file)))
        fileStatus = FileStatus.Success
        endOfFile = false
    catch
      case e: Exception =>
        fileStatus = "90"

  def openOutput(): Unit =
    try
      val file = new File(path)
      file.getParentFile match
        case null =>
        case parent => parent.mkdirs()
      writer = Some(new PrintWriter(new FileWriter(file, false)))
      fileStatus = FileStatus.Success
    catch
      case e: Exception =>
        fileStatus = "90"

  def close(): Unit =
    try
      reader.foreach(_.close())
      writer.foreach(_.close())
      reader = None
      writer = None
      fileStatus = FileStatus.Success
    catch
      case e: Exception =>
        fileStatus = "90"

  def read(): Option[T] =
    reader match
      case None =>
        fileStatus = "47"
        None
      case Some(r) =>
        try
          Option(r.readLine()) match
            case Some(line) =>
              fileStatus = FileStatus.Success
              Some(parser(line))
            case None =>
              endOfFile = true
              fileStatus = FileStatus.AtEnd
              None
        catch
          case e: Exception =>
            fileStatus = "90"
            None

  def write(record: T): Unit =
    writer match
      case None =>
        fileStatus = "48"
      case Some(w) =>
        try
          w.println(formatter(record))
          fileStatus = FileStatus.Success
        catch
          case e: Exception =>
            fileStatus = "90"

  def status: String = fileStatus
  def atEnd: Boolean = endOfFile
