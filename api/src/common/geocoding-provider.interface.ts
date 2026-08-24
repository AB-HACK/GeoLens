export interface GeocodingResult {
  city?: string;
  country?: string;
  fullAddress?: string;
}

export interface GeocodingProvider {
  /**
   * Reverse geocode coordinates to get location information
   * @param lat Latitude
   * @param lon Longitude
   * @returns Geocoding result or null if lookup fails
   */
  reverseGeocode(lat: number, lon: number): Promise<GeocodingResult | null>;
}
