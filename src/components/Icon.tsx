type IconName =
  | "download"
  | "upload"
  | "trash"
  | "plus"
  | "minus"
  | "fit"
  | "home"
  | "filter"
  | "paint"
  | "close";

interface IconProps {
  name: IconName;
  size?: number;
}

const paths: Record<IconName, React.ReactNode> = {
  download: (
    <>
      <path d="M12 3v11m0 0 4-4m-4 4-4-4" />
      <path d="M5 17v3h14v-3" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V5m0 0-4 4m4-4 4 4" />
      <path d="M5 17v3h14v-3" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7" />
      <path d="M10 11v5m4-5v5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  fit: (
    <>
      <path d="M9 4H4v5m11-5h5v5M9 20H4v-5m11 5h5v-5" />
      <path d="m4 4 5 5m11-5-5 5M4 20l5-5m11 5-5-5" />
    </>
  ),
  home: (
    <>
      <path d="m3 11 9-7 9 7" />
      <path d="M5 10v10h14V10M9 20v-6h6v6" />
    </>
  ),
  filter: <path d="M4 5h16l-6 7v5l-4 2v-7Z" />,
  paint: (
    <>
      <path d="m14 4 6 6-9 9H5v-6Z" />
      <path d="m12 6 6 6M3 21h9" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
};

export function Icon({ name, size = 18 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
