import React, { useState, useMemo, useEffect } from 'react';
import { StaffUser, ProductCategory, StaffRole, RolePermissions } from '../../types';
import { 
  Settings, 
  Plus, 
  Save, 
  X, 
  DollarSign, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  Users, 
  Trash2,
  Award,
  Lock,
  Eye,
  ShieldCheck,
  Info
} from 'lucide-react';
import { initialStaffUsers } from '../../data/initialData';
import { getEffectiveUserPermissions } from '../../utils/permissionUtils';

const PRODUCT_CATEGORIES: { id: ProductCategory; label: string }[] = [
  { id: 'brand_new_phones', label: 'Brand New Phones' },
  { id: 'pre_owned_phones', label: 'Pre-Owned Phones' },
  { id: 'accessories_gadgets', label: 'Accessories & Gadgets' },
  { id: 'sim_cards', label: 'SIM Cards & Topup' },
  { id: 'cookware', label: 'Cookware' }
];

interface CategoryKpi {
  isSelected: boolean;
  incentiveRate: number;
}

interface KpiSettings {
  [categoryId: string]: CategoryKpi;
}

type MonthlyKpiSettings = Record<string, KpiSettings>; // key is YYYY-MM

interface PayrollRecord {
  id: string;
  staffId: string;
  period: string; // YYYY-MM
  basicSalary: number;
  attendanceBonus: number;
  fineLate: number;
  fineAbsent: number;
  savingsDeduction: number;
  reviewFeedback: string;
  kpiAchieved: {
    [categoryId: string]: boolean;
  };
  isPaid: boolean;
}

interface StaffPayrollDashboardProps {
  staffUsers?: StaffUser[];
  currentStaffUser?: StaffUser;
  rolePermissions?: Record<StaffRole, RolePermissions>;
}

