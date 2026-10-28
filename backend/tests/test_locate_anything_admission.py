"""LocateAnything server admission + CUDA-capacity retry helpers (no GPU)."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from PIL import Image

from scripts.locate_anything_server import (
    CUDA_CAPACITY_BACKOFF_SECONDS,
    CUDA_CAPACITY_MAX_ATTEMPTS,
    LocateService,
    _adaptive_image_sides,
    _cuda_capacity_backoff_seconds,
    _is_cuda_capacity_error,
)


def test_is_cuda_capacity_error_matches_oom_phrases():
    assert _is_cuda_capacity_error(RuntimeError("CUDA out of memory"))
    assert _is_cuda_capacity_error(RuntimeError("CUDACachingAllocator: failed"))
    assert _is_cuda_capacity_error(RuntimeError("make_resident failed"))
    assert not _is_cuda_capacity_error(RuntimeError("invalid argument"))


def test_cuda_capacity_backoff_seconds_schedule():
    assert _cuda_capacity_backoff_seconds(0) == 0.0
    assert _cuda_capacity_backoff_seconds(1) == CUDA_CAPACITY_BACKOFF_SECONDS[0]
    assert _cuda_capacity_backoff_seconds(2) == CUDA_CAPACITY_BACKOFF_SECONDS[1]
    assert _cuda_capacity_backoff_seconds(3) == CUDA_CAPACITY_BACKOFF_SECONDS[2]
    # Clamp past the table
    assert _cuda_capacity_backoff_seconds(99) == CUDA_CAPACITY_BACKOFF_SECONDS[-1]
    assert CUDA_CAPACITY_MAX_ATTEMPTS == 1 + len(CUDA_CAPACITY_BACKOFF_SECONDS)


def test_adaptive_image_sides_descends_from_requested():
    sides = _adaptive_image_sides(1280)
    assert sides[0] == 1280
    assert sides == sorted(sides, reverse=True)
    assert all(s <= 1280 for s in sides)


@pytest.mark.asyncio
async def test_admission_slot_serializes_and_logs_wait(capsys):
    svc = LocateService()
    order: list[str] = []

    async def hold(label: str, work_s: float) -> None:
        async with svc._admission_slot():
            order.append(f"enter-{label}")
            await asyncio.sleep(work_s)
            order.append(f"exit-{label}")

    await asyncio.gather(hold("a", 0.05), hold("b", 0.01))
    # Second must not enter until first exits.
    assert order == ["enter-a", "exit-a", "enter-b", "exit-b"] or order == [
        "enter-b",
        "exit-b",
        "enter-a",
        "exit-a",
    ]
    # Whichever ran second waited on the gate.
    err = capsys.readouterr().out
    assert "admission_wait_ms=" in err


@pytest.mark.asyncio
async def test_vllm_chat_retries_oom_then_succeeds_without_503():
    svc = LocateService()
    svc.ready = True
    image = Image.new("RGB", (64, 64), color=(255, 255, 255))
    calls = {"encode": 0}

    def fake_encode(_image):
        calls["encode"] += 1
        if calls["encode"] == 1:
            raise RuntimeError("CUDA out of memory")
        return "vit", 1

    def fake_build(_image, _prompt, _vit, _n):
        return "b64"

    def fake_complete(_b64, _temperature=0.7, _n=1):
        return [("no boxes", [])]

    with (
        patch.object(svc, "_encode_vit", side_effect=fake_encode),
        patch.object(svc, "_build_prompt_embeds_b64", side_effect=fake_build),
        patch.object(svc, "_vllm_complete_b64", side_effect=fake_complete),
        patch("scripts.locate_anything_server.trim_cuda_cache"),
        patch("scripts.locate_anything_server._parse_boxes", return_value=[]),
        patch("scripts.locate_anything_server.fold_sample_boxes", side_effect=lambda x: x),
        patch("scripts.locate_anything_server.asyncio.sleep", new_callable=AsyncMock) as sleep,
    ):
        answer, boxes, size = await svc._predict_boxes_vllm(image, "seal", 640)

    assert answer == "no boxes"
    assert boxes == []
    assert size == (640, 640) or size[0] <= 640
    assert calls["encode"] == 2
    sleep.assert_awaited()  # backoff before attempt 1
    # Must not have raised HTTPException 503


@pytest.mark.asyncio
async def test_vllm_chat_not_ready_still_503():
    svc = LocateService()
    svc.ready = False
    image = Image.new("RGB", (32, 32), color=0)
    with pytest.raises(HTTPException) as ei:
        await svc._predict_boxes_vllm(image, "seal", 640)
    assert ei.value.status_code == 503
    assert "not ready" in str(ei.value.detail)
