#!/bin/bash

set -euo pipefail

readonly repository_url="https://github.com/iamdenny/pingpong-busu"
readonly runner_name="busu-iping-docker"
readonly runner_labels="iping"

cd /actions-runner

if [[ ! -f .runner ]]; then
  IFS= read -rs registration_token
  if [[ -t 0 ]]; then
    echo
  fi
  if [[ -z "$registration_token" ]]; then
    echo "A one-time GitHub runner registration token is required on standard input." >&2
    exit 1
  fi

  ./config.sh \
    --unattended \
    --disableupdate \
    --replace \
    --url "$repository_url" \
    --token "$registration_token" \
    --name "$runner_name" \
    --labels "$runner_labels" \
    --work _work
  unset registration_token
fi

exec ./run.sh
