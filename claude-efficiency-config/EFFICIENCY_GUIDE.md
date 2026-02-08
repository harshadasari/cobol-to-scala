# Claude Code Efficiency Guide
## Complete Control & Optimization Without Budget Limits

This guide shows you how to maximize efficiency and minimize costs using **configuration**, **smart patterns**, and **workflow optimization**.

---

## Quick Start

### 1. Load Your Configuration

```bash
# In your workspace
source claude-load.sh

# Verify settings loaded
cstatus
```

### 2. Use Smart Aliases

```bash
ch "read auth.ts"              # Haiku for simple ops
cs "refactor auth service"      # Sonnet for medium complexity
co "design new API architecture" # Opus for complex work
```

---

## Configuration-Driven Efficiency

### Model Selection Strategy (workspace.env)

```bash
# Set defaults for different operation types
CLAUDE_DEFAULT_MODEL=haiku           # Most operations
CLAUDE_FILE_OPS_MODEL=haiku          # Read/write files
CLAUDE_CODE_GEN_MODEL=haiku          # Generate code
CLAUDE_DEBUG_MODEL=sonnet            # Debug issues
CLAUDE_DESIGN_MODEL=opus             # Architecture decisions

# Auto-select based on keywords
CLAUDE_AUTO_SELECT_MODEL=true
CLAUDE_OPUS_KEYWORDS="design,architect,optimize,performance,security"
CLAUDE_HAIKU_KEYWORDS="format,lint,test,run,read"
```

**How it works:**
- Prompt with "design API" → Auto uses Opus
- Prompt with "run tests" → Auto uses Haiku
- Saves you from manually choosing each time

### Automatic Optimizations

```bash
# Enable smart behaviors
CLAUDE_GREP_FIRST=true               # Auto-Grep before Read
CLAUDE_USE_GLOB=true                 # Prefer Glob over find
CLAUDE_BATCH_FILES=true              # Batch similar operations
CLAUDE_PREFER_LINE_READS=true        # Read specific lines only

# Limit expensive operations
CLAUDE_MAX_FILES_PER_REQUEST=5       # Prevent reading too many files
CLAUDE_MAX_FILE_SIZE_KB=500          # Skip huge files
```

**Example Impact:**
```bash
# Without config:
claude "find authentication code"
→ Reads 50 files, costs $2.50

# With CLAUDE_GREP_FIRST=true:
claude "find authentication code"
→ Greps first, reads 3 files, costs $0.15
```

### Response Control

```bash
# Optimize output length
CLAUDE_RESPONSE_STYLE=concise        # Less verbose
CLAUDE_USE_REFERENCES=true           # Link to code instead of showing it
CLAUDE_SHOW_INSIGHTS=true            # Keep educational content

# Token limits for efficiency
CLAUDE_SIMPLE_OPS_MAX_TOKENS=2000    # Quick operations
CLAUDE_COMPLEX_OPS_MAX_TOKENS=8000   # Detailed work
```

**Before (verbose):**
```
Here's the complete implementation with detailed explanations...
[500 lines of code and explanation]
Cost: $0.80
```

**After (concise):**
```
Implementation at auth.ts:45-120. Key changes:
- Added validation
- Improved error handling
Cost: $0.15
```

---

## Practical Workflows

### Workflow 1: Feature Implementation

**Configuration:**
```bash
CLAUDE_DEFAULT_MODEL=haiku
CLAUDE_DESIGN_MODEL=opus
CLAUDE_AUTO_SELECT_MODEL=true
```

**Steps:**
```bash
# 1. Design (auto-selects Opus)
c "design user profile editing feature with validation"

# 2. Implementation (uses Haiku)
c "implement the profile editor following the design"

# 3. Tests (uses Haiku)
ctest

# 4. Fix issues (uses Haiku)
cfix

# Total: ~$2 (vs $8 without configuration)
```

### Workflow 2: Debugging

**Configuration:**
```bash
CLAUDE_DEBUG_MODEL=sonnet
CLAUDE_GREP_FIRST=true
```

**Steps:**
```bash
# 1. Locate issue (auto-Grep first)
c "find where we handle user session timeout"

# 2. Analyze (uses Sonnet for debugging)
cdebug "session timeout not working, tokens persist after logout"

# 3. Fix (uses Haiku)
c "apply the fix from previous message"

# 4. Verify
ctest

# Total: ~$1.20 (vs $4 without config)
```

