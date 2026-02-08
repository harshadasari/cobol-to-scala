import { GitHubIngestion } from '../../packages/github-ingestion/index.js';
import { BatchProcessor } from '../../core/processing/batch-processor.js';
import { DependencyAnalyzer } from '../../packages/cobol-analysis/analyzers/dependency.analyzer.js';
import { FlowAnalyzer } from '../../packages/cobol-analysis/analyzers/flow.analyzer.js';
import { SummaryAnalyzer } from '../../packages/cobol-analysis/analyzers/summary.analyzer.js';
import { JclParser } from '../../packages/cobol-analysis/parsers/jcl.parser.js';
import { FileDetector } from '../../packages/cobol-analysis/parsers/file-detector.js';
import { CacheService } from '../../core/cache/cache.service.js';
import { CacheManager } from '../../packages/github-ingestion/utils/cache-manager.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Analysis Controller
 * Handles analysis requests and orchestrates the analysis pipeline
 */
export class AnalysisController {
  constructor(analysisQueue) {
    this.analysisQueue = analysisQueue;
    this.cache = new CacheService();
    this.githubCache = new CacheManager({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined
    });
  }

  /**
   * Start analysis (async job)
   */
  async startAnalysis(req, res) {
    try {
      const { repoUrl, branch = 'main' } = req.body;

      if (!repoUrl) {
        return res.status(400).json({ error: 'repoUrl is required' });
      }

      // NO CACHE CHECK - Always create fresh analysis job
      // User requested no caching - always get fresh data from GitHub

      // Add job to queue with job name 'analysis'
      const job = await this.analysisQueue.add('analysis', {
        repoUrl,
        branch
      }, {
        jobId: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      });

      res.json({
        jobId: job.id,
        status: 'queued',
        message: 'Analysis job queued successfully'
      });
    } catch (error) {
      console.error('Error starting analysis:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(req, res) {
    try {
      const { jobId } = req.params;
      const job = await this.analysisQueue.getJob(jobId);

      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const state = await job.getState();
      const progress = job.progress || {};
      
      // Map Bull states to frontend statuses
      let status = state;
      if (state === 'completed') {
        status = 'complete';
      } else if (state === 'active') {
        status = 'processing';
      } else if (state === 'waiting' || state === 'delayed') {
        status = 'queued';
      }
      
      // Include error information if job failed
      const response = {
        jobId,
        status: status,
        progress: progress
      };
      
      if (state === 'failed') {
        response.error = job.failedReason || 'Job failed';
      }

      res.json(response);
    } catch (error) {
      console.error('Error getting job status:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get job result
   */
  async getJobResult(req, res) {
    try {
      const { jobId } = req.params;
      const job = await this.analysisQueue.getJob(jobId);

      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const state = await job.getState();

      if (state === 'completed') {
        const result = job.returnvalue;
        // #region agent log
        const sampleNode = result?.dependencyGraph?.nodes?.[0];
        fetch('http://127.0.0.1:7242/ingest/0423fc58-f186-4cd7-8469-e50b73c0f1dc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'analysis.controller.js:129',message:'getJobResult returning',data:{jobId,nodeCount:result?.dependencyGraph?.nodes?.length||0,sampleNodeName:sampleNode?.name,sampleNodeContentLength:sampleNode?.content?.length||0,sampleNodeContentLines:sampleNode?.content?.split('\n').length||0,sampleNodeMetadataLines:sampleNode?.metadata?.lines,hasSampleContent:!!sampleNode?.content},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        
        // Verify content before sending response
        const responseNodes = result?.dependencyGraph?.nodes || [];
        const responseProgramNodes = responseNodes.filter(n => n.type === 'program' && n.filePath);
        const responseWithoutContent = responseProgramNodes.filter(n => !n.content || !n.content.trim());
        if (responseWithoutContent.length > 0) {
          console.error(`[AnalysisController] getJobResult: ${responseWithoutContent.length} programs missing content in response:`, responseWithoutContent.map(n => n.name));
        } else {
          console.log(`[AnalysisController] getJobResult: All ${responseProgramNodes.length} programs have content in response`);
        }
        
        res.json({
          jobId,
          status: 'complete',
          result: result
        });
      } else if (state === 'failed') {
        res.status(500).json({
          jobId,
          status: 'failed',
          error: job.failedReason
        });
      } else {
        res.json({
          jobId,
          status: state,
          message: 'Job is still processing'
        });
      }
    } catch (error) {
      console.error('Error getting job result:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Process analysis job (called by worker)
   */
  async processAnalysis(job) {
    const { repoUrl, branch } = job.data;
    
    try {
      // Update progress
      await job.progress(0);

      // Step 1: Discover repository (resolves branch to default if needed)
      const githubIngestion = new GitHubIngestion();
      const discovery = await githubIngestion.discoverRepository(repoUrl, branch);
      const resolvedBranch = discovery.branch; // Use resolved branch
      await job.progress(10);

      // Step 2: Fetch files (use resolved branch)
      const files = await githubIngestion.fetchFiles(
        discovery.files,
        repoUrl,
        resolvedBranch
      );
      await job.progress(30);

      // Step 3: Process files in batches
      const batchProcessor = new BatchProcessor({
        workerSize: 4,
        chunkSize: 1000
      });

      const onProgress = async (progress) => {
        const percentage = 30 + (progress.percentage * 0.5); // 30-80%
        await job.progress(Math.round(percentage));
      };

      const { programs, graph } = await batchProcessor.process(
        files,
        'cobol',
        onProgress
      );

      await job.progress(80);

      // Step 4: Separate JCL files
      const jclFiles = files.filter(f => FileDetector.isJcl(f.path));
      const jclData = jclFiles.map(jcl => 
        JclParser.parse(jcl.path, jcl.content || '')
      );

      // Step 5: Analyze dependencies
      const dependencyAnalyzer = new DependencyAnalyzer();
      const dependencyResult = dependencyAnalyzer.analyze(programs);

      // Step 6: Identify flows
      const flowAnalyzer = new FlowAnalyzer();
      const flows = flowAnalyzer.identifyFlows(
        dependencyResult.graph,
        jclData
      );

      // Step 7: Generate summary
      const summaryAnalyzer = new SummaryAnalyzer();
      const summary = summaryAnalyzer.generate(
        flows,
        dependencyResult.graph,
        programs
      );

      const result = summaryAnalyzer.formatOutput(
        summary,
        flows,
        dependencyResult.graph
      );

      // Validate that all program nodes have content before caching
      const nodes = result?.dependencyGraph?.nodes || [];
      const programNodes = nodes.filter(n => n.type === 'program' && n.filePath);
      const programsWithoutContent = programNodes.filter(n => !n.content || !n.content.trim());
      
      // Detailed logging to debug content issue
      console.log(`[AnalysisController] Validation check: Total nodes: ${nodes.length}, Program nodes: ${programNodes.length}`);
      programNodes.forEach(n => {
        console.log(`[AnalysisController]   - ${n.name}: hasContent=${!!n.content}, contentLength=${n.content?.length || 0}, hasFilePath=${!!n.filePath}`);
      });
      
      if (programsWithoutContent.length > 0) {
        console.error(`[AnalysisController] ERROR: Fresh analysis missing content for ${programsWithoutContent.length} programs:`, programsWithoutContent.map(n => n.name));
        console.error(`[AnalysisController] This indicates a problem in the analysis pipeline - files may not be fetched correctly from GitHub`);
        // Continue anyway, but log the error
      } else {
        console.log(`[AnalysisController] All ${programNodes.length} program nodes have content - validation passed`);
        // Verify content is in the serialized JSON
        const testSerialized = JSON.stringify(result);
        const testParsed = JSON.parse(testSerialized);
        const testNodes = testParsed?.dependencyGraph?.nodes || [];
        const testProgramNodes = testNodes.filter(n => n.type === 'program' && n.filePath);
        const testWithoutContent = testProgramNodes.filter(n => !n.content || !n.content.trim());
        if (testWithoutContent.length > 0) {
          console.error(`[AnalysisController] CRITICAL: Content lost during JSON serialization! ${testWithoutContent.length} programs missing after stringify/parse:`, testWithoutContent.map(n => n.name));
        } else {
          console.log(`[AnalysisController] Content preserved after JSON serialization - all ${testProgramNodes.length} programs have content`);
        }
      }

      await job.progress(100);

      // Cache result (use resolved branch)
      const cacheKey = this.cache.getAnalysisKey(repoUrl, resolvedBranch);
      await this.cache.set(cacheKey, result, 3600);

      return result;
    } catch (error) {
      console.error('Error processing analysis:', error);
      throw error;
    }
  }

  /**
   * Clear all cache
   */
  async clearCache(req, res) {
    try {
      const cacheResult = await this.cache.clearAll();
      const githubCacheResult = await this.githubCache.clearAll();
      
      res.json({
        success: true,
        message: 'Cache cleared successfully',
        cache: cacheResult,
        githubCache: githubCacheResult
      });
    } catch (error) {
      console.error('Error clearing cache:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

export default AnalysisController;

