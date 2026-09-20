# 📝 Report Drafter

The read-only one. It never proposes, never writes, never asks.

**LOOK** — on the first working day of the month (and whenever you send `/report`) it reads
every register it is cleared for.

**ASSESS** — **every number is computed in `agents/report.ts`, in code**: the residual risk
spread, NC closure rate, obligations due and overdue, issue counts, GBPMS review debt,
training and CMMI averages, ESG RAG, lessons not yet applied, and the open/overdue load per
HOD. A model is never asked to do arithmetic on your register.

**ACT** — Claude writes only the closing summary: the three things the Management Committee
must notice, named by ref, plus one line of good news. Skip it by passing
`withNarrative: false`, or simply by not setting `ANTHROPIC_API_KEY` — the numeric pack
always sends.

**RECORD** — one row in `agent_runs` per pack.

### The knobs

| Knob | Where |
|---|---|
| What is in the pack | `buildPack` in `agents/report.ts` |
| The layout of the message | `packText` in the same file |
| The summary's brief | `narrative` in the same file |
| When it fires | `isFirstWorkingDay` in `app/api/cron-daily/route.ts` |
