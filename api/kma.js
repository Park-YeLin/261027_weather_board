// api/kma.js - Vercel Serverless Function
// 호출 예시: /api/kma?region=대전

const fs = require('fs');
const path = require('path');

// 지역별 좌표 (기상청 격자 nx, ny 및 Open-Meteo fallback 위경도)
const REGION_INFO = {
  '세종': { nx: 65, ny: 103, lat: 36.48, lon: 127.26 },
  '대전': { nx: 67, ny: 100, lat: 36.35, lon: 127.38 },
  '태안': { nx: 48, ny: 109, lat: 36.75, lon: 126.30 },
  '보령': { nx: 53, ny: 100, lat: 36.35, lon: 126.59 },
};

// 업무 판단 규칙
const RULES = { wind: 10, rain: 60, heat: 33 };

function judge(kind, w) {
  if (!w) return { level: 'none', text: '날씨 확인 전' };
  if (kind === '실내') return { level: 'ok', text: '영향 없음' };
  if (kind === '고소' && w.windMax >= RULES.wind) return { level: 'stop', text: '중지 검토' };
  if (w.tempMax >= RULES.heat) return { level: 'warn', text: '폭염 휴식' };
  if (w.rainProb >= RULES.rain) return { level: 'warn', text: '우천 주의' };
  return { level: 'ok', text: '진행' };
}

// 한국 시간 기준 현재 날짜/시간 구하기
function getKSTDate() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (9 * 60 * 60000));
}

// 기상청 단기예보 Base Date & Time 계산
function getKmaBaseDateTime() {
  const kst = getKSTDate();
  let year = kst.getFullYear();
  let month = String(kst.getMonth() + 1).padStart(2, '0');
  let day = String(kst.getDate()).padStart(2, '0');
  const hours = kst.getHours();
  const minutes = kst.getMinutes();
  const totalMins = hours * 60 + minutes;

  // 기상청 단기예보 발표 시간 (02:10, 05:10, 08:10, 11:10, 14:10, 17:10, 20:10, 23:10)
  const times = [
    { base: '0200', trigger: 2 * 60 + 15 },
    { base: '0500', trigger: 5 * 60 + 15 },
    { base: '0800', trigger: 8 * 60 + 15 },
    { base: '1100', trigger: 11 * 60 + 15 },
    { base: '1400', trigger: 14 * 60 + 15 },
    { base: '1700', trigger: 17 * 60 + 15 },
    { base: '2000', trigger: 20 * 60 + 15 },
    { base: '2300', trigger: 23 * 60 + 15 },
  ];

  let selectedBase = '2300';
  let dateStr = `${year}${month}${day}`;

  for (let i = times.length - 1; i >= 0; i--) {
    if (totalMins >= times[i].trigger) {
      selectedBase = times[i].base;
      break;
    }
    if (i === 0) {
      // 02:15 이전이면 전날 23:00 발표분 사용
      const yesterday = new Date(kst.getTime() - 24 * 60 * 60000);
      const yYear = yesterday.getFullYear();
      const yMonth = String(yesterday.getMonth() + 1).padStart(2, '0');
      const yDay = String(yesterday.getDate()).padStart(2, '0');
      dateStr = `${yYear}${yMonth}${yDay}`;
      selectedBase = '2300';
    }
  }

  return {
    baseDate: dateStr,
    baseTime: selectedBase,
    todayStr: `${year}${month}${day}`,
  };
}

// 기상청 API 호출
async function fetchKmaWeather(regionName, apiKey) {
  const coord = REGION_INFO[regionName];
  if (!coord) return null;

  const { baseDate, baseTime, todayStr } = getKmaBaseDateTime();
  const cleanKey = decodeURIComponent(apiKey.trim());
  const url = `http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?serviceKey=${encodeURIComponent(cleanKey)}&pageNo=1&numOfRows=1000&dataType=JSON&base_date=${baseDate}&base_time=${baseTime}&nx=${coord.nx}&ny=${coord.ny}`;

  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`KMA API HTTP status ${response.status}`);
  }

  const json = await response.json();
  const items = json?.response?.body?.items?.item;
  if (!items || !Array.isArray(items)) {
    throw new Error('KMA response item not found');
  }

  let tempMax = -999;
  let windMax = 0;
  let rainProb = 0;

  for (const it of items) {
    if (it.fcstDate !== todayStr) continue;
    const val = parseFloat(it.fcstValue);
    if (isNaN(val)) continue;

    if (it.category === 'TMP' || it.category === 'TMX') {
      if (val > tempMax) tempMax = val;
    } else if (it.category === 'WSD') {
      if (val > windMax) windMax = val;
    } else if (it.category === 'POP') {
      if (val > rainProb) rainProb = val;
    }
  }

  if (tempMax === -999) tempMax = 20;

  return {
    tempMax: Math.round(tempMax),
    windMax: Math.round(windMax * 10) / 10,
    rainProb: Math.round(rainProb),
    source: '기상청(KMA)',
  };
}

