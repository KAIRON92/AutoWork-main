"use client";

import { useState, useEffect } from 'react';
import { Shell } from '@/components/layout/shell';
import { contactsService } from '@/services/contactsService';
import { Contact, ContactList } from '@/types';
import {
  Users,
  Plus,
  Search,
  FileSpreadsheet,
  Mail,
  Phone,
  Building2,
  UserPlus,
  Trash2,
  FolderSync,
  Tag,
} from 'lucide-react';
import Link from 'next/link';

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [isListModalOpen, setIsListModalOpen] = useState(false);

  // New Contact state
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [target, setTarget] = useState('');

  // New List state
  const [listName, setListName] = useState('');
  const [listDesc, setListDesc] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [cnts, lsts] = await Promise.all([
        contactsService.getAllContacts(search),
        contactsService.getAllLists(),
      ]);
      setContacts(cnts);
      setLists(lsts);
    } catch (e: any) {
      console.warn('Contacts data sync notice:', e?.message || e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search]);

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    try {
      const newC = await contactsService.createContact({
        email,
        firstName,
        lastName,
        phone,
        company,
        target,
      });
      setContacts([newC, ...contacts]);
      setIsContactModalOpen(false);
      setEmail('');
      setFirstName('');
      setLastName('');
      setPhone('');
      setCompany('');
      setTarget('');
    } catch (err: any) {
      alert(`Create contact error: ${err.message}`);
    }
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listName) return;
    try {
      const newList = await contactsService.createContactList(listName, listDesc);
      setLists([newList, ...lists]);
      setIsListModalOpen(false);
      setListName('');
      setListDesc('');
    } catch (err: any) {
      alert(`Create list error: ${err.message}`);
    }
  };

  const handleDeleteContact = async (id: string) => {
    if (confirm('Are you sure you want to delete this contact?')) {
      await contactsService.deleteContact(id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
    }
  };

  const handleDeleteList = async (id: string) => {
    if (confirm('Are you sure you want to delete this audience list?')) {
      await contactsService.deleteContactList(id);
      setLists((prev) => prev.filter((l) => l.id !== id));
    }
  };

  return (
    <Shell>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Contacts & Audiences</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200">
                Directory
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Manage recipient databases, audience list groupings, and dynamic variable tokens for pCloud distributions.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsListModalOpen(true)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-sm font-semibold hover:bg-slate-100 transition-colors flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              New List
            </button>
            <button
              onClick={() => setIsContactModalOpen(true)}
              className="px-4 py-2.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 transition-colors flex items-center gap-2"
            >
              <UserPlus className="h-4 w-4" />
              Add Contact
            </button>
            <Link
              href="/imports"
              className="px-4 py-2.5 rounded-xl bg-linear-to-r from-blue-600 to-cyan-600 text-white text-sm font-semibold hover:opacity-95 transition-all shadow-md shadow-blue-600/20 flex items-center gap-2"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Import Wizard
            </Link>
          </div>
        </div>

        {/* Contact Lists Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {lists.map((lst) => (
            <div
              key={lst.id}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between hover:border-slate-300 transition-all"
            >
              <div>
                <h3 className="font-bold text-slate-900 text-base">{lst.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{lst.description || 'Audience recipient list'}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-full bg-cyan-50 text-cyan-800 border border-cyan-200 text-xs font-bold">
                  {lst.memberCount || 0} Members
                </span>
                <button
                  onClick={() => handleDeleteList(lst.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                  title="Delete List"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Contacts Data Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
            <div className="relative w-80">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, email, company, target..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-xs bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            <span className="text-xs font-semibold text-slate-500">
              {contacts.length} Total Contacts
            </span>
          </div>

          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-100/60 text-slate-500 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-6">Recipient Name</th>
                <th className="py-3.5 px-6">Email Address</th>
                <th className="py-3.5 px-6">Company / Target</th>
                <th className="py-3.5 px-6">Phone</th>
                <th className="py-3.5 px-6">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-6 font-semibold text-slate-900">
                    {c.fullName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unnamed Recipient'}
                  </td>
                  <td className="py-3.5 px-6 font-mono text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-slate-400" />
                      {c.email}
                    </span>
                  </td>
                  <td className="py-3.5 px-6 text-slate-700">
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5 text-slate-400" />
                      {c.company || c.target || '—'}
                    </span>
                  </td>
                  <td className="py-3.5 px-6 text-slate-600">
                    {c.phone ? (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                        {c.phone}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-3.5 px-6">
                    <button
                      onClick={() => handleDeleteContact(c.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                      title="Delete Contact"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Modal: Add Contact */}
        {isContactModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
              <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">
                Add Individual Contact
              </h3>
              <form onSubmit={handleCreateContact} className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="contact@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">First Name</label>
                    <input
                      type="text"
                      placeholder="Sarah"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2.5"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Last Name</label>
                    <input
                      type="text"
                      placeholder="Connor"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2.5"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Company / Organization</label>
                  <input
                    type="text"
                    placeholder="Cyberdyne Systems"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Target / Department</label>
                  <input
                    type="text"
                    placeholder="Strategic Cloud Infrastructure"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="+1 555-0192"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5"
                  />
                </div>
                <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsContactModalOpen(false)}
                    className="px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-linear-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-semibold hover:opacity-95 shadow-xs"
                  >
                    Save Contact
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: New List */}
        {isListModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
              <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">
                Create Contact List
              </h3>
              <form onSubmit={handleCreateList} className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">List Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Q3 Enterprise Leads"
                    value={listName}
                    onChange={(e) => setListName(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Description</label>
                  <textarea
                    placeholder="Optional details..."
                    value={listDesc}
                    onChange={(e) => setListDesc(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5"
                  />
                </div>
                <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsListModalOpen(false)}
                    className="px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-linear-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-semibold hover:opacity-95 shadow-xs"
                  >
                    Create List
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
