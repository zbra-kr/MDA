# GitHub Setup Guide

본 레포를 GitHub에 처음 올리는 절차. 정호철님이 직접 수행한다.

## 1. 사전 결정 사항

### 1.1 어디에 올릴 것인가

| 옵션 | 장단점 | 추천 |
|---|---|---|
| 개인 계정 (private) | 즉시 가능, 본인 통제 | PoC 단계만 |
| B.CAVE Organization (private) | 거버넌스 ◎, 인수인계 ◎ | ★ 권장 |
| 사내 GitLab/Gitea | 외부 의존 0, 보안 ◎◎ | 인프라파트 검토 후 |

권장 흐름: **개인 private → Phase 1 검증 통과 후 B.CAVE Org로 이관**.

### 1.2 레포명 컨벤션

권장: `bcave-competitor-radar`

### 1.3 라이선스

`LICENSE` 파일에 proprietary 명시됨. 공개 안 함.

## 2. GitHub에서 빈 레포 만들기

1. https://github.com/new 접속
2. **Repository name**: `bcave-competitor-radar`
3. **Description**: `무신사 경쟁브랜드 모니터링 · 일일 전략 리포트 자동 생성`
4. **Visibility**: **Private** (반드시)
5. **Initialize this repository with**: 모두 체크 해제 (README, .gitignore, license 모두 우리가 이미 있음)
6. Create repository

## 3. 로컬에서 push

```bash
# 1. 받은 zip 파일을 작업 폴더에 압축 해제
unzip bcave-competitor-radar.zip
cd bcave-competitor-radar

# 2. 본인 정보 설정 (전역 설정 안 했다면)
git config user.name "정호철"
git config user.email "you@bcave.co.kr"

# 3. 본 레포는 이미 git init + 초기 커밋 + v0.1.0 태그가 되어 있음.
#    확인:
git log --oneline
git tag

# 4. GitHub 원격 추가 (URL은 위 단계에서 생성한 본인 레포 URL로 교체)
git remote add origin git@github.com:<your-username>/bcave-competitor-radar.git
#  또는 HTTPS:
#  git remote add origin https://github.com/<your-username>/bcave-competitor-radar.git

# 5. push (브랜치 + 태그)
git branch -M main
git push -u origin main
git push origin --tags
```

## 4. GitHub 인증

처음 push할 때 인증 방식:

### SSH (권장, 본인 컴퓨터)
```bash
# 키 생성 (이미 있으면 스킵)
ssh-keygen -t ed25519 -C "you@bcave.co.kr"

# 공개키 복사
cat ~/.ssh/id_ed25519.pub
# → GitHub Settings → SSH and GPG keys → New SSH key 에 붙여넣기
```

### HTTPS + PAT (Personal Access Token)
GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate
- Scope: `repo` 만 체크
- 만료: 90일 (주기적 갱신)
- 생성된 토큰을 push할 때 비밀번호 자리에 입력

## 5. push 후 GitHub에서 추가 설정

### 5.1 Branch protection (main)
- Settings → Branches → Add rule
- Branch name pattern: `main`
- Require pull request before merging ☑
- Require approvals: 1 (혼자 작업 중이면 생략)

### 5.2 Secrets (Actions 사용 시 Phase 3)
- Settings → Secrets and variables → Actions
- 추가 예정: `SUPABASE_SERVICE_KEY`, `OLLAMA_HOST`, `SNOWFLAKE_*` 등
- 현재 Phase 1은 Actions 미사용

### 5.3 Collaborators
- Settings → Collaborators
- B.CAVE 팀원 추가:
  - 인프라파트 김은호·정은상·조진우 (push)
  - DT파트 이현우·도재연·이슬비 (push)
  - 또는 Org로 이관 후 Team 단위 권한 부여

## 6. 다음 작업 (Phase 1 착수)

push 완료 후:
1. **Supabase 프로젝트 생성** → `supabase/migrations/00001_init.sql`, `00002_pgvector.sql`, `seed.sql` 차례로 SQL Editor에서 실행
2. **`.env` 파일 작성** (`.env.example` 참고, 절대 커밋 금지)
3. **워커 개발 환경 셋업**:
   ```bash
   cd worker
   python -m venv .venv
   source .venv/bin/activate
   pip install -e .[dev]
   playwright install chromium
   ```
4. **첫 스크래퍼 작성** — `docs/skills/01-scraping.md` 참고하여 `worker/scrapers/base.py` 부터
   - Cursor/Claude Code 사용 권장
   - 컨텍스트로 줄 파일: `docs/skills/01-scraping.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`

## 7. 커밋 컨벤션

권장 (Conventional Commits):
```
feat(scrapers): musinsa_ranking 카테고리 페이지네이션 추가
fix(ingest): 이미지 phash 중복 제거 누락 수정
docs(skills): 04-matching 가격대 필터 명시
chore(deps): playwright 1.49.1로 업그레이드
```

prefix:
- `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `style`

## 8. 브랜치 전략

PoC 단계 (Phase 1~2): main에 직접 commit OK (혼자 작업)
운영 단계 (Phase 3+): feature 브랜치 + PR

## 9. 비상 시

```bash
# 잘못 커밋한 .env 등 민감 정보 즉시 제거
git rm --cached .env
git commit -m "chore: remove leaked .env"
git push

# 이미 push 된 비밀 키는 즉시 회전 (Supabase·Snowflake 등 모든 키 재발급)
# git-filter-repo로 history에서도 제거 권장
```

비밀 키 유출은 무조건 회전. history에서 지워도 어딘가에 캐시되어 있다고 봐야 함.

## 10. 백업

- GitHub는 충분히 안정적이지만 운영 단계에서는 주 1회 사내 백업 권장
- `git clone --mirror` 으로 별도 NAS 저장
- 인프라파트 표준 백업 정책 적용
