// Turn snake_case SQL rows into the camelCase JSON the API returns.

export const mapCity = (row, prefix = 'city_') =>
  row[`${prefix}id`] == null
    ? null
    : { id: row[`${prefix}id`], slug: row[`${prefix}slug`], nameEn: row[`${prefix}name_en`], nameBn: row[`${prefix}name_bn`] };

export const mapArea = (row, prefix = 'area_') => mapCity(row, prefix);

export const mapCategory = (row, prefix = 'category_') => mapCity(row, prefix);

export const mapRating = (row) => ({
  average: row.avg_rating == null ? null : Number(row.avg_rating),
  count: Number(row.review_count || 0),
});

/** The lab columns from LAB_SELECT plus city, area and rating columns. */
export function mapLab(row) {
  return {
    id: row.lab_id,
    name: row.lab_name,
    slug: row.lab_slug,
    address: row.address,
    phone: row.phone,
    website: row.website,
    latitude: row.latitude,
    longitude: row.longitude,
    openingHours: row.opening_hours,
    isAccredited: row.is_accredited,
    accreditationNote: row.accreditation_note,
    homeCollection: row.home_collection,
    homeCollectionFee: row.home_collection_fee,
    isSample: row.is_sample,
    city: mapCity(row),
    area: mapArea(row),
    rating: mapRating(row),
  };
}

export const mapTestSummary = (row) => ({
  id: row.test_id ?? row.id,
  slug: row.test_slug ?? row.slug,
  nameEn: row.test_name_en ?? row.name_en,
  nameBn: row.test_name_bn ?? row.name_bn,
});

export const mapPrice = (row) => ({
  labTestId: row.lab_test_id,
  price: row.price,
  discountedPrice: row.discounted_price,
  effectivePrice: row.effective_price ?? row.discounted_price ?? row.price,
  reportHours: row.report_hours,
  lastVerifiedAt: row.last_verified_at,
  source: row.source,
});
