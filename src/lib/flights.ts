// Helpers for flights, without needing a flight-data account:
//  • a flight number like "KE123" tells us the airline
//  • airport codes like "ICN" or "PUS" are expanded to names
//  • links to check the flight's current schedule and status
// Times, gates and the route for a particular date change from day to day, so they come from a
// flight-data service. If you set one up (see lookupFlight), the app can fill those in too.

const AIRLINES: Record<string, string> = {
  AA: 'American Airlines', AC: 'Air Canada', AF: 'Air France', AI: 'Air India', AK: 'AirAsia', AM: 'Aeroméxico',
  AS: 'Alaska Airlines', AT: 'Royal Air Maroc', AY: 'Finnair', AZ: 'ITA Airways', A3: 'Aegean Airlines',
  B6: 'JetBlue', BA: 'British Airways', BG: 'Biman Bangladesh', BI: 'Royal Brunei', BR: 'EVA Air', BX: 'Air Busan',
  CA: 'Air China', CI: 'China Airlines', CX: 'Cathay Pacific', CZ: 'China Southern', D7: 'AirAsia X',
  DL: 'Delta Air Lines', DY: 'Norwegian', EI: 'Aer Lingus', EK: 'Emirates', ET: 'Ethiopian Airlines',
  EY: 'Etihad Airways', FD: 'Thai AirAsia', FJ: 'Fiji Airways', FR: 'Ryanair', GA: 'Garuda Indonesia',
  GF: 'Gulf Air', HA: 'Hawaiian Airlines', HU: 'Hainan Airlines', IB: 'Iberia', ID: 'Batik Air', IT: 'Tigerair Taiwan',
  JL: 'Japan Airlines', JQ: 'Jetstar Airways', JU: 'Air Serbia', J7: 'Afrijet', KE: 'Korean Air', KL: 'KLM',
  KM: 'Air Malta', KQ: 'Kenya Airways', LA: 'LATAM Airlines', LH: 'Lufthansa', LJ: 'Jin Air', LO: 'LOT Polish Airlines',
  LX: 'Swiss', MF: 'Xiamen Airlines', MH: 'Malaysia Airlines', MM: 'Peach', MS: 'EgyptAir', MU: 'China Eastern',
  NH: 'All Nippon Airways', NZ: 'Air New Zealand', OK: 'Czech Airlines', OS: 'Austrian Airlines', OZ: 'Asiana Airlines',
  PG: 'Bangkok Airways', PR: 'Philippine Airlines', QF: 'Qantas', QR: 'Qatar Airways', QZ: 'Indonesia AirAsia',
  RJ: 'Royal Jordanian', RO: 'TAROM', RS: 'Air Seoul', SA: 'South African Airways', SK: 'SAS Scandinavian Airlines',
  SL: 'Thai Lion Air', SN: 'Brussels Airlines', SQ: 'Singapore Airlines', SU: 'Aeroflot', SV: 'Saudia',
  TG: 'Thai Airways', TK: 'Turkish Airlines', TP: 'TAP Air Portugal', TR: 'Scoot', TW: "T'way Air",
  U2: 'easyJet', UA: 'United Airlines', UL: 'SriLankan Airlines', UX: 'Air Europa', VA: 'Virgin Australia',
  VJ: 'VietJet Air', VN: 'Vietnam Airlines', VS: 'Virgin Atlantic', VY: 'Vueling', W6: 'Wizz Air',
  WN: 'Southwest Airlines', WS: 'WestJet', WY: 'Oman Air', XJ: 'Thai AirAsia X', ZE: 'Eastar Jet',
  '3K': 'Jetstar Asia', '5J': 'Cebu Pacific', '7C': 'Jeju Air',
}

