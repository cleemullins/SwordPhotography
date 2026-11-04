import type { BladeDefinition, KissakiType } from './model'

interface PublishedMeasurements {
  length: number
  curvature: number
  width: number
  tipWidth: number
  baseKasane?: number
  tipKasane?: number
  tipLength?: number
  kissakiType?: KissakiType
}
interface HistoricalRecord {
  name: string
  period: string
  grade: string
  source: string
  published: PublishedMeasurements
  curvePosition?: number
  notes: string
}

// Published dimensions are converted from the sources' metric values to millimeters.
const records: HistoricalRecord[] = [
  { name: 'Aoe - Juyo 35', period: 'Late Kamakura', grade: 'NBTHK Juyo Token, session 35',
    source: 'https://www.aoijapan.net/katana-mumeiaoe-35th-nbthk-juyo-paper/',
    published: { length: 742, curvature: 22, width: 28.8, tipWidth: 20.2, baseKasane: 6 },
    notes: 'Unsigned, attributed to Aoe. Kissaki dimensions are not published.' },
  { name: 'Fukuoka Ichimonji - Juyo 56', period: 'Middle Kamakura', grade: 'NBTHK Juyo Token, session 56',
    source: 'https://www.aoijapan.net/katana-mumei-fukuoka-ichomonji56th-nbthk-juyo-paper/',
    published: { length: 703, curvature: 18, width: 28.4, tipWidth: 20, baseKasane: 6.7 },
    notes: 'Unsigned attribution; the source spells the school Ichomonji. No bo-hi is reported.' },
  { name: 'Ayanokoji - Juyo 66', period: 'Kamakura', grade: 'NBTHK Juyo Token, session 66 (2020)',
    source: 'https://nihonto.com.au/product/rai-kunizane-katana-with-nbthk-tokubetsu-hozon-certificate/',
    published: { length: 741, curvature: 28, width: 28, tipWidth: 18, tipLength: 31, kissakiType: 'chu' },
    curvePosition: 0.35, notes: 'Dealer-published certificate translation identifies Ayanokoji despite the reused URL. Koshizori is described; its numeric peak and all thicknesses are estimated. Bo-hi is omitted.' },
  { name: 'Tametsugu - Juyo 11', period: 'Nanbokucho', grade: 'NBTHK Juyo Token, session 11 (1963)',
    source: 'https://nihonto.com.au/product/tametsugu-juyo-token/',
    published: { length: 757, curvature: 24, width: 32, tipWidth: 32, tipLength: 151, kissakiType: 'o' },
    curvePosition: 0.65, notes: 'Naginata-naoshi katana. Sakizori is described; its numeric peak and thicknesses are estimated. Grooves and the original naginata geometry are not reconstructed.' },
  { name: 'Rai Kunimitsu - Juyo 49', period: 'Late Kamakura, circa 1331-1333', grade: 'NBTHK Juyo Token, session 49',
    source: 'https://www.aoijapan.net/katana-mumei-rai-kunimitsu49th-nbthk-juyo-paper/',
    published: { length: 651, curvature: 11, width: 27.8, tipWidth: 22.6, baseKasane: 6.9 },
    notes: 'Unsigned attribution. Uses the published 0.69 cm kasane, not the inconsistent inch conversion. Bo-hi is omitted.' },
  { name: 'Den Kanemitsu - Juyo 13', period: 'Early Nanbokucho', grade: 'NBTHK Juyo Token, session 13',
    source: 'https://www.aoijapan.net/katana-mumei-den-kanemitsujyuyo-token-13/',
    published: { length: 757, curvature: 19.6, width: 31.6, tipWidth: 22.4, baseKasane: 7.4, kissakiType: 'o' },
    notes: 'Unsigned Den Kanemitsu attribution. O-kissaki is described but its length is estimated.' },
  { name: 'Masatsune (Ko-Aoe) - Juyo 49', period: 'Late Heian, circa 1190', grade: 'NBTHK Juyo Token, session 49',
    source: 'https://www.aoijapan.net/tachi-masatsune-49th-nbthk-juyo-paper/',
    published: { length: 725, curvature: 23, width: 26.3, tipWidth: 15.9, baseKasane: 4.9 },
    notes: 'Signed Masatsune tachi; the source reports a Ko-Aoe attribution, not Ko-Bizen. Kissaki proportions are estimated.' },
  { name: 'Norishige - Juyo 67', period: 'Late Kamakura, early 14th century', grade: 'NBTHK Juyo Token, session 67',
    source: 'https://www.aoijapan.com/consignment-sale-katanamumei-unsignednorishige-%e5%89%87%e9%87%8d-67th-nbthk-juyo-token/',
    published: { length: 702, curvature: 20, width: 30.8, tipWidth: 20, baseKasane: 6, kissakiType: 'chu' },
    curvePosition: 0.35, notes: 'Unsigned Norishige attribution, listing 26502. Uses the metric measurement block. Koshizori is described; peak position is estimated. Bo-hi is omitted.' },
  { name: 'Sanekage - Juyo 20', period: 'Nanbokucho', grade: 'NBTHK Juyo Token, session 20',
    source: 'https://www.aoijapan.net/katana-mumei-sanekage20th-nbthk-juyo-paper/',
    published: { length: 638, curvature: 10, width: 29.3, tipWidth: 21.2, baseKasane: 6.6, kissakiType: 'o' },
    notes: 'Unsigned Sanekage attribution. O-kissaki is described but its length is estimated. Bo-hi is omitted.' },
  { name: 'Nanki Shigekuni - Juyo', period: 'Early Edo, circa 1624 onward', grade: 'NBTHK Juyo Token (session not stated)',
    source: 'https://world-seiyudo.com/product/ka-010521/',
    published: { length: 700, curvature: 12, width: 32.1, tipWidth: 26, baseKasane: 7.1, tipKasane: 5.5, kissakiType: 'chu' },
    notes: 'Ginza Seiyudo listing KA-010521. Base and tip kasane are both published. Do not mix dimensions from other Nanki Shigekuni blades.' },
]

export const HISTORICAL_PRESETS = records.map(record => {
  const m = record.published, kasane = m.baseKasane ?? 6.5
  const tipLength = m.tipLength ?? m.tipWidth * (m.kissakiType === 'o' ? 3 : 1.5)
  const definition: BladeDefinition = {
    length: m.length, width: m.width, curvature: m.curvature, thickness: kasane / 0.76,
    ridge: 0.18, taper: 0.3, tipLength,
    profile: { version: 1, tipWidth: m.tipWidth, baseKasane: kasane, tipKasane: m.tipKasane ?? kasane * 0.7,
      curvePosition: record.curvePosition ?? 0.5, kissakiType: m.kissakiType ?? 'custom',
      fukura: m.kissakiType === 'o' ? 0.3 : 0.5, niku: 0 },
  }
  return { ...record, definition }
})

export const PRESET_MEASURE_LABELS: Record<keyof PublishedMeasurements, string> = {
  length: 'Nagasa', curvature: 'Sori', width: 'Motohaba', tipWidth: 'Sakihaba',
  baseKasane: 'Motokasane', tipKasane: 'Sakikasane', tipLength: 'Kissaki length', kissakiType: 'Kissaki type',
}
