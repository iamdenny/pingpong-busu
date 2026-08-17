# iPing 격리 러너

이 image는 iPing browser worker만 실행하는 저장소 전용 GitHub Actions runner입니다. GitHub-hosted 데이터센터 IP에서 iPing 로그인이 거부되므로 Docker Desktop의 local-network egress를 사용합니다.

- Linux ARM64 runner `2.336.0` tarball을 고정 SHA-256으로 검증합니다.
- non-root `runner` 사용자와 system Chromium을 사용합니다.
- 실행 시 host directory, Docker socket, port를 mount하거나 공개하지 않습니다.
- `--cap-drop ALL`, `--security-opt no-new-privileges`, 메모리·CPU·PID 제한과 `--restart unless-stopped`를 적용합니다.
- GitHub의 단기 registration token은 최초 실행의 표준 입력으로만 전달합니다. image, 환경 변수, 저장소에 기록하지 않습니다.
- production environment는 `main` deployment branch만 허용하고, 다른 workflow에는 `iping` 라벨을 사용하지 않습니다.

## 최초 등록

Repository Settings → Actions → Runners에서 Linux ARM64 registration token을 발급한 뒤 아래처럼 TTY를 연결해 컨테이너를 시작합니다.

```bash
docker run \
  --interactive \
  --tty \
  --name busu-iping-runner \
  --restart unless-stopped \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --memory 2g \
  --cpus 2 \
  --pids-limit 256 \
  --shm-size 512m \
  --label io.busu.purpose=iping-runner \
  busu-iping-runner:2.336.0
```

registration token을 붙여 넣고 Enter를 누릅니다. 입력값은 화면에 표시되지 않습니다. `Listening for Jobs`를 확인한 뒤 `Ctrl-P`, `Ctrl-Q` 순서로 눌러 컨테이너를 중지하지 않고 터미널만 분리합니다. token을 파일·환경 변수·shell history에 넣지 않습니다.

이미 등록된 컨테이너는 Docker Desktop 재시작 후 자동 복구되며 registration token을 다시 요구하지 않습니다. 컨테이너를 삭제해 재등록해야 할 때만 Repository Settings → Actions → Runners에서 새 token을 발급합니다.

## 5분 drain dispatch

GitHub 예약은 best-effort라 `*/5` cron으로도 실제 실행 간격이 20~80분까지 벌어집니다. 상시 떠 있는 이 호스트에서 5분마다 `workflow_dispatch`를 보내 대기열을 실제 주기로 비웁니다. workflow의 예약 cron은 호스트가 꺼졌을 때를 위한 backstop으로 남깁니다.

`dispatch-drain.sh`는 이미 실행 중이거나 대기 중인 실행이 있으면 dispatch하지 않으므로 러너가 느릴 때 실행이 쌓이지 않습니다.

### 토큰

Actions `read and write` 권한만 가진 fine-grained PAT를 발급해 호스트 사용자만 읽을 수 있는 파일에 둡니다. 저장소, image, shell history에는 남기지 않습니다.

```bash
install -m 700 -d ~/.config/busu-iping
printf 'GH_TOKEN=%s\n' "$(read -rs -p 'PAT: ' token; echo "$token")" > ~/.config/busu-iping/dispatch.env
chmod 600 ~/.config/busu-iping/dispatch.env
```

### cron 등록

```bash
crontab -l 2>/dev/null | grep -v dispatch-drain.sh > /tmp/busu-cron
echo '*/5 * * * * set -a; . $HOME/.config/busu-iping/dispatch.env; set +a; /path/to/pingpong-busu/ops/iping-runner/dispatch-drain.sh >> $HOME/.config/busu-iping/dispatch.log 2>&1' >> /tmp/busu-cron
crontab /tmp/busu-cron && rm /tmp/busu-cron
```

`/path/to/pingpong-busu`는 이 저장소를 clone한 실제 경로로 바꿉니다. 로그에는 dispatch 여부만 남고 토큰과 검색어는 남지 않습니다.

### 점검

```bash
BUSU_REPOSITORY=iamdenny/pingpong-busu ./ops/iping-runner/dispatch-drain.sh
```

`requested one drain run`이면 정상이고, 이미 실행 중이면 `skipped`가 나옵니다. Actions 목록에서 `workflow_dispatch` 트리거 실행이 5분 간격으로 보이면 적용된 것입니다.
