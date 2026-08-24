import { Injectable } from '@nestjs/common';
import axios from 'axios';

export interface Webcam {
  id: string;
  title: string;
  location: {
    lat: number;
    lng: number;
  };
  image: {
    current: {
      preview: string;
      daylight: string;
    };
  };
  distance: number; // Distance from prediction in km
}

@Injectable()
export class WebcamProvider {
  private readonly BASE_URL = 'https://api.windy.com/api/webcams/v2/list';
  private readonly API_KEY = process.env.WINDY_WEBCAMS_API_KEY;
  private readonly TIMEOUT = 5000;
  private readonly MAX_RADIUS = 50; // km
  private readonly MAX_WEBCAMS = 6; // Limit displayed webcams

  /**
   * Find nearby webcams around a given coordinate
   * @param lat Latitude
   * @param lon Longitude
   * @param radius Search radius in km (default: 50)
   * @returns Array of nearby webcams sorted by distance
   */
  async findNearbyWebcams(lat: number, lon: number, radius: number = this.MAX_RADIUS): Promise<Webcam[]> {
    if (!this.API_KEY) {
      console.warn('WINDY_WEBCAMS_API_KEY not set, webcam lookup disabled');
      return [];
    }

    try {
      const response = await axios.get(this.BASE_URL, {
        params: {
          key: this.API_KEY,
          lat: lat.toFixed(6),
          lon: lon.toFixed(6),
          radius: radius,
          show: 'webcams:image,location',
        },
        timeout: this.TIMEOUT,
      });

      const webcams = response.data?.result?.webcams || [];

      // Calculate distance and sort
      const webcamsWithDistance = webcams
        .map((webcam: any) => ({
          id: webcam.id,
          title: webcam.title || webcam.location?.city || 'Unknown Location',
          location: {
            lat: webcam.location.latitude,
            lng: webcam.location.longitude,
          },
          image: {
            current: {
              preview: webcam.image.current.preview,
              daylight: webcam.image.current.daylight,
            },
          },
          distance: this.calculateDistance(
            lat,
            lon,
            webcam.location.latitude,
            webcam.location.longitude
          ),
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, this.MAX_WEBCAMS);

      return webcamsWithDistance;
    } catch (error) {
      // Log error but don't throw - this is optional enrichment
      console.error('Windy Webcams API failed:', error instanceof Error ? error.message : 'Unknown error');
      return [];
    }
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * @returns Distance in kilometers
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
