'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { AgentTown } from '../../src/index';
import type { AgentSimulation } from '../../lib/simulation';

interface ChatMessage {
  id: number;
  from: string;
  body: string;
  isUser: boolean;
  timestamp: number;
}

interface Props {
  town: AgentTown;
  sim: AgentSimulation;
}

let nextMsgId = 0;

export function ChatPanel({ town, sim }: Props) {
  const agents = town.getAgents();
  const [targetId, setTargetId] = useState<string>('all');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: nextMsgId++,
      from: 'You',
      body: text,
      isUser: true,
      timestamp: Date.now(),
    };

    const newMessages = [userMsg];

    if (targetId === 'all') {
      // Send to all agents
      for (const agent of agents) {
        const reply = sim.onChatMessage(agent.id, text);
        if (reply) {
          newMessages.push({
            id: nextMsgId++,
            from: reply.from,
            body: reply.body,
            isUser: false,
            timestamp: Date.now(),
          });
        }
      }
    } else {
      // Send to specific agent
      const reply = sim.onChatMessage(targetId, text);
      if (reply) {
        newMessages.push({
          id: nextMsgId++,
          from: reply.from,
          body: reply.body,
          isUser: false,
          timestamp: Date.now(),
        });
      }
    }

    setMessages((prev) => [...prev, ...newMessages]);
    setInput('');
  }, [input, targetId, agents, sim]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Target selector */}
      <div style={{ marginBottom: 8 }}>
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          style={{ width: '100%' }}
        >
          <option value="all">All Agents</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}{agent.role ? ` (${agent.role})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Chat history */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 200,
          maxHeight: 400,
          overflowY: 'auto',
          marginBottom: 8,
        }}
      >
        {messages.length === 0 && (
          <div className="empty">
            Send a message to chat with your agents.
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className="chat-msg">
            <div
              className="cm-from"
              style={{ color: msg.isUser ? 'var(--accent)' : '#27AE60' }}
            >
              {msg.from}
              <span style={{ fontSize: 9, color: 'var(--muted)', marginLeft: 6, fontWeight: 400 }}>
                {formatTime(msg.timestamp)}
              </span>
            </div>
            <div className="cm-body">{msg.body}</div>
          </div>
        ))}
      </div>

      {/* Input + Send */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{ flex: 1 }}
        />
        <button className="btn-p" onClick={sendMessage}>
          Send
        </button>
      </div>
    </div>
  );
}
