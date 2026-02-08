# 🚀 Get Started with Claude Efficiency Configuration

## What You Now Have

Your workspace now includes a complete efficiency system with **zero budget constraints**, only smart controls:

```
workspace/
├── workspace.env              # Main configuration file (⭐ START HERE)
├── claude-load.sh             # Loads config and creates aliases
├── .claudeignore              # Files to skip (saves costs automatically)
├── EFFICIENCY_GUIDE.md        # Complete guide with examples
├── QUICK_REFERENCE.md         # Printable quick reference
└── .claude-cheatsheet.txt     # Terminal-friendly cheat sheet
```

---

## ⚡ Quick Setup (2 minutes)

### Step 1: Customize Your Config

Open and edit `workspace.env`:

```bash
# Open in your editor
code workspace.env
# or
vim workspace.env
```

**Minimal config** (edit these 3 lines):
```bash
CLAUDE_DEFAULT_MODEL=haiku              # Your default model
CLAUDE_AUTO_SELECT_MODEL=true           # Let Claude pick the right model
CLAUDE_GREP_FIRST=true                  # Auto-search before reading files
```

**Save and close.**

### Step 2: Load the Configuration

```bash
# Load configuration
source claude-load.sh
```

You should see:
```
✨ Claude Code Configuration Loaded
💡 Type 'cstatus' to see current settings
```

### Step 3: Test It

```bash
# Check your settings
cstatus

# Try a simple command
ch "read workspace.env"

# Try auto-selection (should use Haiku)
c "format this file"

# Try auto-selection (should use Opus)
c "design a caching system"
```

### Step 4: Make It Permanent

Add to your shell config so it loads automatically:

```bash
# For zsh (macOS default)
echo "source $(pwd)/claude-load.sh" >> ~/.zshrc

# For bash
echo "source $(pwd)/claude-load.sh" >> ~/.bashrc
```

**Restart your terminal** or run:
```bash
source ~/.zshrc   # or ~/.bashrc
```

---

## 🎯 Your First Efficient Workflow

Let's say you want to add a feature. Here's the cost-optimized approach:

### Before Configuration ❌
```bash
# Using Opus for everything
claude "design and implement login feature"  # $5-8
```

### With Configuration ✅
```bash
# 1. Design (auto-selects Opus)
c "design login feature with validation and error handling"  # $0.40

# 2. Implement (uses Haiku)
ch "implement LoginForm.tsx following the design"  # $0.50

# 3. Test (uses Haiku)
ctest  # $0.20

# 4. Fix (uses Haiku)
cfix  # $0.15

# Total: $1.25 (83% savings!)
```

---

## 📊 Understanding Your Settings

### Model Selection

Your `workspace.env` has different models for different tasks:

```bash
CLAUDE_DEFAULT_MODEL=haiku          # 90% of operations
CLAUDE_FILE_OPS_MODEL=haiku         # Reading/writing files
CLAUDE_CODE_GEN_MODEL=haiku         # Generating code
CLAUDE_DEBUG_MODEL=sonnet           # Debugging (needs more power)
CLAUDE_DESIGN_MODEL=opus            # Architecture (needs most power)
```

**How to use:**
```bash
ch "task"      # Force Haiku
cs "task"      # Force Sonnet
co "task"      # Force Opus
c "task"       # Auto-select based on task
```

### Auto-Optimizations

These happen automatically if enabled:

```bash
CLAUDE_GREP_FIRST=true              # Search before reading files
CLAUDE_USE_GLOB=true                # Use efficient file matching
CLAUDE_BATCH_FILES=true             # Group related operations
CLAUDE_MAX_FILES_PER_REQUEST=5      # Prevent reading too many files
```

**Example:**
```bash
# You type:
c "find authentication logic"

# With CLAUDE_GREP_FIRST=true, it automatically:
# 1. Greps for "authentication"
# 2. Reads only top 5 matching files
# 3. Returns results

# Cost: $0.15 instead of $2.50
```

---

## 🎓 Learning Path

### Day 1: Learn the Basics
```bash
# Read the quick reference
cat QUICK_REFERENCE.md

# Try basic commands
ch "read package.json"
ctest
cstatus
ccost
```

### Day 2: Try Efficient Patterns
```bash
# Use auto-selection
c "design user profile feature"  # Auto picks Opus
c "implement the profile form"   # Auto picks Haiku

# Use Grep-first pattern
cfind "API endpoints"

# Batch operations
c "update imports in: a.ts, b.ts, c.ts"
```

