/**
 * 2D 아바타의 꽃·열매 (나무·고사리 공용, 3D `plant-3d/blossom.ts` 와 같은 색). 64×64 좌표에 그린다.
 */

const PETAL = "#F8B3CB";
const PETAL_CENTER = "#FFD66B";
const FRUIT = "#E8664F";

export function Flower({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <circle
          key={a}
          cx={Math.cos((a * Math.PI) / 180) * 1.7}
          cy={Math.sin((a * Math.PI) / 180) * 1.7}
          r="1.5"
          fill={PETAL}
        />
      ))}
      <circle r="1.1" fill={PETAL_CENTER} />
    </g>
  );
}

export function Fruit({ x, y }: { x: number; y: number }) {
  return <circle cx={x} cy={y} r="2.4" fill={FRUIT} />;
}