### Workflow 3: Code Review

**Configuration:**
```bash
CLAUDE_RESPONSE_STYLE=concise
CLAUDE_USE_REFERENCES=true
```

**Efficient prompt:**
```bash
cs "review auth-service.ts for:
1. Security issues
2. Error handling gaps
3. Type safety
Report top 5 issues only with line numbers"
```

**What NOT to do:**
```bash
# ❌ Expensive
co "review my entire codebase and tell me everything that could be improved"
```

---

## Advanced Optimization Patterns

### Pattern 1: Incremental Context Building

```bash
# Build context once, reuse many times
ch "read: api-design.md, auth-flow.md"

# Now all these reuse the cached context:
c "implement login endpoint per design"
c "implement logout endpoint per design"
c "implement refresh token per design"

# Context cached, saves 70% on follow-ups!
```

### Pattern 2: Targeted File Access

```bash
# ❌ Expensive
c "find the bug in authentication"  # Reads entire auth/ folder

# ✅ Efficient
c "grep 'validateToken' in src/auth/"
c "read auth/token-validator.ts lines 45-80"
c "bug at line 67: token expiry check uses > instead of <"
```

### Pattern 3: Batch Operations

```bash
# ❌ Inefficient (3 separate requests)
c "update import in auth.ts"
c "update import in user.ts"
c "update import in profile.ts"

# ✅ Efficient (1 request)
c "update imports in auth.ts, user.ts, profile.ts:
   change from '../lib' to '@/lib'"
```

### Pattern 4: Progressive Refinement

```bash
# Instead of one huge expensive request:
ch "create basic user API endpoints"        # $0.20
ch "add request validation middleware"       # $0.10
ch "add rate limiting"                       # $0.10
ch "add OpenAPI documentation"               # $0.15
# Total: $0.55

# vs:
co "create production-ready user API with validation,
    rate limiting, security, docs, tests"   # $1.50
```

---

## Configuration Presets

Edit `workspace.env` to quickly switch modes:

### Preset: Ultra Efficient
```bash
CLAUDE_DEFAULT_MODEL=haiku
CLAUDE_RESPONSE_STYLE=concise
CLAUDE_MAX_FILES_PER_REQUEST=3
CLAUDE_AUTO_SELECT_MODEL=true
CLAUDE_GREP_FIRST=true
CLAUDE_USE_REFERENCES=true
```
**When:** Tight deadlines, simple tasks, high volume

### Preset: Balanced Quality
```bash
CLAUDE_DEFAULT_MODEL=haiku
CLAUDE_DEBUG_MODEL=sonnet
CLAUDE_DESIGN_MODEL=opus
CLAUDE_RESPONSE_STYLE=balanced
CLAUDE_AUTO_SELECT_MODEL=true
```
**When:** Normal development (recommended)

### Preset: Quality First
```bash
CLAUDE_DEFAULT_MODEL=sonnet
CLAUDE_CODE_GEN_MODEL=sonnet
CLAUDE_DEBUG_MODEL=opus
CLAUDE_RESPONSE_STYLE=detailed
CLAUDE_SHOW_INSIGHTS=true
```
**When:** Critical features, learning complex patterns

---

## Efficiency Metrics & Tracking

### Monitor Your Usage

```bash
# Check costs anytime
ccost

# View what's in your current context
env | grep CLAUDE_

# See loaded settings
cstatus
```

### Weekly Optimization Review

```bash
# Enable tracking in workspace.env
CLAUDE_TRACK_COSTS=true
CLAUDE_LOG_REQUESTS=true

# Analyze patterns
grep "model=" .claude/requests.log | sort | uniq -c
```

**Look for:**
- Are you using Opus when Haiku would work?
- Are you reading the same files repeatedly?
- Are you being specific enough in prompts?

---

## Common Mistakes & Fixes

### Mistake 1: Reading Too Many Files

**❌ Problem:**
```bash
c "understand the authentication flow"
→ Reads 30 files, $5
```

**✅ Solution (config):**
```bash
CLAUDE_MAX_FILES_PER_REQUEST=5
CLAUDE_GREP_FIRST=true
```
Now it Greps first, reads only relevant files: $0.30

### Mistake 2: Using Wrong Model

**❌ Problem:**
```bash
co "format code"  # Using Opus for simple task
→ $0.80
```

**✅ Solution (config):**
```bash
CLAUDE_AUTO_SELECT_MODEL=true
CLAUDE_HAIKU_KEYWORDS="format,lint,test,run"
```
Now auto-selects Haiku: $0.08 (10x cheaper)

