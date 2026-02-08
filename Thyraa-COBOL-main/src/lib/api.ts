/**
 * API Service for Backend Communication
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

export interface AnalysisJob {
  jobId: string;
  status: 'queued' | 'processing' | 'complete' | 'failed';
  message?: string;
}

export interface AnalysisStatus {
  jobId: string;
  status: 'queued' | 'processing' | 'complete' | 'failed';
  progress?: {
    processed: number;
    total: number;
    percentage: number;
  };
}

export interface AnalysisResult {
  jobId: string;
  status: 'complete';
  result: {
    summary: {
      cobolPrograms: number;
      copybooks: number;
      batchFlows: number;
      dependenciesMapped: number;
    };
    flows: any[];
    dependencyGraph: any;
  };
}

/**
 * Start analysis of a GitHub repository
 */
export async function startAnalysis(repoUrl: string, branch: string = 'main'): Promise<AnalysisJob> {
  const response = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ repoUrl, branch }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to start analysis');
  }

  return response.json();
}

/**
 * Get analysis job status
 */
export async function getAnalysisStatus(jobId: string): Promise<AnalysisStatus> {
  const response = await fetch(`${API_BASE_URL}/api/analyze/${jobId}/status`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get analysis status');
  }

  return response.json();
}

/**
 * Get analysis result
 */
export async function getAnalysisResult(jobId: string): Promise<AnalysisResult> {
  const response = await fetch(`${API_BASE_URL}/api/analyze/${jobId}/result`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get analysis result');
  }

  return response.json();
}

/**
 * Poll for analysis result
 */
export async function pollAnalysisResult(
  jobId: string,
  onProgress?: (status: AnalysisStatus) => void,
  interval: number = 2000
): Promise<AnalysisResult> {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const status = await getAnalysisStatus(jobId);
        
        if (onProgress) {
          onProgress(status);
        }

        if (status.status === 'complete') {
          const result = await getAnalysisResult(jobId);
          resolve(result);
        } else if (status.status === 'failed') {
          // Try to get the error details from the job
          try {
            const errorResponse = await fetch(`${API_BASE_URL}/api/analyze/${jobId}/result`);
            if (errorResponse.ok) {
              const errorData = await errorResponse.json();
              reject(new Error(errorData.error || 'Analysis failed'));
            } else {
              const errorData = await errorResponse.json().catch(() => ({}));
              reject(new Error(errorData.error || 'Analysis failed - check backend logs'));
            }
          } catch (error: any) {
            reject(new Error(error.message || 'Analysis failed - check backend logs for details'));
          }
        } else {
          // Continue polling
          setTimeout(poll, interval);
        }
      } catch (error) {
        reject(error);
      }
    };

    poll();
  });
}

