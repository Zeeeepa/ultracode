"""
MLX Embedding Server

FastAPI server providing OpenAI-compatible embedding API using Apple MLX framework.
Designed for macOS ARM64 (Apple Silicon) with Metal GPU acceleration.

Usage:
    python server.py --model intfloat/multilingual-e5-base --port 8087
    python server.py --model intfloat/multilingual-e5-small --port 8087 --batch-size 64

Endpoints:
    GET  /health        - Health check with model info
    GET  /v1/models     - List loaded models
    POST /v1/embeddings - Generate embeddings (OpenAI-compatible)
"""

import argparse
import logging
import time
import sys
from typing import Union

import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

# MLX imports
try:
    from mlx_embedding_models.embedding import EmbeddingModel
except ImportError:
    print("ERROR: mlx-embedding-models not installed. Run: pip install mlx-embedding-models", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("mlx-embedding")

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(title="MLX Embedding Server", version="1.0.0")

# Global state
model_instance: EmbeddingModel | None = None
model_name: str = ""
model_dimension: int = 0
max_batch_size: int = 128


# ---------------------------------------------------------------------------
# Request / Response schemas (OpenAI-compatible)
# ---------------------------------------------------------------------------
class EmbeddingRequest(BaseModel):
    model: str = ""
    input: Union[str, list[str]] = Field(..., description="Text or list of texts to embed")
    encoding_format: str = "float"


class EmbeddingData(BaseModel):
    object: str = "embedding"
    embedding: list[float]
    index: int


class EmbeddingUsage(BaseModel):
    prompt_tokens: int = 0
    total_tokens: int = 0


class EmbeddingResponse(BaseModel):
    object: str = "list"
    data: list[EmbeddingData]
    model: str
    usage: EmbeddingUsage


class HealthResponse(BaseModel):
    status: str
    model: str
    dimension: int


class ModelInfo(BaseModel):
    id: str
    object: str = "model"
    owned_by: str = "mlx"


class ModelsResponse(BaseModel):
    object: str = "list"
    data: list[ModelInfo]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health", response_model=HealthResponse)
async def health():
    if model_instance is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return HealthResponse(status="ok", model=model_name, dimension=model_dimension)


@app.get("/v1/models", response_model=ModelsResponse)
async def list_models():
    if model_instance is None:
        return ModelsResponse(data=[])
    return ModelsResponse(data=[ModelInfo(id=model_name)])


@app.post("/v1/embeddings", response_model=EmbeddingResponse)
async def create_embeddings(request: EmbeddingRequest):
    if model_instance is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    # Normalize input to list
    texts: list[str]
    if isinstance(request.input, str):
        texts = [request.input]
    else:
        texts = request.input

    if not texts:
        raise HTTPException(status_code=400, detail="Input must not be empty")

    if len(texts) > max_batch_size:
        raise HTTPException(
            status_code=400,
            detail=f"Batch size {len(texts)} exceeds maximum {max_batch_size}",
        )

    try:
        t0 = time.perf_counter()
        # mlx_embedding_models returns numpy arrays
        embeddings_raw = model_instance.encode(texts)
        elapsed = time.perf_counter() - t0

        # Convert to list of lists
        if isinstance(embeddings_raw, np.ndarray):
            embeddings_list = embeddings_raw.tolist()
        else:
            # mlx array - convert via numpy
            embeddings_list = np.array(embeddings_raw).tolist()

        logger.debug(
            "Embedded %d texts in %.3fs (%.1f texts/s)",
            len(texts), elapsed, len(texts) / elapsed if elapsed > 0 else 0,
        )

        data = [
            EmbeddingData(embedding=emb, index=i)
            for i, emb in enumerate(embeddings_list)
        ]

        return EmbeddingResponse(
            data=data,
            model=model_name,
            usage=EmbeddingUsage(prompt_tokens=0, total_tokens=0),
        )
    except Exception as e:
        logger.error("Embedding error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
def load_model(name: str) -> tuple[EmbeddingModel, int]:
    """Load model and return (model, dimension)."""
    logger.info("Loading model: %s", name)
    t0 = time.perf_counter()
    mdl = EmbeddingModel.from_registry(name)
    elapsed = time.perf_counter() - t0
    logger.info("Model loaded in %.1fs", elapsed)

    # Warmup + determine dimension
    logger.info("Warmup embedding...")
    warmup_result = mdl.encode(["warmup"])
    if isinstance(warmup_result, np.ndarray):
        dim = warmup_result.shape[1]
    else:
        dim = len(warmup_result[0])
    logger.info("Model ready: %s, dimension=%d", name, dim)
    return mdl, dim


def main():
    global model_instance, model_name, model_dimension, max_batch_size

    parser = argparse.ArgumentParser(description="MLX Embedding Server")
    parser.add_argument("--model", type=str, default="intfloat/multilingual-e5-base",
                        help="HuggingFace model name (default: intfloat/multilingual-e5-base)")
    parser.add_argument("--port", type=int, default=8087, help="Server port (default: 8087)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Server host (default: 127.0.0.1)")
    parser.add_argument("--batch-size", type=int, default=128, help="Max batch size (default: 128)")
    args = parser.parse_args()

    model_name = args.model
    max_batch_size = args.batch_size

    # Load model before starting server
    model_instance, model_dimension = load_model(model_name)

    logger.info("Starting server on %s:%d", args.host, args.port)
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
