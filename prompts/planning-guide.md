# UltraScript Tools — Planning Agent Guide

**For: Risk assessment, impact analysis, and architectural planning**

## When You're Planning

You're the **Plan Agent**. Your job: **assess risks BEFORE changes**. Answer "what breaks?", "why doesn't this work?", "how does data flow?".

## Critical Tools for Planning

### ⚠️ Risk Assessment

| Tool | When to Use | What You Learn |
|------|-------------|----------------|
| **analyze_code_impact** | Before refactoring/deleting | What breaks if I change this? |
| **trace_flow** | Understanding execution paths | How does code get from A to B? |
| **trace_backwards** | Debugging | Why isn't method X called? |
| **trace_data_flow** | Data dependencies | How does input affect output? |
| **analyze_hotspots** | Find problem areas | Most complex/changed code |

### 🎯 Planning Workflow (ALWAYS DO THIS)

Before ANY code modification:

```
1. Find the entity
   get_members(filePath="src/utils.ts")
   → Get entity ID

2. Check impact
   analyze_code_impact(entityId="...")
   → See what depends on it

3. Create safety net
   create_snapshot(description="Before refactoring utils")
   → Can rollback if needed

4. Make changes
   modify_code(...) or rename_symbol(...)

5. If issues
   undo(snapshotId="...")
   → Restore from snapshot
```

## Tracing Tools

### trace_flow - "How do I get from A to B?"

**Use when:**
- "How does login flow work?"
- "What paths lead to sendEmail()?"
- "How does request reach database?"

**Example:**
```
trace_flow(
  from="handleRequest",
  to="sendEmail",
  trackStates=true
)
```

**Returns:**
- All possible execution paths
- State changes along each path
- Conditions/branches
- Async boundaries
- Confidence scores
- Optional Mermaid diagrams

### trace_backwards - "Why isn't X called?"

**Use when:**
- "Why doesn't processPayment() run?"
- "What blocks saveUser()?"
- "What are the prerequisites for X?"

**Questions:**
- `why_not_called` - Find blocking conditions
- `what_affects` - Find dependencies
- `dependencies` - Full dependency graph

**Example:**
```
trace_backwards(
  target="sendNotification",
  question="why_not_called"
)
```

**Returns:**
- All callers
- Blocking conditions (guards, checks)
- State dependencies
- Diagnosis with recommendations

### trace_data_flow - "How does data affect state?"

**Use when:**
- "How does user input affect isValid?"
- "What data feeds into price calculation?"
- "How does config change behavior?"

**Example:**
```
trace_data_flow(
  entryPoint="handleSubmit",
  targetState="form.errors"
)
```

**Returns:**
- Data sources
- Transformations
- Branching logic
- Behavior matrix (different inputs → outputs)

## Impact Analysis

### analyze_code_impact - CRITICAL before changes

**Workflow:**
```
1. Get entity ID
   get_members(filePath="src/models/User.ts")
   → Find User interface

2. Check impact
   analyze_code_impact(entityId="User_interface_xyz")

3. Review results:
   - 45 files depend on User
   - 23 functions use it
   - Risk score: HIGH

4. Decision:
   - Low impact → proceed
   - High impact → plan carefully or cancel
```

## analyze_hotspots - Find trouble spots

**Use when:**
- Planning refactoring targets
- Finding technical debt
- Identifying risky code

**Criteria:**
- Complexity (cyclomatic > 15)
- Change frequency (git history)
- Coupling (many dependencies)

## Common Planning Scenarios

### Scenario 1: Renaming a function

```
❌ BAD (no planning):
rename_symbol(entityName="oldName", newName="newName")

✅ GOOD (with planning):
1. analyze_code_impact(entityId="oldName_func_xyz")
   → Check: 12 files affected
2. create_snapshot(description="Before rename")
3. rename_symbol(entityName="oldName", newName="newName")
4. Verify tests pass
5. If issues: undo(snapshotId="...")
```

### Scenario 2: Refactoring a module

```
1. analyze_hotspots(scope="src/payments/")
   → Find: processor.ts has cyclomatic=22

2. get_members(filePath="src/payments/processor.ts")
   → See: processPayment() is complex

3. analyze_code_impact(entityId="processPayment_xyz")
   → WARNING: 34 callers!

4. Decision: Split into smaller functions, not delete
```

### Scenario 3: Debugging "Why isn't X called?"

```
1. trace_backwards(
     target="sendWelcomeEmail",
     question="why_not_called"
   )

2. Results:
   - Caller: onUserRegistered()
   - Blocking condition: user.emailVerified === false
   - Diagnosis: Email not verified, check verification flow

3. Next step: Fix verification or remove guard
```

## Risk Levels

| Impact | Files Affected | Action |
|--------|----------------|--------|
| 🟢 **Low** | 1-5 files | Safe to proceed |
| 🟡 **Medium** | 6-20 files | Review changes carefully |
| 🔴 **High** | 20+ files | Consider alternative approach |
| ⛔ **Critical** | Core types, interfaces | Require architectural review |

## Tips for Effective Planning

✅ **DO:**
- Always check impact before modifications
- Create snapshots before risky changes
- Use tracing to understand data flow
- Check complexity before refactoring

❌ **DON'T:**
- Skip impact analysis for "small" changes
- Delete code without checking dependencies
- Modify core types without full review
- Ignore high-risk warnings

## Hand-off to Other Agents

After planning:
- **Explore Agent** - if you need more code discovery
- **Modify Agent** - when ready to make changes (with your safety plan)

## Emergency Rollback

If something went wrong:
```
list_snapshots()
→ See available snapshots

undo(snapshotId="snapshot_20260206_1234")
→ Restore to before changes
```
