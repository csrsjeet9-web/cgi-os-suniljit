# Make Atlas yours — the interview

`atlas/config.ts` is Atlas's personality. Out of the box it knows it works for a CGI
department. Paste the prompt below into Claude Code and answer the questions; it fills the
file in for you.

---

```
Read atlas/config.ts in this repo, then interview me — ONE question at a time — and fill it in.

Ask me about:
  WHO    — what my organisation and department are called, what to call me, and what my
           department is actually accountable for.
  SCOPE  — which standards and frameworks we certify or report against.
  VOICE  — how you should talk to me (short? formal? do I want the ref quoted every time?).
  WATCH  — the 2-4 things I want raised first every morning.
  NEVER  — my own red lines, on top of the ones welded into the code.

Rules:
  • One question at a time. Wait for my answer.
  • Suggest a sensible default with each question so I can just say "yes".
  • When we are done, edit atlas/config.ts only — nothing else — and show me the diff.
  • Do not touch the safety rules in app/api/telegram/route.ts.
```

---

## What you cannot widen from here

`atlas/config.ts` is **context, not permission**. The safety rules are appended to the system
prompt *after* your profile, and the dangerous actions are not implemented in any executor.
Nothing you write in that file can make Atlas send a message to an HOD, delete a row, close a
finding without your YES, or read a restricted case it is not cleared for.
