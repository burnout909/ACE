"""Backfill speaker (doctor/patient) labels onto already-stored case transcripts.
Usage: python -m scripts.diarize_case <caseId> [caseId...]
"""
import json
import os
import sys

import psycopg2

from pipeline.transcribe import label_speakers
from pipeline.adapters import OpenAiDiarizer


def _dsn():
    return (os.environ.get("DIRECT_URL") or os.environ["DATABASE_URL"]).replace("?pgbouncer=true", "").split("?")[0]


def main():
    ids = [int(x) for x in sys.argv[1:]]
    if not ids:
        raise SystemExit("usage: diarize_case.py <caseId> [caseId...]")
    diarizer = OpenAiDiarizer()
    conn = psycopg2.connect(_dsn())
    try:
        for cid in ids:
            with conn.cursor() as cur:
                cur.execute("select transcript from case_content where case_id=%s", (cid,))
                row = cur.fetchone()
                if not row:
                    print(f"case {cid}: no content, skip")
                    continue
                segs = row[0]
                labeled = label_speakers(segs, diarizer.label(segs))
                n = sum(1 for s in labeled if s.get("speaker"))
                cur.execute(
                    "update case_content set transcript=%s::jsonb where case_id=%s",
                    (json.dumps(labeled, ensure_ascii=False), cid),
                )
            conn.commit()
            print(f"case {cid}: labeled {n}/{len(segs)} segments")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
