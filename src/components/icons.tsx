export function Arrow({ direction = "right" }: { direction?: "right" | "left" | "up-right" }) {
  const paths = {
    right: "M3 8h13m-5-5 5 5-5 5",
    left: "M16 8H3m5-5L3 8l5 5",
    "up-right": "M4 13 14 3M6 3h8v8",
  };

  return <svg aria-hidden="true" width="18" height="16" viewBox="0 0 19 16" fill="none"><path d={paths[direction]} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function BagIcon() {
  return <svg aria-hidden="true" width="19" height="20" viewBox="0 0 19 20" fill="none"><path d="M3.25 6.75h12.5l1 11H2.25l1-11ZM6.75 7V5a2.75 2.75 0 0 1 5.5 0v2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
