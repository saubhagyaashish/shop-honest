// Legal reference data for the mock audit: what the backend will send in
// AuditReport.exposure. Citations marked verified: false name the right
// instrument but the exact clause has not been checked against the official
// text yet. Precedents carry their source; 'reported' means press or
// law-firm commentary rather than the regulator's own publication.

import type { Exposure, Finding, JurisdictionCode, JurisdictionExposure, PatternId, Precedent, PriceDrift, RuleCitation } from '../../shared/contract'
import { PATTERNS } from '../../shared/patterns'

interface JurisdictionSource {
  code: JurisdictionCode
  name: string
  law: string
  regulator: string
  status: JurisdictionExposure['status']
  maxPenalty: string
  penaltyHeadline: string
  upcoming?: JurisdictionExposure['upcoming']
  rules: Partial<Record<PatternId, RuleCitation>>
  /** Used for patterns without a more specific rule. */
  general: RuleCitation
  precedents: Precedent[]
}

const CCPA_RULES = Object.fromEntries(
  (Object.keys(PATTERNS) as PatternId[]).map((id) => [id, { ...PATTERNS[id].rule, verified: true }]),
) as Record<PatternId, RuleCitation>

const DMCCA = 'Digital Markets, Competition and Consumers Act 2024'
const CCR = 'Consumer Contracts Regulations 2013'
const CPFTA = 'Consumer Protection (Fair Trading) Act (CPFTA)'
const CCCS_PT = 'CCCS Guidelines on Price Transparency (2020)'
const KR_ECA = 'Act on Consumer Protection in Electronic Commerce (amended, in force 14 Feb 2025)'
const ACL = 'Australian Consumer Law'

