import { ImageResponse } from "next/og";

/** The preview card shown when the site link is shared (LinkedIn, X, messages). Static, no user data. */
export const alt = "ConvoPilot — the AI chief of staff for your conversations. Nothing important slips.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #E9E1FF 0%, #FBFAFE 50%, #FFE3D4 100%)",
          color: "#17151F",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 40, fontWeight: 600 }}>
          <div style={{ width: 64, height: 40, background: "linear-gradient(135deg, #B9A2FF, #E6A6E8 55%, #FFB892)", transform: "skewX(-20deg)", borderRadius: 6 }} />
          convopilot
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: -3, lineHeight: 1 }}>Nothing important</div>
          <div style={{ fontSize: 104, fontStyle: "italic", lineHeight: 1.1, color: "#9B5CE0" }}>slips.</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: "#3B3851" }}>
          <span>The AI chief of staff for your conversations</span>
          <span>Invite-only early access</span>
        </div>
      </div>
    ),
    size,
  );
}
