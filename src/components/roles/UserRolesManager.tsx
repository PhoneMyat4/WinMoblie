import React, { useState, useMemo } from 'react';
import { 
  Users, 
  ShieldCheck, 
  KeyRound, 
  UserPlus, 
  Edit3, 
  Trash2, 
  Check, 
  X, 
  Lock, 
  Unlock, 
  Smartphone, 
  Phone, 
  Mail, 
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Save,
  Sliders,
  Eye,
  Search,
  CheckSquare,
  Square,
  ShieldAlert,
  Info,
  Sparkles,
  UserCheck,
  UserX,
  Layers,
  ArrowRight,
  Clock
} from 'lucide-react';
import { StaffUser, StaffRole, RolePermissions, ShopSettings } from '../../types';
import { getRoleBadgeClass } from '../../utils/formatters';
import { 
  DEFAULT_ROLE_PERMISSIONS, 
  PERMISSION_CATEGORIES, 
  PERMISSION_DEFINITIONS,
  PermissionDefinition,
  getEffectiveUserPermissions
} from '../../utils/permissionUtils';
import { formatTime12Hour, checkStaffWorkingHoursAccess } from '../../utils/workingHours';

interface UserRolesManagerProps {
  staffUsers: StaffUser[];
  settings: ShopSettings;
  rolePermissions: Record<StaffRole, RolePermissions>;
  onSaveStaffUser: (user: StaffUser) => void;
  onDeleteStaffUser: (id: string) => void;
  onSwitchActiveStaff: (user: StaffUser) => void;
  onSaveRolePermissions: (permissions: Record<StaffRole, RolePermissions>) => void;
  onResetRolePermissions: (role?: StaffRole) => void;
}

type SubTab = 'matrix' | 'staff' | 'user_overrides' | 'simulator';

