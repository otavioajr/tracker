"use client";

import { useMapEvents } from "react-leaflet";

export type BaseLayerListenerProps = {
  onChange: (name: string) => void;
};

export function BaseLayerListener({ onChange }: BaseLayerListenerProps) {
  useMapEvents({
    baselayerchange: (event) => {
      onChange(event.name);
    },
  });
  return null;
}
