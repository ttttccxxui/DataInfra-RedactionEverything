from __future__ import annotations

import hashlib
import hmac
import logging
import re
import time
from decimal import Decimal, InvalidOperation
from types import SimpleNamespace
from typing import Any

from app.core.config import settings
from app.core.degrade_policy import degrade_ok
from app.models.errors import NotFoundError
from app.services import whitelist_service
from app.services.structured_common import MAX_PREVIEW_ROWS, compact_text, normalize_value
from app.services.structured_files import load_dataset_rows
from app.services.structured_profile import get_or_create_policy, registered_schema_table
from app.services.structured_store import StructuredStore, get_structured_store

logger = logging.getLogger(__name__)


def preview_dataset(
    dataset_id: str,
    *,
    owner_id: str,
    limit: int = MAX_PREVIEW_ROWS,
    store: StructuredStore | None = None,
) -> dict[str, Any]:
    store = store or get_structured_store()
    dataset = store.get_dataset(dataset_id, owner_id=owner_id)
    if not dataset:
        raise NotFoundError("dataset not found")
    try:
        table = load_dataset_rows(dataset, owner_id=owner_id, limit=min(MAX_PREVIEW_ROWS, max(1, limit)), store=store)
    except Exception as exc:
        if not dataset.get("connection_id"):
            raise
        table = registered_schema_table(dataset)
        if not table.columns:
            raise
        logger.warning(
            "Structured dataset %s source unavailable; previewing registered schema only: %s",
            dataset_id,
            exc,
        )
    policy = get_or_create_policy(dataset_id, owner_id=owner_id, store=store)
    policy_columns = list(policy.get("columns") or [])
    from app.services.structured_profile import validate_policy_columns
    validate_policy_columns({"columns": [{"name": name} for name in table.columns]}, policy_columns)
    return {
        "dataset_id": dataset_id,
        "columns": table.columns,
        "original_rows": table.rows,
        "redacted_rows": [redact_row(row, policy_columns, owner_id=owner_id, dataset_id=dataset_id) for row in table.rows],
        "policy": policy_columns,
    }


_WHITELIST_TTL_SEC = 5.0
_whitelist_cache: dict[str, tuple[float, list[dict], tuple]] = {}


def _whitelist_entries(owner_id: str) -> list[dict]:
    now = time.monotonic()
    try:
        token = whitelist_service.cache_token(owner_id)
    except OSError:
        # Force a load on unreadable configuration; never reuse stale exemptions.
        token = None
    cached = _whitelist_cache.get(owner_id)
    if cached is not None and token is not None and cached[2] == token and now - cached[0] < _WHITELIST_TTL_SEC:
        return cached[1]
    try:
        entries = whitelist_service.list_entries(owner_id)
    except Exception:
        logger.warning("whitelist unavailable for structured redaction; skipping exemption", exc_info=True)
        entries = degrade_ok(
            [],
            what="招标 5.3 白名单豁免（指定内容不脱敏）",
            channel="结构化库表",
            reason="白名单读取失败，本次按无豁免处理（宁可多脱敏）",
            detail={"owner_id": owner_id},
            user=str(owner_id),
        )
    _whitelist_cache[owner_id] = (now, entries, token)
    return entries


def _cell_is_whitelisted(value: Any, entity_type: str, entries: list[dict]) -> bool:
    text = normalize_value(value)
    if not text:
        return False
    return whitelist_service._is_exempt(SimpleNamespace(text=text, type=entity_type), None, entries)


def redact_row(row: dict[str, Any], policy_columns: list[dict[str, Any]], *, owner_id: str, dataset_id: str) -> dict[str, Any]:
    by_column = {str(item.get("column")): item for item in policy_columns if item.get("enabled", True)}
    out = dict(row)
    entries = _whitelist_entries(owner_id)
    for column, policy in by_column.items():
        if column not in out:
            continue
        entity_type = str(policy.get("entity_type") or "CUSTOM")
        if entries and _cell_is_whitelisted(out[column], entity_type, entries):
            continue
        out[column] = redact_value(
            out[column],
            action=str(policy.get("action") or "keep"),
            entity_type=entity_type,
            salt=f"{owner_id}:{dataset_id}:{column}",
            params=policy.get("params") if isinstance(policy.get("params"), dict) else {},
        )
    return out


def redact_value(value: Any, *, action: str, entity_type: str, salt: str, params: dict[str, Any]) -> Any:
    if value is None or action == "keep":
        return value
    text = normalize_value(value)
    if text == "":
        return value
    if action == "suppress":
        return None
    if action == "hash":
        return stable_digest(text, salt=salt)
    if action == "tokenize":
        return f"{entity_type}_{stable_digest(text, salt=salt)[:12]}"
    if action == "generalize":
        return generalize_value(text, entity_type=entity_type)
    if action == "bucket":
        return bucket_value(text)
    if action == "custom":
        return params.get("replacement", "***")
    return mask_value(text, entity_type=entity_type)


def stable_digest(text: str, *, salt: str) -> str:
    key = (settings.JWT_SECRET_KEY or "structured-redaction").encode("utf-8")
    msg = f"{salt}:{text}".encode()
    return hmac.new(key, msg, hashlib.sha256).hexdigest()[:24]


def mask_value(text: str, *, entity_type: str) -> str:
    compact = compact_text(text)
    if entity_type == "EMAIL" and "@" in text:
        name, domain = text.split("@", 1)
        return f"{mask_keep_edges(name, 1, 0)}@{domain}"
    if entity_type in {"PHONE", "BANK_CARD", "ID_CARD"}:
        return mask_keep_edges(compact, 3, 4)
    if len(text) <= 2:
        return "*" * len(text)
    return mask_keep_edges(text, 1, 1)


def mask_keep_edges(text: str, left: int, right: int) -> str:
    if len(text) <= left + right:
        return "*" * len(text)
    return f"{text[:left]}{'*' * (len(text) - left - right)}{text[-right:] if right else ''}"


def generalize_value(text: str, *, entity_type: str) -> str:
    if entity_type == "DATE":
        match = re.match(r"^(\d{4})[-/年](\d{1,2})", text)
        if match:
            return f"{match.group(1)}-{int(match.group(2)):02d}"
    if entity_type == "ADDRESS":
        return text[:6] + "***" if len(text) > 6 else "***"
    return "***"


def bucket_value(text: str) -> str:
    try:
        amount = Decimal(text.replace(",", "").replace("¥", "").replace("￥", ""))
    except InvalidOperation:
        return "***"
    if amount < 1_000:
        return "<1k"
    if amount < 10_000:
        return "1k-10k"
    if amount < 100_000:
        return "10k-100k"
    if amount < 1_000_000:
        return "100k-1m"
    return ">=1m"
