import React from 'react';
import { 
  X, 
  Printer, 
  Building2, 
  Store, 
  Truck, 
  CheckCircle, 
  AlertTriangle,
  QrCode,
  ShieldCheck,
  FileText
} from 'lucide-react';
import { StockTransfer, ShopSettings } from '../../types';

interface TransferDeliveryNoteModalProps {
  transfer: StockTransfer | null;
  settings: ShopSettings;
  onClose: () => void;
}

export const TransferDeliveryNoteModal: React.FC<TransferDeliveryNoteModalProps> = ({
  transfer,
  settings,
  onClose,
}) => {
  if (!transfer) return null;

  const handlePrint = () => {
    window.print();
  };

  const hasDiscrepancy = transfer.items.some(i => (i.discrepancyQty || 0) > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95">
        
        {/* Top Controls (Hidden during Print) */}
        <div className="p-3 sm:p-4 bg-slate-900 text-white flex items-center justify-between shrink-0 print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-400" />
            <span className="font-bold text-sm">Inter-Branch Transfer Delivery Waybill</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>Print Waybill (A4 / Thermal)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div className="p-6 sm:p-8 overflow-y-auto flex-1 bg-white text-slate-900 print:p-0 print:overflow-visible">
          
          {/* Header */}
          <div className="border-b-2 border-slate-900 pb-5 mb-5 flex items-start justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight uppercase">
                {settings.shopName}
              </h1>
              <p className="text-xs text-slate-600 font-medium mt-0.5">
                Central Supply & Retail Network • Multi-Branch Stock Movement
              </p>
              <p className="text-xs text-slate-500">
                Hotline: {settings.phone || 'N/A'} • {settings.address || ''}
              </p>
            </div>

            <div className="text-right">
              <div className="inline-block bg-slate-900 text-white px-3 py-1 rounded-lg text-xs font-mono font-black mb-1">
                {transfer.transferNumber}
              </div>
              <p className="text-xs text-slate-500">
                Created: {new Date(transfer.createdAt).toLocaleDateString()} {new Date(transfer.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              <span className={`inline-block text-[11px] font-extrabold uppercase px-2 py-0.5 rounded mt-1 ${
                transfer.status === 'received'
                  ? 'bg-emerald-100 text-emerald-900'
                  : transfer.status === 'dispatched'
                  ? 'bg-blue-100 text-blue-900'
                  : 'bg-amber-100 text-amber-900'
              }`}>
                Status: {transfer.status.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Route Info: Origin vs Destination */}
          <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200 mb-6">
            <div className="border-r border-slate-200 pr-3">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                Origin (Dispatching Location)
              </p>
              <p className="font-bold text-sm text-slate-900 mt-1">
                {transfer.fromLocationName}
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                Dispatched By: {transfer.dispatchedBy?.name || 'Authorized Warehouse Dispatcher'}
              </p>
              {transfer.dispatchedAt && (
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Time: {new Date(transfer.dispatchedAt).toLocaleString()}
                </p>
              )}
            </div>

            <div className="pl-3">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                Destination (Receiving Branch)
              </p>
              <p className="font-bold text-sm text-slate-900 mt-1">
                {transfer.toLocationName}
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                Received By: {transfer.receivedBy?.name || 'Pending Physical Arrival'}
              </p>
              {transfer.receivedAt && (
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Time: {new Date(transfer.receivedAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          {/* Items Table */}
          <table className="w-full text-xs text-left mb-6 border border-slate-200 rounded-xl overflow-hidden">
            <thead className="bg-slate-100 uppercase text-[10px] font-black text-slate-600 border-b border-slate-200">
              <tr>
                <th className="p-2.5">#</th>
                <th className="p-2.5">Item Description & Brand</th>
                <th className="p-2.5 text-center">Requested</th>
                <th className="p-2.5 text-center">Dispatched</th>
                <th className="p-2.5 text-center">Received</th>
                <th className="p-2.5 text-center">Discrepancy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {transfer.items.map((item, idx) => {
                const itemDiscrepancy = item.discrepancyQty || Math.max(0, item.dispatchedQty - item.receivedQty);
                return (
                  <tr key={item.productId} className="hover:bg-slate-50">
                    <td className="p-2.5 font-bold text-slate-500">{idx + 1}</td>
                    <td className="p-2.5">
                      <p className="font-black text-slate-900">{item.productName}</p>
                      <p className="text-[10px] text-slate-500">{item.brand} {item.model} • SKU: {item.sku}</p>
                      {item.imeiList && item.imeiList.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {item.imeiList.map(im => (
                            <span key={im} className="font-mono text-[9px] bg-slate-100 border border-slate-300 px-1 py-0.2 rounded text-slate-700">
                              IMEI: {im}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="p-2.5 text-center font-bold">{item.requestedQty}</td>
                    <td className="p-2.5 text-center font-bold text-blue-700">{item.dispatchedQty}</td>
                    <td className="p-2.5 text-center font-black text-emerald-700">{item.receivedQty}</td>
                    <td className="p-2.5 text-center">
                      {itemDiscrepancy > 0 ? (
                        <span className="font-black text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                          -{itemDiscrepancy}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-bold">0</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 font-black border-t-2 border-slate-200">
              <tr>
                <td colSpan={2} className="p-2.5 text-right uppercase text-[10px] text-slate-500">Totals:</td>
                <td className="p-2.5 text-center">{transfer.totalRequestedQty}</td>
                <td className="p-2.5 text-center text-blue-700">{transfer.totalDispatchedQty}</td>
                <td className="p-2.5 text-center text-emerald-700">{transfer.totalReceivedQty}</td>
                <td className="p-2.5 text-center text-rose-600">
                  {Math.max(0, transfer.totalDispatchedQty - transfer.totalReceivedQty)}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Discrepancy Note (if present) */}
          {hasDiscrepancy && (
            <div className="p-3 mb-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs">
              <div className="flex items-center gap-1.5 font-bold mb-1">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Transit Discrepancy & Shrinkage Acknowledgment</span>
              </div>
              <p>{transfer.discrepancyReason || 'Missing items reported upon physical receipt verification. Auto-logged in Damage & Quarantine ledger.'}</p>
            </div>
          )}

          {/* Transfer Notes */}
          {transfer.notes && (
            <div className="p-3 mb-6 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700">
              <span className="font-bold">Instructions / Purpose: </span>
              <span>{transfer.notes}</span>
            </div>
          )}

          {/* Formal Signatures Block */}
          <div className="grid grid-cols-3 gap-6 pt-6 border-t border-slate-200 text-xs text-center">
            <div>
              <p className="text-[10px] uppercase font-black text-slate-400 mb-8">Dispatched By (Sender)</p>
              <div className="border-t border-slate-300 pt-1">
                <p className="font-bold text-slate-800">{transfer.dispatchedBy?.name || '________________'}</p>
                <p className="text-[10px] text-slate-400">Signature & Date</p>
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase font-black text-slate-400 mb-8">Carrier / Driver / Transit</p>
              <div className="border-t border-slate-300 pt-1">
                <p className="font-bold text-slate-800">Authorized Logistics</p>
                <p className="text-[10px] text-slate-400">Courier Signature</p>
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase font-black text-slate-400 mb-8">Received & Inspected By</p>
              <div className="border-t border-slate-300 pt-1">
                <p className="font-bold text-slate-800">{transfer.receivedBy?.name || '________________'}</p>
                <p className="text-[10px] text-slate-400">Receiver Signature & Stamp</p>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center text-[10px] text-slate-400">
            Internal Document • Handshake Verification Generated by MobileShop POS & Inventory System
          </div>

        </div>

        {/* Footer for on-screen modal */}
        <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0 print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Printer className="w-4 h-4" />
            <span>Print Waybill</span>
          </button>
        </div>

      </div>
    </div>
  );
};