### Mistake 3: Verbose Responses

**❌ Problem:**
```
Detailed explanations when you just need the code
→ 5000 output tokens
```

**✅ Solution (config):**
```bash
CLAUDE_RESPONSE_STYLE=concise
CLAUDE_USE_REFERENCES=true
CLAUDE_SIMPLE_OPS_MAX_TOKENS=2000
```

### Mistake 4: Not Reusing Context

**❌ Problem:**
```bash
c "read auth.ts and explain the flow"
c "read auth.ts and add error handling"  # Re-reads same file
```

**✅ Solution:**
```bash
c "read auth.ts and explain the flow"
c "now add error handling to what we just reviewed"  # Reuses context
```

**Config to help:**
```bash
CLAUDE_CACHE_AGGRESSIVE=true
```

---

## Real-World Examples

### Example 1: Add New Feature ($2 budget)

```bash
# Load efficient config
source claude-load.sh

# Design (auto Opus) - $0.40
c "design file upload feature with progress tracking and validation"

# Implement (Haiku) - $0.60
c "implement FileUpload component following the design.
   Use existing Button and Progress components"

# Tests (Haiku) - $0.35
ctest

# Fix issues (Haiku) - $0.25
cfix

# Format (Haiku) - $0.10
cfmt

# Review (Sonnet) - $0.30
cs "review FileUpload.tsx for edge cases"

# TOTAL: $2.00 ✓
```

### Example 2: Debug Production Issue ($1 budget)

```bash
# Quick locate (Haiku + Grep) - $0.15
cfind "WebSocket connection not closing"

# Deep analysis (Opus) - $0.60
co "analyze WebSocket lifecycle in connection-pool.ts:89-150.
    Connections stay open after client disconnect. Need root cause."

# Apply fix (Haiku) - $0.20
c "implement the fix"

# Verify (Haiku) - $0.05
ctest

# TOTAL: $1.00 ✓
```

---

## Pro Tips

### Tip 1: Use Project-Specific Configs

```bash
# Different workspace.env per project
~/work/api-project/workspace.env        # Backend optimized
~/work/web-app/workspace.env            # Frontend optimized
~/work/data-pipeline/workspace.env      # Data processing optimized
```

### Tip 2: Chain Commands Efficiently

```bash
# ✅ Good (reuses context)
c "grep validateUser in src/" && \
c "read the top 3 matches" && \
c "refactor to async/await"
```

### Tip 3: Use .claudeignore

Already created! Keep it updated:
```bash
# Add project-specific ignores
echo "generated/" >> .claudeignore
echo "*.test.data.json" >> .claudeignore
```

### Tip 4: Quick Model Override

```bash
# Override config for one command
CLAUDE_DEFAULT_MODEL=opus c "complex task"

# Back to default for next command
c "simple task"
```

---

## Keyboard Shortcuts Setup

Add to your IDE/terminal:

```bash
# VSCode keybindings.json
{
  "key": "ctrl+shift+c h",
  "command": "workbench.action.terminal.sendSequence",
  "args": { "text": "ch \"${selectedText}\"" }
}

# Terminal shortcuts (iTerm2/Alacritty)
map ctrl+shift+h send_text "ch '"
map ctrl+shift+o send_text "co '"
```

---

## Summary: Control Without Budgets

✅ **Configuration-Driven**
- Set defaults in `workspace.env`
- Auto-select models based on task
- Automatic optimizations (Grep first, batch ops, etc.)

✅ **Smart Aliases**
- `ch`, `cs`, `co` for quick model switching
- Task-specific: `ctest`, `cfix`, `cfmt`
- Status: `cstatus`, `ccost`

✅ **Workflow Patterns**
- Incremental context building
- Targeted file access
- Batch operations
- Progressive refinement

✅ **Monitoring**
- Track usage with `/cost`
- Log requests for analysis
- Review patterns weekly

---

## Next Steps

1. **Customize** `workspace.env` for your project
2. **Load config**: `source claude-load.sh`
3. **Test it**: Run `cstatus` to verify
4. **Use it**: Start with `ch` for simple tasks
5. **Monitor**: Check `ccost` daily
6. **Optimize**: Adjust settings based on usage

---

**Remember:** Efficiency = Configuration + Smart Prompts + Right Model

No budget limits needed when you have full control! 🚀
