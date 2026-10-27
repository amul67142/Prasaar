import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Home-screen icon: the bloom on indigo, rendered to PNG (iOS doesn't take SVG icons).
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#17153B" }}>
        <svg width="140" height="140" viewBox="0 0 64 64">
          <path
            d="M47 23A9 9 0 0 1 47 41M48.97 36.24A9 9 0 0 1 36.24 48.97M41 47A9 9 0 0 1 23 47M27.76 48.97A9 9 0 0 1 15.03 36.24M17 41A9 9 0 0 1 17 23M15.03 27.76A9 9 0 0 1 27.76 15.03M23 17A9 9 0 0 1 41 17M36.24 15.03A9 9 0 0 1 48.97 27.76"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={2.6}
            strokeLinecap="round"
          />
          <path
            d="M42.23 30.82A5 5 0 0 1 38.4 40.06M40.06 38.4A5 5 0 0 1 30.82 42.23M33.18 42.23A5 5 0 0 1 23.94 38.4M25.6 40.06A5 5 0 0 1 21.77 30.82M21.77 33.18A5 5 0 0 1 25.6 23.94M23.94 25.6A5 5 0 0 1 33.18 21.77M30.82 21.77A5 5 0 0 1 40.06 25.6M38.4 23.94A5 5 0 0 1 42.23 33.18"
            fill="none"
            stroke="#EE6A1F"
            strokeWidth={2.6}
            strokeLinecap="round"
          />
          <circle cx="32" cy="32" r="3.8" fill="#EE6A1F" />
        </svg>
      </div>
    ),
    size,
  );
}
