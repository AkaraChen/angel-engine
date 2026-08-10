import type { ErrorInfo, ReactNode } from "react";

import { Component } from "react";

import { RecoveryState } from "@/components/recovery-state";
import { workspaceContentColumnClass } from "@/features/chat/components/thread-styles";
import i18n from "@/i18n";

export class ChatRestoreErrorBoundary extends Component<
  {
    children: ReactNode;
    onBack: () => void;
    onRetry: () => void | Promise<void>;
  },
  { failed: boolean; retryNonce: number }
> {
  state: { failed: boolean; retryNonce: number } = {
    failed: false,
    retryNonce: 0,
  };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error("Chat restore failed", error, errorInfo);
  }

  private handleRetry = () => {
    // Clear the failed query first so remount does not rethrow stale error.
    // History and attention markers stay intact until a successful load.
    void Promise.resolve(this.props.onRetry()).finally(() => {
      this.setState((current) => ({
        failed: false,
        retryNonce: current.retryNonce + 1,
      }));
    });
  };

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <div
          className="
            flex h-full min-h-0 flex-1 items-center justify-center bg-background
            p-4
          "
        >
          <div className={workspaceContentColumnClass}>
            <RecoveryState
              actions={[
                {
                  label: i18n.t("thread.restoreRetry"),
                  onClick: this.handleRetry,
                  primary: true,
                  testId: "chat-restore-retry",
                },
                {
                  label: i18n.t("thread.restoreBack"),
                  onClick: this.props.onBack,
                  testId: "chat-restore-back",
                },
              ]}
              description={i18n.t("thread.restoreFailedDescription")}
              title={i18n.t("thread.restoreFailedTitle")}
              variant="error"
            />
          </div>
        </div>
      );
    }

    return (
      <div className="contents" key={this.state.retryNonce}>
        {this.props.children}
      </div>
    );
  }
}
