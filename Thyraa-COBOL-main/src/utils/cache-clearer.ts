/**
 * Utility to clear frontend cache (sessionStorage)
 */
export function clearAnalysisCache() {
  const keysToRemove: string[] = [];
  
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && (key.startsWith('analysis_result_') || key === 'analysis_result')) {
      keysToRemove.push(key);
    }
  }
  
  keysToRemove.forEach(key => {
    sessionStorage.removeItem(key);
  });
  
  return keysToRemove.length;
}

/**
 * Clear backend cache via API
 * Uses relative URL which will be proxied by Vite dev server
 */
export async function clearBackendCache(): Promise<{ success: boolean; message?: string }> {
  try {
    const response = await fetch('/api/analyze/cache', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to clear cache: ${response.statusText}`);
    }
    
    const result = await response.json();
    return { success: true, ...result };
  } catch (error) {
    console.error('Error clearing backend cache:', error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Clear all cache (frontend + backend)
 */
export async function clearAllCache() {
  const frontendCleared = clearAnalysisCache();
  const backendResult = await clearBackendCache();
  
  return {
    frontend: { cleared: frontendCleared, success: true },
    backend: backendResult
  };
}

