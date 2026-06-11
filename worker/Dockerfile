# MemoPic — Worker de reconhecimento facial (InsightFace, CPU)
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=7860

# Dependências de sistema: build do insightface, OpenCV e a fonte da marca d'água
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential cmake \
        libglib2.0-0 libgl1 \
        fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

# Baixa o modelo buffalo_l JÁ na build (~300MB) pra não baixar no cold start
RUN python -c "from insightface.app import FaceAnalysis; FaceAnalysis(name='buffalo_l').prepare(ctx_id=0, det_size=(640,640))"

COPY . .

EXPOSE 7860
# $PORT funciona tanto no Render quanto no Hugging Face Spaces (default 7860)
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]