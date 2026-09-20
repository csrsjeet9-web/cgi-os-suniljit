"""Turn the CGI demo workbook into supabase/schema.sql (tables + guarded seed rows).

Run from the repo root:   python scripts/xlsx_to_sql.py [path/to/CGI_Compliance_Demo_Data.xlsx]

The workbook itself is NEVER committed (see .gitignore). Only the generated SQL is,
and every row in it is fictional demo data. Re-running the SQL in Supabase is safe:
the seed is guarded by "where not exists (select 1 from records)".

Sheet -> one row per record in the ONE `records` table:
  ref          the register id (ERM-9001-2026-001, IA-2026-01, CO-001, GBPMS-001 ...)
  category     risk | audit | issue | lesson | cmmi | training | investigation | esg | obligation | gbpms
  status       the sheet's own status word (Open, Overdue, In Progress, Closed, Amber ...)
  severity     Critical | High | Medium | Low  (derived where the sheet has no such column)
  owner        the HOD / department
  due_date     the one date that matters for chasing (action due, obligation due, next review ...)
  value        the one number that matters (residual score, days open, completion %, progress %)
  classification internal | restricted   (only 7_Investigations is restricted)
  meta         every original column, verbatim, so nothing from the sheet is lost
"""
from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_XLSX = ROOT.parent / "CGI_Compliance_Demo_Data.xlsx"
HEAD = ROOT / "supabase" / "schema.head.sql"
OUT = ROOT / "supabase" / "schema.sql"


def q(v) -> str:
    """SQL-quote a value (None -> null)."""
    if v is None or v == "":
        return "null"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def d(v) -> str | None:
    """Normalise a cell to YYYY-MM-DD or None."""
    if v is None or v == "":
        return None
    if isinstance(v, (dt.datetime, dt.date)):
        return v.strftime("%Y-%m-%d")
    s = str(v).strip()
    return s[:10] if len(s) >= 10 and s[4] == "-" else None


def num(v) -> float | None:
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def sev_from_count(major, minor) -> str:
    if (num(major) or 0) > 0:
        return "High"
    if (num(minor) or 0) > 0:
        return "Medium"
    return "Low"


def build_rows(wb) -> list[dict]:
    out: list[dict] = []

    def sheet(name):
        ws = wb[name]
        rows = list(ws.iter_rows(values_only=True))
        header = [str(h).strip() if h is not None else "" for h in rows[0]]
        for idx, raw in enumerate(rows[1:], start=2):
            if all(c is None or str(c).strip() == "" for c in raw):
                continue
            rec = {}
            for h, v in zip(header, raw):
                if not h:
                    continue
                if isinstance(v, (dt.datetime, dt.date)):
                    v = v.strftime("%Y-%m-%d")
                rec[h] = v
            yield idx, rec

    # 1) Enterprise risks
    for _, r in sheet("1_ERM_Risks"):
        out.append(dict(
            ref=r["Risk ID"], title=r["Risk Title"], category="risk", status=r.get("Action Status") or "Open",
            severity=r.get("Residual Level"), owner=r.get("Risk Owner (HOD)"), due_date=d(r.get("Action Due")),
            value=num(r.get("Residual Score")), standard=r.get("Standard"), classification="internal", meta=r,
        ))

    # 2) Internal audits
    for _, r in sheet("2_Internal_Audit"):
        out.append(dict(
            ref=r["Audit ID"], title=r["Audit Area"], category="audit", status=r.get("Status") or "Planned",
            severity=sev_from_count(r.get("Major NC"), r.get("Minor NC")), owner=r.get("Auditee (HOD)"),
            due_date=d(r.get("Audit Date")), value=num(r.get("NCs Open")), standard=r.get("Standard"),
            classification="internal", meta=r,
        ))

    # 3) Issues (project + company)
    for _, r in sheet("3_Issues"):
        out.append(dict(
            ref=r["Issue ID"], title=r["Title"], category="issue", status=r.get("Status") or "Open",
            severity=r.get("Severity"), owner=r.get("Owner (HOD)"), due_date=d(r.get("Due")),
            value=num(r.get("Days Open")), standard=None, classification="internal", meta=r,
        ))

    # 4) Lessons learned
    for _, r in sheet("4_Lessons_Learned"):
        out.append(dict(
            ref=r["LL ID"], title=r["Lesson"], category="lesson", status=r.get("Status") or "Captured",
            severity=None, owner=None, due_date=None, value=None, standard=None, classification="internal", meta=r,
        ))

    # 5) CMMI practice areas
    for idx, r in sheet("5_CMMI"):
        st = r.get("Status") or "On Track"
        sev = {"Behind": "High", "At Risk": "Medium"}.get(st, "Low")
        out.append(dict(
            ref=f"CMMI-{idx-1:02d}", title=r["Practice Area"], category="cmmi", status=st, severity=sev,
            owner=r.get("Owner (HOD)"), due_date=None, value=num(r.get("Implementation %")),
            standard="CMMI", classification="internal", meta=r,
        ))

    # 6) ISO training
    for idx, r in sheet("6_ISO_Training"):
        pct = num(r.get("Completion %")) or 0
        st = "On Track" if pct >= 90 else "Behind" if pct >= 75 else "At Risk"
        mandatory = str(r.get("Mandatory") or "").lower() == "yes"
        sev = "High" if (mandatory and pct < 85) else "Medium" if pct < 85 else "Low"
        out.append(dict(
            ref=f"TR-{idx-1:02d}", title=r["Course"], category="training", status=st, severity=sev,
            owner=None, due_date=d(r.get("Next Session")), value=pct, standard=r.get("Standard"),
            classification="internal", meta=r,
        ))

    # 7) Investigations  (RESTRICTED)
    for _, r in sheet("7_Investigations"):
        opened = d(r.get("Opened"))
        target = num(r.get("Target Closure (days)"))
        due = None
        if opened and target:
            due = (dt.date.fromisoformat(opened) + dt.timedelta(days=int(target))).isoformat()
        out.append(dict(
            ref=r["Case ID"], title=f"{r.get('Allegation Type')} — {r.get('Source')}", category="investigation",
            status=r.get("Status") or "Open", severity=r.get("Priority"), owner=None, due_date=due,
            value=num(r.get("Days Open")), standard=None, classification="restricted", meta=r,
        ))

    # 8) ESG KPIs
    for idx, r in sheet("8_ESG"):
        rag = r.get("RAG") or "Amber"
        sev = {"Red": "High", "Amber": "Medium"}.get(rag, "Low")
        out.append(dict(
            ref=f"ESG-{idx-1:02d}", title=r["KPI"], category="esg", status=rag, severity=sev, owner=None,
            due_date=None, value=num(r.get("Progress to Target %")), standard=f"ESG-{r.get('Pillar')}",
            classification="internal", meta=r,
        ))

    # 9) Compliance obligations
    for _, r in sheet("9_Compliance"):
        days = num(r.get("Days to Due"))
        st = r.get("Status") or "Not Started"
        if st == "Completed":
            sev = "Low"
        elif days is not None and days < 0:
            sev = "Critical"
        elif days is not None and days <= 14:
            sev = "High"
        elif days is not None and days <= 45:
            sev = "Medium"
        else:
            sev = "Low"
        out.append(dict(
            ref=r["Obligation ID"], title=r["Obligation"], category="obligation", status=st, severity=sev,
            owner=r.get("Owner (HOD)"), due_date=d(r.get("Due Date")), value=days,
            standard=r.get("Regulator / Source"), classification="internal", meta=r,
        ))

    # 10) GBPMS documents
    for _, r in sheet("10_GBPMS"):
        rs = r.get("Review Status") or "Current"
        sev = {"Overdue": "High", "Due Soon": "Medium"}.get(rs, "Low")
        out.append(dict(
            ref=r["Doc ID"], title=r["Title"], category="gbpms", status=rs, severity=sev,
            owner=r.get("Process Owner (HOD)"), due_date=d(r.get("Next Review")), value=None,
            standard=r.get("Level"), classification="internal", meta=r,
        ))

    return out