// Open-Meteo 폴백 날씨 호출
async function fetchFallbackWeather(regionName) {
  const coord = REGION_INFO[regionName];
  if (!coord) return null;

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coord.lat}&longitude=${coord.lon}&daily=temperature_2m_max,wind_speed_10m_max,precipitation_probability_max&wind_speed_unit=ms&timezone=Asia%2FSeoul`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const json = await res.json();
  const daily = json.daily;

  return {
    tempMax: Math.round(daily.temperature_2m_max[0]),
    windMax: Math.round(daily.wind_speed_10m_max[0] * 10) / 10,
    rainProb: Math.round(daily.precipitation_probability_max[0]),
    source: 'Open-Meteo(Fallback)',
  };
}

// 일정 목록 가져오기 (Supabase DB 우선, 실패/미설정 시 data/tasks.json)
async function getTasksFromDbOrFile(regionName) {
  let supabaseUrl = process.env.SUPABASE_URL;
  let supabaseKey = process.env.SUPABASE_ANON_KEY;

  // config.js 파일에서도 읽기 시도
  try {
    const configPath = path.join(process.cwd(), 'config.js');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      const urlMatch = content.match(/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/);
      const keyMatch = content.match(/SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/);
      if (urlMatch && !urlMatch[1].includes('YOUR_PROJECT_ID')) supabaseUrl = urlMatch[1];
      if (keyMatch && !keyMatch[1].includes('YOUR_ANON_KEY')) supabaseKey = keyMatch[1];
    }
  } catch (e) {
    // ignore
  }

  // 1. Supabase REST API 호출 시도
  if (supabaseUrl && supabaseKey) {
    try {
      let queryUrl = `${supabaseUrl}/rest/v1/wx_tasks?select=*&order=id.asc`;
      if (regionName) {
        queryUrl += `&region=eq.${encodeURIComponent(regionName)}`;
      }
      const res = await fetch(queryUrl, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Accept: 'application/json',
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    } catch (e) {
      console.warn('Supabase DB 조회 실패, 파일로 대체합니다:', e.message);
    }
  }

  // 2. data/tasks.json 폴백
  try {
    const tasksPath = path.join(process.cwd(), 'data', 'tasks.json');
    if (fs.existsSync(tasksPath)) {
      const data = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
      if (regionName) {
        return data.filter((t) => t.region === regionName);
      }
      return data;
    }
  } catch (e) {
    console.error('tasks.json 읽기 실패:', e.message);
  }

  return [];
}

module.exports = async (req, res) => {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const region = req.query.region || req.query.r || '대전';

    if (!REGION_INFO[region]) {
      return res.status(400).json({
        error: `지원하지 않는 지역입니다: ${region}. (지원 지역: ${Object.keys(REGION_INFO).join(', ')})`,
      });
    }

    // 1. 기상청 날씨 조회 (KMA_KEY 사용, 실패 시 Open-Meteo 폴백)
    const kmaKey = process.env.KMA_KEY || process.env.weatheer_apikey || process.env.weather_apikey;
    let weather = null;

    if (kmaKey) {
      try {
        weather = await fetchKmaWeather(region, kmaKey);
      } catch (err) {
        console.warn('KMA API 호출 실패, Open-Meteo로 대체:', err.message);
      }
    }

    if (!weather) {
      weather = await fetchFallbackWeather(region);
    }

    // 2. DB 또는 데이터 파일에서 해당 지역 일정 조회
    const rawTasks = await getTasksFromDbOrFile(region);

    // 3. 각 일정마다 날씨 기반 업무 규칙(R-01~R-04) 판단 수행
    const tasksWithJudgement = rawTasks.map((t) => ({
      title: t.title,
      region: t.region,
      kind: t.kind,
      owner: t.owner,
      judgement: judge(t.kind, weather),
    }));

    // 4. 최종 결과 반환
    return res.status(200).json({
      success: true,
      region,
      weather,
      tasksCount: tasksWithJudgement.length,
      tasks: tasksWithJudgement,
    });
  } catch (error) {
    console.error('API 처리 오류:', error);
    return res.status(500).json({
      success: false,
      error: error.message || '서버 내부 오류가 발생했습니다.',
    });
  }
};
