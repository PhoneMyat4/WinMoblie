import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Package, X, Plus, Trash2, Check, Barcode, Smartphone, Layers, Sparkles, RefreshCw, Camera, ChevronRight, Calculator, TrendingUp } from 'lucide-react';
import { Product, ProductCategory, DeviceCondition, ShopSettings, ImeiPair } from '../../types';
import { formatImei } from '../../utils/formatters';
import { 
  findExactVariantMatch, 
  findSisterVariants, 
  generateVariantSku, 
  formatVariantSpecsSummary,
  extractNormalizedRam,
  extractNormalizedRom
} from '../../utils/variantUtils';
import { BoxScannerModal } from './BoxScannerModal';
import { PriceFormulaModal } from './PriceFormulaModal';
import { ExtractedBoxSpecs } from '../../utils/boxScannerService';
import { ProductPhotoUploader } from '../common/ProductPhotoUploader';
import { 
  calculateSellingPriceFromFormula, 
  loadFormulaConfig 
} from '../../utils/pricingFormula';
import {
  CANONICAL_CATEGORIES,
  canonicalCategory,
  isPhoneCategory,
  getSubCategoriesForCategory,
  getBrandsForCategory,
  getModelsForBrand,
  getColorsForModel
} from '../../data/categoryTaxonomy';

interface NewProductModalProps {
  settings: ShopSettings;
  editingProduct?: Product | null;
  products?: Product[];
  zIndexClass?: string;
  modalTitle?: string;
  modalSubtitle?: string;
  onClose: () => void;
  onSave: (product: Product) => void;
}

const RAM_PRESETS = ['-', '4GB', '6GB', '8GB', '12GB', '14GB', '16GB', '18GB', '24GB'];
const ROM_PRESETS = ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB'];

/**
 * Strips the brand prefix from a model name or product title so the model input
 * and dropdown remain clean (e.g. "Redmi A7pro" under brand "Redmi" -> "A7pro").
 */
