"use client";

import { domAnimation, LazyMotion, m, useReducedMotion } from "motion/react";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import type { FC, ReactNode } from "react";
import claudeCodeIcon from "../../public/icons/claudecode.svg";
import clineIcon from "../../public/icons/cline.svg";
import codexIcon from "../../public/icons/codex.svg";
import cursorIcon from "../../public/icons/cursor.svg";
import geminiIcon from "../../public/icons/gemini.svg";
import githubCopilotIcon from "../../public/icons/github-copilot.svg";
import kimiIcon from "../../public/icons/kimi.svg";
import qoderIcon from "../../public/icons/qoder-color.svg";
import fleetActualImage from "../../public/fleet-actual.png";
import richChatImage from "../../public/rich-chat-ui.png";
import screenshotImage from "../../public/screenshot.png";
import worktreeActualImage from "../../public/worktree-actual.png";

const repoUrl = "https://github.com/AkaraChen/angel-engine";
const releasesUrl = `${repoUrl}/releases/latest`;

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
};

const Reveal: FC<RevealProps> = ({ children, className, delay = 0 }) => {
  const reduceMotion = useReducedMotion();

  return (
    <m.div
      data-reveal
      className={className}
      animate={reduceMotion ? { opacity: 1, y: 0 } : undefined}
      initial={{ opacity: 0, y: 7 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduceMotion ? 0 : 0.42,
        delay: reduceMotion ? 0 : delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      viewport={{ once: true, amount: 0.16 }}
    >
      {children}
    </m.div>
  );
};

const runtimes = [
  { icon: codexIcon, name: "Codex" },
  { icon: claudeCodeIcon, name: "Claude Code" },
  { icon: geminiIcon, name: "Gemini" },
  { icon: githubCopilotIcon, name: "Copilot" },
  { icon: cursorIcon, name: "Cursor" },
  { icon: kimiIcon, name: "Kimi" },
  { icon: qoderIcon, name: "Qoder" },
  { icon: clineIcon, name: "Cline" },
];

function Mark() {
  return (
    <span className="mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path
          d="M12 2.75 14.45 9.55 21.25 12 14.45 14.45 12 21.25 9.55 14.45 2.75 12 9.55 9.55 12 2.75Z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}

function GitHubIcon() {
  return (
    <svg className="button-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2 .37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 0 1 8 4.84c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  );
}

type ProductWindowProps = {
  alt: string;
  image: StaticImageData;
  priority?: boolean;
};

const ProductWindow: FC<ProductWindowProps> = ({ alt, image, priority }) => (
  <div className="product-window">
    <div className="window-bar" aria-hidden="true">
      <span />
      <span />
      <span />
      <b>Angel Engine</b>
    </div>
    <Image
      src={image}
      alt={alt}
      priority={priority}
      sizes="(max-width: 720px) calc(100vw - 40px), (max-width: 1200px) calc(100vw - 96px), 1120px"
    />
  </div>
);

function Hexagon({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      className={flip ? "cta-hex flip" : "cta-hex"}
      viewBox="0 0 220 160"
      aria-hidden="true"
    >
      <defs>
        <filter
          id={flip ? "hex-blur-b" : "hex-blur-a"}
          x="-30%"
          y="-30%"
          width="160%"
          height="160%"
        >
          <feGaussianBlur stdDeviation="12" />
        </filter>
      </defs>
      <path
        d="M31 80 71 23h118l-40 57 40 57H71Z"
        fill="#d5e5ff"
        opacity=".48"
        filter={`url(#${flip ? "hex-blur-b" : "hex-blur-a"})`}
      />
      <path d="M25 74 65 17h118l-40 57 40 57H65Z" fill="#d5e5ff" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <LazyMotion features={domAnimation}>
      <div className="site-shell">
        <header className="topbar">
          <Link className="brand" href="/" aria-label="Angel Engine home">
            <Mark />
            <span>Angel Engine</span>
          </Link>
          <nav aria-label="Primary navigation">
            <a href="#features">Features</a>
            <a className="nav-github" href={repoUrl}>
              <GitHubIcon />
              GitHub
            </a>
          </nav>
        </header>

        <main>
          <section className="hero">
            <Reveal className="hero-copy">
              <p className="section-label">LOCAL AGENT WORKSPACE</p>
              <h1>Every coding agent. One calm desktop.</h1>
              <p className="hero-subhead">
                Run the tools you already trust, side by side, without losing
                the thread.
              </p>
              <div className="hero-actions">
                <a className="button primary" href={releasesUrl}>
                  Download for desktop
                </a>
                <a className="button secondary" href={repoUrl}>
                  <GitHubIcon />
                  View on GitHub
                </a>
              </div>
            </Reveal>

            <Reveal className="hero-stage" delay={0.08}>
              <ProductWindow
                image={screenshotImage}
                alt="Angel Engine desktop conversation workspace"
                priority
              />
            </Reveal>
          </section>

          <section className="runtime-strip" aria-labelledby="runtime-title">
            <p className="section-label" id="runtime-title">
              WORKS WITH YOUR RUNTIME
            </p>
            <div className="runtime-list">
              {runtimes.map(({ icon, name }) => (
                <div className="runtime-item" key={name}>
                  <Image src={icon} alt="" />
                  <span>{name}</span>
                </div>
              ))}
            </div>
          </section>

          <div id="features">
            <section className="feature-section fleet-section">
              <Reveal className="section-heading">
                <p className="section-label">MULTI-AGENT FLEET</p>
                <h2>Keep parallel work visible.</h2>
                <p>
                  See what is running, waiting, and finished across every
                  project. Step in only when an agent needs you.
                </p>
              </Reveal>
              <Reveal className="mesh-stage" delay={0.06}>
                <div className="glass-panel">
                  <Image
                    className="actual-product-shot"
                    src={fleetActualImage}
                    alt="Angel Engine Fleet with status filters and a project selector"
                    sizes="(max-width: 840px) calc(100vw - 60px), 1080px"
                  />
                </div>
              </Reveal>
            </section>

            <section className="feature-section split-section">
              <Reveal className="section-heading split-copy">
                <p className="section-label">ISOLATED WORKTREES</p>
                <h2>Let every branch move at once.</h2>
                <p>
                  Choose Worktree directly in the Power mode composer. Angel
                  Engine creates an isolated checkout while your project-local
                  work stays separate.
                </p>
              </Reveal>
              <Reveal className="screenshot-card" delay={0.06}>
                <Image
                  src={worktreeActualImage}
                  alt="Angel Engine Power mode composer with Worktree selected"
                  sizes="(max-width: 840px) calc(100vw - 40px), 52vw"
                />
              </Reveal>
            </section>

            <section className="feature-section local-section">
              <Reveal className="section-heading centered">
                <p className="section-label">LOCAL BY DEFAULT</p>
                <h2>Your projects stay on your machine.</h2>
                <p>
                  Angel Engine talks to local runtimes and local repositories.
                  No hosted workspace is required.
                </p>
              </Reveal>
              <div className="paper-grid">
                <Reveal className="paper-card">
                  <span className="paper-index">01</span>
                  <h3>Plain local files</h3>
                  <p>
                    Bring the repositories and tools already on your computer.
                  </p>
                  <code>~/projects/angel-engine</code>
                </Reveal>
                <Reveal className="paper-card" delay={0.05}>
                  <span className="paper-index">02</span>
                  <h3>Open source</h3>
                  <p>
                    Inspect the code, shape the roadmap, and build on it freely.
                  </p>
                  <a href={repoUrl}>Apache-2.0 on GitHub →</a>
                </Reveal>
                <Reveal className="paper-card image-card" delay={0.1}>
                  <Image
                    src={richChatImage}
                    alt="Readable tool calls and command output in an Angel Engine conversation"
                    sizes="(max-width: 840px) calc(100vw - 40px), 50vw"
                  />
                </Reveal>
              </div>
            </section>
          </div>

          <section className="cta-section">
            <Hexagon />
            <Reveal className="cta-copy">
              <p className="section-label">START LOCAL</p>
              <h2>Give your agents room to work.</h2>
              <p>
                Download Angel Engine and bring every coding session into focus.
              </p>
              <a className="button primary" href={releasesUrl}>
                Download the latest release
              </a>
            </Reveal>
            <Hexagon flip />
          </section>
        </main>

        <footer className="footer">
          <Link className="brand" href="/">
            <Mark />
            <span>Angel Engine</span>
          </Link>
          <nav aria-label="Footer navigation">
            <a href={repoUrl}>GitHub</a>
            <a href={releasesUrl}>Releases</a>
            <a href={`${repoUrl}/blob/master/LICENSE`}>License</a>
          </nav>
          <p>Open source. Built for local work.</p>
        </footer>
      </div>
    </LazyMotion>
  );
}
