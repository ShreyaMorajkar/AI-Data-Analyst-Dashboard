import os
from datetime import date, datetime
from io import StringIO
from pathlib import Path

import pandas as pd
import duckdb
from flask import Flask, jsonify, request

app = Flask(__name__)
MAX_PREVIEW_ROWS = 5

UPLOADS_DIR = Path(__file__).parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)


def read_csv_payload(csv_text):
    normalized_text = str(csv_text or "").replace("\ufeff", "").strip()
    if not normalized_text:
        raise ValueError("The uploaded CSV file is empty.")

    separators = [None, ",", ";", "\t", "|"]
    last_error = None

    for separator in separators:
        try:
            frame = pd.read_csv(
                StringIO(normalized_text),
                sep=separator,
                engine="python",
                on_bad_lines="skip",
                skipinitialspace=True,
            )
            frame.columns = [str(column).strip().replace("\ufeff", "") for column in frame.columns]
            frame = frame.dropna(how="all")

            if frame.empty or not len(frame.columns):
                continue

            if len(frame.columns) == 1:
                first_column = str(frame.columns[0])
                if any(token in first_column for token in [";", "\t", "|"]):
                    continue

            return frame
        except Exception as error:
            last_error = error

    raise ValueError("The CSV structure could not be detected cleanly.") from last_error

def prettify_label(value):
    return " ".join(str(value).replace("_", " ").replace("-", " ").split()).title()

def to_records(frame):
    cleaned = frame.where(pd.notnull(frame), None)
    records = []

    for row in cleaned.to_dict(orient="records"):
        normalized_row = {}
        for key, value in row.items():
            if hasattr(value, "item"):
                value = value.item()

            if isinstance(value, pd.Timestamp):
                normalized_row[key] = value.isoformat()
            elif isinstance(value, (datetime, date)):
                normalized_row[key] = value.isoformat()
            elif pd.isna(value):
                normalized_row[key] = None
            else:
                normalized_row[key] = value
        records.append(normalized_row)

    return records


def detect_columns(frame):
    columns = []
    numeric_columns = []
    categorical_columns = []
    date_columns = []

    for column in frame.columns:
        series = frame[column]
        non_empty = series.dropna()
        numeric_ratio = pd.to_numeric(non_empty, errors="coerce").notna().mean() if len(non_empty) else 0
        string_values = non_empty.astype(str)
        date_candidates = string_values[string_values.str.contains(r"[A-Za-z]|[-/:]", regex=True)]
        date_ratio = pd.to_datetime(date_candidates, errors="coerce").notna().mean() if len(date_candidates) else 0

        column_type = "categorical"
        if date_ratio >= 0.7:
            column_type = "date"
        elif numeric_ratio >= 0.7:
            column_type = "numeric"

        descriptor = {
            "name": str(column),
            "label": prettify_label(column),
            "type": column_type,
            "nonEmptyCount": int(len(non_empty)),
            "uniqueCount": int(non_empty.astype(str).str.lower().nunique()),
        }
        columns.append(descriptor)

        if column_type == "numeric":
            numeric_columns.append(descriptor)
        elif column_type == "date":
            date_columns.append(descriptor)
        else:
            categorical_columns.append(descriptor)

    return columns, numeric_columns, categorical_columns, date_columns


