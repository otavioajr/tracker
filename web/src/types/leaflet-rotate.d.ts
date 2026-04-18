import "leaflet";

declare module "leaflet" {
  interface MapOptions {
    rotate?: boolean;
  }

  interface Map {
    getBearing(): number;
    setBearing(theta: number): void;
    getCircumscribedBounds(): LatLngBounds;
  }
}
