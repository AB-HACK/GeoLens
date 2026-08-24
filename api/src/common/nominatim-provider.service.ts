import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { GeocodingProvider, GeocodingResult } from './geocoding-provider.interface';

@Injectable()
export class NominatimProvider implements GeocodingProvider {
  private readonly BASE_URL = 'https://nominatim.openstreetmap.org/reverse';
  private readonly USER_AGENT = 'GeoLens/4.0 (portfolio project)';
  private readonly TIMEOUT = 5000;

  async reverseGeocode(lat: number, lon: number): Promise<GeocodingResult | null> {
    try {
      const response = await axios.get(this.BASE_URL, {
        params: {
          lat: lat.toFixed(6),
          lon: lon.toFixed(6),
          format: 'json',
        },
        headers: {
          'User-Agent': this.USER_AGENT,
        },
        timeout: this.TIMEOUT,
      });

      const address = response.data?.address;
      if (!address) return null;

      const city = address.city || address.town || address.village || address.county;
      const country = address.country;
      const fullAddress = [city, country].filter(Boolean).join(', ') || null;

      return {
        city,
        country,
        fullAddress,
      };
    } catch (error) {
      // Log error but don't throw - this is optional enrichment
      console.error('Nominatim reverse geocoding failed:', error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }
}
