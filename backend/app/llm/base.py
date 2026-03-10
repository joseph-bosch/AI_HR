from abc import ABC, abstractmethod
from typing import Any, AsyncIterator

from pydantic import BaseModel


class LLMResponse(BaseModel):
    content: str
    parsed: dict[str, Any] | None = None
    model: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    duration_ms: float | None = None
    tool_calls: list[dict[str, Any]] | None = None


class LLMProvider(ABC):

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.3,
        max_tokens: int = 4096,
        json_mode: bool = False,
    ) -> LLMResponse:
        ...

    @abstractmethod
    async def generate_structured(
        self,
        prompt: str,
        output_schema: type[BaseModel],
        system_prompt: str | None = None,
        temperature: float = 0.1,
    ) -> LLMResponse:
        ...

    @abstractmethod
    async def generate_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        temperature: float = 0.3,
    ) -> LLMResponse:
        ...

    @abstractmethod
    async def generate_stream(
        self,
        messages: list[dict[str, Any]],
        temperature: float = 0.3,
    ) -> AsyncIterator[str]:
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        ...
