# Skill 06: Publishing (HTML·Slack·Notion 발송)

> 매일 분석 결과를 사용 부서에 전달한다. HTML 리포트(아카이브용), Slack(실시간 알림), Notion(검색·축적).

## 1. 디렉토리

```
worker/publishers/
├── __init__.py
├── html_report.py       Jinja2 템플릿 렌더, Storage 업로드
├── slack.py             Block Kit 메시지 빌더 + Webhook
├── notion.py            Notion API로 페이지 생성
└── templates/
    ├── daily_report.html.j2
    └── partials/
        ├── anomaly_card.html.j2
        └── header.html.j2
```

## 2. 기술 스택

```toml
dependencies = [
  "jinja2>=3.1",
  "httpx>=0.27",
  "notion-client>=2.2",
  "premailer>=3.10",       # HTML inline CSS (메일 호환)
]
```

## 3. 일일 리포트 흐름

```
1. daily_reports row 생성 (report_date 기준)
2. 오늘의 anomalies + analyses + 상품 메타를 한 번에 JOIN으로 가져와 컨텍스트 dict 구성
3. HTML 렌더 → Supabase Storage에 업로드 → cdn_url 획득
4. Slack 메시지 빌드 → Webhook 전송 → message_ts 저장
5. Notion 페이지 생성 → page_id 저장
6. daily_reports row 업데이트
```

## 4. HTML 리포트 (`html_report.py`)

### 4.1 데이터 조립

```python
def build_report_context(sb: Client, report_date: date) -> dict:
    """
    반환 컨텍스트 구조:
    {
      "report_date": date,
      "summary": {
        "total_anomalies": int,
        "high_priority_count": int,
        "actions_breakdown": {"price_match": 5, "promo_match": 3, ...},
      },
      "findings": [
        {
          "priority": "high",
          "competitor": {brand, name, image_url, current_price, ...},
          "anomalies": [{type, severity, evidence}],
          "own_matches": [{name, sku, price_msrp, price_pos, stock_qty, ...}],
          "analysis": {cause_hypothesis, action, action_detail, confidence},
        },
        ...
      ],
    }
    """
```

### 4.2 Jinja2 템플릿

`templates/daily_report.html.j2` 핵심 구조:
```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>B.CAVE Competitor Radar — {{ report_date }}</title>
  <style>/* inline 가능한 CSS */</style>
</head>
<body>
  <header>
    <h1>경쟁사 레이더 일일 리포트</h1>
    <p>{{ report_date }} · 탐지 {{ summary.total_anomalies }}건 · 우선순위 high {{ summary.high_priority_count }}건</p>
  </header>

  {% for f in findings %}
  {% include "partials/anomaly_card.html.j2" %}
  {% endfor %}

  <footer>
    <p>본 리포트는 AI(Qwen 2.5 14B)가 생성한 분석입니다. 최종 의사결정은 담당자가 합니다.</p>
    <p>문의: IT팀 정호철 / 시스템 오너</p>
  </footer>
</body>
</html>
```

### 4.3 렌더 + 업로드

```python
def render_and_upload(sb: Client, report_date: date) -> str:
    ctx = build_report_context(sb, report_date)
    env = Environment(loader=FileSystemLoader("worker/publishers/templates"))
    html = env.get_template("daily_report.html.j2").render(**ctx)

    # 메일 호환 inline CSS
    html_inlined = premailer.transform(html)

    path = f"reports/{report_date.isoformat()}.html"
    sb.storage.from_("reports").upload(
        path, html_inlined.encode("utf-8"),
        {"content-type": "text/html; charset=utf-8", "upsert": "true"}
    )
    return sb.storage.from_("reports").get_public_url(path)
```

### 4.4 디자인 가이드
- 모바일 가독성 우선 (Slack에서 미리보기로 자주 볼 것)
- 색상: priority high=빨강, medium=주황, low=회색
- 각 finding 카드: 경쟁상품 이미지(왼쪽) + 분석 텍스트(오른쪽)
- 자사 상품 비교는 작은 표로
- 상단 요약 → 본문 → 푸터 순

## 5. Slack 발송 (`slack.py`)

### 5.1 Block Kit 메시지 빌더

