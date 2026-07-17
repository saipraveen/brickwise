---
inclusion: auto
---

# AI Development Life Cycle (AI-DLC) Learning Guide

This project serves as a hands-on learning vehicle for modern AI-augmented development practices. Below is a mapping of Gen AI concepts to where they are applied in this project.

## Concepts and Their Application

### 1. Spec-Based Development
**What it is**: Transforming rough ideas into structured specifications (requirements → design → tasks) before writing code, using AI assistance throughout.

**Where applied in this project**:
- `.kiro/specs/lego-moc-builder/requirements.md` — EARS-format requirements with formal user stories and acceptance criteria
- `.kiro/specs/lego-moc-builder/design.md` — Technical design with architecture diagrams, interfaces, and data models
- `.kiro/specs/lego-moc-builder/tasks.md` — Implementation plan derived from spec

**Key takeaway**: The spec documents serve as the single source of truth. AI generates them iteratively with human review at each step.

### 2. Harness Engineering
**What it is**: Defining formal correctness properties that software must satisfy, then using property-based testing (PBT) to verify them. The "harness" is the test infrastructure that continuously checks these properties.

**Where applied in this project**:
- 15 correctness properties defined in `design.md` (e.g., "inventory quantity arithmetic", "bag sequential numbering")
- Property-based tests using `fast-check` library with 100+ iterations per property
- Properties act as executable specifications — if any property fails, the implementation is incorrect

**Key takeaway**: Instead of just writing example tests, define universal properties that hold for ALL valid inputs.

### 3. Loop Engineering
**What it is**: Designing iterative feedback loops where AI agents refine outputs based on structured feedback, constraint satisfaction, and evaluation results.

**Where applied in this project**:
- Requirements → Design → Tasks pipeline with human checkpoints at each stage
- Requirements analysis tool that identifies ambiguities and auto-resolves trivial questions
- Build-test-fix loop: implement → run PBT → fix failures → repeat
- Catalog sync retry loop with exponential backoff

**Key takeaway**: Good loops have clear entry/exit criteria, progressive refinement, and don't run forever.

### 4. AI Agents and Agentic AI
**What it is**: AI systems that can plan, execute multi-step tasks, use tools, and make decisions autonomously within defined boundaries.

**Where applied in this project**:
- Kiro's spec workflow (orchestrator agent delegates to specialized subagents)
- Recognition Service as an AI agent: receives image → reasons about brick parts → returns structured identification
- The pluggable recognition backend architecture allows swapping agent implementations

**Key takeaway**: Good agent design includes clear tool boundaries, fallback paths when the agent fails, and human-in-the-loop confirmation (our "Review Step").

### 5. Model Context Protocol (MCP)
**What it is**: A protocol for connecting AI models to external tools and data sources in a standardized way.

**Where applied in this project**:
- Potential to add Rebrickable as an MCP server for direct catalog queries during development
- AWS Bedrock integration follows similar patterns (structured tool calls with schemas)
- The pluggable recognition backend interface is conceptually similar to MCP's tool abstraction

**Key takeaway**: MCP standardizes how AI accesses external capabilities. Our recognition backend interface and catalog sync service follow similar principles.

### 6. Evals (Evaluations)
**What it is**: Systematic measurement of AI system quality using defined metrics and test suites.

**Where applied in this project**:
- **Recognition accuracy eval**: Test the Claude Vision prompt against a known set of brick images, measure identification accuracy
- **Property-based test results**: Each PBT run is an eval — pass/fail across 100+ random inputs
- **Performance evals**: 2-second search target, 10-second recognition target
- **Cost eval**: Track cost per scan over time, measure if model tier strategy reduces spend

**Key takeaway**: Evals should be automated, repeatable, and measure what actually matters to users.

### 7. Prompt Engineering (for Recognition)
**What it is**: Crafting effective prompts that guide AI models to produce desired outputs reliably.

**Where applied in this project**:
- The Recognition Service sends structured prompts to Claude Vision with:
  - System context: "You are a LEGO brick identification expert"
  - Output format specification: JSON with part_number, color, quantity, confidence
  - Reference to Rebrickable part numbering system
  - Instructions for handling partial visibility and overlapping bricks

**Key takeaway**: Good prompts are specific about output format, provide domain context, and handle edge cases explicitly.

### 8. Cost Engineering
**What it is**: Designing AI systems to minimize operational costs without sacrificing quality.

**Where applied in this project**:
- Tiered model selection (Haiku for initial scans, Sonnet for ambiguous cases only)
- Image preprocessing to reduce token count
- Result caching to avoid redundant API calls
- Usage quotas and budget alarms
- Local-first architecture reduces server dependency

**Key takeaway**: The cheapest API call is the one you don't make. Cache, preprocess, and use the smallest adequate model.

## How to Use This Guide

As you implement features, reflect on which AI-DLC concepts you're exercising. After completing each task:
1. Note which concept was most relevant
2. Record what worked well and what was surprising
3. Identify where a concept could be applied differently next time

This builds genuine understanding through practice, not just theory.
