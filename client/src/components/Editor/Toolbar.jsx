import React from 'react';
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, CheckSquare, Quote, Code,
  Undo, Redo, Link2, RemoveFormatting, Lock
} from 'lucide-react';

export const Toolbar = ({ quill, readOnly = false }) => {
  if (readOnly) {
    return (
      <div className="toolbar-container" style={{ background: 'var(--bg-surface-subtle)', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          <Lock size={14} />
          <span>Viewing only &bull; You do not have permissions to edit this document.</span>
        </div>
      </div>
    );
  }

  const format = (name, value) => {
    if (!quill) return;
    quill.focus();
    const currentFormat = quill.getFormat();
    if (value === undefined) {
      quill.format(name, !currentFormat[name]);
    } else {
      quill.format(name, value);
    }
  };

  const handleUndo = () => {
    if (quill && quill.history) quill.history.undo();
  };

  const handleRedo = () => {
    if (quill && quill.history) quill.history.redo();
  };

  const handleLink = () => {
    if (!quill) return;
    const selection = quill.getSelection();
    const hasSelection = selection && selection.length > 0;
    
    // Check if cursor is already on a link
    const currentFormat = quill.getFormat();
    if (currentFormat.link) {
      const remove = window.confirm(`Remove existing link (${currentFormat.link})?`);
      if (remove) {
        quill.format('link', false, 'user');
        return;
      }
    }

    const promptText = hasSelection 
      ? 'Enter destination URL for selected text:' 
      : 'Enter destination URL to insert at cursor:';

    let url = prompt(promptText, 'https://');
    if (!url || !url.trim()) return;

    url = url.trim();
    if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) {
      url = 'https://' + url;
    }

    if (hasSelection) {
      quill.format('link', url, 'user');
    } else {
      const atIndex = selection ? selection.index : quill.getLength();
      quill.insertText(atIndex, url, { link: url }, 'user');
      quill.setSelection(atIndex + url.length, 0);
    }
  };

  const handleClearFormat = () => {
    if (!quill) return;
    const range = quill.getSelection();
    if (range) {
      quill.removeFormat(range.index, range.length);
    }
  };

  return (
    <div className="toolbar-container" id="editor-toolbar">
      {/* History */}
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={handleUndo} title="Undo (Ctrl+Z)">
          <Undo size={15} />
        </button>
        <button className="toolbar-btn" onClick={handleRedo} title="Redo (Ctrl+Y)">
          <Redo size={15} />
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Font Family */}
      <div className="toolbar-group">
        <select
          className="toolbar-select"
          onChange={(e) => format('font', e.target.value)}
          defaultValue="Inter"
          title="Font Family"
        >
          <option value="Inter">Inter</option>
          <option value="Outfit">Outfit</option>
          <option value="Arial">Arial</option>
          <option value="Georgia">Georgia</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="JetBrains Mono">JetBrains Mono</option>
        </select>
      </div>

      {/* Paragraph Style / Headings */}
      <div className="toolbar-group">
        <select
          className="toolbar-select"
          onChange={(e) => {
            const val = e.target.value;
            format('header', val === 'p' ? false : Number(val));
          }}
          defaultValue="p"
          title="Text Style"
        >
          <option value="p">Normal text</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
        </select>
      </div>

      <div className="toolbar-divider" />

      {/* Inline Formatting */}
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={() => format('bold')} title="Bold (Ctrl+B)">
          <Bold size={15} />
        </button>
        <button className="toolbar-btn" onClick={() => format('italic')} title="Italic (Ctrl+I)">
          <Italic size={15} />
        </button>
        <button className="toolbar-btn" onClick={() => format('underline')} title="Underline (Ctrl+U)">
          <Underline size={15} />
        </button>
        <button className="toolbar-btn" onClick={() => format('strike')} title="Strikethrough">
          <Strikethrough size={15} />
        </button>
      </div>

      {/* Color controls */}
      <div className="toolbar-group">
        <input
          type="color"
          title="Text Color"
          style={{ width: '22px', height: '22px', border: 'none', background: 'transparent', cursor: 'pointer' }}
          onChange={(e) => format('color', e.target.value)}
        />
        <input
          type="color"
          title="Highlight Color"
          defaultValue="#fef08a"
          style={{ width: '22px', height: '22px', border: 'none', background: 'transparent', cursor: 'pointer' }}
          onChange={(e) => format('background', e.target.value)}
        />
      </div>

      <div className="toolbar-divider" />

      {/* Alignment */}
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={() => format('align', false)} title="Left Align">
          <AlignLeft size={15} />
        </button>
        <button className="toolbar-btn" onClick={() => format('align', 'center')} title="Center Align">
          <AlignCenter size={15} />
        </button>
        <button className="toolbar-btn" onClick={() => format('align', 'right')} title="Right Align">
          <AlignRight size={15} />
        </button>
        <button className="toolbar-btn" onClick={() => format('align', 'justify')} title="Justify">
          <AlignJustify size={15} />
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Lists & Quotes */}
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={() => format('list', 'bullet')} title="Bulleted List">
          <List size={15} />
        </button>
        <button className="toolbar-btn" onClick={() => format('list', 'ordered')} title="Numbered List">
          <ListOrdered size={15} />
        </button>
        <button className="toolbar-btn" onClick={() => format('list', 'check')} title="Checklist">
          <CheckSquare size={15} />
        </button>
        <button className="toolbar-btn" onClick={() => format('blockquote')} title="Quote">
          <Quote size={15} />
        </button>
        <button className="toolbar-btn" onClick={() => format('code-block')} title="Code Block">
          <Code size={15} />
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Links & Clear */}
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={handleLink} title="Insert Link">
          <Link2 size={15} />
        </button>
        <button className="toolbar-btn" onClick={handleClearFormat} title="Clear Formatting">
          <RemoveFormatting size={15} />
        </button>
      </div>
    </div>
  );
};
