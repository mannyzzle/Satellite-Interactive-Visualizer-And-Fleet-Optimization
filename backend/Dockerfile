FROM python:3.10-slim

ENV DEBIAN_FRONTEND=noninteractive

# 1) Install fonts-liberation + fontconfig so matplotlib can find them
RUN apt-get update && apt-get install -y --no-install-recommends \
    fontconfig \
    fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . /app

RUN pip install --no-cache-dir -r /app/requirements.txt


EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