// code: [airport name, city]
const AIRPORTS: Record<string, [string, string]> = {
  // Korea
  ICN: ['Incheon International', 'Seoul'], GMP: ['Gimpo International', 'Seoul'], PUS: ['Gimhae International', 'Busan'],
  CJU: ['Jeju International', 'Jeju'], TAE: ['Daegu International', 'Daegu'], CJJ: ['Cheongju International', 'Cheongju'],
  KWJ: ['Gwangju', 'Gwangju'], YNY: ['Yangyang International', 'Yangyang'],
  // Japan
  NRT: ['Narita International', 'Tokyo'], HND: ['Haneda', 'Tokyo'], KIX: ['Kansai International', 'Osaka'],
  ITM: ['Itami', 'Osaka'], NGO: ['Chubu Centrair', 'Nagoya'], FUK: ['Fukuoka', 'Fukuoka'], CTS: ['New Chitose', 'Sapporo'],
  OKA: ['Naha', 'Okinawa'], UKB: ['Kobe', 'Kobe'], HIJ: ['Hiroshima', 'Hiroshima'],
  // China, Hong Kong, Taiwan
  PEK: ['Beijing Capital', 'Beijing'], PKX: ['Beijing Daxing', 'Beijing'], PVG: ['Shanghai Pudong', 'Shanghai'],
  SHA: ['Shanghai Hongqiao', 'Shanghai'], CAN: ['Guangzhou Baiyun', 'Guangzhou'], SZX: ["Shenzhen Bao'an", 'Shenzhen'],
  CTU: ['Chengdu Shuangliu', 'Chengdu'], TFU: ['Chengdu Tianfu', 'Chengdu'], XIY: ["Xi'an Xianyang", "Xi'an"],
  HKG: ['Hong Kong International', 'Hong Kong'], MFM: ['Macau International', 'Macau'],
  TPE: ['Taiwan Taoyuan', 'Taipei'], TSA: ['Taipei Songshan', 'Taipei'], KHH: ['Kaohsiung International', 'Kaohsiung'],
  // South-east Asia
  SIN: ['Changi', 'Singapore'], KUL: ['Kuala Lumpur International', 'Kuala Lumpur'], PEN: ['Penang International', 'Penang'],
  BKI: ['Kota Kinabalu International', 'Kota Kinabalu'], KCH: ['Kuching International', 'Kuching'], LGK: ['Langkawi International', 'Langkawi'],
  JHB: ['Senai International', 'Johor Bahru'], BKK: ['Suvarnabhumi', 'Bangkok'], DMK: ['Don Mueang', 'Bangkok'],
  HKT: ['Phuket International', 'Phuket'], CNX: ['Chiang Mai International', 'Chiang Mai'], USM: ['Samui', 'Koh Samui'],
  CGK: ['Soekarno-Hatta', 'Jakarta'], DPS: ['Ngurah Rai', 'Bali'], SUB: ['Juanda', 'Surabaya'], YIA: ['Yogyakarta International', 'Yogyakarta'],
  MNL: ['Ninoy Aquino', 'Manila'], CEB: ['Mactan-Cebu', 'Cebu'], CRK: ['Clark International', 'Clark'],
  SGN: ['Tan Son Nhat', 'Ho Chi Minh City'], HAN: ['Noi Bai', 'Hanoi'], DAD: ['Da Nang', 'Da Nang'], CXR: ['Cam Ranh', 'Nha Trang'],
  REP: ['Siem Reap', 'Siem Reap'], PNH: ['Phnom Penh', 'Phnom Penh'], VTE: ['Wattay', 'Vientiane'], RGN: ['Yangon', 'Yangon'],
  BWN: ['Brunei International', 'Bandar Seri Begawan'],
  // South Asia
  DEL: ['Indira Gandhi International', 'Delhi'], BOM: ['Chhatrapati Shivaji', 'Mumbai'], BLR: ['Kempegowda', 'Bengaluru'],
  MAA: ['Chennai', 'Chennai'], CCU: ['Netaji Subhas Chandra Bose', 'Kolkata'], HYD: ['Rajiv Gandhi', 'Hyderabad'],
  CMB: ['Bandaranaike', 'Colombo'], MLE: ['Velana', 'Malé'], KTM: ['Tribhuvan', 'Kathmandu'], DAC: ['Hazrat Shahjalal', 'Dhaka'],
  // Oceania
  SYD: ['Sydney Kingsford Smith', 'Sydney'], MEL: ['Melbourne', 'Melbourne'], BNE: ['Brisbane', 'Brisbane'], PER: ['Perth', 'Perth'],
  AKL: ['Auckland', 'Auckland'], CHC: ['Christchurch', 'Christchurch'], ADL: ['Adelaide', 'Adelaide'], CNS: ['Cairns', 'Cairns'],
  OOL: ['Gold Coast', 'Gold Coast'], NAN: ['Nadi International', 'Nadi'],
  // Middle East and Turkey
  DXB: ['Dubai International', 'Dubai'], AUH: ['Zayed International', 'Abu Dhabi'], DOH: ['Hamad International', 'Doha'],
  IST: ['Istanbul', 'Istanbul'], SAW: ['Sabiha Gökçen', 'Istanbul'], TLV: ['Ben Gurion', 'Tel Aviv'], AMM: ['Queen Alia', 'Amman'],
  RUH: ['King Khalid', 'Riyadh'], JED: ['King Abdulaziz', 'Jeddah'], BAH: ['Bahrain International', 'Manama'],
  KWI: ['Kuwait International', 'Kuwait City'], MCT: ['Muscat International', 'Muscat'],
  // Europe
  LHR: ['Heathrow', 'London'], LGW: ['Gatwick', 'London'], STN: ['Stansted', 'London'], MAN: ['Manchester', 'Manchester'],
  EDI: ['Edinburgh', 'Edinburgh'], DUB: ['Dublin', 'Dublin'], CDG: ['Charles de Gaulle', 'Paris'], ORY: ['Orly', 'Paris'],
  AMS: ['Schiphol', 'Amsterdam'], FRA: ['Frankfurt', 'Frankfurt'], MUC: ['Munich', 'Munich'], BER: ['Brandenburg', 'Berlin'],
  ZRH: ['Zurich', 'Zurich'], GVA: ['Geneva', 'Geneva'], VIE: ['Vienna International', 'Vienna'], FCO: ['Fiumicino', 'Rome'],
  MXP: ['Malpensa', 'Milan'], VCE: ['Marco Polo', 'Venice'], BCN: ['El Prat', 'Barcelona'], MAD: ['Barajas', 'Madrid'],
  LIS: ['Humberto Delgado', 'Lisbon'], OPO: ['Francisco Sá Carneiro', 'Porto'], ATH: ['Eleftherios Venizelos', 'Athens'],
  CPH: ['Copenhagen', 'Copenhagen'], ARN: ['Arlanda', 'Stockholm'], OSL: ['Gardermoen', 'Oslo'], HEL: ['Helsinki-Vantaa', 'Helsinki'],
  BRU: ['Brussels', 'Brussels'], WAW: ['Chopin', 'Warsaw'], PRG: ['Václav Havel', 'Prague'], BUD: ['Ferenc Liszt', 'Budapest'],
  // North and South America
  JFK: ['John F. Kennedy', 'New York'], EWR: ['Newark Liberty', 'New York'], LGA: ['LaGuardia', 'New York'],
  BOS: ['Logan', 'Boston'], IAD: ['Dulles', 'Washington'], DCA: ['Reagan National', 'Washington'], ATL: ['Hartsfield-Jackson', 'Atlanta'],
  MIA: ['Miami International', 'Miami'], MCO: ['Orlando International', 'Orlando'], ORD: ["O'Hare", 'Chicago'],
  DFW: ['Dallas/Fort Worth', 'Dallas'], IAH: ['George Bush', 'Houston'], DEN: ['Denver International', 'Denver'],
  SFO: ['San Francisco International', 'San Francisco'], LAX: ['Los Angeles International', 'Los Angeles'], SEA: ['Seattle-Tacoma', 'Seattle'],
  LAS: ['Harry Reid', 'Las Vegas'], PHX: ['Sky Harbor', 'Phoenix'], SAN: ['San Diego International', 'San Diego'],
  HNL: ['Daniel K. Inouye', 'Honolulu'], YYZ: ['Pearson', 'Toronto'], YVR: ['Vancouver International', 'Vancouver'],
  YUL: ['Trudeau', 'Montréal'], MEX: ['Benito Juárez', 'Mexico City'], CUN: ['Cancún International', 'Cancún'],
  GRU: ['Guarulhos', 'São Paulo'], EZE: ['Ministro Pistarini', 'Buenos Aires'], SCL: ['Arturo Merino Benítez', 'Santiago'],
  BOG: ['El Dorado', 'Bogotá'], LIM: ['Jorge Chávez', 'Lima'],
  // Africa
  JNB: ['O. R. Tambo', 'Johannesburg'], CPT: ['Cape Town International', 'Cape Town'], CAI: ['Cairo International', 'Cairo'],
  ADD: ['Bole', 'Addis Ababa'], NBO: ['Jomo Kenyatta', 'Nairobi'], CMN: ['Mohammed V', 'Casablanca'],
}