export const UserRolesManager: React.FC<UserRolesManagerProps> = ({
  staffUsers,
  settings,
  rolePermissions,
  onSaveStaffUser,
  onDeleteStaffUser,
  onSwitchActiveStaff,
  onSaveRolePermissions,
  onResetRolePermissions,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('matrix');
  const [selectedRoleTab, setSelectedRoleTab] = useState<StaffRole>('Cashier');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Local draft state for Role Permissions Matrix to allow editing before saving
  const [matrixDraft, setMatrixDraft] = useState<Record<StaffRole, RolePermissions>>(rolePermissions);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Sync draft if prop changes and no unsaved changes
  React.useEffect(() => {
    if (!hasUnsavedChanges) {
      setMatrixDraft(rolePermissions);
    }
  }, [rolePermissions, hasUnsavedChanges]);

  // Modal States
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffUser | null>(null);
  const [overrideUserModal, setOverrideUserModal] = useState<StaffUser | null>(null);

  // Form State for Add/Edit Staff User
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<StaffRole>('Cashier');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [active, setActive] = useState(true);
  const [restrictWorkingHours, setRestrictWorkingHours] = useState(false);
  const [workStartTime, setWorkStartTime] = useState('07:30');
  const [workEndTime, setWorkEndTime] = useState('19:00');

  // Switcher PIN verification modal
  const [switchingToUser, setSwitchingToUser] = useState<StaffUser | null>(null);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);

  // Simulator State
  const [simulatedStaffId, setSimulatedStaffId] = useState<string>(
    settings.currentStaffId || staffUsers[0]?.id || 'staff-1'
  );

  const activeStaffUser = useMemo(() => {
    return staffUsers.find(u => u.id === settings.currentStaffId) || staffUsers[0];
  }, [staffUsers, settings.currentStaffId]);

  const simulatedUser = useMemo(() => {
    return staffUsers.find(u => u.id === simulatedStaffId) || activeStaffUser;
  }, [staffUsers, simulatedStaffId, activeStaffUser]);

  const effectiveSimulatedPerms = useMemo(() => {
    return getEffectiveUserPermissions(simulatedUser, matrixDraft);
  }, [simulatedUser, matrixDraft]);

  // Filtered permission definitions
  const filteredPermissions = useMemo(() => {
    return PERMISSION_DEFINITIONS.filter(def => {
      const matchesCat = selectedCategoryFilter === 'all' || def.category === selectedCategoryFilter;
      const matchesSearch = !searchQuery.trim() || 
        def.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        def.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
        def.categoryLabel.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [selectedCategoryFilter, searchQuery]);

  // Handle toggling permission in matrix
  const handleTogglePermission = (targetRole: StaffRole, permKey: keyof RolePermissions) => {
    setMatrixDraft(prev => {
      const currentVal = Boolean(prev[targetRole]?.[permKey]);
      const updatedRolePerms: RolePermissions = {
        ...prev[targetRole],
        [permKey]: !currentVal,
      };
      return {
        ...prev,
        [targetRole]: updatedRolePerms,
      };
    });
    setHasUnsavedChanges(true);
  };

  // Handle Enable All / Disable All for a role
  const handleSetAllForRole = (targetRole: StaffRole, enable: boolean) => {
    setMatrixDraft(prev => {
      const updated: RolePermissions = { ...prev[targetRole] };
      PERMISSION_DEFINITIONS.forEach(p => {
        (updated as any)[p.key] = enable;
      });
      return {
        ...prev,
        [targetRole]: updated,
      };
    });
    setHasUnsavedChanges(true);
  };

  // Reset a specific role or all roles to default
  const handleResetRoleDraft = (targetRole?: StaffRole) => {
    if (targetRole) {
      setMatrixDraft(prev => ({
        ...prev,
        [targetRole]: { ...DEFAULT_ROLE_PERMISSIONS[targetRole] },
      }));
    } else {
      setMatrixDraft({
        Owner: { ...DEFAULT_ROLE_PERMISSIONS.Owner },
        Manager: { ...DEFAULT_ROLE_PERMISSIONS.Manager },
        Cashier: { ...DEFAULT_ROLE_PERMISSIONS.Cashier },
        Inventory_Staff: { ...DEFAULT_ROLE_PERMISSIONS.Inventory_Staff },
      });
    }
    setHasUnsavedChanges(true);
  };

  // Save changes to storage
  const handleSaveMatrix = () => {
    onSaveRolePermissions(matrixDraft);
    setHasUnsavedChanges(false);
    setSaveSuccessMessage('Role permissions matrix successfully saved!');
    setTimeout(() => {
      setSaveSuccessMessage(null);
    }, 3500);
  };

  // Open modal to add new staff
  const handleOpenNewStaffModal = () => {
    setEditingStaff(null);
    setUsername('');
    setName('');
    setRole('Cashier');
    setPhone('');
    setEmail('');
    setPin('');
    setActive(true);
    setRestrictWorkingHours(false);
    setWorkStartTime('07:30');
    setWorkEndTime('19:00');
    setIsStaffModalOpen(true);
  };

  // Open modal to edit staff
  const handleOpenEditStaffModal = (user: StaffUser) => {
    setEditingStaff(user);
    setUsername(user.username || '');
    setName(user.name);
    setRole(user.role);
    setPhone(user.phone);
    setEmail(user.email || '');
    setPin(user.pin);
    setActive(user.active);
    setRestrictWorkingHours(user.role === 'Owner' ? false : Boolean(user.restrictWorkingHours));
    setWorkStartTime(user.workStartTime || '07:30');
    setWorkEndTime(user.workEndTime || '19:00');
    setIsStaffModalOpen(true);
  };

  const handleSaveStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !pin) {
      alert('Please provide staff name and a 4-digit security PIN.');
      return;
    }

    const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, '') || 
      name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 
      `user${Date.now().toString().slice(-4)}`;

    const isOwner = role === 'Owner';
    const newUser: StaffUser = {
      id: editingStaff ? editingStaff.id : `staff-${Date.now()}`,
      username: cleanUsername,
      name,
      role,
      phone,
      email: email || undefined,
      pin,
      password: pin,
      active,
      avatarColor: editingStaff?.avatarColor || (
        role === 'Owner' ? 'bg-purple-600' :
        role === 'Manager' ? 'bg-blue-600' :
        role === 'Inventory_Staff' ? 'bg-amber-600' : 'bg-emerald-600'
      ),
      customPermissions: editingStaff?.customPermissions,
      restrictWorkingHours: isOwner ? false : restrictWorkingHours,
      workStartTime: isOwner ? undefined : (restrictWorkingHours ? (workStartTime || '07:30') : undefined),
      workEndTime: isOwner ? undefined : (restrictWorkingHours ? (workEndTime || '19:00') : undefined),
    };

    onSaveStaffUser(newUser);
    setIsStaffModalOpen(false);
  };

  const handleVerifySwitchPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!switchingToUser) return;

    if (enteredPin === switchingToUser.pin) {
      const freshUser = staffUsers.find(u => u.id === switchingToUser.id) || switchingToUser;
      const hoursCheck = checkStaffWorkingHoursAccess(freshUser);
      if (!hoursCheck.allowed) {
        alert(hoursCheck.reason);
        setPinError(true);
        return;
      }
      onSwitchActiveStaff(freshUser);
      setSwitchingToUser(null);
      setEnteredPin('');
      setPinError(false);
    } else {
      setPinError(true);
    }
  };

  // Handle custom user override toggle
  const handleUserOverrideChange = (
    user: StaffUser,
    permKey: keyof RolePermissions,
    overrideState: 'default' | 'allow' | 'deny'
  ) => {
    const currentCustom = { ...(user.customPermissions || {}) };
    if (overrideState === 'default') {
      delete currentCustom[permKey];
    } else {
      currentCustom[permKey] = overrideState === 'allow';
    }

    const updatedUser: StaffUser = {
      ...user,
      customPermissions: Object.keys(currentCustom).length > 0 ? currentCustom : undefined,
    };

    onSaveStaffUser(updatedUser);
    if (overrideUserModal && overrideUserModal.id === user.id) {
      setOverrideUserModal(updatedUser);
    }
  };

  // Count active permissions per role
  const getRolePermCount = (targetRole: StaffRole) => {
    const roleObj = matrixDraft[targetRole] || DEFAULT_ROLE_PERMISSIONS[targetRole];
    let count = 0;
    PERMISSION_DEFINITIONS.forEach(p => {
      if (roleObj[p.key]) count++;
    });
    return count;
  };

  return (
    <div id="user-roles-manager-screen" className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* Top Banner & Stats */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="p-2 rounded-2xl bg-purple-100 text-purple-700">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Staff Roles & Permissions</h2>
            <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              Customizable Access Control
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure feature permissions for roles, manage terminal cashier PINs, and grant custom user overrides.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-right hidden lg:block pr-3 border-r border-slate-200">
            <p className="text-[10px] text-slate-400 font-bold uppercase">Active Operator</p>
            <p className="text-xs font-black text-slate-800 flex items-center justify-end gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              {settings.currentStaffName} ({settings.currentStaffRole})
            </p>
          </div>

          <button
            type="button"
            id="add-new-staff-btn"
            onClick={handleOpenNewStaffModal}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-2xl shadow-xs transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Add Staff Account</span>
          </button>
        </div>
      </div>

      {/* Sub-Tabs Bar */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab('matrix')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'matrix'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Role Permissions Matrix</span>
            {hasUnsavedChanges && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('staff')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'staff'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Staff Accounts ({staffUsers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('user_overrides')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'user_overrides'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Per-User Custom Overrides</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('simulator')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'simulator'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Live Access Audit</span>
          </button>
        </div>

        {/* Save Matrix Button if Unsaved Changes */}
        {hasUnsavedChanges && activeSubTab === 'matrix' && (
          <div className="flex items-center gap-2 animate-in fade-in">
            <span className="text-xs font-bold text-amber-600 hidden sm:inline">
              Unsaved changes!
            </span>
            <button
              type="button"
              onClick={handleSaveMatrix}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-2xl shadow-sm transition-all cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Permissions</span>
            </button>
          </div>
        )}
      </div>

      {/* Success Notification */}
      {saveSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{saveSuccessMessage}</span>
          </div>
          <button onClick={() => setSaveSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SUBTAB 1: ROLE PERMISSIONS MATRIX */}
      {activeSubTab === 'matrix' && (
        <div className="space-y-4">
          
          {/* Controls & Filter Bar */}
          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
            
            {/* Search Input */}
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search permission or keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
              <button
                type="button"
                onClick={() => setSelectedCategoryFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                  selectedCategoryFilter === 'all'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Categories ({PERMISSION_DEFINITIONS.length})
              </button>
              {PERMISSION_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategoryFilter(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                    selectedCategoryFilter === cat.id
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Reset All to Defaults */}
            <button
              type="button"
              onClick={() => {
                if (confirm('Reset all roles to recommended system default permissions?')) {
                  handleResetRoleDraft();
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0"
              title="Reset all role configurations to factory defaults"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset All to Defaults</span>
            </button>
          </div>

          {/* Permissions Matrix Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                
                {/* Table Header with Role Badges & Batch Actions */}
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                    <th className="py-4 px-6 text-xs font-black uppercase tracking-wider min-w-[260px]">
                      Permission & Functional Scope
                    </th>

                    {/* Owner Role Column */}
                    <th className="py-4 px-4 text-center min-w-[140px] border-l border-slate-200">
                      <div className="flex flex-col items-center">
                        <span className="px-2.5 py-0.5 rounded-md text-[11px] font-black bg-purple-100 text-purple-900 border border-purple-200">
                          Owner
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono mt-1">
                          {getRolePermCount('Owner')} / {PERMISSION_DEFINITIONS.length} Active
                        </span>
                        <div className="flex gap-1 mt-1 text-[9px]">
                          <button
                            type="button"
                            onClick={() => handleSetAllForRole('Owner', true)}
                            className="text-purple-600 hover:underline font-bold"
                          >
                            All
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => handleResetRoleDraft('Owner')}
                            className="text-slate-500 hover:underline"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    </th>

                    {/* Manager Role Column */}
                    <th className="py-4 px-4 text-center min-w-[140px] border-l border-slate-200">
                      <div className="flex flex-col items-center">
                        <span className="px-2.5 py-0.5 rounded-md text-[11px] font-black bg-blue-100 text-blue-900 border border-blue-200">
                          Manager
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono mt-1">
                          {getRolePermCount('Manager')} / {PERMISSION_DEFINITIONS.length} Active
                        </span>
                        <div className="flex gap-1 mt-1 text-[9px]">
                          <button
                            type="button"
                            onClick={() => handleSetAllForRole('Manager', true)}
                            className="text-blue-600 hover:underline font-bold"
                          >
                            All
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => handleSetAllForRole('Manager', false)}
                            className="text-rose-600 hover:underline font-bold"
                          >
                            None
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => handleResetRoleDraft('Manager')}
                            className="text-slate-500 hover:underline"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    </th>

                    {/* Cashier Role Column */}
                    <th className="py-4 px-4 text-center min-w-[140px] border-l border-slate-200">
                      <div className="flex flex-col items-center">
                        <span className="px-2.5 py-0.5 rounded-md text-[11px] font-black bg-emerald-100 text-emerald-900 border border-emerald-200">
                          Cashier
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono mt-1">
                          {getRolePermCount('Cashier')} / {PERMISSION_DEFINITIONS.length} Active
                        </span>
                        <div className="flex gap-1 mt-1 text-[9px]">
                          <button
                            type="button"
                            onClick={() => handleSetAllForRole('Cashier', true)}
                            className="text-emerald-600 hover:underline font-bold"
                          >
                            All
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => handleSetAllForRole('Cashier', false)}
                            className="text-rose-600 hover:underline font-bold"
                          >
                            None
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => handleResetRoleDraft('Cashier')}
                            className="text-slate-500 hover:underline"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    </th>

                    {/* Stock Controller Role Column */}
                    <th className="py-4 px-4 text-center min-w-[140px] border-l border-slate-200">
                      <div className="flex flex-col items-center">
                        <span className="px-2.5 py-0.5 rounded-md text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-200">
                          Stock Controller
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono mt-1">
                          {getRolePermCount('Inventory_Staff')} / {PERMISSION_DEFINITIONS.length} Active
                        </span>
                        <div className="flex gap-1 mt-1 text-[9px]">
                          <button
                            type="button"
                            onClick={() => handleSetAllForRole('Inventory_Staff', true)}
                            className="text-amber-700 hover:underline font-bold"
                          >
                            All
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => handleSetAllForRole('Inventory_Staff', false)}
                            className="text-rose-600 hover:underline font-bold"
                          >
                            None
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => handleResetRoleDraft('Inventory_Staff')}
                            className="text-slate-500 hover:underline"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    </th>
                  </tr>
                </thead>

                {/* Table Body with Grouped Permissions */}
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredPermissions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No permissions matched your search filter.
                      </td>
                    </tr>
                  ) : (
                    filteredPermissions.map((def) => {
                      const roles: StaffRole[] = ['Owner', 'Manager', 'Cashier', 'Inventory_Staff'];

                      return (
                        <tr key={def.key} className="hover:bg-slate-50/70 transition-colors">
                          
                          {/* Permission info */}
                          <td className="py-3.5 px-6">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-extrabold text-slate-900 text-sm">
                                    {def.label}
                                  </span>
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                    {def.categoryLabel}
                                  </span>
                                  {def.riskLevel === 'critical' && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                      High Security
                                    </span>
                                  )}
                                </div>
                                <p className="text-slate-500 text-[11px] mt-0.5 leading-relaxed max-w-xl">
                                  {def.desc}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Role Toggle Checkboxes */}
                          {roles.map((r) => {
                            const isChecked = Boolean(matrixDraft[r]?.[def.key]);

                            return (
                              <td 
                                key={r} 
                                className="py-3 px-4 text-center border-l border-slate-100 align-middle"
                              >
                                <button
                                  type="button"
                                  onClick={() => handleTogglePermission(r, def.key)}
                                  className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                                    isChecked
                                      ? r === 'Owner'
                                        ? 'bg-purple-100 text-purple-900 hover:bg-purple-200 border border-purple-300'
                                        : r === 'Manager'
                                        ? 'bg-blue-100 text-blue-900 hover:bg-blue-200 border border-blue-300'
                                        : r === 'Cashier'
                                        ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200 border border-emerald-300'
                                        : 'bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300'
                                      : 'bg-slate-100 text-slate-400 hover:bg-slate-200 border border-slate-200'
                                  }`}
                                  title={`Toggle ${def.label} for ${r.replace('_', ' ')}`}
                                >
                                  {isChecked ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-current shrink-0" />
                                      <span>Allowed</span>
                                    </>
                                  ) : (
                                    <>
                                      <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                      <span>Restricted</span>
                                    </>
                                  )}
                                </button>
                              </td>
                            );
                          })}

                        </tr>
                      );
                    })
                  )}
                </tbody>

              </table>
            </div>

            {/* Matrix Footer Action Bar */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Info className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>
                  Changes take effect immediately across all terminal stations once saved.
                </span>
              </div>

              <div className="flex items-center gap-2">
                {hasUnsavedChanges && (
                  <button
                    type="button"
                    onClick={() => {
                      setMatrixDraft(rolePermissions);
                      setHasUnsavedChanges(false);
                    }}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Discard Changes
                  </button>
                )}
                <button
                  type="button"
                  id="save-permissions-matrix-btn"
                  onClick={handleSaveMatrix}
                  className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer ${
                    hasUnsavedChanges
                      ? 'bg-purple-600 hover:bg-purple-700 text-white ring-2 ring-purple-300 animate-pulse'
                      : 'bg-slate-900 hover:bg-slate-800 text-white'
                  }`}
                >
                  <Save className="w-4 h-4" />
                  <span>Save Role Permissions Matrix</span>
                </button>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* SUBTAB 2: STAFF ACCOUNTS */}
      {activeSubTab === 'staff' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {staffUsers.map((user) => {
              const isCurrentActive = settings.currentStaffId === user.id || settings.currentStaffName === user.name;
              const overrideCount = user.customPermissions ? Object.keys(user.customPermissions).length : 0;

              return (
                <div 
                  key={user.id}
                  className={`bg-white p-5 rounded-3xl border transition-all flex flex-col justify-between ${
                    isCurrentActive ? 'border-purple-500 ring-2 ring-purple-100 shadow-md' : 'border-slate-200 shadow-2xs hover:border-slate-300'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-11 h-11 rounded-2xl ${user.avatarColor || 'bg-slate-700'} text-white font-black text-sm flex items-center justify-center shadow-xs`}>
                        {(user.name || 'Staff').slice(0, 2).toUpperCase()}
                      </div>

                      <div className="flex items-center gap-1">
                        {isCurrentActive && (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-800 font-bold text-[10px] rounded-full">
                            Active
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenEditStaffModal(user)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                          title="Edit staff account details"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <h3 className="text-sm font-black text-slate-900">{user.name}</h3>
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border ${getRoleBadgeClass(user.role)}`}>
                        {user.role.replace('_', ' ')}
                      </span>
                      {overrideCount > 0 && (
                        <span className="inline-block px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          {overrideCount} Custom Overrides
                        </span>
                      )}
                    </div>

                    <div className="mt-3 space-y-1.5 text-[11px] text-slate-500 font-mono">
                      <p className="flex items-center gap-1.5 text-slate-700 font-semibold truncate">
                        <span className="text-slate-400 font-normal">@</span>
                        <span>{user.username || user.name.toLowerCase()}</span>
                      </p>
                      <p className="flex items-center gap-1.5 truncate">
                        <Phone className="w-3 h-3 text-slate-400" />
                        {user.phone || 'No phone'}
                      </p>
                      <p className="flex items-center gap-1.5">
                        <KeyRound className="w-3 h-3 text-slate-400" />
                        <span>Security: ••••••••</span>
                      </p>
                      <div className="flex items-center gap-1.5 pt-1 text-[10px]">
                        <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                        {user.role === 'Owner' ? (
                          <span className="text-purple-700 font-semibold">24/7 Access (Owner Exempt)</span>
                        ) : user.restrictWorkingHours ? (
                          <span className="text-amber-700 font-bold">
                            {formatTime12Hour(user.workStartTime || '07:30')} – {formatTime12Hour(user.workEndTime || '19:00')}
                          </span>
                        ) : (
                          <span className="text-slate-500 font-medium">24/7 Access (Unrestricted)</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-bold ${user.active ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {user.active ? '● Active Terminal' : '○ Suspended'}
                      </span>

                      <button
                        type="button"
                        onClick={() => setOverrideUserModal(user)}
                        className="text-[10px] text-purple-600 hover:text-purple-800 font-bold hover:underline cursor-pointer"
                      >
                        Edit Permissions →
                      </button>
                    </div>

                    {!isCurrentActive && (
                      <button
                        type="button"
                        onClick={() => {
                          setSwitchingToUser(user);
                          setEnteredPin('');
                          setPinError(false);
                        }}
                        className="w-full py-1.5 bg-slate-100 hover:bg-purple-50 hover:text-purple-700 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer text-center"
                      >
                        Switch Operator →
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUBTAB 3: PER-USER CUSTOM OVERRIDES */}
      {activeSubTab === 'user_overrides' && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900">Per-User Permission Overrides</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Grant or revoke specific capabilities for individual employees without altering the entire role.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {staffUsers.map((user) => {
                const effective = getEffectiveUserPermissions(user, matrixDraft);
                const custom = user.customPermissions || {};
                const customKeys = Object.keys(custom);

                return (
                  <div 
                    key={user.id} 
                    className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:shadow-xs transition-all space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl ${user.avatarColor || 'bg-slate-700'} text-white font-bold text-xs flex items-center justify-center`}>
                          {(user.name || 'Staff').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-extrabold text-slate-900 text-sm">{user.name}</h4>
                          <span className={`inline-block px-2 py-0.2 rounded text-[10px] font-bold border ${getRoleBadgeClass(user.role)}`}>
                            {user.role.replace('_', ' ')}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setOverrideUserModal(user)}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                      >
                        Customize Access ({customKeys.length})
                      </button>
                    </div>

                    {customKeys.length > 0 ? (
                      <div className="p-3 bg-white rounded-xl border border-amber-200/80 space-y-1.5">
                        <p className="text-[10px] font-bold text-amber-900 uppercase">Active Overrides:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {customKeys.map(k => {
                            const isAllowed = custom[k as keyof RolePermissions];
                            const def = PERMISSION_DEFINITIONS.find(p => p.key === k);
                            return (
                              <span 
                                key={k}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                  isAllowed 
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                                    : 'bg-rose-50 text-rose-800 border-rose-200'
                                }`}
                              >
                                {isAllowed ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                                <span>{def?.label || k}</span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">
                        No custom overrides. Inheriting standard {user.role.replace('_', ' ')} role matrix.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 4: LIVE ACCESS SIMULATOR & AUDIT */}
      {activeSubTab === 'simulator' && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900">Live Access & Security Audit Simulator</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Simulate what any staff member can see and execute under current role and custom override rules.
                </p>
              </div>

              {/* User Selector for simulation */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">Simulate Staff Member:</span>
                <select
                  value={simulatedStaffId}
                  onChange={(e) => setSimulatedStaffId(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:bg-white focus:outline-hidden"
                >
                  {staffUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role}) {u.customPermissions ? '• Has Custom Overrides' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Simulated User Summary Card */}
            {simulatedUser && (
              <div className="p-4 bg-gradient-to-r from-purple-50 via-slate-50 to-indigo-50/50 rounded-2xl border border-purple-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl ${simulatedUser.avatarColor || 'bg-purple-600'} text-white font-black text-base flex items-center justify-center shadow-xs`}>
                    {(simulatedUser.name || 'Staff').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-sm">{simulatedUser.name}</h4>
                    <p className="text-xs text-slate-500 font-mono">
                      Role: <strong className="text-slate-800">{simulatedUser.role.replace('_', ' ')}</strong> • Username: @{simulatedUser.username}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const freshUser = staffUsers.find(u => u.id === simulatedUser.id) || simulatedUser;
                      const hoursCheck = checkStaffWorkingHoursAccess(freshUser);
                      if (!hoursCheck.allowed) {
                        alert(hoursCheck.reason);
                        return;
                      }
                      onSwitchActiveStaff(freshUser);
                      setSaveSuccessMessage(`Switched active operator to ${freshUser.name}`);
                    }}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    Activate As Logged-In User
                  </button>
                </div>
              </div>
            )}

            {/* Functional Access Breakdown Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {PERMISSION_DEFINITIONS.map(def => {
                const isAllowed = Boolean((effectiveSimulatedPerms as any)[def.key]);
                const isOverridden = simulatedUser?.customPermissions?.[def.key] !== undefined;

                return (
                  <div 
                    key={def.key}
                    className={`p-3.5 rounded-2xl border transition-all flex items-start justify-between gap-2 ${
                      isAllowed 
                        ? 'bg-emerald-50/60 border-emerald-200 text-slate-900' 
                        : 'bg-slate-50 border-slate-200 text-slate-400'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className={`text-xs font-bold ${isAllowed ? 'text-slate-900' : 'text-slate-500'}`}>
                          {def.label}
                        </p>
                        {isOverridden && (
                          <span className="px-1.5 py-0.2 rounded text-[8px] font-bold bg-amber-100 text-amber-800">
                            Custom Override
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                        {def.categoryLabel}
                      </p>
                    </div>

                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                      isAllowed 
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                        : 'bg-slate-200 text-slate-500'
                    }`}>
                      {isAllowed ? 'Allowed' : 'Locked'}
                    </span>
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      )}

      {/* MODAL: CUSTOM PERMISSIONS OVERRIDE FOR SPECIFIC USER */}
      {overrideUserModal && (
        <div 
          id="user-override-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-modal-backdrop"
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[90vh] animate-modal-content">
            
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${overrideUserModal.avatarColor || 'bg-purple-600'} text-white font-bold text-sm flex items-center justify-center`}>
                  {(overrideUserModal.name || 'Staff').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Custom Permissions: {overrideUserModal.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Role: <strong className="text-purple-700">{overrideUserModal.role.replace('_', ' ')}</strong> (Default Matrix applies unless explicitly overridden)
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOverrideUserModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable list of permissions with Tri-State Selector */}
            <div className="p-6 overflow-y-auto space-y-3 divide-y divide-slate-100 text-xs">
              
              <div className="pb-2 flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                <span>PERMISSION & CATEGORY</span>
                <span>OVERRIDE STATUS</span>
              </div>

              {PERMISSION_DEFINITIONS.map(def => {
                const customVal = overrideUserModal.customPermissions?.[def.key];
                const baseRoleVal = Boolean(matrixDraft[overrideUserModal.role]?.[def.key]);
                
                const currentState: 'default' | 'allow' | 'deny' = 
                  customVal === undefined ? 'default' : customVal === true ? 'allow' : 'deny';

                return (
                  <div key={def.key} className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900">{def.label}</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-100 text-slate-600">
                          {def.categoryLabel}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{def.desc}</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Base Role Default: <span className={baseRoleVal ? 'text-emerald-700 font-bold' : 'text-slate-500 font-bold'}>
                          {baseRoleVal ? 'Allowed' : 'Restricted'}
                        </span>
                      </p>
                    </div>

                    {/* Tri-state Button Group */}
                    <div className="flex bg-slate-100 p-1 rounded-xl shrink-0 self-start sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleUserOverrideChange(overrideUserModal, def.key, 'default')}
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                          currentState === 'default'
                            ? 'bg-white text-slate-800 shadow-2xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                        title="Inherit from role"
                      >
                        Role Default
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUserOverrideChange(overrideUserModal, def.key, 'allow')}
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                          currentState === 'allow'
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'text-emerald-700 hover:bg-emerald-100/50'
                        }`}
                        title="Force allow for this user"
                      >
                        Force Allow
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUserOverrideChange(overrideUserModal, def.key, 'deny')}
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                          currentState === 'deny'
                            ? 'bg-rose-600 text-white shadow-2xs'
                            : 'text-rose-700 hover:bg-rose-100/50'
                        }`}
                        title="Force deny for this user"
                      >
                        Force Deny
                      </button>
                    </div>
                  </div>
                );
              })}

            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const updated: StaffUser = { ...overrideUserModal, customPermissions: undefined };
                  onSaveStaffUser(updated);
                  setOverrideUserModal(updated);
                }}
                className="text-xs font-bold text-slate-600 hover:text-rose-600 cursor-pointer"
              >
                Clear All User Overrides
              </button>

              <button
                type="button"
                onClick={() => setOverrideUserModal(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Done
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT STAFF USER */}
      {isStaffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-modal-backdrop">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-modal-content">
            
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-base font-black text-slate-900">
                {editingStaff ? 'Edit Staff User' : 'Add New Staff User'}
              </h3>
              <button
                type="button"
                onClick={() => setIsStaffModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStaff} className="p-6 space-y-4 text-xs">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Ko Aung Kyaw"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Login Username *</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-bold">@</span>
                    <input
                      type="text"
                      placeholder="e.g. owner, cashier1"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                      className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold font-mono"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Role *</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
                  >
                    <option value="Owner">Owner</option>
                    <option value="Manager">Manager</option>
                    <option value="Cashier">Cashier</option>
                    <option value="Inventory_Staff">Stock Controller</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Password / PIN *</label>
                  <input
                    type="password"
                    placeholder="e.g. password or PIN"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  placeholder="09-xxxxxxxxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email (Optional)</label>
                <input
                  type="email"
                  placeholder="staff@store.mm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>

              {/* WORKING HOURS RESTRICTION (Owner role is always exempt) */}
              {role === 'Owner' ? (
                <div className="p-3.5 bg-purple-50/80 border border-purple-200 rounded-2xl space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-purple-700 shrink-0" />
                    <span className="font-bold text-purple-950 text-xs">Working Hours Policy</span>
                    <span className="px-2 py-0.2 rounded-full text-[10px] font-black bg-purple-200 text-purple-900 ml-auto">
                      Owner Exempt
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-800 leading-normal">
                    Staff members with the <strong>Owner</strong> role are permanently exempt from login restrictions and possess unrestricted 24/7 terminal access.
                  </p>
                </div>
              ) : (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <Clock className={`w-4 h-4 mt-0.5 shrink-0 ${restrictWorkingHours ? 'text-indigo-600' : 'text-slate-400'}`} />
                      <div>
                        <label htmlFor="staff-restrict-working-hours" className="font-bold text-slate-800 cursor-pointer text-xs block">
                          Restrict Working Hours
                        </label>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Limit terminal login strictly to authorized shift hours.
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        id="staff-restrict-working-hours"
                        checked={restrictWorkingHours}
                        onChange={(e) => setRestrictWorkingHours(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600" />
                    </label>
                  </div>

                  {restrictWorkingHours && (
                    <div className="pt-2.5 border-t border-slate-200 space-y-2.5">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="staff-work-start-time" className="block font-bold text-slate-700 mb-1 text-[11px]">
                            Shift Start Time *
                          </label>
                          <input
                            id="staff-work-start-time"
                            type="time"
                            value={workStartTime}
                            onChange={(e) => setWorkStartTime(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                            required={restrictWorkingHours}
                          />
                          <span className="text-[10px] text-slate-400 mt-0.5 block font-medium">
                            {formatTime12Hour(workStartTime || '07:30')}
                          </span>
                        </div>

                        <div>
                          <label htmlFor="staff-work-end-time" className="block font-bold text-slate-700 mb-1 text-[11px]">
                            Shift End Time *
                          </label>
                          <input
                            id="staff-work-end-time"
                            type="time"
                            value={workEndTime}
                            onChange={(e) => setWorkEndTime(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                            required={restrictWorkingHours}
                          />
                          <span className="text-[10px] text-slate-400 mt-0.5 block font-medium">
                            {formatTime12Hour(workEndTime || '19:00')}
                          </span>
                        </div>
                      </div>

                      <div className="p-2.5 bg-indigo-50/80 border border-indigo-200/80 rounded-xl flex items-center gap-2 text-[11px] text-indigo-900 font-medium">
                        <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span>
                          Allowed login window: <strong>{formatTime12Hour(workStartTime || '07:30')} – {formatTime12Hour(workEndTime || '19:00')}</strong>.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <input
                  type="checkbox"
                  id="activeUser"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
                />
                <label htmlFor="activeUser" className="text-slate-800 font-semibold cursor-pointer">
                  Active Status (Allow terminal login & authorization)
                </label>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                {editingStaff && staffUsers.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete staff account for ${editingStaff.name}?`)) {
                        onDeleteStaffUser(editingStaff.id);
                        setIsStaffModalOpen(false);
                      }
                    }}
                    className="text-rose-600 hover:text-rose-700 font-semibold"
                  >
                    Delete User
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsStaffModalOpen(false)}
                    className="px-4 py-2 text-slate-600 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-xs cursor-pointer"
                  >
                    Save Staff Account
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* MODAL: SWITCH OPERATOR PIN VERIFICATION */}
      {switchingToUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-modal-backdrop">
          <div className="bg-white rounded-3xl shadow-2xl max-w-xs w-full p-6 text-center space-y-4 border border-slate-200 animate-modal-content">
            <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center mx-auto">
              <KeyRound className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">Switch Operator</h3>
              <p className="text-xs text-slate-500 mt-1">
                Enter 4-digit PIN for <strong>{switchingToUser.name}</strong>
              </p>
            </div>

            <form onSubmit={handleVerifySwitchPin} className="space-y-4">
              <div>
                <input
                  type="password"
                  maxLength={4}
                  autoFocus
                  placeholder="••••"
                  value={enteredPin}
                  onChange={(e) => {
                    setEnteredPin(e.target.value);
                    setPinError(false);
                  }}
                  className={`w-full py-2.5 bg-slate-50 border rounded-xl font-mono text-center text-xl tracking-widest font-bold focus:outline-hidden ${
                    pinError ? 'border-rose-500 ring-2 ring-rose-100' : 'border-slate-300 focus:border-purple-500'
                  }`}
                />
                {pinError && (
                  <p className="text-[11px] text-rose-600 font-bold mt-1">Incorrect PIN. Try again.</p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSwitchingToUser(null)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-xs"
                >
                  Unlock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
