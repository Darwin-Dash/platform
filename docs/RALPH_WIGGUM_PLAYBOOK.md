# Ralph Wiggum Loop Playbook

A comprehensive guide to installing and maximizing the effectiveness of the Ralph Wiggum autonomous AI coding technique.

---

## What Is the Ralph Wiggum Loop?

The Ralph Wiggum technique, created by Geoffrey Huntley, is an autonomous AI development methodology. At its core: **a bash loop that repeatedly feeds Claude Code the same prompt until your project is complete**.

Named after the Simpsons character who persists despite setbacks, it works because:
- Each iteration gets a **fresh context window**
- Progress persists in **files and git history**
- Failed attempts inform subsequent iterations
- Tests and verification gates ensure quality

**Philosophy**: "Deterministically bad in an undeterministic world" - it's better to iterate predictably than succeed unpredictably.

---

## Official Plugin vs Community Versions (Critical Comparison)

### The Core Philosophical Difference

| Aspect | Official Anthropic Plugin | Community/DIY Approach |
|--------|---------------------------|------------------------|
| **Session model** | Prevents single instance from exiting | Starts fresh sessions repeatedly |
| **Context handling** | Maintains persistent session | Fresh context window each iteration |
| **Philosophy** | "Failures Are Data" - safe, enterprise-ready | Brute force iteration until done |
| **Control** | Opaque hooks, managed state | Transparent bash loops you control |

**The fundamental disagreement**: The official plugin allegedly misunderstands Ralph's core principle. Ralph should "solve the AI context window problem by feeding new AI sessions the same prompt until done" - NOT by keeping one session alive indefinitely.

### Problems with the Official Plugin

1. **Broken since August 2025**: Security patch CVE-2025-54795 in Claude Code v1.0.20 blocks the plugin's multi-line bash commands. Error: "Command contains newlines that could separate multiple commands." Unfixed as of January 2026.

2. **Requires dangerous permissions**: "Dies in cryptic ways unless you have `--dangerously-skip-permissions`"

3. **Opaque state management**:
   - Installs hooks in hard-to-find locations
   - Uses strange markdown file to track state
   - Adds stop hook for ALL Claude sessions in directory
   - If you delete the state file before stopping, Claude breaks in that repo

4. **Windows incompatible**: Stop hook doesn't work on Windows 11 due to WSL bash resolution issues

5. **"Sterilization" of the concept**: VentureBeat noted the official release marked a philosophical shift from Huntley's chaotic brute-force approach to enterprise safety hooks

### Why Community Versions Are Preferred

**frankbria/ralph-claude-code** (463+ stars):
- Intelligent exit detection with dual-condition gates
- Rate limiting and cost controls
- Dashboard monitoring
- Circuit breaker for stagnation detection
- Proper session isolation

**dial481/ralph** (security patch fix):
- Redesigned architecture that works with current Claude Code
- Uses Write tool for state files instead of direct bash execution
- Stop hook as separate shell script outside permission system
- Clean 7-step loop operation