```python
def build_slack_blocks(ctx: dict, html_url: str, dashboard_url: str) -> list[dict]:
    blocks = []

    # 헤더
    blocks.append({
        "type": "header",
        "text": {"type": "plain_text", "text": f"🎯 경쟁사 레이더 — {ctx['report_date']}"}
    })

    # 요약
    s = ctx["summary"]
    blocks.append({
        "type": "section",
        "text": {"type": "mrkdwn",
                 "text": f"*오늘의 이상 징후*: 총 {s['total_anomalies']}건 (high {s['high_priority_count']}건)"}
    })

    # 액션 분포
    actions_str = " · ".join(f"{k} {v}건" for k, v in s["actions_breakdown"].items())
    blocks.append({"type": "context", "elements": [
        {"type": "mrkdwn", "text": actions_str}
    ]})

    blocks.append({"type": "divider"})

    # Top 5 highlights
    for f in ctx["findings"][:5]:
        comp = f["competitor"]
        ana = f["analysis"]
        emoji = {"high": "🚨", "medium": "⚠️", "low": "ℹ️"}[f["priority"]]
        text = (f"{emoji} *{comp['brand_name']} — {comp['name']}*\n"
                f"가설: {ana['cause_hypothesis']}\n"
                f"→ 권장: *{ana['action']}* ({ana['priority']}, conf {ana['confidence']:.2f})")
        blocks.append({"type": "section",
                       "text": {"type": "mrkdwn", "text": text},
                       "accessory": {"type": "image",
                                     "image_url": comp.get("image_url", ""),
                                     "alt_text": comp["name"]}})

    # 액션 버튼
    blocks.append({
        "type": "actions",
        "elements": [
            {"type": "button",
             "text": {"type": "plain_text", "text": "전체 HTML 리포트"},
             "url": html_url},
            {"type": "button",
             "text": {"type": "plain_text", "text": "대시보드"},
             "url": dashboard_url},
        ]
    })

    return blocks
```

### 5.2 발송

```python
def send_to_slack(blocks: list[dict], webhook_url: str, fallback_text: str) -> str:
    res = httpx.post(webhook_url, json={
        "text": fallback_text,
        "blocks": blocks,
    })
    res.raise_for_status()
    # incoming webhook은 ts를 반환 안 함 → message_ts 저장 위해 chat.postMessage API 권장
    return res.headers.get("X-Slack-Req-Id", "")
```

### 5.3 채널 정책
- 평일 매일 #competitor-radar 채널에 정기 발송
- priority=high가 5건 이상인 날은 IT팀장 DM도 추가 발송
- 주말은 Slack 알림 끄고 Notion만 (사용 부서 휴식 존중)

## 6. Notion 발송 (`notion.py`)

### 6.1 페이지 구조

상위 페이지: `B.CAVE Competitor Radar`
- 하위: `2026-05-14` (날짜별 페이지 자동 생성)
  - 요약 콜아웃
  - Top findings (테이블 또는 카드 토글)
  - 풀 HTML embed 또는 링크
  - 사용 부서 코멘트 (수동 추가 가능)

### 6.2 호출

```python
from notion_client import Client as NotionClient

def create_notion_report(ctx: dict, html_url: str) -> str:
    notion = NotionClient(auth=os.environ["NOTION_TOKEN"])
    parent_page_id = os.environ["NOTION_PARENT_PAGE_ID"]

    page = notion.pages.create(
        parent={"page_id": parent_page_id},
        properties={"title": [{"text": {"content": f"{ctx['report_date']}"}}]},
        children=build_notion_blocks(ctx, html_url),
    )
    return page["id"]
```

### 6.3 블록 빌더

Notion API 블록 스키마는 길어서 별도 헬퍼:
```python
def build_notion_blocks(ctx: dict, html_url: str) -> list[dict]:
    # heading_1, callout, table, divider, paragraph 조합
    ...
```

### 6.4 검색 활용
- Notion 검색으로 "랭킹 급상승", 특정 브랜드명 등으로 과거 리포트 탐색 가능
- 이게 Slack 대비 강점

## 7. 통합 진입점

```python
# worker/main.py 발췌
def publish_daily(report_date: date) -> None:
    sb = get_client()
    ctx = build_report_context(sb, report_date)

    # 1. HTML
    html_url = render_and_upload(sb, report_date)

    # 2. Slack
    blocks = build_slack_blocks(ctx, html_url, DASHBOARD_URL)
    slack_ts = send_to_slack(blocks, SLACK_WEBHOOK, fallback_text=f"경쟁사 레이더 {report_date}")

    # 3. Notion
    notion_page_id = create_notion_report(ctx, html_url)

    # 4. daily_reports 업데이트
    update_daily_report(sb, report_date, html_url=html_url,
                       slack_ts=slack_ts, notion_page_id=notion_page_id)
```

## 8. 실패 처리
- HTML 실패: Slack/Notion은 링크만 없이 발송 (사용 부서에 통보)
- Slack 실패: 3회 재시도, 그래도 실패면 IT팀장 DM (별도 Webhook)
- Notion 실패: 다음날까지 큐잉, 다음날 배치에서 재시도

## 9. 거버넌스
- Slack Webhook URL, Notion 토큰은 .env (Docker secret)
- HTML 리포트는 Supabase Storage의 private 버킷 → signed URL 사용 (외부 노출 차단)
- 자사 매출 수치 노출 정책: 본 시스템 출력에는 절대 금액 노출 가능 (사내용), 외부 공유 시 마스킹

## 10. 단위 테스트
- 컨텍스트 fixture로 템플릿 렌더 테스트 (snapshot test)
- Slack/Notion API는 mock
- HTML 검증: pytest + beautifulsoup4로 필수 섹션 존재 확인
