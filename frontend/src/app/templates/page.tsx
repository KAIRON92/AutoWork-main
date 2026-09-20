"use client";

import { useState, useEffect } from 'react';
import { Shell } from '@/components/layout/shell';
import { templatesService } from '@/services/templatesService';
import { Template } from '@/types';
import { FileText, Plus, Code, Eye, Sparkles, Check, Trash2, Edit3, Copy, RefreshCw } from 'lucide-react';

const AVAILABLE_VARIABLES = [
  { tag: '#NAME#', symbol: '👤', label: 'Full Name', example: 'Sarah Connor' },
  { tag: '#FIRSTNAME#', symbol: '👤', label: 'First Name', example: 'Sarah' },
  { tag: '#LASTNAME#', symbol: '👤', label: 'Last Name', example: 'Connor' },
  { tag: '#EMAIL#', symbol: '✉️', label: 'Email Address', example: 'sarah.c@cyberdyne.io' },
  { tag: '#PHONE#', symbol: '📞', label: 'Phone Number', example: '+1 555-0192' },
  { tag: '#COMPANY#', symbol: '🏢', label: 'Company', example: 'Cyberdyne Systems' },
  { tag: '#TARGET#', symbol: '🎯', label: 'Target / Division', example: 'Strategic Growth Division' },
  { tag: '#RANDOM#', symbol: '🎲', label: 'Random Security Code', example: 'A72K9P (Unique 6-char per recipient)' },
];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [previewData, setPreviewData] = useState<any>(null);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const data = await templatesService.getAll();
      setTemplates(data);
      if (data.length > 0) {
        selectTemplate(data[0]);
      }
    } catch (e: any) {
      console.warn('Templates data sync notice:', e?.message || e);
    } finally {
      setLoading(false);
    }
  };

  const selectTemplate = (tpl: Template) => {
    setActiveTemplate(tpl);
    setName(tpl.name);
    setDescription(tpl.description || '');
    setContent(tpl.content);
    updatePreview(tpl.content);
  };

  const updatePreview = async (text: string) => {
    try {
      const res = await templatesService.preview(text);
      setPreviewData(res);
    } catch (e) {
      console.error('Preview error:', e);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const insertVariable = (tag: string) => {
    const updated = content + ` ${tag}`;
    setContent(updated);
    updatePreview(updated);
  };

  const handleContentChange = (val: string) => {
    setContent(val);
    updatePreview(val);
  };

  const handleSave = async () => {
    if (!activeTemplate) return;
    try {
      const updated = await templatesService.update(activeTemplate.id, {
        name,
        description,
        content,
      });
      setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setActiveTemplate(updated);
      alert('Template saved successfully!');
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    }
  };

  const handleCreateNew = async () => {
    try {
      const newT = await templatesService.create({
        name: 'New Description Template ' + (templates.length + 1),
        description: 'Secure pCloud document distribution description with variable tokens',
        content: 'Hello #NAME#,\n\nPlease find the requested confidential document.\n\nReference: #RANDOM#\n\nBest regards,\nExecutive Team',
      });
      setTemplates([newT, ...templates]);
      selectTemplate(newT);
    } catch (err: any) {
      alert(`Create failed: ${err.message}`);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const dup = await templatesService.duplicate(id);
      setTemplates([dup, ...templates]);
      selectTemplate(dup);
    } catch (err: any) {
      alert(`Duplicate failed: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this description template?')) {
      await templatesService.delete(id);
      const remaining = templates.filter((t) => t.id !== id);
      setTemplates(remaining);
      if (remaining.length > 0) selectTemplate(remaining[0]);
      else setActiveTemplate(null);
    }
  };

  return (
    <Shell>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Description Template Studio</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200">
                #RANDOM# Generator
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Create reusable description templates with dynamic recipient token resolution and unique security codes.
            </p>
          </div>
          <button
            onClick={handleCreateNew}
            className="px-4 py-2.5 rounded-xl bg-linear-to-r from-blue-600 to-cyan-600 text-white text-sm font-semibold hover:opacity-95 transition-all shadow-md shadow-blue-600/20 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            New Description Template
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Template List */}
          <div className="lg:col-span-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-2">
              Available Templates ({templates.length})
            </h2>

            <div className="space-y-2">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  onClick={() => selectTemplate(tpl)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    activeTemplate?.id === tpl.id
                      ? 'border-cyan-500 bg-cyan-50/50 shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-sm">{tpl.name}</span>
                    <Edit3 className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2 mt-1 font-sans">{tpl.content}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Editor & Live Preview Split */}
          {activeTemplate && (
            <div className="lg:col-span-8 space-y-6">
              {/* Editor Box */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Code className="h-4 w-4 text-cyan-600" />
                    Template Editor
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDuplicate(activeTemplate.id)}
                      className="px-3 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-200 flex items-center gap-1.5"
                      title="Duplicate Template"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Duplicate
                    </button>
                    <button
                      onClick={() => handleDelete(activeTemplate.id)}
                      className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg"
                      title="Delete Template"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={handleSave}
                      className="px-4 py-2 bg-linear-to-r from-blue-600 to-cyan-600 text-white text-xs font-semibold rounded-lg hover:opacity-95 flex items-center gap-1.5 shadow-xs"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Save Template
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Template Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Description / Category
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2"
                    />
                  </div>

                  {/* Variable Pills */}
                  <div>
                    <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Click to Insert Dynamic Variable Tag:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {AVAILABLE_VARIABLES.map((v) => (
                        <button
                          key={v.tag}
                          type="button"
                          onClick={() => insertVariable(v.tag)}
                          className="px-2.5 py-1.5 rounded-lg bg-cyan-50 hover:bg-cyan-100 text-cyan-900 border border-cyan-200 text-xs font-mono font-semibold transition-all hover:scale-[1.02] flex items-center gap-1.5 shadow-2xs"
                          title={`${v.label} (Example: ${v.example})`}
                        >
                          <span className="text-sm">{v.symbol}</span>
                          <span className="font-bold">{v.tag}</span>
                          <span className="text-[10px] text-cyan-600 font-sans">({v.label})</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Description Body Content
                    </label>
                    <textarea
                      rows={8}
                      value={content}
                      onChange={(e) => handleContentChange(e.target.value)}
                      className="w-full font-mono text-xs border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 leading-relaxed"
                    />
                  </div>
                </div>
              </div>

              {/* Live Preview Panel */}
              <div className="bg-slate-900 text-slate-100 p-6 rounded-2xl border border-slate-800 shadow-lg space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-cyan-400" />
                    <h3 className="text-sm font-bold text-white">Live Variable Resolution Preview</h3>
                  </div>
                  <button
                    onClick={() => updatePreview(content)}
                    className="flex items-center gap-1 text-[11px] font-mono text-cyan-400 bg-slate-800 px-2 py-1 rounded hover:bg-slate-700 transition-colors"
                  >
                    <RefreshCw className="h-3 w-3" /> Regenerate #RANDOM#
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  {previewData && (
                    <div className="flex items-center gap-2 text-xs text-cyan-300 bg-cyan-950/60 p-2.5 rounded-lg border border-cyan-800">
                      <Sparkles className="h-4 w-4 text-cyan-400 shrink-0" />
                      <span>
                        Simulated Code for recipient: <strong>{previewData.randomCodeGenerated}</strong> (generated freshly for every recipient)
                      </span>
                    </div>
                  )}

                  <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 font-mono whitespace-pre-wrap leading-relaxed text-slate-300">
                    <span className="text-slate-500 uppercase text-[10px] font-bold block mb-2">Resolved pCloud Share Message:</span>
                    {previewData ? previewData.resolvedPreview : content}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
