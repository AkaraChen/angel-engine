import type {
  CapabilityMatrix,
  SourceControlCapabilityId,
  UnsupportedReason,
} from "@angel-engine/daemon-api/source-control";
import type { ReactElement, ReactNode } from "react";
import { cloneElement } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { capabilityState } from "../model";

interface CapabilityGateProps {
  capabilities: CapabilityMatrix | null | undefined;
  capability: SourceControlCapabilityId;
  children: ReactElement<{ disabled?: boolean }>;
  onRemediate?: (reason: UnsupportedReason) => void;
  remediationLabel?: ReactNode;
}

export function CapabilityGate({
  capabilities,
  capability,
  children,
  onRemediate,
  remediationLabel,
}: CapabilityGateProps) {
  const state = capabilityState(capabilities, capability);
  if (state.supported) return children;

  const disabledChild = cloneElement(children, { disabled: true });
  const canRemediate =
    state.reason.kind === "unauthenticated" ||
    state.reason.kind === "cli-missing";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex" data-capability={capability}>
          {disabledChild}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div className="max-w-72 text-xs">
          <p>{state.reason.message}</p>
          {canRemediate && remediationLabel ? (
            state.reason.docsUrl ? (
              <a
                className="mt-1 inline-block underline underline-offset-2"
                href={state.reason.docsUrl}
                rel="noreferrer"
                target="_blank"
              >
                {remediationLabel}
              </a>
            ) : onRemediate ? (
              <button
                className="mt-1 underline underline-offset-2"
                onClick={() => onRemediate(state.reason)}
                type="button"
              >
                {remediationLabel}
              </button>
            ) : null
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
