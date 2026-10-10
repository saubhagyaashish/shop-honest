import type { PatternId } from '../../shared/contract'

/** Recommended fix per pattern, as the backend's Reporter agent will phrase it. */
export const FIXES: Record<PatternId, string> = {
  false_urgency:
    'Show a real end time that does not move, or remove the countdown. Show stock levels only when they come from live inventory.',
  basket_sneaking: 'Never add items to the cart for the shopper. Offer add-ons as an unticked option with the price shown next to it.',
  confirm_shaming: 'Use neutral decline wording such as “No thanks”, and give the popup a visible close button.',
  forced_action: 'Let shoppers finish the purchase without signing up, downloading an app or buying something unrelated.',
  subscription_trap:
    'Leave memberships unticked by default, show the recurring price in normal type, and allow one-click online cancellation.',
  interface_interference: 'Give paid and free choices equal visual weight, for example two equally styled options.',
  bait_and_switch: 'Only advertise variants and prices that are actually available to buy.',
  drip_pricing: 'Include every unavoidable fee in the price shown on the product page, or show it clearly beside that price.',
  disguised_advertisement: 'Label paid placements clearly as ads or sponsored content.',
  nagging: 'Ask once, respect the answer, and do not repeat the prompt during the same visit.',
  trick_question: 'Write consent choices as plain, positive statements, without double negatives.',
  saas_billing: 'Remind users before a trial converts to paid, and charge only with clear consent.',
  rogue_malware: 'Remove any software that misleads users into paying or installing it.',
  misleading_price:
    'Compare against a price the product was genuinely sold at recently (for example the lowest price of the last 30 days), not an inflated MRP.',
}
