// Fake sample users, reviews and price reports for testing moderation and rating features.

export const sampleUsers = Array.from({ length: 6 }, (_, i) => ({
  name: `Sample User ${i + 1}`,
  email: `sample.user${i + 1}@example.com`,
}));

// Every comment is prefixed with "[Sample]" so nobody mistakes it for a real review.
export const reviewComments = [
  { rating: 5, onTime: true, comment: '[Sample] Staff were polite and the report came on time.' },
  { rating: 4, onTime: true, comment: '[Sample] Clean waiting area. A bit crowded in the morning.' },
  { rating: 3, onTime: false, comment: '[Sample] The report was a few hours late, but the staff explained why.' },
  { rating: 5, onTime: true, comment: '[নমুনা] খুব দ্রুত রিপোর্ট পেয়েছি, স্টাফরা আন্তরিক।' },
  { rating: 4, onTime: true, comment: '[নমুনা] হোম কালেকশন সময়মতো এসেছিল।' },
  { rating: 2, onTime: false, comment: '[Sample] Long queue and the report was delayed by a day.' },
  { rating: 4, onTime: null, comment: '[Sample] Easy online booking.' },
  { rating: 3, onTime: true, comment: '[নমুনা] দাম একটু বেশি, তবে সার্ভিস ভালো।' },
];

export const priceReportNotes = [
  '[Sample] The price at the counter was different from the website.',
  '[Sample] Price seen on a printed price list at the reception.',
  '[নমুনা] গতকাল এই দামে পরীক্ষা করিয়েছি।',
];
