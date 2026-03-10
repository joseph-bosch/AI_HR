from pydantic import BaseModel


class PaginationParams(BaseModel):
    page: int = 1
    per_page: int = 20


class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    per_page: int
    total_pages: int


class StatusResponse(BaseModel):
    status: str
    message: str | None = None


class ErrorResponse(BaseModel):
    detail: str
