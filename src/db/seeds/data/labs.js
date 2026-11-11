// 12 FAKE sample labs. The names, addresses, phone numbers and websites are made up on purpose.
// Phone numbers use the 010 prefix, which no Bangladeshi operator uses. Websites use the reserved example.com domain.
//
// priceLevel: where the lab sits in each test's sample price range (0 = cheapest end, 1 = most expensive end)
// speed:      multiplier on typical report hours (lower = faster)
// capability: basic | mid | full, which test tiers the lab offers (see tests.js)

const HOURS = {
  standard: 'Sat–Thu 8:00 AM–9:00 PM, Fri 3:00 PM–9:00 PM',
  long: 'Every day 7:00 AM–11:00 PM',
  allDay: 'Open 24 hours',
  short: 'Sat–Thu 9:00 AM–6:00 PM, Fri closed',
};

export const labs = [
  { n: 1, city: 'dhaka', area: 'dhanmondi', priceLevel: 0.85, speed: 0.8, capability: 'full', accredited: true, home: true, fee: 300, hours: HOURS.long },
  { n: 2, city: 'dhaka', area: 'dhanmondi', priceLevel: 0.3, speed: 1.1, capability: 'mid', accredited: false, home: true, fee: 200, hours: HOURS.standard },
  { n: 3, city: 'dhaka', area: 'mirpur', priceLevel: 0.1, speed: 1.3, capability: 'basic', accredited: false, home: false, fee: null, hours: HOURS.short },
  { n: 4, city: 'dhaka', area: 'mirpur', priceLevel: 0.5, speed: 1.0, capability: 'full', accredited: true, home: true, fee: 250, hours: HOURS.standard },
  { n: 5, city: 'dhaka', area: 'gulshan', priceLevel: 0.95, speed: 0.7, capability: 'full', accredited: true, home: true, fee: 500, hours: HOURS.allDay },
  { n: 6, city: 'dhaka', area: 'uttara', priceLevel: 0.4, speed: 1.0, capability: 'mid', accredited: false, home: true, fee: 200, hours: HOURS.standard },
  { n: 7, city: 'dhaka', area: 'uttara', priceLevel: 0.7, speed: 0.9, capability: 'full', accredited: true, home: true, fee: 300, hours: HOURS.long },
  { n: 8, city: 'dhaka', area: 'mohammadpur', priceLevel: 0.2, speed: 1.2, capability: 'mid', accredited: false, home: false, fee: null, hours: HOURS.standard },
  { n: 9, city: 'chattogram', area: 'agrabad', priceLevel: 0.6, speed: 0.9, capability: 'full', accredited: true, home: true, fee: 250, hours: HOURS.long },
  { n: 10, city: 'chattogram', area: 'agrabad', priceLevel: 0.15, speed: 1.2, capability: 'mid', accredited: false, home: true, fee: 150, hours: HOURS.standard },
  { n: 11, city: 'chattogram', area: 'panchlaish', priceLevel: 0.8, speed: 0.8, capability: 'full', accredited: true, home: false, fee: null, hours: HOURS.allDay },
  { n: 12, city: 'chattogram', area: 'nasirabad', priceLevel: 0.35, speed: 1.1, capability: 'basic', accredited: false, home: true, fee: 200, hours: HOURS.short },
];