def build_data_quality(frame, columns):
    total_rows = int(len(frame))
    total_columns = int(len(frame.columns))
    total_cells = total_rows * total_columns if total_rows and total_columns else 0
    missing_cells = int(frame.isna().sum().sum()) if total_cells else 0
    duplicate_rows = int(frame.duplicated().sum()) if total_rows else 0
    completeness_ratio = 1 - (missing_cells / total_cells) if total_cells else 1

    column_diagnostics = []
    warnings = []

    for descriptor in columns:
        column_name = descriptor["name"]
        series = frame[column_name]
        missing_count = int(series.isna().sum())
        missing_ratio = missing_count / total_rows if total_rows else 0
        issue = None

        if missing_ratio >= 0.5:
            issue = "High missing rate"
        elif descriptor["type"] == "categorical" and descriptor["uniqueCount"] == 1 and total_rows > 1:
            issue = "Single repeated value"
        elif descriptor["type"] == "numeric" and descriptor["nonEmptyCount"] and missing_ratio >= 0.2:
            issue = "Sparse metric"

        if issue:
            warnings.append(f"{descriptor['label']}: {issue.lower()}.")

        column_diagnostics.append(
            {
                "name": column_name,
                "label": descriptor["label"],
                "type": descriptor["type"],
                "missingCount": missing_count,
                "missingRatio": round(missing_ratio, 3),
                "issue": issue,
            }
        )

    if duplicate_rows:
        warnings.append(f"{duplicate_rows} duplicate rows detected.")
    if completeness_ratio < 0.85:
        warnings.append("Dataset has notable missing values that may affect analysis quality.")

    return {
        "duplicateRowCount": duplicate_rows,
        "missingCellCount": missing_cells,
        "totalCells": total_cells,
        "completenessRatio": round(completeness_ratio, 3),
        "warnings": warnings[:8],
        "columnDiagnostics": column_diagnostics,
    }

def build_suggestion_chips(profile):
    metric = profile["numericColumns"][0]["label"].lower() if profile["numericColumns"] else "sales"
    dimension = profile["categoricalColumns"][0]["label"].lower() if profile["categoricalColumns"] else "category"
    date = profile["dateColumns"][0]["label"].lower() if profile["dateColumns"] else "date"
    return [
        f"Show {metric} trend by {date}",
        f"Top 5 {dimension} by {metric}",
        f"Which {dimension} has the highest {metric}?",
        f"Average {metric}",
    ]


@app.get("/health")
def health():
    return jsonify({"ok": True})


@app.post("/profile")
def profile():
    payload = request.get_json(force=True)
    csv_text = payload.get("csv_text", "")
    session_id = payload.get("sessionId")
    
    if not session_id:
        return jsonify({"error": "Missing sessionId"}), 400

    frame = read_csv_payload(csv_text)
    frame = frame.dropna(how="all")
    
    # Save optimized CSV for DuckDB query later
    file_path = UPLOADS_DIR / f"{session_id}.csv"
    frame.to_csv(file_path, index=False)

    columns, numeric_columns, categorical_columns, date_columns = detect_columns(frame)
    quality = build_data_quality(frame, columns)

    # Return only preview rows to Node, not the entire dataset.
    preview_rows = to_records(frame.head(MAX_PREVIEW_ROWS))

    profile_data = {
        "rowCount": len(frame),
        "columns": columns,
        "numericColumns": numeric_columns,
        "categoricalColumns": categorical_columns,
        "dateColumns": date_columns,
        "previewRows": preview_rows,
        "quality": quality,
    }

    return jsonify(
        {
            "profile": profile_data,
            "suggestionChips": build_suggestion_chips(profile_data),
        }
    )


@app.post("/execute")
def execute():
    payload = request.get_json(force=True)
    session_id = payload.get("sessionId")
    sql_query = payload.get("sqlQuery")

    if not session_id or not sql_query:
        return jsonify({"error": "Missing sessionId or sqlQuery"}), 400

    file_path = UPLOADS_DIR / f"{session_id}.csv"
    if not file_path.exists():
        return jsonify({"error": "Session data not found. Please re-upload.", "timeout": True}), 404

    try:
        db = duckdb.connect(':memory:')
        # Note: replace single quotes inside the path just in case, or use parameters, but UUIDs are safe.
        db.execute(f"CREATE VIEW data AS SELECT * FROM '{file_path.as_posix()}'")
        result_df = db.execute(sql_query).df()
        
        # Limit rows to avoid massive payloads for charts
        result_df = result_df.head(50)
        
        return jsonify({
            "rows": to_records(result_df)
        })
    except Exception as e:
        return jsonify({"error": f"SQL Execution failed: {str(e)}"}), 400


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
