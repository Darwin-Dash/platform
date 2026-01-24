#!/bin/bash
# Ralph - Autonomous Coding Loop (snarktank/ralph format)
# Usage: ./ralph.sh [max_iterations]
#
# This script runs Claude Code in an autonomous loop, working through
# tasks defined in prd.json and tracking progress in progress.txt.

set -e

MAX_ITERATIONS=${1:-10}
ITERATION=0

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    Ralph Autonomous Loop                      ║"
echo "║                  snarktank/ralph format                       ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Project: js-evo-sdk-port                                     ║"
echo "║  Max iterations: $MAX_ITERATIONS                                           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Verify required files exist
if [ ! -f "prd.json" ]; then
    echo "ERROR: prd.json not found. Create it first."
    exit 1
fi

if [ ! -f "progress.txt" ]; then
    echo "WARNING: progress.txt not found. Creating empty file."
    touch progress.txt
fi

# Check for incomplete stories
INCOMPLETE=$(jq '[.userStories[] | select(.completed != true)] | length' prd.json)
if [ "$INCOMPLETE" -eq 0 ]; then
    echo "All user stories are complete!"
    exit 0
fi

echo "Found $INCOMPLETE incomplete user stories."
echo ""

while [ $ITERATION -lt $MAX_ITERATIONS ]; do
    ITERATION=$((ITERATION + 1))

    echo "╭──────────────────────────────────────────────────────────────╮"
    echo "│ Iteration $ITERATION of $MAX_ITERATIONS                                            │"
    echo "╰──────────────────────────────────────────────────────────────╯"

    # Get next incomplete story
    NEXT_STORY=$(jq -r '[.userStories[] | select(.completed != true)][0].id // empty' prd.json)

    if [ -z "$NEXT_STORY" ]; then
        echo ""
        echo "✓ All user stories complete!"
        break
    fi

    echo "Working on: $NEXT_STORY"
    echo "Starting Claude Code..."
    echo ""

    # Run Claude Code with the task
    # Using --print flag for non-interactive mode
    PROMPT="Read prd.json and progress.txt. Work on the first incomplete user story.
When complete, update prd.json to mark it completed and append learnings to progress.txt.
If all stories are done, output: <promise>COMPLETE</promise>"

    # Run claude with timeout and capture output
    OUTPUT=$(timeout 1800 claude --print "$PROMPT" 2>&1) || {
        EXIT_CODE=$?
        if [ $EXIT_CODE -eq 124 ]; then
            echo "WARNING: Claude timed out after 30 minutes"
        else
            echo "WARNING: Claude exited with code $EXIT_CODE"
        fi
    }

    echo "$OUTPUT"

    # Check for completion signal
    if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
        echo ""
        echo "╔══════════════════════════════════════════════════════════════╗"
        echo "║                    ALL TASKS COMPLETE                         ║"
        echo "╚══════════════════════════════════════════════════════════════╝"
        break
    fi

    # Check remaining stories
    REMAINING=$(jq '[.userStories[] | select(.completed != true)] | length' prd.json)
    echo ""
    echo "Remaining stories: $REMAINING"

    if [ "$REMAINING" -eq 0 ]; then
        echo "All stories marked complete!"
        break
    fi

    echo "Continuing to next iteration..."
    echo ""
    sleep 2
done

echo ""
echo "Ralph loop finished after $ITERATION iterations."
echo "Check prd.json and progress.txt for status."
