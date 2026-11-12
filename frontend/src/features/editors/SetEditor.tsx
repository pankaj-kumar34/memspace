import React, { useState } from "react";
import { Plus, Trash2, Check, X, Search, Copy, Maximize2 } from "lucide-react";
import { DataService } from "../../../bindings/memspace/backend/services/index.js";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ValueDetailModal } from "./ValueDetailModal";
import { JsonSyntaxHighlighter } from "./JsonSyntaxHighlighter";
import { ConfirmModal } from "../../components/ui/ConfirmModal";
import { useToast } from "../../components/ui/Toast";
import { getErrorMessage } from "../../lib/utils";

const formatIfJson = (str: string): string => {
  try {
    const parsed = JSON.parse(str);
    if (parsed !== null && typeof parsed === "object") {
      return JSON.stringify(parsed, null, 2);
    }
    return str;
  } catch {
    return str;
  }
};

interface SetEditorProps {
  connId: string;
  db: number;
  keyName: string;
  initialMembers: string[];
  readOnly?: boolean;
  onRefresh: () => void;
}

export const SetEditor: React.FC<SetEditorProps> = ({
  connId,
  db,
  keyName,
  initialMembers,
  readOnly = false,
}) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const [members, setMembers] = useState<string[]>(initialMembers);
  const [filter, setFilter] = useState("");
  const [newMember, setNewMember] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [copiedMember, setCopiedMember] = useState<string | null>(null);
  const [inspectingMember, setInspectingMember] = useState<string | null>(null);
  const [deleteMemberTarget, setDeleteMemberTarget] = useState<string | null>(null);

  const filtered = members.filter((m) =>
    m.toLowerCase().includes(filter.toLowerCase())
  );

  const handleCopy = (m: string) => {
    navigator.clipboard.writeText(m);
    setCopiedMember(m);
    setTimeout(() => setCopiedMember(null), 1500);
  };

  const handleAddMember = async () => {
    if (!newMember.trim() || readOnly) return;
    try {
      await DataService.SAdd(connId, db, keyName, [newMember.trim()]);
      setMembers((prev) => Array.from(new Set([...prev, newMember.trim()])));
      setNewMember("");
      setShowAdd(false);
      toastSuccess("Member Added", "Added member to set.");
    } catch (err: unknown) {
      toastError("Failed to add member", getErrorMessage(err));
    }
  };

  const handleConfirmRemoveMember = async () => {
    if (!deleteMemberTarget || readOnly) return;
    const member = deleteMemberTarget;
    setDeleteMemberTarget(null);
    try {
      await DataService.SRem(connId, db, keyName, [member]);
      setMembers((prev) => prev.filter((m) => m !== member));
      toastSuccess("Member Removed", `Removed member from set.`);
    } catch (err: unknown) {
      toastError("Failed to remove member", getErrorMessage(err));
    }
  };

  const isMemberJson = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
    try {
      const parsed = JSON.parse(trimmed);
      return parsed !== null && typeof parsed === "object";
    } catch {
      return false;
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      {/* Search and Add Bar */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-zinc-200/80 bg-zinc-50/70 px-3.5">
        <div className="relative w-64">
          <Search size={13} className="absolute top-2.5 left-2.5 text-zinc-400" />
          <Input
            type="text"
            placeholder="Search members..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8 border-zinc-200 bg-white pl-8 text-xs text-zinc-800 placeholder:text-zinc-400"
          />
          {filter && (
            <button
              onClick={() => setFilter("")}
              className="absolute top-2 right-2 cursor-pointer text-zinc-400 hover:text-zinc-600"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-zinc-400">
            {members.length} {members.length === 1 ? "member" : "members"}
          </span>
          {!readOnly && (
            <Button
              onClick={() => setShowAdd(!showAdd)}
              size="sm"
              variant={showAdd ? "secondary" : "default"}
              className="h-8 cursor-pointer gap-1 text-xs font-semibold"
            >
              <Plus size={13} />
              <span>Add Member</span>
            </Button>
          )}
        </div>
      </div>

      {/* Add Member Inline */}
      {showAdd && (
        <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 p-3">
          <Input
            type="text"
            placeholder="New member value"
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddMember()}
            className="h-8 flex-1 border-zinc-200 bg-white font-mono text-xs text-zinc-800"
            autoFocus
          />
          <Button
            onClick={handleAddMember}
            size="sm"
            variant="default"
            className="h-8 cursor-pointer text-xs font-semibold"
          >
            Save
          </Button>
          <Button
            onClick={() => setShowAdd(false)}
            size="sm"
            variant="outline"
            className="h-8 cursor-pointer text-xs"
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Members Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 border-b border-zinc-200 bg-zinc-50 text-left text-zinc-600 select-none">
            <tr>
              <th className="w-16 px-3.5 py-2 font-semibold">#</th>
              <th className="px-3.5 py-2 font-semibold">Member</th>
              <th className="w-28 px-3.5 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 select-text">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-8 text-center text-xs text-zinc-500">
                  {members.length === 0 ? "Empty set (no members)." : "No members matching filter."}
                </td>
              </tr>
            ) : (
              filtered.map((member, i) => {
                const isCopied = copiedMember === member;
                const hasJson = isMemberJson(member);

                return (
                  <tr key={member} className="transition-colors hover:bg-zinc-50/80">
                    <td className="px-3.5 py-2.5 align-top font-mono font-semibold text-purple-700 select-none">
                      {i + 1}
                    </td>
                    <td className="px-3.5 py-2.5 align-top font-mono break-all text-zinc-800">
                      {hasJson ? (
                        <div className="group relative w-full max-w-2xl overflow-x-auto py-0.5 font-mono">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setInspectingMember(member);
                            }}
                            className="absolute top-0 right-0 z-10 flex cursor-pointer items-center gap-1 rounded-md border border-zinc-200 bg-white/95 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 opacity-0 shadow-2xs backdrop-blur-xs transition-opacity select-none group-hover:opacity-100 hover:bg-white hover:text-indigo-600"
                            title="Expand & Edit JSON"
                          >
                            <span className="text-[9px] font-bold text-indigo-600">JSON</span>
                            <Maximize2 size={10} />
                          </button>

                          <div
                            onClick={() => setInspectingMember(member)}
                            className="cursor-pointer"
                          >
                            <JsonSyntaxHighlighter
                              value={formatIfJson(member)}
                              isJson={true}
                              showLineNumbers={false}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="py-0.5 leading-relaxed whitespace-pre-wrap">{member}</div>
                      )}
                    </td>
                    <td className="px-3.5 py-2 text-right select-none">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setInspectingMember(member)}
                          className="cursor-pointer rounded p-1 text-zinc-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                          title="Inspect & Format Member"
                        >
                          <Maximize2 size={12} />
                        </button>

                        <button
                          onClick={() => handleCopy(member)}
                          className="cursor-pointer rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                          title="Copy Member"
                        >
                          {isCopied ? (
                            <Check size={12} className="text-emerald-600" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>

                        {!readOnly && (
                          <button
                            onClick={() => setDeleteMemberTarget(member)}
                            className="cursor-pointer rounded p-1 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                            title="Remove Member"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Value Inspector Modal */}
      {inspectingMember && (
        <ValueDetailModal
          isOpen={true}
          onClose={() => setInspectingMember(null)}
          title={`Set Member`}
          subtitle={`Key: ${keyName}`}
          value={inspectingMember}
          readOnly={readOnly}
          onSave={async (newVal) => {
            if (newVal !== inspectingMember) {
              await DataService.SRem(connId, db, keyName, [inspectingMember]);
              await DataService.SAdd(connId, db, keyName, [newVal]);
              setMembers((prev) =>
                prev.map((m) => (m === inspectingMember ? newVal : m))
              );
            }
            setInspectingMember(null);
          }}
        />
      )}

      {/* Delete Member Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteMemberTarget}
        title="Remove Set Member"
        description={`Are you sure you want to remove member "${deleteMemberTarget}" from set?`}
        confirmText="Remove Member"
        cancelText="Cancel"
        variant="danger"
        onConfirm={handleConfirmRemoveMember}
        onCancel={() => setDeleteMemberTarget(null)}
      />
    </div>
  );
};
