// app.js – 화면 동작 (목록 그리기, 일정 추가)

let tasks = [];
let weatherByRegion = {};   // 03 단원에서 지역별 날씨를 넣음

// Supabase 클라이언트 초기화 (공개용 anon 키만 사용, 비밀 키 절대 금지)
const supabaseClient = (typeof supabase !== 'undefined' && typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined')
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

async function loadTasks() {
  const msgBox = document.getElementById('msgBox');

  if (!supabaseClient || SUPABASE_URL.includes('YOUR_PROJECT_ID')) {
    if (msgBox) msgBox.textContent = 'config.js에 Supabase 접속 정보(URL, anon 키)를 설정해 주세요.';
    // 설정 전 로컬 확인을 위한 폴백
    try {
      const res = await fetch('data/tasks.json');
      if (res.ok) tasks = await res.json();
    } catch (e) {
      // 로컬 파일 더블클릭 등
    }
    renderTasks();
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from('wx_tasks')
      .select('*')
      .order('id', { ascending: true });

    if (error) throw error;
    tasks = data || [];
    if (msgBox) msgBox.textContent = '';
  } catch (err) {
    console.error('Supabase 일정 로드 실패:', err);
    if (msgBox) msgBox.textContent = `DB 일정 로드 실패: ${err.message || err}`;
  } finally {
    renderTasks();
  }
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

async function addTask(e) {
  e.preventDefault();
  const t = {
    title: document.getElementById('titleInput').value.trim(),
    region: document.getElementById('regionInput').value,
    kind: document.getElementById('kindInput').value,
    owner: document.getElementById('ownerInput').value.trim(),
  };
  if (!t.title || !t.owner) return;
  const msgBox = document.getElementById('msgBox');

  if (!supabaseClient || SUPABASE_URL.includes('YOUR_PROJECT_ID')) {
    if (msgBox) msgBox.textContent = 'config.js에 Supabase 접속 정보(URL, anon 키)를 설정해 주세요.';
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from('wx_tasks')
      .insert([t])
      .select();

    if (error) throw error;
    e.target.reset();
    if (msgBox) msgBox.textContent = '';
    await loadTasks();
  } catch (err) {
    console.error('일정 추가 실패:', err);
    if (msgBox) msgBox.textContent = `일정 추가 실패: ${err.message || err}`;
  }
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

document.getElementById('taskForm').addEventListener('submit', addTask);
const downloadBtn = document.getElementById('downloadMdBtn');
if (downloadBtn) {
  downloadBtn.addEventListener('click', downloadMarkdown);
}
loadTasks();
fetchWeather();
