import type { Metadata } from "next";

import HomePage from "./home-page";

export const metadata: Metadata = {
  description:
    "Run every coding agent side by side in one open-source local desktop workspace.",
  title: "Angel Engine — Local Desktop for Coding Agents",
};

export default function Page() {
  return <HomePage />;
}
