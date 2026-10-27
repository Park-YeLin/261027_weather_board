// logic.js – 판단 규칙만 (화면을 다루는 코드 금지)

// 교육용 가상 기준 (실제 작업 중지 · 행사 취소 기준은 각 기관 규정을 따름)
const RULES = { wind: 10, rain: 60, heat: 33 };

// 세종 · 대전 · 태안 · 보령 좌표
const REGION_COORDS = {
  '세종': { lat: 36.48, lon: 127.26 },
  '대전': { lat: 36.35, lon: 127.38 },
  '태안': { lat: 36.75, lon: 126.30 },
  '보령': { lat: 36.35, lon: 126.59 },
};

// Open-Meteo API 주소 생성 (위도, 경도 또는 지역명)
function getWeatherUrl(latOrRegion, lon) {
  let lat = latOrRegion;
  let lng = lon;
  if (typeof latOrRegion === 'string' && REGION_COORDS[latOrRegion]) {
    lat = REGION_COORDS[latOrRegion].lat;
    lng = REGION_COORDS[latOrRegion].lon;
  }
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,wind_speed_10m_max,precipitation_probability_max&wind_speed_unit=ms&timezone=Asia%2FSeoul`;
}

// Open-Meteo 응답 JSON 해석
function parseWeather(data) {
  if (!data || !data.daily) {
    throw new Error('Invalid weather data structure');
  }
  const daily = data.daily;
  return {
    tempMax: Math.round(daily.temperature_2m_max[0]),
    windMax: Math.round(daily.wind_speed_10m_max[0] * 10) / 10,
    rainProb: Math.round(daily.precipitation_probability_max[0]),
  };
}

// 일정 구분과 날씨로 판단 (w가 없으면 '날씨 확인 전')
function judge(kind, w) {
  if (!w) return { level: 'none', text: '날씨 확인 전' };
  if (kind === '실내') return { level: 'ok', text: '영향 없음' };
  if (kind === '고소' && w.windMax >= RULES.wind) return { level: 'stop', text: '중지 검토' };
  if (w.tempMax >= RULES.heat) return { level: 'warn', text: '폭염 휴식' };
  if (w.rainProb >= RULES.rain) return { level: 'warn', text: '우천 주의' };
  return { level: 'ok', text: '진행' };
}

// 날씨 정보 문자열 변환
function formatWeather(w) {
  return w ? `${w.tempMax}℃ · ${w.windMax}m/s · ${w.rainProb}%` : '-';
}

// 오늘 판단 마크다운 텍스트 생성
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

if (typeof module !== 'undefined') {
  module.exports = { RULES, REGION_COORDS, getWeatherUrl, parseWeather, judge, formatWeather, generateMarkdown };
}
