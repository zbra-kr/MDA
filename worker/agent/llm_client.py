"""
LLM 클라이언트 추상화 (Phase 2.1 단계 E-1).

구현:
  OllamaClient  — Ollama OpenAI 호환 엔드포인트 (1차 시도)
  AnthropicClient — 골격만. 정호철이 Ollama 검증 후 결정하면 구현.

사용:
    from worker.agent.llm_client import OllamaClient
    client = OllamaClient()
    result = await client.complete(system="...", user="...", model="gemma:e4b")
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod

from loguru import logger
from openai import AsyncOpenAI


# ─── 공통 인터페이스 ─────────────────────────────────────────────────────────


class LLMClient(ABC):
    @abstractmethod
    async def complete(
        self,
        system: str,
        user: str,
        model: str,
        timeout: float = 60.0,
    ) -> str | None:
        """LLM 호출. 성공 시 응답 텍스트, 실패 시 None 반환."""


# ─── OllamaClient ────────────────────────────────────────────────────────────


class OllamaClient(LLMClient):
    """Ollama OpenAI-호환 클라이언트. OLLAMA_HOST 환경변수 참조."""

    def __init__(self, host: str | None = None) -> None:
        self.host  = host or os.environ.get("OLLAMA_HOST", "http://localhost:11434/v1")
        self._acli = AsyncOpenAI(base_url=self.host, api_key="ollama")

    async def complete(
        self,
        system: str,
        user: str,
        model: str = "gemma:e4b",
        timeout: float = 60.0,
    ) -> str | None:
        for attempt in range(2):
            try:
                resp = await self._acli.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user",   "content": user},
                    ],
                    temperature=0.3,
                    timeout=timeout,
                )
                content = resp.choices[0].message.content or ""
                usage   = resp.usage

                logger.bind(
                    model=model,
                    tokens_in=usage.prompt_tokens if usage else None,
                    tokens_out=usage.completion_tokens if usage else None,
                    attempt=attempt + 1,
                ).debug("ollama_complete")

                return content

            except Exception as exc:
                logger.warning(f"OllamaClient.complete attempt={attempt+1} failed: {exc}")
                if attempt == 1:
                    return None
        return None

    async def complete_with_usage(
        self,
        system: str,
        user: str,
        model: str = "gemma:e4b",
        timeout: float = 60.0,
    ) -> tuple[str | None, int, int, int]:
        """(content, tokens_in, tokens_out, latency_ms) 반환."""
        import time

        t0 = time.monotonic()
        for attempt in range(2):
            try:
                resp = await self._acli.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user",   "content": user},
                    ],
                    temperature=0.3,
                    timeout=timeout,
                )
                latency_ms = int((time.monotonic() - t0) * 1000)
                content    = resp.choices[0].message.content or ""
                usage      = resp.usage
                tok_in     = usage.prompt_tokens if usage else 0
                tok_out    = usage.completion_tokens if usage else 0

                logger.bind(
                    model=model, tokens_in=tok_in, tokens_out=tok_out,
                    latency_ms=latency_ms, attempt=attempt + 1,
                ).info("ollama_complete_ok")

                return content, tok_in, tok_out, latency_ms

            except Exception as exc:
                logger.warning(f"OllamaClient attempt={attempt+1} failed: {exc}")
                if attempt == 1:
                    return None, 0, 0, int((time.monotonic() - t0) * 1000)
        return None, 0, 0, 0


# ─── AnthropicClient (골격 — Phase 2.1 단계 E-4 정호철 결정 후 구현) ─────────


class AnthropicClient(LLMClient):
    """Claude API 클라이언트 골격. 정호철이 Ollama 검증 후 결정 시 본격 구현."""

    def __init__(self, model: str = "claude-haiku-4-5-20251001") -> None:
        self.default_model = model

    async def complete(
        self,
        system: str,
        user: str,
        model: str | None = None,
        timeout: float = 60.0,
    ) -> str | None:
        # TODO: 정호철 Ollama 검증 후 구현
        raise NotImplementedError(
            "AnthropicClient 미구현. Ollama 검증 완료 후 worker/agent/llm_client.py 에 구현."
        )

    async def complete_with_usage(
        self,
        system: str,
        user: str,
        model: str | None = None,
        timeout: float = 60.0,
    ) -> tuple[str | None, int, int, int]:
        raise NotImplementedError("AnthropicClient 미구현.")


# ─── 팩토리 ─────────────────────────────────────────────────────────────────


def get_client(provider: str = "ollama") -> LLMClient:
    """provider: 'ollama' | 'anthropic'"""
    if provider == "ollama":
        return OllamaClient()
    if provider == "anthropic":
        return AnthropicClient()
    raise ValueError(f"알 수 없는 LLM provider: {provider}")
