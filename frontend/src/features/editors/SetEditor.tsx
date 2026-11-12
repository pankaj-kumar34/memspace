import React, { useState } from "react";
import { Plus, Trash2, Search } from "lucide-react";
import { DataService } from "../../../bindings/redisian/backend/services/index.js";

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
  const [members, setMembers] = useState<string[]>(initialMembers);
  const [filter, setFilter] = useState("");
  const [newMember, setNewMember] = useState("");

  const filtered = members.filter((m) => m.toLowerCase().includes(filter.toLowerCase()));

  const handleAddMember = async () => {
    if (!newMember.trim() || readOnly) return;
    try {
      await DataService.SAdd(connId, db, keyName, [newMember.trim()]);
      setMembers((prev) => [...prev, newMember.trim()]);
      setNewMember("");
    } catch (err: any) {
      alert("Failed to add member: " + (err?.message || err));
    }
  };

  const handleRemoveMember = async (val: string) => {
    if (readOnly) return;
    try {
      await DataService.SRem(connId, db, keyName, [val]);
      setMembers((prev) => prev.filter((m) => m !== val));
    } catch (err: any) {
      alert("Failed to remove member: " + (err?.message || err));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "0.5rem" }}>
      {/* Top Operations */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.5rem 0",
        borderBottom: "1px solid #1f2937",
        gap: "0.5rem",
      }}>
        <div style={{ position: "relative", width: "220px" }}>
          <Search size={14} style={{ position: "absolute", left: "8px", top: "8px", color: "#6b7280" }} />
          <input
            type="text"
            placeholder="Search members..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="input-dark font-mono"
            style={{ width: "100%", paddingLeft: "1.75rem", fontSize: "0.8125rem", padding: "0.3rem 0.5rem 0.3rem 1.75rem" }}
          />
        </div>

        {!readOnly && (
          <div style={{ display: "flex", gap: "0.5rem", flex: 1, maxWidth: "350px" }}>
            <input
              type="text"
              placeholder="New member value..."
              value={newMember}
              onChange={(e) => setNewMember(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddMember()}
              className="input-dark font-mono"
              style={{ flex: 1, fontSize: "0.8125rem", padding: "0.25rem 0.5rem" }}
            />
            <button onClick={handleAddMember} className="btn-primary" style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}>
              <Plus size={14} />
              <span>Add</span>
            </button>
          </div>
        )}

        <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
          {members.length} members
        </span>
      </div>

      {/* Set Members List */}
      <div style={{ flex: 1, overflowY: "auto", border: "1px solid #1f2937", borderRadius: "0.375rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
          <thead>
            <tr style={{ backgroundColor: "#111827", borderBottom: "1px solid #1f2937", textAlign: "left", color: "#9ca3af" }}>
              <th style={{ padding: "0.5rem 0.75rem" }}>Member</th>
              <th style={{ padding: "0.5rem 0.75rem", width: "70px", textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((member, i) => (
              <tr
                key={i}
                style={{
                  borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                }}
              >
                <td style={{ padding: "0.5rem 0.75rem", color: "#c084fc" }} className="font-mono">
                  {member}
                </td>
                <td style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>
                  {!readOnly && (
                    <button
                      onClick={() => handleRemoveMember(member)}
                      style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}
                      title="Remove Member"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
