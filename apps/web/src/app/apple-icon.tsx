import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home screen icon: the Strate monogram, full bleed (the platform rounds the corners). */
export default function AppleIcon() {
  const k = 180 / 96;
  const bar = (x: number, y: number, w: number, h: number, color: string) => (
    <div
      style={{
        position: "absolute",
        left: x * k,
        top: y * k,
        width: w * k,
        height: h * k,
        borderRadius: 3 * k,
        background: color,
      }}
    />
  );
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: "#15171b",
        display: "flex",
      }}
    >
      {bar(26, 22, 13, 52, "#ffffff")}
      {bar(26, 22, 46, 13, "#ffffff")}
      {bar(26, 44, 32, 13, "#af592f")}
    </div>,
    size,
  );
}