**DIY bash loops** (Geoffrey Huntley's original):
- 5 lines of code you fully understand
- Complete transparency
- True fresh context per iteration
- No hidden hooks or state files

### Recommendation

**For maximum effectiveness, use community versions or DIY**:

1. **Best overall**: `frankbria/ralph-claude-code` - full features, active maintenance
2. **If official is broken**: `dial481/ralph` - security-compliant fix
3. **For full control**: DIY 5-line bash loop (see Installation Option C)

**Avoid the official plugin** until Anthropic fixes the security patch compatibility issues and addresses the philosophical mismatch with true Ralph methodology.

---

## Installation

### Prerequisites
- Unix-like environment (macOS, Linux, WSL)
- Git installed and configured
- Claude Pro, Claude Max, or API access

### Option A: frankbria/ralph-claude-code (Recommended)
```bash
git clone https://github.com/frankbria/ralph-claude-code.git
cd ralph-claude-code
./install.sh
```

Adds commands: `ralph`, `ralph-monitor`, `ralph-setup`, `ralph-import`, `ralph-migrate`

### Option B: DIY Minimal Loop (Full Control)
Create `loop.sh`:
```bash
#!/bin/bash
MAX_ITERATIONS=${1:-20}
PROMPT_FILE="PROMPT.md"

for i in $(seq 1 $MAX_ITERATIONS); do
    echo "=== Iteration $i of $MAX_ITERATIONS ==="
    cat "$PROMPT_FILE" | claude -p \
        --dangerously-skip-permissions \
        --output-format=stream-json \
        --model sonnet \
        --verbose

    # Check exit conditions here
    if grep -q "EXIT_SIGNAL: true" .ralph/status.md 2>/dev/null; then
        echo "Completion detected, exiting"
        break
    fi
done
```

### Option C: Official Plugin (Not Recommended)
```bash
# Inside Claude Code - currently broken
/plugin ralph
```
**Warning**: Broken since August 2025 due to CVE-2025-54795. See comparison section above.

---

## Project Structure

```
your-project/
├── loop.sh                    # The loop script
├── PROMPT.md                  # Main instructions (or PROMPT_build.md)
├── PROMPT_plan.md             # Planning phase prompt
├── AGENTS.md                  # Build/test commands, patterns (60 lines max)
├── IMPLEMENTATION_PLAN.md     # Generated by planning phase
├── .ralph/                    # Ralph-specific files
│   ├── PROMPT.md              # Dev instructions
│   ├── @fix_plan.md           # Prioritized task list
│   ├── specs/                 # Technical specs
│   └── logs/                  # Execution history
└── specs/                     # Feature specifications
    ├── feature-a.md
    └── feature-b.md
```

---

## The Two-Phase Workflow (Optimal Approach)

### Phase 1: Planning Session
```bash
./loop.sh plan 5
```

**PROMPT_plan.md** instructs Claude to:
- Analyze specs and existing code
- Create/update IMPLEMENTATION_PLAN.md
- Identify file dependencies
- **"Plan only. Do NOT implement anything"**

### Phase 2: Implementation Session
```bash
./loop.sh 20
```

**PROMPT_build.md** instructs Claude to:
- Implement from the plan
- Search codebase before changes
- Run tests after each change
- Commit progress incrementally

**Why separate phases?** Fresh context prevents degradation from extended back-and-forth.

---

## Key Configuration Files

### AGENTS.md (Critical - 60 lines max)
Provides "backpressure" that prevents broken code:
```markdown
# Build
npm run build

# Test
npm test

# Lint
npm run lint && npm run typecheck

# Patterns
- Use existing utilities from src/utils/
- Follow established error handling patterns
- Run tests before committing
```

### Spec Files (specs/*.md)
One feature per file:
```markdown
# Feature: User Authentication

## Overview
OAuth2 integration for user login

## Requirements
- Support Google and GitHub providers
- Store tokens securely
- Refresh tokens automatically

## Acceptance Criteria
- [ ] Login button redirects to provider
- [ ] Callback stores user session
- [ ] Token refresh works silently
```

---

## Verification Approaches (Critical for Success)

Ralph works best with **objective, machine-verifiable success criteria**:

### 1. Test-Driven Verification (Most Reliable)
- Write tests before implementation
- Loop continues until all tests pass
- Clear pass/fail signals

### 2. Background Agent Verification
- Secondary agent reviews primary's work
- Checks for regressions independently
- Catches subtle issues

### 3. Stop Hook Validation
- Intercept completion attempts
- Run linting, tests, build checks
- Block premature exits

### 4. UI Screenshot Verification
- Capture screenshots after visual changes
- Name verified ones with "verified_" prefix
- Prevents visual bugs

---

## Intelligent Exit Detection

The dual-condition exit gate prevents premature completion:

**Both conditions required:**
1. Completion indicators ≥ 2 (heuristic detection)
2. Claude's explicit `EXIT_SIGNAL: true` in status block

```markdown
<!-- .ralph/status.md -->
## RALPH_STATUS
- Tasks completed: 5/5
- Tests passing: true
- Build status: success
- EXIT_SIGNAL: true
```

---

## Safety & Sandboxing

### Rate Limiting
```bash
ralph --calls 50  # Default: 100 calls/hour
```

### Iteration Limits
```bash
ralph --max-iterations 25  # Always set a limit!
```

### Circuit Breaker
Built-in detection for:
- 3 loops without progress
- 5 consecutive error loops
- Automatic graceful exit

### Sandboxing Options

**Docker (Recommended):**
```bash
docker build -t ralph-sandbox .
docker run -it --rm -v $(pwd):/workspace ralph-sandbox bash
```

**DevContainer:**
```json
// .devcontainer/devcontainer.json
{
  "name": "Ralph Sandbox",
  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",
  "postCreateCommand": "curl -fsSL https://claude.ai/install.sh | bash"
}
```

**Cloud VMs:** Fly Sprites, E2B, Modal, Google Cloud Run

---

## Best Practices for Maximum Effectiveness

### 1. Spec Precision
- Vague specs = agent feature invention
- Include file references
- Use checkbox format for progress tracking

### 2. External State Tracking
- Mark completed work in files
- Use git commits as checkpoints
- Enables recovery if context fills

### 3. Numbered Guardrails
Add weighted rules to prompts:
```markdown
99999. NEVER skip tests before committing
99998. ALWAYS search codebase before implementing new utilities
99997. MUST run lint before marking complete
```

### 4. The Checkbox Pattern
```markdown
## Tasks
- [x] Create user model
- [x] Add validation
- [ ] Implement API endpoints
- [ ] Add tests
```
Ralph counts unchecked boxes to track completion.

### 5. Prompt Trimming
- Keep AGENTS.md under 60 lines
- Trim specs if context fills
- Reference files rather than inlining

---

## Common Failure Patterns & Solutions

| Problem | Solution |
|---------|----------|
| Infinite loops | Set max iterations; add explicit completion criteria |
| Early termination | Strengthen verification; require test passage |
| Quality degradation | External progress tracking; checkpoint state |
| Feature drift | Make specs specific; reference existing patterns |
| Code duplication | Add "search codebase first" to prompts |
| Broken commits | Strengthen AGENTS.md validation commands |
| Context overflow | Trim specs; use file references |

---

## Monitoring & Debugging

### Integrated Dashboard
```bash
ralph --monitor --verbose  # tmux-based dashboard
```

### Log Analysis
Check `.ralph/logs/` for:
- Iteration history
- Error patterns
- Completion attempts

### Session Management
```bash
ralph --no-continue      # Isolated iterations
ralph --reset-session    # Clear context
ralph --timeout 30       # 30-minute timeout
```

---

## Cost Considerations

| Plan | Approximate Cost |
|------|------------------|
| Claude Max | Included in subscription |
| Claude Pro | Limited by daily usage |
| API (Sonnet) | ~$10-20 per 24 hours |
| API (Opus) | ~$50-100 per 24 hours |

**Economic insight**: Geoffrey Huntley argues Ralph enables development at ~$10.42/hour.

---

## Quick Start Checklist

1. [ ] Install Claude Code CLI
2. [ ] Choose installation method (plugin/repo/DIY)
3. [ ] Create project structure
4. [ ] Write AGENTS.md with build/test commands
5. [ ] Create specs in specs/ directory
6. [ ] Initialize git: `git init && git add . && git commit -m "Initial"`
7. [ ] Run planning phase: `./loop.sh plan 5`
8. [ ] Review IMPLEMENTATION_PLAN.md
9. [ ] Run build phase: `./loop.sh 20`
10. [ ] Monitor progress, adjust as needed

---

## Resources

- [frankbria/ralph-claude-code](https://github.com/frankbria/ralph-claude-code) - Full implementation
- [awesome-ralph](https://github.com/snwfdhmp/awesome-ralph) - Curated resource list
- [Claude Fast Mechanics Guide](https://claudefa.st/blog/guide/mechanics/ralph-wiggum-technique)
- [AI Hero Tips](https://www.aihero.dev/tips-for-ai-coding-with-ralph-wiggum)
- r/ralphcoding - Reddit community
- Ralph Discord server

---

*"Iteration > Perfection" - The Ralph philosophy*
