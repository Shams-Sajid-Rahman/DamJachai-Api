// 40 common diagnostic tests.
// `range` is the SAMPLE price spread in Taka used to generate fake prices. These are not real market prices.
// `hours` is a typical report time used to generate sample report_hours.
// `tier` sets which labs can offer the test: basic (every lab), mid (mid and full labs), full (full labs only).
// Preparation notes are general information only. Every note tells the user to confirm with the lab.

const CONFIRM = 'Confirm the exact preparation with the lab.';

export const tests = [
  // Hematology
  {
    category: 'hematology', slug: 'cbc', name_en: 'Complete Blood Count (CBC)', name_bn: 'সিবিসি (কমপ্লিট ব্লাড কাউন্ট)',
    sample_type: 'Blood', range: [300, 650], hours: 6, tier: 'basic',
    description: 'Measures red cells, white cells, haemoglobin and platelets.',
    preparation_note: `No special preparation is usually needed. ${CONFIRM}`,
    aliases: ['CBC', 'complete blood count', 'full blood count', 'FBC', 'সিবিসি', 'রক্তের সম্পূর্ণ পরীক্ষা', 'CBC with ESR'],
  },
  {
    category: 'hematology', slug: 'esr', name_en: 'Erythrocyte Sedimentation Rate (ESR)', name_bn: 'ইএসআর',
    sample_type: 'Blood', range: [150, 300], hours: 6, tier: 'basic',
    description: 'A general marker that measures how fast red blood cells settle.',
    aliases: ['ESR', 'sed rate', 'sedimentation rate', 'ইএসআর'],
  },
  {
    category: 'hematology', slug: 'blood-grouping-rh', name_en: 'Blood Grouping & Rh Typing', name_bn: 'রক্তের গ্রুপ ও আরএইচ নির্ণয়',
    sample_type: 'Blood', range: [100, 250], hours: 2, tier: 'basic',
    description: 'Finds the ABO blood group and Rh factor.',
    aliases: ['blood group', 'ABO', 'Rh typing', 'রক্তের গ্রুপ', 'ব্লাড গ্রুপ'],
  },
  {
    category: 'hematology', slug: 'hemoglobin', name_en: 'Hemoglobin (Hb%)', name_bn: 'হিমোগ্লোবিন',
    sample_type: 'Blood', range: [150, 300], hours: 4, tier: 'basic',
    aliases: ['Hb', 'Hb%', 'haemoglobin', 'হিমোগ্লোবিন'],
  },
  {
    category: 'hematology', slug: 'platelet-count', name_en: 'Platelet Count', name_bn: 'প্লাটিলেট কাউন্ট',
    sample_type: 'Blood', range: [150, 350], hours: 4, tier: 'basic',
    aliases: ['platelet', 'PLT', 'প্লাটিলেট', 'প্লেটলেট'],
  },
  {
    category: 'hematology', slug: 'peripheral-blood-film', name_en: 'Peripheral Blood Film (PBF)', name_bn: 'পেরিফেরাল ব্লাড ফিল্ম',
    sample_type: 'Blood', range: [300, 650], hours: 24, tier: 'mid',
    aliases: ['PBF', 'blood film', 'blood smear', 'পিবিএফ'],
  },

  // Biochemistry
  {
    category: 'biochemistry', slug: 'fasting-blood-sugar', name_en: 'Fasting Blood Sugar (FBS)', name_bn: 'খালি পেটে রক্তের সুগার',
    sample_type: 'Blood', range: [100, 250], hours: 4, tier: 'basic',
    preparation_note: `Usually needs fasting for 8 to 10 hours. ${CONFIRM}`,
    aliases: ['FBS', 'fasting glucose', 'fasting sugar', 'sugar test', 'সুগার', 'ডায়াবেটিস পরীক্ষা'],
  },
  {
    category: 'biochemistry', slug: 'random-blood-sugar', name_en: 'Random Blood Sugar (RBS)', name_bn: 'র‍্যান্ডম ব্লাড সুগার',
    sample_type: 'Blood', range: [100, 200], hours: 2, tier: 'basic',
    aliases: ['RBS', 'random glucose', 'র‍্যান্ডম সুগার'],
  },
  {
    category: 'biochemistry', slug: 'ogtt', name_en: 'Oral Glucose Tolerance Test (OGTT)', name_bn: 'ওজিটিটি (গ্লুকোজ টলারেন্স টেস্ট)',
    sample_type: 'Blood', range: [350, 700], hours: 6, tier: 'mid',
    preparation_note: `Usually needs overnight fasting and takes about 2 hours at the lab. ${CONFIRM}`,
    aliases: ['OGTT', 'glucose tolerance test', 'GTT', 'ওজিটিটি'],
  },
  {
    category: 'biochemistry', slug: 'lipid-profile', name_en: 'Lipid Profile', name_bn: 'লিপিড প্রোফাইল',
    sample_type: 'Blood', range: [800, 1600], hours: 12, tier: 'basic',
    preparation_note: `Some labs ask for 10 to 12 hours of fasting. ${CONFIRM}`,
    aliases: ['lipid', 'cholesterol test', 'fasting lipid profile', 'কোলেস্টেরল', 'লিপিড'],
  },
  {
    category: 'biochemistry', slug: 'serum-creatinine', name_en: 'Serum Creatinine', name_bn: 'সিরাম ক্রিয়েটিনিন',
    sample_type: 'Blood', range: [300, 600], hours: 6, tier: 'basic',
    aliases: ['creatinine', 'S. creatinine', 'kidney test', 'ক্রিয়েটিনিন', 'কিডনি পরীক্ষা'],
  },
  {
    category: 'biochemistry', slug: 'sgpt-alt', name_en: 'SGPT (ALT)', name_bn: 'এসজিপিটি (এএলটি)',
    sample_type: 'Blood', range: [300, 600], hours: 6, tier: 'basic',
    aliases: ['SGPT', 'ALT', 'alanine aminotransferase', 'liver enzyme', 'এসজিপিটি'],
  },
  {
    category: 'biochemistry', slug: 'serum-bilirubin', name_en: 'Serum Bilirubin (Total)', name_bn: 'সিরাম বিলিরুবিন',
    sample_type: 'Blood', range: [250, 500], hours: 6, tier: 'basic',
    aliases: ['bilirubin', 'jaundice test', 'বিলিরুবিন', 'জন্ডিস পরীক্ষা'],
  },
  {
    category: 'biochemistry', slug: 'serum-uric-acid', name_en: 'Serum Uric Acid', name_bn: 'সিরাম ইউরিক অ্যাসিড',
    sample_type: 'Blood', range: [300, 600], hours: 6, tier: 'basic',
    aliases: ['uric acid', 'ইউরিক অ্যাসিড'],
  },
  {
    category: 'biochemistry', slug: 'serum-electrolytes', name_en: 'Serum Electrolytes', name_bn: 'সিরাম ইলেক্ট্রোলাইটস',
    sample_type: 'Blood', range: [700, 1300], hours: 8, tier: 'mid',
    aliases: ['electrolytes', 'Na K Cl', 'sodium potassium', 'ইলেক্ট্রোলাইট'],
  },
  {
    category: 'biochemistry', slug: 'liver-function-test', name_en: 'Liver Function Test (LFT)', name_bn: 'লিভার ফাংশন টেস্ট',
    sample_type: 'Blood', range: [1200, 2400], hours: 12, tier: 'mid',
    aliases: ['LFT', 'liver function', 'liver profile', 'লিভার পরীক্ষা'],
  },

  // Hormones & diabetes
  {
    category: 'hormones-diabetes', slug: 'hba1c', name_en: 'HbA1c (Glycated Hemoglobin)', name_bn: 'এইচবিএওয়ানসি',
    sample_type: 'Blood', range: [900, 1800], hours: 12, tier: 'basic',
    aliases: ['HbA1c', 'A1c', 'glycated hemoglobin', 'glycosylated hemoglobin', 'এইচবিএ১সি', 'এইচবিএওয়ানসি'],
  },
  {
    category: 'hormones-diabetes', slug: 'tsh', name_en: 'Thyroid Stimulating Hormone (TSH)', name_bn: 'টিএসএইচ',
    sample_type: 'Blood', range: [700, 1400], hours: 24, tier: 'mid',
    aliases: ['TSH', 'thyroid test', 'থাইরয়েড', 'টিএসএইচ'],
  },
  {
    category: 'hormones-diabetes', slug: 'thyroid-profile', name_en: 'Thyroid Profile (T3, T4, TSH)', name_bn: 'থাইরয়েড প্রোফাইল',
    sample_type: 'Blood', range: [1600, 3200], hours: 24, tier: 'mid',
    aliases: ['thyroid profile', 'T3 T4 TSH', 'TFT', 'thyroid function test', 'থাইরয়েড প্রোফাইল'],
  },
  {
    category: 'hormones-diabetes', slug: 'vitamin-d', name_en: 'Vitamin D (25-OH)', name_bn: 'ভিটামিন ডি',
    sample_type: 'Blood', range: [2500, 4500], hours: 48, tier: 'full',
    aliases: ['vitamin D', '25-OH vitamin D', 'vit D', 'ভিটামিন ডি'],
  },
  {
    category: 'hormones-diabetes', slug: 'vitamin-b12', name_en: 'Vitamin B12', name_bn: 'ভিটামিন বি১২',
    sample_type: 'Blood', range: [1500, 2800], hours: 48, tier: 'full',
    aliases: ['B12', 'vitamin B12', 'cobalamin', 'ভিটামিন বি১২'],
  },

  // Infection & serology
  {
    category: 'infection-serology', slug: 'dengue-ns1', name_en: 'Dengue NS1 Antigen', name_bn: 'ডেঙ্গু এনএস১ অ্যান্টিজেন',
    sample_type: 'Blood', range: [300, 800], hours: 6, tier: 'basic',
    aliases: ['dengue', 'NS1', 'dengue NS1', 'dengue test', 'ডেঙ্গু', 'ডেঙ্গু NS1', 'ডেঙ্গু পরীক্ষা'],
  },
  {
    category: 'infection-serology', slug: 'dengue-igg-igm', name_en: 'Dengue IgG / IgM Antibody', name_bn: 'ডেঙ্গু আইজিজি / আইজিএম',
    sample_type: 'Blood', range: [500, 1100], hours: 8, tier: 'basic',
    aliases: ['dengue antibody', 'dengue IgM', 'dengue IgG', 'ডেঙ্গু অ্যান্টিবডি'],
  },
  {
    category: 'infection-serology', slug: 'widal-test', name_en: 'Widal Test', name_bn: 'ভিডাল টেস্ট',
    sample_type: 'Blood', range: [300, 600], hours: 6, tier: 'basic',
    aliases: ['widal', 'typhoid test', 'টাইফয়েড পরীক্ষা', 'ভিডাল'],
  },
  {
    category: 'infection-serology', slug: 'hbsag', name_en: 'HBsAg (Hepatitis B Surface Antigen)', name_bn: 'এইচবিএসএজি (হেপাটাইটিস বি)',
    sample_type: 'Blood', range: [400, 800], hours: 6, tier: 'basic',
    aliases: ['HBsAg', 'hepatitis B', 'hep B', 'হেপাটাইটিস বি', 'জন্ডিস বি'],
  },
  {
    category: 'infection-serology', slug: 'crp', name_en: 'C-Reactive Protein (CRP)', name_bn: 'সিআরপি',
    sample_type: 'Blood', range: [500, 1000], hours: 6, tier: 'basic',
    aliases: ['CRP', 'C reactive protein', 'সিআরপি'],
  },
  {
    category: 'infection-serology', slug: 'anti-hcv', name_en: 'Anti-HCV (Hepatitis C)', name_bn: 'অ্যান্টি-এইচসিভি (হেপাটাইটিস সি)',
    sample_type: 'Blood', range: [800, 1500], hours: 12, tier: 'mid',
    aliases: ['anti HCV', 'HCV', 'hepatitis C', 'হেপাটাইটিস সি'],
  },

  // Urine & stool
  {
    category: 'urine-stool', slug: 'urine-re', name_en: 'Urine Routine Examination (Urine R/E)', name_bn: 'প্রস্রাবের রুটিন পরীক্ষা',
    sample_type: 'Urine', range: [150, 350], hours: 4, tier: 'basic',
    aliases: ['urine R/E', 'urine RME', 'urine routine', 'urine test', 'urinalysis', 'প্রস্রাব পরীক্ষা'],
  },
  {
    category: 'urine-stool', slug: 'urine-culture', name_en: 'Urine Culture & Sensitivity', name_bn: 'প্রস্রাবের কালচার ও সেনসিটিভিটি',
    sample_type: 'Urine', range: [600, 1200], hours: 72, tier: 'mid',
    aliases: ['urine C/S', 'urine culture', 'urine CS', 'ইউরিন কালচার'],
  },
  {
    category: 'urine-stool', slug: 'stool-re', name_en: 'Stool Routine Examination (Stool R/E)', name_bn: 'মলের রুটিন পরীক্ষা',
    sample_type: 'Stool', range: [150, 350], hours: 6, tier: 'basic',
    aliases: ['stool R/E', 'stool test', 'stool routine', 'মল পরীক্ষা', 'পায়খানা পরীক্ষা'],
  },

  // Heart tests
  {
    category: 'cardiac', slug: 'ecg', name_en: 'Electrocardiogram (ECG)', name_bn: 'ইসিজি',
    sample_type: 'None (procedure)', range: [300, 700], hours: 1, tier: 'basic',
    aliases: ['ECG', 'EKG', 'electrocardiogram', 'ইসিজি'],
  },
  {
    category: 'cardiac', slug: 'echocardiogram', name_en: 'Echocardiogram (Echo)', name_bn: 'ইকোকার্ডিওগ্রাম',
    sample_type: 'None (imaging)', range: [2000, 4000], hours: 2, tier: 'full',
    aliases: ['echo', '2D echo', 'echocardiography', 'ইকো', 'ইকোকার্ডিওগ্রাফি'],
  },
  {
    category: 'cardiac', slug: 'troponin-i', name_en: 'Troponin I', name_bn: 'ট্রপোনিন আই',
    sample_type: 'Blood', range: [1200, 2200], hours: 4, tier: 'mid',
    aliases: ['troponin', 'Trop I', 'cTnI', 'ট্রপোনিন'],
  },

  // X-ray, CT & MRI
  {
    category: 'radiology', slug: 'chest-xray-pa', name_en: 'Chest X-ray (P/A View)', name_bn: 'বুকের এক্স-রে (পিএ ভিউ)',
    sample_type: 'None (imaging)', range: [400, 900], hours: 2, tier: 'mid',
    aliases: ['chest x-ray', 'CXR', 'x-ray chest', 'chest xray', 'বুকের এক্স-রে', 'এক্সরে'],
  },
  {
    category: 'radiology', slug: 'xray-knee', name_en: 'X-ray Knee (AP & Lateral)', name_bn: 'হাঁটুর এক্স-রে',
    sample_type: 'None (imaging)', range: [600, 1200], hours: 2, tier: 'mid',
    aliases: ['knee x-ray', 'x-ray knee joint', 'হাঁটুর এক্সরে'],
  },
  {
    category: 'radiology', slug: 'ct-scan-brain', name_en: 'CT Scan of Brain (Plain)', name_bn: 'ব্রেইনের সিটি স্ক্যান',
    sample_type: 'None (imaging)', range: [3500, 6500], hours: 24, tier: 'full',
    aliases: ['CT brain', 'CT head', 'brain CT', 'সিটি স্ক্যান', 'মাথার সিটি স্ক্যান'],
  },
  {
    category: 'radiology', slug: 'mri-brain', name_en: 'MRI of Brain', name_bn: 'ব্রেইনের এমআরআই',
    sample_type: 'None (imaging)', range: [7000, 14000], hours: 48, tier: 'full',
    preparation_note: `Metal objects must be removed. Tell the lab about any implants. ${CONFIRM}`,
    aliases: ['MRI brain', 'brain MRI', 'MRI head', 'এমআরআই', 'মাথার এমআরআই'],
  },
  {
    category: 'radiology', slug: 'mri-lumbar-spine', name_en: 'MRI of Lumbar Spine', name_bn: 'কোমরের মেরুদণ্ডের এমআরআই',
    sample_type: 'None (imaging)', range: [8000, 15000], hours: 48, tier: 'full',
    preparation_note: `Metal objects must be removed. Tell the lab about any implants. ${CONFIRM}`,
    aliases: ['MRI LS spine', 'lumbar MRI', 'MRI back', 'মেরুদণ্ডের এমআরআই', 'কোমরের এমআরআই'],
  },

  // Ultrasound
  {
    category: 'ultrasound', slug: 'usg-whole-abdomen', name_en: 'Ultrasound of Whole Abdomen', name_bn: 'আল্ট্রাসনোগ্রাম (সম্পূর্ণ পেট)',
    sample_type: 'None (imaging)', range: [1200, 2800], hours: 2, tier: 'mid',
    preparation_note: `Some labs ask for fasting and a full bladder. ${CONFIRM}`,
    aliases: ['USG whole abdomen', 'ultrasound abdomen', 'USG W/A', 'whole abdomen ultrasound', 'আল্ট্রাসনো', 'পেটের আল্ট্রাসনোগ্রাম'],
  },
  {
    category: 'ultrasound', slug: 'usg-lower-abdomen', name_en: 'Ultrasound of Lower Abdomen', name_bn: 'আল্ট্রাসনোগ্রাম (তলপেট)',
    sample_type: 'None (imaging)', range: [900, 2000], hours: 2, tier: 'mid',
    preparation_note: `Usually needs a full bladder. ${CONFIRM}`,
    aliases: ['USG lower abdomen', 'USG L/A', 'pelvic ultrasound', 'তলপেটের আল্ট্রাসনো'],
  },
];
