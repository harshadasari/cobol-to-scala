/**
 * Conversion API Service for COBOL to Scala conversion
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

export interface ConversionOptions {
  packageName?: string;
  generateMain?: boolean;
  includeComments?: boolean;
  indentSize?: number;
}

export interface ConversionResult {
  scala: string;
  suggestedFileName: string;
  ast?: {
    dataItems?: any;
    procedures?: any;
    sqlBlocks?: any[];
  };
  errors?: string[];
  warnings?: string[];
}

export interface ParseResult {
  ast: any;
  tokens?: any[];
  errors?: string[];
}

export interface RuntimeFile {
  name: string;
  content: string;
}

export interface RuntimeResult {
  files: RuntimeFile[];
}

export interface BatchFile {
  name: string;
  content: string;
}

export interface BatchResult {
  results: Array<{
    inputFile: string;
    outputFile: string;
    scala: string;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Convert COBOL source code to Scala
 */
export async function convertToScala(
  source: string,
  options?: ConversionOptions
): Promise<ConversionResult> {
  const response = await fetch(`${API_BASE_URL}/api/convert/scala`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ source, options }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Conversion failed' }));
    throw new Error(error.error || 'Failed to convert COBOL to Scala');
  }

  return response.json();
}

/**
 * Parse COBOL source code to AST
 */
export async function parseCobol(source: string): Promise<ParseResult> {
  const response = await fetch(`${API_BASE_URL}/api/convert/parse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ source }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Parse failed' }));
    throw new Error(error.error || 'Failed to parse COBOL');
  }

  return response.json();
}

/**
 * Batch convert multiple COBOL files to Scala
 */
export async function convertBatch(
  files: BatchFile[],
  options?: ConversionOptions
): Promise<BatchResult> {
  const response = await fetch(`${API_BASE_URL}/api/convert/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files, options }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Batch conversion failed' }));
    throw new Error(error.error || 'Failed to batch convert');
  }

  return response.json();
}

/**
 * Get runtime library files
 */
export async function getRuntimeFiles(): Promise<RuntimeResult> {
  const response = await fetch(`${API_BASE_URL}/api/convert/runtime`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to get runtime' }));
    throw new Error(error.error || 'Failed to get runtime library');
  }

  return response.json();
}

// Sample COBOL program for demo
export const SAMPLE_COBOL = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. SAMPLE.
       AUTHOR. DEMO.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  CUSTOMER-RECORD.
           05  CUST-ID            PIC 9(10).
           05  CUST-NAME          PIC X(50).
           05  CUST-BALANCE       PIC S9(9)V99 COMP-3.
           05  CUST-STATUS        PIC X(01).
               88  STATUS-ACTIVE      VALUE 'A'.
               88  STATUS-CLOSED      VALUE 'C'.
      *
       PROCEDURE DIVISION.
       0000-MAIN.
           DISPLAY "Hello from COBOL"
           IF CUST-BALANCE > 1000
               DISPLAY "High value customer"
           END-IF
           STOP RUN.
`;
