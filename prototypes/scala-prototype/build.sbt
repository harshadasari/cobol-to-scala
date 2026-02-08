val scala3Version = "3.3.4"

lazy val root = project
  .in(file("."))
  .settings(
    name := "cobol2scala",
    version := "0.1.0-SNAPSHOT",
    scalaVersion := scala3Version,

    // Compiler options
    scalacOptions ++= Seq(
      "-deprecation",
      "-feature",
      "-unchecked",
      "-Xfatal-warnings",
      "-language:implicitConversions"
    ),

    // Dependencies
    libraryDependencies ++= Seq(
      // Parser combinator library
      "com.lihaoyi" %% "fastparse" % "3.0.2",

      // CLI library
      "com.monovore" %% "decline" % "2.4.1",
      "com.monovore" %% "decline-effect" % "2.4.1",

      // HTTP client for AI integration
      "com.softwaremill.sttp.client3" %% "core" % "3.9.1",
      "com.softwaremill.sttp.client3" %% "circe" % "3.9.1",

      // JSON parsing
      "io.circe" %% "circe-core" % "0.14.6",
      "io.circe" %% "circe-generic" % "0.14.6",
      "io.circe" %% "circe-parser" % "0.14.6",

      // Logging
      "com.typesafe.scala-logging" %% "scala-logging" % "3.9.5",
      "ch.qos.logback" % "logback-classic" % "1.4.14",

      // Testing
      "org.scalatest" %% "scalatest" % "3.2.17" % Test,
      "org.scalatestplus" %% "scalacheck-1-17" % "3.2.17.0" % Test,
      "org.scalacheck" %% "scalacheck" % "1.17.0" % Test
    ),

    // Assembly settings for creating fat JAR
    assembly / assemblyJarName := "cobol2scala.jar",
    assembly / mainClass := Some("com.cobol2scala.Main"),

    // Merge strategy for assembly
    assembly / assemblyMergeStrategy := {
      case PathList("META-INF", xs @ _*) => MergeStrategy.discard
      case "module-info.class" => MergeStrategy.discard
      case x => MergeStrategy.first
    }
  )
