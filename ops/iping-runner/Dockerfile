FROM debian:bookworm-slim

ARG RUNNER_VERSION=2.336.0
ARG RUNNER_SHA256=58b758e420b87093fbd4bfddd368074960053e2f1388f01848c82624b90f27d1

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends \
    ca-certificates \
    chromium \
    curl \
    git \
    jq \
    tini \
  && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 10001 --shell /bin/bash runner \
  && mkdir --parents /actions-runner \
  && curl --fail --location --silent --show-error \
    --output /tmp/actions-runner.tar.gz \
    "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-arm64-${RUNNER_VERSION}.tar.gz" \
  && echo "${RUNNER_SHA256}  /tmp/actions-runner.tar.gz" | sha256sum --check --strict \
  && tar --extract --gzip --file /tmp/actions-runner.tar.gz --directory /actions-runner \
  && rm /tmp/actions-runner.tar.gz \
  && /actions-runner/bin/installdependencies.sh \
  && chown --recursive runner:runner /actions-runner

COPY --chmod=755 entrypoint.sh /usr/local/bin/busu-iping-runner-entrypoint

USER runner
WORKDIR /actions-runner

ENV IPING_BROWSER_EXECUTABLE=/usr/bin/chromium

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/busu-iping-runner-entrypoint"]