export const JURISDICTIONS: JurisdictionSource[] = [
  {
    code: 'IN',
    name: 'India',
    law: 'Consumer Protection Act, 2019 and the CCPA Guidelines for Prevention and Regulation of Dark Patterns, 2023',
    regulator: 'Central Consumer Protection Authority (CCPA)',
    status: 'in_force',
    maxPenalty:
      'Up to ₹10 lakh per contravention, ₹50 lakh for each later one (s 21). Criminal: up to 2 years and ₹10 lakh, or 5 years and ₹50 lakh for repeat offences (s 89).',
    penaltyHeadline: 'Up to ₹50 lakh + jail for repeat offences',
    rules: CCPA_RULES,
    general: { source: 'Consumer Protection Act, 2019', clause: 'Sec. 2(47) unfair trade practice', verified: true },
    precedents: [
      {
        id: 'in-physicswallah',
        jurisdiction: 'IN',
        company: 'PhysicsWallah',
        regulator: 'CCPA',
        date: '2026-08',
        outcome: '₹5 lakh penalty',
        amount: { amount: 500_000, currency: 'INR' },
        patternIds: ['basket_sneaking'],
        summary: 'A ₹10 donation was pre-added to orders. Reported to Parliament in August 2026.',
        sourceUrl: 'https://www.aninews.in/news/business/govt-says-ccpa-imposes-rs-20-lakh-for-dark-patterns-steps-up-action-against-deceptive-online-practices20260806161831/',
        confidence: 'reported',
      },
      {
        id: 'in-zepto',
        jurisdiction: 'IN',
        company: 'Zepto',
        regulator: 'CCPA',
        date: '2026-08',
        outcome: '₹7 lakh penalty',
        amount: { amount: 700_000, currency: 'INR' },
        patternIds: ['drip_pricing', 'basket_sneaking'],
        summary: 'Penalised for drip pricing and basket sneaking, the largest of the dark-pattern penalties reported to Parliament.',
        sourceUrl: 'https://www.entertales.com/ccpa-fine-zepto-bookmyshow-indigo-dark-patterns/',
        confidence: 'reported',
      },
    ],
  },
  {
    code: 'SG',
    name: 'Singapore',
    law: `${CPFTA} and the ${CCCS_PT}`,
    regulator: 'Competition and Consumer Commission of Singapore (CCCS)',
    status: 'in_force',
    maxPenalty:
      'CCCS obtains court declarations and injunctions; breaching an injunction can lead to court-ordered fines or jail. Consumers can also claim compensation.',
    penaltyHeadline: 'Court orders; breaches can mean fines or jail',
    rules: {
      drip_pricing: { source: CCCS_PT, clause: 'Drip pricing: unavoidable charges must be in the headline price or shown clearly beside it', verified: true },
      basket_sneaking: { source: CCCS_PT, clause: 'Pre-ticked boxes for add-on purchases', verified: true },
      subscription_trap: { source: CPFTA, clause: 's 4 unfair practice (misleading consumers into recurring subscriptions)', verified: true },
      misleading_price: { source: CCCS_PT, clause: 'Price comparisons and discounts', verified: true },
      false_urgency: { source: CPFTA, clause: 's 4 unfair practice (time-limited offers that are not)', verified: true },
    },
    general: { source: CPFTA, clause: 's 4 unfair practice (saying or doing anything that may deceive or mislead a consumer)', verified: true },
    precedents: [
      {
        id: 'sg-footwear-subscription',
        jurisdiction: 'SG',
        company: 'Online footwear retailer (unnamed)',
        regulator: 'CCCS, State Courts',
        date: '2020-01',
        outcome: 'Court injunction and 3-year compliance orders',
        patternIds: ['subscription_trap'],
        summary: 'Shoppers buying shoes were signed up to a monthly membership disclosed only in fine print.',
        sourceUrl: 'https://www.allenandgledhill.com/sg/publication/articles/14284/court-orders-e-commerce-retailer-to-cease-unfair-trade-practices-and-stop-using-subscription-traps',
        confidence: 'reported',
      },
      {
        id: 'sg-abc-bargain',
        jurisdiction: 'SG',
        company: 'ABC Bargain Centre',
        regulator: 'CCCS',
        date: '2020-10',
        outcome: 'Undertaking to stop misleading time-limited sales',
        patternIds: ['false_urgency'],
        summary: '"Closing down" and "fire sale" ads ran with no end date, implying a short-lived price benefit.',
        sourceUrl:
          'https://cccs.gov.sg/-/media/custom/ccs/files/media-and-publications/media-releases/abc-bargain-centre-16-oct-20/media-release_-abc-valudollar-cease-misleading-ads-w-infogx.ashx',
        confidence: 'official',
      },
    ],
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    law: `${DMCCA} (Part 4) and the ${CCR}`,
    regulator: 'Competition and Markets Authority (CMA)',
    status: 'in_force',
    maxPenalty: 'The CMA can fine directly: up to 10% of global turnover (or £300,000), plus daily penalties and consumer redress orders.',
    penaltyHeadline: 'Up to 10% of global turnover',
    rules: {
      drip_pricing: { source: DMCCA, clause: 's 230: an invitation to purchase must show the total price, including mandatory fees', verified: true },
      basket_sneaking: { source: CCR, clause: 'reg 40: no extra payment without express consent; pre-ticked boxes do not count', verified: true },
      subscription_trap: { source: CCR, clause: 'reg 40: no extra payment without express consent; pre-ticked boxes do not count', verified: true },
      false_urgency: { source: DMCCA, clause: 'Sch. 20 banned practices (false limited-time claims); s 226 misleading actions', verified: false },
      interface_interference: { source: DMCCA, clause: 's 226 misleading actions (deceptive overall presentation)', verified: true },
      confirm_shaming: { source: DMCCA, clause: 's 228 aggressive practices', verified: false },
      misleading_price: { source: DMCCA, clause: 's 226 misleading actions (false price comparison)', verified: true },
    },
    general: { source: DMCCA, clause: 'Part 4, Chapter 1 (unfair commercial practices)', verified: true },
    precedents: [
      {
        id: 'gb-marks-electrical',
        jurisdiction: 'GB',
        company: 'Marks Electrical',
        regulator: 'CMA',
        date: '2026-06',
        outcome: '£720,000 fine and about £600,000 in refunds',
        amount: { amount: 720_000, currency: 'GBP' },
        patternIds: ['basket_sneaking'],
        summary: 'Nearly 40,000 customers were opted into paid recycling and unpacking services through pre-ticked boxes.',
        sourceUrl: 'https://thelens.slaughterandmay.com/post/102n4qw/cma-settles-with-marks-electrical-over-investigation-into-pre-selected-extra-char',
        confidence: 'reported',
      },
      {
        id: 'gb-aa-bsm',
        jurisdiction: 'GB',
        company: 'AA Driving School and BSM',
        regulator: 'CMA',
        date: '2026-04',
        outcome: 'Infringement notice and about £760,000 in consumer redress',
        patternIds: ['drip_pricing'],
        summary: 'The CMA’s first infringement decision under the new regime, over fees not shown upfront.',
        sourceUrl: 'https://www.whitecase.com/insight-alert/hidden-fees-real-consequences-cma-issues-its-first-infringement-decision-under-uks',
        confidence: 'reported',
      },
    ],
  },
  {
    code: 'EU',
    name: 'European Union',
    law: 'Unfair Commercial Practices Directive, Consumer Rights Directive, Price Indication Directive and Digital Services Act',
    regulator: 'National consumer authorities; European Commission for the DSA',
    status: 'in_force',
    maxPenalty: 'Widespread consumer-law infringements: at least 4% of annual turnover or €2 million. DSA: up to 6% of worldwide annual turnover.',
    penaltyHeadline: 'Up to 6% of global turnover',
    rules: {
      false_urgency: { source: 'Unfair Commercial Practices Directive', clause: 'Annex I, point 7: false “very limited time” claims are banned outright', verified: true },
      drip_pricing: { source: 'Unfair Commercial Practices Directive', clause: 'Art. 7(4)(c): price including taxes and delivery charges', verified: true },
      basket_sneaking: { source: 'Consumer Rights Directive', clause: 'Art. 22: express consent for extra payments; no pre-ticked boxes', verified: true },
      subscription_trap: { source: 'Consumer Rights Directive', clause: 'Art. 22: express consent for extra payments; no pre-ticked boxes', verified: true },
      interface_interference: { source: 'Digital Services Act', clause: 'Art. 25: online interfaces must not deceive or manipulate users', verified: true },
      confirm_shaming: { source: 'Digital Services Act', clause: 'Art. 25: online interfaces must not deceive or manipulate users', verified: true },
      misleading_price: { source: 'Price Indication Directive', clause: 'Art. 6a: a discount must refer to the lowest price of the prior 30 days', verified: true },
    },
    general: { source: 'Unfair Commercial Practices Directive', clause: 'Art. 5: general prohibition of unfair commercial practices', verified: true },
    precedents: [
      {
        id: 'eu-x-dsa',
        jurisdiction: 'EU',
        company: 'X',
        regulator: 'European Commission',
        date: '2025-12-05',
        outcome: '€120 million fine',
        amount: { amount: 120_000_000, currency: 'EUR' },
        patternIds: ['interface_interference'],
        summary: 'The first DSA fine. It included an Art. 25 deceptive-design breach: a “verified” checkmark anyone could buy.',
        sourceUrl: 'https://digital-strategy.ec.europa.eu/en/news/commission-fines-x-eu120-million-under-digital-services-act',
        confidence: 'official',
      },
    ],
  },
  {
    code: 'US',
    name: 'United States',
    law: 'FTC Act §5, Restore Online Shoppers’ Confidence Act (ROSCA) and the FTC Guides Against Deceptive Pricing',
    regulator: 'Federal Trade Commission (FTC)',
    status: 'in_force',
    maxPenalty: 'Injunctions, consumer refunds, and civil penalties per violation for ROSCA and other rule breaches.',
    penaltyHeadline: 'Civil penalties + refunds (Amazon paid $2.5B)',
    rules: {
      subscription_trap: { source: 'ROSCA, 15 U.S.C. §8403', clause: 'Clear disclosure and express informed consent before charging', verified: true },
      misleading_price: { source: 'FTC Guides Against Deceptive Pricing', clause: '16 CFR §233.1: former price comparisons must reflect a genuine prior price', verified: true },
    },
    general: { source: 'FTC Act §5, 15 U.S.C. §45', clause: 'Unfair or deceptive acts or practices', verified: true },
    precedents: [
      {
        id: 'us-amazon-prime',
        jurisdiction: 'US',
        company: 'Amazon',
        regulator: 'FTC',
        date: '2025-09-25',
        outcome: '$2.5 billion ($1B civil penalty and $1.5B in refunds)',
        amount: { amount: 2_500_000_000, currency: 'USD' },
        patternIds: ['subscription_trap'],
        summary: 'Shoppers were enrolled in Prime without clear consent, and cancelling was made hard.',
        sourceUrl: 'https://www.fortune.com/2025/09/25/amazon-ftc-settlement-prime-automatic-renewal-lina-khan-dark-patterns',
        confidence: 'reported',
      },
    ],
  },
  {
    code: 'KR',
    name: 'South Korea',
    law: KR_ECA,
    regulator: 'Korea Fair Trade Commission (KFTC)',
    status: 'in_force',
    maxPenalty: 'Corrective orders, administrative fines (reported at ₩1–5 million per breach) and business suspension of up to 12 months.',
    penaltyHeadline: 'Fines + up to 12-month business suspension',
    rules: {
      drip_pricing: { source: KR_ECA, clause: 'Dark-pattern rule: gradual disclosure of costs', verified: true },
      basket_sneaking: { source: KR_ECA, clause: 'Dark-pattern rule: pre-selection of purchase options', verified: true },
      subscription_trap: { source: KR_ECA, clause: 'Art. 13(6) hidden renewals; pre-selection of purchase options', verified: true },
      interface_interference: { source: KR_ECA, clause: 'Dark-pattern rule: false hierarchy', verified: true },
    },
    general: { source: KR_ECA, clause: 'Art. 21(1)(i): deceptive or unfair means of inducing consumers', verified: false },
    precedents: [],
  },
  {
    code: 'AU',
    name: 'Australia',
    law: `${ACL} (Competition and Consumer Act 2010, Sch. 2)`,
    regulator: 'Australian Competition and Consumer Commission (ACCC)',
    status: 'in_force',
    maxPenalty: 'Unfair trading practices (from 1 Jul 2027): the greater of A$100 million, 3× the benefit gained, or 30% of adjusted turnover.',
    penaltyHeadline: 'Up to A$100M or 30% of turnover (from Jul 2027)',
    upcoming: {
      law: 'Unfair Trading Practices ban (ACL s 28B) and transaction-charge disclosure (s 48A)',
      effectiveFrom: '2027-07-01',
      summary: 'Bans design that manipulates or unreasonably distorts consumer decisions, and adds drip-pricing and subscription rules.',
    },
    rules: {
      drip_pricing: { source: ACL, clause: 's 48 single price (s 48A transaction-based charges from 1 Jul 2027)', verified: false },
      misleading_price: { source: ACL, clause: 's 29 false or misleading representations about price', verified: false },
    },
    general: { source: ACL, clause: 's 18 misleading or deceptive conduct (s 28B unfair trading practices from 1 Jul 2027)', verified: false },
    precedents: [],
  },
]

export const EXPOSURE_DISCLAIMER =
  'Shop Honest maps findings to laws and public enforcement outcomes to show exposure. It is not legal advice. Penalties shown are statutory maximums or past outcomes, not a prediction for this business.'

/** Strictest regime in force today (the UK's CMA can fine up to 10% of global turnover directly). */
export const STRICTEST: JurisdictionCode = 'GB'

export function buildExposure(findings: Finding[], priceDrift: PriceDrift): Exposure {
  return {
    priceDrift,
    strictest: STRICTEST,
    disclaimer: EXPOSURE_DISCLAIMER,
    jurisdictions: JURISDICTIONS.map(({ rules, general, ...j }) => ({
      ...j,
      citations: Object.fromEntries(findings.map((f) => [f.id, rules[f.patternId] ?? general])),
    })),
  }
}

/** Every precedent, for tests and the legal annex. */
export const ALL_PRECEDENTS: Precedent[] = JURISDICTIONS.flatMap((j) => j.precedents)