export type FlightNumber = { airlineCode: string; airline: string | null; number: string; pretty: string }

// "KE123", "ke 123", "KE0123" → Korean Air KE 123
export function parseFlightNumber(text: string): FlightNumber | null {
  const m = text.trim().toUpperCase().match(/^([A-Z0-9]{2})\s*0*(\d{1,4}[A-Z]?)$/)
  if (!m || /^\d{2}$/.test(m[1])) return null // two digits alone is not an airline code
  const airline = AIRLINES[m[1]] ?? null
  return { airlineCode: m[1], airline, number: m[2], pretty: `${m[1]} ${m[2]}` }
}

export function airportName(code: string): string | null {
  const a = AIRPORTS[code.trim().toUpperCase()]
  return a ? `${a[0]} (${code.trim().toUpperCase()}), ${a[1]}` : null
}

// Turns "ICN" into "Incheon International (ICN), Seoul". Anything else is left alone.
export function expandAirport(text: string): string {
  return /^[A-Za-z]{3}$/.test(text.trim()) ? (airportName(text) ?? text) : text
}

// A title for the journey, such as "Korean Air KE 123".
export function flightTitle(f: FlightNumber): string {
  return f.airline ? `${f.airline} ${f.pretty}` : f.pretty
}

export function flightLinks(f: FlightNumber, date: string) {
  const q = encodeURIComponent(`${f.pretty} flight ${date}`)
  return [
    { label: 'Google', href: `https://www.google.com/search?q=${q}` },
    { label: 'FlightAware', href: `https://www.flightaware.com/live/flight/${f.airlineCode}${f.number}` },
    { label: 'Flightradar24', href: `https://www.flightradar24.com/data/flights/${(f.airlineCode + f.number).toLowerCase()}` },
  ]
}

export type FlightInfo = { from?: string; to?: string; departTime?: string; arriveTime?: string; note?: string }

// Optional: a small web service you run (it holds your flight-data key privately) that answers
//   GET <VITE_FLIGHT_PROXY_URL>?flight=KE123&date=2026-11-13
// with {"from":"ICN","to":"PUS","departTime":"09:10","arriveTime":"10:20","note":"Terminal 2"}.
// Without it, this returns null and the app just fills in the airline and airport names.
export async function lookupFlight(f: FlightNumber, date: string): Promise<FlightInfo | null> {
  const proxy = (import.meta.env as Record<string, string | undefined>).VITE_FLIGHT_PROXY_URL
  if (!proxy) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(`${proxy}?flight=${encodeURIComponent(f.airlineCode + f.number)}&date=${date}`, { signal: ctrl.signal })
    if (!res.ok) return null
    const d = (await res.json()) as Record<string, unknown>
    const time = (v: unknown) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : undefined)
    const text = (v: unknown) => (typeof v === 'string' ? v.slice(0, 200) : undefined)
    return { from: text(d.from), to: text(d.to), departTime: time(d.departTime), arriveTime: time(d.arriveTime), note: text(d.note) }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
