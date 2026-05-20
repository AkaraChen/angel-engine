import Image from "next/image";
import Link from "next/link";
import allProviderImage from "../../public/all-provider.png";
import claudeCodeIcon from "../../public/icons/claudecode.svg";
import codexIcon from "../../public/icons/codex.svg";
import openCodeIcon from "../../public/icons/opencode.svg";
import heroImage from "../../public/hero.png";
import projectChatImage from "../../public/project-chat.png";
import richChatUiImage from "../../public/rich-chat-ui.png";
import screenshotImage from "../../public/screenshot.png";
import simpleChatImage from "../../public/simple-chat.png";

const repoUrl = "https://github.com/AkaraChen/angel-engine";

const featureSections = [
  {
    id: "simple-chat",
    label: "Simple chat",
    title: "A quiet chat surface for real agent work",
    copy: "Start a thread, choose the runtime, pick the model, and keep the conversation focused. Angel Engine keeps Codex, OpenCode, and Claude Code inside the same desktop flow.",
    image: simpleChatImage,
  },
  {
    id: "project-chat",
    label: "Project chat",
    title: "Keep every thread attached to its project",
    copy: "Project chat groups conversations by workspace, so each repo keeps its own history, runtime context, and follow-up work without mixing sessions together.",
    image: projectChatImage,
  },
  {
    id: "rich-chat-ui",
    label: "Rich chat UI",
    title: "Open tool calls without leaving the thread",
    copy: "Tool calls, command output, code blocks, and assistant text stay readable in one stream. You can inspect what happened while the agent keeps the conversation moving.",
    image: richChatUiImage,
  },
  {
    id: "all-providers",
    label: "All providers",
    title: "Turn every agent on from one place",
    copy: "Enable Codex, Kimi, OpenCode, Qoder, GitHub Copilot, Gemini, Cursor, Cline, and Claude Code from the same settings screen.",
    image: allProviderImage,
  },
];

const integrations = [
  { icon: codexIcon, name: "Codex" },
  { icon: openCodeIcon, name: "OpenCode" },
  { icon: claudeCodeIcon, name: "Claude Code" },
];

const openSourceCards = [
  [
    "Self-host anywhere",
    "Run the desktop locally, bring your own agent tools, and keep the client close to the projects you work in.",
  ],
  [
    "No vendor lock-in",
    "Use one interface for multiple coding agents instead of rebuilding your workflow around a single provider.",
  ],
  [
    "Transparent by default",
    "Follow the code, inspect changes, and understand how chats, tools, and settings are represented.",
  ],
  [
    "Community-driven",
    "Shape the desktop client around real coding workflows, not a closed product roadmap.",
  ],
];

const faqs = [
  [
    "What is Angel Engine?",
    "Angel Engine is a desktop chat app for coding agents. It gives you one clean place to talk to tools like Codex, OpenCode, and Claude Code.",
  ],
  [
    "Who is it for?",
    "It is for people who already use agentic coding tools and want them to feel more like a focused desktop app than a pile of terminals, tabs, and separate chat windows.",
  ],
  [
    "Which agents can I use?",
    "Angel Engine is designed around Codex, OpenCode, and Claude Code, with settings for enabling more agents from the same desktop.",
  ],
  [
    "Can I use it per project?",
    "Yes. You can keep chats tied to the project they belong to, so work for one repo does not get mixed into another.",
  ],
  [
    "Do I need to learn a new workflow?",
    "No. Start a chat, choose an agent and model, then send the task. Tool calls, output, and follow-up messages stay in the same thread.",
  ],
  [
    "Is it open source?",
    "Yes. Angel Engine is built in the open, so you can inspect it, run it locally, and follow how the desktop app is evolving.",
  ],
];

function Logo({ giant = false }: { giant?: boolean }) {
  return (
    <span
      className={giant ? "logo-mark giant" : "logo-mark"}
      aria-hidden="true"
    >
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
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2 .37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 0 1 8 4.84c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M4.25 6.25 8 10l3.75-3.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ProductFrame() {
  return (
    <div className="product-frame">
      <Image
        src={screenshotImage}
        alt="Angel Engine desktop chat interface"
        priority
        sizes="(max-width: 900px) calc(100vw - 32px), min(1214px, calc(100vw - 66px))"
      />
    </div>
  );
}

export default function Home() {
  return (
    <div className="site-shell">
      <header className="topbar">
        <Link className="brand" href="/">
          <Logo />
          <span>Angel Engine</span>
        </Link>
        <nav>
          <a className="nav-button ghost" href={repoUrl}>
            <GitHubIcon />
            GitHub
          </a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <Image
            className="hero-bg"
            src={heroImage}
            alt=""
            fill
            priority
            sizes="100vw"
          />
          <div className="hero-content">
            <h1>
              All you agent,
              <br />
              in one desktop.
            </h1>
            <p>
              Angel Engine brings Codex, OpenCode, and Claude Code chats into a
              project-aware desktop client.
            </p>
            <div className="hero-actions">
              <a className="primary-button" href={repoUrl}>
                Open desktop
              </a>
              <a className="secondary-button" href={repoUrl}>
                <ChevronDownIcon />
                View source
              </a>
            </div>
            <div className="works-with">
              <span>Works with</span>
              {integrations.map((integration) => (
                <b key={integration.name}>
                  <Image src={integration.icon} alt="" />
                  {integration.name}
                </b>
              ))}
            </div>
          </div>
          <ProductFrame />
        </section>

        <div className="content-band">
          {featureSections.map((section, index) => (
            <section
              className={`feature-row ${index % 2 === 1 ? "is-reversed" : ""}`}
              id={section.id}
              key={section.label}
            >
              <div className="feature-visual">
                <Image
                  src={section.image}
                  alt={`${section.label} screenshot`}
                  sizes="(max-width: 900px) calc(100vw - 40px), min(669px, 58vw)"
                />
              </div>
              <div className="feature-copy">
                <p className="feature-label">{section.label}</p>
                <h2>{section.title}</h2>
                <p>{section.copy}</p>
              </div>
            </section>
          ))}
        </div>

        <section className="open-source" id="open-source">
          <div>
            <p className="eyebrow dark">OPEN SOURCE</p>
            <h2>
              Open source
              <br />
              for all.
            </h2>
            <p>
              Angel Engine is built in the open so you can inspect the client,
              run it locally, and follow how the desktop experience evolves.
            </p>
          </div>
          <div className="open-grid">
            {openSourceCards.map(([title, copy]) => (
              <article key={title}>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="faq-section" id="faq">
          <p className="eyebrow dark">FAQ</p>
          <h2>Questions & answers.</h2>
          <div className="faq-list">
            {faqs.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-top">
          <div>
            <Link className="brand" href="/">
              <Logo />
              <span>Angel Engine</span>
            </Link>
            <p>
              A desktop client for project-aware coding agent chats, tool calls,
              settings, and restored history.
            </p>
          </div>
          {[
            [
              "PRODUCT",
              "Features",
              "#simple-chat",
              "Providers",
              "#all-providers",
            ],
            ["RESOURCES", "FAQ", "#faq", "GitHub", repoUrl],
            ["COMPANY", "Open Source", "#open-source", "Source", repoUrl],
          ].map(([group, firstLabel, firstHref, secondLabel, secondHref]) => (
            <nav key={group}>
              <b>{group}</b>
              <a href={firstHref}>{firstLabel}</a>
              <a href={secondHref}>{secondLabel}</a>
            </nav>
          ))}
        </div>
        <div className="footer-bottom">
          <p>© 2026 Angel Engine. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
