import { Html } from "@react-three/drei";

export function Balloon({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <Html
      position={[0, 0, 0]}
      distanceFactor={5.2}
      zIndexRange={[20, 0]}
      wrapperClass="balloon-anchor"
      style={{ pointerEvents: "none" }}
    >
      <div className="balloon">{text}</div>
    </Html>
  );
}
