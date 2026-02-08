#!/bin/bash
# ============================================================================
# Claude Workspace Configuration Loader
# ============================================================================
# Usage: source claude-load.sh
# Or add to .zshrc: source /path/to/claude-load.sh
# ============================================================================

WORKSPACE_ENV="./workspace.env"

# Check if workspace.env exists
if [ ! -f "$WORKSPACE_ENV" ]; then
    echo "⚠️  workspace.env not found in current directory"
    echo "📁 Looking for workspace.env in parent directories..."

    # Search up to 3 levels
    if [ -f "../workspace.env" ]; then
        WORKSPACE_ENV="../workspace.env"
    elif [ -f "../../workspace.env" ]; then
        WORKSPACE_ENV="../../workspace.env"
    elif [ -f "../../../workspace.env" ]; then
        WORKSPACE_ENV="../../../workspace.env"
    else
        echo "❌ workspace.env not found. Please create one or cd to workspace root."
        return 1
    fi
fi

# Load environment variables
echo "📥 Loading Claude configuration from: $WORKSPACE_ENV"
export $(cat "$WORKSPACE_ENV" | grep -v '^#' | grep -v '^$' | xargs)

# Create smart command aliases based on config
create_aliases() {
    local default_model="${CLAUDE_DEFAULT_MODEL:-haiku}"
    local file_model="${CLAUDE_FILE_OPS_MODEL:-haiku}"
    local debug_model="${CLAUDE_DEBUG_MODEL:-sonnet}"
    local design_model="${CLAUDE_DESIGN_MODEL:-opus}"

    # Model shortcuts
    alias ch='claude --model haiku'
    alias cs='claude --model sonnet'
    alias co='claude --model opus'
    alias c="claude --model $default_model"

    # Task-specific shortcuts
    alias cread="claude --model $file_model"
    alias cdebug="claude --model $debug_model"
    alias cdesign="claude --model $design_model"

    # Common operations
    alias ctest='claude --model haiku "Run all tests and report results"'
    alias cfix='claude --model haiku "Fix syntax errors and linting issues"'
    alias cfmt='claude --model haiku "Format all code files"'
    alias clint='claude --model haiku "Run linter and fix issues"'

    # Search helpers
    if [ "$CLAUDE_GREP_FIRST" = "true" ]; then
        alias cfind='claude --model haiku "Use Grep to search, then Read top matches for"'
    fi

    # Utilities
    alias ccost='claude /cost'
    alias cclear='claude /clear'
    alias cstatus='show_claude_config'

    echo "✅ Claude aliases created"
}

# Show current configuration
show_claude_config() {
    echo ""
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║           CLAUDE WORKSPACE CONFIGURATION                  ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""
    echo "📍 Config file: $WORKSPACE_ENV"
    echo ""
    echo "🤖 Model Settings:"
    echo "   Default:     ${CLAUDE_DEFAULT_MODEL:-haiku}"
    echo "   File Ops:    ${CLAUDE_FILE_OPS_MODEL:-haiku}"
    echo "   Debug:       ${CLAUDE_DEBUG_MODEL:-sonnet}"
    echo "   Design:      ${CLAUDE_DESIGN_MODEL:-opus}"
    echo ""
    echo "⚡ Optimizations:"
    echo "   Grep First:       ${CLAUDE_GREP_FIRST:-false}"
    echo "   Use Glob:         ${CLAUDE_USE_GLOB:-false}"
    echo "   Batch Files:      ${CLAUDE_BATCH_FILES:-false}"
    echo "   Max Files/Req:    ${CLAUDE_MAX_FILES_PER_REQUEST:-5}"
    echo "   Response Style:   ${CLAUDE_RESPONSE_STYLE:-balanced}"
    echo ""
    echo "🎯 Project Info:"
    echo "   Type:       ${PROJECT_TYPE:-unknown}"
    echo "   Language:   ${PROJECT_LANGUAGE:-unknown}"
    echo "   Framework:  ${PROJECT_FRAMEWORK:-unknown}"
    echo ""
    echo "💡 Available commands:"
    echo "   ch  - Use Haiku (cheap)"
    echo "   cs  - Use Sonnet (balanced)"
    echo "   co  - Use Opus (powerful)"
    echo "   c   - Use default model"
    echo ""
    echo "   ctest  - Run tests"
    echo "   cfix   - Fix errors"
    echo "   cfmt   - Format code"
    echo "   ccost  - Check costs"
    echo "   cclear - Clear context"
    echo ""
}

# Smart model selector
claude_smart() {
    local prompt="$*"
    local model="${CLAUDE_DEFAULT_MODEL:-haiku}"

    if [ "$CLAUDE_AUTO_SELECT_MODEL" = "true" ]; then
        # Check for Opus keywords
        for keyword in ${CLAUDE_OPUS_KEYWORDS//,/ }; do
            if [[ "$prompt" == *"$keyword"* ]]; then
                model="opus"
                echo "🧠 Auto-selected Opus (detected: $keyword)"
                break
            fi
        done

        # Check for Haiku keywords (override Opus)
        for keyword in ${CLAUDE_HAIKU_KEYWORDS//,/ }; do
            if [[ "$prompt" == *"$keyword"* ]]; then
                model="haiku"
                echo "⚡ Auto-selected Haiku (detected: $keyword)"
                break
            fi
        done
    fi

    claude --model "$model" "$prompt"
}

# Cost-aware wrapper
claude_cost_aware() {
    if [ "$CLAUDE_SHOW_COST_ESTIMATE" = "true" ]; then
        local chars=${#1}
        local tokens=$((chars / 4))
        echo "📊 Estimated tokens: ~$tokens (this is approximate)"
    fi

    claude "$@"
}

# Initialize
create_aliases

# Show welcome message
echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  ✨ Claude Code Configuration Loaded                      ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "💡 Type 'cstatus' to see current settings"
echo "📖 Type 'cat .claude-cheatsheet.txt' for quick reference"
echo ""

# Export functions
export -f show_claude_config
export -f claude_smart
export -f claude_cost_aware