def meta_json(m: dict) -> str:
    import json
    clean = {k: ("" if v is None else v) for k, v in m.items()}
    return "'" + json.dumps(clean, ensure_ascii=False).replace("'", "''") + "'::jsonb"


def main() -> None:
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    if not xlsx.exists():
        raise SystemExit(f"Workbook not found: {xlsx}")
    wb = openpyxl.load_workbook(xlsx, data_only=True)
    rows = build_rows(wb)

    head = HEAD.read_text(encoding="utf-8")
    lines = [head.rstrip(), "",
             "-- ============================================================",
             f"-- SEED ROWS — {len(rows)} fictional demo records generated from {xlsx.name}",
             "-- by scripts/xlsx_to_sql.py. Guarded: re-running is SAFE (no duplicates).",
             "-- ============================================================",
             "insert into records (ref, title, category, status, severity, owner, due_date, value, classification, standard, notes, meta)",
             "select * from (values"]
    vals = []
    for r in rows:
        vals.append("  (" + ", ".join([
            q(r["ref"]), q(r["title"]), q(r["category"]), q(r["status"]), q(r["severity"]), q(r["owner"]),
            (q(r["due_date"]) + "::date") if r["due_date"] else "null::date",
            (str(r["value"]) if r["value"] is not None else "null") + "::numeric",
            q(r["classification"]), q(r["standard"]), "null::text", meta_json(r["meta"]),
        ]) + ")")
    lines.append(",\n".join(vals))
    lines.append(") as seed(ref, title, category, status, severity, owner, due_date, value, classification, standard, notes, meta)")
    lines.append("where not exists (select 1 from records);")
    lines.append("")
    lines.append("-- One PENDING proposal so the Approvals tab + the 🙋 badge aren't empty on minute one.")
    lines.append("insert into agent_actions (agent_key, idempotency_key, payload, status, expires_at)")
    lines.append("select 'overdue-chaser', 'seed-demo-proposal-001',")
    lines.append("       '{\"kind\":\"draft\",\"ref\":\"ERM-27001-2026-001\",\"owner\":\"Information Security\",\"severity\":\"High\",\"channel\":\"email\",\"text\":\"Hi Information Security team, risk ERM-27001-2026-001 (Unauthorised access to customer data) has a treatment action that was due on 2026-08-23 and is still open. Could you share the current status and a revised date? Thanks — CGI\",\"note\":\"High risk action overdue — draft a reminder to Information Security?\"}'::jsonb,")
    lines.append("       'proposed', now() + interval '7 days'")
    lines.append("where not exists (select 1 from agent_actions where idempotency_key = 'seed-demo-proposal-001');")
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    by_cat: dict[str, int] = {}
    for r in rows:
        by_cat[r["category"]] = by_cat.get(r["category"], 0) + 1
    print(f"wrote {OUT} with {len(rows)} rows: {by_cat}")


if __name__ == "__main__":
    main()
