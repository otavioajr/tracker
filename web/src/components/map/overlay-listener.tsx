"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

type Props = {
  overlayName: string;
  onChange: (visible: boolean) => void;
};

export function OverlayListener({ overlayName, onChange }: Props) {
  const map = useMap();

  useEffect(() => {
    const handleAdd = (e: { name: string }) => {
      if (e.name === overlayName) onChange(true);
    };
    const handleRemove = (e: { name: string }) => {
      if (e.name === overlayName) onChange(false);
    };
    map.on("overlayadd", handleAdd as never);
    map.on("overlayremove", handleRemove as never);
    return () => {
      map.off("overlayadd", handleAdd as never);
      map.off("overlayremove", handleRemove as never);
    };
  }, [map, overlayName, onChange]);

  return null;
}