export function StaffPayrollDashboard({ 
  staffUsers = initialStaffUsers,
  currentStaffUser,
  rolePermissions
}: StaffPayrollDashboardProps) {
  const [selectedStaffId, setSelectedStaffId] = useState<string>(staffUsers[0]?.id || '');
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // JSON State Object for KPI Settings keyed by month
  const [allKpiSettings, setAllKpiSettings] = useState<MonthlyKpiSettings>({});
  
  // Local state for modal before saving
  const [kpiModalMonth, setKpiModalMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [draftKpiSettings, setDraftKpiSettings] = useState<KpiSettings>({});
  
  // Array of payroll records with persistent storage
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>(() => {
    try {
      const stored = localStorage.getItem('staff_payroll_records');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return [
      {
        id: 'pay-001',
        staffId: staffUsers[0]?.id || 'staff-1',
        period: '2026-09',
        basicSalary: 300000,
        attendanceBonus: 50000,
        fineLate: 10000,
        fineAbsent: 0,
        savingsDeduction: 20000,
        reviewFeedback: 'Great performance this month.',
        kpiAchieved: {
          'brand_new_phones': true,
          'pre_owned_phones': false,
          'accessories_gadgets': true,
          'sim_cards': true,
          'cookware': false
        },
        isPaid: false
      },
      {
        id: 'pay-002',
        staffId: staffUsers[0]?.id || 'staff-1',
        period: '2026-08',
        basicSalary: 300000,
        attendanceBonus: 50000,
        fineLate: 0,
        fineAbsent: 0,
        savingsDeduction: 20000,
        reviewFeedback: 'Solid performance, no lates.',
        kpiAchieved: {
          'brand_new_phones': true,
          'pre_owned_phones': false,
          'accessories_gadgets': true,
          'sim_cards': true,
          'cookware': false
        },
        isPaid: true
      }
    ];
  });

  // Calculate user permissions
  const effectivePerms = useMemo(() => {
    return getEffectiveUserPermissions(currentStaffUser, rolePermissions);
  }, [currentStaffUser, rolePermissions]);

  const isOwner = currentStaffUser?.role === 'Owner';
  const isManager = currentStaffUser?.role === 'Manager';
  const canManagePayroll = Boolean(isOwner || effectivePerms.canManagePayroll);
  const canManageKpi = Boolean(isOwner || effectivePerms.canManageKpiSettings);
  const canViewPayroll = Boolean(isOwner || isManager || effectivePerms.canViewPayroll || canManagePayroll);

  // Save payroll records to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('staff_payroll_records', JSON.stringify(payrollRecords));
    } catch (e) {
      console.error(e);
    }
  }, [payrollRecords]);

  // Load KPI settings from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('staff_monthly_kpi_settings');
      if (stored) {
        setAllKpiSettings(JSON.parse(stored));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const openModal = () => {
    const defaultMonth = new Date().toISOString().slice(0, 7);
    setKpiModalMonth(defaultMonth);
    setDraftKpiSettings(allKpiSettings[defaultMonth] || {});
    setIsModalOpen(true);
  };

  const handleModalMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMonth = e.target.value;
    setKpiModalMonth(newMonth);
    setDraftKpiSettings(allKpiSettings[newMonth] || {});
  };

  const handleSaveKpiSettings = () => {
    if (!canManageKpi) {
      alert('Permission Denied: Your account does not have "Configure Monthly Category KPIs" permission.');
      return;
    }
    const updatedSettings = { ...allKpiSettings, [kpiModalMonth]: draftKpiSettings };
    setAllKpiSettings(updatedSettings);
    try {
      localStorage.setItem('staff_monthly_kpi_settings', JSON.stringify(updatedSettings));
    } catch (e) {
      console.error(e);
    }
    setIsModalOpen(false);
  };

  const toggleCategory = (categoryId: string) => {
    if (!canManageKpi) return;
    setDraftKpiSettings(prev => {
      const existing = prev[categoryId] || { isSelected: false, incentiveRate: 0 };
      return {
        ...prev,
        [categoryId]: {
          ...existing,
          isSelected: !existing.isSelected
        }
      };
    });
  };

  const updateIncentiveRate = (categoryId: string, rate: number) => {
    if (!canManageKpi) return;
    setDraftKpiSettings(prev => {
      const existing = prev[categoryId] || { isSelected: false, incentiveRate: 0 };
      return {
        ...prev,
        [categoryId]: {
          ...existing,
          incentiveRate: rate
        }
      };
    });
  };

  const addPayrollRow = () => {
    if (!canManagePayroll) {
      alert('Permission Denied: Your role lacks "Process Staff Payroll & Disburse Pay" permission.');
      return;
    }
    const newRecord: PayrollRecord = {
      id: `pay-${Date.now()}`,
      staffId: selectedStaffId,
      period: new Date().toISOString().slice(0, 7),
      basicSalary: 300000,
      attendanceBonus: 0,
      fineLate: 0,
      fineAbsent: 0,
      savingsDeduction: 0,
      reviewFeedback: '',
      kpiAchieved: {},
      isPaid: false
    };
    setPayrollRecords([newRecord, ...payrollRecords]);
  };

  const deletePayrollRow = (id: string) => {
    if (!canManagePayroll) {
      alert('Permission Denied: Deleting salary statements requires "Process Staff Payroll & Disburse Pay" permission.');
      return;
    }
    setPayrollRecords(payrollRecords.filter(r => r.id !== id));
  };

  const updateRecord = (id: string, field: keyof PayrollRecord, value: any) => {
    if (!canManagePayroll) return;
    setPayrollRecords(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const toggleKpiAchieved = (id: string, catId: string, isAchieved: boolean) => {
    if (!canManagePayroll) return;
    setPayrollRecords(prev => prev.map(r => {
      if (r.id === id) {
        return { ...r, kpiAchieved: { ...r.kpiAchieved, [catId]: isAchieved } };
      }
      return r;
    }));
  };

  // Filter records by selected staff
  const staffRecords = useMemo(() => {
    return payrollRecords
      .filter(r => r.staffId === selectedStaffId)
      .sort((a, b) => b.period.localeCompare(a.period));
  }, [payrollRecords, selectedStaffId]);

  // Determine active dynamic columns across displayed records
  const activeKpiCategories = useMemo(() => {
    const activeIds = new Set<string>();
    
    // Check if any displayed record has a KPI setting enabled
    staffRecords.forEach(record => {
      const monthSettings = allKpiSettings[record.period] || {};
      Object.entries(monthSettings).forEach(([catId, cat]) => {
        if (cat.isSelected) activeIds.add(catId);
      });
    });
    
    return PRODUCT_CATEGORIES.filter(cat => activeIds.has(cat.id));
  }, [allKpiSettings, staffRecords]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <Users className="w-6 h-6 text-indigo-600" />
              Staff Payroll & KPI Dashboard
            </h1>
            {canManagePayroll ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <Award className="w-3.5 h-3.5 text-emerald-600" />
                Full Payroll & KPI Scope
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                <Eye className="w-3.5 h-3.5 text-amber-600" />
                View-Only Scope
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">Manage basic salary, track attendance, and set custom category incentives by month.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-bold text-slate-700">Staff:</label>
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {staffUsers.map(staff => (
                <option key={staff.id} value={staff.id}>{staff.name} ({staff.role})</option>
              ))}
            </select>
          </div>
          
          <button
            onClick={openModal}
            className={`flex items-center gap-2 px-4 py-2 text-white rounded-xl text-sm font-bold transition-colors shadow-sm cursor-pointer ${
              canManageKpi 
                ? 'bg-indigo-600 hover:bg-indigo-700' 
                : 'bg-slate-700 hover:bg-slate-800'
            }`}
            title={canManageKpi ? 'Configure Monthly KPI Targets & Rates' : 'Review KPI Settings (View Only)'}
          >
            {canManageKpi ? <Settings className="w-4 h-4" /> : <Lock className="w-4 h-4 text-amber-300" />}
            KPI Settings
          </button>
        </div>
      </div>

      {!canManagePayroll && (
        <div className="p-3.5 bg-amber-50/90 border border-amber-200 rounded-2xl flex items-center justify-between gap-3 text-xs text-amber-900 font-medium">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>View-Only Permission:</strong> You are authorized to review staff payroll statements, attendance, and KPI bonuses. Modifying salary numbers or finalizing payouts requires <strong>Process Staff Payroll & Disburse Pay</strong> in the Permission & Functional Scope matrix.
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-900 text-lg">Monthly Payroll Records</h3>
        {canManagePayroll ? (
          <button
            onClick={addPayrollRow}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Month
          </button>
        ) : (
          <span className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            Add Month Restricted
          </span>
        )}
      </div>

      {/* Dynamic Payroll Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="p-4 font-bold" rowSpan={2}>Date (Month)</th>
                <th className="p-4 font-bold text-right" rowSpan={2}>Basic Salary</th>
                <th className="p-4 font-bold text-right" rowSpan={2}>Att. Bonus</th>
                
                {/* Dynamic KPI Columns Header Group */}
                {activeKpiCategories.length > 0 && (
                  <th className="p-4 font-bold text-center border-x border-slate-200 bg-indigo-50/50" colSpan={activeKpiCategories.length}>
                    KPI Incentives
                  </th>
                )}
                
                <th className="p-4 font-bold text-right text-rose-600" rowSpan={2}>Late Fine</th>
                <th className="p-4 font-bold text-right text-rose-600" rowSpan={2}>Absent Fine</th>
                <th className="p-4 font-bold text-right text-amber-600" rowSpan={2}>Savings Ded.</th>
                <th className="p-4 font-bold text-right text-emerald-600" rowSpan={2}>Total Salary</th>
                <th className="p-4 font-bold" rowSpan={2}>Review & Feedback</th>
                <th className="p-4 font-bold text-center" rowSpan={2}>Status</th>
                <th className="p-4 font-bold text-center" rowSpan={2}></th>
              </tr>
              {activeKpiCategories.length > 0 && (
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  {activeKpiCategories.map(cat => (
                    <th key={cat.id} className="px-4 py-2 font-bold text-right text-indigo-700 border-r border-slate-200 last:border-r-0 bg-indigo-50/50 text-[11px]">
                      {cat.label}
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staffRecords.length === 0 && (
                <tr>
                  <td colSpan={10 + activeKpiCategories.length} className="p-8 text-center text-slate-400 font-medium">
                    No payroll records for this staff. Click "Add Month" to begin.
                  </td>
                </tr>
              )}
              {staffRecords.map(record => {
                const monthKpi = allKpiSettings[record.period] || {};
                
                // Calculate dynamic KPI total
                let kpiEarnings = 0;
                Object.keys(monthKpi).forEach(catId => {
                  if (monthKpi[catId].isSelected) {
                    const rate = monthKpi[catId].incentiveRate || 0;
                    const isAchieved = record.kpiAchieved?.[catId] || false;
                    if (isAchieved) {
                      kpiEarnings += rate;
                    }
                  }
                });

                const totalSalary = record.basicSalary 
                                  + record.attendanceBonus 
                                  + kpiEarnings 
                                  - record.fineLate 
                                  - record.fineAbsent 
                                  - record.savingsDeduction;

                return (
                  <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3">
                      <input 
                        type="month" 
                        value={record.period}
                        disabled={!canManagePayroll}
                        onChange={(e) => updateRecord(record.id, 'period', e.target.value)}
                        className={`border rounded-lg px-2 py-1 font-semibold text-xs ${
                          canManagePayroll 
                            ? 'bg-transparent border-slate-200 focus:border-indigo-500 focus:outline-none text-slate-900 cursor-pointer hover:bg-white' 
                            : 'bg-slate-50 border-transparent text-slate-600 cursor-not-allowed'
                        }`}
                      />
                    </td>
                    
                    <td className="p-3 text-right">
                      {canManagePayroll ? (
                        <input type="number" value={record.basicSalary || ''} onChange={(e) => updateRecord(record.id, 'basicSalary', Number(e.target.value))} className="w-24 text-right bg-transparent border-b border-slate-200 focus:border-indigo-500 focus:outline-none font-semibold" />
                      ) : (
                        <span className="font-semibold text-slate-800">{record.basicSalary.toLocaleString()}</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {canManagePayroll ? (
                        <input type="number" value={record.attendanceBonus || ''} onChange={(e) => updateRecord(record.id, 'attendanceBonus', Number(e.target.value))} className="w-20 text-right bg-transparent border-b border-slate-200 focus:border-indigo-500 focus:outline-none font-semibold text-emerald-600" />
                      ) : (
                        <span className="font-semibold text-emerald-600">{(record.attendanceBonus || 0).toLocaleString()}</span>
                      )}
                    </td>

                    {/* Dynamic KPI earnings cells */}
                    {activeKpiCategories.map(cat => {
                      const isActiveInMonth = monthKpi[cat.id]?.isSelected;
                      const rate = isActiveInMonth ? (monthKpi[cat.id].incentiveRate || 0) : 0;
                      const isAchieved = record.kpiAchieved?.[cat.id] || false;
                      const earned = isAchieved ? rate : 0;
                      
                      return (
                        <td key={cat.id} className={`p-3 text-right border-x border-slate-100 ${isActiveInMonth ? 'bg-indigo-50/20' : 'bg-slate-50/50'}`}>
                          {isActiveInMonth ? (
                            <div className="flex flex-col items-end gap-1">
                              <span className="font-bold text-indigo-700">{earned.toLocaleString()}</span>
                              <label className={`flex items-center gap-1.5 px-2 py-0.5 rounded transition-colors text-[10px] mt-1 ${canManagePayroll ? 'cursor-pointer hover:bg-white/50' : 'cursor-not-allowed opacity-80'}`}>
                                <input 
                                  type="checkbox"
                                  checked={isAchieved}
                                  disabled={!canManagePayroll}
                                  onChange={(e) => toggleKpiAchieved(record.id, cat.id, e.target.checked)}
                                  className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                />
                                <span className="font-semibold text-slate-500 uppercase tracking-wider">Met Target</span>
                              </label>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Not set</span>
                          )}
                        </td>
                      );
                    })}

                    <td className="p-3 text-right">
                      {canManagePayroll ? (
                        <input type="number" value={record.fineLate || ''} onChange={(e) => updateRecord(record.id, 'fineLate', Number(e.target.value))} className="w-20 text-right bg-transparent border-b border-slate-200 focus:border-rose-500 focus:outline-none font-semibold text-rose-600" />
                      ) : (
                        <span className="font-semibold text-rose-600">{(record.fineLate || 0).toLocaleString()}</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {canManagePayroll ? (
                        <input type="number" value={record.fineAbsent || ''} onChange={(e) => updateRecord(record.id, 'fineAbsent', Number(e.target.value))} className="w-20 text-right bg-transparent border-b border-slate-200 focus:border-rose-500 focus:outline-none font-semibold text-rose-600" />
                      ) : (
                        <span className="font-semibold text-rose-600">{(record.fineAbsent || 0).toLocaleString()}</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {canManagePayroll ? (
                        <input type="number" value={record.savingsDeduction || ''} onChange={(e) => updateRecord(record.id, 'savingsDeduction', Number(e.target.value))} className="w-20 text-right bg-transparent border-b border-slate-200 focus:border-amber-500 focus:outline-none font-semibold text-amber-600" />
                      ) : (
                        <span className="font-semibold text-amber-600">{(record.savingsDeduction || 0).toLocaleString()}</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <span className="font-black text-emerald-600 text-base">{totalSalary.toLocaleString()}</span>
                    </td>
                    <td className="p-3">
                      {canManagePayroll ? (
                        <input type="text" placeholder="Add notes..." value={record.reviewFeedback || ''} onChange={(e) => updateRecord(record.id, 'reviewFeedback', e.target.value)} className="w-48 bg-transparent border-b border-slate-200 focus:border-indigo-500 focus:outline-none text-xs text-slate-600 placeholder:text-slate-300" />
                      ) : (
                        <span className="text-xs text-slate-600 italic">{record.reviewFeedback || '—'}</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {canManagePayroll ? (
                        <label className="flex items-center justify-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={record.isPaid} 
                            onChange={(e) => updateRecord(record.id, 'isPaid', e.target.checked)}
                            className="w-5 h-5 text-indigo-600 rounded-md border-slate-300 focus:ring-indigo-500" 
                          />
                        </label>
                      ) : (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                          record.isPaid 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {record.isPaid ? 'Paid' : 'Pending'}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {canManagePayroll && (
                        <button onClick={() => deletePayrollRow(record.id)} className="text-slate-400 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* KPI Incentive Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black tracking-tight flex items-center gap-2">
                  Configure KPI Incentives
                  {!canManageKpi && (
                    <span className="text-[10px] bg-amber-400/20 text-amber-300 border border-amber-300/30 px-2 py-0.5 rounded-full font-bold">
                      View Only
                    </span>
                  )}
                </h3>
                <p className="text-xs text-indigo-200 mt-1">Set a fixed flat bonus for achieving target in a specific month.</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              {!canManageKpi && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-900 font-medium">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    You have view-only access to KPI settings. Configuring incentive rates requires <strong>Configure Monthly Category KPIs</strong> permission.
                  </span>
                </div>
              )}

              {/* Date Picker Header */}
              <div className="flex items-center justify-between bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-indigo-600" />
                  <span className="font-bold text-indigo-900 text-sm">Target Month</span>
                </div>
                <input 
                  type="month"
                  value={kpiModalMonth}
                  onChange={handleModalMonthChange}
                  className="bg-white border border-indigo-200 text-indigo-900 font-bold px-3 py-1.5 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm cursor-pointer"
                />
              </div>

              <div className="space-y-3">
                {PRODUCT_CATEGORIES.map(cat => {
                  const isSelected = draftKpiSettings[cat.id]?.isSelected || false;
                  const rate = draftKpiSettings[cat.id]?.incentiveRate || 0;
                  
                  return (
                    <div key={cat.id} className={`p-4 rounded-2xl border transition-colors ${isSelected ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200 bg-slate-50'}`}>
                      <div className="flex items-center justify-between">
                        <label className={`flex items-center gap-3 select-none flex-1 ${canManageKpi ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!canManageKpi}
                            onChange={() => toggleCategory(cat.id)}
                            className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                          />
                          <span className={`font-bold text-sm ${isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>
                            {cat.label}
                          </span>
                        </label>
                        
                        {isSelected && (
                          <div className="flex items-center gap-2 animate-in fade-in duration-200">
                            <span className="text-xs font-bold text-slate-500">Rate:</span>
                            <div className="relative">
                              <input
                                type="number"
                                value={rate || ''}
                                disabled={!canManageKpi}
                                onChange={(e) => updateIncentiveRate(cat.id, Number(e.target.value))}
                                placeholder="0"
                                className={`w-[151px] pl-3 pr-8 py-1.5 text-sm font-black text-slate-900 bg-white border border-indigo-200 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none shadow-sm ${
                                  !canManageKpi ? 'bg-slate-100 cursor-not-allowed' : ''
                                }`}
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                                Ks
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 font-bold text-sm text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
              {canManageKpi && (
                <button
                  onClick={handleSaveKpiSettings}
                  className="px-5 py-2 font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  Save Settings for {new Date(kpiModalMonth + '-01').toLocaleDateString('default', { month: 'short', year: 'numeric' })}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

