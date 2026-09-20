# 🏛️ The SVP — your one department head

The AI C-Suite Blueprint says: *you're the CEO, your heads do the reading and hand you
one recommendation each, and you keep every YES.* This is that head, installed.

The blueprint draws four heads (Sales, Marketing, Finance, Ops) for a small business.
CGI is not a small business with four departments — it is one governance division with
ten registers and an HOD behind each row. So the org chart here is flatter: **one SVP,
reporting to you, standing above all ten registers.**

```
                  ┌─────────────────────────┐
                  │        YOU (CEO)        │
                  │  the only YES that      │
                  │  marks something for    │
                  │  the Management Cttee   │
                  └────────────┬────────────┘
                               │  ONE recommendation up ▲   decision down ▼
                  ┌────────────┴────────────┐
                  │      SVP — CGI 🏛️       │
                  └────────────┬────────────┘
   ┌──────────┬──────────┬─────┴────┬──────────┬──────────┐
 Risks    Compliance   Audit     Issues     Cases 🔒   GBPMS
 Training    CMMI       ESG      Lessons
```

---

## ✏️ The canvas, filled in

**My business:** CGI — Compliance, Governance and Integrity, a Malaysian ICT services company
(ISO 9001, ISO/IEC 27001, ISO 37001, ISO 45001, ISO 14001, CMMI ML3, ESG / Bursa NSRF).

**My CEO threshold rule (the dial):** **Cautious — recommend only.** The SVP writes nothing
on its own, whatever the severity. Its single write is available only after a YES, and even
then it touches one field.

| | |
|---|---|
| **The head** | SVP — CGI |
| **It watches** | All ten registers: risks, compliance obligations, internal audit, issues, investigations, GBPMS documents, ISO training, CMMI, ESG, lessons |
| **May do ALONE 🟢** | Nothing. It reads, scores and recommends. That is the whole of its autonomy. |
| **Must ASK me first 🟡** | Marking any record as escalated to the Management Committee |
| **May NEVER 🔴** | Change a status, a date, an owner or a severity · close a finding · write to a case · message an HOD, an auditor or a regulator · delete anything |
| **Where the data lives** | `records`, every category, read through `getRecords('restricted')` |

**Its one question, every run:** *What must the Management Committee see at its next sitting?*
It answers with the ref, the owner, why now, the decision being sought, and what happens if
the MCC does nothing.

**My top escalation triggers — when the SVP must stop and ask me:**

1. **Always.** Every recommendation is a 🟡 card. There is no 🟢 path in this head.
2. **A reference it cannot prove.** If the model names a ref that is not in the shortlist,
   that pick is discarded and the highest-scoring real item is used instead, flagged as unverified.
3. **No narrative.** If the Claude call fails or returns nothing usable, it sends the card
   built from the computed facts alone and says so, rather than inventing a case.

**The FIRST head I'll actually turn on:** this one, the SVP.
**Why this one first:** the registers already hold the facts; what is missing is someone
who reads all ten every morning and says *this one, today, for this reason.*
**How I'll know it's earning its keep in 2 weeks:** its picks match what I would have chosen,
and at least one thing reached the MCC that I would otherwise have found late.

---

## How it actually works

| Step | What happens | Where |
|---|---|---|
| **LOOK** | Reads every register the caller is cleared for. The cron reads with `restricted`, so cases count, and the card goes only to `OWNER_CHAT_ID` — never a team group. | `runSvp()` |
| **ASSESS** | **Every fact is computed in code.** `scoreCandidates()` scores each open item on severity, lateness and register-specific materiality, and keeps the top 8. A model never invents a ref, a date, an owner or a count. | `scoreCandidates()` |
| **ASK** | One Claude call. It may only *choose* from those 8 and write the case. Its chosen ref is checked against the shortlist before anything is sent. | `pickOne()` |
| **ACT** | Nothing, until you tap ✅. | — |
| **RECORD** | Every run writes to `agent_runs`; every decision to `agent_actions`, visible on Approvals → History. | `logRun`, the HITL engine |

### What a YES actually does

`stampEscalation()` in `agents/registry.ts` writes **one key**: `meta.mcc` on that record,
holding the date, the headline, the decision sought and the score. It never touches the
status, the owner, the due date or the severity — so approving the SVP cannot change what
the register says is true. `/undo-<id>` lifts the stamp straight back off.

### The scoring, in plain words

Severity is the spine (Critical 40 down to Low 10). Overdue adds 25, and more than two months
late adds 15 more. Then each register adds what actually reaches a governance committee:

- a **statutory** obligation (SSM, PDPA, LHDN, DOSH, MACC, NACSA and the rest) outranks an internal policy
- a **risk no HOD has acknowledged**, or one never communicated to the MCC
- an **audit closed while its nonconformities are still open**
- an **issue already escalated** and still sitting there
- an **investigation past its closure target**
- a **Policy or L1 document** overdue for review
- a **mandatory course** under 85%
- a **red ESG KPI**

Non-mandatory training, green and amber KPIs, on-track CMMI areas and lessons never become
candidates. Anything scoring under 40 is dropped.

**The weights are meant to be argued with.** They are plain numbers at the top of
`scoreCandidates()`. Change them and the head changes its mind — that is the dial.

## Turning it up later

The blueprint's whole point is that the dial rises with trust. Two sensible next steps,
in order:

1. Let it stamp **Low and Medium** items itself and only ask on High and Critical — flip
   the `auto` flag the way the Overdue Chaser does.
2. Let it draft the **MCC paper** for the item it picks, for you to send. Drafting is 🟡;
   sending stays 🔴 and is not implemented anywhere in this repo.

## Running it

| How | When |
|---|---|
| `/svp` in Telegram | any time, on demand |
| The weekday cron | 08:30 MYT, Monday to Friday, inside `/api/cron-daily` |
| The Approvals tab | the card waits there for 7 days either way |
