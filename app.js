// app.js – 화면 동작 (목록 그리기, 일정 추가)

let baseTasks = [];
let tasks = [];
let weatherByRegion = {};   // 03 단원에서 지역별 날씨를 넣음
let tasksReadFailed = false;

async function loadTasks() {
  const msgBox = document.getElementById('msgBox');
  tasksReadFailed = false;
  try {
    const res = await fetch('data/tasks.json');
    if (!res.ok) {
      throw new Error(`tasks.json 로드 실패 (${res.status})`);
    }
    baseTasks = await res.json();
    if (msgBox && msgBox.textContent === '배포 주소로 열어 주세요') {
      msgBox.textContent = '';
    }
  } catch (err) {
    console.warn('tasks.json 읽기 실패 (로컬 더블클릭 환경 등):', err);
    tasksReadFailed = true;
    baseTasks = [];
    if (msgBox) {
      msgBox.textContent = '배포 주소로 열어 주세요';
    }
  }

  const saved = JSON.parse(localStorage.getItem('wx_added') || '[]');
  tasks = baseTasks.concat(saved);
  renderTasks();
}

function weatherText(w) {
  return w ? w.tempMax + '℃ · ' + w.windMax + 'm/s · ' + w.rainProb + '%' : '-';
}

function renderTasks() {
  const body = document.getElementById('taskList');
  body.innerHTML = '';

  if (tasks.length === 0 && tasksReadFailed) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.style.textAlign = 'center';
    td.style.color = '#c62828';
    td.textContent = '배포 주소로 열어 주세요';
    tr.appendChild(td);
    body.appendChild(tr);
    return;
  }

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
  tasks = baseTasks.concat(saved);
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
fetchWeather();
