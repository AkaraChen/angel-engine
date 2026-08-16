export type TurnActivityDisplay = "collapsed" | "expanded" | "summary";

export function defaultTurnActivityDisplay(
  active: boolean,
): TurnActivityDisplay {
  return active ? "summary" : "collapsed";
}

export function nextTurnActivityDisplay(
  display: TurnActivityDisplay,
): TurnActivityDisplay {
  switch (display) {
    case "collapsed":
      return "summary";
    case "summary":
      return "expanded";
    case "expanded":
      return "collapsed";
  }
}
