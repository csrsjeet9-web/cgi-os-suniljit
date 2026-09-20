# 🔍 Audit NC Tracker

**LOOK** — every weekday it reads the audit programme and the issue register.

**ASSESS** — two inconsistencies it knows how to spot:
1. An audit marked **Closed** that still has NCs open. The audit says finished; the
   nonconformities say otherwise.
2. An issue sitting at **Escalated** for 30+ days. Escalation without a date is a black hole.

**ASK** — both are status writes, so both follow the dial, and in practice audits and
escalated issues are High, so they ask. The proposal names the audit, the NC count and the
auditee, or the issue and how long it has been stuck.

**ACT** — on your YES, `writeRecord` moves the audit to **Follow-up**, or re-baselines the
issue to **In Progress** with a due date 14 days out. It never closes anything.

**RECORD** — the previous status is stored in the result, so `/undo-<id>` puts it back
exactly. Nothing is deleted, ever.

### The knobs

| Knob | Where |
|---|---|
| The 30-day escalation threshold | `ncTracker` in `agents/registry.ts` |
| The 14-day re-baseline window | same check |
| Which status it moves audits to | same check (`Follow-up`) |
