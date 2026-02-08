// Script to clear frontend sessionStorage
// Run this in the browser console or add to your app

function clearFrontendCache() {
  // Clear all sessionStorage items related to analysis
  const keysToRemove = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && (key.startsWith('analysis_result_') || key.startsWith('analysis_result'))) {
      keysToRemove.push(key);
    }
  }
  
  keysToRemove.forEach(key => {
    sessionStorage.removeItem(key);
    console.log(`Removed: ${key}`);
  });
  
  console.log(`Cleared ${keysToRemove.length} items from sessionStorage`);
  return keysToRemove.length;
}

// Auto-run if in browser
if (typeof window !== 'undefined') {
  const cleared = clearFrontendCache();
  alert(`Cleared ${cleared} items from sessionStorage`);
} else {
  console.log('Run this in browser console: clearFrontendCache()');
}

export default clearFrontendCache;

