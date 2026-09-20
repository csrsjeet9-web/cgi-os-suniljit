# ⏰ Overdue Chaser

**LOOK** — every weekday at 08:30 it reads the risk, obligation, issue, GBPMS and action
registers.

**ASSESS** — an item counts as overdue when it is still open AND either its status says
`Overdue` / `Over Target`, or its due date has passed. The worst 12 by severity are taken;
the rest wait for tomorrow, so the chat is never flooded.

**ASK** — below your `APPROVAL_LEVEL` line it drafts straight away (🟢) and tells you.
At or above the line it sends Approve / Reject buttons first (🟡).

**ACT** — the executor is `draftOnly`. It produces text addressed to the owner HOD and
returns it. **There is no send.** Messaging an HOD, an auditor or a regulator is the 🔴
never-zone, and the code to do it does not exist in this repo.

**RECORD** — every draft lands in `agent_runs` and on the Approvals tab, where you can read
it before you copy it.

### The knobs

| Knob | Where |
|---|---|
| Which registers it chases | `SCHEDULED` → `overdueChaser` in `agents/registry.ts` |
| How many per day | the `.slice(0, 12)` in the same check |
| The wording | the `text` template in the same check |
| What asks first | `APPROVAL_LEVEL` in your env |
