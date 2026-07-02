"""Load Plan-4 transcription output into the app DB.

`to_evidence_rows` is a pure transform (unit-tested) mapping the pipeline's
per-question evidence to the app's flat EvidenceRow shape ({itemId,quote,ts})
used by CaseContent / the admin editor. The DB writers use psycopg2 and are
thin; they are exercised only by the real load, not unit tests.
"""
import json
import os


def to_evidence_rows(pipeline_evidence: list[dict]) -> list[dict]:
    """Flatten [{questionId, evidence:[{text,t}|str]}] → [{itemId,quote,ts}]."""
    rows: list[dict] = []
    for item in pipeline_evidence:
        qid = item["questionId"]
        for e in item.get("evidence", []):
            if isinstance(e, str):
                rows.append({"itemId": qid, "quote": e, "ts": None})
            else:
                rows.append(
                    {"itemId": qid, "quote": e.get("text", ""), "ts": e.get("t")}
                )
    return rows


def _connect():
    # Prefer DIRECT_URL (5432) for a plain psycopg2 connection; fall back to
    # DATABASE_URL. The pooled pgbouncer URL also works for simple statements.
    dsn = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DIRECT_URL/DATABASE_URL not set")
    import psycopg2  # local import so unit tests don't need the driver

    # Strip Prisma-only query params psycopg2 doesn't understand.
    dsn = dsn.replace("?pgbouncer=true", "").split("?")[0]
    return psycopg2.connect(dsn)


def fetch_checklist() -> list[dict]:
    """Read seeded checklist items (id, text, criteria) from the DB, ord-sorted."""
    conn = _connect()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("select id, text, criteria from checklist_items order by ord asc")
            return [{"id": r[0], "text": r[1], "criteria": r[2]} for r in cur.fetchall()]
    finally:
        conn.close()


def load_case(bundle: dict) -> None:
    """Upsert one transcribe_case bundle: case_content (frozen=false) + ai_alone.

    Never sets frozen=true — content stays gated until an admin reviews and
    freezes it in the backoffice. ai_alone holds the AI verdicts, isolated from
    rater-facing content.
    """
    case_id = bundle["caseId"]
    transcript = json.dumps(bundle["transcript"], ensure_ascii=False)
    evidence = json.dumps(to_evidence_rows(bundle["evidence"]), ensure_ascii=False)
    model_id = bundle["model_id"]

    conn = _connect()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                """
                insert into case_content (case_id, transcript, evidence, model_id, frozen, updated_at)
                values (%s, %s::jsonb, %s::jsonb, %s, false, now())
                on conflict (case_id) do update set
                  transcript = excluded.transcript,
                  evidence   = excluded.evidence,
                  model_id   = excluded.model_id,
                  frozen     = false,
                  updated_at = now()
                """,
                (case_id, transcript, evidence, model_id),
            )
            for v in bundle["verdicts"]:
                cur.execute(
                    """
                    insert into ai_alone (case_id, item_id, verdict, model_id, created_at)
                    values (%s, %s, %s, %s, now())
                    on conflict (case_id, item_id) do update set
                      verdict = excluded.verdict, model_id = excluded.model_id, created_at = now()
                    """,
                    (case_id, v["questionId"], v.get("verdict"), model_id),
                )
    finally:
        conn.close()
