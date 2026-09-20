# CGI OS — Compliance, Governance and Integrity 🏛️

> Ten registers, one screen, and four robots that **ask before they act**.
> Risk, compliance, audit, issues, lessons, GBPMS, CMMI, training, ESG and investigations —
> in your pocket, with a Telegram assistant that answers from the register and never guesses.

Built on the same safety core as CashFlowOS: propose → claim → execute exactly once,
fail-closed everywhere, and a soft undo that never deletes.

---

## 🖐️ The one rule (LATAR)

Every robot in here works the same 5 steps:

1. **LOOK** 👀 — it reads the registers
2. **ASSESS** 🤔 — "this is overdue / this changed / this is inconsistent"
3. **ASK** 🙋 — it raises its hand: "Boss, can I?"
4. **ACT** ⚡ — only after your YES, and only **once**
5. **RECORD** 📝 — every run lands in the audit trail

## 🎚️ The dial is SEVERITY, not money

- 🟢 **Low / Medium, not overdue → it just does it**, then tells you. There's an undo.
- 🟡 **High / Critical, or anything overdue → it asks first.** Buttons come to Telegram.
- 🟡 **Every closure asks**, whatever the dial says. Marking something Resolved, Completed or Closed is register truth.
- 🔴 **Never-ever** — message an HOD, an auditor or a regulator; delete a row; change a restricted case. That code does not exist.

The line is a **DIAL you set** (`APPROVAL_LEVEL`, default `High`). New robot → dial low. Trusted robot → dial up.

---

## 🤖 The four robots

| Robot | When | What it does | Zone |
|---|---|---|---|
| ⏰ **Overdue Chaser** | weekdays 08:30 | Drafts a reminder to the owner HOD for every overdue risk action, obligation, issue and GBPMS review. **It never sends — you copy and send.** | 🟢 below the line · 🟡 at/above |
| 🔍 **Audit NC Tracker** | weekdays 08:30 | Spots a Closed audit that still has NCs open, and issues stuck Escalated 30+ days. Proposes the status move. | 🟡 |
| 📡 **Regulatory Watch** | Mondays + every forwarded circular | Searches SSM, JPDP, MCMC, LHDN, RMCD, DOSH, DOE, MACC, NACSA, ISO, CMMI and Bursa, and reads circulars in the watched mailbox. Proposes new obligations **with the source URL**. | 🟡 always |
| 📝 **Report Drafter** | 1st working day, or `/report` | The management pack: heat map, NC closure, obligations due, ESG RAG, training %, CMMI. Numbers in code, narrative by Claude. | read-only |

Plus **Atlas**, the Telegram bot: ask it anything about the registers, or tell it to add an action, raise an issue, move a status or close a finding.

---

## 🚀 Quickstart — the OYEN order

**O — Organize** (give it a memory)
1. Make a **free** Supabase project. Open the **SQL Editor**, paste all of `supabase/schema.sql`, click **Run**. That builds the tables and seeds 242 demo records so no tab is empty.
2. `npm install`, then `cp .env.example .env`.
3. Fill `SUPABASE_URL` (Settings → Data API → Project URL, **base URL only**) and `SUPABASE_SERVICE_ROLE_KEY` (Settings → API Keys → service_role → Reveal). Invent an `APP_PASSCODE`, and a different `RESTRICTED_PASSCODE` for investigations.

**E — Expose** (give it a face + put it on your phone)
4. `npm run dev` → `localhost:3000` → enter your passcode → you should see the health strip, the heat map and 12 tabs.
5. Deploy on Vercel: import the repo, add **every** variable from your `.env`, deploy.
6. Open the live URL on your phone → **Add to Home Screen**.

**N — Navigate** (give it a mouth)
7. Telegram: `@BotFather` → `/newbot` for a token · `@userinfobot` for your numeric ID. Use a **new** bot — one bot cannot serve two apps.
8. In **Vercel** add `ANTHROPIC_API_KEY`, the Telegram keys, `APPROVAL_LEVEL` and a made-up `CRON_SECRET` → **Redeploy** (env changes need a redeploy).
9. `npm run webhook:set -- https://YOUR-APP.vercel.app` → press **Start** in your bot → send `/help`, then ask *"what's overdue?"*.

**Y — Yield** (give it an alarm clock)
10. `vercel.json` schedules the brief at **08:30 MYT on weekdays** (`30 0 * * 1-5`) and the mailbox watch at **08:00 daily**. The Monday watch and the monthly pack ride inside the weekday cron.

---

## 🔒 The restricted register

Investigations are classified `restricted`. Every read goes through `getRecords(clearance)`,
which filters **in the SQL query** — so with the wrong clearance the rows never reach a page,
a tool result, or the model.

- **Web**: a second passcode at `/restricted` mints an 8-hour clearance cookie.
- **Telegram**: your numeric id must be in `RESTRICTED_USER_IDS`.
- **Robots**: never propose a change to a case, and the executor can only create `internal` rows.

Leave `RESTRICTED_PASSCODE` blank and the register stays shut to everyone.

---

## 🗂️ Where things live

```
app/            the 12 tabs + 5 API routes (telegram · 2 crons · 2 logins)
agents/
  registry.ts   who the robots are, what they may execute, the daily checks
  regwatch.ts   the Regulatory Watch (web search → proposals)
  report.ts     the monthly management pack
atlas/config.ts Atlas's personality — 👉 EDIT THIS, it's yours
lib/
  records.ts    the register model, the severity dial, the health maths
  clearance.ts  🔒 who may see restricted rows
  actions.ts    🔒 propose → claim → execute-once → undo
  bot-tools.ts  Atlas's READ hands · bot-actions.ts its WRITE hands
  gmail-sync.ts circulars in the mailbox → proposed obligations
supabase/
  schema.head.sql   the tables (edit this)
  schema.sql        GENERATED: tables + seed. Rebuild with `npm run seed:sql`
scripts/xlsx_to_sql.py  turns the demo workbook into that seed
```

## 🔁 Reloading the demo data

```bash
npm run seed:sql
```

Reads `../CGI_Compliance_Demo_Data.xlsx` and rewrites `supabase/schema.sql`.
The workbook itself is **never committed** — only the generated SQL, and every row in it is fictional.

## ⚠️ Data rules

This repo is public. Never commit the workbook, a `.env`, a service-account JSON, a `.pem`,
or any real case, audit or personnel file. Real records live only in your Supabase project.
