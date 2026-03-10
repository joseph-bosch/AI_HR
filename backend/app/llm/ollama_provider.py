import json
import time
from typing import Any

import httpx
from pydantic import BaseModel, ValidationError

from app.llm.base import LLMProvider, LLMResponse


class OllamaProvider(LLMProvider):
    def __init__(self, base_url: str, model: str, timeout: int = 120, max_retries: int = 2):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self.max_retries = max_retries
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=10.0))

    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.3,
        max_tokens: int = 4096,
        json_mode: bool = False,
    ) -> LLMResponse:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "think": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            },
        }
        if json_mode:
            payload["format"] = "json"

        start = time.monotonic()
        response = await self._client.post(
            f"{self.base_url}/api/chat",
            json=payload,
        )
        response.raise_for_status()
        duration_ms = (time.monotonic() - start) * 1000

        data = response.json()
        content = data["message"]["content"]

        parsed = None
        if json_mode:
            try:
                parsed = json.loads(content)
            except json.JSONDecodeError:
                pass

        return LLMResponse(
            content=content,
            parsed=parsed,
            model=data.get("model", self.model),
            prompt_tokens=data.get("prompt_eval_count"),
            completion_tokens=data.get("eval_count"),
            duration_ms=duration_ms,
        )

    async def generate_structured(
        self,
        prompt: str,
        output_schema: type[BaseModel],
        system_prompt: str | None = None,
        temperature: float = 0.1,
    ) -> LLMResponse:
        schema_json = json.dumps(output_schema.model_json_schema(), indent=2)
        structured_prompt = (
            f"{prompt}\n\n"
            f"You MUST respond with valid JSON matching this exact schema:\n"
            f"```json\n{schema_json}\n```\n"
            f"Respond ONLY with the JSON object, no additional text."
        )

        for attempt in range(self.max_retries + 1):
            response = await self.generate(
                prompt=structured_prompt,
                system_prompt=system_prompt,
                temperature=temperature,
                json_mode=True,
            )

            if response.parsed:
                try:
                    validated = output_schema.model_validate(response.parsed)
                    response.parsed = validated.model_dump()
                    return response
                except ValidationError:
                    if attempt == self.max_retries:
                        raise
                    continue

        return response

    async def health_check(self) -> bool:
        try:
            response = await self._client.get(f"{self.base_url}/api/tags")
            return response.status_code == 200
        except Exception:
            return False

    async def list_models(self) -> list[str]:
        try:
            response = await self._client.get(f"{self.base_url}/api/tags")
            response.raise_for_status()
            data = response.json()
            return [m["name"] for m in data.get("models", [])]
        except Exception:
            return []

    async def generate_with_tools(
        self,
        messages: list[dict],
        tools: list[dict],
        temperature: float = 0.3,
    ) -> LLMResponse:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "tools": tools,
            "stream": False,
            "think": False,
            "options": {"temperature": temperature},
        }
        response = await self._client.post(f"{self.base_url}/api/chat", json=payload)
        response.raise_for_status()
        data = response.json()
        msg = data.get("message", {})
        content = msg.get("content", "")
        tool_calls = msg.get("tool_calls")  # list[{function: {name, arguments}}] or None
        return LLMResponse(
            content=content,
            parsed=None,
            model=data.get("model", self.model),
            prompt_tokens=data.get("prompt_eval_count"),
            completion_tokens=data.get("eval_count"),
            tool_calls=tool_calls,
        )

    async def generate_stream(
        self,
        messages: list[dict],
        temperature: float = 0.3,
    ):
        """Async generator yielding string tokens from a streaming Ollama response."""
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "think": False,
            "options": {"temperature": temperature},
        }
        async with self._client.stream("POST", f"{self.base_url}/api/chat", json=payload) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    content = data.get("message", {}).get("content", "")
                    if content:
                        yield content
                    if data.get("done"):
                        break
                except json.JSONDecodeError:
                    continue

    async def close(self):
        await self._client.aclose()