### Day 3: Optimize Your Workflow
```bash
# Review your usage
ccost

# Read the full guide
cat EFFICIENCY_GUIDE.md

# Adjust workspace.env based on your patterns
```

---

## 🎨 Customization Examples

### For Backend Development
```bash
# workspace.env
PROJECT_TYPE=backend
PROJECT_LANGUAGE=typescript
CLAUDE_CODE_GEN_MODEL=haiku
CLAUDE_DEBUG_MODEL=sonnet
```

### For Frontend Work
```bash
# workspace.env
PROJECT_TYPE=frontend
PROJECT_FRAMEWORK=react
CLAUDE_RESPONSE_STYLE=concise
CLAUDE_USE_REFERENCES=true
```

### For Learning/Exploration
```bash
# workspace.env
CLAUDE_RESPONSE_STYLE=detailed
CLAUDE_SHOW_INSIGHTS=true
CLAUDE_DEFAULT_MODEL=sonnet
```

---

## 📈 Measuring Success

### Daily Check
```bash
# See today's usage
ccost
```

### Weekly Review
```bash
# Compare patterns
# Week 1: No config (baseline)
# Week 2: With config (should see 50-80% cost reduction)

ccost
```

### What to Look For
- Are you using the right model for each task?
- Are you being specific enough in prompts?
- Are you reusing context effectively?
- Are optimizations (Grep-first, etc.) working?

---

## 🔧 Troubleshooting

### Configuration Not Loading
```bash
# Manually load
source claude-load.sh

# Check if loaded
env | grep CLAUDE_
```

### Aliases Not Working
```bash
# Reload shell config
source ~/.zshrc

# Or restart terminal
```

### Unexpected Model Being Used
```bash
# Check auto-selection settings
cstatus

# Override manually
ch "task"  # Force Haiku
```

### Costs Still High
```bash
# Review patterns in guide
cat EFFICIENCY_GUIDE.md

# Check if optimizations are on
cstatus

# Enable aggressive optimizations
# Edit workspace.env:
CLAUDE_GREP_FIRST=true
CLAUDE_RESPONSE_STYLE=concise
CLAUDE_MAX_FILES_PER_REQUEST=3
```

---

## 💡 Pro Tips

1. **Start Simple**
   - Use default settings first
   - Adjust based on your usage patterns

2. **Use Auto-Selection**
   - Enable `CLAUDE_AUTO_SELECT_MODEL=true`
   - Let Claude pick the right model

3. **Be Specific**
   - "Fix line 45" not "fix bugs"
   - Include line numbers when possible

4. **Monitor Daily**
   - Run `ccost` at end of day
   - Adjust settings if needed

5. **Batch Similar Tasks**
   - Group related operations
   - One request for multiple files

---

## 📚 Additional Resources

### Quick Access
```bash
cstatus              # Current configuration
cat QUICK_REFERENCE.md       # Quick reference card
cat EFFICIENCY_GUIDE.md      # Complete guide
cat .claude-cheatsheet.txt   # Terminal cheat sheet
```

### Common Commands Reference
```bash
# Model shortcuts
ch "task"            # Haiku (cheap)
cs "task"            # Sonnet (balanced)
co "task"            # Opus (powerful)
c "task"             # Auto-select

# Common operations
ctest                # Run tests
cfix                 # Fix errors
cfmt                 # Format code
cfind "search"       # Search code

# Utilities
ccost                # Check costs
cclear               # Clear context
cstatus              # Show config
```

---

## 🎯 Next Steps

1. ✅ Load configuration: `source claude-load.sh`
2. ✅ Test basic commands: `cstatus`, `ch "read README.md"`
3. ✅ Try your first task using efficient patterns
4. ✅ Check costs: `ccost`
5. ✅ Read full guide when ready: `cat EFFICIENCY_GUIDE.md`

---

## 🤝 Support

Having issues? Check:

1. **Configuration**: `cstatus`
2. **Guide**: `cat EFFICIENCY_GUIDE.md`
3. **Quick Reference**: `cat QUICK_REFERENCE.md`
4. **Settings**: `cat workspace.env`

---

**You're all set!** 🎉

Start with simple tasks, use the aliases, and watch your efficiency improve.

**Remember:** No budget limits needed when you have smart controls! 🚀
