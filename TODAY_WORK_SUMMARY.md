# 2026 서부발전 교육 – 현장 일정 날씨판 전체 작업 요약 보고서

**작업 일시**: 2026-10-27  
**프로젝트**: 현장 일정 날씨판 (`weather_board`)  
**저장소**: [https://github.com/Park-YeLin/261027_weather_board](https://github.com/Park-YeLin/261027_weather_board)

---

## 📋 목차
1. [GitHub 원격 저장소 초기화 및 연결](#1-github-원격-저장소-초기화-및-연결)
2. [오늘 날짜 표시 기능 및 롤백 실습](#2-오늘-날짜-표시-기능-및-롤백-실습)
3. [PRD F-04: Open-Meteo 날씨 API 연동 및 판단 표시](#3-prd-f-04-open-meteo-날씨-api-연동-및-판단-표시)
4. [PRD F-05: 일정 데이터 분리(JSON) 및 마크다운 다운로드](#4-prd-f-05-일정-데이터-분리json-및-마크다운-다운로드)
5. [PRD F-06: Supabase 데이터베이스(wx_tasks) 연동](#5-prd-f-06-supabase-데이터베이스wx_tasks-연동)
6. [PRD F-07: 기상청 단기예보 및 일정 통합 API (/api/kma)](#6-prd-f-07-기상청-단기예보-및-일정-통합-api-apikma)

---

## 1. GitHub 원격 저장소 초기화 및 연결

### 📌 요청 사항
- 로컬 `weather_board` 프로젝트를 GitHub 원격 저장소(`https://github.com/Park-YeLin/261027_weather_board.git`)와 연결하고 초기 파일들을 첫 커밋 및 푸시.

### 🛠️ 수행 작업
- `git init` 으로 Git 저장소 초기화 및 기본 브랜치를 `main`으로 설정
- 원격 저장소(`origin`) 등록: `https://github.com/Park-YeLin/261027_weather_board.git`
- 초기 커밋 생성: `[main fc7ab64] feat: initial commit` (8개 파일)
- Git Credential Manager를 통한 GitHub 인증 후 `git push -u origin main` 완료

---

## 2. 오늘 날짜 표시 기능 및 롤백 실습

### 📌 요청 사항
- 제목(`h1`) 아래에 오늘 날짜(`YYYY-MM-DD`) 표시
- '날짜 표시' 커밋 및 푸시 후, 바로 직전 상태로 롤백 요청

### 💻 주요 코드
```javascript
// app.js - 오늘 날짜 렌더링 함수
function renderTodayDate() {
  const el = document.getElementById('todayDate');
  if (!el) return;
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  el.textContent = `${yyyy}-${mm}-${dd}`;
}
```

### 🛠️ 롤백 수행
```bash
# 로컬 코드 롤백
git reset --hard HEAD~1
# 원격 저장소 롤백 반영
git push --force origin main
```
- 첫 번째 커밋(`fc7ab64`)으로 로컬과 GitHub 모두 깔끔하게 원복 완료.

---

## 3. PRD F-04: Open-Meteo 날씨 API 연동 및 판단 표시

### 📌 요청 사항
- Open-Meteo API(API 키 불필요)로 세종·대전·태안·보령의 오늘 최고기온, 최대풍속(m/s), 강수확률 수신
- 업무 규칙(R-01~R-04)을 적용해 '날씨'와 '판단' 컬럼 갱신
- API 주소 만들기와 파싱은 `logic.js`, 비동기 호출(`fetch`)은 `app.js`에 분리
- `?test=wind` 쿼리 파라미터 시 풍속을 12m/s로 강제하여 고소 작업 중지 검토(R-02) 시험 지원

### 💻 주요 코드

#### [logic.js]
```javascript
// 세종 · 대전 · 태안 · 보령 좌표
const REGION_COORDS = {
  '세종': { lat: 36.48, lon: 127.26 },
  '대전': { lat: 36.35, lon: 127.38 },
  '태안': { lat: 36.75, lon: 126.30 },
  '보령': { lat: 36.35, lon: 126.59 },
};

// Open-Meteo API 주소 생성
function getWeatherUrl(latOrRegion, lon) {
  let lat = latOrRegion;
  let lng = lon;
  if (typeof latOrRegion === 'string' && REGION_COORDS[latOrRegion]) {
    lat = REGION_COORDS[latOrRegion].lat;
    lng = REGION_COORDS[latOrRegion].lon;
  }
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,wind_speed_10m_max,precipitation_probability_max&wind_speed_unit=ms&timezone=Asia%2FSeoul`;
}

// 응답 JSON 파싱
function parseWeather(data) {
  const daily = data.daily;
  return {
    tempMax: Math.round(daily.temperature_2m_max[0]),
    windMax: Math.round(daily.wind_speed_10m_max[0] * 10) / 10,
    rainProb: Math.round(daily.precipitation_probability_max[0]),
  };
}
```

#### [app.js]
```javascript
async function fetchWeather() {
  const weatherBox = document.getElementById('weatherBox');
  const isTestWind = new URLSearchParams(window.location.search).get('test') === 'wind';

  try {
    const regions = Object.keys(REGION_COORDS);
    const promises = regions.map(async (region) => {
      const url = getWeatherUrl(region);
      const res = await fetch(url);
      const data = await res.json();
      const w = parseWeather(data);
      if (isTestWind) w.windMax = 12;
      return { region, weather: w };
    });

    const results = await Promise.all(promises);
    for (const item of results) {
      weatherByRegion[item.region] = item.weather;
    }
  } catch (err) {
    console.error('날씨 연동 실패:', err);
  } finally {
    renderTasks();
  }
}
```
- 커밋 메시지: `add weather`

---

## 4. PRD F-05: 일정 데이터 분리(JSON) 및 마크다운 다운로드

### 📌 요청 사항
- 하드코딩된 가상 일정을 `data/tasks.json` 파일로 분리
- `app.js`에서 JSON을 기본으로 먼저 읽고, 사용자가 추가한 일정만 브라우저 `localStorage`에 따로 저장
- 브라우저 로컬 파일 더블클릭(`file:///`)으로 CORS 오류 시 `'배포 주소로 열어 주세요'` 표시
- '오늘 판단 md로 저장' 버튼을 추가하여 마크다운 파일(`현장일정_판단_YYYY-MM-DD.md`) 다운로드 기능 제공 (맨 아래 판단 기준 1줄 포함, 마크다운 함수는 `logic.js`에 배치)

### 💻 주요 코드

#### [data/tasks.json]
```json
[
  { "title": "다중이용시설 안전점검", "region": "세종", "kind": "야외", "owner": "김안전" },
  { "title": "시민 안전체험 행사 운영", "region": "보령", "kind": "야외", "owner": "이행사" },
  { "title": "옥상 태양광 설비 점검", "region": "태안", "kind": "고소", "owner": "박설비" },
  { "title": "하천 수위계 확인", "region": "대전", "kind": "야외", "owner": "최현장" },
  { "title": "청사 외벽 간판 보수", "region": "세종", "kind": "고소", "owner": "정시설" },
  { "title": "비상연락 훈련", "region": "대전", "kind": "실내", "owner": "한상황" }
]
```

#### [logic.js] 마크다운 변환 함수
```javascript
function generateMarkdown(tasks, weatherByRegion, dateStr) {
  const date = dateStr || new Date().toISOString().slice(0, 10);
  const lines = [
    `# 현장 일정 날씨 판단 (${date})`,
    '',
    '| 일정 | 지역 | 구분 | 담당 | 날씨 | 판단 |',
    '|---|---|---|---|---|---|',
  ];

  for (const t of tasks || []) {
    const w = (weatherByRegion && weatherByRegion[t.region]) || null;
    const r = judge(t.kind, w);
    const wx = formatWeather(w);
    lines.push(`| ${t.title} | ${t.region} | ${t.kind} | ${t.owner} | ${wx} | ${r.text} |`);
  }

  lines.push('');
  lines.push(`* 판단 기준: 풍속 ${RULES.wind}m/s 이상(고소 작업 중지 검토) · 최고기온 ${RULES.heat}℃ 이상(폭염 휴식) · 강수확률 ${RULES.rain}% 이상(우천 주의) · 실내(영향 없음)`);

  return lines.join('\n');
}
```

#### [app.js] 브라우저 다운로드 동작
```javascript
function downloadMarkdown() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const md = generateMarkdown(tasks, weatherByRegion, dateStr);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `현장일정_판단_${dateStr}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

---

## 5. PRD F-06: Supabase 데이터베이스(wx_tasks) 연동

### 📌 요청 사항
- 일정 목록을 Supabase `wx_tasks` 테이블에서 읽고 추가도 DB에 저장
- `setup.sql` 제공 (지역/구분 CHECK 제약조건, RLS 정책, 초기 데이터)
- 연결 정보는 `config.js`에 주소와 공개용(anon) 키 단 2줄로 작성 (비밀 키 절대 금지)
- 외부 스크립트는 `supabase-js` 하나만 사용

### 💻 주요 코드

#### [setup.sql]
```sql
-- 테이블 생성 및 체크 제약조건
create table if not exists wx_tasks (
  id bigint generated by default as identity primary key,
  title text not null,
  region text not null check (region in ('세종', '대전', '태안', '보령')),
  kind text not null check (kind in ('야외', '고소', '실내')),
  owner text not null,
  created_at timestamptz default now()
);

-- RLS 활성화 및 공개 정책
alter table wx_tasks enable row level security;
create policy "Allow public select" on wx_tasks for select using (true);
create policy "Allow public insert" on wx_tasks for insert with check (true);
```

#### [config.js] (단 2줄)
```javascript
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
```

#### [app.js] Supabase 연동 로직
```javascript
const supabaseClient = (typeof supabase !== 'undefined' && typeof SUPABASE_URL !== 'undefined')
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

async function loadTasks() {
  if (!supabaseClient || SUPABASE_URL.includes('YOUR_PROJECT_ID')) {
    // config.js 설정 전 안내 문구
    return;
  }
  const { data, error } = await supabaseClient.from('wx_tasks').select('*').order('id', { ascending: true });
  if (!error) tasks = data || [];
  renderTasks();
}
```

---

## 6. PRD F-07: 기상청 단기예보 및 일정 통합 API (/api/kma)

### 📌 요청 사항
- `/api/kma?region=대전` 호출 시 해당 지역의 DB 일정, 기상청 날씨, 판단 결과가 JSON으로 반환
- Vercel의 `process.env.KMA_KEY` 환경 변수를 안전하게 사용하여 공공데이터포털 기상청 단기예보 연동
- `PRD.md`에 F-07 및 T-05 완료 기준 추가
- 커밋 메시지: `create api`

### 💻 주요 코드 (`api/kma.js`)
```javascript
// api/kma.js - Vercel Serverless Function
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const region = req.query.region || '대전';
  const kmaKey = process.env.KMA_KEY || process.env.weatheer_apikey;

  // 1. 기상청 API 호출 (실패 시 Open-Meteo로 자동 Fallback)
  let weather = null;
  if (kmaKey) {
    try {
      weather = await fetchKmaWeather(region, kmaKey);
    } catch (e) {
      console.warn('기상청 API 실패, Fallback 적용');
    }
  }
  if (!weather) weather = await fetchFallbackWeather(region);

  // 2. Supabase DB(또는 data/tasks.json)에서 해당 지역 일정 조회
  const rawTasks = await getTasksFromDbOrFile(region);

  // 3. 업무 규칙(R-01~R-04) 판단 수행
  const tasksWithJudgement = rawTasks.map((t) => ({
    title: t.title,
    region: t.region,
    kind: t.kind,
    owner: t.owner,
    judgement: judge(t.kind, weather),
  }));

  // 4. JSON 응답
  return res.status(200).json({
    success: true,
    region,
    weather,
    tasksCount: tasksWithJudgement.length,
    tasks: tasksWithJudgement,
  });
};
```

---

## 📊 Git 커밋 히스토리 요약
1. `fc7ab64`: `feat: initial commit` (프로젝트 초기화)
2. `d1d2945`: `add weather` (F-04 Open-Meteo 날씨 및 규칙 연동)
3. `caa3811`: `feat: 일정 목록을 data/tasks.json으로 분리 및 CLAUDE.md 규칙 추가` (F-05)
4. `1e47b63`: `feat: PRD F-06 Supabase DB(wx_tasks) 연동 및 setup.sql, config.js 추가`
5. `c681147`: `create api` (F-07 Vercel 기상청 Serverless API 구현 및 PRD 갱신)