export const extractCleanModelName = (rawNameOrModel: string | undefined, brandName: string | undefined): string => {
  if (!rawNameOrModel || !rawNameOrModel.trim()) return '';
  const trimmed = rawNameOrModel.trim();
  if (!brandName || !brandName.trim()) return trimmed;
  const brandPattern = new RegExp(`^${brandName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i');
  return trimmed.replace(brandPattern, '').trim() || trimmed;
};

export const NewProductModal: React.FC<NewProductModalProps> = ({
  settings,
  editingProduct,
  products = [],
  zIndexClass = 'z-50',
  modalTitle,
  modalSubtitle,
  onClose,
  onSave,
}) => {
  const initialBrand = editingProduct?.brand || '';
  const initialCleanModel = extractCleanModelName(editingProduct?.model || editingProduct?.name, initialBrand);
  const [brand, setBrand] = useState<string>(initialBrand);
  const [model, setModel] = useState<string>(initialCleanModel || editingProduct?.model || '');
  const [name, setName] = useState<string>(initialCleanModel || editingProduct?.name || '');
  const [category, setCategory] = useState<ProductCategory>(
    editingProduct?.category ? canonicalCategory(editingProduct.category) : 'brand_new_phones'
  );
  const [subCategory, setSubCategory] = useState<string>(editingProduct?.subCategory || '');
  const [condition, setCondition] = useState<DeviceCondition>(editingProduct?.condition || 'brand_new');
  const [sku, setSku] = useState<string>(editingProduct?.sku || `SKU-${Date.now().toString().slice(-6)}`);
  const [barcode, setBarcode] = useState<string>(editingProduct?.barcode || `${Math.floor(100000000000 + Math.random() * 900000000000)}`);
  const [ram, setRam] = useState<string>(editingProduct?.ram || '-');
  const [rom, setRom] = useState<string>(editingProduct?.rom || editingProduct?.storage?.split('/')?.pop()?.trim() || '128GB');
  const [color, setColor] = useState<string>(editingProduct?.color || 'Black');
  const [batteryHealth, setBatteryHealth] = useState<number>(editingProduct?.batteryHealth || 100);
  const [costPrice, setCostPrice] = useState<number>(editingProduct?.costPrice || 0);
  const [sellingPrice, setSellingPrice] = useState<number>(editingProduct?.sellingPrice || 0);
  const [stock, setStock] = useState<number>(editingProduct?.stock || 1);
  const [minStockAlert, setMinStockAlert] = useState<number | string>(
    editingProduct?.minStockAlert !== undefined ? editingProduct.minStockAlert : 2
  );
  const [warrantyMonths, setWarrantyMonths] = useState<number>(editingProduct?.warrantyMonths ?? 12);
  const [description, setDescription] = useState<string>(editingProduct?.description || '');
  const [dualImei, setDualImei] = useState<boolean>(editingProduct?.dualImei ?? true);
  const [imageUrl, setImageUrl] = useState<string | undefined>(editingProduct?.imageUrl);

  // Initialize IMEI pairs
  const initialImeiPairs = useMemo<ImeiPair[]>(() => {
    if (editingProduct?.imeiPairs && editingProduct.imeiPairs.length > 0) {
      return editingProduct.imeiPairs;
    }
    if (editingProduct?.imeiList && editingProduct.imeiList.length > 0) {
      return editingProduct.imeiList.map(item => {
        if (item.includes('|')) {
          const parts = item.split('|').map(s => s.trim());
          return { imei1: parts[0], imei2: parts[1] || undefined };
        }
        if (item.includes(',')) {
          const parts = item.split(',').map(s => s.trim());
          return { imei1: parts[0], imei2: parts[1] || undefined };
        }
        return { imei1: item };
      });
    }
    return [];
  }, [editingProduct]);

  const isPhone = isPhoneCategory(category);
  const [imeiPairs, setImeiPairs] = useState<ImeiPair[]>(initialImeiPairs);
  const [newImei1Input, setNewImei1Input] = useState<string>('');
  const [newImei2Input, setNewImei2Input] = useState<string>('');
  const [isBoxScannerOpen, setIsBoxScannerOpen] = useState<boolean>(false);
  const [isFormulaCalculatorOpen, setIsFormulaCalculatorOpen] = useState<boolean>(false);
  const [autoCalcNotice, setAutoCalcNotice] = useState<string | null>(null);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState<boolean>(false);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  const handleQuickCalculateFormula = () => {
    if (costPrice <= 0) {
      setAutoCalcNotice('Please enter a Cost Price first to calculate selling price');
      setTimeout(() => setAutoCalcNotice(null), 3000);
      return;
    }
    const config = loadFormulaConfig();
    const result = calculateSellingPriceFromFormula(costPrice, config, name || model);
    setSellingPrice(result.finalSellingPrice);
    setAutoCalcNotice(`Auto-set price: ${settings.currencySymbol}${result.finalSellingPrice.toLocaleString()} (Profit: +${settings.currencySymbol}${result.profit.toLocaleString()}, ${result.marginPercent}% margin)`);
    setTimeout(() => setAutoCalcNotice(null), 4000);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        modelDropdownRef.current &&
        !modelDropdownRef.current.contains(e.target as Node) &&
        modelInputRef.current &&
        !modelInputRef.current.contains(e.target as Node)
      ) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Apply AI Box Scanner Specs
  const handleApplyBoxSpecs = (specs: ExtractedBoxSpecs) => {
    if (specs.brand) setBrand(specs.brand);
    
    if (specs.model) {
      const trimmedModel = specs.model.trim();
      const effectiveBrand = specs.brand || brand;
      const cleanModel = extractCleanModelName(trimmedModel, effectiveBrand) || trimmedModel;
      setName(cleanModel);
      setModel(cleanModel);
    }
    
    if (specs.color) setColor(specs.color);
    
    if (specs.ram && specs.ram !== '-') {
      const normRam = extractNormalizedRam(specs.ram) || specs.ram;
      setRam(normRam);
    }
    
    if (specs.rom) {
      const normRom = extractNormalizedRom(specs.rom) || specs.rom;
      setRom(normRom);
    }
    
    if (specs.barcode) {
      setBarcode(specs.barcode);
    }
    
    if (specs.imei1) {
      const newPair: ImeiPair = {
        imei1: specs.imei1,
        imei2: specs.imei2 || undefined,
      };
      setImeiPairs((prev) => {
        const exists = prev.some((p) => p.imei1 === specs.imei1);
        if (exists) return prev;
        const updated = [...prev, newPair];
        setStock(updated.length);
        return updated;
      });
    }

    // Auto generate fresh variant SKU
    const freshSku = generateVariantSku(
      specs.brand || brand,
      specs.model || name,
      specs.ram || ram,
      specs.rom || rom,
      specs.color || color
    );
    setSku(freshSku);
  };

  // Available Subcategories strictly for the selected category (Level 2)
  const availableSubCategories = useMemo(() => {
    const subSet = new Set<string>();
    const taxSubs = getSubCategoriesForCategory(category);
    taxSubs.forEach(s => subSet.add(s));

    products.forEach(p => {
      if (canonicalCategory(p.category) === category && p.subCategory && p.subCategory.trim()) {
        subSet.add(p.subCategory.trim());
      }
    });

    return Array.from(subSet).sort((a, b) => a.localeCompare(b));
  }, [category, products]);

  // Available Brands strictly isolated to current category and subcategory
  const availableBrands = useMemo(() => {
    const brandSet = new Set<string>();
    // From taxonomy (guarantees zero data leakage)
    const taxBrands = getBrandsForCategory(category, subCategory);
    taxBrands.forEach(b => brandSet.add(b));
    if (brandSet.size === 0) {
      getBrandsForCategory(category).forEach(b => brandSet.add(b));
    }

    // From products matching this category and optional subcategory
    products.forEach((p) => {
      if (canonicalCategory(p.category) === category) {
        if (!subCategory || !p.subCategory || p.subCategory.toLowerCase() === subCategory.toLowerCase()) {
          if (p.brand && p.brand.trim()) brandSet.add(p.brand.trim());
        }
      }
    });

    return Array.from(brandSet).sort((a, b) => a.localeCompare(b));
  }, [category, subCategory, products]);

  // Available Models strictly isolated to current category, subcategory, and brand
  const availableModels = useMemo(() => {
    const modelSet = new Set<string>();
    // From taxonomy
    const taxModels = getModelsForBrand(category, brand, subCategory);
    taxModels.forEach(m => {
      const clean = extractCleanModelName(m.name, brand);
      if (clean) modelSet.add(clean);
    });
    if (modelSet.size === 0 && brand) {
      getModelsForBrand(category, brand).forEach(m => {
        const clean = extractCleanModelName(m.name, brand);
        if (clean) modelSet.add(clean);
      });
    }

    // From registered products matching this category and brand
    products.forEach((p) => {
      if (canonicalCategory(p.category) === category) {
        if (brand && p.brand && p.brand.toLowerCase() === brand.toLowerCase()) {
          const raw = (p.model && p.model.trim()) || (p.name && p.name.trim()) || '';
          if (raw) {
            const clean = extractCleanModelName(raw, brand);
            if (clean) modelSet.add(clean);
          }
        }
      }
    });

    return Array.from(modelSet).sort((a, b) => a.localeCompare(b));
  }, [category, brand, subCategory, products]);

  // Filtered model suggestions for the current search query
  const filteredModelSuggestions = useMemo(() => {
    if (!name || !name.trim()) {
      return availableModels;
    }
    const q = name.toLowerCase().trim();
    const cleanQ = extractCleanModelName(name, brand).toLowerCase().trim();

    return availableModels.filter(m => {
      const mLower = m.toLowerCase();
      return mLower.includes(q) || (cleanQ && mLower.includes(cleanQ));
    });
  }, [availableModels, name, brand]);

  // Available Colors strictly isolated to current category, brand, and model
  const availableColors = useMemo(() => {
    const colorSet = new Set<string>();
    // From taxonomy
    const taxColors = getColorsForModel(category, brand, model || name);
    taxColors.forEach(c => colorSet.add(c));

    // From products
    products.forEach((p) => {
      if (canonicalCategory(p.category) === category) {
        if (brand && p.brand && p.brand.toLowerCase() === brand.toLowerCase()) {
          const matchModel = (p.model || p.name || '').toLowerCase();
          const target = (model || name || '').toLowerCase();
          if (target && (matchModel.includes(target) || target.includes(matchModel))) {
            if (p.color && p.color.trim()) colorSet.add(p.color.trim());
          }
        }
      }
    });

    return Array.from(colorSet).sort((a, b) => a.localeCompare(b));
  }, [category, brand, model, name, products]);

  // Registered product names filtered strictly by category
  const registeredProductNames = useMemo(() => {
    const nameSet = new Set<string>();
    availableModels.forEach(m => nameSet.add(m));

    products.forEach((p) => {
      if (canonicalCategory(p.category) === category) {
        if (!brand || (p.brand && p.brand.toLowerCase() === brand.toLowerCase())) {
          if (p.name && p.name.trim()) nameSet.add(p.name.trim());
        }
      }
    });
    return Array.from(nameSet).sort((a, b) => a.localeCompare(b));
  }, [availableModels, products, category, brand]);

  // Current Form Specifications for Variant Comparison
  const currentFormSpecs = useMemo(() => {
    const cleanModel = extractCleanModelName(model || name, brand);
    const trimmedBrand = brand.trim();
    const fullProductName = trimmedBrand && !cleanModel.toLowerCase().startsWith(trimmedBrand.toLowerCase())
      ? `${trimmedBrand} ${cleanModel}`
      : (cleanModel || name);

    return {
      name: fullProductName,
      brand,
      category,
      subCategory,
      condition,
      ram: isPhone ? ram : undefined,
      rom: isPhone ? rom : undefined,
      color: isPhone ? color : undefined,
    };
  }, [name, model, brand, category, subCategory, condition, ram, rom, color, isPhone]);

  // Dynamic EXACT Variant Match in catalog
  const matchedExactVariant = useMemo(() => {
    if (editingProduct) return null;
    return findExactVariantMatch(products, currentFormSpecs);
  }, [products, currentFormSpecs, editingProduct]);

  // Other Sister Variants sharing the same model title/brand
  const sisterVariants = useMemo(() => {
    const cleanModel = extractCleanModelName(model || name, brand);
    if (!cleanModel) return [];
    const trimmedBrand = brand.trim();
    const fullProductName = trimmedBrand && !cleanModel.toLowerCase().startsWith(trimmedBrand.toLowerCase())
      ? `${trimmedBrand} ${cleanModel}`
      : (cleanModel || name);

    return findSisterVariants(products, fullProductName, brand, editingProduct?.id);
  }, [products, name, model, brand, editingProduct]);

  // Category Change Handler: resets fields when switching to another category
  const handleCategoryChange = (newCat: ProductCategory) => {
    setCategory(newCat);
    setSubCategory('');
    setBrand('');
    setModel('');
    setName('');
    setColor('');
  };

  // Subcategory Change Handler (create-able and search-able text box)
  const handleSubCategoryChange = (newSub: string) => {
    setSubCategory(newSub);
  };

  // Brand Change Handler (create-able and search-able text box)
  const handleBrandChange = (newBrand: string) => {
    setBrand(newBrand);
    if (newBrand.trim() && name.trim()) {
      const cleaned = extractCleanModelName(name, newBrand);
      if (cleaned !== name) {
        setName(cleaned);
        setModel(cleaned);
      }
    }
  };

  // Handler: Level 4 Model Select
  const handleModelSelect = (selectedModelName: string) => {
    const cleanModel = extractCleanModelName(selectedModelName, brand) || selectedModelName.trim();
    setModel(cleanModel);
    setName(cleanModel);

    // Auto-select or suggest first color variant if available
    const colors = getColorsForModel(category, brand, cleanModel);
    if (colors.length > 0 && (!color || color === 'Black')) {
      setColor(colors[0]);
    }
  };

  // Handle typing product name
  const handleNameChange = (val: string) => {
    let cleanVal = val;
    const trimmed = val.trim();

    // If a brand is already selected, and user types or pastes with brand prefix (e.g. "Redmi A7pro" under Redmi)
    if (brand && trimmed) {
      const brandPrefix = brand.trim().toLowerCase() + ' ';
      if (trimmed.toLowerCase().startsWith(brandPrefix)) {
        cleanVal = trimmed.slice(brandPrefix.length);
      }
    }

    setName(cleanVal);
    setModel(cleanVal);
    if (editingProduct) return;

    if (!trimmed) {
      return;
    }

    // Auto-detect brand from name prefix strictly within available brands for this category
    const detectedBrand = availableBrands.find(
      (b) =>
        trimmed.toLowerCase().startsWith(b.toLowerCase() + ' ') ||
        trimmed.toLowerCase() === b.toLowerCase()
    );
    if (detectedBrand && !brand) {
      setBrand(detectedBrand);
      const remainder = trimmed.slice(detectedBrand.length).trim();
      if (remainder) {
        setName(remainder);
        setModel(remainder);
      }
    } else if (
      category === 'brand_new_phones' || category === 'pre_owned_phones'
    ) {
      if (
        trimmed.toLowerCase().startsWith('iphone') ||
        trimmed.toLowerCase().startsWith('ipad') ||
        trimmed.toLowerCase().startsWith('macbook') ||
        trimmed.toLowerCase().startsWith('airpods')
      ) {
        setBrand('Apple');
      }
    }

    // Check if there is an exact single matching registered product in this category
    const nameMatches = products.filter(
      p => canonicalCategory(p.category) === category && p.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (nameMatches.length === 1 && !brand) {
      const match = nameMatches[0];
      setBrand(match.brand || '');
    }
  };

  // Populate form with an existing registered variant (for restocking or cloning)
  const handleSelectSisterVariant = (v: Product) => {
    const targetBrand = v.brand || '';
    const cleanModel = extractCleanModelName(v.model || v.name, targetBrand) || v.name;
    setName(cleanModel);
    setModel(cleanModel);
    setBrand(targetBrand);
    setCategory(v.category);
    setSubCategory(v.subCategory || '');
    setCondition(v.condition || 'brand_new');
    if (v.ram) setRam(v.ram);
    if (v.rom) setRom(v.rom);
    if (v.color) setColor(v.color);
    if (v.batteryHealth) setBatteryHealth(v.batteryHealth);
    setCostPrice(v.costPrice || 0);
    setSellingPrice(v.sellingPrice || 0);
    setWarrantyMonths(v.warrantyMonths !== undefined ? v.warrantyMonths : 12);
    setMinStockAlert(v.minStockAlert !== undefined ? v.minStockAlert : 2);
    setDescription(v.description || '');
    setSku(v.sku);
    setBarcode(v.barcode);
    setStock(v.stock);
    if (v.imeiPairs && v.imeiPairs.length > 0) {
      setImeiPairs(v.imeiPairs);
    } else {
      setImeiPairs([]);
    }
  };

  const handleClearToNewItem = () => {
    setName('');
    setBrand('');
    setSubCategory('');
    setCostPrice(0);
    setSellingPrice(0);
    setStock(1);
    setImeiPairs([]);
    setNewImei1Input('');
    setNewImei2Input('');
    setDescription('');
    setBatteryHealth(100);
    setSku(`SKU-${Date.now().toString().slice(-6)}`);
    setBarcode(`${Math.floor(100000000000 + Math.random() * 900000000000)}`);
  };

  const handleGenerateFreshVariantSku = () => {
    const fresh = generateVariantSku(brand, name, ram, rom, color);
    setSku(fresh);
    setBarcode(`${Math.floor(100000000000 + Math.random() * 900000000000)}`);
  };

  const handleAddImeiPair = () => {
    const clean1 = newImei1Input.trim().replace(/\s+/g, '');
    const clean2 = newImei2Input.trim() ? newImei2Input.trim().replace(/\s+/g, '') : undefined;

    if (!clean1) return;

    // Check if IMEI 1 already in this form's list
    const isDuplicate = imeiPairs.some(p => p.imei1 === clean1 || (p.imei2 && p.imei2 === clean1));
    if (isDuplicate) {
      alert(`IMEI ${clean1} is already in the list.`);
      return;
    }

    const newPair: ImeiPair = {
      imei1: clean1,
      imei2: dualImei ? clean2 : undefined
    };

    const updated = [...imeiPairs, newPair];
    setImeiPairs(updated);
    setStock(updated.length);
    setNewImei1Input('');
    setNewImei2Input('');
  };

  const handleRemoveImeiPair = (index: number) => {
    const updated = imeiPairs.filter((_, i) => i !== index);
    setImeiPairs(updated);
    setStock(updated.length);
  };

  const handleGenerateRandomImeis = () => {
    const prefix = brand.toLowerCase().includes('apple') ? '35' : '86';
    let digits1 = prefix;
    for (let i = 0; i < 13; i++) {
      digits1 += Math.floor(Math.random() * 10);
    }
    setNewImei1Input(digits1);

    if (dualImei) {
      let digits2 = prefix;
      for (let i = 0; i < 13; i++) {
        digits2 += Math.floor(Math.random() * 10);
      }
      setNewImei2Input(digits2);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || sellingPrice <= 0) {
      alert('Please provide a valid product name and selling price.');
      return;
    }

    const cleanModel = extractCleanModelName(model || name, brand);
    const trimmedBrand = brand.trim();
    const fullProductName = trimmedBrand && !cleanModel.toLowerCase().startsWith(trimmedBrand.toLowerCase())
      ? `${trimmedBrand} ${cleanModel}`
      : (cleanModel || name);

    const formattedStorage = isPhone
      ? (ram && ram !== '-' ? `${ram} / ${rom}` : rom)
      : undefined;

    // Compile flattened IMEI list for search & legacy backward-compatibility
    const flattenedImeis: string[] = [];
    imeiPairs.forEach(p => {
      if (p.imei1) flattenedImeis.push(p.imei1);
      if (p.imei2) flattenedImeis.push(p.imei2);
    });

    const finalMinStockAlert = typeof minStockAlert === 'number'
      ? Math.max(0, minStockAlert)
      : (minStockAlert === '' ? 0 : Math.max(0, parseInt(String(minStockAlert), 10) || 0));

    // 1. If explicit edit mode on an existing product row
    if (editingProduct) {
      const updatedProduct: Product = {
        ...editingProduct,
        name: fullProductName,
        brand: trimmedBrand,
        model: cleanModel || name,
        category,
        subCategory: subCategory.trim() || undefined,
        condition,
        sku,
        barcode,
        costPrice,
        sellingPrice,
        stock: isPhone && imeiPairs.length > 0 ? imeiPairs.length : stock,
        minStockAlert: finalMinStockAlert,
        ram: isPhone ? ram : undefined,
        rom: isPhone ? rom : undefined,
        storage: formattedStorage,
        color: isPhone ? color : undefined,
        batteryHealth: category === 'used_phones' ? batteryHealth : undefined,
        imeiList: isPhone ? flattenedImeis : undefined,
        imeiPairs: isPhone ? imeiPairs : undefined,
        dualImei: isPhone ? dualImei : undefined,
        warrantyMonths,
        description,
        imageUrl,
      };
      onSave(updatedProduct);
      return;
    }

    // 2. If an EXACT variant match already exists in inventory (same brand, title, RAM, ROM, Color, Condition)
    if (matchedExactVariant) {
      const mergedPairs = [...(matchedExactVariant.imeiPairs || [])];
      imeiPairs.forEach(p => {
        if (!mergedPairs.some(ep => ep.imei1 === p.imei1)) {
          mergedPairs.push(p);
        }
      });
      const mergedFlatSet = new Set(matchedExactVariant.imeiList || []);
      flattenedImeis.forEach(im => mergedFlatSet.add(im));

      const updatedVariant: Product = {
        ...matchedExactVariant,
        name: fullProductName,
        brand: trimmedBrand,
        model: cleanModel || name,
        costPrice: costPrice > 0 ? costPrice : matchedExactVariant.costPrice,
        sellingPrice: sellingPrice > 0 ? sellingPrice : matchedExactVariant.sellingPrice,
        stock: isPhone && mergedPairs.length > 0 ? mergedPairs.length : matchedExactVariant.stock + stock,
        minStockAlert: finalMinStockAlert,
        imeiPairs: isPhone ? mergedPairs : undefined,
        imeiList: isPhone ? Array.from(mergedFlatSet) : undefined,
        imageUrl: imageUrl || matchedExactVariant.imageUrl,
        lastRestockedAt: new Date().toISOString(),
      };
      onSave(updatedVariant);
      return;
    }

    // 3. Otherwise, create a DISTINCT new product variant record
    const newVariant: Product = {
      id: `prod-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      name: fullProductName,
      brand: trimmedBrand,
      model: cleanModel || name,
      category,
      subCategory: subCategory.trim() || undefined,
      condition,
      sku: sku || generateVariantSku(trimmedBrand, fullProductName, ram, rom, color),
      barcode: barcode || `${Math.floor(100000000000 + Math.random() * 900000000000)}`,
      costPrice,
      sellingPrice,
      stock: isPhone && imeiPairs.length > 0 ? imeiPairs.length : stock,
      minStockAlert: finalMinStockAlert,
      ram: isPhone ? ram : undefined,
      rom: isPhone ? rom : undefined,
      storage: formattedStorage,
      color: isPhone ? color : undefined,
      batteryHealth: category === 'used_phones' ? batteryHealth : undefined,
      imeiList: isPhone ? flattenedImeis : undefined,
      imeiPairs: isPhone ? imeiPairs : undefined,
      dualImei: isPhone ? dualImei : undefined,
      warrantyMonths,
      description,
      imageUrl,
      lastRestockedAt: new Date().toISOString(),
    };

    onSave(newVariant);
  };

  return (
    <div id="new-product-modal-overlay" className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-modal-backdrop`}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 animate-modal-content">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {modalTitle || (editingProduct ? 'Edit Inventory Item' : 'Add New Inventory Item / Variant')}
              </h2>
              <p className="text-xs text-slate-500">
                {modalSubtitle || 'Track distinct RAM/ROM variants, IMEI serials, and margins'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} autoComplete="off" className="flex-1 overflow-y-auto p-6 space-y-5">
          
          {/* AI Box & IMEI Scanner Action Banner */}
          <div className="p-3.5 bg-gradient-to-r from-indigo-50 via-blue-50 to-slate-50 border border-indigo-200/80 rounded-2xl flex items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-xs shrink-0">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-slate-900">AI Phone Box & IMEI Scanner</h4>
                  <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded">
                    Gemini Vision
                  </span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Take a photo of the retail box sticker to auto-extract Model, Color, RAM, ROM & 15-digit IMEIs.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsBoxScannerOpen(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
            >
              <Camera className="w-4 h-4" />
              <span>Scan Box Photo</span>
            </button>
          </div>

          {/* Product Photo Uploader */}
          <ProductPhotoUploader
            currentImageUrl={imageUrl}
            onImageChange={setImageUrl}
            productName={name || model || 'Product'}
            category={category}
            brand={brand}
          />

          {/* Category, Subcategory & Condition */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Category *
              </label>
              <select
                id="new-product-category-select"
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value as ProductCategory)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {CANONICAL_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">
                  Subcategory
                </label>
                {availableSubCategories.length > 0 && (
                  <span className="text-[10px] text-slate-400 font-medium">({availableSubCategories.length} suggestions)</span>
                )}
              </div>
              <div className="relative">
                <input
                  id="new-product-subcategory-input"
                  type="text"
                  autoComplete="off"
                  list="new-product-subcategory-datalist"
                  placeholder="Type or select subcategory..."
                  value={subCategory}
                  onChange={(e) => handleSubCategoryChange(e.target.value)}
                  className="w-full pl-3 pr-8 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 font-medium bg-white focus:ring-2 focus:ring-indigo-500"
                />
                {subCategory && (
                  <button
                    type="button"
                    onClick={() => handleSubCategoryChange('')}
                    title="Clear Subcategory"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <datalist id="new-product-subcategory-datalist">
                  {availableSubCategories.map((sub) => (
                    <option key={sub} value={sub} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Condition Grade</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as DeviceCondition)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 bg-white cursor-pointer"
              >
                <option value="brand_new">Brand New (Box Pack)</option>
                <option value="used_grade_a_plus">Used - Grade A+ (Like New)</option>
                <option value="used_grade_a">Used - Grade A (Minor Wear)</option>
                <option value="used_grade_b">Used - Grade B (Visible Scratches)</option>
                <option value="used_grade_c">Used - Grade C (Heavy Wear)</option>
              </select>
            </div>
          </div>

          {/* Brand & Product Title / Model */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">
                  Brand *
                </label>
                {availableBrands.length > 0 && (
                  <span className="text-[10px] text-slate-400 font-medium">({availableBrands.length} suggestions)</span>
                )}
              </div>
              <div className="relative">
                <input
                  id="new-product-brand-input"
                  type="text"
                  autoComplete="off"
                  list="new-product-brand-datalist"
                  required
                  placeholder="Type or select brand..."
                  value={brand}
                  onChange={(e) => handleBrandChange(e.target.value)}
                  className="w-full pl-3 pr-8 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
                />
                {brand && (
                  <button
                    type="button"
                    onClick={() => handleBrandChange('')}
                    title="Clear Brand"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <datalist id="new-product-brand-datalist">
                  {availableBrands.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">
                  Product Title / Model *
                </label>
                <span className="text-[10px] text-slate-400 font-medium">
                  {availableModels.length > 0 ? `${availableModels.length} models available` : 'Type or search model'}
                </span>
              </div>
              <div className="relative">
                <input
                  ref={modelInputRef}
                  id="new-product-name-input"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  required
                  placeholder={brand ? `e.g. Model under ${brand}` : 'Type or search product model / title'}
                  value={name}
                  onFocus={() => setIsModelDropdownOpen(true)}
                  onChange={(e) => {
                    handleNameChange(e.target.value);
                    setIsModelDropdownOpen(true);
                  }}
                  className="w-full pl-3 pr-8 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 font-medium bg-white focus:ring-2 focus:ring-indigo-500"
                />
                {name && (
                  <button
                    type="button"
                    onClick={() => {
                      handleNameChange('');
                      setIsModelDropdownOpen(true);
                    }}
                    title="Clear Product Name"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Filtered suggestions matching only selected category and brand */}
                {isModelDropdownOpen && filteredModelSuggestions.length > 0 && (
                  <div
                    ref={modelDropdownRef}
                    className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto z-50 p-1 divide-y divide-slate-100"
                  >
                    <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/80 rounded-md flex items-center justify-between mb-1">
                      <span>{brand ? `${brand} Models` : 'Suggested Models'} ({filteredModelSuggestions.length})</span>
                      <span className="text-[9px] text-slate-400 font-normal">Click to select</span>
                    </div>
                    {filteredModelSuggestions.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleModelSelect(m);
                          setIsModelDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-slate-800 hover:bg-indigo-50 hover:text-indigo-700 flex items-center justify-between transition-colors group cursor-pointer"
                      >
                        <span className="font-semibold text-slate-900 group-hover:text-indigo-700">{m}</span>
                        <span className="text-[10px] text-slate-400 group-hover:text-indigo-500 font-normal">
                          {brand || CANONICAL_CATEGORIES.find(c => c.id === category)?.label}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sister Variants Quick-Selector (If other variants of this model exist in catalog) */}
          {sisterVariants.length > 0 && !editingProduct && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-600" />
                  Existing Catalog Variants for &quot;{name}&quot; ({sisterVariants.length}):
                </span>
                <span className="text-[10px] text-slate-500">Click a variant to view or restock</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {sisterVariants.map((sv) => {
                  const isThisExactVariant = matchedExactVariant?.id === sv.id;
                  return (
                    <button
                      key={sv.id}
                      type="button"
                      onClick={() => handleSelectSisterVariant(sv)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        isThisExactVariant
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-white border border-slate-300 text-slate-700 hover:border-indigo-400 hover:bg-indigo-50/50'
                      }`}
                    >
                      <span>{formatVariantSpecsSummary(sv) || sv.name}</span>
                      <span className={`text-[10px] font-mono px-1 py-0.2 rounded ${
                        isThisExactVariant ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {sv.stock} in stock
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Status Banner: Exact Variant Match VS New Variant */}
          {!editingProduct && (
            <div>
              {matchedExactVariant ? (
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 text-emerald-900 px-3.5 py-2 rounded-xl text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold flex items-center gap-1 text-emerald-700">
                      <Check className="w-4 h-4" /> Synced with Registered Item:
                    </span>
                    <span className="font-semibold">{matchedExactVariant.name}</span>
                    <span className="bg-emerald-100/80 text-emerald-800 font-bold px-1.5 py-0.5 rounded text-[11px]">
                      {formatVariantSpecsSummary(matchedExactVariant)}
                    </span>
                    <span className="text-emerald-700 font-mono text-[11px]">
                      (Cost: {settings.currencySymbol}{matchedExactVariant.costPrice.toLocaleString()}, Sell: {settings.currencySymbol}{matchedExactVariant.sellingPrice.toLocaleString()}, Stock: {matchedExactVariant.stock})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearToNewItem}
                    className="text-[11px] font-bold text-emerald-800 hover:text-rose-600 hover:underline ml-2 cursor-pointer whitespace-nowrap"
                  >
                    Clear to New Item
                  </button>
                </div>
              ) : name.trim() ? (
                <div className="flex items-center justify-between bg-indigo-50/80 border border-indigo-200 text-indigo-900 px-3.5 py-2 rounded-xl text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold flex items-center gap-1 text-indigo-700">
                      <Layers className="w-3.5 h-3.5" /> Distinct Variant Configuration:
                    </span>
                    <span className="text-slate-700 font-medium">
                      Saving will register this as a <strong>new distinct variant</strong> with separate stock, pricing, and serial numbers.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateFreshVariantSku}
                    title="Generate a unique SKU code for this variant"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 hover:text-indigo-900 hover:underline cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" /> New SKU
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* Phone Specific Specs */}
          {isPhone && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-indigo-600" />
                  Phone Variant Specifications
                </h4>
                <span className="text-[10px] text-slate-400">RAM, ROM & Color define unique variant identity</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">RAM Capacity *</label>
                  <select
                    id="new-product-ram-select"
                    value={ram}
                    onChange={(e) => setRam(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 font-bold cursor-pointer focus:ring-2 focus:ring-indigo-500"
                  >
                    {RAM_PRESETS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt === '-' ? '- None / N/A -' : opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">ROM Storage *</label>
                  <select
                    id="new-product-rom-select"
                    value={rom}
                    onChange={(e) => setRom(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 font-bold cursor-pointer focus:ring-2 focus:ring-indigo-500"
                  >
                    {ROM_PRESETS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-600">Color Variant *</label>
                    {availableColors.length > 0 && (
                      <span className="text-[10px] text-slate-400 font-medium">({availableColors.length} colors)</span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      list="new-product-colors-datalist"
                      placeholder="e.g. Natural Titanium"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500"
                    />
                    <datalist id="new-product-colors-datalist">
                      {availableColors.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Battery Health %</label>
                  <input
                    type="number"
                    min="50"
                    max="100"
                    placeholder="100"
                    value={batteryHealth === 0 ? '' : batteryHealth}
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => e.currentTarget.select()}
                    onChange={(e) => setBatteryHealth(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900"
                  />
                </div>
              </div>

              {/* IMEI Serial Numbers Manager (Dual IMEI Support) */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-indigo-600" />
                    <label className="text-xs font-bold text-slate-800">
                      Serialized Phone Stock ({imeiPairs.length} {imeiPairs.length === 1 ? 'Unit' : 'Units'})
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={dualImei}
                        onChange={(e) => setDualImei(e.target.checked)}
                        className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                      />
                      <span>Dual SIM (2 IMEIs per phone)</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateRandomImeis}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold rounded border border-slate-300 cursor-pointer"
                    >
                      Generate Test IMEIs
                    </button>
                  </div>
                </div>

                {/* Input Fields for IMEI 1 & IMEI 2 */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2 mb-2">
                  <div className={`grid gap-2 ${dualImei ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-900 uppercase tracking-wider mb-0.5">
                        IMEI 1 (Primary SIM) *
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={15}
                        placeholder="15-digit numeric IMEI (e.g. 358291048291041)"
                        value={newImei1Input}
                        onChange={(e) => setNewImei1Input(e.target.value.replace(/\D/g, '').slice(0, 15))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (!dualImei || !newImei2Input)) {
                            e.preventDefault();
                            handleAddImeiPair();
                          } else if (!/^[0-9]$/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key) && !e.ctrlKey && !e.metaKey) {
                            e.preventDefault();
                          }
                        }}
                        onPaste={(e) => {
                          e.preventDefault();
                          const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 15);
                          setNewImei1Input(paste);
                        }}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 bg-white focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    {dualImei && (
                      <div>
                        <label className="block text-[10px] font-bold text-purple-900 uppercase tracking-wider mb-0.5">
                          IMEI 2 (Secondary SIM / eSIM)
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={15}
                          placeholder="15-digit numeric IMEI (e.g. 358291048291042)"
                          value={newImei2Input}
                          onChange={(e) => setNewImei2Input(e.target.value.replace(/\D/g, '').slice(0, 15))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddImeiPair();
                            } else if (!/^[0-9]$/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key) && !e.ctrlKey && !e.metaKey) {
                              e.preventDefault();
                            }
                          }}
                          onPaste={(e) => {
                            e.preventDefault();
                            const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 15);
                            setNewImei2Input(paste);
                          }}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 bg-white focus:ring-1 focus:ring-purple-500"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleAddImeiPair}
                      disabled={!newImei1Input.trim()}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Phone Unit to Stock
                    </button>
                  </div>
                </div>

                {/* Paired IMEI List Display */}
                {imeiPairs.length > 0 ? (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 bg-white rounded-xl border border-slate-200">
                    {imeiPairs.map((pair, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between px-3 py-1.5 bg-slate-50 hover:bg-slate-100/80 rounded-lg border border-slate-200/80 text-xs"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-500 text-[11px] w-6">
                            #{idx + 1}
                          </span>
                          <div className="flex items-center gap-2 flex-wrap font-mono">
                            <span className="bg-indigo-50 border border-indigo-200 text-indigo-900 px-2 py-0.5 rounded text-[11px] font-semibold">
                              IMEI 1: {formatImei(pair.imei1)}
                            </span>
                            {pair.imei2 && (
                              <span className="bg-purple-50 border border-purple-200 text-purple-900 px-2 py-0.5 rounded text-[11px] font-semibold">
                                IMEI 2: {formatImei(pair.imei2)}
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveImeiPair(idx)}
                          title="Remove unit"
                          className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-3 px-4 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl text-slate-400 text-xs">
                    No phone IMEIs added yet. Enter IMEI 1 & IMEI 2 above, or auto-generate for testing.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pricing & Stock Numbers */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            {/* Action Toolbar Header around Pricing Div */}
            <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-slate-200">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5 text-indigo-600" />
                  Pricing & Stock
                </span>
                {costPrice > 0 && sellingPrice > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                    sellingPrice >= costPrice
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-100 text-rose-800 border border-rose-200'
                  }`}>
                    <TrendingUp className="w-3 h-3" />
                    {sellingPrice >= costPrice
                      ? `+${settings.currencySymbol}${(sellingPrice - costPrice).toLocaleString()} (${Math.round(((sellingPrice - costPrice) / sellingPrice) * 100)}% margin)`
                      : `Loss: -${settings.currencySymbol}${(costPrice - sellingPrice).toLocaleString()}`}
                  </span>
                )}
              </div>

              {/* Price Calculation Tool Action Buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  id="btn-quick-auto-calc-selling-price"
                  onClick={handleQuickCalculateFormula}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-indigo-50 active:bg-indigo-100 text-indigo-700 hover:text-indigo-900 border border-indigo-200 hover:border-indigo-300 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer"
                  title="Automatically calculate selling price from cost price using the 3-step formula (6% + 20,000 + Surcharge + Rounding)"
                >
                  <Calculator className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Auto-Calculate Price</span>
                </button>

                <button
                  type="button"
                  id="btn-open-price-formula-modal"
                  onClick={() => setIsFormulaCalculatorOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
                  title="Open Formula Price Calculator Tool (Single Calculation, Batch Price List Processor & Rule Settings)"
                >
                  <Calculator className="w-3.5 h-3.5 text-indigo-200" />
                  <span>Price Formula Tool</span>
                </button>
              </div>
            </div>

            {/* Quick Notification Pill */}
            {autoCalcNotice && (
              <div className="px-3 py-2 bg-indigo-50/90 border border-indigo-200 rounded-lg text-xs font-semibold text-indigo-900 flex items-center justify-between animate-fadeIn">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>{autoCalcNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoCalcNotice(null)}
                  className="text-indigo-400 hover:text-indigo-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Inputs Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Cost Price ({settings.currencySymbol})
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  required
                  placeholder="0"
                  value={costPrice === 0 ? '' : costPrice}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => {
                    if (['e', 'E', '+', '-'].includes(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCostPrice(val === '' ? 0 : Math.max(0, parseFloat(val) || 0));
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">Base purchase cost</span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Selling Price ({settings.currencySymbol}) *
                  </label>
                  <button
                    type="button"
                    onClick={handleQuickCalculateFormula}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                    title="Auto-calculate with 3-step formula"
                  >
                    <Calculator className="w-2.5 h-2.5 text-indigo-600" />
                    <span>Auto</span>
                  </button>
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  required
                  placeholder="0"
                  value={sellingPrice === 0 ? '' : sellingPrice}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => {
                    if (['e', 'E', '+', '-'].includes(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSellingPrice(val === '' ? 0 : Math.max(0, parseFloat(val) || 0));
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-black text-emerald-700 bg-white focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Manual or formula-generated
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Quantity in Stock</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  disabled={isPhone && imeiPairs.length > 0}
                  value={isPhone && imeiPairs.length > 0 ? imeiPairs.length : (stock === 0 ? '' : stock)}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.currentTarget.select()}
                  onChange={(e) => setStock(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 bg-white disabled:bg-slate-100"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  {isPhone && imeiPairs.length > 0 ? 'Locked to IMEI count' : 'Available units'}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Low Stock Alert</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={minStockAlert}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.currentTarget.select()}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      setMinStockAlert('');
                    } else {
                      const parsed = parseInt(val, 10);
                      setMinStockAlert(isNaN(parsed) ? 0 : Math.max(0, parsed));
                    }
                  }}
                  onBlur={() => {
                    if (minStockAlert === '' || isNaN(Number(minStockAlert))) {
                      setMinStockAlert(0);
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">0 = alert only when out of stock</span>
              </div>
            </div>
          </div>

          {/* Barcode & Warranty */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Barcode / UPC</label>
              <div className="relative">
                <input
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">SKU / Item Code</label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Warranty Period (Months)</label>
              <input
                type="number"
                placeholder="0"
                value={warrantyMonths === 0 ? '' : warrantyMonths}
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.currentTarget.select()}
                onChange={(e) => setWarrantyMonths(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Product Description / Feature Notes</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. 100W SUPERVOOC charging, OLED display, Includes fast charger in box..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900"
            />
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-xl"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              {editingProduct ? 'Save Changes' : matchedExactVariant ? 'Update / Restock Variant' : 'Save as New Variant'}
            </button>
          </div>

        </form>

        {/* AI Box Scanner Modal */}
        <BoxScannerModal
          isOpen={isBoxScannerOpen}
          onClose={() => setIsBoxScannerOpen(false)}
          onApplySpecs={handleApplyBoxSpecs}
          targetContextName="Inventory Item / Variant"
        />

        {/* Pricing Formula Tool Modal */}
        {isFormulaCalculatorOpen && (
          <PriceFormulaModal
            initialCost={costPrice}
            productName={name || model || 'Product Item'}
            currencySymbol={settings.currencySymbol}
            zIndexClass="z-[90]"
            onClose={() => setIsFormulaCalculatorOpen(false)}
            onApplySellingPrice={(calcPrice, breakdown) => {
              setSellingPrice(calcPrice);
              setIsFormulaCalculatorOpen(false);
              setAutoCalcNotice(
                `Applied formula price: ${settings.currencySymbol}${calcPrice.toLocaleString()}${
                  breakdown ? ` (Profit: +${settings.currencySymbol}${breakdown.profit.toLocaleString()}, ${breakdown.marginPercent}% margin)` : ''
                }`
              );
              setTimeout(() => setAutoCalcNotice(null), 4000);
            }}
          />
        )}

      </div>
    </div>
  );
};
