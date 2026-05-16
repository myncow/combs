import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Satori (the engine behind next/og's ImageResponse) supports TTF/OTF only,
// not WOFF/WOFF2. Pin a TTF asset URL served from Google Fonts.
const PLAYWRITE_AR_TTF =
  "https://fonts.gstatic.com/s/playwritear/v6/VEMjRohisJz5pTCzruCNjWbfp_N-aNWqYgKS-ftfqf8.ttf";

export default async function Icon() {
  const fontData = await fetch(PLAYWRITE_AR_TTF).then((res) => res.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#EFF1ED",
          color: "#1C1E1F",
          fontFamily: "Playwrite AR",
          fontSize: 30,
          lineHeight: 1,
          paddingBottom: 2,
        }}
      >
        l
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Playwrite AR",
          data: fontData,
          weight: 400,
          style: "normal",
        },
      ],
    },
  );
}
