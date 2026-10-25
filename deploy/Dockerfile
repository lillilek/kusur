FROM python:3.12-slim
ARG TSAKORPUS_REF=87bc1c6870e2ca367f98a10acb350b9df05154a3
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && git clone https://github.com/timarkh/tsakorpus.git /app \
    && cd /app && git checkout "$TSAKORPUS_REF" && rm -rf .git
COPY deploy/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
COPY tsakorpus/conf/ /app/conf/
COPY tsakorpus/corpus/ /app/corpus/
COPY deploy/customize.py /tmp/customize.py
RUN python /tmp/customize.py
COPY deploy/wsgi.py /app/search/kusur_wsgi.py
COPY deploy/check_index.py /app/indexator/check_index.py
RUN useradd --uid 10001 --create-home corpus && chown -R corpus:corpus /app
USER corpus
WORKDIR /app/search
ENV PYTHONUNBUFFERED=1
CMD ["gunicorn", "--bind", "0.0.0.0:7342", "--workers", "1", "--threads", "4", "--timeout", "90", "kusur_wsgi:application"]
