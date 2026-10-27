// app.js – 화면 동작 (목록 그리기, 일정 추가)

// 01 단원 : 일정 목록을 코드 안에 둠 (가상 데이터) → 04 단원에서 data/tasks.json 으로 분리
const SAMPLE_TASKS = [
  { title: '다중이용시설 안전점검', region: '세종', kind: '야외', owner: '김안전' },
  { title: '시민 안전체험 행사 운영', region: '보령', kind: '야외', owner: '이행사' },
  { title: '옥상 태양광 설비 점검', region: '태안', kind: '고소', owner: '박설비' },
  { title: '하천 수위계 확인', region: '대전', kind: '야외', owner: '최현장' },
  { title: '청사 외벽 간판 보수', region: '세종', kind: '고소', owner: '정시설' },
  { title: '비상연락 훈련', region: '대전', kind: '실내', owner: '한상황' },
];

let tasks = [];
let weatherByRegion = {};   // 03 단원에서 지역별 날씨를 넣음

function loadTasks() {
  const saved = JSON.parse(localStorage.getItem('wx_added') || '[]');
  tasks = SAMPLE_TASKS.concat(saved);
}

function weatherText(w) {
  return w ? w.tempMax + '℃ · ' + w.windMax + 'm/s · ' + w.rainProb + '%' : '-';
}

function renderTasks() {
  const body = document.getElementById('taskList');
  body.innerHTML = '';
  for (const t of tasks) {
    const w = weatherByRegion[t.region];
    const r = judge(t.kind, w);
    const tr = document.createElement('tr');
    for (const v of [t.title, t.region, t.kind, t.owner, weatherText(w)]) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    }
    const td = document.createElement('td');
    td.textContent = r.text;
    td.className = r.level;
    tr.appendChild(td);
    body.appendChild(tr);
  }
}

function addTask(e) {
  e.preventDefault();
  const t = {
    title: document.getElementById('titleInput').value.trim(),
    region: document.getElementById('regionInput').value,
    kind: document.getElementById('kindInput').value,
    owner: document.getElementById('ownerInput').value.trim(),
  };
  if (!t.title || !t.owner) return;
  const saved = JSON.parse(localStorage.getItem('wx_added') || '[]');
  saved.push(t);
  localStorage.setItem('wx_added', JSON.stringify(saved));
  e.target.reset();
  loadTasks();
  renderTasks();
}

async function fetchWeather() {
  const weatherBox = document.getElementById('weatherBox');
  const isTestWind = new URLSearchParams(window.location.search).get('test') === 'wind';

  if (weatherBox) {
    weatherBox.textContent = '날씨 정보를 불러오는 중...';
  }

  try {
    const regions = Object.keys(REGION_COORDS);
    const promises = regions.map(async (region) => {
      const url = getWeatherUrl(region);
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`날씨 정보를 가져오지 못했습니다 (${region}: ${res.status})`);
      }
      const data = await res.json();
      const w = parseWeather(data);
      if (isTestWind) {
        w.windMax = 12;
      }
      return { region, weather: w };
    });

    const results = await Promise.all(promises);
    for (const item of results) {
      weatherByRegion[item.region] = item.weather;
    }

    if (weatherBox) {
      const summary = regions
        .map((r) => `${r}: ${weatherText(weatherByRegion[r])}`)
        .join(' | ');
      weatherBox.textContent = isTestWind
        ? `[시험 모드 (?test=wind): 풍속 12m/s 적용 중] ${summary}`
        : `오늘 지역별 날씨: ${summary}`;
    }
  } catch (err) {
    console.error('날씨 정보를 불러오는 중 오류 발생:', err);
    if (isTestWind) {
      for (const region of Object.keys(REGION_COORDS)) {
        weatherByRegion[region] = { tempMax: 20, windMax: 12, rainProb: 0 };
      }
    }
    if (weatherBox) {
      weatherBox.textContent = isTestWind
        ? '[시험 모드 (?test=wind): 풍속 12m/s 적용 중] (오프라인)'
        : '날씨 정보를 불러오지 못했습니다. (목록은 정상 표시됩니다)';
    }
  } finally {
    renderTasks();
  }
}

document.getElementById('taskForm').addEventListener('submit', addTask);
loadTasks();
renderTasks();
fetchWeather();
