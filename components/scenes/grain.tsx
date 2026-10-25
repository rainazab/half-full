/** Shared paper-grain filter and palette so authored scenes match the gouache stickers. */
export const INK = "#344a62";
export const PALETTE = {
  cream: "#faf9f4",
  butter: "#f6e39c",
  sky: "#a6cff2",
  skyDeep: "#7fb3e6",
  sage: "#bfe3cf",
  sageDeep: "#8fc9ad",
  lilac: "#cdbcf0",
  lilacDeep: "#a995dd",
  blush: "#f4c8dc",
  soil: "#c9b08f",
  soilDeep: "#a98a63",
  shale: "#5c6b7c",
  shaleDeep: "#44515f",
  metal: "#3b4756",
};
export function GrainDefs({ id }: { id: string }) {
  return (
    <defs>
      <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.9"
          numOctaves="2"
          seed="7"
          result="noise"
        />
        <feColorMatrix type="saturate" values="0" in="noise" result="grey" />
        <feComponentTransfer in="grey" result="soft">
          <feFuncA type="table" tableValues="0 0.08" />
        </feComponentTransfer>
        <feBlend in="SourceGraphic" in2="soft" mode="multiply" />
      </filter>
      <filter id={`${id}-soft`} x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation="1.2" />
      </filter>
      <radialGradient id={`${id}-sun`} cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="#fff2b8" />
        <stop offset="1" stopColor={PALETTE.butter} />
      </radialGradient>
      <linearGradient id={`${id}-lake`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={PALETTE.sky} />
        <stop offset="1" stopColor={PALETTE.skyDeep} />
      </linearGradient>
      <linearGradient id={`${id}-frost`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#e6f1fb" />
        <stop offset="1" stopColor={PALETTE.lilac} />
      </linearGradient>
    </defs>
  );
}
