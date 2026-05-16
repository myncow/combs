import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const PLAYWRITE_AR_WOFF2 =
  "https://fonts.gstatic.com/s/playwritear/v6/VEMjRohisJz5pTCzruCNjWbfp_N-aNWqYgKS-ftfqfqES67wKO8.woff2";

export default async function Icon() {
  const fontData = await fetch(PLAYWRITE_AR_WOFF2).then((res) => res.arrayBuffer());

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
