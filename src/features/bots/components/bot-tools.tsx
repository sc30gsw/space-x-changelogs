import "@mcp-b/global";
import { useWebMCP } from "@mcp-b/react-webmcp";
import { useRef } from "react";
import {
  catchUp,
  ingestEntry,
  removeEntries,
  removeMemos,
  saveMemo,
  saveSource,
  saveTrack,
} from "../../../stores/changelog";
import { useWorkspace } from "../../../stores/workspace";
import { botToolSpecs, runBotTool, type BotToolSpec } from "../utils/bot-tools";

const doors = {
  ingestEntry,
  catchUp,
  saveTrack,
  saveSource,
  saveMemo,
  removeEntries,
  removeMemos,
};

function BotTool({ spec }: { readonly spec: BotToolSpec }) {
  const workspace = useWorkspace();
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  useWebMCP({
    name: spec.name,
    description: spec.description,
    inputSchema: spec.inputSchema,
    annotations: { readOnlyHint: spec.readOnly },
    execute: (input) => {
      const current = workspaceRef.current;
      return runBotTool(spec, input, doors, {
        tracks: current.tracks,
        sources: current.sources,
        entries: current.entries,
        memos: current.memos,
        isLoading: current.isLoading,
        isError: current.isError,
      });
    },
  });

  return null;
}

export function BotTools() {
  return (
    <>
      {botToolSpecs.map((spec) => (
        <BotTool key={spec.name} spec={spec} />
      ))}
    </>
  );
}
