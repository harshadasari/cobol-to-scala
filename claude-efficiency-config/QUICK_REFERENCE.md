# Claude Code Quick Reference Card

## 🚀 Quick Start
```bash
source claude-load.sh    # Load configuration
cstatus                  # View current settings
```

## 🎯 Smart Commands

| Command | Purpose | Cost |
|---------|---------|------|
| `ch "task"` | Haiku (cheap, fast) | $ |
| `cs "task"` | Sonnet (balanced) | $$ |
| `co "task"` | Opus (powerful) | $$$$ |
| `c "task"` | Auto-select model | varies |

## ⚡ Common Operations

| Task | Command | Model |
|------|---------|-------|
| Read file | `ch "read auth.ts"` | Haiku |
| Find code | `cfind "login function"` | Haiku |
| Run tests | `ctest` | Haiku |
| Fix errors | `cfix` | Haiku |
| Format code | `cfmt` | Haiku |
| Debug issue | `cdebug "bug description"` | Sonnet |
| Design feature | `cdesign "new feature"` | Opus |
| Check costs | `ccost` | - |
| Clear context | `cclear` | - |

## 💡 Efficiency Patterns

### ✅ DO THIS (Efficient)
```bash
# Specific line ranges
ch "read auth.ts lines 45-80"

# Grep then read
ch "grep 'login' in src/, read top 3 matches"

# Batch operations
ch "update imports in: auth.ts, user.ts, profile.ts"

# Reference previous context
c "apply same pattern to UserController"
```

### ❌ NOT THIS (Expensive)
```bash
# Reading everything
co "read all files in src/"

# Vague requests
co "find bugs in my code"

# Re-reading
c "read auth.ts again"

# Wrong model for task
co "format code"  # Use Haiku!
```

## 🎛️ Key Settings (workspace.env)

```bash
# Model defaults
CLAUDE_DEFAULT_MODEL=haiku
CLAUDE_DEBUG_MODEL=sonnet
CLAUDE_DESIGN_MODEL=opus

# Auto-optimizations
CLAUDE_GREP_FIRST=true
CLAUDE_BATCH_FILES=true
CLAUDE_AUTO_SELECT_MODEL=true

# Output control
CLAUDE_RESPONSE_STYLE=concise
CLAUDE_USE_REFERENCES=true
```

## 📊 Cost Reference

| Model | Input | Output | Use For |
|-------|-------|--------|---------|
| **Haiku** | $1 | $5 | Read, test, format, simple code |
| **Sonnet** | $3 | $15 | Debug, refactor, review |
| **Opus** | $15 | $75 | Design, optimize, complex analysis |

*Prices per 1M tokens*

## 🔥 Efficiency Tips

1. **Default to Haiku** - Use `ch` for 80% of tasks
2. **Grep before Read** - Search before reading files
3. **Be specific** - "Fix line 45" not "fix bugs"
4. **Batch similar tasks** - One request for multiple files
5. **Reuse context** - Reference earlier work
6. **Auto-select model** - Enable in config
7. **Monitor costs** - Run `ccost` daily

## 📝 Prompt Templates

### Bug Fix
```bash
ch "Fix error at file.ts:line. Expected: X. Got: Y."
```

### Feature Implementation
```bash
co "Design feature X with requirements: 1, 2, 3"
ch "Implement design using pattern from Y"
ctest
cfix
```

### Code Search
```bash
ch "Grep for 'keyword' in src/**/*.ts"
ch "Read top 3 matches"
```

### Refactoring
```bash
cs "Refactor ComponentA, ComponentB to hooks pattern"
```

## 🎨 Workflow Example

**Task:** Add login feature

```bash
# 1. Design ($0.40)
co "Design login with email/password, validation, error handling"

# 2. Implement ($0.50)
ch "Create LoginForm.tsx following design, use existing Button/Input"

# 3. Test ($0.30)
ctest

# 4. Fix issues ($0.25)
cfix

# 5. Format ($0.10)
cfmt

# Total: $1.55
```

## ⚙️ Configuration Presets

### Ultra Efficient
```bash
CLAUDE_DEFAULT_MODEL=haiku
CLAUDE_RESPONSE_STYLE=concise
CLAUDE_MAX_FILES_PER_REQUEST=3
```

### Balanced (Recommended)
```bash
CLAUDE_DEFAULT_MODEL=haiku
CLAUDE_DEBUG_MODEL=sonnet
CLAUDE_DESIGN_MODEL=opus
CLAUDE_AUTO_SELECT_MODEL=true
```

### Quality First
```bash
CLAUDE_DEFAULT_MODEL=sonnet
CLAUDE_DEBUG_MODEL=opus
CLAUDE_RESPONSE_STYLE=detailed
```

## 🔍 Context Management

```bash
# Build context once
ch "read: design.md, schema.sql, api.ts"

# Reuse for multiple tasks
c "implement endpoint A per design"
c "implement endpoint B per design"
c "implement endpoint C per design"
```

## 🎓 Learning Resources

- Full guide: `cat EFFICIENCY_GUIDE.md`
- Settings reference: `cat workspace.env`
- Cheat sheet: `cat .claude-cheatsheet.txt`

## 🚨 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| Config not loading | `source claude-load.sh` |
| Alias not working | Restart terminal or `source ~/.zshrc` |
| High costs | Check `ccost`, switch to Haiku |
| Slow responses | Use `ch` instead of `co` |
| Reading too much | Set `CLAUDE_MAX_FILES_PER_REQUEST=3` |

## 💰 Cost Optimization Checklist

- [ ] Using Haiku for simple tasks?
- [ ] Grep before Read enabled?
- [ ] Being specific with line numbers?
- [ ] Batching similar operations?
- [ ] Reusing context instead of re-reading?
- [ ] Response style set to `concise`?
- [ ] Auto-model selection enabled?
- [ ] Checking costs with `/cost`?

---

**Print this card and keep it handy!** 📋

For detailed examples: `cat EFFICIENCY_GUIDE.md`
